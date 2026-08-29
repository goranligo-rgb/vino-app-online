-- POVRATAK migracije 20260829_berba_u_vise_tankova.
--
-- NE POKRECE SE u redovnom radu. Povratak koda (git revert) NE trazi ovo:
-- stara verzija koda ove stupce ne poznaje i mirno radi dok stoje na mjestu.
-- Ovo je samo za slucaj da se zele i fizicki maknuti.
--
-- UPOZORENJE: brise vezu izmedju stavki punjenja i zapisa berbe za sva
-- punjenja upisana NAKON ove migracije, i oznaku grupe za berbe razlivene u
-- vise tankova.
--
-- Sto se time gubi, a sto ne:
--   - `Berba` i `BerbaKretanje` ostaju NEDIRNUTI. Knjiga i dalje zna sve: koja
--     berba, koliko litara, u koji tank. Nijedan ULAZ redak se ne brise.
--   - Gubi se veza u DRUGOM smjeru: iz stavke punjenja se vise nece znati koja
--     je berba iz nje nastala, osim za onu jednu stavku koja drzi zatecenu
--     vezu `Berba.izvornaPunjenjeStavkaId`. Za berbu u dva tanka to znaci da
--     drugi tank ostaje bez veze na svoj zapis.
--   - Zbog toga brisanje takve stavke poslije ovoga nece znati povuci berbu.
--
-- Veza se da rekonstruirati iz knjige (`BerbaKretanje.punjenjeId` + `uTankId`),
-- ali za to treba napisati skriptu - ne dogadja se samo od sebe.

DROP INDEX IF EXISTS "PunjenjeTanka_grupaId_idx";

DROP INDEX IF EXISTS "PunjenjeStavka_berbaId_idx";

ALTER TABLE "PunjenjeTanka" DROP COLUMN IF EXISTS "grupaId";

ALTER TABLE "PunjenjeStavka" DROP COLUMN IF EXISTS "berbaId";
