# Vino gateway (Raspberry Pi -> Supabase)

Cita Dixell XR75CX kontrolere preko Modbus RTU i puni tablice modula Hladjenje
(`OcitanjeTemperature`, `TankAlarm`). Faza A = samo citanje; `TankKomanda` se ne dira.

| Datoteka | Sto je |
|---|---|
| `gateway.py` | servis (petlja svake 2 min) |
| `discover_registers.py` | alat za mapiranje registara (set point, status releja) |
| `.env.example` | predlozak konfiguracije (pravi `.env` ostaje samo na Pi-ju) |
| `vino-gateway.service` | systemd unit |

## Sto tocno radi u jednom ciklusu

1. `GET /rest/v1/Tank?modbusAdresa=not.is.null` - popis tankova, grana, zadana temp, pragovi.
2. Grana A (`/dev/ttyUSB0`) i grana B (`/dev/ttyUSB1`) citaju se **paralelno** (dvije dretve),
   a unutar grane tank po tank (RS485 je dijeljena sabirnica).
3. `POST /rest/v1/OcitanjeTemperature` - sva ocitanja ciklusa u jednom zahtjevu.
4. Usporedba stanja s aktivnim alarmima -> otvaranje novih / zatvaranje razrijesenih.

## Alarmi

| Tip | Kad se otvori | Kad se zatvori |
|---|---|---|
| `PREVISOKA_TEMP` | temperatura izvan `[zadana - alarmMinus, zadana + alarmPlus]` (poruka kaze je li iznad ili ispod) | prvo ocitanje unutar granica |
| `GRESKA_SONDE` | sonda javlja nemogucu vrijednost / sentinel (ili bit greske ako je `REG_STATUS` konfiguriran) | prvo valjano ocitanje |
| `NEMA_VEZE` | kontroler ne odgovori `OFFLINE_CIKLUSA` (3) ciklusa zaredom | prvi uspjesan odgovor |

Dok je tank offline, alarmi `PREVISOKA_TEMP` i `GRESKA_SONDE` se **ne diraju** - bez podataka
se ne zna jesu li rijeseni.

## Zasto se kod "nema veze" ne pise red u OcitanjeTemperature

`OcitanjeTemperature.temperatura` je `NOT NULL`, a izmisljena temperatura bi bila laz u
povijesti mjerenja. Aplikacija ionako racuna "BEZ VEZE" iz starosti zadnjeg ocitanja
(`lib/temperatura.ts`, `OFFLINE_PRAG_MIN = 15` min), a gateway uz to otvori alarm
`NEMA_VEZE` nakon 6 min (3 ciklusa). Status u zapisanom ocitanju je zato uvijek `OK` ili `ALARM`.

## Registri - sto je potvrdeno, a sto nije

- **Potvrdeno:** `0x0100` (dec 256) = sonda P1, vrijednost `/10` (procitano 153 = 15,3 C).
- **Nije potvrdeno:** set point i statusni registar (relej hladjenja, greska sonde).
  Dixell ne objavljuje mapu registara za XR-CX seriju javno.

Dok `REG_SETPOINT` / `REG_STATUS` u `.env` stoje prazni, gateway radi ovako:

- `zadanaTemperatura` se uzima iz baze (`Tank.zadanaTemp`) - isto sto aplikacija vec prikazuje,
- `hladjenjeAktivno` se **procjenjuje** kao `temperatura > zadana`.

Cim potvrdis adrese preko `discover_registers.py`, upisi ih u `.env` i restartaj servis -
kod se ne mijenja.

### Kako naci set point i status

```bash
source ~/gateway/venv/bin/activate

# tko je ziv na grani A
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 --skeniraj-adrese

# tipicni prozori registara za tank 1
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 --adresa 1 --preset --samo-uspjesne
```

- **Set point:** trazi registar ciji je `/10` jednak `SEt` na displeju. Provjera: promijeni `SEt`
  na kontroleru za 1 C i ponovi ispis - tocan registar se pomakne za 10.
- **Status/relej:** pokreni pracenje pa ukljuci/iskljuci hladjenje i gledaj koji se bit mijenja:

```bash
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 --adresa 1 --prati 0x0180 --prati 0x0181
```

Broj bita koji se mijenja upisi u `BIT_HLADJENJE` (0 = najnizi bit), a registar u `REG_STATUS`.

## Instalacija - vidi upute u razgovoru ili niz naredbi ispod

```bash
sudo apt update && sudo apt install -y python3-venv git
mkdir -p ~/gateway && cd ~/gateway
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install pymodbus pyserial
# kopiraj gateway.py, discover_registers.py, .env.example u ~/gateway
cp .env.example .env && nano .env      # upisi SUPABASE_URL i SUPABASE_SERVICE_KEY
chmod 600 ~/gateway/.env
sudo usermod -aG dialout $USER         # pristup /dev/ttyUSB* (odjava/prijava ili reboot)

# proba bez ijednog upisa u bazu, pa jedan pravi ciklus
python ~/gateway/gateway.py --jednom --bez-upisa
python ~/gateway/gateway.py --jednom

sudo cp ~/gateway/vino-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vino-gateway
journalctl -u vino-gateway -f
```

## Odrzavanje

```bash
sudo systemctl status vino-gateway     # stanje
sudo systemctl restart vino-gateway    # nakon promjene .env
journalctl -u vino-gateway -n 100      # zadnjih 100 redaka
tail -f ~/gateway/gateway.log          # vlastiti log (rotacija 5 MB x 5)
```

## Faza B (nije u ovoj verziji)

Izvrsavanje `TankKomanda` (zadana temp, pragovi, hladjenje ON/OFF) preko Modbus writea -
tek kad se potvrdi mapa registara za pisanje i odluci sto se smije mijenjati iz aplikacije.
