-- Ispravak popisa tankova i podjele na grane (fizicka istina u podrumu).
--
-- 1) Tankovi 19, 23, 24 i 35 fizicki postoje, ali su pri unosu bili preskoceni.
--    U bazi je do sada bilo 40 tankova (1-18, 20-22, 25-34, 36-44).
--    PROVJERITI: kapacitet i tip su postavljeni na najcesce vrijednosti u pogonu
--    (3900 L, "zatvoreni tank") jer stvarni podaci nisu poznati - svi susjedni
--    tankovi (18, 20, 22, 25, 34, 36) su upravo takvi. Ako u podrumu nije tako,
--    ispravi jednim UPDATE-om, npr.:
--      UPDATE "Tank" SET "kapacitet" = 5000, "tip" = 'zatvoreni tank' WHERE "broj" = 19;
--    Ostalo je standardno kao kod ostalih: zadana 16,0 C, pragovi alarma 2,0 C
--    (DB default), kolicina vina 0, modbusAdresa = broj tanka.
--
-- 2) Grane po fizickoj istini: grana A = tankovi 1-20, grana B = 21-44.
--    Do sada je u bazi pisalo A = 1-22, B = 25-44 -> tankovi 21 i 22 se sele u B.
--    Grana odreduje na koji serijski port (koju RS485 sabirnicu) gateway salje
--    upit, pa kriva grana = tank se proziva na krivoj zici i javlja "nema veze".
--
-- ADITIVNO: nista se ne brise. INSERT je idempotentan (ON CONFLICT DO NOTHING po
-- jedinstvenom "broj"), pa ponovno pokretanje ne moze duplicirati tankove.
--
-- NAPOMENA: "Tank"."id" je TEXT bez DB defaulta (Prisma inace generira uuid u
-- aplikaciji), pa ga ovdje generira sama baza preko gen_random_uuid().

-- 1) Cetiri tanka koji su nedostajali
INSERT INTO "Tank" ("id", "broj", "kapacitet", "tip", "kolicinaVinaUTanku",
                    "modbusAdresa", "grana", "zadanaTemp")
VALUES
  (gen_random_uuid()::text, 19, 3900, 'zatvoreni tank', 0, 19, 'A', 16.0),
  (gen_random_uuid()::text, 23, 3900, 'zatvoreni tank', 0, 23, 'B', 16.0),
  (gen_random_uuid()::text, 24, 3900, 'zatvoreni tank', 0, 24, 'B', 16.0),
  (gen_random_uuid()::text, 35, 3900, 'zatvoreni tank', 0, 35, 'B', 16.0)
ON CONFLICT ("broj") DO NOTHING;

-- 2) Grane po fizickoj istini (A = 1-20, B = 21-44)
UPDATE "Tank" SET "grana" = 'A' WHERE "broj" BETWEEN 1 AND 20;
UPDATE "Tank" SET "grana" = 'B' WHERE "broj" BETWEEN 21 AND 44;

-- 3) Kontrola nakon izvrsavanja (ocekivano: 44 tanka, A = 20, B = 24,
--    pod nadzorom 40 - tankovi 41-44 su iskljuceni prethodnom migracijom)
--   SELECT COUNT(*) AS ukupno,
--          COUNT(*) FILTER (WHERE "grana" = 'A') AS grana_a,
--          COUNT(*) FILTER (WHERE "grana" = 'B') AS grana_b,
--          COUNT(*) FILTER (WHERE "nadzorHladjenja" AND "modbusAdresa" IS NOT NULL) AS pod_nadzorom
--   FROM "Tank";
