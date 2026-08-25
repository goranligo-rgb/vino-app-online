-- POVRATAK migracije 20260825_berba_kao_dogadaj.
--
-- NE POKRECE SE u redovnom radu. Povratak koda (git revert) NE trazi ovo:
-- stara verzija koda ove tablice ne poznaje i mirno radi dok one stoje pune.
-- Ovo je samo za slucaj da se tablice zele i fizicki maknuti.
--
-- UPOZORENJE: brise SVE zapise berbe i knjigu kretanja. Prije pokretanja
-- provjeriti postoji li jos igdje kopija tih podataka.
--
-- Redoslijed je obavezan: dijete prije roditelja, tipovi na kraju.

DROP TABLE IF EXISTS "BerbaKretanje";
DROP TABLE IF EXISTS "Berba";

DROP TYPE IF EXISTS "VrstaKretanjaBerbe";
DROP TYPE IF EXISTS "VrstaUnosaBerbe";
