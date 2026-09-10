-- VINO RADNJA - radnja koja putuje s vinom.
--
-- CISTO ADITIVNA: jedan CREATE TABLE, tri CREATE INDEX, jedan FK na Tank.
-- Nema DROP-a, nema ALTER-a nad postojecim tablicama, nijedan zatecen redak
-- se ne cita, ne pise ni ne brise. `Radnja` ostaje netaknuta i nakon ovoga je
-- i dalje jedini zapis o cinu; ova je tablica IZVEDENA.
--
-- ZASTO
-- -----
-- `Radnja.tankId` opisuje POSUDU: gdje je netko stajao kad je nesto dodao.
-- Cim vino pretoci, zapis ostaje iza njega. Tank 5 danas ima vino koje je
-- fermentiralo s pet kvasaca iz cetiri druga tanka, a njegova stranica ne
-- pokazuje nijedan - jer nijedna od tih radnji nije izvedena u T5.
--
-- Uzor je ArhivaVinaRadnja, koja isti problem vec rjesava za arhivu: nazivi se
-- PREPISUJU (preparatNaziv, jedinicaNaziv, korisnikIme), ne citaju kroz
-- relacije, pa preimenovanje ili gasenje preparata ne mijenja ono sto na
-- zapisu vec pise.
--
-- KLJUC DEDUPLIKACIJE
-- -------------------
-- UNIQUE (tankId, izvornaRadnjaId). Cuvée od pet izvora moze istu izvornu
-- radnju dobiti kroz vise njih; duplikat se odbacuje PO TOM KLJUCU, ne po
-- sadrzaju (dva razlicita dodavanja istog preparata istog dana su dva zapisa,
-- ne jedan), a `udio` se pritom ZBRAJA.
--
-- `izvornaRadnjaId` je bez stranog kljuca, namjerno: radnja se smije obrisati
-- (brisanje punjenja, ponistavanje zadatka), a zapis o tome sto je vino dobilo
-- mora prezivjeti. Isti obrazac kao ArhivaVinaRadnja.izvornaRadnjaId,
-- Berba.prviTankId i ArhivaVina.tankId.
--
-- UDIO
-- ----
-- `udio` (0..1) je koliki dio DANASNJEG volumena tanka potjece iz te radnje.
-- Racuna se iz litara koje su stvarno dosle, po knjizi kretanja - ne iz
-- postotaka blenda, koji su u zatecenoj bazi mjestimicno krivi. DEFAULT 1 jer
-- radnja upisana u tanku vrijedi za sve vino koje je tada u njemu.

-- CreateTable
CREATE TABLE "VinoRadnja" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
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
    "jeKvasac" BOOLEAN NOT NULL DEFAULT false,
    "udio" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "dogodenoAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VinoRadnja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VinoRadnja_tankId_dogodenoAt_idx" ON "VinoRadnja"("tankId", "dogodenoAt");

-- CreateIndex
CREATE INDEX "VinoRadnja_izvornaRadnjaId_idx" ON "VinoRadnja"("izvornaRadnjaId");

-- CreateIndex
CREATE UNIQUE INDEX "VinoRadnja_tankId_izvornaRadnjaId_key" ON "VinoRadnja"("tankId", "izvornaRadnjaId");

-- AddForeignKey
ALTER TABLE "VinoRadnja" ADD CONSTRAINT "VinoRadnja_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
