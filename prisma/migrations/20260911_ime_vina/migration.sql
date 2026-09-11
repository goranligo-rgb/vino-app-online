-- CreateEnum
CREATE TYPE "IzvorImenaVina" AS ENUM ('RUCNO', 'CUVEE', 'PRETOK', 'PUNJENJE', 'FILTRACIJA', 'BACKFILL');

-- CreateTable
CREATE TABLE "ImeVina" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "odAt" TIMESTAMPTZ(6) NOT NULL,
    "naziv" TEXT,
    "deklariranaSorta" TEXT,
    "izvor" "IzvorImenaVina" NOT NULL DEFAULT 'RUCNO',
    "pretokId" TEXT,
    "punjenjeId" TEXT,
    "korisnikId" TEXT,
    "razlog" TEXT,
    "napomena" TEXT,
    "obrisano" BOOLEAN NOT NULL DEFAULT false,
    "obrisanoAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImeVina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImeVina_tankId_odAt_idx" ON "ImeVina"("tankId", "odAt" DESC);

-- CreateIndex
CREATE INDEX "ImeVina_odAt_idx" ON "ImeVina"("odAt");

-- CreateIndex
CREATE INDEX "ImeVina_pretokId_idx" ON "ImeVina"("pretokId");

