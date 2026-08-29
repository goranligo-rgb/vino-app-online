-- BERBA U VISE TANKOVA - dvije veze koje su dosad nedostajale.
--
-- CISTO ADITIVNA: dva ALTER TABLE ADD COLUMN (oba NULLABLE, bez DEFAULT) i dva
-- CREATE INDEX. Nijedan postojeci stupac se ne mijenja, nijedan strani kljuc se
-- ne dira, nijedan redak se ne pise ni ne brise. Nema DROP-a, nema backfilla.
--
-- Svi zatecen redci ostaju s NULL u oba stupca i ponasaju se tocno kao danas.
-- Stari kod ove stupce ne poznaje pa ih ni ne pise; nullable ADD COLUMN bez
-- defaulta ne prepisuje tablicu, pa je zahvat trenutan i tijekom berbe.
--
-- ZASTO OVA DVA STUPCA
-- --------------------
-- Jedna berba - jedno grozdje s jednog polozaja, ubrano jednom - cesto ide u
-- dva ili vise tankova: samotok u jedan, presovina u drugi, ili jednostavno ne
-- stane u jedan. To je JEDNA berba, ne dvije.
--
-- Knjiga to vec podnosi: `Berba.kretanja` je 1:N, pa jedan zapis berbe smije
-- imati po jedan ULAZ redak za svaki tank (lib/berba-knjiga.ts,
-- `zabiljeziUlazUVise`). Ono sto nije podnosilo je `PunjenjeTanka`, koje je po
-- definiciji vezano na JEDAN tank - i koje je pritom jedini izvor iz kojeg se
-- tanku preracunava kolicina (app/api/punjenje-stavka/[id]/route.ts) i iz kojeg
-- arhiviranje kopira podatke berbe (app/api/izlaz-vina/route.ts,
-- lib/pretok-arhiviranje.ts). Tank bez svog `PunjenjeTanka` ispao bi iz svega
-- toga i tiho se vratio na nulu pri prvom brisanju bilo cega.
--
-- Zato svaki tank i dalje dobiva svoje punjenje sa svojom stavkom, a ova dva
-- stupca drze ono sto je zajednicko:
--
--   PunjenjeStavka.berbaId  - vise stavki -> ISTI zapis berbe
--   PunjenjeTanka.grupaId   - vise punjenja -> ISTI cin spremanja

-- AlterTable
-- Zapis berbe iz kojeg je stavka nastala. DIJELJIV, za razliku od
-- `Berba.izvornaPunjenjeStavkaId`, koji je @unique pa ga moze zauzeti samo
-- jedna stavka. Ta stara veza OSTAJE kakva jest, radi zatecenih zapisa i
-- backfilla; nova punjenja pisu obje.
--
-- Bez stranog kljuca, namjerno: arhiviranje brise stavke, a zapis berbe mora
-- prezivjeti. Isti obrazac kao `Berba.prviTankId` i `ArhivaVina.tankId`.
ALTER TABLE "PunjenjeStavka" ADD COLUMN     "berbaId" TEXT;

-- AlterTable
-- Oznaka koja povezuje punjenja nastala JEDNIM spremanjem forme. Bez nje bi se
-- iz baze vidjela dva punjenja ondje gdje je covjek napravio jedan potez, i
-- popis zadnjih punjenja bi ih prikazivao kao dva nepovezana unosa.
ALTER TABLE "PunjenjeTanka" ADD COLUMN     "grupaId" TEXT;

-- CreateIndex
-- Cita se pri brisanju stavke: "koje jos stavke pokazuju na ovu berbu", tj. je
-- li berba u vise tankova. Bez indeksa bi to bio pun prolaz po stavkama.
CREATE INDEX "PunjenjeStavka_berbaId_idx" ON "PunjenjeStavka"("berbaId");

-- CreateIndex
CREATE INDEX "PunjenjeTanka_grupaId_idx" ON "PunjenjeTanka"("grupaId");
