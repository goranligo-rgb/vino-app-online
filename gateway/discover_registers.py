#!/usr/bin/env python3
"""
DISCOVERY - pomocna skripta za mapiranje registara Dixell XR75CX.

Potvrdeno je samo 0x0100 = sonda P1 (vrijednost /10). Set point i statusni registar
(relej hladjenja, greska sonde) nisu javno dokumentirani, pa se traze usporedbom
s onim sto pise na displeju kontrolera.

Primjeri:

  # 1) tko je uopce ziv na grani A
  python discover_registers.py --port /dev/ttyUSB0 --skeniraj-adrese

  # 2) ispis raspona registara za tank 1 (cita registar po registar)
  python discover_registers.py --port /dev/ttyUSB0 --adresa 1 --od 0x0000 --do 0x0020

  # 3) uobicajeni prozori odjednom (najbrzi put do set pointa i statusa)
  python discover_registers.py --port /dev/ttyUSB0 --adresa 1 --preset

  # 4) prati jedan registar uzivo (ukljuci/iskljuci hladjenje na kontroleru i gledaj sto se mijenja)
  python discover_registers.py --port /dev/ttyUSB0 --adresa 1 --prati 0x0180 --prati 0x0181

Trazi se:
  - SET POINT: registar cija je vrijednost/10 jednaka SEt-u na kontroleru
    (promijeni SEt na kontroleru za 1 C i vidi koji se registar pomakne za 10)
  - STATUS: registar koji se mijenja tocno kad relej hladjenja upadne/ispadne
    (obicno bitovna maska - gledaj stupac BIN)
"""

from __future__ import annotations

import argparse
import inspect
import sys
import time

try:
    from pymodbus.client import ModbusSerialClient
except ImportError:
    sys.exit("GRESKA: pymodbus nije instaliran. Aktiviraj venv: source ~/gateway/venv/bin/activate")

# Prozori koje ima smisla pogledati kod Dixell CX serije (logicke zone protokola).
PRESET_PROZORI = [
    (0x0000, 0x0020),  # identifikacija uredaja / status
    (0x0100, 0x0120),  # sonde (0x0100 = P1, POTVRDENO)
    (0x0120, 0x0140),
    (0x0180, 0x01A0),  # cesto status digitalnih izlaza/alarma
    (0x0200, 0x0220),  # korisnicki parametri (SEt je obicno prvi)
    (0x1000, 0x1020),  # EEPROM zona
]

_KW: str | None = None


def citaj(client, fc: int, adresa_reg: int, uredaj: int, broj: int = 1):
    """pymodbus je kroz verzije mijenjao ime argumenta: unit -> slave -> device_id."""
    global _KW
    fn = client.read_holding_registers if fc == 3 else client.read_input_registers
    if _KW is None:
        try:
            parametri = inspect.signature(fn).parameters
        except (TypeError, ValueError):
            parametri = {}
        for kandidat in ("device_id", "slave", "unit"):
            if kandidat in parametri:
                _KW = kandidat
                break
    if _KW:
        return fn(address=adresa_reg, count=broj, **{_KW: uredaj})
    for kandidat in ("device_id", "slave", "unit"):
        try:
            odgovor = fn(address=adresa_reg, count=broj, **{kandidat: uredaj})
        except TypeError:
            continue
        _KW = kandidat
        return odgovor
    raise RuntimeError("Ne mogu pozvati pymodbus citanje ni s jednim imenom argumenta.")


def predznak(v: int) -> int:
    return v - 65536 if v > 32767 else v


def jedan(client, fc: int, adresa_reg: int, uredaj: int):
    """Vraca (vrijednost | None, poruka_greske | None)."""
    try:
        odgovor = citaj(client, fc, adresa_reg, uredaj)
    except Exception as e:
        return None, f"iznimka: {e}"
    if odgovor is None:
        return None, "nema odgovora"
    if hasattr(odgovor, "isError") and odgovor.isError():
        return None, str(odgovor)
    registri = getattr(odgovor, "registers", None)
    if not registri:
        return None, "prazan odgovor"
    return registri[0], None


def spoji(args) -> ModbusSerialClient:
    client = ModbusSerialClient(
        port=args.port, baudrate=args.baud, parity=args.parity,
        bytesize=args.bytesize, stopbits=args.stopbits, timeout=args.timeout,
    )
    if not client.connect():
        sys.exit(f"GRESKA: ne mogu otvoriti port {args.port}")
    return client


def skeniraj_adrese(client, args) -> None:
    print(f"Skeniram Modbus adrese 1-{args.max_adresa} na {args.port} (registar 0x{args.reg_test:04X})...\n")
    nadeno = []
    for uredaj in range(1, args.max_adresa + 1):
        vrijednost, greska = jedan(client, args.fc, args.reg_test, uredaj)
        if vrijednost is not None:
            print(f"  adresa {uredaj:3d}  ODGOVARA  sirovo={vrijednost:6d}  /10={predznak(vrijednost)/10:7.1f}")
            nadeno.append(uredaj)
        time.sleep(args.pauza)
    print(f"\nZivih kontrolera: {len(nadeno)} -> {nadeno}")


def ispisi_raspon(client, args, od: int, do: int) -> None:
    print(f"\n=== 0x{od:04X} - 0x{do - 1:04X} (adresa {args.adresa}, FC{args.fc}) ===")
    print(f"{'HEX':>7} {'DEC':>6} {'SIROVO':>7} {'PREDZ':>7} {'/10':>8}  {'BIN':>19}  GRESKA")
    for reg in range(od, do):
        vrijednost, greska = jedan(client, args.fc, reg, args.adresa)
        if vrijednost is None:
            if not args.samo_uspjesne:
                print(f"0x{reg:04X} {reg:6d} {'-':>7} {'-':>7} {'-':>8}  {'-':>19}  {greska}")
        else:
            p = predznak(vrijednost)
            print(f"0x{reg:04X} {reg:6d} {vrijednost:7d} {p:7d} {p / 10:8.1f}  {vrijednost:016b}")
        time.sleep(args.pauza)


def prati(client, args) -> None:
    registri = [int(r, 0) for r in args.prati]
    print(f"Pratim {[f'0x{r:04X}' for r in registri]} na adresi {args.adresa}, svakih {args.interval} s. Ctrl+C za kraj.\n")
    print("vrijeme   " + "  ".join(f"0x{r:04X}(sirovo/10/bin)" for r in registri))
    try:
        while True:
            dijelovi = []
            for reg in registri:
                vrijednost, greska = jedan(client, args.fc, reg, args.adresa)
                if vrijednost is None:
                    dijelovi.append(f"ERR({greska[:20]})")
                else:
                    p = predznak(vrijednost)
                    dijelovi.append(f"{vrijednost:6d}/{p / 10:6.1f}/{vrijednost:016b}")
                time.sleep(args.pauza)
            print(time.strftime("%H:%M:%S") + "  " + "  ".join(dijelovi))
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nKraj.")


def main() -> None:
    p = argparse.ArgumentParser(description="Discovery Modbus registara za Dixell XR75CX")
    p.add_argument("--port", default="/dev/ttyUSB0")
    p.add_argument("--baud", type=int, default=9600)
    p.add_argument("--parity", default="N")
    p.add_argument("--bytesize", type=int, default=8)
    p.add_argument("--stopbits", type=int, default=1)
    p.add_argument("--timeout", type=float, default=1.0)
    p.add_argument("--fc", type=int, default=3, choices=[3, 4], help="3=holding (zadano), 4=input")
    p.add_argument("--adresa", type=int, default=1, help="Modbus adresa kontrolera (= broj tanka)")
    p.add_argument("--od", type=lambda x: int(x, 0), default=0x0000)
    p.add_argument("--do", type=lambda x: int(x, 0), default=0x0020, help="gornja granica (iskljucivo)")
    p.add_argument("--preset", action="store_true", help="prodi kroz tipicne prozore CX serije")
    p.add_argument("--skeniraj-adrese", action="store_true", help="trazi zive kontrolere na sabirnici")
    p.add_argument("--max-adresa", type=int, default=50)
    p.add_argument("--reg-test", type=lambda x: int(x, 0), default=0x0100)
    p.add_argument("--prati", action="append", default=[], help="registar za pracenje uzivo (moze vise puta)")
    p.add_argument("--interval", type=float, default=2.0)
    p.add_argument("--pauza", type=float, default=0.05, help="pauza izmedu upita")
    p.add_argument("--samo-uspjesne", action="store_true", help="ne ispisuj registre koji vrate gresku")
    args = p.parse_args()

    client = spoji(args)
    try:
        if args.skeniraj_adrese:
            skeniraj_adrese(client, args)
        elif args.prati:
            prati(client, args)
        elif args.preset:
            for od, do in PRESET_PROZORI:
                ispisi_raspon(client, args, od, do)
        else:
            ispisi_raspon(client, args, args.od, args.do)
    finally:
        client.close()


if __name__ == "__main__":
    main()
