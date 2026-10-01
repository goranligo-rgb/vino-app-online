/**
 * MJERENJE SNIMKE VINA — koliko kosta snimka jednog izvora i koliko traje
 * transakcija pretoka s pet izvora. Alat za ponovno mjerenje kad se
 * usporenje pojavi na produkciji (vidi lib/snimka-vina.ts).
 *
 * Pokretanje:  npx tsx scripts/mjeri-snimku.ts
 *
 * Od koraka 5c mjeri i ZAVRSNI IZLAZ (lib/izlaz-vina.ts): 29.09.2026. sa
 * snimkom i kopiranjem u arhivu 2,8–3,1 s na T42 (vidi komentar uz snimku).
 *
 * SIGURNOST: svaka transakcija na kraju NAMJERNO PUKNE (Rollback), pa u bazi
 * ne ostaje nijedan redak — na kraju se to i provjeri. Pretok dira PRAVE
 * tankove i drzi ih zakljucane dok transakcija traje (nekoliko sekundi).
 * Nijedan korak ne radi nista izvan baze (motor i arhiviranje nemaju storage
 * ni fetch).
 *
 * MJERENJE 29.09.2026. (s lokalnog racunala, ~22 ms po upitu; Vercel je u
 * fra1, uz bazu):
 *   - pretok 5 izvora → T1 BEZ snimke 2,4–2,8 s / 99 upita (motor 1,9 s / 75);
 *   - isti SA snimkom 6,2–6,4 s / 254 upita;
 *   - jedan izvor: median 0,4 s / 16 upita, najsporiji T42 1,3 s / 56 upita.
 * Osnovica BEZ snimke izmjerena je prije nego je motor dobio korak 6c; danas
 * motor s `pretokId` uvijek snima, pa je ova skripta vise ne moze ponoviti.
 *
 * Izvori su izabrani kao najgori slucaj: T42 (150 L djelomicno, blend od 14
 * izvora) i cetiri tanka koja se isprazne do kraja. Ako se podrum promijeni
 * pa ne stanu u cilj, promijeni IZVORI/CILJ.
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { izvrsiPretok } from "../lib/pretok-motor";
import { procitajMonitorVina, snimiVinoKojeIzlazi } from "../lib/snimka-vina";
import { izvrsiIzlaz } from "../lib/izlaz-vina";

type Tx = Prisma.TransactionClient;

// Vlastiti klijent, da se upiti mogu brojati.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: [{ emit: "event", level: "query" }],
});

let upita = 0;
(db as any).$on("query", () => {
  upita++;
});

class Rollback extends Error {}

const IZVORI: Array<{ broj: number; litre: number | "sve" }> = [
  { broj: 42, litre: 150 },
  { broj: 43, litre: "sve" },
  { broj: 2, litre: "sve" },
  { broj: 22, litre: "sve" },
  { broj: 18, litre: "sve" },
];
const CILJ = 1;

async function mjeri<T>(fn: () => Promise<T>) {
  const u0 = upita;
  const t0 = performance.now();
  const r = await fn();
  return { r, ms: performance.now() - t0, upita: upita - u0 };
}

/** Transakcija koja se uvijek vraca unatrag; vraca izmjereno. */
async function uRollbacku<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let izlaz!: T;
  try {
    await db.$transaction(
      async (tx) => {
        izlaz = await fn(tx);
        throw new Rollback();
      },
      { timeout: 60_000, maxWait: 5_000 }
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return izlaz;
}

const f = (ms: number) => `${Math.round(ms)} ms`;

// ---------------------------------------------------------------------------
// TRANSAKCIJA PRETOKA — redoslijed iz app/api/pretok/route.ts: pretok.create,
// snapshot po cilju i izvoru, motor (sa snimkom, korak 6c), pretok.update,
// mjerenje + pretokMjerenje za cilj, ciljPoslije.
// ---------------------------------------------------------------------------
async function transakcijaPretoka(
  tx: Tx,
  izvori: Array<{ tank: any; kolicina: number }>,
  cilj: any,
  korisnikId: string
) {
  const t0 = performance.now();
  const u0 = upita;
  const ukupno = izvori.reduce((z, i) => z + i.kolicina, 0);
  const pretok = await tx.pretok.create({
    data: {
      ciljTankId: cilj.id,
      tip: "CUVEE",
      korisnikId,
      napomena: "MJERENJE — rollback",
      nacin: "BEZ",
      izvori: {
        create: izvori.map((i) => ({ tankId: i.tank.id, kolicina: i.kolicina })),
      },
      ciljevi: { create: [{ tankId: cilj.id, kolicina: ukupno, redoslijed: 0 }] },
    },
    include: { izvori: true },
  });
  for (const t of [cilj, ...izvori.map((i) => i.tank)]) {
    const snap = await tx.pretokSnapshot.create({
      data: {
        pretokId: pretok.id,
        tankId: t.id,
        uloga: t.id === cilj.id ? "CILJ" : "IZVOR",
        brojTanka: t.broj,
        kolicinaPrije: Number(t.kolicinaVinaUTanku ?? 0),
        sortaPrije: t.sorta,
        nazivVinaPrije: null,
        godistePrije: t.godiste,
        kapacitetPrije: t.kapacitet,
        tipTankaPrije: t.tip,
        opisPrije: t.opis,
      },
    });
    if (t.udjeliSorti.length > 0)
      await tx.pretokSnapshotSorta.createMany({
        data: t.udjeliSorti.map((u: any) => ({
          snapshotId: snap.id,
          nazivSorte: u.nazivSorte,
          postotak: u.postotak,
        })),
      });
    if (t.blendIzvori.length > 0)
      await tx.pretokSnapshotBlend.createMany({
        data: t.blendIzvori.map((b: any) => ({
          snapshotId: snap.id,
          izvorTankId: b.izvorTankId ?? null,
          izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
          nazivVina: b.nazivVina ?? null,
          sorta: b.sorta ?? null,
          kolicina: Number(b.kolicina),
          postotak: Number(b.postotak),
        })),
      });
  }

  const motor = await mjeri(() =>
    izvrsiPretok(tx, {
      izvori: izvori.map((i) => ({ tankId: i.tank.id, kolicina: i.kolicina })),
      ciljevi: [{ tankId: cilj.id, kolicina: ukupno }],
      vrsta: "CUVEE",
      nacin: "BEZ",
      napomena: "MJERENJE — rollback",
      korisnikId,
      pretokId: pretok.id,
      dogodenoAt: pretok.datum,
      noviIdentitet: { nazivVina: "MJERENJE", sorta: "Cuvée", godiste: 2026, sifra: "44-0926-1" },
    })
  );

  await tx.pretok.update({
    where: { id: pretok.id },
    data: {
      kolicinaIzlaz: motor.r.izasloLitara,
      gubitakLitara: motor.r.gubitakLitara,
    },
  });
  const m = await tx.mjerenje.create({
    data: { tankId: cilj.id, alkohol: 12.5, jeRucno: false, napomena: "MJERENJE" },
  });
  await tx.pretokMjerenje.create({
    data: { pretokId: pretok.id, mjerenjeId: m.id, tankId: cilj.id },
  });
  await tx.tank.findUniqueOrThrow({
    where: { id: cilj.id },
    include: { udjeliSorti: true, blendIzvori: true },
  });

  return {
    ukupno: { ms: performance.now() - t0, upita: upita - u0 },
    motor: { ms: motor.ms, upita: motor.upita },
    snimki: await tx.snimkaVina.count({ where: { pretokId: pretok.id } }),
    ispraznjeno: motor.r.izvori.filter((x) => x.paoNaNulu).length,
  };
}

async function main() {
  // Latencija jednog upita — sve ostalo je uglavnom njezin visekratnik.
  const pingovi: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t = performance.now();
    await db.$queryRawUnsafe("SELECT 1");
    pingovi.push(performance.now() - t);
  }
  pingovi.sort((a, b) => a - b);
  console.log(
    `\nLATENCIJA SELECT 1: median ${f(pingovi[5])}, min ${f(pingovi[0])}, max ${f(pingovi[9])}`
  );

  const sviTankovi = await db.tank.findMany({
    include: { udjeliSorti: true, blendIzvori: true },
    orderBy: { broj: "asc" },
  });
  const poBroju = new Map(sviTankovi.map((t) => [t.broj, t]));
  const korisnik = await db.user.findFirstOrThrow({ select: { id: true } });

  // 1. CITANJE MONITORA, JEDAN IZVOR — svaki tank s vinom.
  console.log("\n1. CITANJE MONITORA, JEDAN IZVOR (svaki tank s vinom, u transakciji)");
  const jedan: Array<{ broj: number; ms: number; upita: number }> = [];
  for (const t of sviTankovi.filter((t) => Number(t.kolicinaVinaUTanku ?? 0) > 0)) {
    const r = await uRollbacku((tx) =>
      mjeri(() => procitajMonitorVina(tx, t.id, new Date()))
    );
    jedan.push({ broj: t.broj, ms: r.ms, upita: r.upita });
  }
  jedan.sort((a, b) => a.ms - b.ms);
  const med = jedan[Math.floor(jedan.length / 2)];
  const najg = jedan[jedan.length - 1];
  console.log(
    `   ${jedan.length} tankova; median ${f(med.ms)} / ${med.upita} upita; najsporiji T${najg.broj} ${f(najg.ms)} / ${najg.upita} upita`
  );

  // 2. CIJELA SNIMKA, PET IZVORA REDOM, u jednoj transakciji.
  console.log("\n2. snimiVinoKojeIzlazi, PET IZVORA REDOM, U JEDNOJ TRANSAKCIJI");
  await uRollbacku(async (tx) => {
    const lazniPretok = await tx.pretok.create({
      data: { napomena: "MJERENJE — rollback", tip: "CUVEE" },
    });
    let ms = 0;
    let n = 0;
    for (const i of IZVORI) {
      const t = poBroju.get(i.broj)!;
      const prije = Number(t.kolicinaVinaUTanku);
      const otislo = i.litre === "sve" ? prije : i.litre;
      const r = await mjeri(() =>
        snimiVinoKojeIzlazi(tx, {
          cin: "PRETOK",
          pretokId: lazniPretok.id,
          tankId: t.id,
          dogodenoAt: new Date(),
          litrePrije: prije,
          litreOtislo: otislo,
          ispraznjen: otislo >= prije,
          korisnikId: null,
        })
      );
      console.log(`   T${i.broj}: ${f(r.ms)} / ${r.upita} upita`);
      ms += r.ms;
      n += r.upita;
    }
    console.log(`   UKUPNO ${f(ms)} / ${n} upita`);
  });

  // 3. PRETOK S PET IZVORA, pravi put (motor snima u koraku 6c). Dvaput.
  const izvori = IZVORI.map((i) => {
    const t = poBroju.get(i.broj)!;
    return {
      tank: t,
      kolicina: i.litre === "sve" ? Number(t.kolicinaVinaUTanku) : i.litre,
    };
  });
  const cilj = poBroju.get(CILJ)!;
  for (let k = 0; k < 2; k++) {
    const r = await uRollbacku((tx) =>
      transakcijaPretoka(tx, izvori, cilj, korisnik.id)
    );
    console.log(
      `\n3. PRETOK 5 IZVORA → T${CILJ}: ${f(r.ukupno.ms)} / ${r.ukupno.upita} upita ` +
        `(motor sa snimkom ${f(r.motor.ms)} / ${r.motor.upita} upita, snimki ${r.snimki}, ispraznjeno ${r.ispraznjeno})`
    );
  }

  // 4. ZAVRSNI IZLAZ (punjenje cijelog tanka), pravi put: izvrsiIzlaz sa
  //    zakljucavanjem, snimkom i arhiviranjem. Dvaput po tanku.
  for (const broj of [42, 43, 5]) {
    const t = poBroju.get(broj)!;
    for (let k = 0; k < 2; k++) {
      const r = await uRollbacku((tx) =>
        mjeri(() =>
          izvrsiIzlaz(
            tx,
            { tankId: t.id, tip: "PUNJENJE", datum: new Date(), kolicinaLitara: Number(t.kolicinaVinaUTanku), brojBocaRaw: null, volumenBoce: 0.75, korisnickaNapomena: "MJERENJE — rollback" },
            { id: korisnik.id, ime: null }
          )
        )
      );
      console.log(`
4. ZAVRSNI IZLAZ T${broj}: ${f(r.ms)} / ${r.upita} upita (arhiva ${r.r.arhivaId ? "da" : "NE"})`);
    }
  }

  // Dokaz da nista nije ostalo.
  const [ostalo] = await db.$queryRawUnsafe<any[]>(
    `SELECT (SELECT count(*) FROM "SnimkaVina")::int AS snimke, (SELECT count(*) FROM "Pretok" WHERE napomena LIKE 'MJERENJE%')::int AS pretoci, (SELECT count(*) FROM "IzlazVina" WHERE napomena LIKE 'MJERENJE%')::int AS izlazi`
  );
  console.log("\nOSTALO U BAZI:", ostalo);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
