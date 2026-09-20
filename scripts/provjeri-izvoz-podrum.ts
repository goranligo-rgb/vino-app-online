/**
 * PROVJERA IZVOZA PODRUMA U EXCEL nad pravom bazom — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run izvoz:provjeri
 *
 * SIGURNOST: iskljucivo SELECT, preko istog `dohvatiPodrum()` koji vrti i
 * tiskani izvjestaj. Nema transakcije, nema upisa. Sigurno je pokrenuti bilo
 * kad.
 *
 * ZASTO POSTOJI: ruta `/api/izvoz/podrum` cita sesiju iz kolacica pa se izvan
 * zahtjeva ne da pozvati. Ono sto se moze i mora provjeriti je racun koji puni
 * celije (`lib/izvoz-podrum.ts`) i ponasanje exceljs-a nad PRAVIM podacima:
 * jesu li brojevi brojevi i je li prazno doista prazno.
 *
 * STO OVO JEST: provjera da tablica koja izade iz baze ima oblik na kojem
 * sortiranje i filtriranje rade — bez tekstualnih brojeva, bez nula umjesto
 * praznine, s datumom kao datumom.
 *
 * STO OVO NIJE: provjera da su vrijednosti TOCNE. Da je kiselina 5,8 stvarno
 * izmjerena na tom vinu ne zna nijedan zapis; to je pitanje za `podaci.ts` i
 * za onoga tko je mjerio.
 *
 * Izlazni kod je 1 ako ijedna invarijanta padne.
 */

import "dotenv/config";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { dohvatiPodrum } from "../app/dashboard/izvjestaji/podrum/podaci";
import { sloziKartice } from "../app/dashboard/izvjestaji/podrum/model";
import { redakIzvoza, type RedakIzvoza } from "../lib/izvoz-podrum";

let pao = 0;
let proslo = 0;

function ok(uvjet: boolean, poruka: string, detalj = "") {
  if (uvjet) {
    proslo++;
    console.log(`  OK   ${poruka}`);
  } else {
    pao++;
    console.log(`  PAO  ${poruka}${detalj ? ` — ${detalj}` : ""}`);
  }
}

/** Stupci koji su tekst, ili prazni — nikad prazan string. */
const TEKSTUALNI: (keyof RedakIzvoza)[] = [
  "sorta",
  "sastav",
  "kvasac",
  "napomena",
];

/** Stupci koji u Excelu MORAJU biti broj, ili prazni. */
const BROJCANI: (keyof RedakIzvoza)[] = [
  "broj",
  "kolicina",
  "kapacitet",
  "kiselina",
  "secer",
  "alkohol",
  "ph",
  "so2Slobodni",
  "so2Ukupni",
];

async function main() {
  console.log("\n=== IZVOZ PODRUMA — provjera nad pravom bazom ===\n");

  const podaci = await dohvatiPodrum();
  const kartice = sloziKartice(podaci);
  const redci = kartice.map(redakIzvoza);

  console.log(
    `Dohvat: ${podaci.brojUpita} upita, ${podaci.trajanjeMs} ms, ` +
      `${podaci.puni.length} punih i ${podaci.prazni.length} praznih tankova.\n`
  );

  console.log("-- Oblik tablice --");

  ok(
    redci.length === podaci.puni.length,
    "jedan redak po punom tanku",
    `redaka ${redci.length}, punih ${podaci.puni.length}`
  );

  ok(
    redci.every((r) => !podaci.prazni.some((t) => t.broj === r.broj)),
    "nijedan prazan tank nije u tablici"
  );

  // Brojevi kao BROJEVI. `null` je dopusten (prazna celija), tekst nije —
  // jedan tekstualni broj u stupcu i Excel vise ne sortira numericki.
  const tekstualni: string[] = [];
  for (const r of redci) {
    for (const kljuc of BROJCANI) {
      const v = r[kljuc];
      if (v === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) {
        tekstualni.push(`T${r.broj}.${String(kljuc)}=${JSON.stringify(v)}`);
      }
    }
  }
  ok(
    tekstualni.length === 0,
    "svaki popunjeni brojcani stupac je konacan broj",
    tekstualni.slice(0, 5).join(", ")
  );

  ok(
    redci.every((r) => r.mjereno === null || r.mjereno instanceof Date),
    "stupac Mjereno je Date ili prazno"
  );

  const tekstoviReda = (r: RedakIzvoza): string[] =>
    TEKSTUALNI.map((kljuc) => r[kljuc]).filter(
      (s): s is string => typeof s === "string"
    );

  // Prazan tekst mora biti `null`, ne "": Excelov filtar "Blanks" prazan string
  // ne nalazi, pa bi stupac Napomena postao neupotrebljiv za izdvajanje.
  const prazniStringovi: string[] = [];
  for (const r of redci) {
    for (const kljuc of TEKSTUALNI) {
      if (r[kljuc] === "") prazniStringovi.push(`T${r.broj}.${String(kljuc)}`);
    }
  }
  ok(
    prazniStringovi.length === 0,
    "prazan tekst je prava praznina, a ne prazan string",
    prazniStringovi.slice(0, 5).join(", ")
  );

  // Prazno ostaje prazno: ni crtica, ni nula, ni "n/a".
  const crtice = redci.filter((r) =>
    tekstoviReda(r).some(
      (s) => s.includes("—") || s.trim() === "-" || s.toLowerCase() === "n/a"
    )
  );
  ok(crtice.length === 0, "nijedna tekstualna celija ne sadrzi crticu-zamjenu",
    crtice.map((r) => `T${r.broj}`).join(", "));

  // Smece iz skriptiranih zamjena i losih pretvorbi — u Excelu bi proslo
  // jednako tiho kao u JSX-u.
  const smece = redci.filter((r) =>
    tekstoviReda(r).some(
      (s) =>
        s.includes("[object Object]") ||
        s.includes("ARRAY(0x") ||
        s.includes("undefined") ||
        s.includes("NaN")
    )
  );
  ok(smece.length === 0, "nijedna celija ne sadrzi [object Object] / NaN / undefined",
    smece.map((r) => `T${r.broj}`).join(", "));

  console.log("\n-- Napomena i kvasac --");

  for (const k of kartice) {
    const r = redakIzvoza(k);
    const nap = r.napomena ?? "";

    if (k.kvasci.some((s) => s.poPartiji) && !nap.includes("po berbenoj partiji")) {
      ok(false, `T${k.broj}: kvasac po partiji bez napomene`);
    }
    if (k.kvasciBezZapisa > 0 && !nap.includes("bez zapisa o kvascu")) {
      ok(false, `T${k.broj}: rupa u kvascu bez napomene`);
    }
    // Obrnuti smjer: napomena ne smije tvrditi procjenu koje nema.
    if (nap.includes("po berbenoj partiji") && !k.kvasci.some((s) => s.poPartiji)) {
      ok(false, `T${k.broj}: napomena tvrdi procjenu koje nema`);
    }
  }

  const ima = (r: RedakIzvoza, s: string) => (r.napomena ?? "").includes(s);
  const sProcjenom = redci.filter((r) => ima(r, "po berbenoj partiji"));
  const sRupom = redci.filter((r) => ima(r, "bez zapisa o kvascu"));
  ok(true, `napomena o procjeni: ${sProcjenom.length} tankova`);
  ok(true, `napomena o rupi u kvascu: ${sRupom.length} tankova`);

  console.log("\n-- Kroz exceljs i natrag --");

  // Pravi .xlsx, pa se procita natrag: jedino tako se vidi je li broj u
  // datoteci broj, a prazna celija prazna. "tsc prolazi" ovdje ne dokazuje nista.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Podrum");
  ws.columns = [
    { header: "Br. tanka", key: "broj" },
    { header: "Količina vina (L)", key: "kolicina" },
    { header: "Kapacitet (L)", key: "kapacitet" },
    { header: "Sorta", key: "sorta" },
    { header: "Sastav", key: "sastav" },
    { header: "Kiselina (g/L)", key: "kiselina" },
    { header: "Šećer (g/L)", key: "secer" },
    { header: "Alkohol (% vol)", key: "alkohol" },
    { header: "pH", key: "ph" },
    { header: "SO2 slobodni (mg/L)", key: "so2Slobodni" },
    { header: "SO2 ukupni (mg/L)", key: "so2Ukupni" },
    { header: "Mjereno", key: "mjereno" },
    { header: "Kvasac", key: "kvasac" },
    { header: "Napomena", key: "napomena" },
  ];
  for (const r of redci) ws.addRow(r);

  const dir = await mkdtemp(join(tmpdir(), "izvoz-podrum-"));
  const put = join(dir, "podrum.xlsx");
  await wb.xlsx.writeFile(put);

  const natrag = new ExcelJS.Workbook();
  await natrag.xlsx.readFile(put);
  const list = natrag.getWorksheet("Podrum");

  ok(!!list, "list Podrum postoji u datoteci");
  if (!list) return;

  ok(
    list.rowCount === redci.length + 1,
    "datoteka ima zaglavlje + po redak za tank",
    `rowCount ${list.rowCount}`
  );

  const kljucevi = (ws.columns ?? []).map((c) => String(c.key));
  const loseCelije: string[] = [];
  const prazneCelije: string[] = [];

  for (let i = 0; i < redci.length; i++) {
    const red = list.getRow(i + 2);
    const izvor = redci[i];

    for (const kljuc of BROJCANI) {
      const stupac = kljucevi.indexOf(kljuc) + 1;
      const v = red.getCell(stupac).value;
      const ocekivano = izvor[kljuc];

      if (ocekivano === null) {
        // Prazno mora ostati prazno — ni nula, ni prazan string.
        if (v !== null && v !== undefined) {
          prazneCelije.push(`T${izvor.broj}.${String(kljuc)}=${JSON.stringify(v)}`);
        }
        continue;
      }
      if (typeof v !== "number") {
        loseCelije.push(`T${izvor.broj}.${String(kljuc)}=${JSON.stringify(v)}`);
      }
    }

    for (const kljuc of TEKSTUALNI) {
      const stupac = kljucevi.indexOf(kljuc) + 1;
      const v = red.getCell(stupac).value;

      if (izvor[kljuc] === null) {
        if (v !== null && v !== undefined) {
          prazneCelije.push(`T${izvor.broj}.${String(kljuc)}=${JSON.stringify(v)}`);
        }
      } else if (typeof v !== "string") {
        loseCelije.push(`T${izvor.broj}.${String(kljuc)}=${JSON.stringify(v)}`);
      }
    }

    const stupacDatuma = kljucevi.indexOf("mjereno") + 1;
    const d = red.getCell(stupacDatuma).value;
    if (izvor.mjereno === null) {
      if (d !== null && d !== undefined) {
        prazneCelije.push(`T${izvor.broj}.mjereno=${JSON.stringify(d)}`);
      }
    } else if (!(d instanceof Date)) {
      loseCelije.push(`T${izvor.broj}.mjereno=${JSON.stringify(d)}`);
    }
  }

  ok(
    loseCelije.length === 0,
    "u datoteci su brojevi brojevi, a datum datum",
    loseCelije.slice(0, 5).join(", ")
  );
  ok(
    prazneCelije.length === 0,
    "u datoteci je prazno doista prazno (ni nula ni prazan string)",
    prazneCelije.slice(0, 5).join(", ")
  );

  console.log("\n-- Prva tri retka, kako ce ih vidjeti vlasnik --");
  for (const r of redci.slice(0, 3)) {
    console.log(
      `  T${r.broj} | ${r.kolicina} L / ${r.kapacitet} L | ${r.sorta || "(bez sorte)"}\n` +
        `        sastav:   ${r.sastav || "(prazno)"}\n` +
        `        param:    kis ${r.kiselina ?? "-"} · sec ${r.secer ?? "-"} · alk ${r.alkohol ?? "-"} · pH ${r.ph ?? "-"} · SO2 ${r.so2Slobodni ?? "-"}/${r.so2Ukupni ?? "-"}\n` +
        `        mjereno:  ${r.mjereno ? r.mjereno.toISOString().slice(0, 10) : "(prazno)"}\n` +
        `        kvasac:   ${r.kvasac || "(prazno)"}\n` +
        `        napomena: ${r.napomena || "(prazno)"}`
    );
  }

  console.log(`\nDatoteka za pregled: ${put}`);
  console.log(`\n=== ${proslo} proslo, ${pao} palo ===\n`);
}

main()
  .catch((e) => {
    console.error(e);
    pao++;
  })
  .finally(() => process.exit(pao > 0 ? 1 : 0));
