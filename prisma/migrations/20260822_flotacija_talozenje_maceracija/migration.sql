-- Flotacija i talozenje kao nove vrste zadatka, uz maceraciju kao biljesku.
--
-- KONTEKST: flotacija i talozenje rade se na MOSTU, isti dan nakon berbe ili
-- dan-dva kasnije. Filtracija je na VINU, dva mjeseca kasnije. Nemaju veze
-- jedna s drugom i nikad se ne mijesaju. Dijele isti mehanizam prijenosa
-- (ZadatakTankStavka + lib/filtracija.ts) samo zato sto su fizicki ista
-- radnja: tekucina iz tanka A u tank B, talog ostaje. U sucelju su tri
-- odvojene stavke.
--
-- ADITIVNO: 4 nove vrijednosti enuma + 2 nullable kolone na Zadatak.
-- Bez DROP-a, bez izmjene postojecih kolona, bez diranja podataka.
-- Postojeci zadaci ostaju netaknuti (obje nove kolone NULL).
--
-- NAMJERNO BEZ BEGIN/COMMIT, za razliku od ostalih migracija u ovom repou.
-- Razlog: ALTER TYPE ... ADD VALUE se na PostgreSQL-u < 12 uopce ne smije
-- izvrsiti unutar transakcije, a na 12+ smije, ali se nova vrijednost ne smije
-- KORISTITI u istoj transakciji. Ova migracija samo dodaje i nista ne koristi,
-- pa bi prosla i omotana - ali nema razloga uzimati taj rizik za sest redaka.
-- Umjesto transakcije, svaki je redak idempotentan (IF NOT EXISTS), pa se
-- datoteka smije ponoviti ako stane na pola.
--
-- SIGURNOST NA PRODUKCIJI (berba je u tijeku):
-- ADD VALUE je operacija samo nad katalogom - ne prepisuje tablice, ne skenira
-- retke, ne uzima bravu nad "Zadatak" ni "Radnja". ADD COLUMN bez DEFAULT-a je
-- takoder samo upis u katalog. Oboje traje milisekunde bez obzira na broj
-- redaka i ne prekida nijedan upit u tijeku.
--
-- VEZA: pooler na portu 5432 = session mode, DDL prolazi normalno.
--       (6543 je transaction mode i za DDL se ne koristi.)
--
-- NEPOVRATNO: PostgreSQL nema DROP VALUE. Jednom dodana vrijednost enuma ne
-- moze se maknuti bez rekreiranja cijelog tipa i prepisivanja svih stupaca
-- koji ga koriste. Imena su zato potvrdena prije primjene.

-- ---------------------------------------------------------------------------
-- 1) Nove vrste zadatka i radnje
-- ---------------------------------------------------------------------------
-- Bez dijakritike, po zatecenoj konvenciji enuma (MIJESANJE, a ne s kvackom).
-- Vrijednosti se dodaju na kraj tipa; provjereno je da se nigdje u kodu ne radi
-- ORDER BY po "vrsta", pa redoslijed nije bitan.
--
-- Obje vrste ulaze i u VrstaRadnje jer izvrsenje prijenosa upisuje Radnja s
-- vrstom preslikanom iz zadatka (lib/filtracija.ts:1120).

ALTER TYPE "VrstaZadatka" ADD VALUE IF NOT EXISTS 'FLOTACIJA';
ALTER TYPE "VrstaZadatka" ADD VALUE IF NOT EXISTS 'TALOZENJE';

ALTER TYPE "VrstaRadnje"  ADD VALUE IF NOT EXISTS 'FLOTACIJA';
ALTER TYPE "VrstaRadnje"  ADD VALUE IF NOT EXISTS 'TALOZENJE';

-- ---------------------------------------------------------------------------
-- 2) Maceracija - biljeska na zadatku
-- ---------------------------------------------------------------------------
-- SEMANTIKA POLJA "maceracija" - tri stanja, ne dva:
--
--   NULL   = nije se pitalo. Tako ostaju SVI zateceni zadaci, i tako ostaju
--            sve vrste koje maceraciju uopce ne prikazuju (filtracija,
--            dodavanje, pretok...).
--   false  = pitalo se, izricito NIJE bilo maceracije.
--   true   = bilo je maceracije.
--
-- Razlika NULL/false je nosiva, ne slucajna: "ne znam" i "znam da nije" nisu
-- isto. Zato je kolona nullable BEZ DEFAULT-a - da postojeci retci ne dobiju
-- lazno "nije bilo maceracije".
--
-- OBAVEZA FORME: nedirnuta kvacica se salje kao NULL, NIKAD kao false. false
-- nastaje samo ako je korisnik kvacicu svjesno ostavio praznom na zadatku koji
-- maceraciju prikazuje. Ovo je jedino mjesto gdje se ta obveza moze zapisati
-- na razini baze, pa neka stoji ovdje.
--
--   maceracijaOpis = slobodan tekst, npr. "12 sati".
--
-- CISTA BILJESKA. Ne ulazi ni u jedan izracun: ni u kalo, ni u sastav, ni u
-- ponderirano mjerenje, ni u snapshot za ponistavanje.
--
-- Vidljivo SAMO na zadacima vrste FLOTACIJA i TALOZENJE. Filtracija ta polja
-- nikad ne prikazuje - ona je na vinu dva mjeseca kasnije i s maceracijom nema
-- veze. To ogranicenje je u sucelju, ne u bazi: kolone su na "Zadatak" jer je
-- to jedna tablica za sve vrste, a uvjetovanje po vrsti na razini baze bi samo
-- otezalo buduce izmjene bez ikakve dobiti.
--
-- BEZ CHECK OGRANICENJA, namjerno. Napetiji CHECK (npr. "opis ne smije
-- postojati bez kvacice") mogao bi odbiti legitiman PUT dok korisnik uredjuje
-- zadatak - upise tekst pa makne kvacicu, ili obrnuto. Za polje koje ni na sto
-- ne utjece to je cijena bez pokrica.

ALTER TABLE "Zadatak" ADD COLUMN IF NOT EXISTS "maceracija"     BOOLEAN;
ALTER TABLE "Zadatak" ADD COLUMN IF NOT EXISTS "maceracijaOpis" TEXT;
