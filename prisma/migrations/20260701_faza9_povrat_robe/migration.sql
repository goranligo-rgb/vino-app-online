-- Faza 9: POVRAT robe iz vozila u skladiste (putnik se vrati s terena s neprodanom robom).
-- Dvije nove tablice, zrcale ulazne tablice (PutnikVinoZaduzenje / PutnikPromoUlaz).
-- Aditivno: 2 nove tablice + indeksi + FK-ovi. Bez DROP-a, bez ALTER-a postojecih tablica.
-- Nova formula "ostalo u autu":
--   vino:  Sigma zaduzeno - Sigma (prodano + gratis) - Sigma vraceno
--   promo: Sigma zaduzeno - Sigma otpisano           - Sigma vraceno

-- 1) POVRAT VINA putnika u skladiste (izlaz iz zalihe vozila - kao zaduzenje, ali obrnuti smjer)
CREATE TABLE "PutnikVinoPovrat" (
    "id"                TEXT NOT NULL,
    "artiklId"          TEXT NOT NULL,
    "putnikIme"         TEXT NOT NULL,
    "kolicina"          DOUBLE PRECISION NOT NULL,
    "jedinica"          TEXT DEFAULT 'kom',
    "datum"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "primioKorisnikIme" TEXT,
    "napomena"          TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PutnikVinoPovrat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PutnikVinoPovrat_artiklId_idx"  ON "PutnikVinoPovrat"("artiklId");
CREATE INDEX "PutnikVinoPovrat_putnikIme_idx" ON "PutnikVinoPovrat"("putnikIme");
ALTER TABLE "PutnikVinoPovrat" ADD CONSTRAINT "PutnikVinoPovrat_artiklId_fkey"
  FOREIGN KEY ("artiklId") REFERENCES "PutnikVinoArtikl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) POVRAT PROMO materijala putnika u skladiste (kolicina Int, kao PutnikPromoUlaz)
CREATE TABLE "PutnikPromoPovrat" (
    "id"                TEXT NOT NULL,
    "artiklId"          TEXT NOT NULL,
    "putnikIme"         TEXT NOT NULL,
    "kolicina"          INTEGER NOT NULL,
    "datum"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "primioKorisnikIme" TEXT,
    "napomena"          TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PutnikPromoPovrat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PutnikPromoPovrat_artiklId_idx"  ON "PutnikPromoPovrat"("artiklId");
CREATE INDEX "PutnikPromoPovrat_putnikIme_idx" ON "PutnikPromoPovrat"("putnikIme");
ALTER TABLE "PutnikPromoPovrat" ADD CONSTRAINT "PutnikPromoPovrat_artiklId_fkey"
  FOREIGN KEY ("artiklId") REFERENCES "PutnikPromoArtikl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
