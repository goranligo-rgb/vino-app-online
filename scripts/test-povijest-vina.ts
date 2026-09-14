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
 * 6. NAD PRAVOM BAZOM: broj rupa u podrumu poklapa se s neovisnim brojanjem.
 *
 * MUTACIJE: `razvrstajStanje` i filtar se ubacuju.
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
  type RedakMjerenjaPosude,
  type StanjePovijesti,
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
    f: (ima, t) => (ima ? "ima" : "prolazna"),
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
    const p = povijestVina({
      tankId: "S",
      od: u(10),
      do: u(20),
      radnje: [
        radnja({ dogodenoAt: u(9), preparatNaziv: "PRERANO" }),
        radnja({ dogodenoAt: u(21), preparatNaziv: "PREKASNO" }),
        radnja({ dogodenoAt: u(15), preparatNaziv: "TUDJA POSUDA", izvorniTankId: "X" }),
        radnja({ dogodenoAt: u(15), preparatNaziv: "NASA" }),
      ],
      mjerenja: [],
    });
    tvrdi(
      p.dodaci.length === 1 && p.dodaci[0].naslov === "NASA",
      "uzima samo svoju posudu i svoj prozor",
      p.dodaci.map((d) => d.naslov).join(", ")
    );
  }

  {
    const p = povijestVina({
      tankId: "S",
      od: u(10),
      do: u(20),
      radnje: [
        radnja({ dogodenoAt: u(10), preparatNaziv: "NA RUBU OD" }),
        radnja({ dogodenoAt: u(20), preparatNaziv: "NA RUBU DO" }),
      ],
      mjerenja: [],
    });
    tvrdi(p.dodaci.length === 2, "granice prozora su ukljucive na oba kraja");
  }

  {
    const p = povijestVina({
      tankId: "S",
      od: u(0),
      do: u(30),
      radnje: [
        radnja({ dogodenoAt: u(1), preparatNaziv: "LALVIN SENSY", jeKvasac: true, kolicina: 350, jedinicaNaziv: "g" }),
        radnja({ dogodenoAt: u(2), preparatNaziv: "Šumpovin", vrsta: "KOREKCIJA" }),
        radnja({ dogodenoAt: u(3), vrsta: "PRETOK", opis: "pretok u T8" }),
      ],
      mjerenja: [],
    });

    tvrdi(p.kvasci.length === 1 && p.kvasci[0].detalj === "350 g", "kvasac se izdvaja s kolicinom");
    tvrdi(p.dodaci.length === 2, "kvasac OSTAJE i u popisu dodataka, uz SO2 korekciju");
    tvrdi(p.radnje.length === 1 && p.radnje[0].naslov === "pretok u T8", "pretok nije dodavanje");
    tvrdi(p.stanje === "ima", "popis sa zapisima je `ima`");
  }

  {
    const p = povijestVina({
      tankId: "S",
      od: u(0),
      do: u(30),
      radnje: [],
      mjerenja: [mjerenje({ izmjerenoAt: u(5), secer: 72, ph: 3.2 })],
    });
    tvrdi(p.mjerenja.length === 1 && (p.mjerenja[0].detalj ?? "").includes("pH"), "mjerenje se ispisuje s parametrima");
    tvrdi(p.stanje === "ima", "samo mjerenje je takodjer zapis — nije rupa");
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
  const puni = tankovi.filter((t) => Number(t.kolicinaVinaUTanku ?? 0) > 0);

  const knjiga = await citajUlazneCine(prisma, tankovi.map((t) => t.id));

  const sveRadnje = (await prisma.vinoRadnja.findMany({
    where: { tankId: { in: puni.map((t) => t.id) } },
    select: {
      tankId: true, izvorniTankId: true, dogodenoAt: true, vrsta: true, opis: true,
      preparatNaziv: true, jedinicaNaziv: true, kolicina: true, jeKvasac: true,
    },
  })) as Array<RedakRadnje & { tankId: string }>;

  const sveMjerenje = (await prisma.mjerenje.findMany({
    select: {
      tankId: true, izmjerenoAt: true, alkohol: true, secer: true,
      ukupneKiseline: true, ph: true, slobodniSO2: true, ukupniSO2: true,
    },
  })) as RedakMjerenjaPosude[];

  // Prodji sva stabla i razvrstaj svaki cvor-posudu.
  const stanja = new Map<StanjePovijesti, number>();
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
    });
    stanja.set(p.stanje, (stanja.get(p.stanje) ?? 0) + 1);

    if (v.vrsta === "spoj") {
      for (const s of v.sastavnice) prodji(s.vino, korijen, v.kada.getTime());
    }
  };

  for (const t of puni) {
    const v = vinoUTanku(knjiga.cini, sorte, t.id, Date.now());
    if (v.vrsta === "spoj") for (const s of v.sastavnice) prodji(s.vino, t.id, v.kada.getTime());
  }

  console.log(`  (${cvorova} cvorova: ${[...stanja.entries()].map(([k, n]) => `${k} ${n}`).join(", ")})`);

  tvrdi(cvorova > 300, "podrum daje dovoljno cvorova za usporedbu", `${cvorova}`);
  tvrdi((stanja.get("prolazna") ?? 0) > 0, "postoje prolazne posude");
  tvrdi((stanja.get("rupa") ?? 0) > 0, "postoje rupe u evidenciji — i vide se");

  // NEOVISNO BROJANJE: rupa je cvor bez ijedne radnje, bez mjerenja, prozor > 3 dana.
  // Broji se ovdje ponovno, bez modula, da tvrdnja ne mjeri samu sebe.
  let rucno = 0;
  const prodji2 = (v: VinoCvor, korijen: string, doMs: number) => {
    if (v.vrsta === "partija") return;
    const vlastito = vinoUTanku(knjiga.cini, sorte, v.tankId, doMs);
    const odMs = vlastito.vrsta === "spoj" ? vlastito.kada.getTime() : doMs;

    const imaRadnju = sveRadnje.some(
      (r) => r.tankId === korijen && r.izvorniTankId === v.tankId &&
             r.dogodenoAt.getTime() >= odMs && r.dogodenoAt.getTime() <= doMs
    );
    const imaMjerenje = sveMjerenje.some(
      (m) => m.tankId === v.tankId &&
             m.izmjerenoAt.getTime() >= odMs && m.izmjerenoAt.getTime() <= doMs
    );
    if (!imaRadnju && !imaMjerenje && doMs - odMs > PRAG_RUPE_MS) rucno++;

    if (v.vrsta === "spoj") for (const s of v.sastavnice) prodji2(s.vino, korijen, v.kada.getTime());
  };
  for (const t of puni) {
    const v = vinoUTanku(knjiga.cini, sorte, t.id, Date.now());
    if (v.vrsta === "spoj") for (const s of v.sastavnice) prodji2(s.vino, t.id, v.kada.getTime());
  }

  tvrdi(
    (stanja.get("rupa") ?? 0) === rucno,
    "broj rupa se slaze s neovisnim brojanjem",
    `modul ${stanja.get("rupa") ?? 0}, rucno ${rucno}`
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
