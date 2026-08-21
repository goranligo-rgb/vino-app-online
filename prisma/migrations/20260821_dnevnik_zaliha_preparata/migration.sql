-- Dnevnik zaliha preparata: svaka promjena stanja ostavlja zapis.
--
-- ADITIVNO: nove kolone s defaultima + prijenos postojece potrosnje iz Radnja
-- + jedan zapis pocetnog stanja po preparatu. Nijedna postojeca vrijednost u
-- PreparationStockEntry se ne mijenja, tablica Radnja se ne dira.
--
-- Cilj: SUM("promjenaSkladisna") po preparatu == Preparation."stanjeNaSkladistu".
--
-- Zatecena povijest (8 ulaza + 22 izlaza iz Radnja) nosi promjenaSkladisna = 0
-- i uKnjizi = false: vidi se u prometu, ne ulazi u zbroj. Rekonstrukcija se ne
-- radi jer pretvorba u skladisne jedinice zivi u TypeScriptu (convertValue), a
-- stanje se ionako vec razislo zbog rucnih prepisivanja kroz PUT. Cijeli
-- zateceni saldo nosi zapis POCETNO_STANJE (51 redak).
--
-- Ukupno nastaje 73 nova retka, pa sve ide u jednoj transakciji.

BEGIN;

-- 1. Tip zapisa. Svi zatecni redci nastali su iz /api/preparat/ulaz -> ULAZ.
--    OTPIS zasad postoji samo kao vrijednost enuma; nema rute ni ekrana.
CREATE TYPE "TipZaliheZapisa" AS ENUM
  ('ULAZ', 'IZLAZ', 'KOREKCIJA', 'POCETNO_STANJE', 'OTPIS');

ALTER TABLE "PreparationStockEntry"
  ADD COLUMN "tip" "TipZaliheZapisa" NOT NULL DEFAULT 'ULAZ';

-- 2. Knjizeni iznos: s predznakom, uvijek u skladisnoj jedinici preparata.
--    Stanje se racuna iskljucivo iz ove kolone, nikad iz "kolicina".
ALTER TABLE "PreparationStockEntry"
  ADD COLUMN "promjenaSkladisna" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 3. Tko je proveo promjenu.
ALTER TABLE "PreparationStockEntry"
  ADD COLUMN "korisnikId" TEXT;

ALTER TABLE "PreparationStockEntry"
  ADD CONSTRAINT "PreparationStockEntry_korisnikId_fkey"
  FOREIGN KEY ("korisnikId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PreparationStockEntry_korisnikId_idx"
  ON "PreparationStockEntry"("korisnikId");

-- 4. Veza na radnju: izlaz nastaje izvrsenjem zadatka, a radnja nosi tank.
ALTER TABLE "PreparationStockEntry"
  ADD COLUMN "radnjaId" TEXT;

ALTER TABLE "PreparationStockEntry"
  ADD CONSTRAINT "PreparationStockEntry_radnjaId_fkey"
  FOREIGN KEY ("radnjaId") REFERENCES "Radnja"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PreparationStockEntry_radnjaId_idx"
  ON "PreparationStockEntry"("radnjaId");

--    Jedan redak dnevnika po radnji mora vrijediti trajno, ne samo tijekom
--    migracije. Parcijalni indeks jer je radnjaId NULL na svemu osim izlaza.
CREATE UNIQUE INDEX "PreparationStockEntry_radnjaId_key"
  ON "PreparationStockEntry"("radnjaId")
  WHERE "radnjaId" IS NOT NULL;

-- 5. Kod korekcije i izlaza korisnik ne bira jedinicu; Radnja."jedinicaId" je
--    k tome vec nullable. Zapis se mora upisati i bez jedinice, inace bi se
--    stanje promijenilo bez traga.
ALTER TABLE "PreparationStockEntry"
  ALTER COLUMN "unitId" DROP NOT NULL;

-- 6. Oznaka "prije uvodenja knjige".
--    Default je true (tako stoji i u schema.prisma), pa se svi ZATECENI redci
--    odmah prebacuju na false. Mora se izvrsiti PRIJE koraka 7 i 8.
ALTER TABLE "PreparationStockEntry"
  ADD COLUMN "uKnjizi" BOOLEAN NOT NULL DEFAULT true;

UPDATE "PreparationStockEntry" SET "uKnjizi" = false;

-- 7. Prijenos postojece potrosnje iz Radnja u dnevnik.
--    Bez ovoga bi promet, nakon prelaska na jedan izvor, prikazao samo ulaze -
--    kao da se nikad nista nije potrosilo.
--    Filtar je namjerno identican onome koji /api/preparat/promet danas koristi
--    (preparatId i kolicina nisu null, bez filtra po "vrsta"), da se povijest
--    prenese u cijelosti. NOT EXISTS cini korak ponovljivim.
INSERT INTO "PreparationStockEntry" (
  "id", "preparationId", "kolicina", "promjenaSkladisna", "unitId",
  "tip", "uKnjizi", "datum", "createdAt", "napomena", "korisnikId", "radnjaId"
)
SELECT
  gen_random_uuid()::text,
  r."preparatId",
  r."kolicina",
  0,
  r."jedinicaId",
  'IZLAZ',
  false,
  r."createdAt",
  r."createdAt",
  r."napomena",
  r."korisnikId",
  r."id"
FROM "Radnja" r
WHERE r."preparatId" IS NOT NULL
  AND r."kolicina" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "PreparationStockEntry" e WHERE e."radnjaId" = r."id"
  );

-- 8. Pocetno stanje: jedan zapis po preparatu sa stanjem razlicitim od nule.
--    Jedini redak koji stvarno ulazi u zbroj (uKnjizi = true).
--    gen_random_uuid() je ugraden u PostgreSQL 13+ (Supabase je noviji).
INSERT INTO "PreparationStockEntry" (
  "id", "preparationId", "kolicina", "promjenaSkladisna", "unitId",
  "tip", "uKnjizi", "datum", "createdAt", "napomena"
)
SELECT
  gen_random_uuid()::text,
  p."id",
  ABS(COALESCE(p."stanjeNaSkladistu", 0)),
  COALESCE(p."stanjeNaSkladistu", 0),
  COALESCE(p."skladisnaJedinicaId", p."unitId"),
  'POCETNO_STANJE',
  true,
  NOW(),
  NOW(),
  'Pocetno stanje pri uvodenju dnevnika zaliha'
FROM "Preparation" p
WHERE COALESCE(p."stanjeNaSkladistu", 0) <> 0;

-- 9. Zapis izvan knjige ne smije nositi iznos. Namjerno na kraju: provjerava se
--    protiv stvarnih podataka, ukljucujuci sve upravo umetnute redke.
--    Prisma ne modelira CHECK ogranicenja - ovo postoji samo u bazi.
ALTER TABLE "PreparationStockEntry"
  ADD CONSTRAINT "PreparationStockEntry_uKnjizi_chk"
  CHECK ("uKnjizi" = true OR "promjenaSkladisna" = 0);

COMMIT;
