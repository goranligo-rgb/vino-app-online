-- Soft-OFF hladjenja: pamcenje zadane temperature prije iskljucenja.
--
-- Discovery na zivom kontroleru (test tank 2, 16.08.2026.) pokazao je da Dixell
-- XR75CX NEMA izlozen Modbus registar za ON/OFF hladjenja. (Registar 0x0420 nije
-- rjesenje - upis u njega rusi komunikaciju kontrolera i zato ga gateway drzi na
-- popisu zabranjenih registara.)
--
-- Hladjenje se zato gasi "meko", preko set pointa:
--   OFF = zapamti trenutnu zadanu u "zadnjaZadanaTemp" i upisi SEt = 20,0 C
--   ON  = vrati zapamcenu vrijednost natrag u SEt
-- Tank kojem je zadanaTemp = 20,0 C aplikacija prikazuje kao "hladjenje iskljuceno"
-- i za njega ne otvara alarm PREVISOKA_TEMP.
--
-- ADITIVNO: jedna nova nullable kolona na postojecem Tank-u. Nista se ne mijenja,
-- ne brise i ne dobiva default -> postojeci redovi ostaju NULL (= nista zapamceno,
-- hladjenje ukljuceno). Za komande HLADJENJE_ON / HLADJENJE_OFF migracija nije
-- potrebna: TankKomanda."tip" je obican TEXT bez CHECK-a i bez enum tipa
-- (vidi 20260709_tank_komanda), a te komande ionako nemaju vrijednost.

ALTER TABLE "Tank" ADD COLUMN "zadnjaZadanaTemp" DECIMAL(4,1);
