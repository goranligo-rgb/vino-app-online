-- Razlog posjeta: slobodan tekst (zasto je putnik dosao - redovni obilazak,
-- reklamacija, dogovor...). Ide na VRH posjet forme; `biljeska` (zabiljeske)
-- ostaje na dnu i ne dira se.
-- Aditivno: 1 nova nullable kolona. Bez DROP-a, bez diranja postojecih podataka.

ALTER TABLE "PutnikPosjet" ADD COLUMN "razlogPosjeta" TEXT;
