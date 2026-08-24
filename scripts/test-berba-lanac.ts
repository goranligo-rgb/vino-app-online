/**
 * Provjera obilaska lanca blenda za berbu (lib/berba-lanac.ts).
 *
 * Pokretanje:  npm run test:berba:lanac
 *
 * NE DIRA BAZU. Prisma se ovdje uopce ne uvozi — umjesto nje stoji lazni citac
 * nad popisima u memoriji, koji broji koliko je upita zatrazeno. Zato ovaj test
 * moze pasti samo zbog logike obilaska, nikad zbog stanja produkcije.
 *
 * Sto se prikucava:
 *   - litre i kilogrami stavki OSTAJU IZVORNI (ne skaliraju se udjelom),
 *   - "preslo X od Y" ima tocan nazivnik, i to zbroj punjenja IZVORA,
 *   - sumnja se nasljedjuje niz put,
 *   - registar posjecenih zaustavlja i samo-petlju i povratak na korijen,
 *   - dubina 2 stane i to prizna (`staloNaDubini`),
 *   - granica arhive vrijedi i za izvor, ne samo za promatrani tank,
 *   - obrisane stavke punjenja ne ulaze,
 *   - broj upita je tocno onakav kakav se ocekuje (da tihi porast zapne ovdje,
 *     a ne na pooleru).
 */

import {
  berbaKrozLanac,
  izvorJeSumnjiv,
  usporediPoBerbi,
} from "../lib/berba-lanac";

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
// Lazna baza
// ---------------------------------------------------------------------------

type LTank = {
  id: string;
  broj: number;
  nazivVina: string | null;
  sorta: string | null;
  kolicinaVinaUTanku: number;
};

type LBlend = {
  id: string;
  ciljTankId: string;
  izvorTankId: string | null;
  izvorArhivaVinaId: string | null;
  nazivVina: string | null;
  sorta: string | null;
  kolicina: number;
};

type LStavka = {
  id: string;
  nazivSorte: string;
  kolicinaLitara: number;
  kolicinaKgGrozdja: number | null;
  opis: string | null;
  datumBerbe: Date | null;
  godinaBerbe: number | null;
  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
  secer: number | null;
  kiseline: number | null;
  ph: number | null;
  napomenaBerbe: string | null;
  maceracija: boolean | null;
  maceracijaSati: number | null;
  createdAt: Date;
  obrisano: boolean;
};

type LPunjenje = {
  id: string;
  tankId: string;
  nazivVina: string | null;
  datumPunjenja: Date;
  stavke: LStavka[];
};

type LArhPunjenje = {
  id: string;
  arhivaVinaId: string;
  nazivVina: string | null;
  datumPunjenja: Date;
  stavke: LStavka[];
};

type LArhiva = {
  id: string;
  tankId: string | null;
  brojTanka: number;
  arhiviranoAt: Date;
};

let stavkaBrojac = 0;

/** Stavka berbe s razumnim zadanim vrijednostima; navodi se samo bitno. */
function stavka(polja: Partial<LStavka> & { kolicinaLitara: number }): LStavka {
  stavkaBrojac++;
  return {
    id: `s${stavkaBrojac}`,
    nazivSorte: "Graševina",
    kolicinaKgGrozdja: null,
    opis: null,
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
    createdAt: new Date(`2026-01-0${(stavkaBrojac % 9) + 1}`),
    obrisano: false,
    ...polja,
  };
}

const tankovi: LTank[] = [
  { id: "t1", broj: 1, nazivVina: "Cuvée bijeli", sorta: "Cuvée", kolicinaVinaUTanku: 6000 },
  { id: "t2", broj: 12, nazivVina: "Graševina", sorta: "Graševina", kolicinaVinaUTanku: 400 },
  // Zapis blenda kaze Malvazija, tank sada drzi Chardonnay -> SUMNJIV.
  { id: "t9", broj: 9, nazivVina: "Cuvée bijeli", sorta: "Chardonnay", kolicinaVinaUTanku: 5000 },
  { id: "t5", broj: 5, nazivVina: "Rizling", sorta: "Rizling", kolicinaVinaUTanku: 400 },
];

const arhive: LArhiva[] = [
  { id: "arh1", tankId: "t7", brojTanka: 7, arhiviranoAt: new Date("2026-07-01") },
  { id: "arh2", tankId: "t3", brojTanka: 3, arhiviranoAt: new Date("2026-06-15") },
  { id: "arh3", tankId: "t21", brojTanka: 21, arhiviranoAt: new Date("2026-06-20") },
  // Arhiva ZIVOG tanka t5 — granica ispod koje se njegova punjenja ne citaju.
  { id: "arh5", tankId: "t5", brojTanka: 5, arhiviranoAt: new Date("2026-06-01") },
];

const blendovi: LBlend[] = [
  // Sastavnice promatranog tanka t1.
  { id: "b1", ciljTankId: "t1", izvorTankId: "t2", izvorArhivaVinaId: null, nazivVina: "Graševina", sorta: "Graševina", kolicina: 4800 },
  { id: "b2", ciljTankId: "t1", izvorTankId: null, izvorArhivaVinaId: "arh1", nazivVina: "Rizling", sorta: "Rizling", kolicina: 1200 },
  // Tank blenda sam u sebe — samo-petlja koju registar mora zaustaviti.
  { id: "b3", ciljTankId: "t1", izvorTankId: "t1", izvorArhivaVinaId: null, nazivVina: "Cuvée bijeli", sorta: "Cuvée", kolicina: 300 },
  { id: "b4", ciljTankId: "t1", izvorTankId: "t9", izvorArhivaVinaId: null, nazivVina: "Malvazija", sorta: "Malvazija", kolicina: 200 },
  // Bez pokazivaca (rucno upisan naziv) — nema odakle imati berbu.
  { id: "b5", ciljTankId: "t1", izvorTankId: null, izvorArhivaVinaId: null, nazivVina: "Kupljeno vino", sorta: null, kolicina: 100 },

  // Druga razina, ispod t2.
  { id: "b6", ciljTankId: "t2", izvorTankId: null, izvorArhivaVinaId: "arh2", nazivVina: "Graševina", sorta: "Graševina", kolicina: 2000 },
  { id: "b8", ciljTankId: "t2", izvorTankId: "t5", izvorArhivaVinaId: null, nazivVina: "Rizling", sorta: "Rizling", kolicina: 700 },
  // Povratak na korijen — drugi oblik ciklusa.
  { id: "b7", ciljTankId: "t2", izvorTankId: "t1", izvorArhivaVinaId: null, nazivVina: "Cuvée bijeli", sorta: "Cuvée", kolicina: 100 },

  // Druga razina, ispod sumnjivog t9.
  { id: "b9", ciljTankId: "t9", izvorTankId: null, izvorArhivaVinaId: "arh3", nazivVina: "Malvazija", sorta: "Malvazija", kolicina: 150 },
];

const punjenja: LPunjenje[] = [
  {
    id: "p-t2",
    tankId: "t2",
    nazivVina: "Graševina 2026",
    datumPunjenja: new Date("2026-09-10"),
    stavke: [
      stavka({
        kolicinaLitara: 3000,
        kolicinaKgGrozdja: 4000,
        parcela: "Gornje polje",
        oznakaBerbe: "B-04",
        datumBerbe: new Date("2026-09-04"),
      }),
      stavka({
        kolicinaLitara: 2200,
        kolicinaKgGrozdja: 2900,
        parcela: "Donje polje",
        oznakaBerbe: "B-06",
        datumBerbe: new Date("2026-09-06"),
      }),
    ],
  },
  {
    id: "p-t9",
    tankId: "t9",
    nazivVina: "Malvazija 2026",
    datumPunjenja: new Date("2026-09-12"),
    stavke: [
      stavka({
        kolicinaLitara: 600,
        oznakaBerbe: "B-05",
        datumBerbe: new Date("2026-09-05"),
      }),
      // Obrisana stavka ne smije ni u popis ni u nazivnik.
      stavka({ kolicinaLitara: 100, obrisano: true }),
    ],
  },
  // t5: jedno punjenje ISPRED njegove arhive (ne racuna se) i jedno iza.
  {
    id: "p-t5-staro",
    tankId: "t5",
    nazivVina: "Prethodno vino",
    datumPunjenja: new Date("2026-05-01"),
    stavke: [stavka({ kolicinaLitara: 500 })],
  },
  // Dvije stavke BEZ datuma berbe — moraju zavrsiti na kraju popisa.
  {
    id: "p-t5-novo",
    tankId: "t5",
    nazivVina: "Rizling 2026",
    datumPunjenja: new Date("2026-07-05"),
    stavke: [
      stavka({ kolicinaLitara: 250 }),
      stavka({ kolicinaLitara: 150 }),
    ],
  },
];

const arhPunjenja: LArhPunjenje[] = [
  {
    id: "ap1",
    arhivaVinaId: "arh1",
    nazivVina: "Rizling 2025",
    datumPunjenja: new Date("2025-09-20"),
    stavke: [
      stavka({
        kolicinaLitara: 900,
        nazivSorte: "Rizling",
        oznakaBerbe: "B-03",
        datumBerbe: new Date("2026-09-03"),
      }),
    ],
  },
  {
    id: "ap2",
    arhivaVinaId: "arh2",
    nazivVina: "Graševina 2025",
    datumPunjenja: new Date("2025-09-18"),
    stavke: [
      stavka({
        kolicinaLitara: 1500,
        oznakaBerbe: "B-02",
        datumBerbe: new Date("2026-09-02"),
      }),
    ],
  },
  {
    id: "ap3",
    arhivaVinaId: "arh3",
    nazivVina: "Malvazija 2025",
    datumPunjenja: new Date("2025-09-22"),
    stavke: [
      stavka({
        kolicinaLitara: 300,
        nazivSorte: "Malvazija",
        oznakaBerbe: "B-01",
        datumBerbe: new Date("2026-09-01"),
      }),
    ],
  },
];

let upita = 0;

const laznaBaza = {
  blendIzvor: {
    findMany: async ({ where }: { where: { ciljTankId: string } }) => {
      upita++;
      return blendovi
        .filter((b) => b.ciljTankId === where.ciljTankId)
        .slice()
        .sort((a, b) => b.kolicina - a.kolicina)
        .map((b) => ({
          ...b,
          izvorTank: b.izvorTankId
            ? (tankovi.find((t) => t.id === b.izvorTankId) ?? null)
            : null,
          izvorArhivaVina: b.izvorArhivaVinaId
            ? (arhive.find((a) => a.id === b.izvorArhivaVinaId) ?? null)
            : null,
        }));
    },
  },

  arhivaVina: {
    findFirst: async ({ where }: { where: { tankId: string } }) => {
      upita++;
      return (
        arhive
          .filter((a) => a.tankId === where.tankId)
          .slice()
          .sort((a, b) => b.arhiviranoAt.getTime() - a.arhiviranoAt.getTime())[0] ?? null
      );
    },
  },

  punjenjeTanka: {
    findMany: async ({
      where,
    }: {
      where: { tankId: string; datumPunjenja?: { gte: Date } };
    }) => {
      upita++;
      return punjenja
        .filter((p) => p.tankId === where.tankId)
        .filter(
          (p) =>
            !where.datumPunjenja || p.datumPunjenja >= where.datumPunjenja.gte
        )
        .map((p) => ({ ...p, stavke: p.stavke.filter((s) => !s.obrisano) }))
        .filter((p) => p.stavke.length > 0)
        .sort((a, b) => b.datumPunjenja.getTime() - a.datumPunjenja.getTime());
    },
  },

  arhivaPunjenjeTanka: {
    findMany: async ({ where }: { where: { arhivaVinaId: string } }) => {
      upita++;
      return arhPunjenja
        .filter((p) => p.arhivaVinaId === where.arhivaVinaId)
        .slice()
        .sort((a, b) => b.datumPunjenja.getTime() - a.datumPunjenja.getTime());
    },
  },
};

type Citac = Parameters<typeof berbaKrozLanac>[0];
const db = laznaBaza as unknown as Citac;

// Sve u `main()`, jer tsx ovdje prevodi u CJS i top-level await ne prolazi.
async function main() {

// ---------------------------------------------------------------------------
// 1. Puni obilazak, dubina 2
// ---------------------------------------------------------------------------

const lanac = await berbaKrozLanac(db, "t1", { dubina: 2, sirina: 2 });

jednako(
  lanac.izvori.map((x) => x.put.map((k) => k.naziv).join(" <- ")),
  [
    "tank 12",
    "arhiva tanka 7",
    "tank 9",
    "tank 12 <- arhiva tanka 3",
    "tank 12 <- tank 5",
    "tank 9 <- arhiva tanka 21",
  ],
  "obilazak: prva razina po kolicini, pa druga"
);

jednako(lanac.preskocenoCiklusa, 2, "dva ciklusa: t1<-t1 i t2<-t1");
jednako(lanac.staloNaDubini, true, "na dubini 2 ostao zivi tank (t5) -> priznaje se");

// Sastavnica bez pokazivaca (b5) nije ni ciklus ni izvor — nestaje bez traga.
jednako(
  lanac.izvori.some((x) => x.put.some((k) => k.blendIzvorId === "b5")),
  false,
  "sastavnica bez pokazivaca ne stvara kariku"
);

// ---------------------------------------------------------------------------
// 2. "Preslo X od Y" — nazivnik je zbroj punjenja IZVORA
// ---------------------------------------------------------------------------

const izT2 = lanac.izvori[0];
jednako(izT2.put[0].presloL, 4800, "preslo 4800 L");
jednako(izT2.put[0].odUkupnoL, 5200, "od 5200 L (3000 + 2200)");

const izArh1 = lanac.izvori[1];
jednako(izArh1.put[0].presloL, 1200, "iz arhive preslo 1200 L");
jednako(izArh1.put[0].odUkupnoL, 900, "arhiva ima 900 L zapisane berbe");

// ---------------------------------------------------------------------------
// 3. LITRE I KILOGRAMI OSTAJU IZVORNI
//
// Presla je 4800 L od 5200 L, dakle 92,3 %. Da se skalira, stavke bi bile
// 2769 L / 3692 kg i 2031 L / 2677 kg. Ne smiju biti.
// ---------------------------------------------------------------------------

jednako(
  izT2.punjenja[0].stavke.map((s) => s.kolicinaLitara),
  [3000, 2200],
  "litre stavki se NE skaliraju udjelom"
);
jednako(
  izT2.punjenja[0].stavke.map((s) => s.kolicinaKgGrozdja),
  [4000, 2900],
  "kilogrami grozdja se NE skaliraju — nitko ih nije ponovno vagao"
);
jednako(
  izT2.punjenja[0].stavke.map((s) => s.parcela),
  ["Gornje polje", "Donje polje"],
  "polja berbe dolaze doslovno"
);

// ---------------------------------------------------------------------------
// 4. Sumnjivo
// ---------------------------------------------------------------------------

const izT9 = lanac.izvori[2];
jednako(izT9.sumnjiv, true, "t9 drzi drugo vino nego sto zapis kaze -> sumnjiv");
jednako(izT2.sumnjiv, false, "t2 se slaze sa zapisom -> nije sumnjiv");

const izArh3 = lanac.izvori[5];
jednako(izArh3.put[1].sumnjiv, false, "sama arhiva nije sumnjiva");
jednako(
  izArh3.sumnjiv,
  true,
  "sumnja se NASLJEDJUJE: put ide kroz sumnjivi t9"
);

// ---------------------------------------------------------------------------
// 5. Obrisane stavke i granica arhive na IZVORU
// ---------------------------------------------------------------------------

jednako(
  izT9.punjenja[0].stavke.map((s) => s.kolicinaLitara),
  [600],
  "obrisana stavka ne ulazi u popis"
);
jednako(izT9.put[0].odUkupnoL, 600, "obrisana stavka ne ulazi ni u nazivnik");

const izT5 = lanac.izvori[4];
jednako(
  izT5.punjenja.map((p) => p.id),
  ["p-t5-novo"],
  "punjenje ispred arhive izvora pripada prethodnom vinu i ne cita se"
);
jednako(izT5.put[1].odUkupnoL, 400, "nazivnik t5 je samo punjenje iza granice");

// ---------------------------------------------------------------------------
// 6. Kljucevi su jedinstveni (React bi inace tiho gubio retke)
// ---------------------------------------------------------------------------

jednako(
  new Set(lanac.izvori.map((x) => x.kljuc)).size,
  lanac.izvori.length,
  "svaki izvor ima svoj kljuc"
);

jednako(
  new Set(lanac.stavke.map((x) => x.kljuc)).size,
  lanac.stavke.length,
  "svaka ravna stavka ima svoj kljuc"
);

// ---------------------------------------------------------------------------
// 6b. RAVNI POPIS ide po DATUMU BERBE, ne po izvoru
//
// Bacva u koju ide zadnji dio mosta prima iz vise berbi i vise dana. Grupirano
// po izvoru to je popis popisa; kronoloski je dnevnik berbe.
// ---------------------------------------------------------------------------

jednako(
  lanac.stavke.map((x) => x.stavka.oznakaBerbe),
  ["B-01", "B-02", "B-03", "B-04", "B-05", "B-06", null, null],
  "ravni popis je poredan po datumu berbe, bez obzira na izvor"
);

jednako(
  lanac.stavke.map((x) => x.put.map((k) => k.naziv).join(" <- ")),
  [
    "tank 9 <- arhiva tanka 21",
    "tank 12 <- arhiva tanka 3",
    "arhiva tanka 7",
    "tank 12",
    "tank 9",
    "tank 12",
    "tank 12 <- tank 5",
    "tank 12 <- tank 5",
  ],
  "put ide UZ SVAKU stavku — susjedne vise ne dijele izvor"
);

// Stavke bez datuma berbe idu NA KRAJ. Nepoznat datum nije "davno".
jednako(
  lanac.stavke.slice(-2).every((x) => x.imaDatumBerbe === false),
  true,
  "stavke bez datuma berbe idu na kraj"
);

// Sumnja putuje sa stavkom, ne ostaje na grupi.
jednako(
  lanac.stavke.filter((x) => x.sumnjiv).map((x) => x.stavka.oznakaBerbe),
  ["B-01", "B-05"],
  "sumnjive stavke nose oznaku i nakon sortiranja"
);

// ---------------------------------------------------------------------------
// 6c. Isto pravilo poretka vrijedi i za VLASTITE stavke tanka
//
// Monitor njime slaze oba popisa u kartici Berba. Bacva koja se puni izravno
// iz prese kroz vise dana ima isti problem kao ona punjena pretokom, pa bi
// dva razlicita poretka jedan ispod drugoga izgledala kao greska.
// ---------------------------------------------------------------------------

function poredak(
  datumBerbe: string | null,
  datumPunjenja: string,
  tezina: number,
  kljuc: string
) {
  return {
    datumBerbe: datumBerbe ? new Date(datumBerbe) : null,
    datumPunjenja: new Date(datumPunjenja),
    tezina,
    kljuc,
  };
}

const vlastite = [
  poredak("2026-09-06", "2026-09-10", 2200, "c"),
  poredak(null, "2026-09-11", 800, "d"),
  poredak("2026-09-04", "2026-09-10", 3000, "b"),
  poredak(null, "2026-09-09", 500, "e"),
  poredak("2026-09-01", "2026-09-12", 100, "a"),
].sort(usporediPoBerbi);

jednako(
  vlastite.map((x) => x.kljuc),
  ["a", "b", "c", "e", "d"],
  "vlastite stavke: po datumu berbe, bez datuma na kraj po datumu punjenja"
);

jednako(
  [
    poredak("2026-09-04", "2026-09-10", 100, "malo"),
    poredak("2026-09-04", "2026-09-10", 900, "puno"),
  ]
    .sort(usporediPoBerbi)
    .map((x) => x.kljuc),
  ["puno", "malo"],
  "isti datum -> veca kolicina prva"
);

jednako(
  [
    poredak("2026-09-04", "2026-09-10", 100, "b"),
    poredak("2026-09-04", "2026-09-10", 100, "a"),
  ]
    .sort(usporediPoBerbi)
    .map((x) => x.kljuc),
  ["a", "b"],
  "sve jednako -> kljuc odlucuje, poredak ne ovisi o redu citanja"
);

// ---------------------------------------------------------------------------
// 7. SAZETAK — bez kilograma, bez dvostrukog brojanja litara
// ---------------------------------------------------------------------------

jednako(lanac.sazetak.zapisa, 8, "osam zapisa berbe kroz lanac");
jednako(lanac.sazetak.izravnihIzvora, 3, "tri IZRAVNE sastavnice (t2, arh1, t9)");

// 4800 (t2) + 1200 (arh1) + 200 (t9) = 6200.
// Dublje karike (arh2 2000, t5 700, arh3 150) su DIO tih kolicina, ne dodatak:
// da se zbrajaju, ispalo bi 9050 L u tanku koji ih nikad nije primio.
jednako(
  lanac.sazetak.presloUkupnoL,
  6200,
  "zbroj ide po izravnim sastavnicama — dublje karike se ne broje dvaput"
);

jednako(
  Object.prototype.hasOwnProperty.call(lanac.sazetak, "ukupnoKg"),
  false,
  "sazetak NEMA zbroj kilograma — iz svake berbe dosao je samo dio"
);

jednako(
  [lanac.sazetak.odDatuma?.toISOString(), lanac.sazetak.doDatuma?.toISOString()],
  [
    new Date("2026-09-01").toISOString(),
    new Date("2026-09-06").toISOString(),
  ],
  "raspon datuma berbe od prve do zadnje"
);

// ---------------------------------------------------------------------------
// 8. Cijena u upitima
//
// 12 = 1 (sastavnice t1) + 5 (t2: arhiva+punjenja, arh1, t9: arhiva+punjenja)
//    + 2 (sastavnice t2 i t9) + 4 (arh2, t5: arhiva+punjenja, arh3)
// Ako ovo naraste bez razloga, naraslo je i opterecenje poolera.
// ---------------------------------------------------------------------------

jednako(upita, 12, "puni obilazak dubine 2 kosta 12 upita");

// ---------------------------------------------------------------------------
// 9. Dubina 1 stane odmah, i to prizna
// ---------------------------------------------------------------------------

upita = 0;
const plitko = await berbaKrozLanac(db, "t1", { dubina: 1, sirina: 2 });

jednako(
  plitko.izvori.map((x) => x.put.map((k) => k.naziv).join(" <- ")),
  ["tank 12", "arhiva tanka 7", "tank 9"],
  "dubina 1: samo izravne sastavnice"
);
jednako(plitko.staloNaDubini, true, "dubina 1: ispod ostaju zivi tankovi");
jednako(plitko.preskocenoCiklusa, 1, "dubina 1: samo samo-petlja t1<-t1");
jednako(upita, 6, "dubina 1 kosta 6 upita");

// ---------------------------------------------------------------------------
// 10. Tank bez sastavnica
// ---------------------------------------------------------------------------

upita = 0;
const prazan = await berbaKrozLanac(db, "t99", { dubina: 2, sirina: 2 });
jednako(prazan.izvori.length, 0, "tank bez sastavnica nema sto naslijediti");
jednako(prazan.staloNaDubini, false, "nema sastavnica -> nema ni sto preskociti");
jednako(upita, 1, "tank bez sastavnica: jedan upit i gotovo");

// ---------------------------------------------------------------------------
// 11. Samo pravilo sumnje
// ---------------------------------------------------------------------------

jednako(
  izvorJeSumnjiv({ nazivVina: "Graševina", sorta: "Graševina" }, null),
  false,
  "sastavnica bez tanka nije sumnjiva"
);
jednako(
  izvorJeSumnjiv(
    { nazivVina: "Graševina", sorta: "Graševina" },
    { nazivVina: null, sorta: null, kolicinaVinaUTanku: 0 }
  ),
  false,
  "prazan tank nista ne tvrdi, pa nije sumnjiv"
);
jednako(
  izvorJeSumnjiv(
    { nazivVina: "  graševina ", sorta: "GRAŠEVINA" },
    { nazivVina: "Graševina", sorta: "Graševina", kolicinaVinaUTanku: 500 }
  ),
  false,
  "razmaci i velika slova ne cine razliku"
);
jednako(
  izvorJeSumnjiv(
    { nazivVina: "Graševina", sorta: "Graševina" },
    { nazivVina: "Malvazija", sorta: "Malvazija", kolicinaVinaUTanku: 500 }
  ),
  true,
  "drugo vino u tanku -> sumnjivo"
);

// ---------------------------------------------------------------------------

}

main().then(() => {
  console.log("");
  console.log(`proslo: ${proslo}, palo: ${pao}`);
  if (pao > 0) process.exit(1);
});
