/**
 * PROVJERA DOPUNE PO PARTIJI — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run kvasac:partija
 *
 * SIGURNOST: iskljucivo SELECT. Sigurno je pokrenuti bilo kad, i tijekom berbe.
 *
 * STO POKAZUJE
 *   1. koji tankovi po glavnom pravilu (VinoRadnja) nemaju kvasac,
 *   2. sto bi im dala dopuna po partiji,
 *   3. i — najvaznije — DOKAZ da dopuna ne dira nijedan tank koji glavno
 *      pravilo vec rjesava.
 *
 * Izlazni kod je 1 ako se dopuna umijesala ondje gdje ne smije.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { kvasciPoPartiji } from "../lib/kvasac-partija";
import { popisKvasaca, popisKvasacaSDopunom, opisPopisa } from "../lib/kvasci";

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));

async function main() {
  const tankovi = await prisma.tank.findMany({
    where: { kolicinaVinaUTanku: { gt: 0 } },
    select: { id: true, broj: true, nazivVina: true, sorta: true },
    orderBy: { broj: "asc" },
  });

  const ids = tankovi.map((t) => t.id);

  const [vinoRadnje, poPartiji] = await Promise.all([
    prisma.vinoRadnja.findMany({ where: { tankId: { in: ids } } }),
    kvasciPoPartiji(prisma, ids),
  ]);

  const poTanku = new Map<string, typeof vinoRadnje>();
  for (const v of vinoRadnje) {
    const p = poTanku.get(v.tankId) ?? [];
    p.push(v);
    poTanku.set(v.tankId, p);
  }

  console.log("");
  console.log("DOPUNA PO PARTIJI — glavno pravilo ostaje mjerodavno");
  console.log("");
  console.log(pad("TANK", 6) + pad("PRAVILO", 12) + "KVASCI");
  console.log("-".repeat(112));

  let glavno = 0;
  let dopuna = 0;
  let prazno = 0;
  let umijesano = 0;

  for (const t of tankovi) {
    const redci = poTanku.get(t.id) ?? [];
    const samoGlavno = popisKvasaca(redci);
    const spojeno = popisKvasacaSDopunom(redci, poPartiji.get(t.id) ?? []);

    // BRANA: kad glavno pravilo nesto da, spojeni popis mora biti ISTI.
    if (samoGlavno.stavke.length > 0) {
      const isti =
        JSON.stringify(samoGlavno.stavke) === JSON.stringify(spojeno.stavke) &&
        samoGlavno.bezZapisaPostotak === spojeno.bezZapisaPostotak;

      if (!isti) {
        umijesano++;
        console.log(`  PALO: T${t.broj} — dopuna je promijenila tank koji glavno pravilo rjesava`);
      }
    }

    const vrsta =
      spojeno.stavke.length === 0
        ? "—"
        : spojeno.stavke.some((s) => s.poPartiji)
          ? "po partiji"
          : "po trenutku";

    if (spojeno.stavke.length === 0) prazno++;
    else if (vrsta === "po partiji") dopuna++;
    else glavno++;

    console.log(pad(`T${t.broj}`, 6) + pad(vrsta, 12) + opisPopisa(spojeno));
  }

  console.log("");
  console.log(`punih tankova:            ${tankovi.length}`);
  console.log(`  po trenutku (glavno):   ${glavno}`);
  console.log(`  po partiji (dopuna):    ${dopuna}`);
  console.log(`  i dalje bez kvasca:     ${prazno}`);
  console.log("");

  if (umijesano > 0) {
    console.log(`PALO: dopuna je dirnula ${umijesano} tankova koje glavno pravilo rjesava.`);
    process.exitCode = 1;
  } else {
    console.log("OK: dopuna nije dirnula nijedan tank koji glavno pravilo rjesava.");
  }

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
