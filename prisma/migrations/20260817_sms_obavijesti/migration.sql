-- SMS alarmi (Infobip): jedna nova nullable kolona + jedna nova tablica.
-- ADITIVNO: nista se ne mijenja, ne brise i ne prepisuje.
--
-- 1) TankAlarm."smsPoslanU" - brava protiv ponavljanja. Gateway salje SMS tek
--    kad alarm potraje SMS_ODGODA_MIN (15 min) i upise vrijeme slanja; "opet OK"
--    SMS se kod zatvaranja salje samo ako je ovo popunjeno. Stanje je u bazi, a
--    ne u memoriji gatewaya, da restart servisa ne posalje SMS drugi put.
--    Postojeci alarmi ostaju NULL - za njih SMS nikad nije poslan, a stariji od
--    15 min bi inace odmah opalili. Zato ih migracija odmah "pecatira" (nize).
--
-- 2) "SmsObavijest" - dnevnik svih poslanih poruka i ujedno stanje za heartbeat
--    watchdog (je li za trenutni ispad SMS vec poslan). Bez FK na Tank: dnevnik
--    mora prezivjeti brisanje tanka.

ALTER TABLE "TankAlarm" ADD COLUMN "smsPoslanU" TIMESTAMP(3);

-- Zatecene aktivne alarme oznaci kao "vec javljene" da ukljucenje modula ne
-- posalje SMS za nesto sto traje od prije. Novi alarmi krecu s NULL.
UPDATE "TankAlarm"
   SET "smsPoslanU" = CURRENT_TIMESTAMP
 WHERE "aktivan" = true;

CREATE TABLE "SmsObavijest" (
    "id"         TEXT NOT NULL,
    "tip"        TEXT NOT NULL,
    "izvor"      TEXT NOT NULL,
    "tankId"     TEXT,
    "tankBroj"   INTEGER,
    "alarmId"    TEXT,
    "tekst"      TEXT NOT NULL,
    "primatelji" TEXT NOT NULL,
    "uspjeh"     BOOLEAN NOT NULL,
    "greska"     TEXT,
    "poslanoU"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsObavijest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsObavijest_tip_poslanoU_idx" ON "SmsObavijest"("tip", "poslanoU" DESC);
CREATE INDEX "SmsObavijest_poslanoU_idx" ON "SmsObavijest"("poslanoU" DESC);
