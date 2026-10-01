/**
 * Provjera SIFRE NA OBRASCIMA PRETOKA I PUNJENJA (sifra vina, korak 4).
 *
 * Pokretanje:  npx tsx scripts/test-sifra-obrasci.ts
 *
 * NE DIRA BAZU. Provjerava ciste funkcije iz lib/sifra-vina.ts koje rute
 * zovu prije transakcije i unutar petlje po tankovima:
 *
 *   - `sifraNovogVinaPretoka` — app/api/pretok/route.ts
 *   - `sifraObrascaPunjenja`, `sifraNakonPunjenja` — app/api/punjenje/route.ts
 *
 * Da motor sam odbija cuvée bez sifre i da cuvée u vise ciljeva daje svima
 * istu sifru, dokazuje test-imenovanje-baza (DOKAZ 9), nad bazom.
 *
 * STO SE DOKAZUJE
 *   1. cuvée bez sifre se odbija; kriva sifra se odbija; ispravna prolazi;
 *   2. blend iste sorte i obican pretok sifru NE primaju, ni kad je stigla;
 *   3. punjenje: sifra je obavezna cim je ijedna posuda prazna, inace se
 *      ni ne cita;
 *   4. punjenje: prazna posuda dobiva sifru obrasca, puna zadrzava svoju;
 *      jedna berba u dva prazna tanka daje obama ISTU sifru.
 */

import {
  sifraNakonPunjenja,
  sifraNovogVinaPretoka,
  sifraObrascaPunjenja,
  sifraZaPrikaz,
} from "../lib/sifra-vina";
import {
  procitajOdredista,
  tankoviRedom,
  type CistaStavka,
} from "../app/api/punjenje/route";

let pao = 0;
let proslo = 0;

function jednako(dobiveno: unknown, ocekivano: unknown, poruka: string) {
  const d = JSON.stringify(dobiveno);
  const o = JSON.stringify(ocekivano);
  if (d === o) {
    proslo++;
    return;
  }
  pao++;
  console.log(`  PAO: ${poruka}`);
  console.log(`       ocekivano: ${o}`);
  console.log(`       dobiveno:  ${d}`);
}

// ---------------------------------------------------------------------------

console.log("1. Cuvée: sifra obavezna i ispravnog oblika\n");

for (const [opis, raw] of [
  ["bez kljuca", undefined],
  ["null", null],
  ["prazan string", ""],
  ["samo razmaci", "   "],
  ["broj umjesto stringa", 4409261],
] as const) {
  const r = sifraNovogVinaPretoka("CUVEE", raw);
  jednako(r.greska, "Šifra novog vina je obavezna za cuvée.", `cuvée ${opis}: odbijen`);
  jednako(r.sifra, undefined, `cuvée ${opis}: nista ne ide u motor`);
}

{
  const r = sifraNovogVinaPretoka("CUVEE", "44-1326-1");
  jednako(r.greska, "Mjesec 13 u šifri ne postoji.", "cuvée s krivim mjesecom: odbijen");
  jednako(r.sifra, undefined, "kriva sifra ne ide u motor");

  const r2 = sifraNovogVinaPretoka("CUVEE", "44-0926");
  jednako(r2.greska != null, true, "cuvée bez broja: odbijen");

  const ok = sifraNovogVinaPretoka("CUVEE", "  44-0926-2  ");
  jednako(ok, { sifra: "44-0926-2", greska: null }, "ispravna sifra prolazi, obrezana");
}

console.log("\n2. Blend iste sorte i obican pretok sifru ne primaju\n");

for (const tip of ["BLEND_ISTE_SORTE", "OBICNI"]) {
  jednako(
    sifraNovogVinaPretoka(tip, "11-0926-5"),
    { sifra: undefined, greska: null },
    `${tip}: poslana sifra se zanemaruje`
  );
  jednako(
    sifraNovogVinaPretoka(tip, undefined),
    { sifra: undefined, greska: null },
    `${tip}: bez sifre nije greska`
  );
  jednako(
    sifraNovogVinaPretoka(tip, "smece").greska,
    null,
    `${tip}: ni krivi oblik nije greska — ne cita se`
  );
}

console.log("\n3. Punjenje: kad je sifra obavezna\n");

jednako(
  sifraObrascaPunjenja(true, undefined).greska,
  "Šifra vina je obavezna kad se puni prazna posuda.",
  "prazna posuda bez sifre: odbijeno"
);
jednako(
  sifraObrascaPunjenja(true, "  ").greska,
  "Šifra vina je obavezna kad se puni prazna posuda.",
  "prazna posuda s razmacima: odbijeno"
);
jednako(
  sifraObrascaPunjenja(true, "99-0926-1").greska,
  "Prefiks 99 nije u šifarniku.",
  "prazna posuda s krivom sifrom: odbijeno"
);
jednako(
  sifraObrascaPunjenja(true, "11-0926-4"),
  { sifra: "11-0926-4", greska: null },
  "prazna posuda s ispravnom sifrom: prolazi"
);
jednako(
  sifraObrascaPunjenja(false, undefined),
  { sifra: null, greska: null },
  "samo pune posude: sifra nije potrebna"
);
jednako(
  sifraObrascaPunjenja(false, "smece"),
  { sifra: null, greska: null },
  "samo pune posude: poslana sifra se ne cita ni ne provjerava"
);

console.log("\n4. Punjenje: tko dobiva koju sifru\n");

/** Minimalna stavka — samo ono sto podjela cita. */
function stavka(nazivSorte: string, litre: number, tankovi: Array<{ tankId: string; litre: number }>): CistaStavka {
  const odredista = procitajOdredista({ tankovi }, litre, null, 1);
  return {
    redakPoTanku: new Map(odredista.map((o) => [o.tankId, `redak-${o.tankId}`])),
    odredista,
    sortaId: null,
    nazivSorte,
    opis: null,
    kolicinaKgGrozdja: null,
    kolicinaLitara: litre,
    datumBerbe: null,
    godinaBerbe: null,
    polozaj: null,
    parcela: null,
    vinograd: null,
    oznakaBerbe: null,
    secer: null,
    kiseline: null,
    ph: null,
    napomenaBerbe: null,
    maceracija: null,
    maceracijaSati: null,
    vlastitaBerba: null,
    pocetakBranja: null,
    krajBranja: null,
    brojBeraca: null,
  };
}

/**
 * ISTA petlja kao u POST /api/punjenje: jedna provjera obrasca za cijeli
 * zahtjev, zatim sifra po tanku redom `tankoviRedom`.
 */
function simulirajPunjenje(
  stanje: Record<string, { litre: number; sifra: string | null }>,
  stavke: CistaStavka[],
  sifraIzObrasca: unknown
): { greska: string | null; sifre: Record<string, string | null> } {
  const tankovi = tankoviRedom(stavke);
  const imaPraznih = tankovi.some((t) => stanje[t].litre <= 0);
  const obrazac = sifraObrascaPunjenja(imaPraznih, sifraIzObrasca);
  if (obrazac.greska) return { greska: obrazac.greska, sifre: {} };

  const sifre: Record<string, string | null> = {};
  for (const t of tankovi) {
    sifre[t] = sifraNakonPunjenja({
      bioPrazan: stanje[t].litre <= 0,
      sifraObrasca: obrazac.sifra,
      sifraPrije: stanje[t].sifra,
    });
  }
  return { greska: null, sifre };
}

{
  // Jedan prazan tank.
  const r = simulirajPunjenje(
    { A: { litre: 0, sifra: null } },
    [stavka("Graševina", 1000, [{ tankId: "A", litre: 1000 }])],
    "11-0926-1"
  );
  jednako(r, { greska: null, sifre: { A: "11-0926-1" } }, "prazan tank: sifra iz obrasca");
}

{
  // Prazan tank koji je ranije imao vino sa sifrom: stara se NE vraca.
  const r = simulirajPunjenje(
    { A: { litre: 0, sifra: "11-0826-3" } },
    [stavka("Graševina", 1000, [{ tankId: "A", litre: 1000 }])],
    "11-0926-1"
  );
  jednako(r.sifre.A, "11-0926-1", "prazan tank s negdasnjom sifrom: dobiva novu");
}

{
  // Jedan pun tank — dolijevanje.
  const r = simulirajPunjenje(
    { B: { litre: 800, sifra: "11-0826-1" } },
    [stavka("Graševina", 200, [{ tankId: "B", litre: 200 }])],
    undefined
  );
  jednako(r, { greska: null, sifre: { B: "11-0826-1" } }, "pun tank bez sifre u obrascu: zadrzava svoju");

  const r2 = simulirajPunjenje(
    { B: { litre: 800, sifra: "11-0826-1" } },
    [stavka("Graševina", 200, [{ tankId: "B", litre: 200 }])],
    "11-0926-9"
  );
  jednako(r2.sifre.B, "11-0826-1", "pun tank i kad obrazac nosi drugu: zadrzava svoju");

  const r3 = simulirajPunjenje(
    { B: { litre: 800, sifra: null } },
    [stavka("Graševina", 200, [{ tankId: "B", litre: 200 }])],
    "11-0926-9"
  );
  jednako(r3.sifre.B, null, "pun tank bez sifre: ostaje bez nje, ne uzima iz obrasca");
}

{
  // Jedna berba u dva prazna tanka — i jos jedan pun tank u istom obrascu.
  const stanje = {
    A: { litre: 0, sifra: null },
    C: { litre: 0, sifra: "11-0126-2" },
    B: { litre: 800, sifra: "11-0826-1" },
  };
  const stavke = [
    stavka("Graševina", 3000, [
      { tankId: "A", litre: 1800 },
      { tankId: "C", litre: 1200 },
    ]),
    stavka("Graševina", 200, [{ tankId: "B", litre: 200 }]),
  ];

  const r = simulirajPunjenje(stanje, stavke, "11-0926-3");
  jednako(r.greska, null, "berba u dva tanka: prolazi");
  jednako(r.sifre.A, "11-0926-3", "berba u dva tanka: prvi dobiva sifru obrasca");
  jednako(r.sifre.C, "11-0926-3", "berba u dva tanka: drugi dobiva ISTU sifru");
  jednako(r.sifre.B, "11-0826-1", "pun tank u istom obrascu: zadrzava svoju");

  const bez = simulirajPunjenje(stanje, stavke, null);
  jednako(
    bez.greska,
    "Šifra vina je obavezna kad se puni prazna posuda.",
    "berba u dva tanka bez sifre: odbijeno, iako je jedan tank pun"
  );
}

console.log("\n5. Prikaz sifre (korak 5)\n");

jednako(
  sifraZaPrikaz({ sifra: "11-0926-3", razlog: "IMENOVANO" }),
  { tekst: "11-0926-3", bezSifre: false },
  "upisana sifra se pokazuje kakva jest"
);
jednako(
  sifraZaPrikaz({ sifra: null, razlog: "IMENOVANO" }),
  { tekst: "bez šifre", bezSifre: true },
  "imenovano vino bez sifre: „bez šifre”, ne crtica"
);
jednako(
  sifraZaPrikaz({ sifra: "  ", razlog: "IMENOVANO" }),
  { tekst: "bez šifre", bezSifre: true },
  "sifra od samih razmaka je isto sto i nikakva"
);
jednako(
  sifraZaPrikaz({ sifra: null, razlog: "BEZIMENO" }),
  { tekst: "bez šifre", bezSifre: true },
  "vino bez ikakvog zapisa: „bez šifre”"
);
jednako(
  sifraZaPrikaz({ sifra: "11-0826-1", razlog: "PRAZAN" }),
  { tekst: "—", bezSifre: false },
  "prazna posuda: crtica, i kad bi zapis nosio sifru"
);
jednako(sifraZaPrikaz(null), { tekst: "—", bezSifre: false }, "tank bez podatka: crtica");

console.log("");
console.log(`proslo: ${proslo}, palo: ${pao}`);
if (pao > 0) process.exit(1);
