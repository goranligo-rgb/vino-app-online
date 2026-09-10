/**
 * KONTROLNI OTISAK KOLICINA U TANKOVIMA — samo cita.
 *
 * Pokretanje:  npm run otisak
 *
 * Dokaz da zahvat NIJE dirao `Tank.kolicinaVinaUTanku`: otisak prije, otisak
 * poslije, i moraju biti isti. Formula je do sada zivjela samo u biljeskama
 * (zarez kao razdjelnik, `broj:kolicina`, sortirano po `broj`) i svaki put se
 * rekonstruirala probanjem — verzija s `\n` daje drugi otisak i NIJE ta.
 *
 * Otisak se mijenja svakim pretokom, punjenjem i izlazom, pa vrijedi kao par
 * prije/poslije unutar jednog zahvata, ne kao trajna konstanta.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const [r] = await prisma.$queryRaw<
    Array<{ otisak: string; tankova: bigint; litara: number }>
  >`
    SELECT
      md5(string_agg(broj || ':' || COALESCE("kolicinaVinaUTanku", 0)::text, ',' ORDER BY broj)) AS otisak,
      count(*)                                        AS tankova,
      COALESCE(sum("kolicinaVinaUTanku"), 0)::float8  AS litara
    FROM "Tank"
  `;

  console.log(r.otisak);
  console.log(
    `${r.tankova} tankova, ${r.litara.toLocaleString("hr-HR")} L, ${new Date().toISOString()}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
