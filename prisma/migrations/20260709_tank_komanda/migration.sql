-- Upravljanje temperaturom tankova - zahtjevi za promjenu (Faza A: samo evidencija).
-- ADITIVNO: 1 nova tablica, indeksi, 2 FK. Nista se ne mijenja ni brise.
-- Komanda stoji NA_CEKANJU; nista se ne salje hardveru dok gateway ne postoji.

CREATE TABLE "TankKomanda" (
    "id"            TEXT NOT NULL,
    "tankId"        TEXT NOT NULL,
    "tip"           TEXT NOT NULL,
    "vrijednost"    DECIMAL(4,1),
    "status"        TEXT NOT NULL DEFAULT 'NA_CEKANJU',
    "trazioUserId"  TEXT NOT NULL,
    "trazenoU"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "primijenjenoU" TIMESTAMP(3),
    "greska"        TEXT,
    CONSTRAINT "TankKomanda_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TankKomanda_tankId_trazenoU_idx" ON "TankKomanda"("tankId", "trazenoU" DESC);
CREATE INDEX "TankKomanda_status_idx" ON "TankKomanda"("status");
ALTER TABLE "TankKomanda" ADD CONSTRAINT "TankKomanda_tankId_fkey"
    FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TankKomanda" ADD CONSTRAINT "TankKomanda_trazioUserId_fkey"
    FOREIGN KEY ("trazioUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
