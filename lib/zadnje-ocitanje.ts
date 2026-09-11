import type { Prisma } from "@prisma/client";

/**
 * ZADNJE OCITANJE TEMPERATURE PO TANKU — jedan redak po tanku, jednim upitom.
 * ======================================================================
 *
 * Citaju ga izvjestaj podruma, `GET /api/tank/monitor` i dashboard hladjenja.
 *
 * ZASTO OVAKO, A NE `DISTINCT ON` ILI `groupBy _max`: `OcitanjeTemperature`
 * nema ciscenja i raste oko 28.800 redaka na dan (11.09.2026.: 1.037.263
 * retka, 290 MB). Oba stara oblika prolazila su kroz SVA ocitanja trazenih
 * tankova da bi od svakog uzela jedno:
 *
 *   DISTINCT ON ("tankId") ... ORDER BY "tankId", "mjerenoU" DESC
 *     -> Index Scan kroz ~900.000 redaka, EXPLAIN ANALYZE 26,5 s;
 *   groupBy { _max: mjerenoU } + findMany OR
 *     -> Index Only Scan kroz 1.000.000 unosa, 7,2 s.
 *
 * Oba su usto rasla sa svakim danom, a vrijeme je skakalo od 1 do 9 s ovisno
 * o tome je li indeks bio u memoriji baze.
 *
 * `unnest(ids) CROSS JOIN LATERAL (... LIMIT 1)` postojeci indeks
 * `(tankId, mjerenoU DESC)` koristi onako kako je i zamisljen: za svaki tank
 * jedan skok na vrh njegova dijela indeksa. Isti upit, iste 37 tankova:
 * 83 ms. Vrijeme vise ne ovisi o velicini tablice nego o broju tankova.
 *
 * Tank bez ijednog ocitanja ne daje redak — isto kao i stari oblici.
 * Temperature dolaze kao `float8`, ne `Decimal`, pa ih pozivatelj ne mora
 * pretvarati (`uBroj` prima i jedno i drugo).
 */

export type ZadnjeOcitanje = {
  tankId: string;
  temperatura: number | null;
  zadanaTemperatura: number | null;
  hladjenjeAktivno: boolean;
  status: string;
  mjerenoU: Date;
};

export async function zadnjaOcitanja(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  tankIds: string[]
): Promise<ZadnjeOcitanje[]> {
  if (tankIds.length === 0) return [];

  return db.$queryRaw<ZadnjeOcitanje[]>`
    SELECT
      t.id                          AS "tankId",
      o."temperatura"::float8       AS temperatura,
      o."zadanaTemperatura"::float8 AS "zadanaTemperatura",
      o."hladjenjeAktivno",
      o."status",
      o."mjerenoU"
    FROM unnest(${tankIds}::text[]) AS t(id)
    CROSS JOIN LATERAL (
      SELECT x."temperatura", x."zadanaTemperatura", x."hladjenjeAktivno",
             x."status", x."mjerenoU"
      FROM "OcitanjeTemperature" x
      WHERE x."tankId" = t.id
      ORDER BY x."mjerenoU" DESC
      LIMIT 1
    ) o
  `;
}

/** Isto, kao mapa po tanku — oblik koji monitor i hladjenje trebaju. */
export async function zadnjaOcitanjaPoTanku(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  tankIds: string[]
): Promise<Map<string, ZadnjeOcitanje>> {
  const redci = await zadnjaOcitanja(db, tankIds);
  return new Map(redci.map((o) => [o.tankId, o]));
}
