/**
 * Provjera ponderiranog mjerenja koje prijenos vina upisuje ciljnom tanku.
 *
 * Pokretanje:  npm run test:ponderirano
 *
 * Zasto postoji: formula mora biti ISTA kao u pretoku
 * (app/api/pretok/route.ts:56-73), inace bi isto vino dobilo razlicite
 * parametre ovisno o tome je li stiglo pretokom ili prijenosom. Razlika je samo
 * u jedinici tezine (ovdje ml, ondje litre), sto na omjer ne smije utjecati.
 *
 * Ne treba bazu ni mrezu; radi samo nad cistim funkcijama.
 * Cijeli tijek nad bazom pokriva scripts/test-filtracija-baza.ts.
 */

import {
  POLJA_MJERENJA,
  ponderiraniProsjek,
  ponderirajMjerenja,
  jeMjerenjePrazno,
  vrijednostiIzMjerenja,
  type VrijednostiMjerenja,
} from "../lib/filtracija";

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

function mjerenje(v: Partial<VrijednostiMjerenja>): VrijednostiMjerenja {
  const r = {} as VrijednostiMjerenja;
  for (const polje of POLJA_MJERENJA) r[polje] = v[polje] ?? null;
  return r;
}

// ---------------------------------------------------------------------------
// DOKAZ 1: prazan ciljni tank dobiva DOSLOVNU KOPIJU izvora
// ---------------------------------------------------------------------------
// Prazan cilj ne doprinosi nijednim ulazom, pa prosjek jednog ulaza mora biti
// taj ulaz — bez obzira na to koliko je litara preslo.

console.log("DOKAZ 1: prazan cilj = kopija izvora");

const izvor = mjerenje({
  alkohol: 13.2,
  ukupneKiseline: 6.4,
  hlapiveKiseline: 0.32,
  slobodniSO2: 28,
  ukupniSO2: 95,
  secer: 2.1,
  ph: 3.44,
  temperatura: 17.5,
});

for (const kolicinaMl of [950_000, 1_000, 12_345_678]) {
  const rezultat = ponderirajMjerenja([{ kolicinaMl, vrijednosti: izvor }]);

  for (const polje of POLJA_MJERENJA) {
    jednako(
      rezultat[polje],
      izvor[polje],
      `${polje} pri prijenosu ${kolicinaMl} ml u prazan tank`
    );
  }
}

// ---------------------------------------------------------------------------
// DOKAZ 2: pun ciljni tank dobiva PONDERIRANI PROSJEK
// ---------------------------------------------------------------------------
// Konkretno: u tanku je vec 300 L, dolazi 700 L.
//
//   alkohol         (300*14,0 + 700*12,0) / 1000 = 12,6
//   ukupneKiseline  (300* 5,0 + 700* 6,4) / 1000 =  5,98
//   ph              (300* 3,3 + 700* 3,44) / 1000 =  3,398
//   secer           izvor ga NEMA -> racuna se samo iz cilja = 2,0
//   temperatura     cilj ga NEMA  -> racuna se samo iz izvora = 16,0
//
// Zadnja dva reda su bit: null se filtrira PO POLJU, ne po cijelom mjerenju.

console.log("DOKAZ 2: pun cilj = ponderirani prosjek");

const uCilju = mjerenje({
  alkohol: 14.0,
  ukupneKiseline: 5.0,
  ph: 3.3,
  secer: 2.0,
});

const dolazi = mjerenje({
  alkohol: 12.0,
  ukupneKiseline: 6.4,
  ph: 3.44,
  temperatura: 16.0,
});

const spoj = ponderirajMjerenja([
  { kolicinaMl: 300_000, vrijednosti: uCilju },
  { kolicinaMl: 700_000, vrijednosti: dolazi },
]);

jednako(spoj.alkohol, 12.6, "alkohol (300*14,0 + 700*12,0)/1000");
jednako(spoj.ukupneKiseline, 5.98, "ukupneKiseline (300*5,0 + 700*6,4)/1000");
jednako(spoj.ph, 3.398, "ph (300*3,3 + 700*3,44)/1000");
jednako(spoj.secer, 2.0, "secer — izvor ga nema, ostaje vrijednost cilja");
jednako(spoj.temperatura, 16.0, "temperatura — cilj ga nema, ostaje iz izvora");
jednako(spoj.slobodniSO2, null, "slobodniSO2 — nema ga nigdje, ostaje null");

// Tezine u MILILITRIMA i u LITRAMA moraju dati isti broj — omjer se ne mijenja.
const spojULitrama = ponderirajMjerenja([
  { kolicinaMl: 300, vrijednosti: uCilju },
  { kolicinaMl: 700, vrijednosti: dolazi },
]);

for (const polje of POLJA_MJERENJA) {
  jednako(spojULitrama[polje], spoj[polje], `${polje} — ml i L daju isto`);
}

// Zaokruzivanje na 3 decimale, kao u pretoku.
jednako(
  ponderiraniProsjek([
    { kolicinaMl: 1, vrijednost: 1 },
    { kolicinaMl: 1, vrijednost: 2 },
    { kolicinaMl: 1, vrijednost: 2 },
  ]),
  1.667,
  "zaokruzivanje na 3 decimale"
);

// ---------------------------------------------------------------------------
// Rubni slucajevi
// ---------------------------------------------------------------------------

console.log("Rubni slucajevi");

jednako(ponderiraniProsjek([]), null, "bez ulaza -> null");
jednako(
  ponderiraniProsjek([{ kolicinaMl: 0, vrijednost: 13.2 }]),
  null,
  "nulta kolicina se ne broji"
);
jednako(
  ponderiraniProsjek([{ kolicinaMl: 1000, vrijednost: null }]),
  null,
  "sama null vrijednost -> null"
);
jednako(
  ponderiraniProsjek([
    { kolicinaMl: 1000, vrijednost: null },
    { kolicinaMl: 3000, vrijednost: 8 },
  ]),
  8,
  "null ulaz ne razrjeduje ostale"
);
// Nula je vrijednost, ne odsutnost podatka.
jednako(
  ponderiraniProsjek([
    { kolicinaMl: 1000, vrijednost: 0 },
    { kolicinaMl: 1000, vrijednost: 10 },
  ]),
  5,
  "vrijednost 0 se broji, ne preskace"
);

jednako(jeMjerenjePrazno(mjerenje({})), true, "sve null = prazno");
jednako(jeMjerenjePrazno(mjerenje({ ph: 3.4 })), false, "jedno polje = nije prazno");
jednako(jeMjerenjePrazno(mjerenje({ secer: 0 })), false, "nula nije prazno");
jednako(
  jeMjerenjePrazno(ponderirajMjerenja([])),
  true,
  "prosjek bez ulaza je prazan (takav se redak NE upisuje)"
);

// vrijednostiIzMjerenja mora ignorirati sve osim osam polja.
const izBaze = vrijednostiIzMjerenja({
  alkohol: 13.2,
  ph: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...({ bentotestStatus: "OK", napomena: "rucno", jeRucno: true } as any),
});

jednako(izBaze.alkohol, 13.2, "alkohol procitan");
jednako(izBaze.ph, null, "null ostaje null");
jednako(izBaze.secer, null, "polje koje redak nema -> null");
jednako(
  Object.keys(izBaze).length,
  POLJA_MJERENJA.length,
  "izvuceno tocno osam polja, bez bentotesta i napomene"
);

// ---------------------------------------------------------------------------

console.log("");
console.log(`proslo: ${proslo}, palo: ${pao}`);

if (pao > 0) process.exit(1);
