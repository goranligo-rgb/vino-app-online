-- CreateEnum
CREATE TYPE "VrstaUnosaBerbe" AS ENUM ('BERBA', 'ZATECENO');

-- CreateEnum
CREATE TYPE "VrstaKretanjaBerbe" AS ENUM ('ULAZ', 'PRETOK', 'FILTRACIJA', 'IZLAZ', 'ISPRAVAK', 'PONISTENJE');

-- CreateTable
CREATE TABLE "Berba" (
    "id" TEXT NOT NULL,
    "vrstaUnosa" "VrstaUnosaBerbe" NOT NULL DEFAULT 'BERBA',
    "datumBerbe" TIMESTAMPTZ(6),
    "godinaBerbe" INTEGER,
    "nazivSorte" TEXT NOT NULL,
    "sortaId" TEXT,
    "kolicinaKgGrozdja" DOUBLE PRECISION,
    "kolicinaLitara" DOUBLE PRECISION NOT NULL,
    "polozaj" TEXT,
    "parcela" TEXT,
    "vinograd" TEXT,
    "oznakaBerbe" TEXT,
    "secer" DOUBLE PRECISION,
    "kiseline" DOUBLE PRECISION,
    "ph" DOUBLE PRECISION,
    "maceracija" BOOLEAN,
    "maceracijaSati" DOUBLE PRECISION,
    "napomena" TEXT,
    "korisnikId" TEXT,
    "prviTankId" TEXT,
    "izvornaPunjenjeStavkaId" TEXT,
    "izvornaArhivaStavkaId" TEXT,
    "ispravljenoAt" TIMESTAMPTZ(6),
    "ispravioKorisnikId" TEXT,
    "razlogIspravka" TEXT,
    "obrisano" BOOLEAN NOT NULL DEFAULT false,
    "obrisanoAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Berba_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BerbaKretanje" (
    "id" TEXT NOT NULL,
    "berbaId" TEXT NOT NULL,
    "izTankId" TEXT,
    "uTankId" TEXT,
    "litre" DOUBLE PRECISION NOT NULL,
    "vrsta" "VrstaKretanjaBerbe" NOT NULL,
    "pretokId" TEXT,
    "zadatakId" TEXT,
    "izlazVinaId" TEXT,
    "punjenjeId" TEXT,
    "dogodenoAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "korisnikId" TEXT,
    "napomena" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BerbaKretanje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Berba_izvornaPunjenjeStavkaId_key" ON "Berba"("izvornaPunjenjeStavkaId");

-- CreateIndex
CREATE UNIQUE INDEX "Berba_izvornaArhivaStavkaId_key" ON "Berba"("izvornaArhivaStavkaId");

-- CreateIndex
CREATE INDEX "Berba_vrstaUnosa_idx" ON "Berba"("vrstaUnosa");

-- CreateIndex
CREATE INDEX "Berba_godinaBerbe_idx" ON "Berba"("godinaBerbe");

-- CreateIndex
CREATE INDEX "Berba_prviTankId_idx" ON "Berba"("prviTankId");

-- CreateIndex
CREATE INDEX "Berba_obrisano_idx" ON "Berba"("obrisano");

-- CreateIndex
CREATE INDEX "BerbaKretanje_berbaId_idx" ON "BerbaKretanje"("berbaId");

-- CreateIndex
CREATE INDEX "BerbaKretanje_berbaId_uTankId_idx" ON "BerbaKretanje"("berbaId", "uTankId");

-- CreateIndex
CREATE INDEX "BerbaKretanje_berbaId_izTankId_idx" ON "BerbaKretanje"("berbaId", "izTankId");

-- CreateIndex
CREATE INDEX "BerbaKretanje_pretokId_idx" ON "BerbaKretanje"("pretokId");

-- CreateIndex
CREATE INDEX "BerbaKretanje_zadatakId_idx" ON "BerbaKretanje"("zadatakId");

-- CreateIndex
CREATE INDEX "BerbaKretanje_dogodenoAt_idx" ON "BerbaKretanje"("dogodenoAt");

-- AddForeignKey
ALTER TABLE "BerbaKretanje" ADD CONSTRAINT "BerbaKretanje_berbaId_fkey" FOREIGN KEY ("berbaId") REFERENCES "Berba"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

