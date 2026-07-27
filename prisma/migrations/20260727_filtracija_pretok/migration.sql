-- Filtracija povlaci pretok vina: zadatak "Filtracija" nosi izlaz iz izvornog
-- tanka i 1..n ulaza u ciljne tankove. Sve se primjenjuje u JEDNOJ transakciji
-- pri izvrsenju zadatka - ili izlaz i svi ulazi, ili nista.
--
-- ADITIVNO: 4 nullable kolone na Zadatak + 1 nova tablica.
-- Bez DROP-a, bez izmjene postojecih kolona, bez diranja podataka.
-- Postojeci zadaci ostaju netaknuti (sve nove kolone NULL).
--
-- TIP: DOUBLE PRECISION, jer je Tank."kolicinaVinaUTanku" Prisma Float bez
-- @db. atributa (schema.prisma:34) -> DOUBLE PRECISION. Potvrda: PutnikVinoPovrat
-- .kolicina je Float u shemi i DOUBLE PRECISION u 20260701_faza9_povrat_robe.
-- Decimal se u ovom projektu koristi samo eksplicitno (npr. Tank.zadanaTemp
-- Decimal(4,1)). Litre nigdje nisu Decimal, pa se tipovi ovdje poklapaju.
-- Zaokruzivanje se ne oslanja na tip: sve provjere u kodu idu nad cijelim
-- mililitrima (Math.round(litre * 1000)), pa "zbroj stavki <= kolicinaIzlaz"
-- ne moze lazno pasti zbog doublea.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Nova polja na postojecem Zadatak
-- ---------------------------------------------------------------------------
--    kolicinaIzlaz    = litre koje su izasle iz izvornog tanka (unosi korisnik)
--    gubitakLitara    = kalo; RACUNA SERVER kao (kolicinaIzlaz - zbroj stavki),
--                       u mililitrima pa natrag u litre. Nikad se ne unosi rucno.
--    snapshotJson     = { prije: {...}, poslije: {...} } za SVE ukljucene tankove:
--                       kolicina, sorta, nazivVina, godiste, udjeliSorti[],
--                       blendIzvori[]. "prije" sluzi za vracanje, "poslije" za
--                       provjeru da stanje nije mijenjano izvan zadatka - rucna
--                       izmjena kroz PUT /api/tank ne ostavlja nikakav trag pa
--                       je to jedini nacin da ju uhvatimo. Isti obrazac vec
--                       postoji: PunjenjeTanka."prethodniSastavJson".
--    vezaniCiljTankId = na koji CILJNI tank ide vezani (djeciji) zadatak.
--                       Za sve ostale vrste ostaje NULL i ponasanje je
--                       nepromijenjeno (dijete ide na tankId roditelja).
ALTER TABLE "Zadatak" ADD COLUMN "kolicinaIzlaz"    DOUBLE PRECISION;
ALTER TABLE "Zadatak" ADD COLUMN "gubitakLitara"    DOUBLE PRECISION;
ALTER TABLE "Zadatak" ADD COLUMN "snapshotJson"     JSONB;
ALTER TABLE "Zadatak" ADD COLUMN "vezaniCiljTankId" TEXT;

-- Dopusta NULL (svi postojeci zadaci), ali zabranjuje besmislice na novima.
ALTER TABLE "Zadatak" ADD CONSTRAINT "Zadatak_kolicinaIzlaz_check"
    CHECK ("kolicinaIzlaz" IS NULL OR "kolicinaIzlaz" > 0);
ALTER TABLE "Zadatak" ADD CONSTRAINT "Zadatak_gubitakLitara_check"
    CHECK ("gubitakLitara" IS NULL OR "gubitakLitara" >= 0);

CREATE INDEX "Zadatak_vezaniCiljTankId_idx" ON "Zadatak"("vezaniCiljTankId");

-- SET NULL: brisanje tanka ne smije srusiti zadatak; veza se samo raskine.
ALTER TABLE "Zadatak" ADD CONSTRAINT "Zadatak_vezaniCiljTankId_fkey"
    FOREIGN KEY ("vezaniCiljTankId") REFERENCES "Tank"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Stavke filtracije: ciljni tank + kolicina koja u njega ulazi
-- ---------------------------------------------------------------------------
CREATE TABLE "ZadatakTankStavka" (
    "id"         TEXT NOT NULL,
    "zadatakId"  TEXT NOT NULL,
    "ciljTankId" TEXT NOT NULL,
    "kolicina"   DOUBLE PRECISION NOT NULL,
    "redoslijed" INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZadatakTankStavka_pkey" PRIMARY KEY ("id"),
    -- Stavka s nulom ili minusom nije stavka. Baza to odbija, ne samo kod.
    CONSTRAINT "ZadatakTankStavka_kolicina_check" CHECK ("kolicina" > 0)
);

CREATE INDEX "ZadatakTankStavka_zadatakId_idx"
    ON "ZadatakTankStavka"("zadatakId");
CREATE INDEX "ZadatakTankStavka_ciljTankId_idx"
    ON "ZadatakTankStavka"("ciljTankId");

-- Isti ciljni tank ne smije se pojaviti dvaput u istom zadatku.
-- Na razini baze, da ni rucni INSERT ne moze prosaptati duplikat.
CREATE UNIQUE INDEX "ZadatakTankStavka_zadatakId_ciljTankId_key"
    ON "ZadatakTankStavka"("zadatakId", "ciljTankId");

-- CASCADE: stavke zive i umiru sa zadatkom.
ALTER TABLE "ZadatakTankStavka" ADD CONSTRAINT "ZadatakTankStavka_zadatakId_fkey"
    FOREIGN KEY ("zadatakId")  REFERENCES "Zadatak"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT: tank koji je bio cilj filtracije ne smije nestati ispod zapisa.
-- Posljedica na DELETE /api/tank (route.ts:155-290): tank koji je SAMO cilj
-- danas nije na popisu blokatora (:213-236), pa bi pao na P2003 i korisnik bi
-- dobio genericku poruku s :277-285. U istoj fazi se u taj popis dodaje
-- brojac "filtracije u ovaj tank" da poruka bude konkretna.
ALTER TABLE "ZadatakTankStavka" ADD CONSTRAINT "ZadatakTankStavka_ciljTankId_fkey"
    FOREIGN KEY ("ciljTankId") REFERENCES "Tank"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
