/**
 * Provjera lib/prosli-tank.ts — kvasci i prozori kucice.
 *
 * Pokretanje:  npm run test:prosli:tank
 *
 * SIGURNOST: sinteticki dio ne dira bazu; dio nad pravom bazom iskljucivo
 * cita (SELECT), nista ne upisuje.
 */

import { prisma } from "../lib/prisma";
import {
  citajUlazneCine,
  vinoUTanku,
  type Sastavnica,
  type VinoCvor,
} from "../lib/identitet-vina";
import { podrijetloTanka } from "../lib/berba-model";
import { kvasciKucice, pojaveKucice, prozoriKucice, rastaviKljucCina } from "../lib/prosli-tank";

let proslo = 0;
let palo = 0;

function tvrdi(uvjet: boolean, opis: string, detalj?: string) {
  if (uvjet) {
    proslo++;
    console.log(`  ok   ${opis}`);
    return;
  }
  palo++;
  console.log(`  PALO ${opis}${detalj ? ` — ${detalj}` : ""}`);
}

const SAT = 3_600_000;
const POCETAK = Date.parse("2026-09-01T06:00:00Z");
const u = (h: number) => new Date(POCETAK + h * SAT);

/** Kucica: vino `v` uslo je cinom `kljuc` u satu `h`, s udjelom `udio`. */
function sast(v: VinoCvor, kljuc: string, h: number, udio: number): Sastavnica {
  return {
    vino: v,
    litre: udio * 1000,
    udio,
    usloAt: u(h),
    otpusteno: udio * 1000,
    kalo: 0,
    progutano: false,
    kljucCina: kljuc,
  };
}

function spoj(tankId: string, h: number, sastavnice: Sastavnica[]): VinoCvor {
  return { vrsta: "spoj", tankId, kada: u(h), sastavnice, litre: 1000 };
}

const berba = (id: string): VinoCvor => ({ vrsta: "partija", berbaId: id, nazivSorte: "Graševina", litre: 1000 });

const kvasac = (tankId: string, h: number, udio: number) => ({
  izvorniTankId: tankId,
  dogodenoAt: u(h),
  udio,
});

async function main() {
  console.log("Provjera kucice prosli-tank — kvasci i prozori.\n");

  console.log("KVASCI (sinteticki)");
  {
    // R <- S (50 %) i R <- Q (50 %). Kvasac u S u satu 2, u korijenu 30 %.
    const S = spoj("S", 0, [sast(berba("b1"), "ulazS", 0, 1)]);
    const Q = spoj("Q", 0, [sast(berba("b2"), "ulazQ", 0, 1)]);
    const R = spoj("R", 5, [sast(S, "p1:R", 5, 0.5), sast(Q, "p1:R", 5, 0.5)]);

    const k = kvasciKucice(R, "S", "p1:R", [kvasac("S", 2, 0.3)]);
    tvrdi(k.length === 1 && Math.abs((k[0].udio ?? 0) - 0.6) < 1e-9, "jedan put: udio korijena / udio kucice (30 % / 50 % = 60 %)", JSON.stringify(k.map((x) => x.udio)));

    const q = kvasciKucice(R, "Q", "p1:R", [kvasac("S", 2, 0.3)]);
    tvrdi(q.length === 0, "kvasac tude kucice se ne pokazuje");

    const r = kvasciKucice(R, "S", "p1:R", [kvasac("R", 6, 1)]);
    tvrdi(r.length === 0, "kvasac dodan tek u korijenu ne pripada kucici");

    const prije = kvasciKucice(R, "S", "p1:R", [kvasac("S", 7, 0.5)]);
    tvrdi(prije.length === 0, "kvasac dodan u posudu nakon sto je vino otislo ne pripada kucici");
  }

  {
    // Vino iz P razdvojeno u A i B, oba stizu u korijen. Kvasac u P stize kroz
    // obje kucice — za kucicu A se ne zna koliko je doslo kojim putem.
    const P1 = spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]);
    const P2 = spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]);
    const A = spoj("A", 3, [sast(P1, "pA:A", 3, 1)]);
    const B = spoj("B", 3, [sast(P2, "pB:B", 3, 1)]);
    const R = spoj("R", 5, [sast(A, "p2:R", 5, 0.5), sast(B, "p2:R", 5, 0.5)]);

    const a = kvasciKucice(R, "A", "p2:R", [kvasac("P", 1, 0.8)]);
    tvrdi(a.length === 1 && a[0].udio === null && a[0].zasto === "vise_putova", "kvasac koji stize i drugim putem: bez postotka, razlog vise_putova", JSON.stringify(a.map((x) => x.udio)));

    // Ista FIZICKA komponenta (P -> A) pojavi se dvaput kad A stigne u korijen
    // s dvije strane. To je isto vino: pojave se zbrajaju i broj se zna.
    const A1 = spoj("A", 3, [sast(spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]), "pA:A", 3, 1)]);
    const A2 = spoj("A", 3, [sast(spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]), "pA:A", 3, 1)]);
    const X = spoj("X", 4, [sast(A1, "px:X", 4, 1)]);
    const Y = spoj("Y", 4, [sast(A2, "py:Y", 4, 1)]);
    const R2 = spoj("R", 5, [sast(X, "p3:R", 5, 0.25), sast(Y, "p3:R", 5, 0.25), sast(spoj("Z", 0, []), "p3:R", 5, 0.5)]);

    tvrdi(pojaveKucice(R2, "P", "pA:A").length === 2, "ista komponenta nadjena na oba mjesta u stablu");
    const dvaput = kvasciKucice(R2, "P", "pA:A", [kvasac("P", 1, 0.4)]);
    tvrdi(dvaput.length === 1 && Math.abs((dvaput[0].udio ?? 0) - 0.8) < 1e-9, "ponovljena komponenta: udjeli pojava se zbrajaju (40 % / 50 % = 80 %)", JSON.stringify(dvaput.map((x) => x.udio)));
  }

  {
    // Dublji cvor unutar kucice: kvasac u D, D -> S -> R.
    const D = spoj("D", 0, [sast(berba("b1"), "ulazD", 0, 1)]);
    const S = spoj("S", 3, [sast(D, "pd:S", 3, 1)]);
    const R = spoj("R", 5, [sast(S, "p4:R", 5, 0.25), sast(spoj("Q", 0, []), "p4:R", 5, 0.75)]);
    const k = kvasciKucice(R, "S", "p4:R", [kvasac("D", 1, 0.25)]);
    tvrdi(k.length === 1 && Math.abs((k[0].udio ?? 0) - 1) < 1e-9, "kvasac iz dubljeg cvora kucice: prijevod je tocan", JSON.stringify(k.map((x) => x.udio)));

    const preko = kvasciKucice(R, "S", "p4:R", [kvasac("D", 1, 0.5)]);
    tvrdi(preko.length === 1 && preko[0].udio === null && preko[0].zasto === "nesklad", "prijevod preko 100 % nema broja, razlog nesklad");
  }

  console.log("\nPROZORI (sinteticki)");
  {
    const P1 = spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]);
    const P2 = spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]);
    const A = spoj("A", 3, [sast(P1, "pA:A", 2, 0.5), sast(P2, "pA:A", 2, 0.5)]);
    const pr = prozoriKucice(sast(A, "p5:R", 5, 1));
    tvrdi(pr.length === 2, "posuda kucice i posuda pretka, ponovljeni prozor spojen", JSON.stringify(pr.map((x) => x.tankId)));
    const a = pr.find((x) => x.tankId === "A");
    tvrdi(!!a && a.od.getTime() === u(3).getTime() && a.do.getTime() === u(5).getTime(), "prozor posude kucice je [rodjenje, ulazak u roditelja]");
  }

  {
    // Vino u P razdvojeno: dio otisao u A u satu 2, ostatak u B u satu 6.
    // Dva prozora P pocinju istim rodjenjem — radnja iz sata 1 je JEDNA.
    const Pa = spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]);
    const Pb = spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]);
    const A = spoj("A", 2, [sast(Pa, "pA:A", 2, 1)]);
    const B = spoj("B", 6, [sast(Pb, "pB:B", 6, 1)]);
    const K = spoj("K", 7, [sast(A, "pK:K", 7, 0.5), sast(B, "pK:K", 7, 0.5)]);
    const pr = prozoriKucice(sast(K, "p6:R", 8, 1)).filter((x) => x.tankId === "P");
    tvrdi(pr.length === 1 && pr[0].od.getTime() === u(0).getTime() && pr[0].do.getTime() === u(6).getTime(), "preklopljeni prozori iste posude spojeni u jedan", JSON.stringify(pr));

    // Dodir nije preklapanje: vino koje je otislo kad je novo nastalo je drugo vino.
    const P1 = spoj("P", 0, [sast(berba("b1"), "ulazP", 0, 1)]);
    const P2 = spoj("P", 3, [sast(berba("b2"), "ulazP2", 3, 1)]);
    const K2 = spoj("K", 7, [sast(spoj("A", 3, [sast(P1, "pA:A", 3, 1)]), "pK:K", 7, 0.5), sast(P2, "pK:K", 7, 0.5)]);
    tvrdi(prozoriKucice(sast(K2, "p7:R", 8, 1)).filter((x) => x.tankId === "P").length === 2, "prozori koji se samo dodiruju ostaju zasebni");
  }

  console.log("\nKLJUC CINA");
  {
    const r = rastaviKljucCina("3fb62b47-3a74:070b0410-e3b5:PRETOK");
    tvrdi(r?.veza === "3fb62b47-3a74" && r.ciljTankId === "070b0410-e3b5" && r.vrsta === "PRETOK", "kljuc se rastavlja na vezu, cilj i vrstu");
    tvrdi(rastaviKljucCina("sam:abc:T1:ULAZ")?.veza === "sam:abc", "veza s dvotockom ostaje cijela");
    tvrdi(rastaviKljucCina("krivo") === null, "neispravan kljuc daje null");
  }

  console.log("\nNAD PRAVOM BAZOM (samo citanje)");
  const tankovi = await prisma.tank.findMany({ select: { id: true, broj: true, kolicinaVinaUTanku: true }, orderBy: { broj: "asc" } });
  const broj = new Map(tankovi.map((t) => [t.id, t.broj]));
  const sorte = new Map((await prisma.berba.findMany({ select: { id: true, nazivSorte: true } })).map((b) => [b.id, b.nazivSorte] as const));
  const { cini } = await citajUlazneCine(prisma, tankovi.map((t) => t.id));

  let izvanOkvira = 0;
  const primjeriNesklada: string[] = [];
  type Mjera = { kucica: number; sPost: number; visePutova: number; nesklad: number; sviSPost: number; dioBez: number; bezKvasca: number };
  const mjera = new Map<number, Mjera>();

  for (const t of tankovi.filter((x) => Number(x.kolicinaVinaUTanku ?? 0) > 0)) {
    const pod = await podrijetloTanka(prisma, t.id);
    const korijen = vinoUTanku(cini, sorte, t.id, Date.now(), {}, [], pod.ukupnoL);
    const kvasci = await prisma.vinoRadnja.findMany({ where: { tankId: t.id, jeKvasac: true } });

    // Svaka FIZICKA kucica jednom: cin + posuda.
    const kucice = new Map<string, { iz: string; kljuc: string }>();
    const skupi = (v: VinoCvor) => {
      if (v.vrsta !== "spoj") return;
      for (const s of v.sastavnice) {
        if (s.vino.vrsta !== "partija") kucice.set(`${s.kljucCina}|${s.vino.tankId}`, { iz: s.vino.tankId, kljuc: s.kljucCina });
        skupi(s.vino);
      }
    };
    skupi(korijen);

    const m: Mjera = { kucica: kucice.size, sPost: 0, visePutova: 0, nesklad: 0, sviSPost: 0, dioBez: 0, bezKvasca: 0 };
    for (const k of kucice.values()) {
      const r = kvasciKucice(korijen, k.iz, k.kljuc, kvasci);
      for (const x of r) {
        if (x.udio !== null) {
          m.sPost++;
          if (x.udio < 0 || x.udio > 1 || x.zasto !== null) izvanOkvira++;
        } else if (x.zasto === "vise_putova") {
          m.visePutova++;
        } else if (x.zasto === "nesklad") {
          m.nesklad++;
          if (primjeriNesklada.length < 3) {
            primjeriNesklada.push(`T${t.broj}: kucica T${broj.get(k.iz)}, ${x.redak.preparatNaziv} iz T${x.redak.izvorniBrojTanka}`);
          }
        } else {
          izvanOkvira++;
        }
      }
      if (r.length === 0) m.bezKvasca++;
      else if (r.every((x) => x.udio !== null)) m.sviSPost++;
      else m.dioBez++;
    }
    mjera.set(t.broj, m);
  }

  tvrdi(izvanOkvira === 0, "svaki broj je 0-100 % bez razloga sutnje; svaka sutnja ima razlog");

  // NESKLAD NIJE PAD TESTA: kvasac stize samo kroz tu kucicu, ali bi prijevod
  // presao 100 % — zapis i knjiga tu ne pricaju istu pricu (70 parova na
  // popisu, 28.09.2026). Kod tada suti, sto je ispravno; ovo je mjera podataka.
  const nesklad = [...mjera.values()].reduce((z, x) => z + x.nesklad, 0);
  console.log(`  nesklad zapisa i knjige (kvasac bez postotka): ${nesklad} pojava — npr. ${primjeriNesklada.join("; ")}`);

  for (const b of [42, 7, 5, 8]) {
    const x = mjera.get(b);
    if (!x) continue;
    console.log(
      `  T${b}: kucica ${x.kucica}; pojave kvasca s % ${x.sPost}, bez % zbog vise putova ${x.visePutova}, zbog nesklada ${x.nesklad}; ` +
        `kucice sve s % ${x.sviSPost}, dio bez % ${x.dioBez}, bez kvasca ${x.bezKvasca}`
    );
  }

  console.log(`\nproslo: ${proslo}, palo: ${palo}`);
  if (palo > 0) process.exitCode = 1;
  void broj;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
