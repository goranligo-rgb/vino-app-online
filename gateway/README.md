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

1. `GET /rest/v1/Tank?modbusAdresa=not.is.null&nadzorHladjenja=is.true` - popis tankova,
   grana, zadana temp, pragovi. Uz to `GET /rest/v1/TankKomanda?status=eq.NA_CEKANJU`.
2. Grana A (`PORT_A`) i grana B (`PORT_B`) obraduju se **paralelno** (dvije dretve),
   a unutar grane tank po tank (RS485 je dijeljena sabirnica). Prvo se procita
   cijela grana, pa se **na istoj dretvi** izvrse komande za tankove te grane.
3. `POST /rest/v1/OcitanjeTemperature` - sva ocitanja ciklusa u jednom zahtjevu.
4. Usporedba stanja s aktivnim alarmima -> otvaranje novih / zatvaranje razrijesenih.
5. `PATCH /rest/v1/TankKomanda` - ishodi komandi.

## Tankovi, grane i portovi

- **Grana A = tankovi 1-20, grana B = tankovi 21-44** (`Tank.grana`). Grana odreduje na
  koju RS485 sabirnicu ide upit; kriva grana = tank se proziva na krivoj zici i javlja
  "nema veze".
- **Portovi su "obrnuti"**: grana A je fizicki na `/dev/ttyUSB1`, grana B na `/dev/ttyUSB0`.
  Zato u `.env` stoji `PORT_A=/dev/ttyUSB1` i `PORT_B=/dev/ttyUSB0`. Redoslijed
  `/dev/ttyUSB*` dodjeljuje Linux po redu prepoznavanja pri bootu, pa nakon svakog
  prespajanja adaptera provjeri `ls -l /dev/serial/by-id/` (stabilna imena po serijskom
  broju - mogu se upisati i izravno u `PORT_A`/`PORT_B`).
- **`Tank.nadzorHladjenja`** je prekidac "gateway proziva ovaj tank". Tank se cita samo
  ako ima `modbusAdresa` **i** `nadzorHladjenja = true`. Tankovi 41-44 fizicki postoje,
  ali nemaju kontroler hladjenja, pa im je `nadzorHladjenja = false` - adresa im ostaje
  zapisana (po konvenciji = broj tanka) da se vidi da je iskljucenje namjerno, a ne
  zaboravljen unos. Kad dobiju kontroler:

  ```sql
  UPDATE "Tank" SET "nadzorHladjenja" = true WHERE "broj" = 42;
  ```

  Isti uvjet koristi i `/dashboard/hladjenje`, da Pi i ekran gledaju isti popis.

## Alarmi

| Tip | Kad se otvori | Kad se zatvori |
|---|---|---|
| `PREVISOKA_TEMP` | temperatura izvan `[zadana - alarmMinus, zadana + alarmPlus]` (poruka kaze je li iznad ili ispod) | prvo ocitanje unutar granica |
| `GRESKA_SONDE` | sonda javlja nemogucu vrijednost / sentinel (ili bit greske ako je `REG_STATUS` konfiguriran) | prvo valjano ocitanje |
| `NEMA_VEZE` | kontroler ne odgovori `OFFLINE_CIKLUSA` (3) ciklusa zaredom | prvi uspjesan odgovor |

Dok je tank offline, alarmi `PREVISOKA_TEMP` i `GRESKA_SONDE` se **ne diraju** - bez podataka
se ne zna jesu li rijeseni.

## Heartbeat - kad stane cijeli gateway

Alarm `NEMA_VEZE` otvara gateway, pa ako gateway ne radi, nitko ga nece ni otvoriti.
Zato aplikacija (`/dashboard/hladjenje`) sama gleda vrijeme **najsvjezijeg ocitanja bilo
kojeg tanka**: ako je starije od 15 min (`HEARTBEAT_PRAG_MIN`), na vrh ekrana ide veliko
crveno upozorenje "GATEWAY NE JAVLJA - podaci nisu svjezi!". Podatke ispod tada treba
citati kao zadnje poznato stanje, a ne kao trenutno.

Prva provjera na Pi-ju: `sudo systemctl status vino-gateway` i `journalctl -u vino-gateway -n 100`.

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
| `HLADJENJE_ON` / `HLADJENJE_OFF` | `REG_SETPOINT` (soft-OFF, vidi nize) | da |
| `ZADANA_TEMP` | `REG_SETPOINT` (0x042D) | da |
| `HY` (diferencijal 0,1-3,0 K, korak 0,1) | `REG_HY` (0x0408, pakiran u gornji bajt) | da |
| `ALARM_MINUS` / `ALARM_PLUS` | - | **ne** - to su pragovi upozorenja u aplikaciji, ne parametri kontrolera |

### Soft-OFF: kako se hladjenje gasi bez ON/OFF registra

Kontroler **nema izlozen Modbus registar za ON/OFF**. (Registar `0x0420` nije prekidac
nego **Modbus adresa samog kontrolera** - upis u njega je prepisao adrese vise kontrolera
odjednom i srusio granu. Vidi "Zabranjeni registri" nize.) Hladjenje se zato gasi
podizanjem set pointa:

| Korak | Tko | Sto se dogodi |
|---|---|---|
| ISKLJUCI | aplikacija | `Tank.zadnjaZadanaTemp = zadanaTemp`, `Tank.zadanaTemp = SOFT_OFF_TEMP` (20,0 C), nastane komanda `HLADJENJE_OFF` |
| | gateway | upise `SEt = 20,0` u `REG_SETPOINT` i procita natrag |
| UKLJUCI | aplikacija | `Tank.zadanaTemp = zadnjaZadanaTemp`, `zadnjaZadanaTemp = NULL`, nastane komanda `HLADJENJE_ON` |
| | gateway | upise tu zadanu u `REG_SETPOINT` |

Pamcenje je namjerno u aplikaciji (u istoj transakciji s komandom), a ne u gatewayu:
gateway ostaje obican izvrsitelj pa ponovni pokusaj upisa ne moze pregaziti zapamcenu
vrijednost. Tank sa `zadanaTemp = 20,0` aplikacija prikazuje kao **hladjenje iskljuceno**
i gateway za njega **ne otvara `PREVISOKA_TEMP`** (ocitanja se i dalje pisu).

> `SOFT_OFF_TEMP` u `.env` i `SOFT_OFF_TEMP` u `lib/tank-komanda.ts` moraju biti isti broj.
> Gornja granica zadane u aplikaciji je zato 19,5 C - 20,0 znaci "iskljuceno".
> Provjeri i da parametar `US` (najveci dozvoljeni set point) na kontroleru dopusta 20,0 C;
> ako ne dopusta, kontroler nece prihvatiti upis i komanda ce zavrsiti kao `NEUSPJELO`.

### Hy je pakiran u gornji bajt

`REG_HY` (0x0408) ne drzi vrijednost izravno: `registar = (Hy * 10) << 8`.
Izmjereno na kontroleru: Hy 2,0 -> 5120, 1,5 -> 3840, 0,5 -> 1280. Pomak je
`HY_POMAK_BITOVA` (8); `0` znaci "bez pakiranja".

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

Potvrdeno na zivom kontroleru (test tank 2, discovery 16.08.2026.):

| Registar | Adresa | Vrijednost |
|---|---|---|
| Sonda P1 (temperatura) | `0x0100` | `/10` (153 = 15,3 C) |
| Set point (`SEt`) | `0x042D` | `/10`, isti registar za citanje i upis |
| Diferencijal (`Hy`) | `0x0408` | **pakiran:** `(Hy * 10) << 8` (2,0 -> 5120) |

- **Ne postoji:** ON/OFF preko Modbusa. Gasi se soft-OFF-om preko set pointa.
- **Nije potvrdeno:** statusni registar (relej hladjenja, greska sonde). Dixell ne
  objavljuje mapu registara za XR-CX seriju javno.

### Zabranjeni registri - `0x0420`

`0x0420` je **Modbus adresa samog kontrolera**. Upis u njega je kod discoveryja prepisao
adrese vise kontrolera odjednom: svi su zavrsili na istoj adresi, prestali se razlikovati
na sabirnici i cijela grana je pala. Popravak je rucni, na svakom kontroleru posebno.

Zato se registri s popisa `REGISTRI_ZABRANJENI` **ne diraju ni za citanje ni za upis**:

| Gdje | Sto radi |
|---|---|
| `procitaj_registar()` / `upisi_registar()` | odbijaju adresu bez ijednog poslanog okvira |
| `Konfig.provjeri()` | servis se ne pokrece ako je takva adresa u `REG_TEMP` / `REG_SETPOINT` / `REG_HY` / `REG_STATUS` |
| `discover_registers.py`, funkcija `jedan()` | preskace je i pri skeniranju raspona |
| `discover_registers.py --upisi` | odbija upis bez obzira na sve zastavice i rucnu potvrdu |

Prazna vrijednost `REGISTRI_ZABRANJENI=` u `.env` **ne prazni** popis nego vraca zadani
`0x0420` - sigurnosna lista se ne smije izgubiti zabunom.

Dok `REG_SETPOINT` / `REG_HY` / `REG_STATUS` u `.env` stoje prazni:

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

**Prvo migracije na bazi, pa tek onda gateway** - novi kod trazi kolonu
`Tank.nadzorHladjenja` i bez nje `GET Tank` vraca gresku (gateway bi radio s zadnjim
zapamcenim popisom tankova i o tome pisao upozorenje svaki ciklus).

Na Pi-ju:

```bash
# 1) nove postavke u .env (stari .env se NE gazi - dodaju se samo novi kljucevi)
nano ~/gateway/.env
#    dodaj/ispravi: REG_SETPOINT=0x042D, REG_HY=0x0408, HY_POMAK_BITOVA=8,
#                   SOFT_OFF_TEMP=20.0, REGISTRI_ZABRANJENI=0x0420
#    PORTOVI: PORT_A=/dev/ttyUSB1, PORT_B=/dev/ttyUSB0  (grane su fizicki obrnute!)
#    obrisi (vise se ne citaju): REG_ONOFF, ONOFF_VRIJEDNOST_ON, ONOFF_VRIJEDNOST_OFF
#    (usporedi s .env.example)

# 2) sintaksa (na Windowsu se ne moze provjeriti - Python je samo ovdje)
source ~/gateway/venv/bin/activate
python -m py_compile ~/gateway/gateway.py ~/gateway/discover_registers.py

# 3) provjeri da su portovi tamo gdje mislis da jesu
ls -l /dev/serial/by-id/

# 4) proba bez diranja kontrolera (cita i pise u bazu, komande ne salje)
python ~/gateway/gateway.py --jednom --bez-komandi

# 5) restart servisa
sudo systemctl restart vino-gateway
journalctl -u vino-gateway -f
```

Nakon probe u koraku 4 u logu mora pisati **40 ocitanja** (44 tanka minus 4 bez
kontrolera). Grana A je popravljena 16.08.2026. (bile su krive Modbus adrese na
kontrolerima), pa se ocekuje da svih 40 odgovori - ako ih odgovori samo ~20, provjeri
jesu li `PORT_A`/`PORT_B` zamijenjeni (grana A je na `/dev/ttyUSB1`).
Ako pojedini tank javlja "nema odgovora" a susjedi rade, prvo provjeri je li mu `grana`
tocna: A = 1-20, B = 21-44.

U logu na startu mora pisati redak `Komande: setpoint=0x042D, Hy=0x0408 (pomak 8 bita)`,
odmah iznad njega `Zabranjeni registri (nikad se ne diraju): 0x0420`, a ispod
`ON/OFF hladjenja ide preko set pointa (soft-OFF na 20.0 C)`.
Ako uz neki registar pise `CEKA DISCOVERY`, adresa nije upisana u `.env`.

## Odrzavanje

```bash
sudo systemctl status vino-gateway     # stanje
sudo systemctl restart vino-gateway    # nakon promjene .env
journalctl -u vino-gateway -n 100      # zadnjih 100 redaka
tail -f ~/gateway/gateway.log          # vlastiti log (rotacija 5 MB x 5)

grep KOMANDA ~/gateway/gateway.log     # samo komande (tank, tip, ishod)
```

## Sto jos nije rijeseno

- `REG_STATUS` (relej hladjenja, bit greske sonde) ceka discovery. Do tada se
  `hladjenjeAktivno` procjenjuje kao `temperatura > zadana`, a za tank u soft-OFF-u
  se pise `false`.
- `ALARM_MINUS` / `ALARM_PLUS` se ne salju kontroleru (i vjerojatno nikad nece -
  to su pragovi upozorenja u aplikaciji).
