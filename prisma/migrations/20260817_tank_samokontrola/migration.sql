-- Samokontrola hladjenja: izuzimanje pojedinog tanka iz provjere.
-- ADITIVNO: jedna nova kolona s defaultom - svi postojeci tankovi se provjeravaju.
--
-- Samokontrola usporeduje Tank.kolicinaVinaUTanku sa stanjem hladjenja i javlja
-- dvije nelogicnosti: pun tank bez hladjenja i prazan tank koji hladi. To NIJE
-- alarm (nista nije u kvaru) nego podsjetnik, pa se prikazuje zuto.
--
-- false = tank je namjerno takav (jabucno-mlijecna fermentacija, maceracija,
-- tank u pripremi) i ne javlja se. Ne dira ni TankAlarm ni SMS.
--
-- NOT NULL uz DEFAULT je na PostgreSQL-u 11+ obican upis u katalog, bez prepisa
-- tablice - nema zakljucavanja Tanka na produkciji.

ALTER TABLE "Tank" ADD COLUMN "samokontrolaAktivna" BOOLEAN NOT NULL DEFAULT true;
