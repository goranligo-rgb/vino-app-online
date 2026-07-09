-- Nadzor temperature tankova (Faza A - samo prikaz, bez upravljanja).
-- ADITIVNO: 5 nullable kolona na postojeci Tank, 2 nove tablice, indeksi, FK.
-- Nista se ne mijenja ni brise. Postojeci podaci ostaju netaknuti.

-- 1) Nova nullable polja na postojecem Tank
--    modbusAdresa = broj tanka na ploci (jedinstven), grana "A"/"B",
--    zadanaTemp = zadana temp hladjenja, alarmMinus/Plus = pragovi (°C ispod/iznad zadane).
ALTER TABLE "Tank" ADD COLUMN "modbusAdresa" INTEGER;
ALTER TABLE "Tank" ADD COLUMN "grana"        TEXT;
ALTER TABLE "Tank" ADD COLUMN "zadanaTemp"   DECIMAL(4,1);
ALTER TABLE "Tank" ADD COLUMN "alarmMinus"   DECIMAL(3,1) DEFAULT 2.0;
ALTER TABLE "Tank" ADD COLUMN "alarmPlus"    DECIMAL(3,1) DEFAULT 2.0;
CREATE UNIQUE INDEX "Tank_modbusAdresa_key" ON "Tank"("modbusAdresa");

-- 2) Ocitanje temperature (telemetrija; kaskadno se brise s tankom)
CREATE TABLE "OcitanjeTemperature" (
    "id"                TEXT NOT NULL,
    "tankId"            TEXT NOT NULL,
    "temperatura"       DECIMAL(4,1) NOT NULL,
    "zadanaTemperatura" DECIMAL(4,1) NOT NULL,
    "hladjenjeAktivno"  BOOLEAN NOT NULL,
    "status"            TEXT NOT NULL,
    "mjerenoU"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OcitanjeTemperature_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OcitanjeTemperature_tankId_mjerenoU_idx"
    ON "OcitanjeTemperature"("tankId", "mjerenoU" DESC);
ALTER TABLE "OcitanjeTemperature" ADD CONSTRAINT "OcitanjeTemperature_tankId_fkey"
    FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Alarm tanka
CREATE TABLE "TankAlarm" (
    "id"          TEXT NOT NULL,
    "tankId"      TEXT NOT NULL,
    "tip"         TEXT NOT NULL,
    "poruka"      TEXT NOT NULL,
    "aktivan"     BOOLEAN NOT NULL DEFAULT true,
    "nastaoU"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "razrijesenU" TIMESTAMP(3),
    CONSTRAINT "TankAlarm_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TankAlarm_tankId_idx" ON "TankAlarm"("tankId");
ALTER TABLE "TankAlarm" ADD CONSTRAINT "TankAlarm_tankId_fkey"
    FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
