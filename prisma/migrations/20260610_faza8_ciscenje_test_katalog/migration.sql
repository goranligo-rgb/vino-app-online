-- Faza 8 korak 3 — ciscenje testnih artikala iz kataloga prije punjenja prave liste.
-- 3 testna promo + 4 testna vina. Nema referenci (promo ulazi/otpisi = 0, vino zaduzenja = 0).

DELETE FROM "PutnikPromoArtikl" WHERE "naziv" IN ('čaša', 'čaša ABCD', 'žuti muškat');

DELETE FROM "PutnikVinoArtikl" WHERE "naziv" IN ('cuvee', 'Graševina2025', 'Sauvignon2025', 'Žuti Muškat');
