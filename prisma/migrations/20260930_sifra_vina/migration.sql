-- INTERNA SIFRA VINA (30.09.2026.) — aditivno, samo nullable stupci i indeksi.
-- Oblik prefiks-MMGG-broj, upisuje se rukom. Bez UNIQUE: isto vino u dvije
-- posude nosi istu sifru (odluka vlasnika). Postojeci retci ostaju NULL.

-- AlterTable
ALTER TABLE "ImeVina" ADD COLUMN     "sifra" TEXT;

-- AlterTable
ALTER TABLE "SnimkaVina" ADD COLUMN     "sifra" TEXT;

-- CreateIndex
CREATE INDEX "ImeVina_sifra_idx" ON "ImeVina"("sifra");

-- CreateIndex
CREATE INDEX "SnimkaVina_sifra_idx" ON "SnimkaVina"("sifra");
