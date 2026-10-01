/**
 * UNOS SIFRI VINA UNATRAG — korak 6 (sifra vina), jednokratni zahvat.
 *
 * Pokretanje:
 *   npx tsx scripts/unos-sifri.ts --korisnik=<email ili username> --dry-run
 *   npx tsx scripts/unos-sifri.ts --korisnik=<email ili username>
 *
 * Svakom od 40 punih tankova upisuje se interna sifra kroz CIN IMENOVANJA
 * (`zabiljeziImenovanje`, izvor RUCNO, razlog „unos šifre vina unatrag",
 * odAt = sada). Naziv i deklarirana sorta se PREPISUJU iz danasnjeg stanja:
 * zapis je potpuna snimka, pa bi izostavljeno polje obrisalo ime s ekrana.
 *
 * Tablica sifri je potvrdena od vlasnika 01.10.2026. (mjesec nastanka i broj
 * upisao je on; vidi lib/sifra-vina.ts — sifra se upisuje rukom, ne izvodi).
 *
 * STAJE PRIJE IJEDNOG UPISA kad:
 *   - ijedna sifra iz tablice ne prolazi `greskaSifre`;
 *   - tank iz tablice ne postoji ili je prazan;
 *   - puni tank nema sifru u tablici;
 *   - tank vec nosi sifru (ne pregazuje se tiho);
 *   - korisnik iz --korisnik ne postoji.
 *
 * SVE U JEDNOJ TRANSAKCIJI, svi tankovi zakljucani kao kod pretoka: izmedju
 * citanja imena i upisa ne smije uletjeti pretok. Nakon upisa, JOS U
 * TRANSAKCIJI, provjerava se: naziv i sorta identicni za svih 40, sifra
 * upisana, tocno 40 novih zapisa ImeVina, Tank nedirnut. Ako ista ne stima,
 * transakcija se vraca.
 *
 * `Tank` se NE pise (ni `sorta` — ista je), pa otisak kolicina mora ostati isti.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { imenaPodruma, zabiljeziImenovanje, type ImeVina } from "../lib/ime-vina";
import { greskaSifre } from "../lib/sifra-vina";
import { zakljucajTankove } from "../lib/filtracija";

const RAZLOG = "unos šifre vina unatrag";

/** Potvrdena tablica: broj tanka -> sifra. */
const TABLICA: ReadonlyArray<[number, string]> = [
  [2, "44-0926-1"],
  [3, "25-0926-1"],
  [4, "11-0926-1"],
  [5, "11-0926-2"],
  [6, "44-0926-5"],
  [7, "13-0926-1"],
  [8, "44-0726-1"],
  [9, "14-0926-1"],
  [10, "11-0926-3"],
  [11, "14-0926-2"],
  [12, "11-0926-4"],
  [13, "13-0926-2"],
  [15, "49-0825-1"],
  [16, "11-0926-5"],
  [17, "13-0926-3"],
  [18, "15-0926-1"],
  [19, "12-0926-1"],
  [20, "16-0926-1"],
  [21, "12-0926-2"],
  [22, "44-0926-2"],
  [25, "13-0926-4"],
  [26, "17-0926-1"],
  [27, "13-0926-5"],
  [28, "44-0926-3"],
  [29, "11-0926-6"],
  [30, "15-0925-1"],
  [31, "14-0925-1"],
  [32, "49-0825-2"],
  [33, "11-0926-7"],
  [34, "11-0926-8"],
  [35, "25-0926-2"],
  [36, "14-0926-3"],
  [37, "15-0926-2"],
  [38, "12-0926-3"],
  [40, "14-0926-4"],
  [41, "14-0926-5"],
  [42, "44-0926-4"],
  [43, "44-0925-1"],
  [44, "25-0123-1"],
  [45, "11-0926-9"],
];

const OCEKIVANO_TANKOVA = 40;

class Stop extends Error {}
class DryRunRollback extends Error {}

function arg(ime: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${ime}=`));
  return a ? a.slice(ime.length + 3) : null;
}

const prikaz = (s: string | null) => (s == null ? "∅" : `„${s}”`);

async function otisak(db: { $queryRaw: typeof prisma.$queryRaw }) {
  const [r] = await db.$queryRaw<Array<{ otisak: string; tankova: bigint; litara: number }>>`
    SELECT md5(string_agg(broj || ':' || COALESCE("kolicinaVinaUTanku", 0)::text, ',' ORDER BY broj)) AS otisak,
           count(*) AS tankova,
           COALESCE(sum("kolicinaVinaUTanku"), 0)::float8 AS litara
    FROM "Tank"
  `;
  return r;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const korisnikArg = arg("korisnik");

  // ---- 1. Provjere bez baze: oblik sifri i tablica sama ------------------
  const greske: string[] = [];
  const brojevi = new Set<number>();
  for (const [broj, sifra] of TABLICA) {
    const g = greskaSifre(sifra);
    if (g) greske.push(`T${broj}: ${g}`);
    if (!sifra.trim()) greske.push(`T${broj}: prazna sifra`);
    if (brojevi.has(broj)) greske.push(`T${broj}: tank je u tablici dvaput`);
    brojevi.add(broj);
  }
  if (TABLICA.length !== OCEKIVANO_TANKOVA) {
    greske.push(`tablica ima ${TABLICA.length} redaka, ocekivano ${OCEKIVANO_TANKOVA}`);
  }
  if (!korisnikArg) greske.push("nedostaje --korisnik=<email ili username>");
  if (greske.length) throw new Stop("STOP prije ijednog upisa:\n  " + greske.join("\n  "));

  const korisnik = await prisma.user.findFirst({
    where: { OR: [{ email: korisnikArg! }, { username: korisnikArg! }] },
    select: { id: true, ime: true },
  });
  if (!korisnik) throw new Stop(`STOP: korisnik „${korisnikArg}” ne postoji.`);

  console.log(dryRun ? "=== DRY-RUN (transakcija se vraca, nista se ne upisuje) ===" : "=== PRAVI UNOS ===");
  console.log(`korisnik: ${korisnik.ime}, razlog: „${RAZLOG}”\n`);

  const otisakPrije = await otisak(prisma);
  console.log(`otisak prije: ${otisakPrije.otisak} (${otisakPrije.tankova} tankova, ${otisakPrije.litara.toLocaleString("hr-HR")} L)`);

  // ---- 2. Sve ostalo u jednoj transakciji --------------------------------
  try {
    await prisma.$transaction(
      async (tx) => {
        const tankovi = await tx.tank.findMany({ select: { id: true, broj: true }, orderBy: { broj: "asc" } });
        const poBroju = new Map(tankovi.map((t) => [t.broj, t.id]));

        const nema = TABLICA.filter(([b]) => !poBroju.has(b)).map(([b]) => `T${b}`);
        if (nema.length) throw new Stop(`STOP: tankova iz tablice nema u bazi: ${nema.join(", ")}`);

        await zakljucajTankove(tx, TABLICA.map(([b]) => poBroju.get(b)!));

        const prije = await imenaPodruma(tx);

        const problemi: string[] = [];
        for (const [broj] of TABLICA) {
          const ime = prije.get(poBroju.get(broj)!);
          if (!ime || ime.razlog === "PRAZAN") problemi.push(`T${broj} je prazan — nema vina kojem bi se upisala sifra`);
          else if (ime.sifra) problemi.push(`T${broj} vec nosi sifru ${ime.sifra} — ne pregazuje se`);
        }
        for (const t of tankovi) {
          const ime = prije.get(t.id);
          if (ime && ime.razlog !== "PRAZAN" && !brojevi.has(t.broj)) {
            problemi.push(`T${t.broj} je pun, a u tablici nema sifru`);
          }
        }
        if (problemi.length) throw new Stop("STOP prije ijednog upisa:\n  " + problemi.join("\n  "));

        const imeVinaPrije = await tx.imeVina.count();
        const tankPrije = await tx.tank.findMany({ orderBy: { broj: "asc" } });
        const sada = new Date();

        // ---- upis ----
        for (const [broj, sifra] of TABLICA) {
          const tankId = poBroju.get(broj)!;
          const p = prije.get(tankId)!;
          const upisano = await zabiljeziImenovanje(tx, {
            tankId,
            odAt: sada,
            naziv: p.naziv,
            deklariranaSorta: p.deklariranaSorta,
            sifra,
            izvor: "RUCNO",
            prijeNaziv: p.naziv,
            prijeSorta: p.deklariranaSorta,
            prijeSifra: p.sifra,
            korisnikId: korisnik.id,
            razlog: RAZLOG,
          });
          if (!upisano) throw new Stop(`STOP: za T${broj} zapis NIJE nastao (bez imena i sorte?) — sve se vraca.`);
        }

        // ---- provjera, jos u transakciji ----
        const poslije = await imenaPodruma(tx);
        const odstupanja: string[] = [];
        console.log("\nTank\tIme prije\tIme poslije\tSorta prije\tSorta poslije\tŠifra prije\tŠifra poslije");
        for (const [broj, sifra] of TABLICA) {
          const id = poBroju.get(broj)!;
          const a = prije.get(id) as ImeVina;
          const b = poslije.get(id) as ImeVina;
          console.log(
            `T${broj}\t${prikaz(a.naziv)}\t${prikaz(b.naziv)}\t${prikaz(a.deklariranaSorta)}\t${prikaz(b.deklariranaSorta)}\t${prikaz(a.sifra)}\t${prikaz(b.sifra)}`
          );
          if (a.naziv !== b.naziv) odstupanja.push(`T${broj}: naziv se promijenio`);
          if (a.deklariranaSorta !== b.deklariranaSorta) odstupanja.push(`T${broj}: sorta se promijenila`);
          if (b.sifra !== sifra) odstupanja.push(`T${broj}: sifra je ${b.sifra}, ocekivano ${sifra}`);
        }
        // Tankovi izvan tablice: nista se ne smije promijeniti.
        for (const t of tankovi) {
          if (brojevi.has(t.broj)) continue;
          if (JSON.stringify(prije.get(t.id)) !== JSON.stringify(poslije.get(t.id))) {
            odstupanja.push(`T${t.broj} (izvan tablice): ime se promijenilo`);
          }
        }

        const novih = (await tx.imeVina.count()) - imeVinaPrije;
        if (novih !== OCEKIVANO_TANKOVA) odstupanja.push(`novih ImeVina zapisa ${novih}, ocekivano ${OCEKIVANO_TANKOVA}`);

        const tankPoslije = await tx.tank.findMany({ orderBy: { broj: "asc" } });
        if (JSON.stringify(tankPrije) !== JSON.stringify(tankPoslije)) odstupanja.push("tablica Tank se promijenila");

        const otisakU = await otisak(tx);
        if (otisakU.otisak !== otisakPrije.otisak) odstupanja.push(`otisak ${otisakU.otisak} ≠ ${otisakPrije.otisak}`);

        console.log(`\nnovih ImeVina zapisa: ${novih}`);
        console.log(`otisak u transakciji: ${otisakU.otisak}`);
        console.log(`Tank redci nepromijenjeni: ${JSON.stringify(tankPrije) === JSON.stringify(tankPoslije) ? "da" : "NE"}`);

        if (odstupanja.length) throw new Stop("ODSTUPANJA — sve se vraca:\n  " + odstupanja.join("\n  "));
        console.log("provjere u transakciji: sve stima");

        if (dryRun) throw new DryRunRollback();
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
  } catch (e) {
    if (e instanceof DryRunRollback) {
      console.log("\nDRY-RUN: transakcija vracena, u bazi nije ostao nijedan redak.");
      const o = await otisak(prisma);
      console.log(`otisak nakon dry-runa: ${o.otisak}`);
      return;
    }
    throw e;
  }

  // ---- 3. Nakon commita: jos jednom, izvan transakcije ---------------------
  const o = await otisak(prisma);
  const zapisa = await prisma.imeVina.count({ where: { razlog: RAZLOG } });
  console.log(`\nUPISANO. otisak poslije: ${o.otisak} (${o.otisak === otisakPrije.otisak ? "isti" : "RAZLIKUJE SE"})`);
  console.log(`ImeVina zapisa s razlogom „${RAZLOG}”: ${zapisa}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Stop ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
