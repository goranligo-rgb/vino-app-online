#!/usr/bin/env python3
"""
VINO GATEWAY - Faza A (samo citanje)

Cita Dixell XR75CX kontrolere preko Modbus RTU (2 grane / 2 USB-RS485 adaptera)
i puni Supabase tablice modula Hladjenje:

  OcitanjeTemperature  - jedno ocitanje po tanku po ciklusu
  TankAlarm            - PREVISOKA_TEMP / GRESKA_SONDE / NEMA_VEZE (otvaranje i zatvaranje)
  TankKomanda          - NE dira se (Faza B)

Ciklus (zadano 120 s):
  1. GET Tank (modbusAdresa != null) preko Supabase REST-a
  2. Grana A i grana B se citaju paralelno (po jedna dretva i jedan serijski port),
     unutar grane tankovi redom (RS485 je dijeljena sabirnica - ne smije paralelno)
  3. POST svih ocitanja odjednom
  4. Usporedba stanja s aktivnim alarmima -> POST novih / PATCH razrijesenih

Vazno o "OFFLINE": kad kontroler ne odgovori NE pise se red u OcitanjeTemperature
(kolona temperatura je NOT NULL, a izmisljena temperatura bi bila laz). Aplikacija
ionako racuna "BEZ VEZE" iz starosti zadnjeg ocitanja (lib/temperatura.ts,
OFFLINE_PRAG_MIN = 15 min), a nakon OFFLINE_CIKLUSA neuspjelih ciklusa gateway
otvori i TankAlarm NEMA_VEZE. Status u ocitanju je zato uvijek "OK" ili "ALARM".

Konfiguracija: ~/gateway/.env (vidi .env.example).
Ovisnosti: pymodbus >= 3.x, pyserial. HTTP ide preko stdlib urllib (bez requestsa).
"""

from __future__ import annotations

import inspect
import json
import logging
import logging.handlers
import os
import random
import signal
import socket
import string
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

try:
    from pymodbus.client import ModbusSerialClient
except ImportError:  # pragma: no cover
    print("GRESKA: pymodbus nije instaliran. Aktiviraj venv: source ~/gateway/venv/bin/activate")
    raise

BAZA_DIR = os.path.dirname(os.path.abspath(__file__))
log = logging.getLogger("gateway")


# ---------------------------------------------------------------- konfiguracija

def ucitaj_env(putanja: str) -> None:
    """Minimalni .env parser (KEY=VALUE, # komentar). Ne gazi vec postavljene varijable."""
    if not os.path.isfile(putanja):
        return
    with open(putanja, "r", encoding="utf-8") as f:
        for redak in f:
            redak = redak.strip()
            if not redak or redak.startswith("#") or "=" not in redak:
                continue
            kljuc, _, vrijednost = redak.partition("=")
            kljuc = kljuc.strip()
            vrijednost = vrijednost.strip().strip('"').strip("'")
            os.environ.setdefault(kljuc, vrijednost)


def env_str(kljuc: str, zadano: str = "") -> str:
    return (os.environ.get(kljuc) or zadano).strip()


def env_int(kljuc: str, zadano: int) -> int:
    tekst = env_str(kljuc)
    if not tekst:
        return zadano
    try:
        return int(tekst, 0)  # "0x0100" i "256" oboje rade
    except ValueError:
        try:
            return int(tekst)  # npr. "08" (int(x, 0) to ne prihvaca)
        except ValueError:
            log.warning("Neispravan %s=%r, koristim %s", kljuc, tekst, zadano)
            return zadano


def env_float(kljuc: str, zadano: float) -> float:
    tekst = env_str(kljuc)
    if not tekst:
        return zadano
    try:
        return float(tekst)
    except ValueError:
        log.warning("Neispravan %s=%r, koristim %s", kljuc, tekst, zadano)
        return zadano


def env_reg(kljuc: str) -> int | None:
    """Adresa registra ili None ako nije konfigurirana (prazno u .env)."""
    tekst = env_str(kljuc)
    if not tekst:
        return None
    try:
        return int(tekst, 0)
    except ValueError:
        try:
            return int(tekst)
        except ValueError:
            log.warning("Neispravna adresa registra %s=%r - ignoriram", kljuc, tekst)
            return None


class Konfig:
    def __init__(self) -> None:
        self.supabase_url = env_str("SUPABASE_URL").rstrip("/")
        self.supabase_key = env_str("SUPABASE_SERVICE_KEY")

        self.port_a = env_str("PORT_A", "/dev/ttyUSB0")
        self.port_b = env_str("PORT_B", "/dev/ttyUSB1")
        self.baudrate = env_int("BAUDRATE", 9600)
        self.parity = (env_str("PARITY", "N") or "N")[0].upper()
        self.bytesize = env_int("BYTESIZE", 8)
        self.stopbits = env_int("STOPBITS", 1)
        self.modbus_timeout = env_float("MODBUS_TIMEOUT", 1.0)
        self.modbus_pokusaja = env_int("MODBUS_POKUSAJA", 2)
        self.pauza_izmedu_tankova = env_float("PAUZA_IZMEDU_TANKOVA", 0.05)

        self.ciklus_sekundi = env_int("CIKLUS_SEKUNDI", 120)
        self.offline_ciklusa = env_int("OFFLINE_CIKLUSA", 3)

        # Funkcijski kod: 3 = read holding registers, 4 = read input registers.
        self.modbus_funkcija = env_int("MODBUS_FUNKCIJA", 3)

        # POTVRDENO testom: 0x0100 = sonda P1, vrijednost /10 (153 -> 15,3 C).
        self.reg_temp = env_int("REG_TEMP", 0x0100)
        self.djelitelj_temp = env_float("DJELITELJ_TEMP", 10.0)

        # NIJE potvrdeno - popuni tek kad discover_registers.py potvrdi adrese.
        # Dok je prazno: zadana temp se uzima iz baze (Tank.zadanaTemp).
        self.reg_setpoint = env_reg("REG_SETPOINT")
        self.djelitelj_setpoint = env_float("DJELITELJ_SETPOINT", 10.0)

        # Registar statusa releja/alarma + brojevi bitova (0 = najnizi bit).
        # Dok je prazno: hladjenjeAktivno = (temperatura > zadana), greska sonde
        # se detektira samo iz nemoguce vrijednosti temperature.
        self.reg_status = env_reg("REG_STATUS")
        self.bit_hladjenje = env_reg("BIT_HLADJENJE")
        self.bit_greska_sonde = env_reg("BIT_GRESKA_SONDE")

        # Van ovog raspona = neispravna sonda (kabel, kratki spoj, P1 na displeju).
        self.temp_min_valjana = env_float("TEMP_MIN_VALJANA", -60.0)
        self.temp_max_valjana = env_float("TEMP_MAX_VALJANA", 150.0)

        self.log_file = os.path.expanduser(env_str("LOG_FILE", os.path.join(BAZA_DIR, "gateway.log")))
        self.log_level = env_str("LOG_LEVEL", "INFO").upper()
        self.log_max_mb = env_int("LOG_MAX_MB", 5)
        self.log_backup = env_int("LOG_BACKUP", 5)

        self.http_timeout = env_float("HTTP_TIMEOUT", 15.0)
        self.http_pokusaja = env_int("HTTP_POKUSAJA", 3)

    def provjeri(self) -> None:
        if not self.supabase_url or not self.supabase_key:
            raise SystemExit("GRESKA: SUPABASE_URL i SUPABASE_SERVICE_KEY moraju biti u .env")
        if self.modbus_funkcija not in (3, 4):
            raise SystemExit("GRESKA: MODBUS_FUNKCIJA mora biti 3 ili 4")

    def port_za_granu(self, grana: str | None, modbus_adresa: int) -> str:
        g = (grana or "").strip().upper()
        if g == "A":
            return self.port_a
        if g == "B":
            return self.port_b
        # Bez grane u bazi: 1-22 = A, ostalo = B (isto kao seed-temperature.ts).
        return self.port_a if modbus_adresa <= 22 else self.port_b


# --------------------------------------------------------------------- logiranje

def postavi_logiranje(k: Konfig) -> None:
    log.setLevel(getattr(logging, k.log_level, logging.INFO))
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(threadName)-10s %(message)s",
                            datefmt="%Y-%m-%d %H:%M:%S")
    try:
        os.makedirs(os.path.dirname(k.log_file) or ".", exist_ok=True)
        h_file = logging.handlers.RotatingFileHandler(
            k.log_file, maxBytes=k.log_max_mb * 1024 * 1024, backupCount=k.log_backup, encoding="utf-8"
        )
        h_file.setFormatter(fmt)
        log.addHandler(h_file)
    except OSError as e:
        print(f"UPOZORENJE: ne mogu pisati u {k.log_file}: {e}")
    h_out = logging.StreamHandler(sys.stdout)  # journalctl -u vino-gateway
    h_out.setFormatter(fmt)
    log.addHandler(h_out)


# ------------------------------------------------------------- id-evi i vrijeme

_cuid_brojac = random.randint(0, 36 ** 4 - 1)
_cuid_lock = threading.Lock()
_ABC = string.digits + string.ascii_lowercase


def _b36(n: int, sirina: int = 0) -> str:
    n = abs(int(n))
    s = ""
    while n:
        n, ost = divmod(n, 36)
        s = _ABC[ost] + s
    s = s or "0"
    return s.rjust(sirina, "0")[-sirina:] if sirina else s


_OTISAK = _b36(abs(hash(socket.gethostname() + str(os.getpid()))), 4)


def cuid() -> str:
    """
    Prisma generira @default(cuid()) u aplikaciji, a NE u bazi - kolona "id" nema
    DB default. Gateway zato mora sam generirati id (isti oblik kao Prisma cuid v1).
    """
    global _cuid_brojac
    with _cuid_lock:
        _cuid_brojac = (_cuid_brojac + 1) % (36 ** 4)
        brojac = _b36(_cuid_brojac, 4)
    nasumicno = "".join(random.choice(_ABC) for _ in range(8))
    return "c" + _b36(int(time.time() * 1000)) + brojac + _OTISAK + nasumicno


def sada_utc_iso() -> str:
    """TIMESTAMP(3) bez vremenske zone; Prisma cita kao UTC pa i mi pisemo UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="milliseconds")


# ------------------------------------------------------------------- Supabase

class Supabase:
    def __init__(self, k: Konfig, bez_upisa: bool = False) -> None:
        self.url = k.supabase_url
        self.key = k.supabase_key
        self.timeout = k.http_timeout
        self.pokusaja = max(1, k.http_pokusaja)
        self.bez_upisa = bez_upisa  # --bez-upisa: cita, ali nista ne pise

    def _zahtjev(self, metoda: str, putanja: str, tijelo: Any = None,
                 prefer: str = "return=minimal") -> Any:
        if self.bez_upisa and metoda != "GET":
            log.info("[BEZ UPISA] %s %s %s", metoda, putanja.split("?")[0],
                     json.dumps(tijelo)[:300] if tijelo is not None else "")
            return None
        url = f"{self.url}/rest/v1/{putanja}"
        podaci = json.dumps(tijelo).encode("utf-8") if tijelo is not None else None
        zadnja_greska: Exception | None = None

        for pokusaj in range(1, self.pokusaja + 1):
            zahtjev = urllib.request.Request(url, data=podaci, method=metoda)
            zahtjev.add_header("apikey", self.key)
            zahtjev.add_header("Authorization", f"Bearer {self.key}")
            zahtjev.add_header("Accept", "application/json")
            if podaci is not None:
                zahtjev.add_header("Content-Type", "application/json")
            if metoda in ("POST", "PATCH"):
                zahtjev.add_header("Prefer", prefer)
            try:
                with urllib.request.urlopen(zahtjev, timeout=self.timeout) as odgovor:
                    sirovo = odgovor.read()
                    if not sirovo:
                        return None
                    return json.loads(sirovo.decode("utf-8"))
            except urllib.error.HTTPError as e:
                detalj = e.read().decode("utf-8", "replace")[:400]
                zadnja_greska = RuntimeError(f"HTTP {e.code} {metoda} {putanja}: {detalj}")
                # 4xx (osim 408/429) je nasa greska - ponavljanje nema smisla.
                if 400 <= e.code < 500 and e.code not in (408, 429):
                    break
            except (urllib.error.URLError, TimeoutError, socket.timeout, json.JSONDecodeError) as e:
                zadnja_greska = e
            if pokusaj < self.pokusaja:
                cekaj = 2 ** pokusaj
                log.warning("Supabase %s %s neuspjelo (%s/%s): %s - ponavljam za %s s",
                            metoda, putanja.split("?")[0], pokusaj, self.pokusaja, zadnja_greska, cekaj)
                time.sleep(cekaj)

        raise RuntimeError(f"Supabase {metoda} {putanja.split('?')[0]} nije uspjelo: {zadnja_greska}")

    def dohvati_tankove(self) -> list[dict]:
        stupci = "id,broj,modbusAdresa,grana,zadanaTemp,alarmMinus,alarmPlus"
        return self._zahtjev(
            "GET",
            f"Tank?select={stupci}&modbusAdresa=not.is.null&order=modbusAdresa.asc",
        ) or []

    def dohvati_aktivne_alarme(self) -> list[dict]:
        return self._zahtjev(
            "GET", "TankAlarm?select=id,tankId,tip,nastaoU&aktivan=is.true"
        ) or []

    def upisi_ocitanja(self, redovi: list[dict]) -> None:
        if redovi:
            self._zahtjev("POST", "OcitanjeTemperature", redovi)

    def otvori_alarm(self, tank_id: str, tip: str, poruka: str) -> None:
        self._zahtjev("POST", "TankAlarm", [{
            "id": cuid(), "tankId": tank_id, "tip": tip,
            "poruka": poruka[:500], "aktivan": True, "nastaoU": sada_utc_iso(),
        }])

    def zatvori_alarm(self, alarm_id: str) -> None:
        self._zahtjev("PATCH", f"TankAlarm?id=eq.{alarm_id}",
                      {"aktivan": False, "razrijesenU": sada_utc_iso()})


# --------------------------------------------------------------------- Modbus

class OfflineGreska(Exception):
    """Kontroler nije odgovorio (timeout, CRC, port ne radi)."""


class SondaGreska(Exception):
    """Kontroler odgovara, ali sonda P1 javlja gresku / nemogucu vrijednost."""


_KW_LOCK = threading.Lock()
_KW_UREDAJA: str | None = None  # pymodbus je mijenjao ime: unit -> slave -> device_id


def _kw_uredaja(fn) -> str | None:
    global _KW_UREDAJA
    with _KW_LOCK:
        if _KW_UREDAJA:
            return _KW_UREDAJA
        try:
            parametri = inspect.signature(fn).parameters
        except (TypeError, ValueError):
            parametri = {}
        for kw in ("device_id", "slave", "unit"):
            if kw in parametri:
                _KW_UREDAJA = kw
                return kw
    return None


def citaj_registre(client, k: Konfig, adresa: int, broj: int, uredaj: int):
    global _KW_UREDAJA
    fn = client.read_holding_registers if k.modbus_funkcija == 3 else client.read_input_registers
    kw = _kw_uredaja(fn)
    if kw:
        return fn(address=adresa, count=broj, **{kw: uredaj})
    # Potpis nije citljiv (npr. **kwargs) - probaj redom pa zapamti sto radi.
    zadnja: Exception | None = None
    for kandidat in ("device_id", "slave", "unit"):
        try:
            odgovor = fn(address=adresa, count=broj, **{kandidat: uredaj})
        except TypeError as e:
            zadnja = e
            continue
        with _KW_LOCK:
            _KW_UREDAJA = kandidat
        return odgovor
    raise RuntimeError(f"Ne mogu pozvati pymodbus citanje: {zadnja}")


def u_predznak(v: int) -> int:
    return v - 65536 if v > 32767 else v


def procitaj_registar(client, k: Konfig, adresa_reg: int, uredaj: int) -> int:
    """Jedan registar s ponavljanjem. Vraca predznacenu vrijednost."""
    zadnja: Exception | str = "nepoznato"
    for pokusaj in range(1, k.modbus_pokusaja + 1):
        try:
            odgovor = citaj_registre(client, k, adresa_reg, 1, uredaj)
            if odgovor is None or (hasattr(odgovor, "isError") and odgovor.isError()):
                zadnja = str(odgovor)
            else:
                registri = getattr(odgovor, "registers", None)
                if registri:
                    return u_predznak(registri[0])
                zadnja = "prazan odgovor"
        except Exception as e:  # pymodbus zna baciti razne iznimke po sloju
            zadnja = e
        if pokusaj < k.modbus_pokusaja:
            time.sleep(0.1)
    raise OfflineGreska(f"reg 0x{adresa_reg:04X} adresa {uredaj}: {zadnja}")


def procitaj_tank(client, k: Konfig, uredaj: int) -> dict:
    """
    Vraca {"temperatura": float, "setpoint": float|None, "hladjenje": bool|None}.
    Baca OfflineGreska / SondaGreska.
    """
    sirovo = procitaj_registar(client, k, k.reg_temp, uredaj)
    if sirovo in (-32768, 32767, -32767):  # tipicne sentinel vrijednosti kod pucanja sonde
        raise SondaGreska(f"sonda P1 javlja {sirovo}")
    temperatura = round(sirovo / k.djelitelj_temp, 1)
    if not (k.temp_min_valjana <= temperatura <= k.temp_max_valjana):
        raise SondaGreska(f"temperatura {temperatura} C izvan valjanog raspona")

    setpoint = None
    if k.reg_setpoint is not None:
        try:
            setpoint = round(procitaj_registar(client, k, k.reg_setpoint, uredaj) / k.djelitelj_setpoint, 1)
        except OfflineGreska as e:
            log.debug("Adresa %s: set point se ne cita (%s)", uredaj, e)

    hladjenje = None
    greska_sonde_bit = False
    if k.reg_status is not None:
        try:
            status = procitaj_registar(client, k, k.reg_status, uredaj) & 0xFFFF
            if k.bit_hladjenje is not None:
                hladjenje = bool(status & (1 << k.bit_hladjenje))
            if k.bit_greska_sonde is not None:
                greska_sonde_bit = bool(status & (1 << k.bit_greska_sonde))
        except OfflineGreska as e:
            log.debug("Adresa %s: status registar se ne cita (%s)", uredaj, e)

    if greska_sonde_bit:
        raise SondaGreska("bit greske sonde u statusnom registru")

    return {"temperatura": temperatura, "setpoint": setpoint, "hladjenje": hladjenje}


def procitaj_granu(port: str, tankovi: list[dict], k: Konfig) -> dict[str, dict]:
    """Jedna dretva = jedan serijski port = jedna RS485 sabirnica (tankovi redom)."""
    rezultat: dict[str, dict] = {}
    if not tankovi:
        return rezultat

    client = ModbusSerialClient(
        port=port,
        baudrate=k.baudrate,
        parity=k.parity,
        bytesize=k.bytesize,
        stopbits=k.stopbits,
        timeout=k.modbus_timeout,
    )
    try:
        spojen = client.connect()
    except Exception as e:
        spojen = False
        log.error("Port %s se ne moze otvoriti: %s", port, e)
    if not spojen:
        log.error("Port %s nedostupan - %s tankova ide u OFFLINE", port, len(tankovi))
        for t in tankovi:
            rezultat[t["id"]] = {"stanje": "OFFLINE", "poruka": f"port {port} nedostupan"}
        return rezultat

    try:
        for t in tankovi:
            uredaj = int(t["modbusAdresa"])
            try:
                ocitanje = procitaj_tank(client, k, uredaj)
                rezultat[t["id"]] = {"stanje": "OK", **ocitanje}
                log.debug("Tank %s (adr %s): %.1f C", t["broj"], uredaj, ocitanje["temperatura"])
            except SondaGreska as e:
                rezultat[t["id"]] = {"stanje": "SONDA", "poruka": str(e)}
                log.warning("Tank %s (adr %s): greska sonde - %s", t["broj"], uredaj, e)
            except OfflineGreska as e:
                rezultat[t["id"]] = {"stanje": "OFFLINE", "poruka": str(e)}
                log.warning("Tank %s (adr %s): nema odgovora - %s", t["broj"], uredaj, e)
            except Exception as e:  # nikad ne rusi ciklus zbog jednog tanka
                rezultat[t["id"]] = {"stanje": "OFFLINE", "poruka": f"neocekivano: {e}"}
                log.exception("Tank %s (adr %s): neocekivana greska", t["broj"], uredaj)
            if k.pauza_izmedu_tankova > 0:
                time.sleep(k.pauza_izmedu_tankova)
    finally:
        try:
            client.close()
        except Exception:
            pass
    return rezultat


# ------------------------------------------------------------ alarmna logika

TIP_TEMP = "PREVISOKA_TEMP"
TIP_SONDA = "GRESKA_SONDE"
TIP_VEZA = "NEMA_VEZE"


def u_broj(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


class Gateway:
    def __init__(self, k: Konfig, bez_upisa: bool = False) -> None:
        self.k = k
        self.db = Supabase(k, bez_upisa=bez_upisa)
        self.neuspjeha: dict[str, int] = {}   # tankId -> uzastopnih neuspjelih ciklusa
        self.tankovi_cache: list[dict] = []
        self.stop = threading.Event()

    # --- jedan ciklus ---------------------------------------------------------

    def ciklus(self) -> None:
        try:
            tankovi = self.db.dohvati_tankove()
            self.tankovi_cache = tankovi
        except Exception as e:
            if not self.tankovi_cache:
                log.error("Ne mogu dohvatiti tankove i nemam zapamcen popis: %s", e)
                return
            tankovi = self.tankovi_cache
            log.warning("Ne mogu dohvatiti tankove (%s) - koristim zadnji poznati popis (%s)", e, len(tankovi))

        po_portu: dict[str, list[dict]] = {}
        for t in tankovi:
            adresa = t.get("modbusAdresa")
            if adresa is None:
                continue
            port = self.k.port_za_granu(t.get("grana"), int(adresa))
            po_portu.setdefault(port, []).append(t)

        if not po_portu:
            log.warning("Nijedan tank nema modbusAdresu - nema sto citati")
            return

        rezultati: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=len(po_portu), thread_name_prefix="grana") as izvrsitelj:
            poslovi = {port: izvrsitelj.submit(procitaj_granu, port, lst, self.k)
                       for port, lst in po_portu.items()}
            for port, posao in poslovi.items():
                try:
                    rezultati.update(posao.result())
                except Exception:
                    log.exception("Grana %s je pukla u cijelosti", port)
                    for t in po_portu[port]:
                        rezultati[t["id"]] = {"stanje": "OFFLINE", "poruka": "greska grane"}

        self.obradi(tankovi, rezultati)

    # --- upis ocitanja + alarmi ----------------------------------------------

    def obradi(self, tankovi: list[dict], rezultati: dict[str, dict]) -> None:
        mjereno = sada_utc_iso()
        redovi: list[dict] = []
        # tankId -> {tip: poruka} zeljenih alarma, i skup tipova koje ovaj ciklus ne dira
        zeljeni: dict[str, dict[str, str]] = {}
        ne_diraj: dict[str, set[str]] = {}
        broj_ok = broj_alarm = broj_offline = broj_sonda = 0

        for t in tankovi:
            tid = t["id"]
            broj = t.get("broj")
            r = rezultati.get(tid)
            if r is None:
                continue
            zeljeni[tid] = {}
            ne_diraj[tid] = set()

            zadana_db = u_broj(t.get("zadanaTemp"))
            minus = u_broj(t.get("alarmMinus"))
            plus = u_broj(t.get("alarmPlus"))
            minus = 2.0 if minus is None else minus
            plus = 2.0 if plus is None else plus

            if r["stanje"] == "OFFLINE":
                broj_offline += 1
                self.neuspjeha[tid] = self.neuspjeha.get(tid, 0) + 1
                # Bez podataka ne znamo nista o temperaturi/sondi - ti alarmi ostaju kakvi jesu.
                ne_diraj[tid].update({TIP_TEMP, TIP_SONDA})
                if self.neuspjeha[tid] >= self.k.offline_ciklusa:
                    zeljeni[tid][TIP_VEZA] = (
                        f"Kontroler tanka {broj} ne odgovara "
                        f"({self.neuspjeha[tid]} ciklusa zaredom). {r.get('poruka', '')}".strip()
                    )
                else:
                    ne_diraj[tid].add(TIP_VEZA)  # jos u toleranciji, ne zatvaraj postojeci
                continue

            # Kontroler je odgovorio -> veza radi.
            self.neuspjeha[tid] = 0

            if r["stanje"] == "SONDA":
                broj_sonda += 1
                zeljeni[tid][TIP_SONDA] = f"Greska sonde na tanku {broj}: {r.get('poruka', '')}".strip()
                ne_diraj[tid].add(TIP_TEMP)  # temperatura nije poznata
                continue

            temperatura = r["temperatura"]
            zadana = r.get("setpoint")
            if zadana is None:
                zadana = zadana_db
            if zadana is None:
                log.warning("Tank %s nema zadanaTemp (ni u bazi ni iz registra) - ocitanje se preskace", broj)
                ne_diraj[tid].update({TIP_TEMP, TIP_SONDA})
                continue

            hladjenje = r.get("hladjenje")
            if hladjenje is None:
                hladjenje = temperatura > zadana  # bez statusnog registra: procjena

            donja, gornja = zadana - minus, zadana + plus
            izvan = temperatura > gornja or temperatura < donja
            if izvan:
                broj_alarm += 1
                smjer = "iznad" if temperatura > gornja else "ispod"
                zeljeni[tid][TIP_TEMP] = (
                    f"Tank {broj}: {temperatura:.1f} C je {smjer} dozvoljenog "
                    f"({donja:.1f} - {gornja:.1f} C, zadana {zadana:.1f} C)."
                )
            else:
                broj_ok += 1

            redovi.append({
                "id": cuid(),
                "tankId": tid,
                "temperatura": temperatura,
                "zadanaTemperatura": zadana,
                "hladjenjeAktivno": bool(hladjenje),
                "status": "ALARM" if izvan else "OK",
                "mjerenoU": mjereno,
            })

        try:
            self.db.upisi_ocitanja(redovi)
            log.info("Ciklus: %s ocitanja upisano (OK %s, ALARM %s, sonda %s, bez veze %s)",
                     len(redovi), broj_ok, broj_alarm, broj_sonda, broj_offline)
        except Exception as e:
            log.error("Upis ocitanja nije uspio: %s", e)

        try:
            self.sinkroniziraj_alarme(zeljeni, ne_diraj)
        except Exception as e:
            log.error("Sinkronizacija alarma nije uspjela: %s", e)

    def sinkroniziraj_alarme(self, zeljeni: dict[str, dict[str, str]],
                             ne_diraj: dict[str, set[str]]) -> None:
        aktivni = self.db.dohvati_aktivne_alarme()
        po_tanku: dict[str, dict[str, list[dict]]] = {}
        for a in aktivni:
            po_tanku.setdefault(a["tankId"], {}).setdefault(a["tip"], []).append(a)

        otvoreno = zatvoreno = 0
        for tid, zeljeni_tipovi in zeljeni.items():
            postojeci = po_tanku.get(tid, {})
            for tip in (TIP_TEMP, TIP_SONDA, TIP_VEZA):
                if tip in ne_diraj.get(tid, set()):
                    continue
                ima_aktivan = bool(postojeci.get(tip))
                treba = tip in zeljeni_tipovi
                if treba and not ima_aktivan:
                    self.db.otvori_alarm(tid, tip, zeljeni_tipovi[tip])
                    otvoreno += 1
                    log.info("ALARM OTVOREN %s: %s", tip, zeljeni_tipovi[tip])
                elif not treba and ima_aktivan:
                    for a in postojeci[tip]:
                        self.db.zatvori_alarm(a["id"])
                        zatvoreno += 1
                        log.info("ALARM ZATVOREN %s (tank %s, id %s)", tip, tid, a["id"])
        if otvoreno or zatvoreno:
            log.info("Alarmi: otvoreno %s, zatvoreno %s", otvoreno, zatvoreno)

    # --- glavna petlja --------------------------------------------------------

    def pokreni(self) -> None:
        log.info("=" * 70)
        log.info("VINO GATEWAY start | ciklus %s s | portovi A=%s B=%s | %s baud %s%s%s | FC%s",
                 self.k.ciklus_sekundi, self.k.port_a, self.k.port_b, self.k.baudrate,
                 self.k.bytesize, self.k.parity, self.k.stopbits, self.k.modbus_funkcija)
        log.info("Registri: temp=0x%04X, setpoint=%s, status=%s",
                 self.k.reg_temp,
                 f"0x{self.k.reg_setpoint:04X}" if self.k.reg_setpoint is not None else "iz baze (Tank.zadanaTemp)",
                 f"0x{self.k.reg_status:04X}" if self.k.reg_status is not None else "nema (hladjenje se procjenjuje)")
        log.info("Komande (TankKomanda) se NE izvrsavaju - to je Faza B.")

        while not self.stop.is_set():
            pocetak = time.monotonic()
            try:
                self.ciklus()
            except Exception:
                log.exception("Ciklus je pukao - nastavljam sa sljedecim")
            trajanje = time.monotonic() - pocetak
            preostalo = self.k.ciklus_sekundi - trajanje
            if preostalo <= 0:
                log.warning("Ciklus trajao %.1f s (duze od %s s) - krecem odmah u sljedeci",
                            trajanje, self.k.ciklus_sekundi)
                continue
            log.debug("Ciklus gotov za %.1f s, spavam %.1f s", trajanje, preostalo)
            self.stop.wait(preostalo)
        log.info("VINO GATEWAY zaustavljen.")


def main() -> None:
    jednom = "--jednom" in sys.argv          # odradi jedan ciklus pa izadi
    bez_upisa = "--bez-upisa" in sys.argv    # nista ne pisi u bazu (prvi test)

    ucitaj_env(os.path.join(BAZA_DIR, ".env"))
    k = Konfig()
    postavi_logiranje(k)
    k.provjeri()

    gw = Gateway(k, bez_upisa=bez_upisa)

    if jednom:
        log.info("JEDAN CIKLUS%s", " (BEZ UPISA)" if bez_upisa else "")
        gw.ciklus()
        return

    def ugasi(signum, _frame):
        log.info("Primljen signal %s - zaustavljam nakon ovog ciklusa.", signum)
        gw.stop.set()

    signal.signal(signal.SIGTERM, ugasi)
    signal.signal(signal.SIGINT, ugasi)
    gw.pokreni()


if __name__ == "__main__":
    main()
