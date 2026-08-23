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
jednako(tekstIliNull("  Lukovec 2  "), "Lukovec 2", "tekstIliNull trima rubove");
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
jednako(brojIliNull("-1"), -1, "brojIliNull propusta negativan (validacija je drugdje)");

// ---------------------------------------------------------------------------
// 3. datumIliNull — samo "YYYY-MM-DD" prolazi
// ---------------------------------------------------------------------------

jednako(datumIliNull(""), null, 'datumIliNull("")');
jednako(datumIliNull("   "), null, 'datumIliNull("   ")');
jednako(datumIliNull(null), null, "datumIliNull(null)");
jednako(datumIliNull("2026-08-23"), "2026-08-23", "datumIliNull ispravan datum");
jednako(datumIliNull("  2026-08-23  "), "2026-08-23", "datumIliNull trima");
jednako(datumIliNull("23.08.2026"), null, "datumIliNull odbija hrvatski oblik");
jednako(datumIliNull("2026-08-23T07:04"), null, "datumIliNull odbija datum-vrijeme");
jednako(datumIliNull("2026-8-3"), null, "datumIliNull odbija nenadopunjen oblik");

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
jednako(godinaIzDatuma("23.08.2026"), null, "godinaIzDatuma odbija krivi oblik");

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
  jednako(golaStavka[polje], null, `gola stavka: ${polje} je NULL (ne 0, ne "")`);
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

console.log("");
console.log(`proslo: ${proslo}, palo: ${pao}`);

if (pao > 0) process.exit(1);
