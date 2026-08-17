-- Prekidac "SMS obavijesti" po tanku.
-- ADITIVNO: jedna nova kolona s defaultom - postojeci tankovi zadrzavaju SMS.
--
-- false utisava SAMO poruku. TankAlarm se i dalje otvara i zatvara, crveni badge
-- i brojaci na /dashboard/hladjenje ostaju nepromijenjeni - mijenja se iskljucivo
-- hoce li taj alarm generirati SMS. Sluzi za tank za koji se zna da je izvan
-- granica (punjenje, pretok, tank koji se tek hladi) da ne budi ljude.
--
-- NOT NULL uz DEFAULT je na PostgreSQL-u 11+ obican upis u katalog, bez prepisa
-- tablice - nema zakljucavanja Tanka na produkciji.

ALTER TABLE "Tank" ADD COLUMN "smsAktivan" BOOLEAN NOT NULL DEFAULT true;
