-- Pretok dobiva vise ciljeva, kalo i oznaku nacina — MODEL, bez promjene ponasanja.
--
-- KONTEKST: pretok je dosad imao TOCNO JEDAN cilj (`Pretok.ciljTankId`), dok
-- filtracija vise ciljeva vec ima preko ZadatakTankStavka. `PretokCilj` je
-- zrcalo `PretokIzvor`-a s druge strane i izjednacava ta dva mehanizma.
--
-- Nakon ove migracije pretok se ponasa TOCNO kao prije: ruta i dalje pise jedan
-- cilj, a `ciljTankId` se i dalje popunjava kao GLAVNI cilj dok se svi citaci ne
-- prebace na `PretokCilj`.
--
-- NOVA POLJA NA Pretok:
--   kolicinaIzlaz  — koliko je UKUPNO izaslo iz izvora
--   gubitakLitara  — kalo
--   nacin          — kako je fizicki izvedeno (neovisno o `tip`, koji kaze STO
--                    se radi: obicni / cuvee / blend iste sorte)
--   nacinNapomena  — slobodan opis; NE ide u `nacin`
-- Sva cetiri ostaju NULL na 37 zatecenih pretoka: ti pojmovi tada nisu
-- postojali, a tocan odgovor o izaslim litrama za njih i dalje daje zbroj
-- `PretokIzvor`. NULL ovdje znaci "polje tada nije postojalo", ne "nula".
--
-- ZASTO `Pretok_ciljTankId_fkey` NIJE U OVOJ MIGRACIJI:
-- `ciljTankId` postaje opcijski, a Prismin zadani `onDelete` za opcijsku
-- relaciju je SetNull. Generirana migracija je zato htjela DROP + ADD
-- CONSTRAINT i time bi zatecen ON DELETE RESTRICT tiho pretvorila u SET NULL —
-- brisanje tanka koji je cilj pretoka prestalo bi biti greska i samo bi
-- ponistilo pokazivac. `DELETE /api/tank` na taj RESTRICT racuna. Zato je u
-- schema.prisma napisan `onDelete: Restrict` IZRICITO, uz komentar, i strani
-- kljuc ostaje netaknut.
--
-- ADITIVNO: cetiri nova nullable stupca, jedna nova tablica, dva indeksa, dva
-- strana kljuca, i jedan DROP NOT NULL. Nijedan DROP TABLE, nijedan DROP
-- COLUMN, nijedan dodir postojecih podataka.
--
-- SIGURNOST NA PRODUKCIJI (berba je u tijeku): ADD COLUMN bez DEFAULT-a i
-- ALTER COLUMN ... DROP NOT NULL su izmjene samo u katalogu — ne prepisuju
-- retke i ne skeniraju tablicu. CREATE TABLE i CREATE INDEX su nad praznom
-- tablicom.
--
-- VEZA: pooler na portu 5432 = session mode, DDL prolazi normalno.

BEGIN;

-- AlterTable
ALTER TABLE "Pretok" ADD COLUMN     "gubitakLitara" DOUBLE PRECISION,
ADD COLUMN     "kolicinaIzlaz" DOUBLE PRECISION,
ADD COLUMN     "nacin" TEXT,
ADD COLUMN     "nacinNapomena" TEXT,
ALTER COLUMN "ciljTankId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PretokCilj" (
    "id" TEXT NOT NULL,
    "pretokId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "kolicina" DOUBLE PRECISION NOT NULL,
    "redoslijed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PretokCilj_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PretokCilj_pretokId_idx" ON "PretokCilj"("pretokId");

-- CreateIndex
CREATE INDEX "PretokCilj_tankId_idx" ON "PretokCilj"("tankId");

-- AddForeignKey
ALTER TABLE "PretokCilj" ADD CONSTRAINT "PretokCilj_pretokId_fkey" FOREIGN KEY ("pretokId") REFERENCES "Pretok"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PretokCilj" ADD CONSTRAINT "PretokCilj_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
