/**
 * PROVJERA: je li naziv PRAVA SORTA, i sto to mijenja na kartici podruma.
 *
 * Pokretanje:  npm run test:sorta:naziv
 *
 * SIGURNOST: cisti dio radi bez baze; dio nad bazom je ISKLJUCIVO SELECT.
 * Izlazni kod je 1 ako ijedna tvrdnja padne ili ijedna mutacija prodje.
 *
 * STO SE DOKAZUJE
 * ---------------
 * 1. Prave sorte prolaze, i to bez obzira na dijakritiku i velika slova.
 * 2. Oznake koje nisu sorta ne prolaze: "Mješavina", "Cuvée", "Nepoznato
 *    podrijetlo" — bas one koje u `nazivSorte` stoje uz prave sorte.
 * 3. Prazno i `null` nisu sorta.
 * 4. Popis je ZATVOREN: nepoznato ime prolazi kao sorta. Bolje pustiti tudje
 *    ime nego tiho progutati pravu sortu.
 * 5. Nad pravom bazom: blok "Berba" dobivaju samo tankovi s dovoljnim udjelom
 *    PRAVE sorte; T8, T29 i T43 (Nepoznato podrijetlo) zadrzavaju popis
 *    sastavnica, iako im je udio preko praga.
 *
 * MUTACIJE: cetiri pokvarene izvedbe; svaka mora pasti bar jednom.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { jePravaSorta } from "../lib/sorta-naziv";
import { dohvatiPodrum, PRAG_JEDNOSORTNI } from "../app/dashboard/izvjestaji/podrum/podaci";
import { sloziKartice } from "../app/dashboard/izvjestaji/podrum/model";

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

type Izvedba = (naziv: string | null | undefined) => boolean;
type Tvrdnja = { opis: string; ok: boolean };

function baterija(f: Izvedba): Tvrdnja[] {
  const t: Tvrdnja[] = [];
  const reci = (opis: string, ok: boolean) => t.push({ opis, ok });

  // 1. prave sorte
  reci("Graševina je sorta", f("Graševina") === true);
  reci("Veltlinac zeleni je sorta", f("Veltlinac zeleni") === true);
  reci("velika slova ne smetaju", f("SAUVIGNON") === true);
  reci("bez dijakritike i dalje sorta", f("Muskat zuti") === true);

  // 2. oznake koje nisu sorta
  reci("Mješavina nije sorta", f("Mješavina") === false);
  reci("Mjesavina (bez dijakritike) nije sorta", f("Mjesavina") === false);
  reci("Cuvée nije sorta", f("Cuvée") === false);
  reci("Cuvee bijeli nije sorta", f("Cuvee bijeli") === false);
  reci("Nepoznato podrijetlo nije sorta", f("Nepoznato podrijetlo") === false);
  reci("razmaci oko naziva ne mijenjaju sud", f("  mješavina  ") === false);

  // 3. prazno
  reci("null nije sorta", f(null) === false);
  reci("prazan niz nije sorta", f("") === false);
  reci("sami razmaci nisu sorta", f("   ") === false);

  // 4. popis je zatvoren
  reci("nepoznato ime prolazi kao sorta", f("Neka nova sorta") === true);
  reci("Chardonnay prolazi", f("Chardonnay") === true);

  return t;
}

const MUTACIJE: Array<{ naziv: string; f: Izvedba }> = [
  {
    naziv: "usporedba osjetljiva na velika slova",
    f: (n) => {
      if (!n) return false;
      const s = n.trim();
      return !["Mjesavina", "Cuvee", "Nepoznato podrijetlo"].includes(s);
    },
  },
  {
    naziv: "ne skida dijakritiku",
    f: (n) => {
      if (!n) return false;
      const s = n.toLowerCase().trim();
      return !["mjesavina", "cuvee", "nepoznato podrijetlo"].includes(s);
    },
  },
  {
    naziv: "prazan niz prolazi kao sorta",
    f: (n) => {
      if (n === null || n === undefined) return false;
      const s = n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      return !["mjesavina", "cuvee", "cuvee bijeli", "nepoznato podrijetlo"].includes(s);
    },
  },
  {
    naziv: "popis je otvoren — guta i prave sorte (sve s 'vin' u imenu)",
    f: (n) => {
      if (!n) return false;
      const s = n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      if (s.includes("vin")) return false;
      return !["mjesavina", "cuvee", "cuvee bijeli", "nepoznato podrijetlo"].includes(s);
    },
  },
];

async function main() {
  console.log("Provjera: je li naziv prava sorta.\n");

  console.log("PRAVILO");
  for (const x of baterija(jePravaSorta)) tvrdi(x.ok, x.opis);

  console.log("\nMUTACIJE (svaka mora pasti bar jednom)");
  for (const m of MUTACIJE) {
    const pala = baterija(m.f).filter((x) => !x.ok);
    tvrdi(pala.length > 0, `uhvacena: ${m.naziv}`, pala.length === 0 ? "mutacija je prosla sve tvrdnje" : undefined);
  }

  // ------------------------------------------------ kartica, nad pravom bazom
  console.log(`\nKARTICA PODRUMA (prag ${PRAG_JEDNOSORTNI} %, samo citanje)`);

  const podaci = await dohvatiPodrum();
  const kartice = sloziKartice(podaci, new Date());

  const sBlokomBerbe: number[] = [];
  const prekoPragaBezSorte: number[] = [];

  for (const k of kartice) {
    if (k.berba) sBlokomBerbe.push(k.broj);

    const najveci = [...k.sastavSvi].sort((a, b) => b.postotak - a.postotak)[0];
    if (
      najveci &&
      najveci.postotak > PRAG_JEDNOSORTNI &&
      !jePravaSorta(najveci.naziv)
    ) {
      prekoPragaBezSorte.push(k.broj);
    }
  }

  console.log(`  blok BERBA ima ${sBlokomBerbe.length} kartica: ${sBlokomBerbe.map((b) => `T${b}`).join(", ")}`);
  console.log(`  preko praga, ali bez prave sorte: ${prekoPragaBezSorte.map((b) => `T${b}`).join(", ") || "nema"}`);

  tvrdi(
    prekoPragaBezSorte.every((broj) => {
      const k = kartice.find((x) => x.broj === broj);
      return k != null && k.berba === null;
    }),
    "tank preko praga bez prave sorte NE dobiva blok berbe"
  );

  tvrdi(
    kartice.every((k) => !k.berba || jePravaSorta(k.berba.nazivSorte)),
    "nijedan blok berbe ne stoji na oznaci koja nije sorta"
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
