-- Maceracija u arhivi punjenja.
--
-- ZASTO: arhiviranje kopira PunjenjeStavka u ArhivaPunjenjeStavka pa brise
-- original (lib/pretok-arhiviranje.ts, app/api/izlaz-vina/route.ts). Kopija
-- nije imala stupce za maceraciju, pa se ona pri arhiviranju TRAJNO gubila —
-- bez kopije i bez traga. Ivana maceraciju upisuje od 23.08.2026.
--
-- Aditivno: dva nullable stupca, bez DEFAULT-a i bez DROP-a. NULL je ovdje
-- tocan za zatecene retke i znaci "nije se pitalo" — isto kao u
-- PunjenjeStavka.maceracija (migracija 20260823_maceracija_na_punjenju).
-- DEFAULT false bi zatecenim arhivama pripisao tvrdnju koju nitko nije izgovorio.

ALTER TABLE "ArhivaPunjenjeStavka" ADD COLUMN IF NOT EXISTS "maceracija" BOOLEAN;
ALTER TABLE "ArhivaPunjenjeStavka" ADD COLUMN IF NOT EXISTS "maceracijaSati" DOUBLE PRECISION;
