/**
 * Provjera povratka unatrag PO POLJU (lib/mjerenja.ts).
 *
 * Pokretanje:  npm run test:fallback
 *
 * Zasto postoji: pravilo "uzmi zadnje mjerenje" baca alkohol, kiseline i secer
 * jer se oni mjere rijetko, a slobodni SO2 tjedno. Ovdje su granicni slucajevi
 * upisani doslovno, ukljucujuci stvarni raspored mjerenja tanka 1 iz baze.
 *
 * Ne treba bazu ni mrezu; radi samo nad cistim funkcijama.
 */

import {
  sloziPoPolju,
  nizPolja,
  napomenaOMijesanimDatumima,
  type RedakMjerenja,
  type VrijednostiMjerenja,
} from "../lib/mjerenja";
import { jeMjerenjePrazno } from "../lib/filtracija";

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

const PRAZAN: VrijednostiMjerenja = {
  alkohol: null,
  ukupneKiseline: null,
  hlapiveKiseline: null,
  slobodniSO2: null,
  ukupniSO2: null,
  secer: null,
  ph: null,
  temperatura: null,
};

function redak(
  id: string,
  datum: string,
  jeRucno: boolean,
  polja: Partial<typeof PRAZAN>
): RedakMjerenja {
  return { id, izmjerenoAt: new Date(datum), jeRucno, ...PRAZAN, ...polja };
}

// ---------------------------------------------------------------------------
// 1. Prazan popis
// ---------------------------------------------------------------------------

const prazno = sloziPoPolju([]);
jednako(prazno.vrijednosti.alkohol, null, "prazan popis: alkohol null");
jednako(prazno.vrijednosti.slobodniSO2, null, "prazan popis: SO2 null");
jednako(prazno.izvorPolja.alkohol, null, "prazan popis: izvor null");
jednako(jeMjerenjePrazno(prazno.vrijednosti), true, "prazan popis -> jeMjerenjePrazno");

// ---------------------------------------------------------------------------
// 2. Jedno bogato mjerenje prolazi nepromijenjeno
// ---------------------------------------------------------------------------

const jedno = sloziPoPolju([
  redak("a", "2026-06-03T10:00:00Z", true, {
    alkohol: 11.3,
    ukupneKiseline: 6.3,
    slobodniSO2: 26,
    ukupniSO2: 86,
    secer: 3.5,
  }),
]);
jednako(jedno.vrijednosti.alkohol, 11.3, "jedno bogato: alkohol");
jednako(jedno.vrijednosti.secer, 3.5, "jedno bogato: secer");
jednako(jedno.vrijednosti.ph, null, "jedno bogato: pH ostaje null");
jednako(jedno.izvorPolja.alkohol?.mjerenjeId, "a", "jedno bogato: izvor alkohola");

// ---------------------------------------------------------------------------
// 3. STVARNI SLUCAJ TANKA 1 — SO2-only novije + bogato starije
// ---------------------------------------------------------------------------
// Prepisano iz baze. Bez fallbacka gore stoji samo slobodniSO2=24.

const tank1 = sloziPoPolju([
  redak("t1-29-07", "2026-07-29T12:48:00Z", true, { slobodniSO2: 24 }),
  redak("t1-28-07a", "2026-07-28T06:31:00Z", false, {}),
  redak("t1-28-07b", "2026-07-28T06:31:00Z", false, {}),
  redak("t1-16-07", "2026-07-16T09:43:00Z", true, { slobodniSO2: 24 }),
  redak("t1-30-06", "2026-06-30T12:59:00Z", true, { slobodniSO2: 26 }),
  redak("t1-03-06", "2026-06-03T11:52:00Z", true, { slobodniSO2: 26 }),
  redak("t1-21-05", "2026-05-21T12:59:00Z", true, {
    alkohol: 11.3,
    ukupneKiseline: 6.2,
    slobodniSO2: 26,
    ukupniSO2: 86,
    secer: 3.3,
  }),
]);

jednako(tank1.vrijednosti.slobodniSO2, 24, "tank 1: SO2 iz NAJNOVIJEG (29.07.)");
jednako(tank1.izvorPolja.slobodniSO2?.mjerenjeId, "t1-29-07", "tank 1: izvor SO2");
jednako(tank1.vrijednosti.alkohol, 11.3, "tank 1: alkohol iz STARIJEG (21.05.)");
jednako(tank1.izvorPolja.alkohol?.mjerenjeId, "t1-21-05", "tank 1: izvor alkohola");
jednako(tank1.vrijednosti.ukupneKiseline, 6.2, "tank 1: kiseline iz starijeg");
jednako(tank1.vrijednosti.ukupniSO2, 86, "tank 1: ukupni SO2 iz starijeg");
jednako(tank1.vrijednosti.secer, 3.3, "tank 1: secer iz starijeg");
jednako(tank1.vrijednosti.ph, null, "tank 1: pH nikad mjeren -> null");
jednako(tank1.vrijednosti.temperatura, null, "tank 1: temperatura nikad -> null");

const popunjenih = Object.values(tank1.vrijednosti).filter((v) => v != null).length;
jednako(popunjenih, 5, "tank 1: 5 popunjenih polja umjesto 1");

// Razliciti datumi -> napomena mora postojati
jednako(
  napomenaOMijesanimDatumima(tank1.izvorPolja) !== null,
  true,
  "tank 1: napomena o mijesanim datumima postoji"
);
jednako(
  napomenaOMijesanimDatumima(jedno.izvorPolja),
  null,
  "jedan datum -> nema napomene"
);

// ---------------------------------------------------------------------------
// 4. Rucno ima prednost pred automatskim ZA ISTO POLJE
// ---------------------------------------------------------------------------
// Da automatska vrijednost ne bi kroz niz prijenosa hranila samu sebe.

const prednost = sloziPoPolju([
  redak("auto-novo", "2026-08-10T10:00:00Z", false, { alkohol: 99 }),
  redak("rucno-staro", "2026-08-01T10:00:00Z", true, { alkohol: 11.5 }),
]);
jednako(prednost.vrijednosti.alkohol, 11.5, "rucno starije pobjedjuje automatsko novije");
jednako(prednost.izvorPolja.alkohol?.jeRucno, true, "izvor je oznacen kao rucni");

// Ako rucnog NEMA, automatsko se koristi.
const samoAuto = sloziPoPolju([
  redak("auto", "2026-08-10T10:00:00Z", false, { alkohol: 12.1 }),
]);
jednako(samoAuto.vrijednosti.alkohol, 12.1, "bez rucnog se uzima automatsko");
jednako(samoAuto.izvorPolja.alkohol?.jeRucno, false, "izvor oznacen kao automatski");

// Prednost vrijedi PO POLJU, ne po retku.
const poPolju = sloziPoPolju([
  redak("auto-novo", "2026-08-10T10:00:00Z", false, { alkohol: 99, secer: 1.1 }),
  redak("rucno-staro", "2026-08-01T10:00:00Z", true, { alkohol: 11.5 }),
]);
jednako(poPolju.vrijednosti.alkohol, 11.5, "po polju: alkohol iz rucnog");
jednako(poPolju.vrijednosti.secer, 1.1, "po polju: secer iz automatskog (rucnog nema)");

// ---------------------------------------------------------------------------
// 5. Svi zapisi prazni -> guard iz tocke 1 mora uhvatiti
// ---------------------------------------------------------------------------

const sviPrazni = sloziPoPolju([
  redak("p1", "2026-07-28T06:31:00Z", false, {}),
  redak("p2", "2026-07-28T06:31:00Z", false, {}),
]);
jednako(
  jeMjerenjePrazno(sviPrazni.vrijednosti),
  true,
  "svi zapisi prazni -> jeMjerenjePrazno true (pretok NE upisuje)"
);
jednako(sviPrazni.izvorPolja.alkohol, null, "svi prazni: nema izvora");

// ---------------------------------------------------------------------------
// 6. Nula je podatak, ne praznina
// ---------------------------------------------------------------------------

const snula = sloziPoPolju([
  redak("n1", "2026-08-10T10:00:00Z", true, { secer: 0 }),
  redak("n2", "2026-08-01T10:00:00Z", true, { secer: 4.2 }),
]);
jednako(snula.vrijednosti.secer, 0, "secer 0 se uzima kao vrijednost, ne preskace");
jednako(snula.izvorPolja.secer?.mjerenjeId, "n1", "izvor je noviji redak s nulom");

// ---------------------------------------------------------------------------
// 7. nizPolja — podloga za graf parametra
// ---------------------------------------------------------------------------
// Fermentacija: secer se mjeri svaki dan.

const fermentacija: RedakMjerenja[] = [
  redak("f4", "2026-09-04T08:00:00Z", true, { secer: 12 }),
  redak("f3", "2026-09-03T08:00:00Z", true, { secer: 34 }),
  redak("f2", "2026-09-02T08:00:00Z", true, { secer: 61, alkohol: 4.2 }),
  redak("f1", "2026-09-01T08:00:00Z", true, { secer: 88 }),
];

const nizSecer = nizPolja(fermentacija, "secer");
jednako(nizSecer.length, 4, "nizPolja secer: 4 tocke");
jednako(nizSecer[0].vrijednost, 88, "nizPolja: prva tocka je NAJSTARIJA (88)");
jednako(nizSecer[3].vrijednost, 12, "nizPolja: zadnja tocka je najnovija (12)");
jednako(
  nizSecer[0].izmjerenoAt.getTime() < nizSecer[3].izmjerenoAt.getTime(),
  true,
  "nizPolja: poredano uzlazno po vremenu"
);

const nizAlkohol = nizPolja(fermentacija, "alkohol");
jednako(nizAlkohol.length, 1, "nizPolja alkohol: samo 1 tocka");
jednako(nizAlkohol[0].vrijednost, 4.2, "nizPolja alkohol: vrijednost");

jednako(nizPolja(fermentacija, "ph").length, 0, "nizPolja pH: nema tocaka");
jednako(nizPolja([], "secer").length, 0, "nizPolja nad praznim popisom");

// Gore mora stajati secer od danas i alkohol od prekjucer — svaki sa svojim
// datumom. To je tocno slucaj iz zahtjeva.
const fermGore = sloziPoPolju(fermentacija);
jednako(fermGore.vrijednosti.secer, 12, "fermentacija: secer od danas");
jednako(fermGore.izvorPolja.secer?.mjerenjeId, "f4", "fermentacija: secer datum danas");
jednako(fermGore.vrijednosti.alkohol, 4.2, "fermentacija: alkohol od prekjucer");
jednako(fermGore.izvorPolja.alkohol?.mjerenjeId, "f2", "fermentacija: alkohol stariji datum");

// ---------------------------------------------------------------------------

console.log("");
console.log(`proslo: ${proslo}, palo: ${pao}`);

if (pao > 0) process.exit(1);
