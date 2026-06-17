-- Posjet slike: foto prije/poslije za posjet (privatni Supabase bucket).
-- U bazi se sprema SAMO putanja u bucketu (ne URL); datoteka zivi u Storageu.
-- Aditivno: 1 novi enum, 1 nova tablica, indeksi, FK. Bez DROP-a.

-- 1) Tip slike: stanje police PRIJE i POSLIJE posjeta
CREATE TYPE "PutnikPosjetSlikaTip" AS ENUM ('PRIJE', 'POSLIJE');

-- 2) Slika vezana na posjet (brise se kaskadno s posjetom)
CREATE TABLE "PutnikPosjetSlika" (
    "id"           TEXT NOT NULL,
    "posjetId"     TEXT NOT NULL,
    "tip"          "PutnikPosjetSlikaTip" NOT NULL,
    "putanja"      TEXT NOT NULL,
    "mimeType"     TEXT,
    "velicinaByte" INTEGER,
    "putnikIme"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PutnikPosjetSlika_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PutnikPosjetSlika_posjetId_idx"     ON "PutnikPosjetSlika"("posjetId");
CREATE INDEX "PutnikPosjetSlika_posjetId_tip_idx" ON "PutnikPosjetSlika"("posjetId", "tip");
ALTER TABLE "PutnikPosjetSlika" ADD CONSTRAINT "PutnikPosjetSlika_posjetId_fkey"
  FOREIGN KEY ("posjetId") REFERENCES "PutnikPosjet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
