-- ============================================================================
-- IZVRSENO 03.09.2026. u 15:34:26 UTC nad produkcijskom bazom. Ne pokretati
-- ponovno — vidi prisma/ispravci/README.md.
--
-- STO: secer na tri zapisa berbe Veltlinac zeleni bio je krivo upisan pri
-- prijemu mosta. Ispravljen na izmjerenih 85.
--
--   95925296-ba40-4411-b2a9-482b82cfff71   24.08.2026.  polozaj 11   100 -> 85
--   0b69aa96-2ef3-4745-8ff4-cdbd043aabc0   27.08.2026.  polozaj 11   100 -> 85
--   6ac65b02-a89c-4416-a432-3ec586f7bcfc   28.08.2026.  polozaj 12   110 -> 85
--
-- Vrijednost 85 potvrdio Goran (cd7a66c6-0c37-4ba5-b9e7-22a80c9da7e7) prije
-- izvrsenja, za sva tri zapisa.
--
-- STO JE DIRANO: iskljucivo secer, ispravljenoAt, ispravioKorisnikId,
-- razlogIspravka, updatedAt.
-- STO NIJE: litre, kilogrami, datumBerbe, nazivSorte, polozaj, kiseline, ph,
-- prviTankId, obrisano — te su vrijednosti usporedene ispis-po-ispis prije i
-- poslije i nepromijenjene su. BerbaKretanje i Tank nisu dirani nikako.
--
-- PROVJERE
--   otisak kolicinaVinaUTanku prije  19f289d4fb6efb81934e906d4c5c9b53
--   otisak kolicinaVinaUTanku poslije 19f289d4fb6efb81934e906d4c5c9b53
--     (48 tankova, 123790 L — identican, jer secer ne ulazi u kolicine)
--   npm run berba:provjeri  prije: proslo 10, palo 0
--   npm run berba:provjeri poslije: proslo 10, palo 0
--
-- Otisak je MD5 nad "broj:kolicina" po svim tankovima, sortirano po broju:
--   SELECT md5(string_agg(broj || ':' || COALESCE("kolicinaVinaUTanku",0)::text,
--                         ',' ORDER BY broj)) FROM "Tank";
-- ============================================================================
BEGIN;

UPDATE "Berba"
SET secer               = 85,
    "ispravljenoAt"      = now(),
    "ispravioKorisnikId" = 'cd7a66c6-0c37-4ba5-b9e7-22a80c9da7e7',
    "razlogIspravka"     = 'Ispravak secera mosta pri prijemu - izvorno upisana kriva vrijednost',
    "updatedAt"          = now()
WHERE id IN (
        '95925296-ba40-4411-b2a9-482b82cfff71',
        '0b69aa96-2ef3-4745-8ff4-cdbd043aabc0',
        '6ac65b02-a89c-4416-a432-3ec586f7bcfc'
      )
  AND "nazivSorte" = 'Veltlinac zeleni'
  AND obrisano = false;

-- Kocnica: ako nisu pogodena tocno 3 retka, sve se ponistava.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "Berba"
   WHERE id IN (
           '95925296-ba40-4411-b2a9-482b82cfff71',
           '0b69aa96-2ef3-4745-8ff4-cdbd043aabc0',
           '6ac65b02-a89c-4416-a432-3ec586f7bcfc'
         )
     AND secer = 85
     AND "ispravljenoAt" IS NOT NULL
     AND "ispravioKorisnikId" = 'cd7a66c6-0c37-4ba5-b9e7-22a80c9da7e7';
  IF n <> 3 THEN
    RAISE EXCEPTION 'Ocekivano 3 ispravljena retka, dobiveno %', n;
  END IF;
END $$;

COMMIT;
