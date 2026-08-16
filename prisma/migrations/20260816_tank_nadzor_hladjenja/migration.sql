-- Prekidac "tank je pod nadzorom modula Hladjenje".
--
-- Zasto nova kolona, a ne brisanje modbusAdrese:
-- Tankovi 41-44 (drvena bacva 3, vanjski tank, dva inoks tanka) fizicki postoje i
-- imaju vino, ali NEMAJU kontroler hladjenja. Da im se samo obrise "modbusAdresa",
-- za pola godine se iz baze vise ne bi vidjelo je li adresa namjerno maknuta ili je
-- netko zaboravio upisati - a gateway bi sutio jednako u oba slucaja.
-- Ovako je namjera zapisana: adresa ostaje (po konvenciji = broj tanka), a
-- "nadzorHladjenja = false" izricito kaze "ne prozivaj ga, nema kontroler".
--
-- Gateway proziva tank samo ako je "modbusAdresa" postavljena I "nadzorHladjenja"
-- je true; isti uvjet vrijedi za /dashboard/hladjenje.
--
-- Kad tank 42 dobije kontroler, dovoljan je jedan redak:
--   UPDATE "Tank" SET "nadzorHladjenja" = true WHERE "broj" = 42;
--
-- ADITIVNO: nova kolona s defaultom true - svi postojeci tankovi zadrzavaju
-- danasnje ponasanje, osim 41-44 koji se izricito iskljucuju.

ALTER TABLE "Tank" ADD COLUMN "nadzorHladjenja" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Tank" SET "nadzorHladjenja" = false WHERE "broj" BETWEEN 41 AND 44;
