/**
 * OZNACAVANJE KVASACA u katalogu preparata.
 *
 * Pokretanje:
 *   SUHI HOD (samo ispis, nista se ne mijenja):  npm run kvasci:oznaci
 *   STVARNI UPIS:                                npm run kvasci:oznaci -- --upisi
 *
 * BEZ `--upisi` NE DIRA BAZU. Ispisuje prijedlog i staje. To je namjerno i nije
 * opreznost radi opreznosti: granica izmedu kvasca i hranjiva u ovom katalogu
 * je stvarno mutna. GO FERM je hrana za rehidraciju, OPTI-MUM WHITE zastitni
 * pripravak, FERMAID E hranjivo — a nekoliko imena ne moze razlucti nitko tko
 * nije vinar. Prijedlog se zato PREGLEDA prije upisa.
 *
 * CEMU `jeKvasac` UOPCE SLUZI — I CEMU NE
 * ---------------------------------------
 * Iskljucivo za suzavanje popisa pri otvaranju fermentacije: katalog ima 76
 * preparata, kvasaca je dvadesetak. NIJE klasifikacija preparata i nista drugo
 * ga ne cita — ni doziranje, ni zalihe, ni zadaci. Kriva oznaka zato ne kvari
 * podatke, samo popis; ali popis je ono zbog cega stupac postoji.
 *
 * NIKAD NE FILTRIRAJ ISPIS PO OVOME. Dnevnik fermentacije mora pokazati SVE
 * sto je islo u most — kvasac, hranu, enzime, zastitne pripravke — citano iz
 * Zadatak/ZadatakStavka BEZ ijednog filtra. Onih 46 preparata koje ova skripta
 * svrstava pod "nije kvasac" ide na ispis jednako kao i kvasci. Filtar po
 * `jeKvasac` na ispisu pojeo bi pola dnevnika.
 *
 * KAKO SE PREPOZNAJE
 * ------------------
 * Po nazivu, prema proizvodjackim linijama koje su u ovom katalogu zaista
 * kvasci (Lallemand, AEB, Erbsloh…). Uzorci su namjerno usko pisani: bolje da
 * covjek doda tri koja su promakla nego da skripta tiho oznaci hranjivo.
 *
 * NEJASNI SE NE OZNACAVAJU NEGO ISPISUJU ODVOJENO. Preparat koji lici na
 * kvasac ali se ne da potvrditi iz naziva ide u zaseban popis "za rucnu
 * odluku". Skripta ga NECE upisati ni s `--upisi`.
 *
 * IDEMPOTENTNO: upisuje samo tamo gdje se vrijednost stvarno mijenja, i nikad
 * ne GASI postojecu oznaku. Tko je rucno oznacio preparat kojeg uzorci ne
 * hvataju, ostaje oznacen — skripta ne zna bolje od covjeka.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

const UPISI = process.argv.includes("--upisi");

/**
 * Uzorci naziva koji su u OVOM katalogu kvasci.
 *
 * Svaki redak nosi obrazlozenje, da se za godinu dana zna zasto je tu i da se
 * popis moze osporiti bez arheologije.
 */
const KVASCI: Array<{ uzorak: RegExp; zasto: string }> = [
  { uzorak: /^LALVIN\b/i, zasto: "Lallemand LALVIN — linija vinskih kvasaca" },
  { uzorak: /^LALLVIN\b/i, zasto: "LALVIN, zapisan s tipfelerom u katalogu" },
  { uzorak: /^UVAFERM\b/i, zasto: "Lallemand UVAFERM — linija vinskih kvasaca" },
  { uzorak: /^RENAISSANCE\b/i, zasto: "Renaissance Yeast — vinski kvasci" },
  { uzorak: /^LEVEL\s*2\b/i, zasto: "Lallemand Level2 — kvasci (BIODIVA, Initia)" },
  { uzorak: /^LALLEMAND\b/i, zasto: "Lallemand, imenovan proizvodjacem (IONYS, SAUVY, Level 2)" },
  { uzorak: /^ANCHOR\b/i, zasto: "Anchor Oenology — vinski kvasci" },
  { uzorak: /^SIHAFERM\b/i, zasto: "Erbsloh SIHAFERM — vinski kvasci" },
  // Premjesten iz "za rucnu odluku" 28.08.2026, odlukom vinara. Uzorak je
  // namjerno na obitelj, ne na "ALCHEMY II": katalog danas ima samo taj jedan,
  // ali sljedeca sezona donosi i druge iz iste linije.
  { uzorak: /^ALCHEMY/i, zasto: "Lallemand Alchemy — mjesavina kvasaca (potvrdio vinar)" },
];

/**
 * Slicni na kvasac, ali NISU — ili se iz naziva ne da potvrditi.
 *
 * Ovi se ISPISUJU za rucnu odluku i NIKAD se ne upisuju automatski. Popis
 * postoji da se ne trazi dvaput: svaki od njih je vec jednom bio kandidat.
 */
const ZA_RUCNU_ODLUKU: Array<{ uzorak: RegExp; dvojba: string }> = [
  { uzorak: /^SIHA\s+PROFERM/i, dvojba: "Erbsloh Proferm — kvasac ili aktivator?" },
  { uzorak: /^SIHA\s+SPEEDFERM/i, dvojba: "Erbsloh Speedferm — kvasac ili aktivator vrenja?" },
  { uzorak: /^SUPERSTART/i, dvojba: "Superstart — startna kultura ili hranjivo?" },
  { uzorak: /^FORTIFERM/i, dvojba: "Fortiferm — kvasac ili hranjivo?" },
  { uzorak: /^GLUTASTAR/i, dvojba: "Glutastar — derivat kvasca, ali nije ziva kultura" },
  { uzorak: /^AFFINITY/i, dvojba: "Affinity — derivat kvasca?" },
];

/** Poznata hranjiva i pomocna sredstva — samo da se vidi da nisu zaboravljena. */
const SIGURNO_NIJE = /^(GO FERM|FERMAID|OPTI-MUM|NUTRISTART|STIMULA|LONCEVITI|OPERA|POLYMUST)/i;

function jeKvasacPoUzorku(naziv: string): string | null {
  for (const k of KVASCI) if (k.uzorak.test(naziv)) return k.zasto;
  return null;
}

function jeDvojben(naziv: string): string | null {
  for (const d of ZA_RUCNU_ODLUKU) if (d.uzorak.test(naziv)) return d.dvojba;
  return null;
}

async function main() {
  console.log(
    UPISI
      ? "OZNACAVANJE KVASACA — STVARNI UPIS.\n"
      : "OZNACAVANJE KVASACA — SUHI HOD. Baza se NE dira.\n"
  );

  const preparati = await prisma.preparation.findMany({
    select: { id: true, naziv: true, jeKvasac: true, aktivan: true },
    orderBy: { naziv: "asc" },
  });

  const zaUpis: Array<{ id: string; naziv: string; zasto: string }> = [];
  const vecOznaceni: string[] = [];
  const dvojbeni: Array<{ naziv: string; dvojba: string; oznacen: boolean }> = [];
  const ostali: string[] = [];

  for (const p of preparati) {
    const zasto = jeKvasacPoUzorku(p.naziv);
    const dvojba = jeDvojben(p.naziv);

    if (zasto) {
      if (p.jeKvasac) vecOznaceni.push(p.naziv);
      else zaUpis.push({ id: p.id, naziv: p.naziv, zasto });
      continue;
    }

    if (dvojba) {
      dvojbeni.push({ naziv: p.naziv, dvojba, oznacen: p.jeKvasac });
      continue;
    }

    if (p.jeKvasac) {
      // Rucno oznacen, uzorci ga ne hvataju. NE gasi se.
      vecOznaceni.push(`${p.naziv}  (rucno oznacen — uzorak ga ne hvata)`);
      continue;
    }

    ostali.push(p.naziv);
  }

  console.log(`Katalog: ${preparati.length} preparata, ${vecOznaceni.length} vec oznaceno.\n`);

  console.log(`KANDIDATI ZA OZNAKU (${zaUpis.length}):`);
  if (zaUpis.length === 0) {
    console.log("  nema — sve sto uzorci hvataju je vec oznaceno.");
  } else {
    for (const k of zaUpis) console.log(`  ${k.naziv.padEnd(32)} ${k.zasto}`);
  }

  console.log(`\nZA RUCNU ODLUKU — NE UPISUJE SE (${dvojbeni.length}):`);
  if (dvojbeni.length === 0) {
    console.log("  nema.");
  } else {
    for (const d of dvojbeni) {
      console.log(
        `  ${d.naziv.padEnd(32)} ${d.dvojba}${d.oznacen ? "   [VEC OZNACEN]" : ""}`
      );
    }
    console.log(
      "\n  Ove skripta NECE dirati ni s --upisi. Ako koji od njih jest kvasac,\n" +
        "  oznaci ga rucno u bazi ili ga premjesti u KVASCI popis u ovoj skripti."
    );
  }

  if (vecOznaceni.length > 0) {
    console.log(`\nVEC OZNACENI (${vecOznaceni.length}):`);
    for (const n of vecOznaceni) console.log(`  ${n}`);
  }

  const promaklo = ostali.filter((n) => !SIGURNO_NIJE.test(n));
  console.log(`\nNIJE KVASAC — ostatak kataloga (${ostali.length}):`);
  console.log("  " + promaklo.slice(0, 60).join("\n  "));

  if (!UPISI) {
    console.log(
      `\nSUHI HOD: nista nije upisano. Za stvarni upis ${zaUpis.length} oznaka:\n` +
        "  npm run kvasci:oznaci -- --upisi\n"
    );
    return;
  }

  if (zaUpis.length === 0) {
    console.log("\nNema sto upisati.\n");
    return;
  }

  // Idempotentno: mijenja samo retke koji jos nemaju oznaku. Nikad ne gasi.
  const rezultat = await prisma.preparation.updateMany({
    where: { id: { in: zaUpis.map((k) => k.id) }, jeKvasac: false },
    data: { jeKvasac: true },
  });

  console.log(`\nUPISANO: ${rezultat.count} preparata oznaceno kao kvasac.`);

  const ukupno = await prisma.preparation.count({ where: { jeKvasac: true } });
  console.log(`Ukupno oznacenih kvasaca u katalogu: ${ukupno}.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
