/**
 * PORAVNANJE KNJIGE BERBE nakon backfilla.
 *
 * Pokretanje:  npm run berba:poravnaj            (suhi hod, NISTA se ne upisuje)
 *              npm run berba:poravnaj -- --upisi (stvarni upis)
 *
 * ZASTO POSTOJI
 * -------------
 * `scripts/backfill-berba.ts` zatvori knjigu prema tankovima u trenutku u kojem
 * se pokrene. Sve sto podrum napravi POSLIJE toga, a prije nego korak 3 dodje u
 * pogon, knjiga ne vidi — pa se razilazi. To nije rupa u povijesti nego
 * zaostatak od nekoliko sati.
 *
 * Zaostatak se NE zatvara anonimnim ISPRAVKOM. Cinovi postoje u bazi, sa svojim
 * id-evima, korisnicima i vremenima; ovaj ih skript odigra kroz ISTE funkcije
 * knjige koje ih od koraka 3 pisu uzivo (`zabiljeziPrijenos`, `zabiljeziIzlaz`),
 * vezane na prave `pretokId` i `izlazVinaId`. Rezultat je knjiga koja ima tocnu
 * povijest, a ne rupu koja izgleda kao izgubljeno vino.
 *
 * KOJE CINOVE UZIMA
 * -----------------
 * Ne hardkodira ih. Granica je najnoviji redak u knjizi — trenutak backfilla —
 * a uzimaju se svi `Pretok` i `IzlazVina` nastali poslije nje koji u knjizi
 * nemaju nijedan redak. Time je skript idempotentan: drugo pokretanje nema sto
 * odigrati.
 *
 * `naManjak` je PUKNI, namjerno. Racun mora izaci na nulu; ako ne izadje, znaci
 * da zaostatak nisu samo ovi cinovi i to mora stati glasno, prije upisa.
 *
 * STO NE DIRA
 * -----------
 * `Tank` — ni jedno polje. Kolicine u tankovima su vec tocne; kriva je samo
 * knjiga. Otisak tankova prije i poslije mora biti identican, i skript ga
 * ispisuje da se to vidi.
 *
 * SIGURNOST: bez `--upisi` sve radi u transakciji koja na kraju NAMJERNO pukne,
 * pa u bazi ne ostaje nijedan redak.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { uLitre, uMl } from "../lib/filtracija";
import { stanjeSvihTankova } from "../lib/berba-model";
import { zabiljeziIzlaz, zabiljeziPrijenos, type Tx } from "../lib/berba-knjiga";

const ARGV = process.argv.slice(2);
const UPISI = ARGV.includes("--upisi");

/** Ispod mililitra je zaokruzivanje, ne razlika. Isti prag kao provjeri-berbu. */
const PRAG_ML = 1;

class Prekid extends Error {}

// ---------------------------------------------------------------------------
// Cinovi
// ---------------------------------------------------------------------------

type Cin =
  | {
      vrsta: "PRETOK";
      id: string;
      kada: Date;
      korisnikId: string | null;
      izvori: Array<{ tankId: string; broj: number; litre: number }>;
      ciljevi: Array<{ tankId: string; broj: number; litre: number }>;
    }
  | {
      vrsta: "IZLAZ";
      id: string;
      kada: Date;
      korisnikId: string | null;
      tankId: string;
      broj: number;
      litre: number;
      tip: string;
      napomena: string | null;
    };

function broj(x: number, d = 3): string {
  return Number(x).toFixed(d);
}

async function otisakTankova(): Promise<string> {
  const r = await prisma.$queryRawUnsafe<Array<{ md5: string }>>(
    `SELECT md5(string_agg(broj || ':' || COALESCE("kolicinaVinaUTanku",0)::text, ',' ORDER BY broj)) AS md5 FROM "Tank"`
  );
  return r[0]?.md5 ?? "—";
}

/** Trenutak backfilla: najnoviji redak koji knjiga vec ima. */
async function granicaKnjige(): Promise<Date | null> {
  const zadnji = await prisma.berbaKretanje.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return zadnji?.createdAt ?? null;
}

async function skupiCinove(granica: Date): Promise<Cin[]> {
  const cinovi: Cin[] = [];

  const pretoci = await prisma.pretok.findMany({
    where: { createdAt: { gt: granica } },
    orderBy: { createdAt: "asc" },
    include: {
      izvori: { include: { tank: { select: { broj: true } } } },
      ciljevi: { include: { tank: { select: { broj: true } } } },
    },
  });

  for (const p of pretoci) {
    const vecUKnjizi = await prisma.berbaKretanje.count({
      where: { pretokId: p.id },
    });

    if (vecUKnjizi > 0) continue;

    cinovi.push({
      vrsta: "PRETOK",
      id: p.id,
      kada: p.createdAt,
      korisnikId: p.korisnikId ?? null,
      izvori: p.izvori.map((i) => ({
        tankId: i.tankId,
        broj: i.tank?.broj ?? 0,
        litre: Number(i.kolicina),
      })),
      ciljevi: p.ciljevi.map((c) => ({
        tankId: c.tankId,
        broj: c.tank?.broj ?? 0,
        litre: Number(c.kolicina),
      })),
    });
  }

  const izlazi = await prisma.izlazVina.findMany({
    where: { createdAt: { gt: granica } },
    orderBy: { createdAt: "asc" },
    include: { tank: { select: { broj: true } } },
  });

  for (const i of izlazi) {
    const vecUKnjizi = await prisma.berbaKretanje.count({
      where: { izlazVinaId: i.id },
    });

    if (vecUKnjizi > 0) continue;

    cinovi.push({
      vrsta: "IZLAZ",
      id: i.id,
      kada: i.createdAt,
      korisnikId: i.korisnikId ?? null,
      tankId: i.tankId,
      broj: i.tank?.broj ?? 0,
      litre: Number(i.kolicinaLitara),
      tip: String(i.tip),
      napomena: i.napomena ?? null,
    });
  }

  // Kronoloski — tako je i bilo, i tako nijedan medjukorak ne moze otici u minus.
  return cinovi.sort((a, b) => a.kada.getTime() - b.kada.getTime());
}

/**
 * Cinovi koje ovaj skript NE zna odigrati. Da ih ima, poravnanje ne bi bilo
 * potpuno, pa se radije stane nego da se tiho preskoci.
 */
async function neznaniCinovi(granica: Date): Promise<string[]> {
  const problemi: string[] = [];

  const punjenja = await prisma.punjenjeTanka.count({
    where: { createdAt: { gt: granica } },
  });

  if (punjenja > 0) {
    problemi.push(`${punjenja} punjenja tanka nakon granice (ULAZ se ne odigrava ovdje)`);
  }

  const zadaci = await prisma.zadatak.count({
    where: { status: "IZVRSEN", izvrsenoAt: { gt: granica } },
  });

  if (zadaci > 0) {
    problemi.push(`${zadaci} izvrsenih zadataka prijenosa nakon granice (FILTRACIJA se ne odigrava ovdje)`);
  }

  return problemi;
}

// ---------------------------------------------------------------------------
// Odigravanje
// ---------------------------------------------------------------------------

async function odigraj(tx: Tx, cin: Cin): Promise<void> {
  if (cin.vrsta === "PRETOK") {
    await zabiljeziPrijenos(tx, {
      izvori: cin.izvori.map((i) => ({ tankId: i.tankId, litre: i.litre })),
      ciljevi: cin.ciljevi.map((c) => ({ tankId: c.tankId, litre: c.litre })),
      vrsta: "PRETOK",
      veza: { pretokId: cin.id },
      korisnikId: cin.korisnikId,
      dogodenoAt: cin.kada,
      // PUKNI: racun mora izaci. Vidi zaglavlje.
      naManjak: "PUKNI",
    });

    return;
  }

  await zabiljeziIzlaz(tx, {
    tankId: cin.tankId,
    litre: cin.litre,
    veza: { izlazVinaId: cin.id },
    korisnikId: cin.korisnikId,
    dogodenoAt: cin.kada,
    napomena: cin.napomena,
    naManjak: "PUKNI",
  });
}

/** Retci koje je taj cin upravo upisao — citaju se iz baze, ne racunaju napamet. */
async function retciCina(tx: Tx, cin: Cin) {
  return tx.berbaKretanje.findMany({
    where:
      cin.vrsta === "PRETOK" ? { pretokId: cin.id } : { izlazVinaId: cin.id },
    orderBy: { createdAt: "asc" },
    select: {
      berbaId: true,
      izTankId: true,
      uTankId: true,
      litre: true,
      vrsta: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Glavni tok
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    UPISI
      ? "\nPORAVNANJE KNJIGE — STVARNI UPIS.\n"
      : "\nPORAVNANJE KNJIGE — SUHI HOD. U bazu se NE upisuje nista.\n"
  );

  const otisakPrije = await otisakTankova();
  console.log(`Otisak tankova prije:  ${otisakPrije}`);

  const granica = await granicaKnjige();

  if (!granica) {
    console.log("\nKnjiga je prazna — najprije backfill.");
    return;
  }

  console.log(`Granica (zadnji redak knjige): ${granica.toISOString()}\n`);

  const problemi = await neznaniCinovi(granica);

  if (problemi.length > 0) {
    console.log("STANI — ima cinova koje ovaj skript ne zna odigrati:");
    for (const p of problemi) console.log(`  - ${p}`);
    console.log("\nNista nije upisano.");
    process.exitCode = 1;
    return;
  }

  const cinovi = await skupiCinove(granica);

  if (cinovi.length === 0) {
    console.log("Nema cinova za odigrati — knjiga je u koraku s njima.");
    return;
  }

  const tankovi = await prisma.tank.findMany({
    select: { id: true, broj: true, kolicinaVinaUTanku: true },
    orderBy: { broj: "asc" },
  });

  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));

  // --- razlike PRIJE ------------------------------------------------------
  const stanjePrije = await stanjeSvihTankova(prisma);
  const knjigaPrije = new Map<string, number>();

  for (const [tankId, popis] of stanjePrije) {
    knjigaPrije.set(tankId, popis.reduce((z, s) => z + s.ml, 0));
  }

  console.log("=== RAZLIKE PRIJE ===\n");
  let razlikaPrije = 0;

  for (const t of tankovi) {
    const uTanku = uMl(Number(t.kolicinaVinaUTanku ?? 0));
    const uKnjizi = knjigaPrije.get(t.id) ?? 0;
    if (Math.abs(uTanku - uKnjizi) < PRAG_ML) continue;

    razlikaPrije++;
    console.log(
      `  T${String(t.broj).padEnd(4)} tank ${broj(uLitre(uTanku)).padStart(10)} L   knjiga ${broj(
        uLitre(uKnjizi)
      ).padStart(10)} L   razlika ${broj(uLitre(uTanku - uKnjizi)).padStart(10)} L`
    );
  }

  if (razlikaPrije === 0) console.log("  (nema razlika)");

  // --- odigravanje ---------------------------------------------------------
  console.log(`\n=== CINOVI KOJI SE ODIGRAVAJU (${cinovi.length}), kronoloski ===`);

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const [n, cin] of cinovi.entries()) {
          const glava =
            cin.vrsta === "PRETOK"
              ? `PRETOK  ${cin.izvori
                  .map((i) => `T${i.broj} ${broj(i.litre)} L`)
                  .join(" + ")}  →  ${cin.ciljevi
                  .map((c) => `T${c.broj} ${broj(c.litre)} L`)
                  .join(" + ")}`
              : `IZLAZ   T${cin.broj} ${broj(cin.litre)} L  (${cin.tip})`;

          console.log(
            `\n${String(n + 1).padStart(2)}. ${cin.kada.toISOString().slice(0, 19).replace("T", " ")}  ${glava}`
          );
          console.log(
            `    veza: ${cin.vrsta === "PRETOK" ? "pretokId" : "izlazVinaId"} = ${cin.id}`
          );
          console.log(`    korisnikId: ${cin.korisnikId ?? "—"}`);

          await odigraj(tx, cin);

          const redci = await retciCina(tx, cin);

          console.log(`    retci u knjizi (${redci.length}):`);

          for (const r of redci) {
            const iz = r.izTankId ? `T${brojTanka.get(r.izTankId) ?? "?"}` : "—";
            const u = r.uTankId
              ? `T${brojTanka.get(r.uTankId) ?? "?"}`
              : "van podruma";

            console.log(
              `      ${iz.padEnd(6)} → ${u.padEnd(12)} ${broj(Number(r.litre)).padStart(10)} L   ${
                r.vrsta
              }   berba ${r.berbaId.slice(0, 8)}`
            );
          }
        }

        // --- razlike POSLIJE ------------------------------------------------
        const stanjePoslije = await stanjeSvihTankova(tx);
        const knjigaPoslije = new Map<string, number>();

        for (const [tankId, popis] of stanjePoslije) {
          knjigaPoslije.set(tankId, popis.reduce((z, s) => z + s.ml, 0));
        }

        console.log("\n=== RAZLIKE POSLIJE ===\n");
        let razlikaPoslije = 0;

        for (const t of tankovi) {
          const uTanku = uMl(Number(t.kolicinaVinaUTanku ?? 0));
          const uKnjizi = knjigaPoslije.get(t.id) ?? 0;
          if (Math.abs(uTanku - uKnjizi) < PRAG_ML) continue;

          razlikaPoslije++;
          console.log(
            `  T${String(t.broj).padEnd(4)} tank ${broj(uLitre(uTanku)).padStart(10)} L   knjiga ${broj(
              uLitre(uKnjizi)
            ).padStart(10)} L   razlika ${broj(uLitre(uTanku - uKnjizi)).padStart(10)} L`
          );
        }

        if (razlikaPoslije === 0) {
          console.log("  NEMA NIJEDNE RAZLIKE — knjiga se slaze sa svim tankovima.");
        }

        const ukupnoRedaka = await tx.berbaKretanje.count();
        const ukupnoBerbi = await tx.berba.count();

        console.log(
          `\n  knjiga poslije: ${ukupnoBerbi} zapisa berbe, ${ukupnoRedaka} kretanja`
        );

        if (!UPISI) {
          throw new Prekid("suhi hod");
        }
      },
      { timeout: 120_000, maxWait: 20_000 }
    );
  } catch (e) {
    if (!(e instanceof Prekid)) throw e;
  }

  const otisakPoslije = await otisakTankova();

  console.log(`\nOtisak tankova poslije: ${otisakPoslije}`);
  console.log(
    otisakPrije === otisakPoslije
      ? "  ok — Tank nije diran."
      : "  PAZI — otisak se promijenio, a poravnanje ne smije dirati Tank."
  );

  console.log(
    UPISI
      ? "\nUPISANO.\n"
      : "\nSUHI HOD GOTOV. U bazu nije upisan nijedan redak.\nZa stvarni upis:  npm run berba:poravnaj -- --upisi\n"
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
