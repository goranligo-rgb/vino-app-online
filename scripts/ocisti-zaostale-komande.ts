/**
 * JEDNOKRATNI CLEANUP zaostalih komandi hladjenja.
 *
 * Komanda starija od KOMANDA_MAX_MINUTA (30) se na gatewayu ionako vise nikad
 * ne izvrsava (sigurnosna ograda u gateway/gateway.py). Do sada su takve komande
 * znale ostati zauvijek NA_CEKANJU: badge "na cekanju" je visio na plocici, a
 * gateway zbog njih nije smio poravnati Tank.zadanaTemp sa stvarnim stanjem
 * kontrolera. Ovaj skript ih zatvara kao NEUSPJELO.
 *
 * Dira SAMO TankKomanda sa statusom NA_CEKANJU starije od praga. Tankove,
 * ocitanja i alarme ne dira.
 *
 * Pokretanje:
 *   DRY-RUN (samo popis, nista se ne mijenja):  npx tsx scripts/ocisti-zaostale-komande.ts
 *   STVARNI UPIS:                               npx tsx scripts/ocisti-zaostale-komande.ts --apply
 *
 * Prag se moze promijeniti: ... --minuta=60
 */
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");

const argMinuta = process.argv.find((a) => a.startsWith("--minuta="));
const MINUTA = argMinuta ? Number(argMinuta.split("=")[1]) : 30;

const PORUKA = `Zaostala komanda - starija od ${MINUTA} min, nije izvrsena (jednokratni cleanup).`;

async function main() {
  if (!Number.isFinite(MINUTA) || MINUTA <= 0) {
    throw new Error(`Neispravan --minuta=${argMinuta}`);
  }

  const granica = new Date(Date.now() - MINUTA * 60 * 1000);

  const zaostale = await prisma.tankKomanda.findMany({
    where: { status: "NA_CEKANJU", trazenoU: { lt: granica } },
    orderBy: { trazenoU: "asc" },
    include: { tank: { select: { broj: true } } },
  });

  const naCekanjuUkupno = await prisma.tankKomanda.count({
    where: { status: "NA_CEKANJU" },
  });

  console.log(`Prag: starije od ${MINUTA} min (prije ${granica.toLocaleString("hr-HR")})`);
  console.log(`Komandi NA_CEKANJU ukupno: ${naCekanjuUkupno}`);
  console.log(`Od toga zaostalih:         ${zaostale.length}\n`);

  for (const k of zaostale) {
    console.log(
      `  Tank ${k.tank.broj} · ${k.tip} · ${k.vrijednost ?? "—"} · ` +
        `trazeno ${k.trazenoU.toLocaleString("hr-HR")}` +
        (k.greska ? ` · napomena: ${k.greska}` : "")
    );
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nista nije promijenjeno. Pokreni s --apply za stvarni upis.");
    await prisma.$disconnect();
    return;
  }

  if (zaostale.length === 0) {
    console.log("Nema sto ocistiti.");
    await prisma.$disconnect();
    return;
  }

  const r = await prisma.tankKomanda.updateMany({
    where: { id: { in: zaostale.map((k) => k.id) }, status: "NA_CEKANJU" },
    data: { status: "NEUSPJELO", greska: PORUKA },
  });

  console.log(`\nOznaceno NEUSPJELO: ${r.count}`);
  console.log("CLEANUP GOTOV.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("CLEANUP GRESKA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
