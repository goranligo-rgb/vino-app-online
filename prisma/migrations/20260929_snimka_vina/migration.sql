-- SNIMKA VINA - vino u trenutku kad (dio) napusta posudu.
--
-- CISTO ADITIVNA: tri CREATE TYPE, tri CREATE TABLE, osam CREATE INDEX,
-- jedan CHECK i dva FK - sve na NOVIM tablicama. Nema DROP-a, nema ALTER-a
-- nad postojecim tablicama ni tipovima, nijedan zatecen redak se ne cita,
-- ne pise ni ne brise. Jedini postojeci objekt koji se spominje je tip
-- "VrstaRadnje" (samo kao tip stupca).
--
-- ZASTO (odluke vlasnika 29.09.2026., AGENTS.md)
-- ----------------------------------------------
-- Komponenta koja ode u cuvée (razina 2 arhive) cita SAMO snimku. Nova
-- tablica, ne stupci na ArhivaVinaRadnja: ondje je 156 od 254 retka tude
-- vino, a nullable stupci dali bi tri stanja koja se ne razlikuju.
-- Snimka nastaje pri SVAKOM pretoku/filtraciji (i djelomicnom) i SVAKOM
-- izlazu, za svaki izvor, u istoj transakciji i PRIJE ocistiVinoRadnje.
--
-- GOLI STUPCI, BEZ FK: tankId, pretokId, zadatakId, izlazVinaId, arhivaVinaId.
-- Snimka mora prezivjeti brisanje tanka, ponistavanje cina i brisanje arhive
-- (PATCH /api/arhiva) - za razinu 2 ona je jedini zapis. FK postoje samo
-- izmedu triju novih tablica (CASCADE s glave na retke).
--
-- CHECK: tocno jedan od pretokId / zadatakId / izlazVinaId. Prisma CHECK ne
-- vidi, pa ga `migrate diff` nakon primjene nece prijaviti kao drift.

BEGIN;

-- CreateEnum
CREATE TYPE "CinSnimkeVina" AS ENUM ('PRETOK', 'FILTRACIJA', 'FLOTACIJA', 'TALOZENJE', 'PUNJENJE', 'PRODAJA');

-- CreateEnum
CREATE TYPE "PodrijetloSnimke" AS ENUM ('MJERENO', 'PRENESENO', 'BLEND', 'KNJIGA', 'NEMA');

-- CreateTable
CREATE TABLE "SnimkaVina" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "brojTanka" INTEGER,
    "cin" "CinSnimkeVina" NOT NULL,
    "pretokId" TEXT,
    "zadatakId" TEXT,
    "izlazVinaId" TEXT,
    "arhivaVinaId" TEXT,
    "dogodenoAt" TIMESTAMPTZ(6) NOT NULL,
    "litrePrije" DOUBLE PRECISION NOT NULL,
    "litreOtislo" DOUBLE PRECISION NOT NULL,
    "ispraznjen" BOOLEAN NOT NULL,
    "nazivVina" TEXT,
    "sorta" TEXT,
    "godiste" INTEGER,
    "korisnikId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnimkaVina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnimkaVinaPolje" (
    "id" TEXT NOT NULL,
    "snimkaVinaId" TEXT NOT NULL,
    "kljuc" TEXT NOT NULL,
    "vrijednost" DOUBLE PRECISION,
    "podrijetlo" "PodrijetloSnimke" NOT NULL,
    "izmjerenoAt" TIMESTAMPTZ(6),

    CONSTRAINT "SnimkaVinaPolje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnimkaVinaRadnja" (
    "id" TEXT NOT NULL,
    "snimkaVinaId" TEXT NOT NULL,
    "izvornaRadnjaId" TEXT NOT NULL,
    "izvorniTankId" TEXT NOT NULL,
    "izvorniBrojTanka" INTEGER,
    "preparatId" TEXT,
    "preparatNaziv" TEXT,
    "jedinicaNaziv" TEXT,
    "korisnikIme" TEXT,
    "vrsta" "VrstaRadnje" NOT NULL,
    "opis" TEXT,
    "napomena" TEXT,
    "kolicina" DOUBLE PRECISION,
    "jeKvasac" BOOLEAN NOT NULL,
    "udio" DOUBLE PRECISION NOT NULL,
    "dogodenoAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SnimkaVinaRadnja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SnimkaVina_tankId_dogodenoAt_idx" ON "SnimkaVina"("tankId", "dogodenoAt");

-- CreateIndex
CREATE INDEX "SnimkaVina_arhivaVinaId_idx" ON "SnimkaVina"("arhivaVinaId");

-- CreateIndex
CREATE UNIQUE INDEX "SnimkaVina_pretokId_tankId_key" ON "SnimkaVina"("pretokId", "tankId");

-- CreateIndex
CREATE UNIQUE INDEX "SnimkaVina_zadatakId_tankId_key" ON "SnimkaVina"("zadatakId", "tankId");

-- CreateIndex
CREATE UNIQUE INDEX "SnimkaVina_izlazVinaId_tankId_key" ON "SnimkaVina"("izlazVinaId", "tankId");

-- CreateIndex
CREATE UNIQUE INDEX "SnimkaVinaPolje_snimkaVinaId_kljuc_key" ON "SnimkaVinaPolje"("snimkaVinaId", "kljuc");

-- CreateIndex
CREATE INDEX "SnimkaVinaRadnja_izvornaRadnjaId_idx" ON "SnimkaVinaRadnja"("izvornaRadnjaId");

-- CreateIndex
CREATE UNIQUE INDEX "SnimkaVinaRadnja_snimkaVinaId_izvornaRadnjaId_key" ON "SnimkaVinaRadnja"("snimkaVinaId", "izvornaRadnjaId");

-- AddForeignKey
ALTER TABLE "SnimkaVinaPolje" ADD CONSTRAINT "SnimkaVinaPolje_snimkaVinaId_fkey" FOREIGN KEY ("snimkaVinaId") REFERENCES "SnimkaVina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnimkaVinaRadnja" ADD CONSTRAINT "SnimkaVinaRadnja_snimkaVinaId_fkey" FOREIGN KEY ("snimkaVinaId") REFERENCES "SnimkaVina"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tocno jedan cin po snimci.
ALTER TABLE "SnimkaVina" ADD CONSTRAINT "SnimkaVina_jedan_cin_check" CHECK (num_nonnulls("pretokId", "zadatakId", "izlazVinaId") = 1);

COMMIT;
