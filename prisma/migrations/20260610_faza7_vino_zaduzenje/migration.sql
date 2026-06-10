-- Faza 7: tok robe putnik <-> vinarija
-- Vino kao zaduzena zaliha po putniku + veza prodajne/gratis stavke na katalog vina.
-- Aditivno: 1 novi stupac (nullable), 1 nova tablica, indeksi, FK-ovi. Bez DROP-a.

-- 1) Veza prodajne/gratis stavke na katalog vina (za obracun zalihe po putniku)
ALTER TABLE "PutnikPosjetStavka" ADD COLUMN "artiklId" TEXT;
CREATE INDEX "PutnikPosjetStavka_artiklId_idx" ON "PutnikPosjetStavka"("artiklId");
ALTER TABLE "PutnikPosjetStavka" ADD CONSTRAINT "PutnikPosjetStavka_artiklId_fkey"
  FOREIGN KEY ("artiklId") REFERENCES "PutnikVinoArtikl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Zaduzenje vina putniku (ulaz u zalihu vozila - kao promo ulaz, ali po putniku)
CREATE TABLE "PutnikVinoZaduzenje" (
    "id"              TEXT NOT NULL,
    "artiklId"        TEXT NOT NULL,
    "putnikIme"       TEXT NOT NULL,
    "kolicina"        DOUBLE PRECISION NOT NULL,
    "jedinica"        TEXT DEFAULT 'kom',
    "datum"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unioKorisnikIme" TEXT,
    "napomena"        TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PutnikVinoZaduzenje_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PutnikVinoZaduzenje_artiklId_idx"  ON "PutnikVinoZaduzenje"("artiklId");
CREATE INDEX "PutnikVinoZaduzenje_putnikIme_idx" ON "PutnikVinoZaduzenje"("putnikIme");
ALTER TABLE "PutnikVinoZaduzenje" ADD CONSTRAINT "PutnikVinoZaduzenje_artiklId_fkey"
  FOREIGN KEY ("artiklId") REFERENCES "PutnikVinoArtikl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
