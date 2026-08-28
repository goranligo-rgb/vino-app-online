-- POVRATAK migracije 20260828_dnevnik_fermentacije.
--
-- NE POKRECE SE u redovnom radu. Povratak koda (git revert) NE trazi ovo:
-- stara verzija koda ovu tablicu i ovaj stupac ne poznaje i mirno radi dok
-- stoje na mjestu. Ovo je samo za slucaj da se zele i fizicki maknuti.
--
-- UPOZORENJE: brise SVE zapise fermentacije i sve oznake kvasaca. Granicu je
-- upisivao covjek i nigdje drugdje ne postoji - iz zadataka i mjerenja se ne
-- da rekonstruirati (vidi obrazlozenje uz fazu 0). `jeKvasac` je oznaka
-- katalogu i mora se rucno ponoviti.
--
-- Redoslijed je obavezan: tablica prije tipa koji koristi.

DROP TABLE IF EXISTS "Fermentacija";

DROP TYPE IF EXISTS "IzvorPocetkaFermentacije";

ALTER TABLE "Preparation" DROP COLUMN IF EXISTS "jeKvasac";
