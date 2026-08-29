/**
 * Provjera da neobavezna polja berbe zavrsavaju kao NULL, a ne kao 0 ili "".
 *
 * Pokretanje:  npm run test:berba
 *
 * Zasto postoji: zatecena forma punjenja koristi `parseBroj`, koji na prazno
 * polje vraca 0 (`Number("")` === 0). Da se to prenijelo na secer, kiseline,
 * pH i godinu berbe, prazno polje bi u bazi izgledalo kao izmjerena nula i
 * ulazilo u prosjeke izvjestaja o berbi. Ovdje se granicni slucajevi drze
 * doslovno, pa se odstupanje vidi odmah.
 *
 * Ne treba bazu ni mrezu; radi samo nad cistim funkcijama.
 */

import {
  tekstIliNull,
  brojIliNull,
  datumIliNull,
  danasZaDateInput,
  godinaIzDatuma,
  opisMaceracije,
  formatSati,
  pocetnoMjerenjeIzStavki,
  odredistaIzForme,
  stanjePodjele,
  uMlForme,
} from "../lib/berba-polja";

let pao = 0;
let proslo = 0;

function jednako(dobiveno: unknown, ocekivano: unknown, poruka: string) {
  if (dobiveno === ocekivano) {
    proslo++;
    return;
  }

  pao++;
  console.log(`  PAO: ${poruka}`);
  console.log(`       ocekivano: ${JSON.stringify(ocekivano)}`);
  console.log(`       dobiveno:  ${JSON.stringify(dobiveno)}`);
}

// ---------------------------------------------------------------------------
// 1. tekstIliNull — prazno nikad ne smije proci kao ""
// ---------------------------------------------------------------------------

jednako(tekstIliNull(""), null, 'tekstIliNull("")');
jednako(tekstIliNull("   "), null, 'tekstIliNull("   ") — sami razmaci');
jednako(tekstIliNull("\t\n "), null, "tekstIliNull(tab + newline)");
jednako(tekstIliNull(null), null, "tekstIliNull(null)");
jednako(tekstIliNull(undefined), null, "tekstIliNull(undefined)");
jednako(tekstIliNull("Lukovec 2"), "Lukovec 2", "tekstIliNull normalan tekst");
jednako(
  tekstIliNull("  Lukovec 2  "),
  "Lukovec 2",
  "tekstIliNull trima rubove"
);
// Nula kao tekst je podatak, ne praznina.
jednako(tekstIliNull("0"), "0", 'tekstIliNull("0") ostaje "0"');

// ---------------------------------------------------------------------------
// 2. brojIliNull — OVDJE JE CIJELA POANTA
// ---------------------------------------------------------------------------
// Zatecen parseBroj("") vraca 0. Ako ovo ikad pocne vracati 0, prazno polje
// secera zavrsi u bazi kao izmjerena nula.

jednako(brojIliNull(""), null, 'brojIliNull("") NIJE 0');
jednako(brojIliNull("   "), null, 'brojIliNull("   ") NIJE 0');
jednako(brojIliNull(null), null, "brojIliNull(null)");
jednako(brojIliNull(undefined), null, "brojIliNull(undefined)");
jednako(brojIliNull("abc"), null, 'brojIliNull("abc") — neparsabilno');
jednako(brojIliNull("--"), null, 'brojIliNull("--")');

// Upisana nula JEST podatak i mora prezivjeti.
jednako(brojIliNull("0"), 0, 'brojIliNull("0") === 0, ne null');
jednako(brojIliNull("0,0"), 0, 'brojIliNull("0,0") === 0');

// Decimalni zarez — hrvatski raspored tipkovnice.
jednako(brojIliNull("3,4"), 3.4, 'brojIliNull("3,4") -> 3.4');
jednako(brojIliNull("3.4"), 3.4, 'brojIliNull("3.4") -> 3.4');
jednako(brojIliNull(" 7,2 "), 7.2, "brojIliNull trima pa parsira");
jednako(brojIliNull("7754"), 7754, "brojIliNull cijeli broj");
jednako(brojIliNull("2026"), 2026, "brojIliNull godina berbe");
jednako(
  brojIliNull("-1"),
  -1,
  "brojIliNull propusta negativan (validacija je drugdje)"
);

// ---------------------------------------------------------------------------
// 3. datumIliNull — samo "YYYY-MM-DD" prolazi
// ---------------------------------------------------------------------------

jednako(datumIliNull(""), null, 'datumIliNull("")');
jednako(datumIliNull("   "), null, 'datumIliNull("   ")');
jednako(datumIliNull(null), null, "datumIliNull(null)");
jednako(
  datumIliNull("2026-08-23"),
  "2026-08-23",
  "datumIliNull ispravan datum"
);
jednako(datumIliNull("  2026-08-23  "), "2026-08-23", "datumIliNull trima");
jednako(datumIliNull("23.08.2026"), null, "datumIliNull odbija hrvatski oblik");
jednako(
  datumIliNull("2026-08-23T07:04"),
  null,
  "datumIliNull odbija datum-vrijeme"
);
jednako(
  datumIliNull("2026-8-3"),
  null,
  "datumIliNull odbija nenadopunjen oblik"
);

// ---------------------------------------------------------------------------
// 4. danasZaDateInput — lokalni sat, ne UTC
// ---------------------------------------------------------------------------
// Kad bi se koristio toISOString(), ovaj bi trenutak (23:30 lokalno, ljeti
// UTC+2) dao SUTRASNJI datum. Test drzi da se to ne dogodi.

const kasnaVecer = new Date(2026, 7, 23, 23, 30, 0); // 23.08.2026 23:30 lokalno
jednako(
  danasZaDateInput(kasnaVecer),
  "2026-08-23",
  "danasZaDateInput u 23:30 ne preskace na sutra"
);

const ranoJutro = new Date(2026, 0, 5, 0, 15, 0); // 05.01.2026 00:15 lokalno
jednako(
  danasZaDateInput(ranoJutro),
  "2026-01-05",
  "danasZaDateInput u 00:15 ne pada na jucer"
);

jednako(
  danasZaDateInput(new Date(2026, 8, 9, 12, 0, 0)),
  "2026-09-09",
  "danasZaDateInput nadopunjuje jednoznamenkasti mjesec i dan"
);

// Oblik mora biti tocno onaj koji <input type="date"> prima.
jednako(
  /^\d{4}-\d{2}-\d{2}$/.test(danasZaDateInput()),
  true,
  "danasZaDateInput() daje YYYY-MM-DD"
);

// ---------------------------------------------------------------------------
// 5. godinaIzDatuma — godina berbe prati datum berbe
// ---------------------------------------------------------------------------

jednako(godinaIzDatuma("2026-08-23"), 2026, "godinaIzDatuma tekuca godina");
jednako(godinaIzDatuma("2025-10-05"), 2025, "godinaIzDatuma prosla berba");
jednako(godinaIzDatuma(""), null, "godinaIzDatuma prazno");
jednako(
  godinaIzDatuma("23.08.2026"),
  null,
  "godinaIzDatuma odbija krivi oblik"
);

// ---------------------------------------------------------------------------
// 6. Cijela stavka — onako kako je forma slozi prije slanja
// ---------------------------------------------------------------------------

function normalizirajStavku(unos: {
  nazivSorte: string;
  kolicinaLitara: string;
  kolicinaKgGrozdja: string;
  polozaj: string;
  parcela: string;
  vinograd: string;
  oznakaBerbe: string;
  datumBerbe: string;
  godinaBerbe: string;
  secer: string;
  kiseline: string;
  ph: string;
  opis: string;
  napomenaBerbe: string;
}) {
  return {
    sortaId: null,
    nazivSorte: unos.nazivSorte.trim(),
    kolicinaLitara: brojIliNull(unos.kolicinaLitara) ?? 0,
    kolicinaKgGrozdja: brojIliNull(unos.kolicinaKgGrozdja),
    polozaj: tekstIliNull(unos.polozaj),
    parcela: tekstIliNull(unos.parcela),
    vinograd: tekstIliNull(unos.vinograd),
    oznakaBerbe: tekstIliNull(unos.oznakaBerbe),
    datumBerbe: datumIliNull(unos.datumBerbe),
    godinaBerbe: brojIliNull(unos.godinaBerbe),
    secer: brojIliNull(unos.secer),
    kiseline: brojIliNull(unos.kiseline),
    ph: brojIliNull(unos.ph),
    opis: tekstIliNull(unos.opis),
    napomenaBerbe: tekstIliNull(unos.napomenaBerbe),
  };
}

// Popunjeno samo obavezno — svih 12 neobaveznih mora biti null.
const golaStavka = normalizirajStavku({
  nazivSorte: "Chardonnay",
  kolicinaLitara: "5200",
  kolicinaKgGrozdja: "",
  polozaj: "",
  parcela: "",
  vinograd: "",
  oznakaBerbe: "",
  datumBerbe: "",
  godinaBerbe: "",
  secer: "",
  kiseline: "",
  ph: "",
  opis: "",
  napomenaBerbe: "",
});

jednako(golaStavka.nazivSorte, "Chardonnay", "gola stavka: sorta prolazi");
jednako(golaStavka.kolicinaLitara, 5200, "gola stavka: litre prolaze");

for (const polje of [
  "kolicinaKgGrozdja",
  "polozaj",
  "parcela",
  "vinograd",
  "oznakaBerbe",
  "datumBerbe",
  "godinaBerbe",
  "secer",
  "kiseline",
  "ph",
  "opis",
  "napomenaBerbe",
] as const) {
  jednako(
    golaStavka[polje],
    null,
    `gola stavka: ${polje} je NULL (ne 0, ne "")`
  );
}

// Puna stavka — sve prolazi, ukljucujuci upisanu nulu.
const punaStavka = normalizirajStavku({
  nazivSorte: "Chardonnay",
  kolicinaLitara: "5200",
  kolicinaKgGrozdja: "7754",
  polozaj: "Madarska",
  parcela: "  Parcela 7  ",
  vinograd: "Lukovec",
  oznakaBerbe: "B-2026-014",
  datumBerbe: "2026-08-21",
  godinaBerbe: "2026",
  secer: "90",
  kiseline: "5,6",
  ph: "3,4",
  opis: "zdravo grozde",
  napomenaBerbe: "brano rucno",
});

jednako(punaStavka.kolicinaKgGrozdja, 7754, "puna stavka: kg");
jednako(punaStavka.parcela, "Parcela 7", "puna stavka: parcela trimana");
jednako(punaStavka.oznakaBerbe, "B-2026-014", "puna stavka: oznaka berbe");
jednako(punaStavka.datumBerbe, "2026-08-21", "puna stavka: datum berbe");
jednako(punaStavka.godinaBerbe, 2026, "puna stavka: godina berbe");
jednako(punaStavka.kiseline, 5.6, "puna stavka: kiseline sa zarezom");
jednako(punaStavka.ph, 3.4, "puna stavka: pH sa zarezom");
jednako(punaStavka.napomenaBerbe, "brano rucno", "puna stavka: napomena berbe");

// Nula upisana rukom mora prezivjeti kao 0, ne pasti na null.
const nulaStavka = normalizirajStavku({
  nazivSorte: "Chardonnay",
  kolicinaLitara: "350",
  kolicinaKgGrozdja: "0",
  polozaj: "",
  parcela: "",
  vinograd: "",
  oznakaBerbe: "",
  datumBerbe: "",
  godinaBerbe: "",
  secer: "0",
  kiseline: "",
  ph: "",
  opis: "",
  napomenaBerbe: "",
});

jednako(nulaStavka.kolicinaKgGrozdja, 0, "upisana nula kg ostaje 0");
jednako(nulaStavka.secer, 0, "upisana nula secera ostaje 0");

// ---------------------------------------------------------------------------
// Maceracija — tri stanja i hrvatska sklonidba sati
// ---------------------------------------------------------------------------

jednako(
  opisMaceracije(null, null),
  null,
  "NULL = nije se pitalo, nista se ne pise"
);
jednako(opisMaceracije(undefined, 3), null, "undefined se ponasa kao NULL");
jednako(opisMaceracije(false, null), "ne", "false = izricito nije bilo");
jednako(opisMaceracije(false, 3), "ne", "sati uz 'ne' se ignoriraju");
jednako(opisMaceracije(true, null), "da", "true bez sati");
jednako(opisMaceracije(true, 3), "da — 3 sata", "true sa satima");
jednako(
  opisMaceracije(true, 0),
  "da — 0 sati",
  "nula sati je podatak, ne praznina"
);

jednako(formatSati(1), "1 sat", "1 sat");
jednako(formatSati(2), "2 sata", "2 sata");
jednako(formatSati(4), "4 sata", "4 sata");
jednako(formatSati(5), "5 sati", "5 sati");
jednako(formatSati(11), "11 sati", "11 sati (iznimka, ne '11 sat')");
jednako(formatSati(12), "12 sati", "12 sati (iznimka, ne '12 sata')");
jednako(formatSati(21), "21 sat", "21 sat");
jednako(formatSati(24), "24 sata", "24 sata");
jednako(formatSati(1.5), "1,5 sata", "decimalni broj ide s 'sata'");

// ---------------------------------------------------------------------------
// pocetnoMjerenjeIzStavki — secer/kiseline/pH iz berbe moraju postati Mjerenje
// ---------------------------------------------------------------------------
// Kartica "Parametri vina" cita samo `Mjerenje`. Dok punjenje nije slalo
// `pocetnoMjerenje`, ovi brojevi nisu bili vidljivi nigdje kao parametri.

const stavka = (
  litara: number,
  secer: number | null,
  kiseline: number | null,
  ph: number | null,
  datumBerbe: string | null = null
) => ({ kolicinaLitara: litara, secer, kiseline, ph, datumBerbe });

// Nista upisano -> nema mjerenja.
jednako(
  pocetnoMjerenjeIzStavki([stavka(5200, null, null, null)], "2026-08-21T09:00"),
  null,
  "bez ijednog parametra nema mjerenja"
);
jednako(
  pocetnoMjerenjeIzStavki([], "2026-08-21T09:00"),
  null,
  "prazan popis stavki nema mjerenja"
);

// SAMO JEDAN parametar je dovoljan — bolje mjerenje s jednim poljem nego nijedno.
const samoSecer = pocetnoMjerenjeIzStavki(
  [stavka(5200, 90, null, null)],
  "2026-08-21T09:00"
);
jednako(samoSecer?.secer, 90, "samo secer: mjerenje ipak nastaje");
jednako(samoSecer?.ukupneKiseline, null, "samo secer: kiseline ostaju null");
jednako(samoSecer?.ph, null, "samo secer: pH ostaje null");

const samoPh = pocetnoMjerenjeIzStavki(
  [stavka(5200, null, null, 3.4)],
  "2026-08-21T09:00"
);
jednako(samoPh?.ph, 3.4, "samo pH: mjerenje nastaje");
jednako(samoPh?.secer, null, "samo pH: secer ostaje null");

// Kiseline berbe idu u ukupneKiseline (na mostu hlapivih nema).
const jedna = pocetnoMjerenjeIzStavki(
  [stavka(5200, 90, 5.6, 3.4)],
  "2026-08-21T09:00"
);
jednako(jedna?.secer, 90, "jedna stavka: secer");
jednako(jedna?.ukupneKiseline, 5.6, "jedna stavka: kiseline -> ukupneKiseline");
jednako(jedna?.ph, 3.4, "jedna stavka: pH");

// --- Ponderiranje po litrama ---
// 1000 L @ 80 + 3000 L @ 100 = (80000 + 300000) / 4000 = 95
const dvije = pocetnoMjerenjeIzStavki(
  [stavka(1000, 80, null, null), stavka(3000, 100, null, null)],
  "2026-08-21T09:00"
);
jednako(
  dvije?.secer,
  95,
  "dvije stavke: ponderirano po litrama, ne aritmeticki"
);

// PRAZNO NIJE NULA. Ako bi prazno uslo kao 0, ovo bi dalo 22.5 umjesto 90.
const jednaPrazna = pocetnoMjerenjeIzStavki(
  [stavka(1000, 90, null, null), stavka(3000, null, null, null)],
  "2026-08-21T09:00"
);
jednako(
  jednaPrazna?.secer,
  90,
  "stavka bez secera NE ulazi u nazivnik (prazno nije nula)"
);

// Polje po polje, ne sve-ili-nista: A ima secer, B ima pH.
const poPolju = pocetnoMjerenjeIzStavki(
  [stavka(1000, 90, null, null), stavka(3000, null, null, 3.2)],
  "2026-08-21T09:00"
);
jednako(poPolju?.secer, 90, "polje po polju: secer samo iz A");
jednako(poPolju?.ph, 3.2, "polje po polju: pH samo iz B");

// Upisana nula je podatak i MORA se ponderirati kao 0.
const snula = pocetnoMjerenjeIzStavki(
  [stavka(1000, 0, null, null), stavka(1000, 100, null, null)],
  "2026-08-21T09:00"
);
jednako(snula?.secer, 50, "upisana nula ulazi u prosjek kao 0");

// Stavka bez litara nema tezinu; ne smije srusiti prosjek dijeljenjem s nulom.
jednako(
  pocetnoMjerenjeIzStavki([stavka(0, 90, null, null)], "2026-08-21T09:00"),
  null,
  "stavka bez litara ne moze nositi parametar (nema tezine)"
);

// Zaokruzivanje: 1000@21.7 + 1000@21.9 = 21.8, ne 21.799999999999997
const zaokruzeno = pocetnoMjerenjeIzStavki(
  [stavka(1000, 21.7, null, null), stavka(1000, 21.9, null, null)],
  "2026-08-21T09:00"
);
jednako(zaokruzeno?.secer, 21.8, "prosjek se zaokruzuje na dvije decimale");

// --- Datum: parametri su izmjereni NA GROZDJU ---
jednako(
  pocetnoMjerenjeIzStavki(
    [stavka(5200, 90, null, null, "2026-08-21")],
    "2026-08-24T09:00"
  )?.izmjerenoAt,
  "2026-08-21",
  "datum berbe ima prednost pred datumom punjenja"
);
jednako(
  pocetnoMjerenjeIzStavki(
    [stavka(5200, 90, null, null, null)],
    "2026-08-24T09:00"
  )?.izmjerenoAt,
  "2026-08-24T09:00",
  "bez datuma berbe pada na datum punjenja"
);
jednako(
  pocetnoMjerenjeIzStavki(
    [
      stavka(1000, 90, null, null, "2026-08-23"),
      stavka(1000, 88, null, null, "2026-08-21"),
    ],
    "2026-08-24T09:00"
  )?.izmjerenoAt,
  "2026-08-21",
  "vise datuma berbe -> uzima se najraniji"
);
// Stavka bez ijednog parametra ne smije diktirati datum mjerenja.
jednako(
  pocetnoMjerenjeIzStavki(
    [
      stavka(1000, null, null, null, "2026-08-19"),
      stavka(1000, 90, null, null, "2026-08-21"),
    ],
    "2026-08-24T09:00"
  )?.izmjerenoAt,
  "2026-08-21",
  "datum dolazi samo od stavki koje su dale parametar"
);
// Smece u datumu berbe pada na datum punjenja, ne u Invalid Date.
jednako(
  pocetnoMjerenjeIzStavki(
    [stavka(5200, 90, null, null, "21.08.2026")],
    "2026-08-24T09:00"
  )?.izmjerenoAt,
  "2026-08-24T09:00",
  "neispravan datum berbe pada na datum punjenja"
);

// ---------------------------------------------------------------------------
// PODJELA BERBE U VISE TANKOVA — racun koji forma pokazuje dok se upisuje
//
// Ovo je ono sto Ivana vidi PRIJE spremanja: stane li u tank i slaze li se
// zbroj. Posluzitelj isto provjerava (scripts/test-punjenje-podjela.ts), ali
// greska koja stigne tek nakon spremanja je izgubljen unos.
// ---------------------------------------------------------------------------

console.log("");

// `parseBroj` iz forme: zarez je decimalni znak, prazno polje je nula.
const pb = (v: string) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

jednako(uMlForme(1800), 1800000, "litre u mililitre");
jednako(uMlForme(333.334), 333334, "tri decimale su granica mililitra");
jednako(uMlForme(0), 0, "nula je nula");

// --- odredistaIzForme: tri slucaja ---

jednako(
  JSON.stringify(odredistaIzForme([], 3000, "T5", pb)),
  JSON.stringify([{ tankId: "T5", ml: 3000000 }]),
  "prazan popis: cijela stavka u tank odabran gore"
);

jednako(
  JSON.stringify(odredistaIzForme([], 3000, "", pb)),
  JSON.stringify([]),
  "prazan popis bez odabranog tanka: nista, jos nije podatak"
);

jednako(
  JSON.stringify(
    odredistaIzForme([{ tankId: "T9", litre: "" }], 3000, "T5", pb)
  ),
  JSON.stringify([{ tankId: "T9", ml: 3000000 }]),
  "jedan redak: cijela stavka u taj tank, prazne litre se ne citaju"
);

jednako(
  JSON.stringify(
    odredistaIzForme(
      [
        { tankId: "T5", litre: "1800" },
        { tankId: "T7", litre: "1200" },
      ],
      3000,
      "",
      pb
    )
  ),
  JSON.stringify([
    { tankId: "T5", ml: 1800000 },
    { tankId: "T7", ml: 1200000 },
  ]),
  "dva retka: onoliko koliko pise u svakom"
);

// Redak bez tanka ispada — jos nije podatak, ali zbroj ga zato NE pokriva.
jednako(
  odredistaIzForme(
    [
      { tankId: "T5", litre: "1800" },
      { tankId: "", litre: "1200" },
    ],
    3000,
    "",
    pb
  ).length,
  1,
  "redak bez odabranog tanka ispada iz raspodjele"
);

// Zarez kao decimalni znak — tako Ivana tipka.
jednako(
  odredistaIzForme(
    [
      { tankId: "T5", litre: "1800,5" },
      { tankId: "T7", litre: "1199,5" },
    ],
    3000,
    "",
    pb
  )[0].ml,
  1800500,
  "zarez se cita kao decimalni znak"
);

// --- stanjePodjele: "upisano X od Y L" ---

jednako(stanjePodjele([], 3000, pb), null, "bez podjele nema sto ne stimati");
jednako(
  stanjePodjele([{ tankId: "T5", litre: "" }], 3000, pb),
  null,
  "jedan redak nije podjela"
);

{
  const p = stanjePodjele(
    [
      { tankId: "T5", litre: "1800" },
      { tankId: "T7", litre: "1200" },
    ],
    3000,
    pb
  )!;
  jednako(p.slaze, true, "1800 + 1200 = 3000 se slaze");
  jednako(p.upisano, 3000, "upisano 3000");
  jednako(p.ukupno, 3000, "od 3000");
  jednako(p.razlika, 0, "bez razlike");
  jednako(p.bezTanka, 0, "svi redci imaju tank");
  jednako(p.ponovljen, false, "nijedan tank nije ponovljen");
}

{
  const p = stanjePodjele(
    [
      { tankId: "T5", litre: "1800" },
      { tankId: "T7", litre: "1000" },
    ],
    3000,
    pb
  )!;
  jednako(p.slaze, false, "manjak se ne slaze");
  jednako(p.razlika, -200, "nedostaje 200 L");
}

{
  const p = stanjePodjele(
    [
      { tankId: "T5", litre: "1800" },
      { tankId: "T7", litre: "1400" },
    ],
    3000,
    pb
  )!;
  jednako(p.slaze, false, "visak se ne slaze");
  jednako(p.razlika, 200, "200 L previse");
}

// RUB zbog kojeg se racuna u mililitrima. U litrama 100.1 + 200.2 daje
// 300.29999999999995, pa bi ispravna podjela bila odbijena bez razloga.
jednako(100.1 + 200.2 === 300.3, false, "u pokretnom zarezu to NIJE jednako");
jednako(
  stanjePodjele(
    [
      { tankId: "T5", litre: "100.1" },
      { tankId: "T7", litre: "200.2" },
    ],
    300.3,
    pb
  )!.slaze,
  true,
  "a u mililitrima se slaze"
);

// Tri neravna dijela.
jednako(
  stanjePodjele(
    [
      { tankId: "T5", litre: "333.333" },
      { tankId: "T7", litre: "333.333" },
      { tankId: "T9", litre: "333.334" },
    ],
    1000,
    pb
  )!.slaze,
  true,
  "tri neravna dijela se zbroje tocno na 1000"
);

// Prazna ukupna kolicina ne smije proci kao "slaze se s nulom".
jednako(
  stanjePodjele(
    [
      { tankId: "T5", litre: "" },
      { tankId: "T7", litre: "" },
    ],
    0,
    pb
  )!.slaze,
  false,
  "0 od 0 se NE racuna kao da se slaze"
);

// Nepotpuni redci i ponovljen tank.
jednako(
  stanjePodjele(
    [
      { tankId: "T5", litre: "1800" },
      { tankId: "", litre: "1200" },
    ],
    3000,
    pb
  )!.bezTanka,
  1,
  "prebrojan je redak bez tanka"
);

jednako(
  stanjePodjele(
    [
      { tankId: "T5", litre: "1800" },
      { tankId: "T5", litre: "1200" },
    ],
    3000,
    pb
  )!.ponovljen,
  true,
  "isti tank dvaput je prepoznat"
);

// Redak s tankom ali BEZ litara. Zbroj se slaze (prazno vrijedi nula), pa bi
// bez `bezLitara` forma pokazala zeleno, a posluzitelj bi odbio spremanje.
{
  const p = stanjePodjele(
    [
      { tankId: "T5", litre: "3000" },
      { tankId: "T7", litre: "" },
    ],
    3000,
    pb
  )!;
  jednako(p.slaze, true, "zbroj se formalno slaze");
  jednako(p.bezTanka, 0, "oba retka imaju tank");
  jednako(p.bezLitara, 1, "ali jedan nema litre — i to se mora vidjeti");
}

jednako(
  stanjePodjele(
    [
      { tankId: "T5", litre: "1800" },
      { tankId: "T7", litre: "1200" },
    ],
    3000,
    pb
  )!.bezLitara,
  0,
  "ispravna podjela nema redaka bez litara"
);

// Nula upisana rukom je isto sto i prazno: u tank ne ulazi nista.
jednako(
  stanjePodjele(
    [
      { tankId: "T5", litre: "3000" },
      { tankId: "T7", litre: "0" },
    ],
    3000,
    pb
  )!.bezLitara,
  1,
  "upisana nula se broji kao redak bez litara"
);

// ---------------------------------------------------------------------------

console.log("");
console.log(`proslo: ${proslo}, palo: ${pao}`);

if (pao > 0) process.exit(1);
