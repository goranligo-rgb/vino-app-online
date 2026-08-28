-- DNEVNIK FERMENTACIJE - granica pocetka i kraja.
--
-- CISTO ADITIVNA: CREATE TYPE + ALTER TABLE ADD COLUMN + CREATE TABLE + indeksi.
-- Nijedan postojeci stupac se ne mijenja, nijedan strani kljuc se ne dira,
-- nijedan redak se ne pise ni ne brise. Nema DROP-a.
--
-- Fermentacija NEMA stranih kljuceva. `tankId`, `kvasacZadatakId`,
-- `kvasacPreparatId` i korisnici su goli stupci - isti obrazac koji vec koriste
-- Berba i ArhivaVina.tankId. Dnevnik ne smije nestati kad nestane tank ili
-- zadatak (zadatak se pri arhiviranju stvarno brise). Bez FK nema kroz sto
-- kaskadirati, i tudje tablice ostaju netaknute.

-- CreateEnum
CREATE TYPE "IzvorPocetkaFermentacije" AS ENUM ('RUCNO', 'IZ_ZADATKA');

-- AlterTable
-- Sluzi SAMO za suzavanje popisa pri otvaranju fermentacije (katalog ima 76
-- preparata, kvasaca dvadesetak). NOT NULL DEFAULT false ne prepisuje tablicu
-- (Postgres 11+ pamti default u katalogu), a stari kod stupac ne poznaje pa ga
-- ni ne pise - svaki novi preparat dobije false dok ga netko ne oznaci.
ALTER TABLE "Preparation" ADD COLUMN     "jeKvasac" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Fermentacija" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "pocetakAt" TIMESTAMPTZ(6) NOT NULL,
    "krajAt" TIMESTAMPTZ(6),
    "pocetakIzvor" "IzvorPocetkaFermentacije" NOT NULL DEFAULT 'RUCNO',
    "kvasacZadatakId" TEXT,
    "kvasacPreparatId" TEXT,
    "kvasacNaziv" TEXT,
    "napomena" TEXT,
    "korisnikId" TEXT,
    "zatvorioKorisnikId" TEXT,
    "obrisano" BOOLEAN NOT NULL DEFAULT false,
    "obrisanoAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fermentacija_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fermentacija_tankId_pocetakAt_idx" ON "Fermentacija"("tankId", "pocetakAt" DESC);

-- CreateIndex
CREATE INDEX "Fermentacija_pocetakAt_idx" ON "Fermentacija"("pocetakAt");

-- CreateIndex
CREATE INDEX "Fermentacija_kvasacZadatakId_idx" ON "Fermentacija"("kvasacZadatakId");

-- NAMJERNO NEMA jedinstvenog indeksa "jedna otvorena fermentacija po tanku".
-- Vino koje je iz T11 otislo u T26 ostavlja T11 slobodnim za novi most, dok mu
-- je fermentacija jos otvorena s tankId = T11. Takav bi indeks blokirao
-- ispravan slucaj, a upravo je taj slucaj razlog zasto fermentacija prati vino.

-- Jedino ogranicenje koje ima smisla: kraj ne moze biti prije pocetka.
-- Prisma CHECK ogranicenja ne modelira, ali ih ni ne dira: `migrate diff` nad
-- ovom bazom vraca prazno iako u njoj vec stoje cetiri CHECK-a (provjereno).
ALTER TABLE "Fermentacija" ADD CONSTRAINT "Fermentacija_kraj_chk"
    CHECK ("krajAt" IS NULL OR "krajAt" >= "pocetakAt");
