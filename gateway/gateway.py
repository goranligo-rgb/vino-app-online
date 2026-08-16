#!/usr/bin/env python3
"""
VINO GATEWAY - Faza A (citanje) + Faza B (izvrsavanje komandi)

Cita Dixell XR75CX kontrolere preko Modbus RTU (2 grane / 2 USB-RS485 adaptera)
i puni Supabase tablice modula Hladjenje:

  OcitanjeTemperature  - jedno ocitanje po tanku po ciklusu
  TankAlarm            - PREVISOKA_TEMP / GRESKA_SONDE / NEMA_VEZE (otvaranje i zatvaranje)
  TankKomanda          - komande NA_CEKANJU se izvrsavaju (vidi "Komande" nize)

Ciklus (zadano 120 s):
  1. GET Tank (modbusAdresa != null AND nadzorHladjenja) + GET TankKomanda
     (status = NA_CEKANJU). Tank bez kontrolera hladjenja (41-44) ima
     nadzorHladjenja = false i gateway ga uopce ne proziva.
  2. Grana A (tankovi 1-20) i grana B (21-44) se obraduju paralelno (po jedna
     dretva i jedan serijski port; koji port je koja grana kaze PORT_A/PORT_B),
     unutar grane tankovi redom (RS485 je dijeljena sabirnica - ne smije paralelno);
     prvo se procitaju svi tankovi grane, zatim se izvrse komande za tu granu
  3. POST svih ocitanja odjednom
  4. Usporedba stanja s aktivnim alarmima -> POST novih / PATCH razrijesenih
  5. PATCH ishoda komandi (PRIMIJENJENO / NEUSPJELO / napomena)

Komande (Faza B):
  - Izvrsavaju se HLADJENJE_ON, HLADJENJE_OFF, ZADANA_TEMP i HY.
  - ALARM_MINUS i ALARM_PLUS se NE diraju: to su pragovi aplikacije, ne parametri
    kontrolera. Ostaju NA_CEKANJU i gateway ih preskace bez traga.
  - Adrese registara (REG_SETPOINT, REG_HY) dolaze iz .env. Dok je registar za neki
    tip prazan, komanda tog tipa OSTAJE NA_CEKANJU i dobije napomenu
    "ceka discovery" - nista se ne pise po kontroleru napamet.
  - Hy (0x0408) je PAKIRAN U GORNJI BAJT: registar = round(Hy * 10) << 8
    (Hy 2,0 -> 5120, 1,5 -> 3840, 0,5 -> 1280). Pomak je HY_POMAK_BITOVA (8).
  - ON/OFF hladjenja ide "meko", preko set pointa - kontroler NEMA izlozen Modbus
    registar za ukljucivanje (vidi "Zabranjeni registri" nize):
      HLADJENJE_OFF -> gateway upise SEt = SOFT_OFF_TEMP (.env, zadano 20,0 C)
      HLADJENJE_ON  -> gateway upise SEt = Tank.zadanaTemp
    Pamcenje stare vrijednosti radi APLIKACIJA, u istoj transakciji u kojoj nastaje
    komanda: OFF sprema staru zadanu u Tank.zadnjaZadanaTemp i postavlja
    Tank.zadanaTemp na 20,0 C, ON vraca zapamceno natrag. Gateway je time obican
    izvrsitelj - ponovni pokusaj upisa ne moze pokvariti zapamcenu vrijednost.
    Tank sa zadanaTemp = SOFT_OFF_TEMP aplikacija prikazuje kao "hladjenje
    iskljuceno", a gateway za njega NE otvara alarm PREVISOKA_TEMP.

  - Sigurnosna ograda: komanda starija od KOMANDA_MAX_MINUTA (30) se NE izvrsava
    nego ide u NEUSPJELO. Zaboravljena komanda ne smije opaliti sat vremena
    kasnije - ni onda kad se registri konfiguriraju naknadno.
  - Nakon upisa se stanje cita natrag s kontrolera kao potvrda:
    slaze se -> PRIMIJENJENO + primijenjenoU, ne slaze se ili nema odgovora ->
    novi pokusaj sljedeci ciklus, najvise KOMANDA_MAX_POKUSAJA (3) puta, pa NEUSPJELO.
  - KOMANDE_OMOGUCENE=false u .env potpuno gasi izvrsavanje (kill switch).

Zabranjeni registri:
  0x0420 je MODBUS ADRESA SAMOG KONTROLERA. Upis u njega kod discoveryja je
  prepisao adrese vise kontrolera odjednom i srusio cijelu granu (svi uredaji
  zavrse na istoj adresi i vise se ne razlikuju - popravlja se rucno, na svakom
  kontroleru posebno). Zato se registri s popisa REGISTRI_ZABRANJENI NE diraju
  ni za citanje ni za upis: procitaj_registar() i upisi_registar() takvu adresu
  odbijaju bez ijednog poslanog okvira, a Konfig.provjeri() ne da ni pokrenuti
  servis ako je takva adresa zavrsila u REG_TEMP/REG_SETPOINT/REG_HY/REG_STATUS.

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
from datetime import datetime, timedelta, timezone
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


def env_bool(kljuc: str, zadano: bool) -> bool:
    tekst = env_str(kljuc).lower()
    if not tekst:
        return zadano
    if tekst in ("1", "true", "da", "yes", "on"):
        return True
    if tekst in ("0", "false", "ne", "no", "off"):
        return False
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


def env_reg_popis(kljuc: str, zadano: str) -> set[int]:
    """
    Popis adresa registara odvojen zarezom -> skup brojeva.

    Prazna vrijednost u .env NE prazni popis nego vraca zadani: ovo je sigurnosna
    lista (registri koji rusi kontroler) i ne smije se izgubiti zabunom.
    """
    tekst = env_str(kljuc) or zadano
    adrese: set[int] = set()
    for dio in tekst.replace(";", ",").split(","):
        dio = dio.strip()
        if not dio:
            continue
        try:
            adrese.add(int(dio, 0))
        except ValueError:
            log.warning("Neispravna adresa u %s: %r - ignoriram", kljuc, dio)
    return adrese


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

        # POTVRDENO discoveryjem 16.08.2026. (test tank 2): 0x042D = set point (SEt),
        # djelitelj 10 - upis 100 i 105 pratio je displej kontrolera. Isti registar
        # sluzi za citanje i za upis. Dok je prazno: zadana temp se uzima iz baze
        # (Tank.zadanaTemp), a komande ZADANA_TEMP ostaju NA_CEKANJU.
        self.reg_setpoint = env_reg("REG_SETPOINT")
        self.djelitelj_setpoint = env_float("DJELITELJ_SETPOINT", 10.0)

        # --- Komande (Faza B) ---
        # Kill switch: false = gateway samo cita, komande se ni ne dohvacaju.
        self.komande_omogucene = env_bool("KOMANDE_OMOGUCENE", True)

        # Diferencijal hladjenja (Hy). POTVRDENO: 0x0408, ali vrijednost je PAKIRANA
        # U GORNJI BAJT registra: registar = round(Hy * DJELITELJ_HY) << HY_POMAK_BITOVA.
        # Izmjereno na kontroleru: Hy 2,0 -> 5120, 1,5 -> 3840, 0,5 -> 1280.
        # Citanje ide obrnuto: (registar >> HY_POMAK_BITOVA) / DJELITELJ_HY.
        self.reg_hy = env_reg("REG_HY")
        self.djelitelj_hy = env_float("DJELITELJ_HY", 10.0)
        self.hy_pomak_bitova = env_int("HY_POMAK_BITOVA", 8)

        # ON/OFF hladjenja: kontroler NEMA izlozen Modbus registar za ukljucivanje,
        # pa se gasi "meko" - set point se digne na SOFT_OFF_TEMP, a stara zadana
        # temperatura se zapamti u Tank.zadnjaZadanaTemp i vrati kod ukljucivanja.
        self.soft_off_temp = env_float("SOFT_OFF_TEMP", 20.0)

        # Registri koji se NIKAD ne diraju - ni citanje, ni upis. 0x0420 je Modbus
        # adresa samog kontrolera; upis u njega je kod discoveryja prepisao adrese
        # vise uredaja i srusio granu. Zastita je ovdje, a ne samo u glavi onoga
        # tko uredjuje .env.
        self.registri_zabranjeni = env_reg_popis("REGISTRI_ZABRANJENI", "0x0420")

        # Sigurnosna ograda i ponavljanje.
        self.komanda_max_minuta = env_int("KOMANDA_MAX_MINUTA", 30)
        self.komanda_max_pokusaja = env_int("KOMANDA_MAX_POKUSAJA", 3)
        self.modbus_funkcija_pisanje = env_int("MODBUS_FUNKCIJA_PISANJE", 6)

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
        if self.modbus_funkcija_pisanje not in (6, 16):
            raise SystemExit("GRESKA: MODBUS_FUNKCIJA_PISANJE mora biti 6 ili 16")
        if self.komanda_max_minuta <= 0:
            raise SystemExit("GRESKA: KOMANDA_MAX_MINUTA mora biti veci od 0")
        if self.komanda_max_pokusaja <= 0:
            raise SystemExit("GRESKA: KOMANDA_MAX_POKUSAJA mora biti veci od 0")
        if not (0 <= self.hy_pomak_bitova <= 15):
            raise SystemExit("GRESKA: HY_POMAK_BITOVA mora biti izmedu 0 i 15")
        if not (self.temp_min_valjana <= self.soft_off_temp <= self.temp_max_valjana):
            raise SystemExit("GRESKA: SOFT_OFF_TEMP je izvan valjanog raspona temperatura")
        for ime, reg in (("REG_TEMP", self.reg_temp), ("REG_SETPOINT", self.reg_setpoint),
                         ("REG_HY", self.reg_hy), ("REG_STATUS", self.reg_status)):
            if reg is not None and reg in self.registri_zabranjeni:
                raise SystemExit(
                    f"GRESKA: {ime}=0x{reg:04X} je na popisu REGISTRI_ZABRANJENI - provjeri .env"
                )

    def port_za_granu(self, grana: str | None, modbus_adresa: int) -> str:
        g = (grana or "").strip().upper()
        if g == "A":
            return self.port_a
        if g == "B":
            return self.port_b
        # Bez grane u bazi: 1-20 = A, 21-44 = B (fizicka podjela u podrumu).
        return self.port_a if modbus_adresa <= 20 else self.port_b


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


def parsiraj_vrijeme(tekst: Any) -> datetime | None:
    """
    Vrijeme iz PostgREST-a u aware UTC datetime.

    Kolona je TIMESTAMP(3) bez zone i u nju se pise UTC, pa se vrijednost bez
    oznake zone tumaci kao UTC. Vraca None ako se ne da procitati - pozivatelj
    tada mora biti oprezan (tretira komandu kao prestaru).
    """
    if not isinstance(tekst, str) or not tekst:
        return None
    t = tekst.strip().replace("Z", "+00:00")
    try:
        d = datetime.fromisoformat(t)
    except ValueError:
        return None
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)


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
        """
        Tankovi koje gateway proziva: moraju imati modbusAdresu I nadzorHladjenja.
        Tank bez kontrolera (41-44) ima nadzorHladjenja = false pa se preskace,
        a adresa mu ostaje zapisana za dan kad kontroler dobije.
        """
        stupci = "id,broj,modbusAdresa,grana,zadanaTemp,alarmMinus,alarmPlus"
        return self._zahtjev(
            "GET",
            f"Tank?select={stupci}&modbusAdresa=not.is.null&nadzorHladjenja=is.true"
            f"&order=modbusAdresa.asc",
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

    # --- komande (Faza B) ---

    def dohvati_komande(self) -> list[dict]:
        """Sve komande koje cekaju izvrsenje, najstarija prva."""
        stupci = "id,tankId,tip,vrijednost,trazenoU,greska"
        return self._zahtjev(
            "GET",
            f"TankKomanda?select={stupci}&status=eq.NA_CEKANJU&order=trazenoU.asc",
        ) or []

    def komanda_primijenjena(self, komanda_id: str) -> None:
        self._zahtjev("PATCH", f"TankKomanda?id=eq.{komanda_id}", {
            "status": "PRIMIJENJENO",
            "primijenjenoU": sada_utc_iso(),
            "greska": None,
        })

    def komanda_neuspjela(self, komanda_id: str, greska: str) -> None:
        self._zahtjev("PATCH", f"TankKomanda?id=eq.{komanda_id}", {
            "status": "NEUSPJELO",
            "greska": greska[:500],
        })

    def komanda_napomena(self, komanda_id: str, napomena: str) -> None:
        """Komanda ostaje NA_CEKANJU, samo dobiva objasnjenje zasto jos ceka."""
        self._zahtjev("PATCH", f"TankKomanda?id=eq.{komanda_id}",
                      {"greska": napomena[:500]})


# --------------------------------------------------------------------- Modbus

class OfflineGreska(Exception):
    """Kontroler nije odgovorio (timeout, CRC, port ne radi)."""


class SondaGreska(Exception):
    """Kontroler odgovara, ali sonda P1 javlja gresku / nemogucu vrijednost."""


class ZabranjenRegistar(Exception):
    """
    Dodir (citanje ili upis) registra s popisa REGISTRI_ZABRANJENI - npr. 0x0420,
    koji je Modbus adresa samog kontrolera. Nikad se ne ponavlja: komanda odmah pada.
    """


_KW_LOCK = threading.Lock()
# pymodbus je kroz verzije mijenjao ime argumenta: unit -> slave -> device_id.
# Pamti se po funkciji (citanje i pisanje su odvojene) da pogodak kod citanja ne
# bude krivo pripisan pisanju i obrnuto.
_KW_UREDAJA: dict[str, str] = {}


def _ime_fn(fn) -> str:
    return getattr(fn, "__name__", str(fn))


def _kw_uredaja(fn) -> str | None:
    ime = _ime_fn(fn)
    with _KW_LOCK:
        if ime in _KW_UREDAJA:
            return _KW_UREDAJA[ime]
        try:
            parametri = inspect.signature(fn).parameters
        except (TypeError, ValueError):
            parametri = {}
        for kw in ("device_id", "slave", "unit"):
            if kw in parametri:
                _KW_UREDAJA[ime] = kw
                return kw
    return None


def _zapamti_kw(fn, kw: str) -> None:
    with _KW_LOCK:
        _KW_UREDAJA[_ime_fn(fn)] = kw


def citaj_registre(client, k: Konfig, adresa: int, broj: int, uredaj: int):
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
        _zapamti_kw(fn, kandidat)
        return odgovor
    raise RuntimeError(f"Ne mogu pozvati pymodbus citanje: {zadnja}")


def upisi_registar(client, k: Konfig, adresa_reg: int, vrijednost: int, uredaj: int) -> None:
    """
    Upis jednog registra (FC6, po potrebi FC16) s ponavljanjem.
    Baca OfflineGreska ako kontroler ne potvrdi upis, ZabranjenRegistar ako je
    adresa na popisu koji se ne smije dirati (0x0420 = adresa kontrolera).
    """
    if adresa_reg in k.registri_zabranjeni:
        raise ZabranjenRegistar(
            f"registar 0x{adresa_reg:04X} je na popisu REGISTRI_ZABRANJENI - upis odbijen"
        )

    sirovo = int(vrijednost) & 0xFFFF  # dvojni komplement za negativne temperature

    if k.modbus_funkcija_pisanje == 16:
        fn = client.write_registers
        argumenti: dict = {"address": adresa_reg, "values": [sirovo]}
    else:
        fn = client.write_register
        argumenti = {"address": adresa_reg, "value": sirovo}

    kw = _kw_uredaja(fn)
    zadnja: Exception | str = "nepoznato"

    for pokusaj in range(1, k.modbus_pokusaja + 1):
        try:
            if kw:
                odgovor = fn(**argumenti, **{kw: uredaj})
            else:
                # Potpis nije citljiv - probaj redom pa zapamti sto radi.
                odgovor = None
                for kandidat in ("device_id", "slave", "unit"):
                    try:
                        odgovor = fn(**argumenti, **{kandidat: uredaj})
                    except TypeError as e:
                        zadnja = e
                        continue
                    _zapamti_kw(fn, kandidat)
                    kw = kandidat
                    break
            if odgovor is None:
                zadnja = "nema odgovora"
            elif hasattr(odgovor, "isError") and odgovor.isError():
                zadnja = str(odgovor)
            else:
                return
        except Exception as e:
            zadnja = e
        if pokusaj < k.modbus_pokusaja:
            time.sleep(0.1)

    raise OfflineGreska(f"upis reg 0x{adresa_reg:04X}={sirovo} adresa {uredaj}: {zadnja}")


def u_predznak(v: int) -> int:
    return v - 65536 if v > 32767 else v


def procitaj_registar(client, k: Konfig, adresa_reg: int, uredaj: int) -> int:
    """
    Jedan registar s ponavljanjem. Vraca predznacenu vrijednost.
    Zabranjeni registri (0x0420 = Modbus adresa kontrolera) se ne diraju ni za
    citanje - u produkcijskom kodu taj registar ne postoji.
    """
    if adresa_reg in k.registri_zabranjeni:
        raise ZabranjenRegistar(
            f"registar 0x{adresa_reg:04X} je na popisu REGISTRI_ZABRANJENI - citanje odbijeno"
        )

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


# ------------------------------------------------------------------- komande

# Tipovi koje gateway uopce pokusava izvrsiti. ALARM_MINUS / ALARM_PLUS namjerno
# nisu ovdje: to su pragovi upozorenja u aplikaciji, a ne parametri kontrolera.
KOMANDE_ZA_IZVRSITI = {"HLADJENJE_ON", "HLADJENJE_OFF", "ZADANA_TEMP", "HY"}

NAPOMENA_DISCOVERY = "čeka discovery registra"


class Plan:
    """
    Sto tocno treba upisati u kontroler za jednu komandu.

    registar = None -> po kontroleru se NE pise nista jer je vec na trazenoj
    vrijednosti; komanda se svejedno zatvara kao PRIMIJENJENO.
    """

    def __init__(self, registar: int | None, sirovo: int, opis: str) -> None:
        self.registar = registar
        self.sirovo = sirovo
        self.opis = opis


def je_soft_off(k: Konfig, temperatura: float | None) -> bool:
    """Je li zadana temperatura zapravo oznaka "hladjenje iskljuceno"?"""
    return temperatura is not None and abs(temperatura - k.soft_off_temp) < 0.05


def hy_u_registar(k: Konfig, hy: float) -> int:
    """Hy (K) -> sirova vrijednost registra: desetinke pomaknute u gornji bajt."""
    return (round(hy * k.djelitelj_hy) << k.hy_pomak_bitova) & 0xFFFF


def registar_u_hy(k: Konfig, sirovo: int) -> float:
    """Obrnuto od hy_u_registar - za citanje i provjeru."""
    return round(((sirovo & 0xFFFF) >> k.hy_pomak_bitova) / k.djelitelj_hy, 1)


def isplaniraj_soft_off(k: Konfig, tip: str, tank: dict,
                        setpoint_kontrolera: float | None) -> tuple[Plan | None, str, str]:
    """
    ON/OFF preko set pointa - kontroler nema registar za ukljucivanje.

      OFF -> SEt = SOFT_OFF_TEMP
      ON  -> SEt = Tank.zadanaTemp (aplikacija je tu vec vratila zapamcenu vrijednost)

    Gateway namjerno NE pamti i ne vraca staru zadanu temperaturu: to radi
    aplikacija u istoj transakciji u kojoj nastaje komanda. Ovdje ostaje samo
    idempotentan upis, pa ponovni pokusaj ne moze nista pokvariti.
    """
    if tip == "HLADJENJE_OFF":
        cilj = k.soft_off_temp
        opis = f"OFF (SEt {cilj:.1f} C)"
    else:
        cilj = u_broj(tank.get("zadanaTemp"))
        if cilj is None:
            return None, "tank nema zadanu temperaturu - ne znam s čime uključiti hlađenje", "NEUSPJELO"
        if je_soft_off(k, cilj):
            return None, ("zadana temperatura je još na vrijednosti isključenja - "
                          "upiši željenu zadanu temperaturu"), "NEUSPJELO"
        opis = f"ON (SEt {cilj:.1f} C)"

    if setpoint_kontrolera is not None and abs(setpoint_kontrolera - cilj) < 0.05:
        return Plan(None, 0, f"{opis} - kontroler je već na toj vrijednosti"), "", "IZVRSI"
    return Plan(k.reg_setpoint, round(cilj * k.djelitelj_setpoint), opis), "", "IZVRSI"


def isplaniraj(k: Konfig, tip: str, vrijednost: Any, tank: dict,
               setpoint_kontrolera: float | None = None) -> tuple[Plan | None, str, str]:
    """
    Vraca (plan, poruka, ishod), gdje je ishod:
      "IZVRSI"    - plan je spreman
      "CEKA"      - nema se cime izvrsiti (registar ceka discovery); komanda ostaje
                    NA_CEKANJU i dobiva napomenu
      "NEUSPJELO" - komanda se nikad nece moci izvrsiti ovakva kakva je
    """
    if tip in ("HLADJENJE_ON", "HLADJENJE_OFF"):
        if k.reg_setpoint is None:
            return None, f"{NAPOMENA_DISCOVERY} REG_SETPOINT", "CEKA"
        return isplaniraj_soft_off(k, tip, tank, setpoint_kontrolera)

    broj = u_broj(vrijednost)
    if broj is None:
        return None, "komanda nema vrijednost", "NEUSPJELO"

    if tip == "ZADANA_TEMP":
        if k.reg_setpoint is None:
            return None, f"{NAPOMENA_DISCOVERY} REG_SETPOINT", "CEKA"
        return Plan(k.reg_setpoint, round(broj * k.djelitelj_setpoint),
                    f"{broj:.1f} C"), "", "IZVRSI"

    if tip == "HY":
        if k.reg_hy is None:
            return None, f"{NAPOMENA_DISCOVERY} REG_HY", "CEKA"
        sirovo = hy_u_registar(k, broj)
        # Provjera pakiranja: ako se vrijednost ne vrati ista, .env je krivo podesen
        # i bolje je ne pisati nista nego upisati besmislicu u kontroler.
        if abs(registar_u_hy(k, sirovo) - broj) > 0.05:
            return None, (f"Hy {broj:.1f} K ne stane u registar uz HY_POMAK_BITOVA="
                          f"{k.hy_pomak_bitova} - provjeri .env"), "NEUSPJELO"
        return Plan(k.reg_hy, sirovo, f"{broj:.1f} K"), "", "IZVRSI"

    return None, f"tip {tip} se ne izvrsava", "CEKA"


def izvrsi_komandu(client, k: Konfig, uredaj: int, plan: Plan) -> None:
    """
    Upise vrijednost i procita je natrag kao potvrdu.
    Baca OfflineGreska ako upis ne prode ili se ocitano ne slaze sa zadanim.
    Plan bez registra (npr. "vec je iskljuceno") ne dira kontroler.
    """
    if plan.registar is None:
        return

    upisi_registar(client, k, plan.registar, plan.sirovo, uredaj)
    time.sleep(0.1)  # kontroleru treba trenutak da preuzme novu vrijednost

    ocitano = procitaj_registar(client, k, plan.registar, uredaj) & 0xFFFF
    ocekivano = int(plan.sirovo) & 0xFFFF
    if ocitano != ocekivano:
        raise OfflineGreska(
            f"kontroler nije prihvatio: upisano {ocekivano}, procitano {ocitano}"
        )


def obradi_komande_grane(client, k: Konfig, tankovi: list[dict],
                         komande_po_tanku: dict[str, list[dict]],
                         ocitanja: dict[str, dict] | None = None) -> list[dict]:
    """
    Izvrsi komande tankova ove grane. Radi u istoj dretvi kao i citanje jer je
    RS485 dijeljena sabirnica - dva paralelna upita se sudaraju.

    Vraca listu ishoda: {"komanda": <red>, "ishod": "PRIMIJENJENO"|"NEUSPJELO"|"CEKA",
                         "poruka": str, "tankBroj": Any}
    """
    ishodi: list[dict] = []
    granica = datetime.now(timezone.utc) - timedelta(minutes=k.komanda_max_minuta)
    ocitanja = ocitanja or {}

    for t in tankovi:
        popis = komande_po_tanku.get(t["id"]) or []
        if not popis:
            continue
        uredaj = int(t["modbusAdresa"])
        broj = t.get("broj")
        # Set point procitan malocas u istom ciklusu - svjeziji od baze.
        setpoint = (ocitanja.get(t["id"]) or {}).get("setpoint")

        for kom in popis:
            tip = str(kom.get("tip") or "")
            plan, poruka, ishod = isplaniraj(k, tip, kom.get("vrijednost"), t, setpoint)

            # 1) Nemamo cime izvrsiti -> komanda ceka ili odmah pada.
            #    CEKA se NE gasi po starosti; kad se registri konfiguriraju, ogradu
            #    30 min svejedno prolazi tek ako je jos svjeza, pa zaboravljena
            #    komanda nikad ne opali naknadno.
            if plan is None:
                ishodi.append({"komanda": kom, "ishod": ishod,
                               "poruka": poruka or "ceka", "tankBroj": broj})
                if ishod == "NEUSPJELO":
                    log.warning("KOMANDA tank %s %s: %s", broj, tip, poruka)
                continue

            # 2) Sigurnosna ograda: stara komanda se ne izvrsava.
            trazeno = parsiraj_vrijeme(kom.get("trazenoU"))
            if trazeno is None or trazeno < granica:
                poruka = (
                    f"Komanda starija od {k.komanda_max_minuta} min - nije izvrsena."
                    if trazeno is not None
                    else "Neispravno vrijeme zahtjeva - komanda nije izvrsena."
                )
                ishodi.append({"komanda": kom, "ishod": "NEUSPJELO",
                               "poruka": poruka, "tankBroj": broj})
                log.warning("KOMANDA tank %s %s: %s", broj, tip, poruka)
                continue

            # 3) Izvrsi + procitaj natrag kao potvrdu.
            try:
                izvrsi_komandu(client, k, uredaj, plan)
                ishodi.append({"komanda": kom, "ishod": "PRIMIJENJENO",
                               "poruka": plan.opis, "tankBroj": broj})
                if plan.registar is None:
                    log.info("KOMANDA tank %s %s: %s (kontroler nije diran)",
                             broj, tip, plan.opis)
                else:
                    log.info("KOMANDA tank %s %s -> %s: PRIMIJENJENO (reg 0x%04X=%s)",
                             broj, tip, plan.opis, plan.registar, plan.sirovo)
            except ZabranjenRegistar as e:
                # Ponavljanje nema smisla i opasno je - odmah NEUSPJELO.
                ishodi.append({"komanda": kom, "ishod": "NEUSPJELO",
                               "poruka": str(e), "tankBroj": broj})
                log.error("KOMANDA tank %s %s: %s", broj, tip, e)
            except Exception as e:
                ishodi.append({"komanda": kom, "ishod": "GRESKA",
                               "poruka": str(e), "tankBroj": broj})
                log.warning("KOMANDA tank %s %s -> %s: NEUSPJELO (%s)",
                            broj, tip, plan.opis, e)

            if k.pauza_izmedu_tankova > 0:
                time.sleep(k.pauza_izmedu_tankova)

    return ishodi


def obradi_granu(port: str, tankovi: list[dict], k: Konfig,
                 komande_po_tanku: dict[str, list[dict]] | None = None
                 ) -> tuple[dict[str, dict], list[dict]]:
    """
    Jedna dretva = jedan serijski port = jedna RS485 sabirnica (tankovi redom).
    Prvo procita sve tankove grane, zatim izvrsi komande za tu istu granu.
    """
    rezultat: dict[str, dict] = {}
    if not tankovi:
        return rezultat, []

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
        # Komande ove grane se ovaj ciklus ni ne pokusavaju - broje se kao neuspjeh.
        ishodi_porta = [
            {"komanda": kom, "ishod": "GRESKA", "tankBroj": t.get("broj"),
             "poruka": f"port {port} nedostupan"}
            for t in tankovi
            for kom in ((komande_po_tanku or {}).get(t["id"]) or [])
        ]
        return rezultat, ishodi_porta

    ishodi: list[dict] = []
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

        # Komande tek nakon sto je cijela grana procitana - isti port, ista dretva.
        if komande_po_tanku:
            try:
                ishodi = obradi_komande_grane(client, k, tankovi, komande_po_tanku, rezultat)
            except Exception:
                log.exception("Obrada komandi na portu %s je pukla", port)
    finally:
        try:
            client.close()
        except Exception:
            pass
    return rezultat, ishodi


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
    def __init__(self, k: Konfig, bez_upisa: bool = False, bez_komandi: bool = False) -> None:
        self.k = k
        self.db = Supabase(k, bez_upisa=bez_upisa)
        self.bez_komandi = bez_komandi
        self.neuspjeha: dict[str, int] = {}   # tankId -> uzastopnih neuspjelih ciklusa
        self.pokusaji_komandi: dict[str, int] = {}  # komandaId -> neuspjelih pokusaja
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

        komande_po_tanku = self.dohvati_komande_po_tanku()

        rezultati: dict[str, dict] = {}
        ishodi: list[dict] = []
        with ThreadPoolExecutor(max_workers=len(po_portu), thread_name_prefix="grana") as izvrsitelj:
            poslovi = {port: izvrsitelj.submit(obradi_granu, port, lst, self.k, komande_po_tanku)
                       for port, lst in po_portu.items()}
            for port, posao in poslovi.items():
                try:
                    ocitanja_grane, ishodi_grane = posao.result()
                    rezultati.update(ocitanja_grane)
                    ishodi.extend(ishodi_grane)
                except Exception:
                    log.exception("Grana %s je pukla u cijelosti", port)
                    for t in po_portu[port]:
                        rezultati[t["id"]] = {"stanje": "OFFLINE", "poruka": "greska grane"}
                        for kom in komande_po_tanku.get(t["id"], []):
                            ishodi.append({"komanda": kom, "ishod": "GRESKA",
                                           "tankBroj": t.get("broj"), "poruka": "greska grane"})

        self.obradi(tankovi, rezultati)

        try:
            self.zapisi_ishode_komandi(ishodi)
        except Exception as e:
            log.error("Zapis ishoda komandi nije uspio: %s", e)

    # --- komande --------------------------------------------------------------

    def dohvati_komande_po_tanku(self) -> dict[str, list[dict]]:
        """Komande NA_CEKANJU grupirane po tanku. Nepodrzani tipovi se odbacuju."""
        if not self.k.komande_omogucene:
            return {}
        # --bez-upisa je proba: ako se ne smije pisati u bazu, ne smije se pisati
        # ni po kontrolerima. Isto vrijedi za izricit --bez-komandi.
        if self.db.bez_upisa or self.bez_komandi:
            log.info("Komande se ovaj put ne izvrsavaju (proba bez upisa).")
            return {}
        try:
            sve = self.db.dohvati_komande()
        except Exception as e:
            log.error("Ne mogu dohvatiti komande: %s", e)
            return {}

        po_tanku: dict[str, list[dict]] = {}
        preskoceno = 0
        for kom in sve:
            if str(kom.get("tip")) not in KOMANDE_ZA_IZVRSITI:
                preskoceno += 1  # ALARM_MINUS / ALARM_PLUS i sve nepoznato
                continue
            po_tanku.setdefault(kom["tankId"], []).append(kom)

        if po_tanku or preskoceno:
            log.info("Komande na cekanju: %s za izvrsiti, %s preskoceno (nisu za kontroler)",
                     sum(len(v) for v in po_tanku.values()), preskoceno)
        return po_tanku

    def zapisi_ishode_komandi(self, ishodi: list[dict]) -> None:
        """
        Primijeni ishode na bazu i vodi brojac pokusaja.

        PRIMIJENJENO -> odmah upisano.
        CEKA         -> ostaje NA_CEKANJU, upise se napomena (samo ako se promijenila).
        NEUSPJELO    -> odmah NEUSPJELO (sigurnosna ograda, nema smisla ponavljati).
        GRESKA       -> jos jedan pokusaj sljedeci ciklus; nakon KOMANDA_MAX_POKUSAJA
                        prelazi u NEUSPJELO.
        """
        if not ishodi:
            self.pokusaji_komandi.clear()
            return

        vidjeni: set[str] = set()
        primijenjeno = neuspjelo = ceka = 0

        for red in ishodi:
            kom = red["komanda"]
            kid = kom["id"]
            vidjeni.add(kid)
            tip = kom.get("tip")
            broj = red.get("tankBroj")
            ishod = red["ishod"]

            if ishod == "PRIMIJENJENO":
                self.db.komanda_primijenjena(kid)
                self.pokusaji_komandi.pop(kid, None)
                primijenjeno += 1

            elif ishod == "CEKA":
                napomena = red["poruka"]
                if (kom.get("greska") or "") != napomena:
                    self.db.komanda_napomena(kid, napomena)
                    log.info("KOMANDA tank %s %s: %s", broj, tip, napomena)
                ceka += 1

            elif ishod == "NEUSPJELO":
                self.db.komanda_neuspjela(kid, red["poruka"])
                self.pokusaji_komandi.pop(kid, None)
                neuspjelo += 1

            else:  # GRESKA - kontroler nije odgovorio ili nije prihvatio
                pokusaj = self.pokusaji_komandi.get(kid, 0) + 1
                self.pokusaji_komandi[kid] = pokusaj
                if pokusaj >= self.k.komanda_max_pokusaja:
                    poruka = f"Neuspjelo nakon {pokusaj} pokusaja: {red['poruka']}"
                    self.db.komanda_neuspjela(kid, poruka)
                    self.pokusaji_komandi.pop(kid, None)
                    neuspjelo += 1
                    log.error("KOMANDA tank %s %s: %s", broj, tip, poruka)
                else:
                    log.warning("KOMANDA tank %s %s: pokusaj %s/%s neuspio (%s)",
                                broj, tip, pokusaj, self.k.komanda_max_pokusaja, red["poruka"])

        # Komande koje su u meduvremenu nestale iz reda (rucno promijenjene,
        # obrisane) ne smiju zauvijek drzati brojac.
        for kid in list(self.pokusaji_komandi):
            if kid not in vidjeni:
                del self.pokusaji_komandi[kid]

        if primijenjeno or neuspjelo or ceka:
            log.info("Komande: primijenjeno %s, neuspjelo %s, ceka %s",
                     primijenjeno, neuspjelo, ceka)

    # --- upis ocitanja + alarmi ----------------------------------------------

    def obradi(self, tankovi: list[dict], rezultati: dict[str, dict]) -> None:
        mjereno = sada_utc_iso()
        redovi: list[dict] = []
        # tankId -> {tip: poruka} zeljenih alarma, i skup tipova koje ovaj ciklus ne dira
        zeljeni: dict[str, dict[str, str]] = {}
        ne_diraj: dict[str, set[str]] = {}
        broj_ok = broj_alarm = broj_offline = broj_sonda = broj_iskljuceno = 0

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

            # Soft-OFF: zadana = SOFT_OFF_TEMP znaci "hladjenje iskljuceno". Takav
            # tank nitko ne hladi, pa alarm previsoke temperature nema smisla - ne
            # trazi se ovaj ciklus, a postojeci se time i zatvara.
            iskljuceno = je_soft_off(self.k, zadana)

            hladjenje = r.get("hladjenje")
            if iskljuceno:
                hladjenje = False
            elif hladjenje is None:
                hladjenje = temperatura > zadana  # bez statusnog registra: procjena

            donja, gornja = zadana - minus, zadana + plus
            izvan = not iskljuceno and (temperatura > gornja or temperatura < donja)
            if iskljuceno:
                broj_iskljuceno += 1
            if izvan:
                broj_alarm += 1
                smjer = "iznad" if temperatura > gornja else "ispod"
                zeljeni[tid][TIP_TEMP] = (
                    f"Tank {broj}: {temperatura:.1f} C je {smjer} dozvoljenog "
                    f"({donja:.1f} - {gornja:.1f} C, zadana {zadana:.1f} C)."
                )
            elif not iskljuceno:
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
            log.info("Ciklus: %s ocitanja upisano (OK %s, ALARM %s, hladjenje off %s, "
                     "sonda %s, bez veze %s)",
                     len(redovi), broj_ok, broj_alarm, broj_iskljuceno, broj_sonda, broj_offline)
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

        log.info("Zabranjeni registri (nikad se ne diraju): %s",
                 ", ".join(f"0x{r:04X}" for r in sorted(self.k.registri_zabranjeni)) or "nema")

        if self.k.komande_omogucene:
            log.info(
                "Komande: setpoint=%s, Hy=%s (pomak %s bita) | ograda %s min, najvise %s pokusaja",
                f"0x{self.k.reg_setpoint:04X}" if self.k.reg_setpoint is not None else "CEKA DISCOVERY",
                f"0x{self.k.reg_hy:04X}" if self.k.reg_hy is not None else "CEKA DISCOVERY",
                self.k.hy_pomak_bitova,
                self.k.komanda_max_minuta, self.k.komanda_max_pokusaja,
            )
            log.info("ON/OFF hladjenja ide preko set pointa (soft-OFF na %.1f C) - "
                     "kontroler nema registar za ukljucivanje.", self.k.soft_off_temp)
            log.info("ALARM_MINUS i ALARM_PLUS se ne salju kontroleru (pragovi aplikacije).")
        else:
            log.info("Komande su ISKLJUCENE (KOMANDE_OMOGUCENE=false) - gateway samo cita.")

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
    jednom = "--jednom" in sys.argv            # odradi jedan ciklus pa izadi
    bez_upisa = "--bez-upisa" in sys.argv      # nista ne pisi u bazu (prvi test)
    bez_komandi = "--bez-komandi" in sys.argv  # citaj i pisi u bazu, ali ne diraj kontrolere

    ucitaj_env(os.path.join(BAZA_DIR, ".env"))
    k = Konfig()
    postavi_logiranje(k)
    k.provjeri()

    gw = Gateway(k, bez_upisa=bez_upisa, bez_komandi=bez_komandi)

    if jednom:
        log.info("JEDAN CIKLUS%s%s",
                 " (BEZ UPISA)" if bez_upisa else "",
                 " (BEZ KOMANDI)" if bez_komandi else "")
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
