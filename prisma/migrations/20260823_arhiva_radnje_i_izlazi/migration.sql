-- Radnje i izlazi vina dobivaju svoje arhivske tablice.
--
-- KONTEKST: arhiviranje tanka dosad je u arhivu prenosilo mjerenja, zadatke,
-- dokumente i udjele sorti. `Radnja` se NIJE prenosila (ostajala je na tanku, a
-- `zadatakId` bi joj otisao na NULL jer se zadaci brisu), a `IzlazVina` se
-- brisala bez traga. Posljedica na produkciji: tank 16 ima radnju
-- "Prodano rinfuza 1.000 L" od 19.08.2026, a izlaza vina za taj tank ima nula.
-- Prodaja bez zapisa.
--
-- SAMO KOPIRANJE, BEZ BRISANJA. Kod koji ove tablice puni NECE brisati
-- originale. Razlog: POST /api/pretok/undo ne vraca arhivu — vraca tankove po
-- snapshotovima i brise pretok, a ArhivaVina ne dira. Dok je tako, svako novo
-- brisanje originala je novi tihi gubitak. Brisanje originala je uvjetovano
-- time da ponistavanje prvo nauci vracati arhivu.
--
-- PAR (radnjaId, zadatakId) ZIVI OVDJE, ne u snapshotu pretoka: par pripada
-- vinu, a ne pretoku, pa mora prezivjeti i brisanje pretoka. Zato
-- `izvornaRadnjaId` i `izvorniZadatakId` stoje na ArhivaVinaRadnja.
--
-- ADITIVNO: dvije nove tablice, pet indeksa, dva strana kljuca prema
-- ArhivaVina. Nijedan DROP, nijedna izmjena postojece tablice, nijedan dodir
-- postojecih podataka.
--
-- SIGURNOST NA PRODUKCIJI (berba je u tijeku): CREATE TABLE i CREATE INDEX nad
-- praznim tablicama su upis u katalog. Ne skeniraju "Radnja" ni "IzlazVina", ne
-- uzimaju bravu nad njima i ne prekidaju nijedan upit u tijeku. FK prema
-- ArhivaVina uzima kratku bravu samo nad novim (praznim) tablicama.
--
-- VEZA: pooler na portu 5432 = session mode, DDL prolazi normalno.
--       (6543 je transaction mode i za DDL se ne koristi.)

BEGIN;

-- CreateTable
CREATE TABLE "ArhivaVinaRadnja" (
    "id" TEXT NOT NULL,
    "arhivaVinaId" TEXT NOT NULL,
    "izvornaRadnjaId" TEXT,
    "izvorniZadatakId" TEXT,
    "tankId" TEXT,
    "vrsta" "VrstaRadnje" NOT NULL,
    "opis" TEXT,
    "napomena" TEXT,
    "preparatId" TEXT,
    "preparatNaziv" TEXT,
    "jedinicaId" TEXT,
    "jedinicaNaziv" TEXT,
    "kolicina" DOUBLE PRECISION,
    "korisnikId" TEXT,
    "korisnikIme" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "arhiviranoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArhivaVinaRadnja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArhivaVinaIzlaz" (
    "id" TEXT NOT NULL,
    "arhivaVinaId" TEXT NOT NULL,
    "izvorniIzlazId" UUID,
    "tankId" TEXT,
    "tip" "TipIzlazaVina" NOT NULL,
    "datum" TIMESTAMPTZ(6) NOT NULL,
    "kolicinaLitara" DOUBLE PRECISION NOT NULL,
    "brojBoca" INTEGER,
    "volumenBoce" DOUBLE PRECISION,
    "napomena" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "arhiviranoAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArhivaVinaIzlaz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArhivaVinaRadnja_arhivaVinaId_idx" ON "ArhivaVinaRadnja"("arhivaVinaId");

-- CreateIndex
CREATE INDEX "ArhivaVinaRadnja_izvornaRadnjaId_idx" ON "ArhivaVinaRadnja"("izvornaRadnjaId");

-- CreateIndex
CREATE INDEX "ArhivaVinaRadnja_izvorniZadatakId_idx" ON "ArhivaVinaRadnja"("izvorniZadatakId");

-- CreateIndex
CREATE INDEX "ArhivaVinaIzlaz_arhivaVinaId_idx" ON "ArhivaVinaIzlaz"("arhivaVinaId");

-- CreateIndex
CREATE INDEX "ArhivaVinaIzlaz_izvorniIzlazId_idx" ON "ArhivaVinaIzlaz"("izvorniIzlazId");

-- AddForeignKey
ALTER TABLE "ArhivaVinaRadnja" ADD CONSTRAINT "ArhivaVinaRadnja_arhivaVinaId_fkey" FOREIGN KEY ("arhivaVinaId") REFERENCES "ArhivaVina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArhivaVinaIzlaz" ADD CONSTRAINT "ArhivaVinaIzlaz_arhivaVinaId_fkey" FOREIGN KEY ("arhivaVinaId") REFERENCES "ArhivaVina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
