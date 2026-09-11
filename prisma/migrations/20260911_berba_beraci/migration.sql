-- AlterTable
ALTER TABLE "Berba" ADD COLUMN     "brojBeraca" INTEGER,
ADD COLUMN     "krajBranja" TIMESTAMPTZ(6),
ADD COLUMN     "pocetakBranja" TIMESTAMPTZ(6),
ADD COLUMN     "vlastitaBerba" BOOLEAN;

