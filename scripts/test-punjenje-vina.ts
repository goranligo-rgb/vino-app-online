/**
 * PROVJERA: koja punjenja pripadaju vinu koje je danas u tanku.
 *
 * Pokretanje:  npm run test:punjenje:vina
 *
 * SIGURNOST: cisti dio radi bez baze; dio nad bazom je ISKLJUCIVO SELECT.
 * Izlazni kod je 1 ako ijedna tvrdnja padne ili ijedna mutacija prodje.
 *
 * STO SE DOKAZUJE
 * ---------------
 * 1. Sudi KNJIGA, ne `datumPunjenja`: punjenje datirano ispred granice, a cijim
 *    je ULAZ retkom vino stiglo nakon nje, pripada danasnjem vinu (T27, T33,
 *    T45 — datum 09.09., redak 10.09., granica 10.09.).
 * 2. Punjenje prethodnog vina NE prolazi, ma koliko datum bio kasan.
 * 3. Veza ide preko `PunjenjeStavka.berbaId`, NE preko `BerbaKretanje.punjenjeId`
 *    — taj stupac pokazuje na obrisana punjenja (66 redaka na 36 id-eva, a u
 *    tablici ih je 20).
 * 4. ZASTITNA MREZA: punjenje bez traga u knjizi (stavke bez `berbaId`) sudi se
 *    po datumu, kao prije — nikad tiho ne ispada.
 * 5. Bez granice prolazi sve.
 * 6. Nad pravom bazom: nijedan tank ne GUBI punjenje ni pocetno mjerenje, a
 *    cetiri ih dobivaju.
 *
 * MUTACIJE: pet pokvarenih izvedbi; svaka mora pasti bar jednom.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  punjenjaTrenutnogVina,
  type PunjenjeZaProvjeru,
  type RedakKnjigePunjenja,
} from "../lib/punjenje-vina";
import { granicaSvihTankova } from "../lib/granica-vina";
import { praznjenjaPosuda, satKretanja } from "../lib/sat-knjige";

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
const POCETAK = Date.parse("2026-09-09T12:00:00Z");
const u = (h: number) => new Date(POCETAK + h * SAT);

let n = 0;
const redak = (x: Partial<RedakKnjigePunjenja>): RedakKnjigePunjenja => ({
  id: `k${++n}`,
  uTankId: x.uTankId ?? null,
  izTankId: x.izTankId ?? null,
  berbaId: x.berbaId ?? "b1",
  litre: x.litre ?? 0,
  vrsta: x.vrsta ?? "ULAZ",
  dogodenoAt: x.dogodenoAt ?? new Date(POCETAK),
  createdAt: x.createdAt ?? new Date(POCETAK),
  punjenjeId: x.punjenjeId ?? null,
});

type Izvedba = (
  tankId: string,
  punjenja: PunjenjeZaProvjeru[],
  kretanja: RedakKnjigePunjenja[],
  odAt: Date | null
) => { ids: string[]; pocetnaMjerenja: Set<string> };

type Tvrdnja = { opis: string; ok: boolean };

/** Baterija tvrdnji nad ubacenom izvedbom. */
function baterija(f: Izvedba): Tvrdnja[] {
  const t: Tvrdnja[] = [];
  const reci = (opis: string, ok: boolean) => t.push({ opis, ok });

  // --- 1. datum ispred granice, ULAZ redak iza nje (T27/T33/T45) ---
  {
    const staro = redak({ uTankId: "A", berbaId: "staro", litre: 3450, dogodenoAt: u(-48), createdAt: u(-48) });
    const izlaz = redak({ izTankId: "A", berbaId: "staro", litre: 3450, vrsta: "PRETOK", dogodenoAt: u(21), createdAt: u(21) });
    // ULAZ novog vina: datum iz forme 09.09., ali sat pomaknut na praznjenje
    const ulaz = redak({ uTankId: "A", berbaId: "novo", litre: 2900, dogodenoAt: u(3), createdAt: u(49), punjenjeId: "dangling" });
    const p: PunjenjeZaProvjeru = {
      id: "p-novo",
      datumPunjenja: u(3),
      pocetnoMjerenjeId: "m-novo",
      stavke: [{ berbaId: "novo" }],
    };
    const granica = new Date(u(21).getTime() + 1000);
    const r = f("A", [p], [staro, izlaz, ulaz], granica);
    reci("punjenje datirano ispred granice prolazi ako je ULAZ redak iza nje", r.ids.includes("p-novo"));
    reci("s njim prolazi i pocetno mjerenje", r.pocetnaMjerenja.has("m-novo"));
  }

  // --- 2. punjenje prethodnog vina ne prolazi ---
  {
    const ulazStaro = redak({ uTankId: "B", berbaId: "staro", litre: 1000, dogodenoAt: u(-48), createdAt: u(-48) });
    const izlaz = redak({ izTankId: "B", berbaId: "staro", litre: 1000, vrsta: "PRETOK", dogodenoAt: u(0), createdAt: u(0) });
    const ulazNovo = redak({ uTankId: "B", berbaId: "novo", litre: 900, dogodenoAt: u(2), createdAt: u(2) });
    const staroP: PunjenjeZaProvjeru = {
      id: "p-staro",
      // datum kasniji od granice, ali vino je otislo — knjiga to zna
      datumPunjenja: u(10),
      pocetnoMjerenjeId: "m-staro",
      stavke: [{ berbaId: "staro" }],
    };
    const r = f("B", [staroP], [ulazStaro, izlaz, ulazNovo], u(1));
    reci("punjenje prethodnog vina ne prolazi ni s kasnim datumom", !r.ids.includes("p-staro"));
  }

  // --- 3. veza ide preko berbaId, ne preko punjenjeId ---
  {
    // Redak nosi punjenjeId koji NE postoji (obrisano punjenje), ali nosi berbaId.
    const ulaz = redak({ uTankId: "C", berbaId: "b-veza", litre: 500, dogodenoAt: u(5), createdAt: u(5), punjenjeId: "obrisano-punjenje" });
    const p: PunjenjeZaProvjeru = {
      id: "p-veza",
      datumPunjenja: u(-20),
      pocetnoMjerenjeId: "m-veza",
      stavke: [{ berbaId: "b-veza" }],
    };
    const r = f("C", [p], [ulaz], u(1));
    reci("redak se nalazi preko berbaId iako punjenjeId visi u prazno", r.ids.includes("p-veza"));
  }

  // --- 4. zastitna mreza: stavke bez berbaId sude se po datumu ---
  {
    const ulaz = redak({ uTankId: "D", berbaId: "nesto", litre: 500, dogodenoAt: u(5), createdAt: u(5) });
    const prolazi: PunjenjeZaProvjeru = { id: "p-mreza-da", datumPunjenja: u(6), pocetnoMjerenjeId: "m-da", stavke: [{ berbaId: null }] };
    const pada: PunjenjeZaProvjeru = { id: "p-mreza-ne", datumPunjenja: u(-6), pocetnoMjerenjeId: "m-ne", stavke: [{ berbaId: null }] };
    const r = f("D", [prolazi, pada], [ulaz], u(1));
    reci("bez berbaId: datum nakon granice prolazi", r.ids.includes("p-mreza-da"));
    reci("bez berbaId: datum ispred granice ne prolazi", !r.ids.includes("p-mreza-ne"));
  }

  // --- 4b. ISTA BERBA U DVA TANKA: gleda se samo redak SVOG tanka ---
  //
  // Jedno spremanje forme puni vise tankova istom berbom. Tank koji je tada bio
  // pun dobiva redak pomaknut donjom branom, a susjedni ne — pa izvedba koja ne
  // gleda `uTankId` sudi po tudjem satu.
  {
    const ulazSusjed = redak({ uTankId: "S", berbaId: "zajednicka", litre: 2200, dogodenoAt: u(3), createdAt: u(49) });
    const staro = redak({ uTankId: "D2", berbaId: "staro", litre: 3000, dogodenoAt: u(-48), createdAt: u(-48) });
    const izlaz = redak({ izTankId: "D2", berbaId: "staro", litre: 3000, vrsta: "PRETOK", dogodenoAt: u(30), createdAt: u(30) });
    // U NASEM tanku ista berba stize tek nakon praznjenja, dakle iza granice.
    const ulazNas = redak({ uTankId: "D2", berbaId: "zajednicka", litre: 2900, dogodenoAt: u(31), createdAt: u(49) });

    // Granica je tik iza praznjenja; susjedov redak (u(3)) je daleko ispred nje.
    const granica = new Date(u(30).getTime() + 1000);
    const p: PunjenjeZaProvjeru = {
      id: "p-zajednicka",
      datumPunjenja: u(3),
      pocetnoMjerenjeId: "m-zajednicka",
      stavke: [{ berbaId: "zajednicka" }],
    };

    const r = f("D2", [p], [ulazSusjed, staro, izlaz, ulazNas], granica);
    reci("ista berba u dva tanka: sudi redak SVOG tanka, ne susjedov", r.ids.includes("p-zajednicka"));

    // Obrnuto: u susjednom tanku isto punjenje pripada PRETHODNOM vinu.
    const staroS = redak({ uTankId: "S2", berbaId: "staro", litre: 1000, dogodenoAt: u(-48), createdAt: u(-48) });
    const izlazS = redak({ izTankId: "S2", berbaId: "staro", litre: 1000, vrsta: "PRETOK", dogodenoAt: u(40), createdAt: u(40) });
    const ulazS = redak({ uTankId: "S2", berbaId: "zajednicka", litre: 500, dogodenoAt: u(3), createdAt: u(3) });
    const pS: PunjenjeZaProvjeru = { id: "p-susjed", datumPunjenja: u(3), pocetnoMjerenjeId: "m-susjed", stavke: [{ berbaId: "zajednicka" }] };
    const rS = f("S2", [pS], [staroS, izlazS, ulazS, ulazNas], new Date(u(40).getTime() + 1000));
    reci("ista berba u dva tanka: tudji kasniji redak ne spasava punjenje", !rS.ids.includes("p-susjed"));
  }

  // --- 4c. VISE ULAZ REDAKA istog punjenja: vrijedi NAJRANIJI ---
  //
  // Punjenje s dvije stavke daje dva retka. Vino je uslo kad je uslo PRVO od
  // njih; izvedba koja uzme najkasniji pusti punjenje koje je zapravo
  // zapocelo prije granice.
  {
    const rano = redak({ uTankId: "F2", berbaId: "b-rano", litre: 500, dogodenoAt: u(0), createdAt: u(0) });
    const kasno = redak({ uTankId: "F2", berbaId: "b-kasno", litre: 500, dogodenoAt: u(20), createdAt: u(20) });
    const p: PunjenjeZaProvjeru = {
      id: "p-dva-retka",
      datumPunjenja: u(0),
      pocetnoMjerenjeId: "m-dva",
      stavke: [{ berbaId: "b-rano" }, { berbaId: "b-kasno" }],
    };
    // Granica izmedju dvaju redaka: po najranijem punjenje NE pripada, po
    // najkasnijem bi pripadalo.
    const r = f("F2", [p], [rano, kasno], u(10));
    reci("vise redaka: vrijedi NAJRANIJI, ne najkasniji", !r.ids.includes("p-dva-retka"));
  }

  // --- 5. bez granice prolazi sve ---
  {
    const p: PunjenjeZaProvjeru = { id: "p-svi", datumPunjenja: u(-500), pocetnoMjerenjeId: "m-svi", stavke: [{ berbaId: "x" }] };
    const r = f("E", [p], [], null);
    reci("bez granice prolazi sve", r.ids.includes("p-svi") && r.pocetnaMjerenja.has("m-svi"));
  }

  return t;
}

/** Izvedbe s jednom namjernom greskom. */
const MUTACIJE: Array<{ naziv: string; f: Izvedba }> = [
  {
    naziv: "sudi po datumPunjenja (staro pravilo)",
    f: (tankId, punjenja, kretanja, odAt) => {
      const ids: string[] = [];
      const m = new Set<string>();
      for (const p of punjenja)
        if (!odAt || p.datumPunjenja.getTime() >= odAt.getTime()) {
          ids.push(p.id);
          if (p.pocetnoMjerenjeId) m.add(p.pocetnoMjerenjeId);
        }
      return { ids, pocetnaMjerenja: m };
    },
  },
  {
    naziv: "trazi redak preko punjenjeId umjesto berbaId",
    f: (tankId, punjenja, kretanja, odAt) => {
      const ids: string[] = [];
      const m = new Set<string>();
      const praznjenja = praznjenjaPosuda(kretanja);
      for (const p of punjenja) {
        const r = kretanja.filter((k) => k.uTankId === tankId && k.punjenjeId === p.id);
        const ok = !odAt
          ? true
          : r.length > 0
            ? Math.min(...r.map((k) => satKretanja(k, praznjenja))) >= odAt.getTime()
            : p.datumPunjenja.getTime() >= odAt.getTime();
        if (ok) {
          ids.push(p.id);
          if (p.pocetnoMjerenjeId) m.add(p.pocetnoMjerenjeId);
        }
      }
      return { ids, pocetnaMjerenja: m };
    },
  },
  {
    naziv: "bez zastitne mreze (bez berbaId sve pada)",
    f: (tankId, punjenja, kretanja, odAt) => {
      const ids: string[] = [];
      const m = new Set<string>();
      const praznjenja = praznjenjaPosuda(kretanja);
      for (const p of punjenja) {
        if (!odAt) { ids.push(p.id); if (p.pocetnoMjerenjeId) m.add(p.pocetnoMjerenjeId); continue; }
        const berbe = new Set(p.stavke.map((s) => s.berbaId).filter((x): x is string => !!x));
        const r = kretanja.filter((k) => k.uTankId === tankId && k.vrsta === "ULAZ" && berbe.has(k.berbaId));
        if (r.length > 0 && Math.min(...r.map((k) => satKretanja(k, praznjenja))) >= odAt.getTime()) {
          ids.push(p.id);
          if (p.pocetnoMjerenjeId) m.add(p.pocetnoMjerenjeId);
        }
      }
      return { ids, pocetnaMjerenja: m };
    },
  },
  {
    naziv: "gleda i retke drugih tankova",
    f: (tankId, punjenja, kretanja, odAt) => {
      const ids: string[] = [];
      const m = new Set<string>();
      const praznjenja = praznjenjaPosuda(kretanja);
      for (const p of punjenja) {
        const berbe = new Set(p.stavke.map((s) => s.berbaId).filter((x): x is string => !!x));
        const r = kretanja.filter((k) => k.vrsta === "ULAZ" && berbe.has(k.berbaId));
        const ok = !odAt
          ? true
          : r.length > 0
            ? Math.min(...r.map((k) => satKretanja(k, praznjenja))) >= odAt.getTime()
            : p.datumPunjenja.getTime() >= odAt.getTime();
        if (ok) { ids.push(p.id); if (p.pocetnoMjerenjeId) m.add(p.pocetnoMjerenjeId); }
      }
      return { ids, pocetnaMjerenja: m };
    },
  },
  {
    naziv: "uzima NAJKASNIJI redak umjesto najranijeg",
    f: (tankId, punjenja, kretanja, odAt) => {
      const ids: string[] = [];
      const m = new Set<string>();
      const praznjenja = praznjenjaPosuda(kretanja);
      for (const p of punjenja) {
        const berbe = new Set(p.stavke.map((s) => s.berbaId).filter((x): x is string => !!x));
        const r = kretanja.filter((k) => k.uTankId === tankId && k.vrsta === "ULAZ" && berbe.has(k.berbaId));
        const ok = !odAt
          ? true
          : r.length > 0
            ? Math.max(...r.map((k) => satKretanja(k, praznjenja))) >= odAt.getTime()
            : p.datumPunjenja.getTime() >= odAt.getTime();
        if (ok) { ids.push(p.id); if (p.pocetnoMjerenjeId) m.add(p.pocetnoMjerenjeId); }
      }
      return { ids, pocetnaMjerenja: m };
    },
  },
];

async function main() {
  console.log("Provjera: koja punjenja pripadaju danasnjem vinu.\n");

  console.log("PRAVILO");
  for (const x of baterija((t, p, k, o) => punjenjaTrenutnogVina(t, p, k, o)))
    tvrdi(x.ok, x.opis);

  console.log("\nMUTACIJE (svaka mora pasti bar jednom)");
  for (const m of MUTACIJE) {
    const pala = baterija(m.f).filter((x) => !x.ok);
    tvrdi(pala.length > 0, `uhvacena: ${m.naziv}`, pala.length === 0 ? "mutacija je prosla sve tvrdnje" : undefined);
  }

  // ---------------------------------------------------------- baza, samo citanje
  console.log("\nNAD PRAVOM BAZOM (samo citanje)");

  const [tankovi, kretanja, punjenja] = await Promise.all([
    prisma.tank.findMany({ select: { id: true, broj: true, kolicinaVinaUTanku: true }, orderBy: { broj: "asc" } }),
    prisma.berbaKretanje.findMany({
      select: { id: true, uTankId: true, izTankId: true, berbaId: true, litre: true, vrsta: true, dogodenoAt: true, createdAt: true, punjenjeId: true },
    }),
    prisma.punjenjeTanka.findMany({
      select: { id: true, tankId: true, datumPunjenja: true, pocetnoMjerenjeId: true, stavke: { select: { berbaId: true } } },
    }),
  ]);

  const granice = await granicaSvihTankova(prisma);
  const puni = tankovi.filter((t) => (t.kolicinaVinaUTanku ?? 0) > 0);

  let dobili = 0;
  let izgubili = 0;
  const promjene: string[] = [];

  for (const t of puni) {
    const odAt = granice.get(t.id)?.odAt ?? null;
    const moja = punjenja.filter((p) => p.tankId === t.id);
    const poDatumu = moja.filter((p) => !odAt || p.datumPunjenja.getTime() >= odAt.getTime());
    const poKnjizi = punjenjaTrenutnogVina(t.id, moja, kretanja, odAt);

    if (poKnjizi.ids.length > poDatumu.length) {
      dobili++;
      promjene.push(`T${t.broj}: ${poDatumu.length} -> ${poKnjizi.ids.length}`);
    }
    if (poKnjizi.ids.length < poDatumu.length) {
      izgubili++;
      promjene.push(`T${t.broj}: GUBI ${poDatumu.length} -> ${poKnjizi.ids.length}`);
    }
  }

  console.log(`  promjene: ${promjene.join(", ") || "nema"}`);
  tvrdi(izgubili === 0, "nijedan tank ne gubi punjenje novim pravilom");
  tvrdi(dobili > 0, `tankovi dobivaju punjenja koja su im danas skrivena (${dobili})`);

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
