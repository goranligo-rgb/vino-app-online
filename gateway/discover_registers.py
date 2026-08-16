#!/usr/bin/env python3
"""
DISCOVERY - pomocna skripta za mapiranje registara Dixell XR75CX.

SAMO CITA. Ova skripta NIKAD ne pise po kontroleru - svaka promjena parametra
radi se rukom na samom kontroleru, a skripta samo gleda koji se registar pomakao.
Tako se ne moze nista slucajno pokvariti na tanku s vinom.

Potvrdeno (discovery 16.08.2026., test tank 2):
  0x0100 = sonda P1, /10
  0x042D = set point (SEt), /10
  0x0408 = diferencijal (Hy), PAKIRAN: (Hy * 10) << 8  (2,0 -> 5120)
Standby (onF) preko Modbusa NE POSTOJI - hladjenje se gasi podizanjem set pointa
na 20,0 C (soft-OFF, vidi gateway.py).

ZABRANJENO - 0x0420 je MODBUS ADRESA SAMOG KONTROLERA. Upis u njega je prepisao
adrese vise kontrolera odjednom i srusio cijelu granu (svi uredaji zavrse na istoj
adresi i vise se ne razlikuju; popravlja se rucno, kontroler po kontroler). Zato
je na popisu REGISTRI_ZABRANJENI: `jedan()` ga preskace i kod citanja, a `--upisi`
ga odbija bez obzira na sve zastavice i potvrde.

Primjeri:

  # 1) tko je uopce ziv na grani A
  python discover_registers.py --port /dev/ttyUSB0 --skeniraj-adrese

  # 2) ispis raspona registara za tank 1 (cita registar po registar)
  python discover_registers.py --port /dev/ttyUSB0 --adresa 1 --od 0x0000 --do 0x0020

  # 3) uobicajeni prozori odjednom (najbrzi put do set pointa i statusa)
  python discover_registers.py --port /dev/ttyUSB0 --adresa 1 --preset

  # 4) prati jedan registar uzivo (ukljuci/iskljuci hladjenje na kontroleru i gledaj sto se mijenja)
  python discover_registers.py --port /dev/ttyUSB0 --adresa 1 --prati 0x0180 --prati 0x0181

  # 5) tko ima bas ovu vrijednost (npr. na displeju pise SEt = 14,0)
  python discover_registers.py --port /dev/ttyUSB0 --adresa 1 --preset --trazi 14.0

  # 6) RAZLIKA - najsigurniji put do SEt / Hy / onF registra:
  #    snimi stanje, rukom promijeni parametar na kontroleru, pritisni Enter
  python discover_registers.py --port /dev/ttyUSB0 --adresa 1 --preset --razlika

Jos se trazi:
  - STATUS: registar koji se mijenja tocno kad relej hladjenja upadne/ispadne
    (obicno bitovna maska - gledaj stupac BIN) -> REG_STATUS, BIT_HLADJENJE
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

# Registri koji se NIKAD ne diraju - ni citanje, ni upis.
# Mora se poklapati s REGISTRI_ZABRANJENI u gateway/.env.
REGISTRI_ZABRANJENI = {0x0420}
OBJASNJENJE_ZABRANE = {
    0x0420: "Modbus adresa samog kontrolera - upis je 16.08.2026. prepisao adrese "
            "vise uredaja odjednom i srusio granu",
}

# Prozori koje ima smisla pogledati kod Dixell CX serije (logicke zone protokola).
PRESET_PROZORI = [
    (0x0000, 0x0020),  # identifikacija uredaja / status
    (0x0100, 0x0120),  # sonde (0x0100 = P1, POTVRDENO)
    (0x0120, 0x0140),
    (0x0180, 0x01A0),  # cesto status digitalnih izlaza/alarma
    (0x0200, 0x0220),  # korisnicki parametri
    (0x0400, 0x0440),  # POTVRDENO: 0x0408 = Hy, 0x042D = SEt
                       # (0x0420 je u ovom rasponu, ali ga `jedan()` preskace)
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
    """
    Vraca (vrijednost | None, poruka_greske | None).

    Zabranjeni registri se preskacu bez slanja ijednog okvira - to je jedina
    tocka citanja u skripti, pa prolaz kroz raspon ne moze zagrepsti 0x0420.
    """
    if adresa_reg in REGISTRI_ZABRANJENI:
        return None, f"PRESKACEM (zabranjen: {OBJASNJENJE_ZABRANE.get(adresa_reg, 'ne dirati')})"
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


def procitaj_raspon(client, args, prozori: list[tuple[int, int]]) -> dict[int, int]:
    """Snimi vrijednosti svih registara iz zadanih prozora (samo uspjesne)."""
    snimka: dict[int, int] = {}
    for od, do in prozori:
        for reg in range(od, do):
            vrijednost, _ = jedan(client, args.fc, reg, args.adresa)
            if vrijednost is not None:
                snimka[reg] = vrijednost
            time.sleep(args.pauza)
    return snimka


def prozori_iz_argumenata(args) -> list[tuple[int, int]]:
    return list(PRESET_PROZORI) if args.preset else [(args.od, args.do)]


def trazi_vrijednost(client, args, prozori: list[tuple[int, int]]) -> None:
    """
    Nadi registre koji drze zadanu vrijednost.

    Usporeduje i sirovo i /10, jer Dixell temperature drzi u desetinkama:
    ako na displeju pise SEt 14,0, registar sadrzi 140.
    """
    trazeno = args.trazi
    sirovo_trazeno = int(round(trazeno * 10))
    print(f"\nTrazim vrijednost {trazeno} (sirovo {sirovo_trazeno} ili {int(trazeno)}) "
          f"na adresi {args.adresa}...\n")

    pogodaka = 0
    for od, do in prozori:
        for reg in range(od, do):
            vrijednost, _ = jedan(client, args.fc, reg, args.adresa)
            if vrijednost is not None:
                p = predznak(vrijednost)
                if p == sirovo_trazeno or p == int(trazeno):
                    kako = "/10" if p == sirovo_trazeno else "sirovo"
                    print(f"  POGODAK  0x{reg:04X} ({reg:5d})  = {p:6d}  [{kako}]")
                    pogodaka += 1
            time.sleep(args.pauza)

    print(f"\nPogodaka: {pogodaka}")
    if pogodaka > 1:
        print("Vise kandidata - promijeni parametar na kontroleru i ponovi s --razlika "
              "da vidis koji se stvarno pomakao.")


def razlika(client, args, prozori: list[tuple[int, int]]) -> None:
    """
    Snimi -> ti rucno promijenis parametar na kontroleru -> snimi ponovo -> ispisi razliku.
    Najsigurniji nacin da se nade SEt, Hy ili onF: nista se ne pise po kontroleru.
    """
    ukupno = sum(do - od for od, do in prozori)
    print(f"\nSnimam {ukupno} registara na adresi {args.adresa} (prije promjene)...")
    prije = procitaj_raspon(client, args, prozori)
    print(f"Snimljeno {len(prije)} registara koji odgovaraju.\n")

    print("SADA RUCNO promijeni parametar NA KONTROLERU (npr. SEt za 1 C, Hy za 0,1,")
    print("ili prebaci uredaj u standby), pa se vrati ovdje.")
    try:
        input("Kad je promjena gotova, pritisni Enter... ")
    except (EOFError, KeyboardInterrupt):
        print("\nPrekinuto.")
        return

    print(f"\nSnimam ponovo...")
    poslije = procitaj_raspon(client, args, prozori)

    promjene = []
    for reg, stara in prije.items():
        nova = poslije.get(reg)
        if nova is not None and nova != stara:
            promjene.append((reg, stara, nova))

    if not promjene:
        print("\nNijedan registar se nije promijenio. Je li promjena stvarno spremljena "
              "na kontroleru (kod Dixella treba potvrditi izlazak iz izbornika)?")
        return

    print(f"\n=== PROMIJENJENO: {len(promjene)} registara ===")
    print(f"{'HEX':>7} {'DEC':>6} {'PRIJE':>8} {'POSLIJE':>8} {'RAZLIKA':>8}  BIN prije -> poslije")
    for reg, stara, nova in promjene:
        ps, pn = predznak(stara), predznak(nova)
        print(f"0x{reg:04X} {reg:6d} {ps:8d} {pn:8d} {pn - ps:8d}  "
              f"{stara:016b} -> {nova:016b}")

    print("\nTumacenje:")
    print("  razlika 10 nakon promjene SEt za 1 C   -> to je REG_SETPOINT (djelitelj 10)")
    print("  razlika 1 nakon promjene Hy za 0,1     -> to je REG_HY (djelitelj 10)")
    print("  0 <-> 1 nakon ulaska u standby         -> kandidat za REG_ONOFF")
    print("  promjena jednog bita u maski           -> to je REG_STATUS + broj tog bita")


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


def upisi(client, args) -> None:
    """
    KONTROLIRANI UPIS u jedan registar jednog kontrolera - za provjeru kandidata
    nadenog citanjem (npr. "je li 0x0201 stvarno Hy?").

    Namjerno neugodno za koristenje:
      - trazi i --upisi i --test-tank i --potvrdi-upis,
      - trazi da rucno utipkas DA,
      - pise tocno jedan registar, jednom, pa procita natrag,
      - --test-tank mora biti isti broj kao --adresa (da se ne omakne tudi tank).

    KORISTI SAMO NA PRAZNOM TEST TANKU. Krivi registar na tanku s vinom moze
    promijeniti rezim hladjenja.
    """
    if args.upisi in REGISTRI_ZABRANJENI:
        sys.exit(f"ODBIJENO: registar 0x{args.upisi:04X} je na popisu zabranjenih "
                 f"({OBJASNJENJE_ZABRANE.get(args.upisi, 'rusi kontroler')}). "
                 f"Ovaj upis se ne radi ni s --potvrdi-upis.")
    if args.test_tank != args.adresa:
        sys.exit(f"ODBIJENO: --test-tank ({args.test_tank}) i --adresa ({args.adresa}) "
                 f"moraju biti isti broj. To je namjerna prepreka.")
    if not args.potvrdi_upis:
        sys.exit("ODBIJENO: nedostaje --potvrdi-upis. Upis se ne radi slucajno.")

    reg = args.upisi
    vrijednost = args.vrijednost
    if vrijednost is None:
        sys.exit("ODBIJENO: uz --upisi treba i --vrijednost (sirovi broj koji ide u registar).")

    prije, greska = jedan(client, args.fc, reg, args.adresa)
    if prije is None:
        sys.exit(f"ODBIJENO: registar 0x{reg:04X} se ne moze ni procitati ({greska}). "
                 f"Ne pisem u nesto sto ne vidim.")

    print("\n" + "=" * 68)
    print(f"  UPIS U KONTROLER - adresa {args.adresa} (TEST TANK {args.test_tank})")
    print(f"  registar 0x{reg:04X} ({reg})")
    print(f"  trenutna vrijednost: {prije}  (predznaceno {predznak(prije)}, /10 = {predznak(prije)/10})")
    print(f"  upisujem:            {vrijednost}")
    print("=" * 68)
    try:
        odgovor = input("Utipkaj DA za upis (bilo sto drugo prekida): ")
    except (EOFError, KeyboardInterrupt):
        print("\nPrekinuto.")
        return
    if odgovor.strip() != "DA":
        print("Prekinuto - nista nije upisano.")
        return

    fn = client.write_register
    kw = None
    try:
        parametri = inspect.signature(fn).parameters
    except (TypeError, ValueError):
        parametri = {}
    for kandidat in ("device_id", "slave", "unit"):
        if kandidat in parametri:
            kw = kandidat
            break

    try:
        if kw:
            rezultat = fn(address=reg, value=int(vrijednost) & 0xFFFF, **{kw: args.adresa})
        else:
            rezultat = None
            for kandidat in ("device_id", "slave", "unit"):
                try:
                    rezultat = fn(address=reg, value=int(vrijednost) & 0xFFFF,
                                  **{kandidat: args.adresa})
                    break
                except TypeError:
                    continue
    except Exception as e:
        sys.exit(f"UPIS PUKAO: {e}")

    if rezultat is None or (hasattr(rezultat, "isError") and rezultat.isError()):
        print(f"Kontroler je ODBIO upis: {rezultat}")
        return

    time.sleep(0.2)
    poslije, greska = jedan(client, args.fc, reg, args.adresa)
    print(f"\nProcitano natrag: {poslije} (greska: {greska})")
    if poslije == (int(vrijednost) & 0xFFFF):
        print("POTVRDENO - registar je prihvatio vrijednost.")
        print("Provjeri jos i sto pise na displeju kontrolera prije nego upises adresu u .env.")
    else:
        print(f"NE SLAZE SE - upisano {vrijednost}, procitano {poslije}. "
              f"Vjerojatno to nije taj registar (ili je samo za citanje).")
    print(f"\nNe zaboravi vratiti staru vrijednost: --upisi 0x{reg:04X} --vrijednost {prije}")


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
    p.add_argument("--trazi", type=float, default=None,
                   help="nadi registre s ovom vrijednoscu (npr. --trazi 14.0 za SEt 14 C)")
    p.add_argument("--razlika", action="store_true",
                   help="snimi -> rucno promijeni parametar na kontroleru -> snimi -> ispisi sto se pomaklo")

    # --- upis (opasno, zato u zasebnoj skupini i s tri kljuca) ---
    upis = p.add_argument_group("UPIS - samo na praznom test tanku")
    upis.add_argument("--upisi", type=lambda x: int(x, 0), default=None,
                      help="registar u koji se pise (npr. 0x0201)")
    upis.add_argument("--vrijednost", type=int, default=None,
                      help="sirova vrijednost koja se upisuje (npr. 5 za Hy 0,5)")
    upis.add_argument("--test-tank", type=int, default=None,
                      help="broj test tanka; mora biti jednak --adresa")
    upis.add_argument("--potvrdi-upis", action="store_true",
                      help="izricita potvrda da se smije pisati po kontroleru")
    args = p.parse_args()

    client = spoji(args)
    try:
        if args.upisi is not None:
            upisi(client, args)
        elif args.skeniraj_adrese:
            skeniraj_adrese(client, args)
        elif args.prati:
            prati(client, args)
        elif args.razlika:
            razlika(client, args, prozori_iz_argumenata(args))
        elif args.trazi is not None:
            trazi_vrijednost(client, args, prozori_iz_argumenata(args))
        elif args.preset:
            for od, do in PRESET_PROZORI:
                ispisi_raspon(client, args, od, do)
        else:
            ispisi_raspon(client, args, args.od, args.do)
    finally:
        client.close()


if __name__ == "__main__":
    main()
