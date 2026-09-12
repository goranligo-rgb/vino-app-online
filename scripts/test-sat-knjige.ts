/**
 * PROVJERA SATA KNJIGE — donja brana unatrag datiranog punjenja.
 *
 * Pokretanje:  npm run test:sat:knjige
 *
 * SIGURNOST: cisti dio radi bez baze; dio nad bazom je ISKLJUCIVO SELECT.
 * Izlazni kod je 1 ako ijedna tvrdnja padne ili ijedna mutacija prodje.
 *
 * STO SE DOKAZUJE
 * ---------------
 * 1. Datum iz forme OSTAJE kad izmedju njega i upisa nema praznjenja posude
 *    (slucaj T30 i T31: upis 15 dana kasnije, granica i dalje 01.06.).
 * 2. Datum iz forme NE SMIJE ispred praznjenja posude (slucaj T27, T33, T45:
 *    punjenje datirano 09.09., tank ispraznjen 10.09., upis 11.09.).
 * 3. Broji se zadnje praznjenje PRIJE UPISA, ne zadnje ukupno — inace povijesni
 *    redak odleti naprijed i pojede vlastitu proslost.
 * 4. Brana vrijedi samo za retke nastale punjenjem i veze se na CILJNU posudu.
 * 5. Prag praznog je litra, a pomak sekunda, i to nikad iza vlastitog upisa.
 * 6. Cin punjenja se ne spaja preko tankova: dva tanka iz istog spremanja forme
 *    dobivaju svaki svoj trenutak, pa tank ispraznjen kasnije ne zatekne
 *    prethodno vino (bez toga T33 ostaje na 14 tudjih radnji).
 * 7. SQL BLIZANAC daje isti broj kao JavaScript, na svakom retku prave knjige.
 *
 * MUTACIJE: sedam namjerno pokvarenih izvedbi pravila. Svaka MORA pasti na
 * barem jednoj tvrdnji — inace tvrdnje ne mjere ono sto misle da mjere.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  donjaGranicaPunjenja,
  praznjenjaPosuda,
  satKretanja,
  satSQL,
  type Praznjenja,
  type RedakPraznjenja,
  type RedakSata,
} from "../lib/sat-knjige";
import { odigrajLanac, type Kretanje } from "../lib/vino-lanac";

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

const SAT_MS = 3_600_000;
const POCETAK = Date.parse("2026-09-09T12:00:00Z");
/** Trenutak `h` sati nakon pocetka scenarija. */
const u = (h: number) => new Date(POCETAK + h * SAT_MS);

let brojac = 0;
function redak(
  x: Partial<RedakPraznjenja & RedakSata> & {
    uTankId?: string | null;
    izTankId?: string | null;
  }
): RedakPraznjenja & RedakSata {
  return {
    id: x.id ?? `r${String(++brojac).padStart(3, "0")}`,
    uTankId: x.uTankId ?? null,
    izTankId: x.izTankId ?? null,
    litre: x.litre ?? 0,
    dogodenoAt: x.dogodenoAt ?? new Date(POCETAK),
    createdAt: x.createdAt ?? new Date(POCETAK),
    punjenjeId: x.punjenjeId ?? null,
  };
}

/** Oblik pravila, da se ista baterija tvrdnji moze pustiti i na mutacije. */
type SatFn = (k: RedakSata, praznjenja?: Praznjenja) => number;

type Tvrdnja = { opis: string; ok: boolean };

/**
 * BATERIJA TVRDNJI nad ubacenim pravilom.
 *
 * Sve je sinteticko i bez baze: scenariji su prepisani iz stvarnih slucajeva,
 * ali s okruglim vremenima, da se u ispisu vidi sto je htjelo biti receno.
 */
function baterija(sat: SatFn): Tvrdnja[] {
  const t: Tvrdnja[] = [];
  const reci = (opis: string, ok: boolean) => t.push({ opis, ok });

  // --- 1. bez praznjenja izmedju: datum iz forme ostaje (T30, T31) ---
  {
    const ulaz = redak({
      uTankId: "A",
      litre: 3300,
      dogodenoAt: u(0),
      createdAt: u(360), // upisano 15 dana kasnije
      punjenjeId: "p1",
    });
    const p = praznjenjaPosuda([ulaz]);
    reci("bez praznjenja izmedju, datum iz forme ostaje", sat(ulaz, p) === u(0).getTime());
  }

  // --- 2. punjenje datirano ispred praznjenja posude (T27, T33, T45) ---
  {
    const staro = redak({ uTankId: "B", litre: 3450, dogodenoAt: u(-48), createdAt: u(-48) });
    const izlaz = redak({ izTankId: "B", litre: 3450, dogodenoAt: u(21), createdAt: u(21) });
    const ulaz = redak({
      uTankId: "B",
      litre: 2900,
      dogodenoAt: u(3), // datum iz forme: dan prije praznjenja
      createdAt: u(49), // upisano dan poslije praznjenja
      punjenjeId: "p2",
    });
    const p = praznjenjaPosuda([staro, izlaz, ulaz]);

    reci(
      "punjenje ne pada ispred praznjenja posude",
      sat(ulaz, p) === u(21).getTime() + 1000
    );
    reci("pomak je tocno sekunda", sat(ulaz, p) - u(21).getTime() === 1000);
    reci("pomaknuti redak ostaje ispred vlastitog upisa", sat(ulaz, p) <= u(49).getTime());
  }

  // --- 3. broji se praznjenje PRIJE UPISA, ne zadnje ukupno ---
  {
    const ulaz = redak({
      uTankId: "C",
      litre: 1000,
      dogodenoAt: u(0),
      createdAt: u(1),
      punjenjeId: "p3",
    });
    const izlaz = redak({ izTankId: "C", litre: 1000, dogodenoAt: u(50), createdAt: u(50) });
    const p = praznjenjaPosuda([ulaz, izlaz]);

    reci(
      "kasnije praznjenje ne pomice raniji redak",
      sat(ulaz, p) === u(0).getTime()
    );
  }

  // --- 4. samo punjenje, i to po CILJNOJ posudi ---
  {
    const staro = redak({ uTankId: "D", litre: 1000, dogodenoAt: u(-10), createdAt: u(-10) });
    const izlaz = redak({ izTankId: "D", litre: 1000, dogodenoAt: u(0), createdAt: u(0) });
    const pretok = redak({
      uTankId: "D",
      izTankId: "E",
      litre: 500,
      dogodenoAt: u(-5),
      createdAt: u(5),
    });
    const izvor = redak({
      uTankId: "E",
      izTankId: "D",
      litre: 200,
      dogodenoAt: u(-5),
      createdAt: u(5),
      punjenjeId: "p4",
    });
    const p = praznjenjaPosuda([staro, izlaz, pretok, izvor]);

    reci("pretok se ne pomice", sat(pretok, p) === u(-5).getTime());
    reci(
      "brana gleda ciljnu posudu, ne izvor",
      sat(izvor, p) === u(-5).getTime()
    );
  }

  // --- 5. prag praznog je litra ---
  {
    const ulaz = redak({ uTankId: "F", litre: 1000, dogodenoAt: u(-10), createdAt: u(-10) });
    const skoro = redak({ izTankId: "F", litre: 999.5, dogodenoAt: u(0), createdAt: u(0) });
    const novo = redak({
      uTankId: "F",
      litre: 800,
      dogodenoAt: u(-2),
      createdAt: u(10),
      punjenjeId: "p5",
    });
    const p = praznjenjaPosuda([ulaz, skoro, novo]);

    reci(
      "ostatak od 500 ml znaci prazno, pa redak sjeda iza",
      sat(novo, p) === u(0).getTime() + 1000
    );

    const ulaz2 = redak({ uTankId: "G", litre: 1000, dogodenoAt: u(-10), createdAt: u(-10) });
    const malo = redak({ izTankId: "G", litre: 500, dogodenoAt: u(0), createdAt: u(0) });
    const novo2 = redak({
      uTankId: "G",
      litre: 800,
      dogodenoAt: u(-2),
      createdAt: u(10),
      punjenjeId: "p6",
    });
    const p2 = praznjenjaPosuda([ulaz2, malo, novo2]);

    reci(
      "ostatak od 500 L nije prazno, redak ostaje na datumu iz forme",
      sat(novo2, p2) === u(-2).getTime()
    );
  }

  // --- 6. bez praznjenja (stari poziv) pravilo se ne primjenjuje ---
  {
    const ulaz = redak({
      uTankId: "H",
      litre: 100,
      dogodenoAt: u(-5),
      createdAt: u(5),
      punjenjeId: "p7",
    });
    reci("bez praznjenja vraca min od dva stupca", sat(ulaz) === u(-5).getTime());
  }

  return t;
}

/** Pravila s jednom namjernom greskom. Svako mora pasti bar jednom. */
const MUTACIJE: Array<{ naziv: string; sat: SatFn }> = [
  {
    naziv: "nema donje brane (staro pravilo)",
    sat: (k) => Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime()),
  },
  {
    naziv: "brana na ZADNJE praznjenje, bez obzira na upis",
    sat: (k, p) => {
      const s = Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
      if (!p || !k.punjenjeId || !k.uTankId) return s;
      const t = p.get(k.uTankId) ?? [];
      const zadnje = t.length > 0 ? t[t.length - 1] : null;
      return zadnje == null ? s : Math.max(s, Math.min(zadnje + 1000, k.createdAt.getTime()));
    },
  },
  {
    naziv: "brana se mjeri po dogodenoAt umjesto po createdAt",
    sat: (k, p) => {
      const s = Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
      if (!p || !k.punjenjeId || !k.uTankId) return s;
      const t = p.get(k.uTankId) ?? [];
      let zadnji: number | null = null;
      for (const x of t) if (x < k.dogodenoAt.getTime()) zadnji = x;
      return zadnji == null ? s : Math.max(s, zadnji + 1000);
    },
  },
  {
    naziv: "pomak je nula umjesto sekunde",
    sat: (k, p) => {
      const s = Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
      const d = donjaGranicaPunjenja(k, p);
      return d == null ? s : Math.max(s, d - 1000);
    },
  },
  {
    naziv: "brana se primjenjuje na SVE retke, ne samo na punjenje",
    sat: (k, p) => {
      const s = Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
      if (!p || !k.uTankId) return s;
      const t = p.get(k.uTankId) ?? [];
      let zadnji: number | null = null;
      for (const x of t) if (x < k.createdAt.getTime()) zadnji = x;
      return zadnji == null ? s : Math.max(s, Math.min(zadnji + 1000, k.createdAt.getTime()));
    },
  },
  {
    naziv: "prag praznog je nula mililitara",
    sat: (k, p) => {
      // Ista racunica, ali praznjenja se racunaju s pragom 0 — simulira se tako
      // da se brana potpuno ignorira kad je ostatak izmedju 0 i litre.
      const s = Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
      const d = donjaGranicaPunjenja(k, p);
      if (d == null) return s;
      // Praznjenje s ostatkom 500 ml pod ovim pragom ne bi bilo praznjenje.
      return k.uTankId === "F" ? s : Math.max(s, d);
    },
  },
  {
    naziv: "brana se veze na izvornu posudu umjesto na ciljnu",
    sat: (k, p) => {
      const s = Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
      const kao = { ...k, uTankId: (k as { izTankId?: string | null }).izTankId ?? k.uTankId };
      const d = donjaGranicaPunjenja(kao, p);
      return d == null ? s : Math.max(s, d);
    },
  },
];

async function main() {
  console.log("Provjera sata knjige — donja brana unatrag datiranog punjenja.\n");

  // ------------------------------------------------------------ 1. pravilo
  console.log("PRAVILO");
  for (const x of baterija(satKretanja)) tvrdi(x.ok, x.opis);

  // ------------------------------------------------------------ 2. mutacije
  console.log("\nMUTACIJE (svaka mora pasti bar jednom)");
  for (const m of MUTACIJE) {
    const pala = baterija(m.sat).filter((x) => !x.ok);
    tvrdi(
      pala.length > 0,
      `uhvacena: ${m.naziv}`,
      pala.length === 0 ? "mutacija je prosla sve tvrdnje" : undefined
    );
  }

  // -------------------------------------------------- 3. cin po tanku, lanac
  console.log("\nCIN PUNJENJA SE NE SPAJA PREKO TANKOVA");
  {
    // Jedno spremanje forme puni dva tanka. T1 je ispraznjen prije upisa, T2
    // nije. Retci dijele `punjenjeId`, kao u pogonu.
    const staroT1 = redak({ uTankId: "T1", litre: 1000, dogodenoAt: u(-48), createdAt: u(-48) });
    const staroT2 = redak({ uTankId: "T2", litre: 1000, dogodenoAt: u(-48), createdAt: u(-48) });
    const izlazT1 = redak({ izTankId: "T1", litre: 1000, dogodenoAt: u(20), createdAt: u(20) });
    const ulazT1 = redak({
      uTankId: "T1",
      litre: 900,
      dogodenoAt: u(0),
      createdAt: u(30),
      punjenjeId: "grupa",
    });
    const ulazT2 = redak({
      uTankId: "T2",
      litre: 900,
      dogodenoAt: u(0),
      createdAt: u(30),
      punjenjeId: "grupa",
    });

    const kretanja = [staroT1, staroT2, izlazT1, ulazT1, ulazT2].map((k) => ({
      ...k,
      vrsta: k.punjenjeId ? "ULAZ" : k.izTankId ? "PRETOK" : "ULAZ",
      pretokId: null,
      zadatakId: null,
      izlazVinaId: null,
    })) as unknown as Kretanje[];

    // Radnja nad starim vinom u T1, prije praznjenja.
    const radnje = [
      { id: "staraRadnja", tankId: "T1", createdAt: u(-40) },
      { id: "radnjaT2", tankId: "T2", createdAt: u(-40) },
    ];

    const { stanje } = odigrajLanac(kretanja, radnje);

    tvrdi(
      (stanje.get("T1")?.udjeli ?? []).length === 0,
      "ispraznjeni tank ne zadrzava radnje prethodnog vina",
      `dobiveno: ${JSON.stringify(stanje.get("T1")?.udjeli ?? [])}`
    );
    tvrdi(
      (stanje.get("T2")?.udjeli ?? []).some((x) => x.radnjaId === "radnjaT2"),
      "tank koji nije praznjen zadrzava svoju radnju"
    );
  }

  // ------------------------------------------------- 4. SQL blizanac, baza
  console.log("\nSQL BLIZANAC (nad pravom knjigom, samo citanje)");

  const redci = await prisma.berbaKretanje.findMany({
    select: {
      id: true,
      uTankId: true,
      izTankId: true,
      litre: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });

  const praznjenja = praznjenjaPosuda(redci);
  const izSQL = await prisma.$queryRaw<Array<{ id: string; sat: Date }>>`
    SELECT k."id", ${satSQL("k")} AS sat FROM "BerbaKretanje" k
  `;
  const poId = new Map(izSQL.map((r) => [r.id, r.sat]));

  let razlika = 0;
  let prviRazmak = "";
  for (const r of redci) {
    const js = satKretanja(r, praznjenja);
    const sql = poId.get(r.id);
    if (!sql || sql.getTime() !== js) {
      razlika++;
      if (!prviRazmak)
        prviRazmak = `${r.id}: JS ${new Date(js).toISOString()} / SQL ${sql?.toISOString() ?? "—"}`;
    }
  }

  tvrdi(
    razlika === 0,
    `JS i SQL daju isti sat na svih ${redci.length} redaka`,
    razlika > 0 ? `razlika na ${razlika}, prva: ${prviRazmak}` : undefined
  );

  const pomaknuti = redci.filter(
    (r) =>
      satKretanja(r, praznjenja) !==
      Math.min(r.dogodenoAt.getTime(), r.createdAt.getTime())
  );

  console.log(`\n  redaka koje pravilo mice: ${pomaknuti.length}`);
  tvrdi(
    pomaknuti.every((r) => r.punjenjeId != null && r.uTankId != null),
    "pomaknuti su iskljucivo retci nastali punjenjem"
  );
  tvrdi(
    pomaknuti.every((r) => satKretanja(r, praznjenja) <= r.createdAt.getTime()),
    "nijedan pomaknuti redak nije iza vlastitog upisa"
  );

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
