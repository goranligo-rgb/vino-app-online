/**
 * PROVJERA PROZORA FERMENTACIJE nad pravom bazom — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run fermentacija:provjeri
 *
 * SIGURNOST: iskljucivo SELECT. Nema transakcije, nema upisa, nema brisanja.
 * Isti obrazac kao scripts/provjeri-berbu.ts i scripts/provjeri-mjerenja-berba.ts.
 *
 * TABLICA `Fermentacija` JE PRAZNA i ova skripta u nju NE PISE. Prozori se
 * SASTAVLJAJU u memoriji iz stvarnih dogadaja — datum dodavanja kvasca uzima se
 * kao pocetak, kraj je "sada". Tako se logika provjerava prije nego ijedna
 * fermentacija bude unesena; kad forma proradi, isti kod dobiva prave retke.
 *
 * ZASTO BAS T10, T11 i T43
 *   T10 — Chardonnay: kvasac 24.08., vino se 27. i 28.08. dijelom seli u T45.
 *         Slucaj zbog kojeg prozor postoji. Ujedno provjerava da se NE pojavi
 *         T2, koji je 400 L iste berbe dobio PRIJE kvasca — druga partija.
 *   T11 — Veltlinac: kvasac 25.08., pa ISPRAVAK od 2.504 L usred fermentacije
 *         (backfill, ne stvarni dogadaj — ograda 1 u lib/fermentacija-prozor.ts).
 *   T43 — neuredan: dvadesetak sicusnih izlaza od pola litre. Provjerava da
 *         `spojiSusjedne` od toga napravi citljiv boravak, a racun ostane tocan.
 *
 * Izlazni kod je 1 ako ijedna invarijanta padne.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { uValovima } from "../lib/paralelno";
import {
  prozorFermentacije,
  segmentiIzTanka,
  spojiSusjedne,
  berbeUTanku,
  type KretanjeBerbe,
  type RezultatProzora,
} from "../lib/fermentacija-prozor";

let pao = 0;
let proslo = 0;

function ok(uvjet: boolean, poruka: string, detalj = "") {
  if (uvjet) {
    proslo++;
    console.log(`  ok   ${poruka}`);
    return;
  }
  pao++;
  console.log(`  PALO ${poruka}${detalj ? "\n         " + detalj : ""}`);
}

function dat(d: Date): string {
  return d.toISOString().slice(5, 16).replace("T", " ");
}

function lit(n: number): string {
  return n.toLocaleString("hr-HR", { maximumFractionDigits: 1 });
}

// ---------------------------------------------------------------------------
// 1) Cisti testovi — bez baze, izmisljeni podaci, poznat odgovor
// ---------------------------------------------------------------------------

function cistiTestovi() {
  console.log("Cisti testovi (bez baze):");

  const T = (s: string) => new Date(`2026-08-${s}Z`);
  const L = (n: number) => n * 1000;

  // Obrazac iz baze: berba ude u prijemni tank, podijeli se na dva, a kvasac
  // dobiva samo jedan od njih.
  const podjela: KretanjeBerbe[] = [
    { berbaId: "B", izTankId: null, uTankId: "PRIJEM", ml: L(5200), dogodenoAt: T("01T05:32") },
    { berbaId: "B", izTankId: "PRIJEM", uTankId: "GLAVNI", ml: L(4800), dogodenoAt: T("01T05:37") },
    { berbaId: "B", izTankId: "PRIJEM", uTankId: "SPOREDNI", ml: L(400), dogodenoAt: T("01T05:37") },
    { berbaId: "B", izTankId: "GLAVNI", uTankId: "DRUGI", ml: L(500), dogodenoAt: T("04T14:00") },
  ];

  const s = segmentiIzTanka(podjela, "B", "GLAVNI", T("01T05:43"), T("06T00:00"));
  const tankovi = [...new Set(s.map((x) => x.tankId))].sort();

  ok(
    !tankovi.includes("SPOREDNI"),
    "vino odvojeno PRIJE pocetka ne ulazi u prozor (SPOREDNI ne smije biti tu)",
    `dobiveni tankovi: ${tankovi.join(", ")}`
  );
  ok(
    tankovi.join(",") === "DRUGI,GLAVNI",
    "prozor sadrzi samo pocetni tank i onaj u koji je vino iz njega otislo",
    `dobiveno: ${tankovi.join(", ")}`
  );

  const glavni = s.filter((x) => x.tankId === "GLAVNI");
  ok(
    glavni.length === 2 && glavni[0].litre === 4800 && glavni[1].litre === 4300,
    "GLAVNI: 4.800 L pa 4.300 L nakon odljeva",
    glavni.map((x) => lit(x.litre)).join(" → ")
  );
  const drugi = s.find((x) => x.tankId === "DRUGI");
  ok(!!drugi && drugi.litre === 500, "DRUGI dobiva tocno 500 L");
  ok(
    !!drugi && dat(drugi.od) === dat(T("04T14:00")),
    "DRUGI pocinje u trenutku pretoka — bez rupe i bez preklapanja"
  );
  ok(!!drugi && drugi.otvoren, "segment koji traje do kraja prozora je otvoren");

  // Prozor koji pocinje NAKON pretoka vidi samo tada stvarno stanje.
  const kasnije = segmentiIzTanka(podjela, "B", "GLAVNI", T("05T00:00"), T("06T00:00"));
  ok(
    kasnije.length === 1 && kasnije[0].tankId === "GLAVNI" && kasnije[0].litre === 4300,
    "prozor koji pocinje kasnije krece od 4.300 L i ne prati vec odvojeno vino",
    kasnije.map((x) => `${x.tankId}=${lit(x.litre)}`).join(" ")
  );

  // Vise redaka u istom trenutku — nema medustanja.
  const istodobno: KretanjeBerbe[] = [
    { berbaId: "C", izTankId: null, uTankId: "TA", ml: L(900), dogodenoAt: T("01T06:00") },
    { berbaId: "C", izTankId: "TA", uTankId: null, ml: L(300), dogodenoAt: T("02T06:00") },
    { berbaId: "C", izTankId: "TA", uTankId: null, ml: L(300), dogodenoAt: T("02T06:00") },
    { berbaId: "C", izTankId: "TA", uTankId: null, ml: L(300), dogodenoAt: T("02T06:00") },
  ];
  const sc = segmentiIzTanka(istodobno, "C", "TA", T("01T06:00"), T("03T06:00"));
  ok(
    sc.length === 1 && sc[0].litre === 900 && dat(sc[0].do) === dat(T("02T06:00")),
    "tri istovremena izlaza daju JEDAN segment koji zavrsava — bez medustanja",
    sc.map((x) => `${lit(x.litre)}L ${dat(x.od)}→${dat(x.do)}`).join("  ")
  );
  ok(!sc[0]?.otvoren, "segment koji je zavrsio prije kraja prozora nije otvoren");

  // Iz tanka se ne smije uzeti vise nego sto fermentacija ondje drzi.
  const previse: KretanjeBerbe[] = [
    { berbaId: "D", izTankId: null, uTankId: "TB", ml: L(100), dogodenoAt: T("01T06:00") },
    { berbaId: "D", izTankId: null, uTankId: "TB", ml: L(900), dogodenoAt: T("02T06:00") },
    { berbaId: "D", izTankId: "TB", uTankId: "TC", ml: L(1000), dogodenoAt: T("03T06:00") },
  ];
  const sd = segmentiIzTanka(previse, "D", "TB", T("01T06:00"), T("04T06:00"));
  const tc = sd.find((x) => x.tankId === "TC");
  ok(
    !!tc && tc.litre === 100,
    "dolijevanje se ne pribraja, pa u odrediste ide samo ono sto je fermentacija drzala",
    tc ? `${lit(tc.litre)} L` : "TC se nije pojavio"
  );

  // Spajanje susjednih.
  const boravci = spojiSusjedne(s);
  const bG = boravci.find((b) => b.tankId === "GLAVNI");
  ok(
    !!bG && bG.segmenata === 2 && bG.litreOd === 4800 && bG.litreDo === 4300 && bG.mijenjalaSe,
    "spojiSusjedne spaja GLAVNI u jedan boravak 4.800 → 4.300 L",
    bG ? `segmenata=${bG.segmenata} ${bG.litreOd}→${bG.litreDo}` : "nema"
  );

  // berbeUTanku
  const u = berbeUTanku(podjela, "GLAVNI", T("01T05:43"));
  ok(u.size === 1 && u.get("B") === L(4800), "berbeUTanku vraca 4.800 L za GLAVNI na pocetku");

  // Rubovi.
  ok(
    segmentiIzTanka(podjela, "B", "GLAVNI", T("06T00:00"), T("06T00:00")).length === 0,
    "prozor nulte duljine ne daje nijedan segment"
  );
  ok(
    segmentiIzTanka(podjela, "B", "NEPOSTOJECI", T("01T05:43"), T("06T00:00")).length === 0,
    "tank u kojem berba nije bila ne daje nijedan segment"
  );
  ok(
    segmentiIzTanka(podjela, "NEMA", "GLAVNI", T("01T05:43"), T("06T00:00")).length === 0,
    "nepoznata berba ne daje nijedan segment"
  );

  console.log("");
}

// ---------------------------------------------------------------------------
// 2) Nad pravom bazom
// ---------------------------------------------------------------------------

async function main() {
  console.log("Provjera prozora fermentacije (samo citanje).\n");

  cistiTestovi();

  const kretanja = await prisma.berbaKretanje.count();
  if (kretanja === 0) {
    console.log("Knjiga kretanja je prazna — nema se sto slagati.\n");
    return;
  }

  const fermentacija = await prisma.fermentacija.count();
  console.log(
    `Knjiga: ${kretanja} kretanja. Tablica Fermentacija: ${fermentacija} redaka ` +
      "(prozori se nize SASTAVLJAJU, ne citaju).\n"
  );

  const tankovi = new Map(
    (await prisma.tank.findMany({ select: { id: true, broj: true } })).map((t) => [t.id, t.broj])
  );
  const idPoBroju = new Map([...tankovi.entries()].map(([id, broj]) => [broj, id]));
  const T = (id: string) => `T${tankovi.get(id) ?? "?"}`;

  const berbe = new Map(
    (await prisma.berba.findMany({ select: { id: true, nazivSorte: true } })).map((b) => [
      b.id,
      b.nazivSorte,
    ])
  );

  const sada = new Date();

  const zadaci = await prisma.zadatak.findMany({
    where: { vrsta: "DODAVANJE", izvrsenoAt: { not: null } },
    select: { tankId: true, izvrsenoAt: true },
    orderBy: { izvrsenoAt: "asc" },
  });
  const kvasacPoTanku = new Map<string, Date>();
  for (const z of zadaci) {
    if (z.izvrsenoAt && !kvasacPoTanku.has(z.tankId)) kvasacPoTanku.set(z.tankId, z.izvrsenoAt);
  }

  type Slucaj = { broj: number; tankId: string; pocetakAt: Date; opis: string };
  const slucajevi: Slucaj[] = [];

  for (const broj of [10, 11, 43]) {
    const tankId = idPoBroju.get(broj);
    if (!tankId) {
      console.log(`  (tank ${broj} ne postoji — preskacem)`);
      continue;
    }
    const kvasac = kvasacPoTanku.get(tankId);
    if (kvasac) {
      slucajevi.push({ broj, tankId, pocetakAt: kvasac, opis: "pocetak = dodavanje kvasca" });
      continue;
    }
    const prvi = await prisma.berbaKretanje.findFirst({
      where: { uTankId: tankId },
      orderBy: { dogodenoAt: "asc" },
      select: { dogodenoAt: true },
    });
    if (!prvi) {
      console.log(`  (tank ${broj} nema nijedan ulaz u knjizi — preskacem)`);
      continue;
    }
    slucajevi.push({
      broj,
      tankId,
      pocetakAt: prvi.dogodenoAt,
      opis: "nema kvasca — pocetak = prvi ulaz u knjizi",
    });
  }

  // Vise prozora odjednom ide kroz uValovima, ne kroz goli Promise.all.
  // Sirina 2 — isti izbor koji lib/berba-lanac.ts vec koristi kad se vrti uz
  // ostale upite (pooler drzi 15 veza za CIJELU aplikaciju).
  const rezultati = await uValovima(
    slucajevi.map(
      (s) => () =>
        prozorFermentacije(prisma, { tankId: s.tankId, pocetakAt: s.pocetakAt, krajAt: null }, sada)
    ),
    2
  );

  for (let i = 0; i < slucajevi.length; i++) {
    const s = slucajevi[i];
    const r: RezultatProzora = rezultati[i];

    console.log(`\n── T${s.broj} — ${s.opis}`);
    console.log(`   prozor: ${dat(s.pocetakAt)} → ${dat(r.prozorDo)} (jos traje)`);

    if (r.berbaIds.length === 0) {
      console.log("   knjiga u tom trenutku ne zna nista o ovom tanku — nema segmenata.");
      continue;
    }

    console.log(
      `   vino: ${r.berbaIds
        .map((b) => `${berbe.get(b) ?? "?"} ${lit(r.pocetneLitre.get(b) ?? 0)} L`)
        .join(", ")}`
    );
    console.log(`   prosao kroz: ${r.tankovi.map(T).join(" → ")}`);
    console.log(`   segmenata: ${r.segmenti.length}, boravaka: ${r.boravci.length}`);

    for (const b of r.boravci) {
      const kolicina = b.mijenjalaSe
        ? `${lit(b.litreOd)} → ${lit(b.litreDo)} L`
        : `${lit(b.litreOd)} L`;
      console.log(
        `     ${T(b.tankId).padEnd(5)} ${dat(b.od)} → ${dat(b.do)}  ${kolicina}` +
          `${b.otvoren ? "  (jos traje)" : ""}  [${b.segmenata} segm.]  ${
            berbe.get(b.berbaId) ?? "?"
          }`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Invarijante nad stvarnim podacima
  // -------------------------------------------------------------------------
  console.log("\nInvarijante:");

  const sviSegmenti = rezultati.flatMap((r) => r.segmenti);

  ok(
    sviSegmenti.every((x) => x.do.getTime() > x.od.getTime()),
    "svaki segment ima pozitivno trajanje"
  );

  ok(
    sviSegmenti.every((x) => x.litre > 0),
    "nijedan segment nema kolicinu <= 0",
    sviSegmenti
      .filter((x) => x.litre <= 0)
      .map((x) => `${T(x.tankId)} ${lit(x.litre)}`)
      .join(", ")
  );

  const izvanProzora = rezultati.flatMap((r, i) =>
    r.segmenti.filter(
      (x) =>
        x.od.getTime() < slucajevi[i].pocetakAt.getTime() || x.do.getTime() > r.prozorDo.getTime()
    )
  );
  ok(izvanProzora.length === 0, "nijedan segment ne izlazi iz svog prozora", `${izvanProzora.length} izasla`);

  // Pocetni tank mora biti prvi tank prozora — fermentacija ondje pocinje.
  const krivPocetak = rezultati
    .map((r, i) => ({ r, s: slucajevi[i] }))
    .filter((x) => x.r.segmenti.length > 0 && x.r.tankovi[0] !== x.s.tankId);
  ok(
    krivPocetak.length === 0,
    "prozor uvijek pocinje u tanku u kojem je fermentacija zapocela",
    krivPocetak.map((x) => `T${x.s.broj} → ${T(x.r.tankovi[0])}`).join("; ")
  );

  // Segmenti iste berbe u istom tanku ne smiju se preklapati.
  const preklapanja: string[] = [];
  for (const r of rezultati) {
    const poKljucu = new Map<string, typeof r.segmenti>();
    for (const x of r.segmenti) {
      const k = `${x.berbaId}|${x.tankId}`;
      poKljucu.set(k, [...(poKljucu.get(k) ?? []), x]);
    }
    for (const popis of poKljucu.values()) {
      const p = popis.slice().sort((a, b) => a.od.getTime() - b.od.getTime());
      for (let i = 1; i < p.length; i++) {
        if (p[i].od.getTime() < p[i - 1].do.getTime()) {
          preklapanja.push(`${T(p[i].tankId)} ${dat(p[i].od)} < ${dat(p[i - 1].do)}`);
        }
      }
    }
  }
  ok(preklapanja.length === 0, "segmenti iste berbe u istom tanku se ne preklapaju", preklapanja.join("; "));

  // Spajanje ne smije izgubiti ni dodati vrijeme.
  const lose: string[] = [];
  for (const r of rezultati) {
    const seg = r.segmenti.reduce((s, x) => s + (x.do.getTime() - x.od.getTime()), 0);
    const bor = r.boravci.reduce((s, x) => s + (x.do.getTime() - x.od.getTime()), 0);
    if (seg !== bor) lose.push(`${seg} ms vs ${bor} ms`);
  }
  ok(lose.length === 0, "spojiSusjedne cuva ukupno trajanje", lose.join("; "));

  // Prozor nikad ne smije tvrditi da fermentacija drzi VISE nego sto knjiga
  // uopce pokazuje u tom tanku danas. Manje smije — dolijevanje se ne prati
  // (ograda 3), a odvojeno vino nije dio prozora.
  const previse: string[] = [];
  for (const r of rezultati) {
    for (const b of r.boravci) {
      if (!b.otvoren) continue;
      const red = await prisma.$queryRaw<Array<{ ml: number }>>`
        SELECT COALESCE(SUM(
          (CASE WHEN k."uTankId"  = ${b.tankId} THEN ROUND(k.litre::numeric * 1000) ELSE 0 END)
        - (CASE WHEN k."izTankId" = ${b.tankId} THEN ROUND(k.litre::numeric * 1000) ELSE 0 END)
        ), 0)::float8 AS ml
        FROM "BerbaKretanje" k WHERE k."berbaId" = ${b.berbaId}
      `;
      const uKnjizi = Number(red[0]?.ml ?? 0) / 1000;
      if (b.litreDo - uKnjizi > 0.001) {
        previse.push(
          `${T(b.tankId)} ${berbe.get(b.berbaId) ?? "?"}: prozor ${lit(b.litreDo)} L > knjiga ${lit(uKnjizi)} L`
        );
      }
    }
  }
  ok(
    previse.length === 0,
    "prozor nigdje ne drzi vise vina nego sto knjiga pokazuje u tom tanku",
    previse.join("; ")
  );

  console.log(`\nproslo: ${proslo}, palo: ${pao}`);

  if (pao > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
