-- Faza 8: promo zaliha po putniku (analogno PutnikVinoZaduzenje iz Faze 7)
-- Aditivno: 1 nullable stupac + indeks na postojecoj tablici. Bez DROP-a.

ALTER TABLE "PutnikPromoUlaz" ADD COLUMN "putnikIme" TEXT;
CREATE INDEX "PutnikPromoUlaz_putnikIme_idx" ON "PutnikPromoUlaz"("putnikIme");
