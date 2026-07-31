# Vino gateway (Raspberry Pi -> Supabase)

Cita Dixell XR75CX kontrolere preko Modbus RTU i puni tablice modula Hladjenje
(`OcitanjeTemperature`, `TankAlarm`), a od Faze B i **izvrsava komande** iz
`TankKomanda` (hladjenje ON/OFF, zadana temperatura, diferencijal Hy).

| Datoteka | Sto je |
|---|---|
| `gateway.py` | servis (petlja svake 2 min) |
| `discover_registers.py` | alat za mapiranje registara (set point, status releja) |
| `.env.example` | predlozak konfiguracije (pravi `.env` ostaje samo na Pi-ju) |
| `vino-gateway.service` | systemd unit |

## Sto tocno radi u jednom ciklusu

1. `GET /rest/v1/Tank?modbusAdresa=not.is.null` - popis tankova, grana, zadana temp, pragovi.
   Uz to `GET /rest/v1/TankKomanda?status=eq.NA_CEKANJU` - komande koje cekaju.
2. Grana A (`/dev/ttyUSB0`) i grana B (`/dev/ttyUSB1`) obraduju se **paralelno** (dvije dretve),
   a unutar grane tank po tank (RS485 je dijeljena sabirnica). Prvo se procita
   cijela grana, pa se **na istoj dretvi** izvrse komande za tankove te grane.
3. `POST /rest/v1/OcitanjeTemperature` - sva ocitanja ciklusa u jednom zahtjevu.
4. Usporedba stanja s aktivnim alarmima -> otvaranje novih / zatvaranje razrijesenih.
5. `PATCH /rest/v1/TankKomanda` - ishodi komandi.

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

## Komande (Faza B)

Aplikacija (`/dashboard/hladjenje` i kartica Hladjenje na monitoru tanka) upisuje
red u `TankKomanda` sa statusom `NA_CEKANJU`. Gateway ga preuzima u sljedecem ciklusu.

| Tip komande | Registar | Salje se kontroleru? |
|---|---|---|
| `HLADJENJE_ON` / `HLADJENJE_OFF` | `REG_ONOFF` | da (kad je registar poznat) |
| `ZADANA_TEMP` | `REG_SETPOINT` | da (kad je registar poznat) |
| `HY` (diferencijal 0,3-3,0 K) | `REG_HY` | da (kad je registar poznat) |
| `ALARM_MINUS` / `ALARM_PLUS` | - | **ne** - to su pragovi upozorenja u aplikaciji, ne parametri kontrolera |

Tijek jedne komande:

1. **Registar nije u `.env`** -> komanda ostaje `NA_CEKANJU` i dobije napomenu
   `ceka discovery registra REG_...`. Nista se ne pise po kontroleru napamet.
2. **Komanda starija od `KOMANDA_MAX_MINUTA` (30)** -> `NEUSPJELO`, bez slanja.
   Zaboravljeni zahtjev ne smije opaliti sat vremena kasnije - ni onda kad se
   registri konfiguriraju naknadno.
3. **Upis + citanje natrag.** Ako se procitana vrijednost slaze sa zadanom ->
   `PRIMIJENJENO` + `primijenjenoU`. Ako kontroler ne odgovori ili ne prihvati ->
   novi pokusaj sljedeci ciklus, najvise `KOMANDA_MAX_POKUSAJA` (3), pa `NEUSPJELO`.
4. Svaka izvrsena komanda ide u log: tank, tip, ishod.

Prekidaci:

```bash
KOMANDE_OMOGUCENE=false                 # .env: gateway samo cita
python ~/gateway/gateway.py --jednom --bez-komandi   # jedan ciklus, kontroleri se ne diraju
python ~/gateway/gateway.py --jednom --bez-upisa     # nista se ne pise ni u bazu ni u kontrolere
```

## Registri - sto je potvrdeno, a sto nije

- **Potvrdeno:** `0x0100` (dec 256) = sonda P1, vrijednost `/10` (procitano 153 = 15,3 C).
- **Nije potvrdeno:** set point (`SEt`), diferencijal (`Hy`), standby (`onF`) i statusni
  registar (relej hladjenja, greska sonde). Dixell ne objavljuje mapu registara za
  XR-CX seriju javno.

Dok `REG_SETPOINT` / `REG_HY` / `REG_ONOFF` / `REG_STATUS` u `.env` stoje prazni:

- `zadanaTemperatura` se uzima iz baze (`Tank.zadanaTemp`) - isto sto aplikacija vec prikazuje,
- `hladjenjeAktivno` se **procjenjuje** kao `temperatura > zadana`,
- komande tog tipa **stoje `NA_CEKANJU`** s napomenom `ceka discovery registra ...`.

Cim potvrdis adrese preko `discover_registers.py`, upisi ih u `.env` i restartaj servis -
kod se ne mijenja.

> Nakon upisa adresa u `.env`: stare komande koje su cekale discovery bit ce
> starije od 30 min pa ce prijeci u `NEUSPJELO`. To je namjerno - posalji ih
> ponovo iz aplikacije. Nista se nece samo od sebe izvrsiti unatrag.

### Kako naci registre

`discover_registers.py` **samo cita**. Parametre mijenjas rukom na kontroleru, a
skripta gleda koji se registar pomaknuo.

```bash
source ~/gateway/venv/bin/activate

# tko je ziv na grani A
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 --skeniraj-adrese

# tipicni prozori registara za tank 1
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 --adresa 1 --preset --samo-uspjesne
```

**Najbrzi put - `--razlika`** (snimi, rucno promijeni parametar, Enter, snimi):

```bash
# SEt: promijeni zadanu za 1 C  -> trazeni registar se pomakne za 10
# Hy:  promijeni diferencijal za 0,1 -> pomak za 1
# onF: prebaci uredaj u standby -> kandidat je registar koji ode 1 <-> 0
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 --adresa 1 --preset --razlika
```

**Ako znas vrijednost koja pise na displeju** (npr. `SEt` = 14,0):

```bash
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 --adresa 1 --preset --trazi 14.0
```

**Status/relej:** pokreni pracenje pa ukljuci/iskljuci hladjenje i gledaj koji se bit mijenja:

```bash
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 --adresa 1 --prati 0x0180 --prati 0x0181
```

Broj bita koji se mijenja upisi u `BIT_HLADJENJE` (0 = najnizi bit), a registar u `REG_STATUS`.

### Provjera kandidata upisom - SAMO NA PRAZNOM TEST TANKU

Kad citanjem nades kandidata, mozes ga potvrditi jednim upisom. Skripta trazi tri
kljuca odjednom i jos rucno utipkano `DA`, pise **tocno jedan registar jednom** i
odmah cita natrag:

```bash
python ~/gateway/discover_registers.py --port /dev/ttyUSB0 \
  --adresa 7 --test-tank 7 \
  --upisi 0x0201 --vrijednost 5 --potvrdi-upis
```

- `--test-tank` mora biti isti broj kao `--adresa` (namjerna prepreka protiv omaske).
- Skripta ti ispise staru vrijednost i naredbu kojom je vratis.
- Nakon upisa provjeri i **displej kontrolera** prije nego adresu upises u `.env`.
- Krivi registar na tanku s vinom moze promijeniti rezim hladjenja - zato test tank.

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

## Update na Pi-ju (nakon promjene koda)

S racunala (zamijeni korisnika/IP svojima):

```bash
scp gateway/gateway.py gateway/discover_registers.py gateway/.env.example \
    vinarija@raspberrypi.local:~/gateway/
```

Na Pi-ju:

```bash
# 1) nove postavke u .env (stari .env se NE gazi - dodaju se samo novi kljucevi)
nano ~/gateway/.env
#    dodaj: KOMANDE_OMOGUCENE, KOMANDA_MAX_MINUTA, KOMANDA_MAX_POKUSAJA,
#           MODBUS_FUNKCIJA_PISANJE, REG_HY, DJELITELJ_HY,
#           REG_ONOFF, ONOFF_VRIJEDNOST_ON, ONOFF_VRIJEDNOST_OFF
#    (usporedi s .env.example; registre ostavi prazne dok ih ne potvrdis)

# 2) proba bez diranja kontrolera
source ~/gateway/venv/bin/activate
python ~/gateway/gateway.py --jednom --bez-komandi

# 3) restart servisa
sudo systemctl restart vino-gateway
journalctl -u vino-gateway -f
```

U logu na startu mora pisati redak `Komande: ON/OFF=..., setpoint=..., Hy=...`.
Dok registri nisu poznati, tamo stoji `CEKA DISCOVERY` - to je ocekivano.

## Odrzavanje

```bash
sudo systemctl status vino-gateway     # stanje
sudo systemctl restart vino-gateway    # nakon promjene .env
journalctl -u vino-gateway -n 100      # zadnjih 100 redaka
tail -f ~/gateway/gateway.log          # vlastiti log (rotacija 5 MB x 5)

grep KOMANDA ~/gateway/gateway.log     # samo komande (tank, tip, ishod)
```

## Sto jos nije rijeseno

- Adrese `REG_SETPOINT`, `REG_HY`, `REG_ONOFF` i `REG_STATUS` cekaju discovery na
  test tanku. Do tada komande tih tipova stoje `NA_CEKANJU`.
- `ALARM_MINUS` / `ALARM_PLUS` se ne salju kontroleru (i vjerojatno nikad nece -
  to su pragovi upozorenja u aplikaciji).
