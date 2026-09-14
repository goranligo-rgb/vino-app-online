/**
 * POVIJEST JEDNOG VINA — sto je radeno dok je bilo u toj posudi.
 * ===========================================================================
 *
 * STO SE DOKAZUJE
 * ---------------
 * 1. Uzima se SAMO ono sto je izvedeno u toj posudi (`izvorniTankId`) i u tom
 *    prozoru. Tudja posuda i tudji prozor ispadaju.
 * 2. Granice prozora su UKLJUCIVE na oba kraja.
 * 3. Kvasac se IZDVAJA, ali se NE MICE iz popisa dodataka.
 * 4. SO2 korekcija s preparatom je dodavanje; pretok nije.
 * 5. Tri prazna kraja se razlikuju: prolazna posuda, bez tvrdnje, rupa.
 * 6. ARHIVSKI REDCI SE CITAJU. Arhiviranje SELI podatke — posuda koja je
 *    arhivirana ima prazne zive tablice.
 * 7. NAD PRAVOM BAZOM: nijedan cvor koji ima arhivska mjerenja ne smije biti
 *    oznacen kao rupa.
 *
 * ZASTO TVRDNJA "POSTOJE RUPE" VISE NE POSTOJI
 * --------------------------------------------
 * Prva izvedba ovog testa tvrdila je da rupe POSTOJE i prolazila je — jer je
 * modul citao samo zive tablice, pa je 36 prozora s podacima proglasio
 * praznima. Tvrdnja je time zabetonirala kvar kao ocekivano ponasanje. Sada
 * stoji obrnuta: cvor s arhivskim mjerenjima NIJE rupa, a mutacija koja
 * arhivski izvor ukloni mora pasti.
 *
 * MUTACIJE: `razvrstajStanje` i arhivski izvor se ubacuju.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  povijestVina,
  razvrstajStanje,
  jeDodavanjePreparata,
  PRAG_PROLAZNA_MS,
  PRAG_RUPE_MS,
  type RedakRadnje,
  type RedakArhivskeRadnje,
  type RedakMjerenjaPosude,
  type StanjePovijesti,
  type PovijestVina,
} from "../lib/povijest-vina";
import { citajUlazneCine, vinoUTanku, type VinoCvor } from "../lib/identitet-vina";

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

type Tvrdnja = { opis: string; ok: boolean };

const SAT = 3_600_000;
const POCETAK = Date.parse("2026-09-01T06:00:00Z");
const u = (h: number) => new Date(POCETAK + h * SAT);

/** Scenarij bez arhive — arhivski izvor se dodaje ondje gdje se mjeri. */
function pov(args: {
  tankId: string;
  od: Date;
  do: Date;
  radnje?: RedakRadnje[];
  mjerenja?: RedakMjerenjaPosude[];
  arhivskeRadnje?: RedakArhivskeRadnje[];
  arhivskaMjerenja?: RedakMjerenjaPosude[];
}): PovijestVina {
  return povijestVina({
    tankId: args.tankId,
    od: args.od,
    do: args.do,
    radnje: args.radnje ?? [],
    mjerenja: args.mjerenja ?? [],
    arhivskeRadnje: args.arhivskeRadnje ?? [],
    arhivskaMjerenja: args.arhivskaMjerenja ?? [],
  });
}

function radnja(x: Partial<RedakRadnje> & { dogodenoAt: Date }): RedakRadnje {
  return {
    izvorniTankId: x.izvorniTankId ?? "S",
    dogodenoAt: x.dogodenoAt,
    vrsta: x.vrsta ?? "DODAVANJE",
    opis: x.opis ?? null,
    preparatNaziv: x.preparatNaziv ?? null,
    jedinicaNaziv: x.jedinicaNaziv ?? null,
    kolicina: x.kolicina ?? null,
    jeKvasac: x.jeKvasac ?? false,
    izvornaRadnjaId: x.izvornaRadnjaId ?? null,
  };
}

function arhRadnja(
  x: Partial<RedakArhivskeRadnje> & { createdAt: Date }
): RedakArhivskeRadnje {
  return {
    tankId: x.tankId ?? "S",
    createdAt: x.createdAt,
    vrsta: x.vrsta ?? "DODAVANJE",
    opis: x.opis ?? null,
    preparatNaziv: x.preparatNaziv ?? null,
    jedinicaNaziv: x.jedinicaNaziv ?? null,
    kolicina: x.kolicina ?? null,
    izvornaRadnjaId: x.izvornaRadnjaId ?? null,
  };
}

function mjerenje(
  x: Partial<RedakMjerenjaPosude> & { izmjerenoAt: Date }
): RedakMjerenjaPosude {
  return {
    tankId: x.tankId ?? "S",
    izmjerenoAt: x.izmjerenoAt,
    alkohol: x.alkohol ?? null,
    secer: x.secer ?? null,
    ukupneKiseline: x.ukupneKiseline ?? null,
    ph: x.ph ?? null,
    slobodniSO2: x.slobodniSO2 ?? null,
    ukupniSO2: x.ukupniSO2 ?? null,
  };
}

// ------------------------------------------------------------- razvrstavanje
type Razvrstaj = (ima: boolean, trajanje: number) => StanjePovijesti;

function baterijaRazvrstaja(f: Razvrstaj): Tvrdnja[] {
  return [
    { opis: "sa zapisom je uvijek `ima`", ok: f(true, 0) === "ima" && f(true, 99 * PRAG_RUPE_MS) === "ima" },
    { opis: "kratak prozor bez zapisa je prolazna posuda", ok: f(false, SAT) === "prolazna" },
    { opis: "dug prozor bez zapisa je rupa", ok: f(false, 10 * PRAG_RUPE_MS) === "rupa" },
    { opis: "izmedju se ne tvrdi nista", ok: f(false, 2 * PRAG_PROLAZNA_MS) === "nema_zapisa" },
    { opis: "tocno na pragu prolazne jos nije prolazna", ok: f(false, PRAG_PROLAZNA_MS) === "nema_zapisa" },
    { opis: "tocno na pragu rupe jos nije rupa", ok: f(false, PRAG_RUPE_MS) === "nema_zapisa" },
  ];
}

const MUTACIJE_RAZVRSTAJ: Array<{ opis: string; f: Razvrstaj }> = [
  {
    opis: "razvrstaj — prolaznu i rupu zamijenio mjestima",
    f: (ima, t) => (ima ? "ima" : t < PRAG_PROLAZNA_MS ? "rupa" : "prolazna"),
  },
  {
    opis: "razvrstaj — sve prazno zove prolaznim (rupa se gubi)",
    f: (ima) => (ima ? "ima" : "prolazna"),
  },
  {
    opis: "razvrstaj — ne gleda ima li zapisa",
    f: (_ima, t) => (t < PRAG_PROLAZNA_MS ? "prolazna" : t > PRAG_RUPE_MS ? "rupa" : "nema_zapisa"),
  },
];

async function main() {
  console.log("\nRAZVRSTAVANJE PRAZNOG KRAJA");
  for (const x of baterijaRazvrstaja(razvrstajStanje)) tvrdi(x.ok, x.opis);

  console.log("\nMUTACIJE (svaka mora pasti bar jednom)");
  for (const m of MUTACIJE_RAZVRSTAJ) {
    tvrdi(baterijaRazvrstaja(m.f).some((x) => !x.ok), `uhvacena: ${m.opis}`);
  }

  console.log("\nIZBOR REDAKA");
  {
    const p = pov({
      tankId: "S",
      od: u(10),
      do: u(20),
      radnje: [
        radnja({ dogodenoAt: u(9), preparatNaziv: "PRERANO" }),
        radnja({ dogodenoAt: u(21), preparatNaziv: "PREKASNO" }),
        radnja({ dogodenoAt: u(15), preparatNaziv: "TUDJA POSUDA", izvorniTankId: "X" }),
        radnja({ dogodenoAt: u(15), preparatNaziv: "NASA" }),
      ],
    });
    tvrdi(
      p.dodaci.length === 1 && p.dodaci[0].naslov === "NASA",
      "uzima samo svoju posudu i svoj prozor",
      p.dodaci.map((d) => d.naslov).join(", ")
    );
  }

  {
    const p = pov({
      tankId: "S",
      od: u(10),
      do: u(20),
      radnje: [
        radnja({ dogodenoAt: u(10), preparatNaziv: "NA RUBU OD" }),
        radnja({ dogodenoAt: u(20), preparatNaziv: "NA RUBU DO" }),
      ],
    });
    tvrdi(p.dodaci.length === 2, "granice prozora su ukljucive na oba kraja");
  }

  {
    const p = pov({
      tankId: "S",
      od: u(0),
      do: u(30),
      radnje: [
        radnja({ dogodenoAt: u(1), preparatNaziv: "LALVIN SENSY", jeKvasac: true, kolicina: 350, jedinicaNaziv: "g" }),
        radnja({ dogodenoAt: u(2), preparatNaziv: "Šumpovin", vrsta: "KOREKCIJA" }),
        radnja({ dogodenoAt: u(3), vrsta: "PRETOK", opis: "pretok u T8" }),
      ],
    });

    tvrdi(p.kvasci.length === 1 && p.kvasci[0].detalj === "350 g", "kvasac se izdvaja s kolicinom");
    tvrdi(p.dodaci.length === 2, "kvasac OSTAJE i u popisu dodataka, uz SO2 korekciju");
    tvrdi(p.radnje.length === 1 && p.radnje[0].naslov === "pretok u T8", "pretok nije dodavanje");
    tvrdi(p.stanje === "ima", "popis sa zapisima je `ima`");
  }

  {
    const p = pov({
      tankId: "S",
      od: u(0),
      do: u(30),
      mjerenja: [mjerenje({ izmjerenoAt: u(5), secer: 72, ph: 3.2 })],
    });
    tvrdi(p.mjerenja.length === 1 && (p.mjerenja[0].detalj ?? "").includes("pH"), "mjerenje se ispisuje s parametrima");
    tvrdi(p.stanje === "ima", "samo mjerenje je takodjer zapis — nije rupa");
  }

  console.log("\nARHIVSKI IZVOR");
  {
    // Posuda je arhivirana: zive tablice su PRAZNE, sve je u arhivi.
    const p = pov({
      tankId: "S",
      od: u(0),
      do: u(24 * 10),
      arhivskaMjerenja: [mjerenje({ izmjerenoAt: u(50), secer: 82, ph: 3.1 })],
    });
    tvrdi(p.mjerenja.length === 1, "arhivsko mjerenje se cita");
    tvrdi(p.stanje === "ima", "arhivirana posuda s mjerenjem NIJE rupa");
  }

  {
    const p = pov({
      tankId: "S",
      od: u(0),
      do: u(24 * 10),
      arhivskeRadnje: [arhRadnja({ createdAt: u(50), preparatNaziv: "Bentonit" })],
    });
    tvrdi(p.dodaci.length === 1 && p.dodaci[0].naslov === "Bentonit", "arhivska radnja se cita kao dodatak");
    tvrdi(p.kvasci.length === 0, "arhivska radnja NIKAD ne ulazi u kvasce — arhiva nema jeKvasac");
  }

  {
    // Ista radnja ziva i u arhivi: smije se pojaviti samo jednom.
    const p = pov({
      tankId: "S",
      od: u(0),
      do: u(30),
      radnje: [radnja({ dogodenoAt: u(5), preparatNaziv: "Bentonit", izvornaRadnjaId: "r1" })],
      arhivskeRadnje: [arhRadnja({ createdAt: u(5), preparatNaziv: "Bentonit", izvornaRadnjaId: "r1" })],
    });
    tvrdi(p.dodaci.length === 1, "duplikat iz arhive se odbacuje po izvornaRadnjaId", `${p.dodaci.length}`);
  }

  {
    const p = pov({ tankId: "S", od: u(0), do: u(24 * 10) });
    tvrdi(p.stanje === "rupa", "bez ijednog izvora dug prozor JEST rupa");
  }

  console.log("\nPRAVILO O DODAVANJU");
  tvrdi(jeDodavanjePreparata({ vrsta: "DODAVANJE", preparatNaziv: null }), "DODAVANJE bez preparata je dodavanje");
  tvrdi(jeDodavanjePreparata({ vrsta: "KOREKCIJA", preparatNaziv: "Šumpovin" }), "KOREKCIJA s preparatom je dodavanje");
  tvrdi(!jeDodavanjePreparata({ vrsta: "PRETOK", preparatNaziv: null }), "PRETOK nije dodavanje");

  // ------------------------------------------------ nad pravom bazom
  console.log("\nNAD PRAVOM BAZOM (samo citanje)");

  const [tankovi, berbe] = await Promise.all([
    prisma.tank.findMany({ select: { id: true, broj: true, kolicinaVinaUTanku: true }, orderBy: { broj: "asc" } }),
    prisma.berba.findMany({ select: { id: true, nazivSorte: true } }),
  ]);
  const sorte = new Map(berbe.map((b) => [b.id, b.nazivSorte]));
  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));
  const puni = tankovi.filter((t) => Number(t.kolicinaVinaUTanku ?? 0) > 0);

  const knjiga = await citajUlazneCine(prisma, tankovi.map((t) => t.id));

  const sveRadnje = (await prisma.vinoRadnja.findMany({
    where: { tankId: { in: puni.map((t) => t.id) } },
    select: {
      tankId: true, izvorniTankId: true, dogodenoAt: true, vrsta: true, opis: true,
      preparatNaziv: true, jedinicaNaziv: true, kolicina: true, jeKvasac: true,
      izvornaRadnjaId: true,
    },
  })) as Array<RedakRadnje & { tankId: string }>;

  const sveMjerenje = (await prisma.mjerenje.findMany({
    select: {
      tankId: true, izmjerenoAt: true, alkohol: true, secer: true,
      ukupneKiseline: true, ph: true, slobodniSO2: true, ukupniSO2: true,
    },
  })) as RedakMjerenjaPosude[];

  const sirovaArhMj = await prisma.arhivaVinaMjerenje.findMany({
    select: {
      tankId: true, izmjerenoAt: true, alkohol: true, secer: true,
      ukupneKiseline: true, ph: true, slobodniSO2: true, ukupniSO2: true,
    },
  });
  const arhMjerenja: RedakMjerenjaPosude[] = sirovaArhMj
    .filter((m) => m.tankId != null)
    .map((m) => ({ ...m, tankId: m.tankId as string }));

  const arhRadnje: RedakArhivskeRadnje[] = await prisma.arhivaVinaRadnja.findMany({
    select: {
      tankId: true, createdAt: true, vrsta: true, opis: true,
      preparatNaziv: true, jedinicaNaziv: true, kolicina: true, izvornaRadnjaId: true,
    },
  });

  console.log(`  (arhiva: ${arhMjerenja.length} mjerenja, ${arhRadnje.length} radnji)`);

  /** Prodji sva stabla; `bezArhive` je mutacija koja arhivski izvor uklanja. */
  function prodjiSve(bezArhive: boolean) {
    const stanja = new Map<StanjePovijesti, number>();
    const rupeSArhivom: string[] = [];
    let cvorova = 0;

    const prodji = (v: VinoCvor, korijen: string, doMs: number) => {
      if (v.vrsta === "partija") return;
      cvorova++;

      const vlastito = vinoUTanku(knjiga.cini, sorte, v.tankId, doMs);
      const odMs = vlastito.vrsta === "spoj" ? vlastito.kada.getTime() : doMs;

      const p = povijestVina({
        tankId: v.tankId,
        od: new Date(odMs),
        do: new Date(doMs),
        radnje: sveRadnje.filter((r) => r.tankId === korijen),
        mjerenja: sveMjerenje,
        arhivskeRadnje: bezArhive ? [] : arhRadnje,
        arhivskaMjerenja: bezArhive ? [] : arhMjerenja,
      });
      stanja.set(p.stanje, (stanja.get(p.stanje) ?? 0) + 1);

      // IMA LI TAJ CVOR ARHIVSKIH MJERENJA U SVOM PROZORU?
      if (p.stanje === "rupa") {
        const ima = arhMjerenja.some(
          (m) =>
            m.tankId === v.tankId &&
            m.izmjerenoAt.getTime() >= odMs &&
            m.izmjerenoAt.getTime() <= doMs
        );
        if (ima) rupeSArhivom.push(`T${brojTanka.get(v.tankId) ?? "?"}`);
      }

      if (v.vrsta === "spoj") {
        for (const s of v.sastavnice) prodji(s.vino, korijen, v.kada.getTime());
      }
    };

    for (const t of puni) {
      const v = vinoUTanku(knjiga.cini, sorte, t.id, Date.now());
      if (v.vrsta === "spoj") for (const s of v.sastavnice) prodji(s.vino, t.id, v.kada.getTime());
    }

    return { stanja, rupeSArhivom, cvorova };
  }

  const sada = prodjiSve(false);
  console.log(
    `  (${sada.cvorova} cvorova: ${[...sada.stanja.entries()].map(([k, n]) => `${k} ${n}`).join(", ")})`
  );

  tvrdi(sada.cvorova > 300, "podrum daje dovoljno cvorova za usporedbu", `${sada.cvorova}`);
  tvrdi((sada.stanja.get("prolazna") ?? 0) > 0, "postoje prolazne posude");

  // OBRNUTA TVRDNJA. Prije je ovdje stajalo "postoje rupe — i vide se", sto je
  // betoniralo kvar: modul ih je stvarao jer nije citao arhivu.
  tvrdi(
    sada.rupeSArhivom.length === 0,
    "nijedan cvor s arhivskim mjerenjima nije oznacen kao rupa",
    sada.rupeSArhivom.slice(0, 8).join(", ")
  );

  // MUTACIJA: makni arhivski izvor — rupe se moraju vratiti.
  const bez = prodjiSve(true);
  tvrdi(
    bez.rupeSArhivom.length > 0,
    "uhvacena: povijest bez arhivskog izvora (rupe se vracaju)",
    `bez arhive rupa s arhivskim mjerenjima: ${bez.rupeSArhivom.length}`
  );

  console.log(
    `  (bez arhive: ${[...bez.stanja.entries()].map(([k, n]) => `${k} ${n}`).join(", ")})`
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
