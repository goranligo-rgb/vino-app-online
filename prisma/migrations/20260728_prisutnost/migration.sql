-- Evidencija radnog vremena (Faza 1): prijava/odjava djelatnika + tablica praznika.
--
-- ADITIVNO: dvije NOVE tablice, dva indeksa, dva FK-a na postojeci User.
-- Bez DROP-a, bez izmjene postojecih tablica i kolona, bez diranja podataka.
-- Postojeci moduli (tankovi, zadaci, putnik) ostaju netaknuti.
--
-- TIPOVI:
--   "datum"  = DATE  (Prisma @db.Date) - dan na koji se zapis odnosi, po hrvatskoj
--              zoni (Europe/Zagreb). Racuna ga aplikacija (lib/prisutnost.ts), jer
--              server (Vercel) radi u UTC-u pa "new Date()" nakon 22:00 ljeti vec
--              pokazuje sutrasnji UTC dan.
--   vremena  = TIMESTAMP(3) - isto kao ostale tablice u projektu (Prisma DateTime).
--   "id"     = TEXT bez DB defaulta; vrijednost generira Prisma (cuid), kao i
--              drugdje u shemi (OcitanjeTemperature, TankKomanda...).
--
-- VISE PRIJAVA PO DANU je namjerno dopusteno (izlazak s posla i povratak isti dan),
-- pa NEMA unique(userId, datum). Pravilo "ne moze dvaput prijava bez odjave" cuva
-- aplikacija (provjera otvorenog zapisa) - vidi app/dashboard/prisutnost/actions.ts.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) RadnaPrijava - jedan redak = jedan dolazak (+ odlazak kad se odjavi)
-- ---------------------------------------------------------------------------
CREATE TABLE "RadnaPrijava" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "datum"     DATE NOT NULL,
    "dolazakU"  TIMESTAMP(3) NOT NULL,
    "odlazakU"  TIMESTAMP(3),               -- NULL = korisnik je jos prijavljen
    "napomena"  TEXT,
    "uredioId"  TEXT,                       -- tko je rucno ispravio zapis (admin)
    "uredenoU"  TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RadnaPrijava_pkey" PRIMARY KEY ("id")
);

-- ploca prisutnosti za jedan dan i mjesecni pregled po korisniku
CREATE INDEX "RadnaPrijava_userId_datum_idx" ON "RadnaPrijava"("userId", "datum");
CREATE INDEX "RadnaPrijava_datum_idx"        ON "RadnaPrijava"("datum");

-- Zapis se NE brise s korisnikom (evidencija radnog vremena je trag) - zato
-- ON DELETE RESTRICT; korisnici se ionako deaktiviraju (User.active), ne brisu.
ALTER TABLE "RadnaPrijava"
    ADD CONSTRAINT "RadnaPrijava_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RadnaPrijava"
    ADD CONSTRAINT "RadnaPrijava_uredioId_fkey"
    FOREIGN KEY ("uredioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Praznik - drzavni praznici RH (sada se samo puni; koristi ih Faza 2)
-- ---------------------------------------------------------------------------
CREATE TABLE "Praznik" (
    "id"    TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "naziv" TEXT NOT NULL,
    CONSTRAINT "Praznik_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Praznik_datum_key" ON "Praznik"("datum");

-- ---------------------------------------------------------------------------
-- 3) Seed praznika 2026. i 2027. (Zakon o blagdanima, NN 110/19)
--    Pomicni: Uskrs 2026 = 5.4., Uskrsni ponedjeljak 6.4., Tijelovo (Uskrs+60) = 4.6.
--             Uskrs 2027 = 28.3., Uskrsni ponedjeljak 29.3., Tijelovo = 27.5.
--    ON CONFLICT DO NOTHING: migracija se smije pokrenuti i vise puta.
-- ---------------------------------------------------------------------------
INSERT INTO "Praznik" ("id", "datum", "naziv") VALUES
    ('praznik-2026-01-01', DATE '2026-01-01', 'Nova godina'),
    ('praznik-2026-01-06', DATE '2026-01-06', 'Sveta tri kralja'),
    ('praznik-2026-04-05', DATE '2026-04-05', 'Uskrs'),
    ('praznik-2026-04-06', DATE '2026-04-06', 'Uskrsni ponedjeljak'),
    ('praznik-2026-05-01', DATE '2026-05-01', 'Praznik rada'),
    ('praznik-2026-05-30', DATE '2026-05-30', 'Dan drzavnosti'),
    ('praznik-2026-06-04', DATE '2026-06-04', 'Tijelovo'),
    ('praznik-2026-06-22', DATE '2026-06-22', 'Dan antifasisticke borbe'),
    ('praznik-2026-08-05', DATE '2026-08-05', 'Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja'),
    ('praznik-2026-08-15', DATE '2026-08-15', 'Velika Gospa'),
    ('praznik-2026-11-01', DATE '2026-11-01', 'Svi sveti'),
    ('praznik-2026-11-18', DATE '2026-11-18', 'Dan sjecanja na zrtve Domovinskog rata'),
    ('praznik-2026-12-25', DATE '2026-12-25', 'Bozic'),
    ('praznik-2026-12-26', DATE '2026-12-26', 'Sveti Stjepan'),
    ('praznik-2027-01-01', DATE '2027-01-01', 'Nova godina'),
    ('praznik-2027-01-06', DATE '2027-01-06', 'Sveta tri kralja'),
    ('praznik-2027-03-28', DATE '2027-03-28', 'Uskrs'),
    ('praznik-2027-03-29', DATE '2027-03-29', 'Uskrsni ponedjeljak'),
    ('praznik-2027-05-01', DATE '2027-05-01', 'Praznik rada'),
    ('praznik-2027-05-27', DATE '2027-05-27', 'Tijelovo'),
    ('praznik-2027-05-30', DATE '2027-05-30', 'Dan drzavnosti'),
    ('praznik-2027-06-22', DATE '2027-06-22', 'Dan antifasisticke borbe'),
    ('praznik-2027-08-05', DATE '2027-08-05', 'Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja'),
    ('praznik-2027-08-15', DATE '2027-08-15', 'Velika Gospa'),
    ('praznik-2027-11-01', DATE '2027-11-01', 'Svi sveti'),
    ('praznik-2027-11-18', DATE '2027-11-18', 'Dan sjecanja na zrtve Domovinskog rata'),
    ('praznik-2027-12-25', DATE '2027-12-25', 'Bozic'),
    ('praznik-2027-12-26', DATE '2027-12-26', 'Sveti Stjepan')
ON CONFLICT ("datum") DO NOTHING;

COMMIT;
