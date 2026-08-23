-- Tko je napravio pretok, punjenje i izlaz vina.
--
-- KONTEKST: Radnja, Zadatak i Mjerenje odavno biljeze korisnika. Pretok,
-- PunjenjeTanka i IzlazVina nisu imali nikakvo polje korisnika, pa kronologija
-- na monitoru tanka za njih nije mogla pokazati "tko" — podatak se nikad nije
-- ni zapisivao. Pretok se radi svaki dan; sto se dulje ceka, to vise zapisa
-- ostaje bez njega.
--
-- ZATECENI ZAPISI OSTAJU NULL. Ne popunjava se unatrag. Kod izlaza vina bi se
-- ime dalo izvuci iz pripadne Radnja, ali njih povezuje samo tank i priblizno
-- vrijeme, bez ikakvog kljuca — to je nagadjanje, ne podatak. NULL je tocno
-- stanje: ne zna se.
--
-- ON DELETE SET NULL: brisanje korisnika ne smije rusiti zapis o pretoku.
-- Izgubi se ime, sam dogadjaj ostaje — isto kao kod Radnja.
--
-- ADITIVNO: tri nullable stupca, tri indeksa, tri strana kljuca. Nijedan DROP,
-- nijedna izmjena postojeceg stupca, nijedan dodir postojecih podataka.
--
-- SIGURNOST NA PRODUKCIJI (berba je u tijeku): ADD COLUMN bez DEFAULT-a je samo
-- upis u katalog — ne prepisuje retke i ne skenira tablicu, traje milisekunde
-- bez obzira na broj redaka. CREATE INDEX na novom (svuda NULL) stupcu je
-- trivijalan. Kratka bravа nad tablicom drzi se milisekundama.
--
-- VEZA: pooler na portu 5432 = session mode, DDL prolazi normalno.
--       (6543 je transaction mode i za DDL se ne koristi.)

BEGIN;

-- AlterTable
ALTER TABLE "Pretok" ADD COLUMN     "korisnikId" TEXT;

-- AlterTable
ALTER TABLE "PunjenjeTanka" ADD COLUMN     "korisnikId" TEXT;

-- AlterTable
ALTER TABLE "IzlazVina" ADD COLUMN     "korisnikId" TEXT;

-- CreateIndex
CREATE INDEX "Pretok_korisnikId_idx" ON "Pretok"("korisnikId");

-- CreateIndex
CREATE INDEX "PunjenjeTanka_korisnikId_idx" ON "PunjenjeTanka"("korisnikId");

-- CreateIndex
CREATE INDEX "IzlazVina_korisnikId_idx" ON "IzlazVina"("korisnikId");

-- AddForeignKey
ALTER TABLE "Pretok" ADD CONSTRAINT "Pretok_korisnikId_fkey" FOREIGN KEY ("korisnikId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunjenjeTanka" ADD CONSTRAINT "PunjenjeTanka_korisnikId_fkey" FOREIGN KEY ("korisnikId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IzlazVina" ADD CONSTRAINT "IzlazVina_korisnikId_fkey" FOREIGN KEY ("korisnikId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
