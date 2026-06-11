-- Ruta po putniku: vlasnik-putnik na plan obilaska (analogno PutnikPromoUlaz.putnikIme iz Faze 8).
-- Aditivno: 1 nullable stupac + indeks. Bez DROP-a.
-- Postojeci redovi ostaju NULL (stari/zajednicki auto plan nastavlja raditi).

ALTER TABLE "PutnikPlanObilaska" ADD COLUMN "putnikIme" TEXT;
CREATE INDEX "PutnikPlanObilaska_putnikIme_idx" ON "PutnikPlanObilaska" ("putnikIme");
