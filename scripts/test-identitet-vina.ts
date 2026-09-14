/**
 * PROVJERA IDENTITETA VINA — pravilo rodjenja i stablo kucica.
 *
 * Pokretanje:  npm run test:identitet:vina
 *
 * SIGURNOST: cisti dio radi bez baze; dio nad bazom je ISKLJUCIVO SELECT.
 * Izlazni kod je 1 ako ijedna tvrdnja padne ili ijedna mutacija prodje.
 *
 * STO SE DOKAZUJE
 * ---------------
 * 1. Rodjenje na 20 % volumena NEPOSREDNO PRIJE dolijevanja; akumulator se
 *    nulira pri rodjenju.
 * 2. Premjestanje u praznu posudu iz JEDNOG izvora ne rada vino; iz vise rada.
 * 3. Kucica po SVAKOM izvoru — i kad je izvor jedan. Izvana ide kucica PO
 *    PARTIJI: dvije sorte u prazan tank su dva izvora.
 * 4. Progutana dolijevanja ulaze u kucice vina kojem su dolivena.
 * 5. Plitko stablo (`dubina: 1`) ostavlja neotvorene kucice (`posuda`), koje
 *    prikaz nudi na klik; duboko ide do berbe.
 * 6. SORTNO / CUVEE / BEZ_TVRDNJE, uz zbrajanje po sorti.
 * 7. `skrati` rezi stablo i kaze koliko je razina ostalo.
 * 8. NAD PRAVOM BAZOM: litre svakog ulaza slazu se sa `stanjeTanka` — mjerilo
 *    istine, ne unutarnja dosljednost. Ta je tvrdnja dodana nakon sto je
 *    prijasnja izvedba prosla 36 tvrdnji i svejedno tvrdila 25.650 L za tank
 *    koji ima 10.000.
 *
 * MUTACIJE: `primijeniPravilo`, `razvrstaj` i `skrati` se ubacuju.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { stanjeTanka } from "../lib/berba-model";
import {
  citajUlazneCine,
  primijeniPravilo,
  razvrstaj,
  skrati,
  dubina,
  listovi,
  vinoUTanku,
  imenujOdljev,
  PRAG_SORTNOSTI,
  type Odluka,
  type StavkaSastava,
  type UlazniCin,
  type VinoCvor,
  type RedakOdljeva,
  type StavkaOdljeva,
} from "../lib/identitet-vina";

let proslo = 0;
let palo = 0;

function tvrdi(uvjet: boolean, opis: string, detalj?: string) {
  if (uvjet) {
    proslo++;
    console.log(`  ok   ${opis}`);
  } else {
    palo++;
    console.log(`  PALO ${opis}${detalj ? `\n       ${detalj}` : ""}`);
  }
}

const SAT = 3_600_000;
const POCETAK = Date.parse("2026-09-01T06:00:00Z");
const u = (h: number) => new Date(POCETAK + h * SAT);

const SORTE = new Map([
  ["b1", "Graševina"],
  ["b2", "Graševina"],
  ["b3", "Sauvignon"],
  ["bx", "Nepoznato podrijetlo"],
]);

type Izvor = UlazniCin["izvori"][number];

function cin(
  x: Omit<Partial<UlazniCin>, "izvori"> & {
    kada: Date;
    uslo: number;
    prije: number;
    izvori?: Array<Omit<Izvor, "otpusteno"> & { otpusteno?: number }>;
  }
): UlazniCin {
  const izvori = x.izvori ?? [{ izTankId: null, litre: x.uslo, berbe: ["b1"] }];
  return {
    tankId: x.tankId ?? "A",
    kljuc: x.kljuc ?? `c${x.kada.getTime()}`,
    kada: x.kada,
    uslo: x.uslo,
    prije: x.prije,
    // Kad scenarij ne kaze drukcije, iz izvora je izaslo tocno ono sto je uslo —
    // nema kala. Scenariji koji kalo mjere postavljaju `otpusteno` izrijekom.
    izvori: izvori.map((i) => ({ ...i, otpusteno: i.otpusteno ?? i.litre })),
  };
}

// ---------------------------------------------------------------- PRAVILO
type Pravilo = (ulazi: UlazniCin[]) => Odluka[];
type Tvrdnja = { opis: string; ok: boolean };

function baterijaPravila(f: Pravilo): Tvrdnja[] {
  const t: Tvrdnja[] = [];
  const reci = (opis: string, ok: boolean) => t.push({ opis, ok });

  // prazna posuda, jedan izvor -> nije rodjenje
  {
    const o = f([cin({ kada: u(0), uslo: 1000, prije: 0, izvori: [{ izTankId: "S", litre: 1000, berbe: ["b1"] }] })]);
    reci("prazna posuda iz jednog izvora nije rodjenje", o[0].rodjenje === false && o[0].izPrazne === true);
  }

  // prazna posuda, dva izvora -> rodjenje
  {
    const o = f([
      cin({
        kada: u(0), uslo: 2000, prije: 0,
        izvori: [
          { izTankId: "S1", litre: 1000, berbe: ["b1"] },
          { izTankId: "S2", litre: 1000, berbe: ["b3"] },
        ],
      }),
    ]);
    reci("prazna posuda iz dva izvora JEST rodjenje", o[0].rodjenje === true);
  }

  // 15 % guta, kumulativno preko 20 % rada
  {
    const o = f([
      cin({ kada: u(0), uslo: 1000, prije: 0 }),
      cin({ kada: u(5), uslo: 150, prije: 1000 }),
      cin({ kada: u(9), uslo: 100, prije: 1150 }),
    ]);
    reci("dolijevanje od 15 % ne rada vino", o[1].rodjenje === false);
    reci("kumulativno 250 od 1150 (> 20 %) rada vino", o[2].rodjenje === true);
  }

  // nazivnik je volumen PRIJE dolijevanja, ne pri rodjenju
  {
    const o = f([
      cin({ kada: u(0), uslo: 1000, prije: 0 }),
      cin({ kada: u(5), uslo: 150, prije: 1000 }),
      cin({ kada: u(9), uslo: 60, prije: 1150 }),
    ]);
    reci("210 od 1150 ne rada vino (nazivnik je tekuci volumen)", o[2].rodjenje === false);
  }

  // akumulator se nulira pri rodjenju
  {
    const o = f([
      cin({ kada: u(0), uslo: 1000, prije: 0 }),
      cin({ kada: u(5), uslo: 300, prije: 1000 }),
      cin({ kada: u(9), uslo: 100, prije: 1300 }),
    ]);
    reci("nakon rodjenja akumulator krece od nule", o[1].rodjenje === true && o[2].rodjenje === false);
  }

  return t;
}

const MUTACIJE_PRAVILO: Array<{ naziv: string; f: Pravilo }> = [
  {
    naziv: "nazivnik je volumen pri rodjenju, ne tekuci",
    f: (ulazi) => {
      let doliveno = 0;
      let mlRodjenja = 0;
      return [...ulazi].sort((a, b) => a.kada.getTime() - b.kada.getTime()).map((c) => {
        const izPrazne = c.prije < 1;
        if (izPrazne) { doliveno = 0; mlRodjenja = c.prije + c.uslo; return { cin: c, rodjenje: c.izvori.length > 1, izPrazne }; }
        doliveno += c.uslo;
        const rod = doliveno > 0.2 * (mlRodjenja || c.prije);
        if (rod) { doliveno = 0; mlRodjenja = c.prije + c.uslo; }
        return { cin: c, rodjenje: rod, izPrazne };
      });
    },
  },
  {
    naziv: "akumulator se ne nulira pri rodjenju",
    f: (ulazi) => {
      let doliveno = 0;
      return [...ulazi].sort((a, b) => a.kada.getTime() - b.kada.getTime()).map((c) => {
        const izPrazne = c.prije < 1;
        if (izPrazne) { doliveno = 0; return { cin: c, rodjenje: c.izvori.length > 1, izPrazne }; }
        doliveno += c.uslo;
        return { cin: c, rodjenje: doliveno > 0.2 * c.prije, izPrazne };
      });
    },
  },
  {
    naziv: "prazna posuda iz vise izvora ne rada vino",
    f: (ulazi) => {
      let doliveno = 0;
      return [...ulazi].sort((a, b) => a.kada.getTime() - b.kada.getTime()).map((c) => {
        const izPrazne = c.prije < 1;
        if (izPrazne) { doliveno = 0; return { cin: c, rodjenje: false, izPrazne }; }
        doliveno += c.uslo;
        const rod = doliveno > 0.2 * c.prije;
        if (rod) doliveno = 0;
        return { cin: c, rodjenje: rod, izPrazne };
      });
    },
  },
];

// ------------------------------------------------------------- RAZVRSTAJ
type Razvrstaj = typeof razvrstaj;

function baterijaRazvrstaj(f: Razvrstaj): Tvrdnja[] {
  const s = (naziv: string, postotak: number, berbaId = naziv): StavkaSastava => ({
    berbaId, nazivSorte: naziv, litre: postotak * 10, postotak,
  });
  return [
    { opis: "85 % je sortno", ok: f([s("Graševina", 85), s("Sauvignon", 15)]).vrsta === "SORTNO" },
    { opis: "tocno 80 % nije sortno", ok: f([s("Graševina", 80), s("Sauvignon", 20)]).vrsta === "CUVEE" },
    { opis: "nepoznato podrijetlo -> bez tvrdnje", ok: f([s("Nepoznato podrijetlo", 90), s("Graševina", 10)]).vrsta === "BEZ_TVRDNJE" },
    {
      opis: "dvije partije iste sorte se zbrajaju",
      ok: f([s("Graševina", 45, "b1"), s("Graševina", 45, "b2"), s("Sauvignon", 10, "b3")]).vrsta === "SORTNO",
    },
  ];
}

const MUTACIJE_RAZVRSTAJ: Array<{ naziv: string; f: Razvrstaj }> = [
  {
    naziv: "prag je >= umjesto >",
    f: (sastav) => {
      const z = new Map<string, number>();
      for (const x of sastav) z.set(x.nazivSorte, (z.get(x.nazivSorte) ?? 0) + x.postotak);
      const g = [...z.entries()].map(([nazivSorte, postotak]) => ({ nazivSorte, postotak })).sort((a, b) => b.postotak - a.postotak)[0] ?? null;
      if (!g) return { vrsta: "BEZ_TVRDNJE", glavna: null };
      if (g.nazivSorte === "Nepoznato podrijetlo") return { vrsta: "BEZ_TVRDNJE", glavna: g };
      return { vrsta: g.postotak >= PRAG_SORTNOSTI ? "SORTNO" : "CUVEE", glavna: g };
    },
  },
  {
    naziv: "ne provjerava pravu sortu",
    f: (sastav) => {
      const z = new Map<string, number>();
      for (const x of sastav) z.set(x.nazivSorte, (z.get(x.nazivSorte) ?? 0) + x.postotak);
      const g = [...z.entries()].map(([nazivSorte, postotak]) => ({ nazivSorte, postotak })).sort((a, b) => b.postotak - a.postotak)[0] ?? null;
      if (!g) return { vrsta: "BEZ_TVRDNJE", glavna: null };
      return { vrsta: g.postotak > PRAG_SORTNOSTI ? "SORTNO" : "CUVEE", glavna: g };
    },
  },
  {
    naziv: "zbraja po berbi umjesto po sorti",
    f: (sastav) => {
      const g = [...sastav].sort((a, b) => b.postotak - a.postotak)[0] ?? null;
      if (!g) return { vrsta: "BEZ_TVRDNJE", glavna: null };
      const glavna = { nazivSorte: g.nazivSorte, postotak: g.postotak };
      if (g.nazivSorte === "Nepoznato podrijetlo") return { vrsta: "BEZ_TVRDNJE", glavna };
      return { vrsta: g.postotak > PRAG_SORTNOSTI ? "SORTNO" : "CUVEE", glavna };
    },
  },
];

async function main() {
  console.log("Provjera identiteta vina — pravilo i kucice.\n");

  console.log("PRAVILO RODJENJA");
  for (const x of baterijaPravila(primijeniPravilo)) tvrdi(x.ok, x.opis);

  console.log("\nRAZVRSTAVANJE");
  for (const x of baterijaRazvrstaj(razvrstaj)) tvrdi(x.ok, x.opis);

  console.log("\nSTABLO KUCICA");
  {
    // T sada: doslo 1000 L iz posude S; kucica mora postojati i biti jedna.
    const cini = new Map<string, UlazniCin[]>([
      ["T", [cin({ tankId: "T", kada: u(10), uslo: 1000, prije: 0, izvori: [{ izTankId: "S", litre: 1000, berbe: ["b1"] }] })]],
      ["S", [cin({ tankId: "S", kada: u(0), uslo: 1000, prije: 0, izvori: [{ izTankId: null, litre: 1000, berbe: ["b1"] }] })]],
    ]);

    const duboko = vinoUTanku(cini, SORTE, "T", u(20).getTime());
    tvrdi(duboko.vrsta === "spoj" && duboko.sastavnice.length === 1, "jedan izvor IMA kucicu, i to jednu");
    // Gleda LISTOVE, ne prvo dijete: otkad kucica postoji i za jedan izvor,
    // partija je unuk, ne dijete.
    tvrdi(new Set(listovi(duboko)).size > 0, "duboko stablo ide do berbe");

    const plitko = vinoUTanku(cini, SORTE, "T", u(20).getTime(), { dubina: 1 });
    tvrdi(
      plitko.vrsta === "spoj" && plitko.sastavnice[0].vino.vrsta === "posuda",
      "plitko stablo ostavlja neotvorenu kucicu"
    );
  }

  {
    // Izvana s dvije partije: kucica PO PARTIJI.
    const cini = new Map<string, UlazniCin[]>([
      ["T", [cin({ tankId: "T", kada: u(0), uslo: 2000, prije: 0, izvori: [{ izTankId: null, litre: 2000, berbe: ["b1", "b3"] }] })]],
    ]);
    const v = vinoUTanku(cini, SORTE, "T", u(5).getTime());
    tvrdi(v.vrsta === "spoj" && v.sastavnice.length === 2, "dvije partije izvana daju DVIJE kucice");
    tvrdi(new Set(listovi(v)).size === 2, "obje partije su listovi");
  }

  {
    // Progutano dolijevanje ulazi u kucice vina kojem je doliveno.
    const cini = new Map<string, UlazniCin[]>([
      ["T", [
        cin({ tankId: "T", kada: u(0), uslo: 1000, prije: 0, izvori: [{ izTankId: null, litre: 1000, berbe: ["b1"] }] }),
        cin({ tankId: "T", kada: u(5), uslo: 100, prije: 1000, izvori: [{ izTankId: "S", litre: 100, berbe: ["b3"] }] }),
      ]],
      ["S", [cin({ tankId: "S", kada: u(0), uslo: 500, prije: 0, izvori: [{ izTankId: null, litre: 500, berbe: ["b3"] }] })]],
    ]);
    const v = vinoUTanku(cini, SORTE, "T", u(20).getTime());
    tvrdi(v.vrsta === "spoj" && v.sastavnice.length === 2, "progutano dolijevanje vidi se kao kucica");
  }

  {
    const list = (id: string): VinoCvor => ({ vrsta: "partija", berbaId: id, nazivSorte: "Graševina", litre: 100 });
    const spoj = (djeca: VinoCvor[]): VinoCvor => ({
      vrsta: "spoj", kada: u(0), tankId: "A",
      sastavnice: djeca.map((v) => ({
        vino: v,
        litre: 100,
        udio: 1 / djeca.length,
        otpusteno: 100,
        kalo: 0,
        progutano: false,
      })),
      litre: 100 * djeca.length,
    });
    const stablo = spoj([spoj([spoj([list("b1")])])]);
    tvrdi(dubina(stablo) === 3, "dubina stabla je 3");
    tvrdi(skrati(stablo, 1).jos === 2, "rez na jednu razinu javlja jos 2");
    tvrdi(skrati(stablo, 6).jos === 0, "dubina 3 stane u klik od 6 razina");
  }

  console.log("\nMUTACIJE (svaka mora pasti bar jednom)");
  for (const m of MUTACIJE_PRAVILO) {
    const pala = baterijaPravila(m.f).filter((x) => !x.ok);
    tvrdi(pala.length > 0, `uhvacena: pravilo — ${m.naziv}`, pala.length === 0 ? "mutacija je prosla sve tvrdnje" : undefined);
  }
  for (const m of MUTACIJE_RAZVRSTAJ) {
    const pala = baterijaRazvrstaj(m.f).filter((x) => !x.ok);
    tvrdi(pala.length > 0, `uhvacena: razvrstaj — ${m.naziv}`, pala.length === 0 ? "mutacija je prosla sve tvrdnje" : undefined);
  }

  // ------------------------------------------------ kalo i imenovani odljev
  console.log("\nKALO I IMENOVANI ODLJEV");
  {
    // Iz S je otpusteno 4.100 L, a u T je uslo 4.000. Razlika je kalo i mora se
    // vidjeti na kucici, ne progutati.
    const cini = new Map<string, UlazniCin[]>([
      ["T", [cin({ tankId: "T", kada: u(10), uslo: 4000, prije: 0, izvori: [{ izTankId: "S", litre: 4000, otpusteno: 4100, berbe: ["b1"] }] })]],
      ["S", [cin({ tankId: "S", kada: u(0), uslo: 4100, prije: 0, izvori: [{ izTankId: null, litre: 4100, berbe: ["b1"] }] })]],
    ]);
    const v = vinoUTanku(cini, SORTE, "T", u(20).getTime());
    const s = v.vrsta === "spoj" ? v.sastavnice[0] : null;

    tvrdi(
      !!s && s.litre === 4000 && s.otpusteno === 4100 && s.kalo === 100,
      "kucica nosi uslo, otpusteno i kalo",
      s ? `uslo ${s.litre}, otpusteno ${s.otpusteno}, kalo ${s.kalo}` : "nema kucice"
    );
    tvrdi(v.vrsta === "spoj" && v.litre === 4000, "litre spoja su ono sto je USLO, ne otpusteno");
  }

  type Odljev = (r: RedakOdljeva[], odKada: number, kucice: number, danas: number) => StavkaOdljeva[];

  function baterijaOdljeva(f: Odljev): Tvrdnja[] {
    const t: Tvrdnja[] = [];
    const redci: RedakOdljeva[] = [
      { kada: u(1).getTime(), litre: 500, vrsta: "izdano" }, // prethodno vino
      { kada: u(12).getTime(), litre: 300, vrsta: "izdano" },
      { kada: u(13).getTime(), litre: 100, vrsta: "ispravak" },
    ];

    const o = f(redci, u(10).getTime(), 1000, 600);
    t.push({
      opis: "odljev imenuje razliku i preskace ono prije rodjenja",
      ok: o.length === 2 && !o.some((s) => s.vrsta === "neobjasnjeno"),
    });

    const o2 = f(redci, u(10).getTime(), 1000, 500);
    t.push({
      opis: "neobjasnjena razlika se vidi",
      ok: o2.some((s) => s.vrsta === "neobjasnjeno" && Math.abs(s.litre - 100) < 1),
    });

    return t;
  }

  for (const x of baterijaOdljeva(imenujOdljev)) tvrdi(x.ok, x.opis);

  {
    const mutanti: Array<{ opis: string; f: Odljev }> = [
      {
        opis: "odljev — ne gleda trenutak rodjenja",
        f: (r, _odKada, kucice, danas) => imenujOdljev(r, 0, kucice, danas),
      },
      {
        opis: "odljev — sutke proguta neobjasnjeno",
        f: (r, odKada, kucice, danas) =>
          imenujOdljev(r, odKada, kucice, danas).filter((s) => s.vrsta !== "neobjasnjeno"),
      },
    ];
    for (const m of mutanti) {
      const pao = baterijaOdljeva(m.f).some((x) => !x.ok);
      tvrdi(pao, `uhvacena: ${m.opis}`);
    }
  }

  // ------------------------------------------------ nad pravom bazom
  console.log("\nNAD PRAVOM BAZOM (samo citanje)");

  const [tankovi, berbe] = await Promise.all([
    prisma.tank.findMany({ select: { id: true, broj: true, kolicinaVinaUTanku: true }, orderBy: { broj: "asc" } }),
    prisma.berba.findMany({ select: { id: true, nazivSorte: true } }),
  ]);
  const sorte = new Map(berbe.map((b) => [b.id, b.nazivSorte]));
  const puni = tankovi.filter((t) => Number(t.kolicinaVinaUTanku ?? 0) > 0);
  const { cini, odljevi } = await citajUlazneCine(prisma, tankovi.map((t) => t.id));

  // MJERILO ISTINE: litre ulaza moraju se slagati sa `stanjeTanka`.
  let neslaganja = 0;
  let prvi = "";
  for (const t of puni) {
    const ulazi = cini.get(t.id) ?? [];
    const zadnji = ulazi[ulazi.length - 1];
    if (!zadnji) continue;

    const knjiga = (await stanjeTanka(prisma, t.id)).reduce((z, s) => z + s.litre, 0);
    const izlazaNakon = knjiga - (zadnji.prije + zadnji.uslo);

    // Nakon zadnjeg ulaza moze biti izlaza, ali NIKAD vise vina nego sto je
    // uslo — to bi znacilo da `prije` laze.
    if (izlazaNakon > 1) {
      neslaganja++;
      if (!prvi) prvi = `T${t.broj}: prije ${zadnji.prije.toFixed(0)} + uslo ${zadnji.uslo.toFixed(0)} < danas ${knjiga.toFixed(0)}`;
    }
  }
  tvrdi(neslaganja === 0, "volumen prije ulaza slaze se sa `stanjeTanka`", prvi);

  let bezStabla = 0;
  const kucice: number[] = [];
  for (const t of puni) {
    const v = vinoUTanku(cini, sorte, t.id, Date.now());
    if (v.vrsta === "posuda") bezStabla++;
    kucice.push(v.vrsta === "spoj" ? v.sastavnice.length : 1);
  }
  tvrdi(bezStabla === 0, "svaki pun tank ima stablo");
  tvrdi(kucice.every((k) => k >= 1), "svaki tank ima barem jednu kucicu");

  // STABLO MORA ZAVRSITI U BERBI.
  //
  // Dodano nakon sto su T15 i T32 imali stablo bez ijednog lista: rekurzija je
  // izvor trazila milisekundu PRIJE cina, a posuda zna dati vino u istoj
  // sekundi u kojoj ga je primila, pa je lanac stao na praznom stubu.
  const bezListova: string[] = [];
  const prekinuti: string[] = [];
  const nulaLitara: string[] = [];

  const prodji = (v: VinoCvor, broj: number) => {
    if (v.vrsta === "posuda") {
      if (v.razlog === "prekinuto") prekinuti.push(`T${broj}`);
      if (v.litre <= 0) nulaLitara.push(`T${broj} (${v.razlog})`);
      return;
    }
    if (v.vrsta === "partija") {
      if (v.litre <= 0) nulaLitara.push(`T${broj} (partija ${v.nazivSorte})`);
      return;
    }
    for (const s of v.sastavnice) prodji(s.vino, broj);
  };

  let razlikaLitara = 0;
  let prviRazmak = "";

  for (const t of puni) {
    const v = vinoUTanku(cini, sorte, t.id, Date.now());
    if (new Set(listovi(v)).size === 0) bezListova.push(`T${t.broj}`);
    prodji(v, t.broj);

    // ZBROJ PRVE RAZINE KUCICA MINUS IMENOVANI ODLJEV = kolicina u tanku.
    //
    // Dublje ne vrijedi i namjerno se ne tvrdi: litre na listovima su POVIJESNE
    // (koliko je te berbe uslo tada), a posuda je cesto dala manje nego sto je
    // imala. Prva razina je jedina koja opisuje danasnji tank — ali tek kad
    // odljev dobije ime: T43 je od 1.100 primljenih litara 670 prodao i
    // ispravio, pa bi gola usporedba tvrdila kvar ondje gdje ga nema.
    const knjiga = (await stanjeTanka(prisma, t.id)).reduce((z, s) => z + s.litre, 0);
    const prvaRazina = v.vrsta === "spoj" ? v.sastavnice.reduce((z, s) => z + s.litre, 0) : v.litre;
    const odKada = v.vrsta === "spoj" ? v.kada.getTime() : 0;
    const neimenovano = imenujOdljev(odljevi.get(t.id) ?? [], odKada, prvaRazina, knjiga).find(
      (s) => s.vrsta === "neobjasnjeno"
    );

    if (neimenovano) {
      razlikaLitara++;
      if (!prviRazmak) {
        prviRazmak = `T${t.broj}: kucice ${prvaRazina.toFixed(0)} L, knjiga ${knjiga.toFixed(0)} L, neobjasnjeno ${neimenovano.litre.toFixed(0)} L`;
      }
    }
  }

  tvrdi(bezListova.length === 0, "stablo svakog tanka zavrsava u berbi", bezListova.join(", "));
  tvrdi(prekinuti.length === 0, "nijedan lanac nije prekinut", prekinuti.join(", "));
  tvrdi(nulaLitara.length === 0, "nijedan cvor nema nula litara", nulaLitara.slice(0, 5).join(", "));
  tvrdi(razlikaLitara === 0, "razlika kucica i knjige je imenovana do zadnje litre", prviRazmak);

  console.log(`  kucica: max ${Math.max(...kucice)}, prosjek ${(kucice.reduce((a, b) => a + b, 0) / kucice.length).toFixed(1)}`);

  console.log("");
  console.log(`proslo: ${proslo}, palo: ${palo}`);
  if (palo > 0) process.exitCode = 1;
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
