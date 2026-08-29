/**
 * Provjera PODJELE PUNJENJA PO TANKOVIMA (app/api/punjenje/route.ts).
 *
 * Pokretanje:  npm run test:punjenje:podjela
 *
 * NE DIRA BAZU. Sve tri funkcije koje se ovdje provjeravaju su ciste:
 * `procitajOdredista`, `stavkeZaTank` i `tankoviRedom`. Zato se smiju
 * pokretati bilo kad, i zato su izvucene iz `POST` handlera — orkestracija
 * upisa je pokrivena drugdje (`npm run test:berba:knjiga`, scenariji 15-20).
 *
 * STO SE DOKAZUJE
 *   1. stavka bez `tankovi` ide cijela u zadani tank — tocno kao dosad;
 *   2. zbroj po tankovima mora biti jednak kolicini stavke, do MILILITRA;
 *   3. kilogrami pripadaju PRVOM tanku stavke i nijednom drugom;
 *   4. redoslijed tankova je redoslijed prvog pojavljivanja, jer o njemu
 *      ovisi tko je "prvi tank";
 *   5. sve odbijenice imaju poruku koja kaze KOJA stavka i KOJI redak.
 */

import {
  procitajOdredista,
  stavkeZaTank,
  tankoviRedom,
  ZahtjevGreska,
  type CistaStavka,
  type Odrediste,
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

function tvrdi(uvjet: boolean, poruka: string) {
  jednako(uvjet, true, poruka);
}

/** Poruka greske, ili null ako greske nije bilo. */
function pukne(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof ZahtjevGreska)) {
      return `NIJE ZahtjevGreska nego ${(e as Error).name}: ${(e as Error).message}`;
    }
    return (e as Error).message;
  }
}

/** Minimalna stavka — samo ono sto podjela cita. */
function stavka(
  nazivSorte: string,
  kolicinaLitara: number,
  odredista: Odrediste[],
  kolicinaKgGrozdja: number | null = null
): CistaStavka {
  return {
    redakPoTanku: new Map(odredista.map((o) => [o.tankId, `redak-${o.tankId}`])),
    odredista,
    sortaId: null,
    nazivSorte,
    opis: null,
    kolicinaKgGrozdja,
    kolicinaLitara,
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
  };
}

// ---------------------------------------------------------------------------

console.log("1. Bez popisa tankova — zatecen put, nepromijenjen\n");

{
  const o = procitajOdredista({}, 3000, "T5", 1);
  jednako(o.length, 1, "jedno odrediste");
  jednako(o[0].tankId, "T5", "i to zadani tank");
  jednako(o[0].litre, 3000, "s cijelom kolicinom stavke");

  // Prazan popis se ponasa isto kao da ga nema — forma koja posalje `[]`
  // ne smije proci drugim putem od one koja polje uopce ne salje.
  const prazan = procitajOdredista({ tankovi: [] }, 3000, "T5", 1);
  jednako(prazan.length, 1, "prazan popis pada na zadani tank");
  jednako(prazan[0].tankId, "T5", "isti tank");

  jednako(
    pukne(() => procitajOdredista({}, 3000, null, 1)),
    "Tank je obavezan.",
    "bez tanka i bez popisa puca"
  );
}

console.log("\n2. Podjela u vise tankova\n");

{
  const o = procitajOdredista(
    {
      tankovi: [
        { tankId: "T5", litre: 1800 },
        { tankId: "T7", litre: 1200 },
      ],
    },
    3000,
    null,
    1
  );

  jednako(o.length, 2, "dva odredista");
  jednako(o[0].litre, 1800, "samotok 1800 L");
  jednako(o[1].litre, 1200, "presovina 1200 L");
  jednako(
    o.reduce((z, x) => z + x.ml, 0),
    3_000_000,
    "zbroj u mililitrima je tocno 3.000 L"
  );

  // `body.tankId` se IGNORIRA kad stavka ima svoj popis. Inace bi tank iz
  // gornjeg odabira tiho dobio litre koje mu nitko nije namijenio.
  const sZadanim = procitajOdredista(
    { tankovi: [{ tankId: "T9", litre: 500 }] },
    500,
    "T5",
    1
  );
  jednako(sZadanim.length, 1, "popis pobjedjuje zadani tank");
  jednako(sZadanim[0].tankId, "T9", "i to bez traga od T5");
}

console.log("\n3. Zbroj mora odgovarati, do mililitra\n");

{
  const manjak = pukne(() =>
    procitajOdredista(
      {
        tankovi: [
          { tankId: "T5", litre: 1800 },
          { tankId: "T7", litre: 1000 },
        ],
      },
      3000,
      null,
      2
    )
  );
  tvrdi(String(manjak).startsWith("2. stavka:"), "poruka kaze KOJA stavka");
  tvrdi(String(manjak).includes("2800"), "i koliki je zbroj ispao");
  tvrdi(String(manjak).includes("3000"), "i koliki je trebao biti");

  const visak = pukne(() =>
    procitajOdredista(
      {
        tankovi: [
          { tankId: "T5", litre: 1800 },
          { tankId: "T7", litre: 1300 },
        ],
      },
      3000,
      null,
      1
    )
  );
  tvrdi(visak != null, "visak takodjer puca");

  // Rub zbog kojeg se usporedjuje u MILILITRIMA, a ne u litrama: u pokretnom
  // zarezu 100.1 + 200.2 daje 300.29999999999995, sto !== 300.3. Da se zbroj
  // provjeravao u litrama, ovakva bi podjela bila odbijena bez razloga —
  // korisnik je upisao brojeve koji se savrseno zbrajaju.
  jednako(100.1 + 200.2 === 300.3, false, "u pokretnom zarezu to NIJE jednako");

  const decimale = procitajOdredista(
    {
      tankovi: [
        { tankId: "T5", litre: 100.1 },
        { tankId: "T7", litre: 200.2 },
      ],
    },
    300.3,
    null,
    1
  );
  jednako(decimale.length, 2, "a u mililitrima prolazi");
  jednako(
    decimale.reduce((z, x) => z + x.ml, 0),
    300_300,
    "zbroj je tocno 300.300 ml"
  );

  // Treci decimalni mjesto je granica mililitra — ispod toga se zaokruzuje.
  const tri = procitajOdredista(
    {
      tankovi: [
        { tankId: "T5", litre: 333.333 },
        { tankId: "T7", litre: 333.333 },
        { tankId: "T9", litre: 333.334 },
      ],
    },
    1000,
    null,
    1
  );
  jednako(
    tri.reduce((z, x) => z + x.ml, 0),
    1_000_000,
    "tri neravna dijela se zbroje tocno"
  );
}

console.log("\n4. Odbijenice s tocnom porukom\n");

{
  jednako(
    pukne(() =>
      procitajOdredista({ tankovi: [{ tankId: "  ", litre: 100 }] }, 100, null, 3)
    ),
    "3. stavka: nedostaje tank na 1. retku.",
    "prazan tank u retku"
  );

  jednako(
    pukne(() =>
      procitajOdredista(
        { tankovi: [{ tankId: "T5", litre: 100 }, { tankId: "T7", litre: 0 }] },
        100,
        null,
        1
      )
    ),
    "1. stavka: litre za 2. tank moraju biti veće od nule.",
    "nula litara, i kaze KOJI redak"
  );

  jednako(
    pukne(() =>
      procitajOdredista(
        { tankovi: [{ tankId: "T5", litre: 100 }, { tankId: "T7", litre: -5 }] },
        95,
        null,
        1
      )
    ),
    "1. stavka: litre za 2. tank moraju biti veće od nule.",
    "negativne litre"
  );

  jednako(
    pukne(() =>
      procitajOdredista(
        { tankovi: [{ tankId: "T5", litre: 100 }, { tankId: "T5", litre: 200 }] },
        300,
        null,
        1
      )
    ),
    "1. stavka: isti tank je naveden više puta. Spoji ga u jedan redak.",
    "isti tank dvaput"
  );

  tvrdi(
    pukne(() =>
      procitajOdredista({ tankovi: [{ tankId: "T5", litre: "abc" }] }, 100, null, 1)
    ) != null,
    "litre koje nisu broj"
  );
}

console.log("\n5. Raspored po tankovima i kilogrami\n");

{
  // Jedna berba: 4.200 kg s jednog polozaja, razliveno u tri tanka.
  const grasevina = stavka(
    "Graševina",
    3500,
    [
      { tankId: "T5", litre: 1800, ml: 1_800_000 },
      { tankId: "T7", litre: 1200, ml: 1_200_000 },
      { tankId: "T9", litre: 500, ml: 500_000 },
    ],
    4200
  );

  // Druga sorta, samo u jedan tank — i to u onaj koji je vec u igri.
  const sauvignon = stavka(
    "Sauvignon",
    2000,
    [{ tankId: "T7", litre: 2000, ml: 2_000_000 }],
    2600
  );

  const sve = [grasevina, sauvignon];

  jednako(tankoviRedom(sve), ["T5", "T7", "T9"], "redoslijed prvog pojavljivanja");

  const t5 = stavkeZaTank(sve, "T5");
  jednako(t5.length, 1, "u T5 ide jedna stavka");
  jednako(t5[0].o.litre, 1800, "s 1800 L");
  jednako(t5[0].prvi, true, "T5 je PRVI tank Graševine");

  const t7 = stavkeZaTank(sve, "T7");
  jednako(t7.length, 2, "u T7 idu dvije stavke");
  jednako(
    t7.map((x) => x.s.nazivSorte),
    ["Graševina", "Sauvignon"],
    "redoslijedom stavki"
  );
  jednako(t7[0].prvi, false, "T7 NIJE prvi tank Graševine");
  jednako(t7[1].prvi, true, "ali JEST prvi tank Sauvignona");

  const t9 = stavkeZaTank(sve, "T9");
  jednako(t9[0].prvi, false, "T9 nije prvi tank ni jedne stavke");

  // KLJUCNO: kilogrami se ne dijele i ne ponavljaju. Zbroj kg po svim
  // tankovima mora biti tocno onoliko koliko je ubrano — 4200 + 2600.
  function kgTanka(tid: string) {
    return stavkeZaTank(sve, tid).reduce(
      (z, x) => z + (x.prvi ? (x.s.kolicinaKgGrozdja ?? 0) : 0),
      0
    );
  }

  jednako(kgTanka("T5"), 4200, "T5 nosi svih 4200 kg Graševine");
  jednako(kgTanka("T7"), 2600, "T7 nosi samo 2600 kg Sauvignona");
  jednako(kgTanka("T9"), 0, "T9 ne nosi nijedan kilogram");
  jednako(
    kgTanka("T5") + kgTanka("T7") + kgTanka("T9"),
    6800,
    "zbroj po tankovima je tocno ono sto je ubrano, bez udvostrucenja"
  );

  // Litre se, za razliku od kilograma, DIJELE — i moraju se zbrojiti natrag.
  function litreTanka(tid: string) {
    return stavkeZaTank(sve, tid).reduce((z, x) => z + x.o.litre, 0);
  }

  jednako(litreTanka("T5"), 1800, "T5 prima 1800 L");
  jednako(litreTanka("T7"), 3200, "T7 prima 1200 + 2000 L");
  jednako(litreTanka("T9"), 500, "T9 prima 500 L");
  jednako(
    litreTanka("T5") + litreTanka("T7") + litreTanka("T9"),
    5500,
    "zbroj litara je 3500 + 2000"
  );
}

console.log("\n6. Jedan tank: raspored je isti kao i prije podjele\n");

{
  const sam = stavka("Graševina", 3000, [
    { tankId: "T5", litre: 3000, ml: 3_000_000 },
  ]);

  jednako(tankoviRedom([sam]), ["T5"], "jedan tank");
  jednako(stavkeZaTank([sam], "T5").length, 1, "jedna stavka u njemu");
  jednako(stavkeZaTank([sam], "T5")[0].prvi, true, "i on je njezin prvi tank");
  jednako(stavkeZaTank([sam], "T7").length, 0, "drugi tank ne dobiva nista");
}

// ---------------------------------------------------------------------------

console.log("");
console.log(`UKUPNO — proslo: ${proslo}, palo: ${pao}`);

if (pao > 0) process.exitCode = 1;
