-- Diferencijal hladjenja (Hy) po tanku - parametar Dixell XR75CX-a.
-- ADITIVNO: jedna nova nullable kolona na postojecem Tank-u.
-- Nista se ne mijenja, ne brise i ne dobiva default -> postojeci redovi ostaju NULL.
--
-- Za novi tip komande "HY" migracija NIJE potrebna:
-- TankKomanda."tip" je obican TEXT bez CHECK-a i bez enum tipa (vidi
-- 20260709_tank_komanda), a TankKomanda."vrijednost" je DECIMAL(4,1) pa raspon
-- 0,3-3,0 stane bez izmjene.

ALTER TABLE "Tank" ADD COLUMN "hy" DECIMAL(3,1);
