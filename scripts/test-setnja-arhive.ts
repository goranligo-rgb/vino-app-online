/**
 * Provjera `nadjiKucicu` (lib/prosli-tank.ts) — setnja kroz arhivu bez korijena.
 *
 * Pokretanje:  npm run test:setnja
 *
 * SIGURNOST: iskljucivo cita (SELECT), nista ne upisuje.
 *
 * Sto tvrdi:
 *   1. S KORIJENOM sve ostaje kako je bilo: za svaku kucicu posude u zivim
 *      stablima `nadjiKucicu` daje isto sto i `pojaveKucice()[0]` — isti
 *      roditelj, ista sastavnica sa stablom ispod, isti udio u korijenu.
 *   2. BEZ KORIJENA, iz samog kljuca cina, za iste kucice: isti roditelj i ista
 *      sastavnica do zadnjeg lista — OSIM `udio`. Udio u roditelju racuna se
 *      nad svim cinovima roditelja do trenutka u kojem ga gledas: kroz korijen
 *      je to trenutak kad je vino roditelja otislo dalje (s kasnijim
 *      progutanim dolijevanjima), bez korijena trenutak ovog cina. Mjereno
 *      09.10.2026: 89 od 516 pojava. /prosli-tank `kucica.udio` ne prikazuje,
 *      pa test to tvrdi poimence (vidi KORISTENA_POLJA).
 *   3. Korijen koji kucicu ne sadrzi (stara poveznica, posuda ponovno
 *      napunjena) ne daje notFound nego kucicu iz kljuca.
 *   4. T42 DO DNA: hod kojim ide korisnik — iz izvora svake otvorene kucice,
 *      adresom bez korijena — posjeti svaku kucicu stabla i dode do zadnje
 *      razine; nijedna razina ne puca.
 *   5. Isti hod ispod svake snimke izlaza (/prosli-tank?snimka=).
 *   6. Kriva adresa vraca null, ne pogodjenu kucicu.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import { citajUlazneCine, vinoUTanku, type VinoCvor, type Sastavnica } from "../lib/identitet-vina";
import { podrijetloTanka } from "../lib/berba-model";
import { granicaVina } from "../lib/granica-vina";
import { nadjiKucicu, pojaveKucice } from "../lib/prosli-tank";
import { prozoriVina } from "../lib/kronologija-vina";

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

type Pojava = { s: Sastavnica; roditelj: string; dubina: number };

/** Sve kucice POSUDE u stablu, sa svakom pojavom i dubinom. */
function kucicePosude(v: VinoCvor, dubina = 1, out: Pojava[] = []): Pojava[] {
  if (v.vrsta !== "spoj") return out;
  for (const s of v.sastavnice) {
    if (s.vino.vrsta !== "partija") out.push({ s, roditelj: v.tankId, dubina });
    kucicePosude(s.vino, dubina + 1, out);
  }
  return out;
}

const izTank = (s: Sastavnica) => (s.vino.vrsta === "partija" ? null : s.vino.tankId);
const kljuc = (s: Sastavnica) => `${izTank(s)}|${s.kljucCina}`;

/**
 * Najdublja razina do koje korisnik MORA kliknuti: za svaku kucicu najplica
 * pojava, pa najveca od tih. Ponovljeno podstablo stoji i dublje, ali do te
 * kucice se dolazi vec plicim putem — hod je posjeti jednom, ondje.
 */
function dubinaHoda(pojave: Pojava[]): number {
  const najplice = new Map<string, number>();
  for (const p of pojave) {
    const k = kljuc(p.s);
    najplice.set(k, Math.min(najplice.get(k) ?? Infinity, p.dubina));
  }
  return Math.max(0, ...najplice.values());
}

/** Sastavnica bez `udio` — vidi tocku 2 u zaglavlju. */
const bezUdjela = (s: Sastavnica) => JSON.stringify({ ...s, udio: null });

/**
 * Polja kucice koja app/prosli-tank/page.tsx cita. Ako se ovdje pojavi `udio`,
 * tocka 2 vise ne vrijedi i kucica bez korijena pokazala bi drugi broj.
 */
const KORISTENA_POLJA = ["usloAt", "litre", "vino", "progutano"];

type Knjiga = Awaited<ReturnType<typeof citajUlazneCine>>;

/**
 * Hod kakav radi korisnik: otvori kucicu po adresi bez korijena, pa svaki njezin
 * izvor. Vraca posjecene kucice, najvecu dubinu, padove i listove.
 */
function hodDoDna(knjiga: Knjiga, sorte: Map<string, string>, prvaRazina: Sastavnica[]) {
  const posjeceno = new Set<string>();
  const padovi: string[] = [];
  let dubina = 0;
  let partija = 0;
  let prekinuto = 0;

  const red: Array<{ s: Sastavnica; dubina: number }> = prvaRazina.map((s) => ({ s, dubina: 1 }));
  while (red.length > 0) {
    const { s, dubina: d } = red.shift()!;
    if (s.vino.vrsta === "partija") {
      partija++;
      continue;
    }
    const k = kljuc(s);
    if (posjeceno.has(k)) continue;

    const n = nadjiKucicu(knjiga.cini, sorte, { korijen: null, izTankId: s.vino.tankId, kljucCina: s.kljucCina });
    if (!n) {
      padovi.push(`${k} na razini ${d}`);
      continue;
    }
    posjeceno.add(k);
    dubina = Math.max(dubina, d);
    const v = n.sastavnica.vino;
    if (v.vrsta === "posuda" && v.razlog === "prekinuto") prekinuto++;
    if (v.vrsta === "spoj") for (const x of v.sastavnice) red.push({ s: x, dubina: d + 1 });
  }

  return { posjeceno, dubina, padovi, partija, prekinuto };
}

async function main() {
  const sviTankovi = await prisma.tank.findMany({ select: { id: true, broj: true }, orderBy: { broj: "asc" } });
  const broj = new Map(sviTankovi.map((t) => [t.id, t.broj]));
  const knjiga = await citajUlazneCine(prisma, sviTankovi.map((t) => t.id));
  const sorte = new Map(
    (await prisma.berba.findMany({ select: { id: true, nazivSorte: true } })).map((b) => [b.id, b.nazivSorte] as const)
  );

  // Zivi korijeni, isti kao na stranici tanka: prazan tank stabla nema.
  const korijeni = new Map<string, VinoCvor>();
  for (const t of sviTankovi) {
    const g = await granicaVina(prisma, t.id);
    if (g.razlog === "PRAZAN") continue;
    const pod = await podrijetloTanka(prisma, t.id);
    korijeni.set(t.id, vinoUTanku(knjiga.cini, sorte, t.id, Date.now(), {}, [], pod.ukupnoL));
  }

  console.log("\n1-2. Sve kucice posude u zivim stablima, s korijenom i bez njega");
  let pojava = 0;
  let drugiUdio = 0;
  const sKorijenomKrivo: string[] = [];
  const bezKorijenaKrivo: string[] = [];
  for (const [korijenId, korijen] of korijeni) {
    for (const p of kucicePosude(korijen)) {
      pojava++;
      const iz = izTank(p.s)!;
      const ocekivano = pojaveKucice(korijen, iz, p.s.kljucCina)[0];
      const opis = `T${broj.get(korijenId)}: T${broj.get(iz)} -> T${broj.get(p.roditelj)} ${p.s.kljucCina}`;

      const s = nadjiKucicu(knjiga.cini, sorte, { korijen, izTankId: iz, kljucCina: p.s.kljucCina });
      if (
        !s ||
        s.kroz !== "korijen" ||
        s.roditeljTankId !== ocekivano.roditeljTankId ||
        s.udioUKorijenu !== ocekivano.udioUKorijenu ||
        JSON.stringify(s.sastavnica) !== JSON.stringify(ocekivano.sastavnica)
      ) {
        sKorijenomKrivo.push(opis);
      }

      const b = nadjiKucicu(knjiga.cini, sorte, { korijen: null, izTankId: iz, kljucCina: p.s.kljucCina });
      if (
        !b ||
        b.kroz !== "kljuc" ||
        b.udioUKorijenu !== null ||
        b.roditeljTankId !== ocekivano.roditeljTankId ||
        bezUdjela(b.sastavnica) !== bezUdjela(ocekivano.sastavnica)
      ) {
        bezKorijenaKrivo.push(opis);
      } else if (b.sastavnica.udio !== ocekivano.sastavnica.udio) {
        drugiUdio++;
      }
    }
  }
  console.log(`  kucica posude (sve pojave): ${pojava}`);
  tvrdi(pojava > 0, "ima se sto provjeriti");
  tvrdi(sKorijenomKrivo.length === 0, "s korijenom: isti roditelj, ista sastavnica, isti udio", sKorijenomKrivo.slice(0, 5).join("; "));
  tvrdi(
    bezKorijenaKrivo.length === 0,
    "bez korijena: isti roditelj i ista sastavnica do zadnjeg lista (bez polja udio)",
    bezKorijenaKrivo.slice(0, 5).join("; ")
  );
  console.log(`  udio u roditelju drukciji bez korijena: ${drugiUdio} od ${pojava} (vidi zaglavlje, tocka 2)`);

  // Brana za tocku 2: stranica ne smije citati `kucica.udio`.
  const stranica = readFileSync(join(process.cwd(), "app", "prosli-tank", "page.tsx"), "utf8");
  const citana = [...new Set([...stranica.matchAll(/\bkucica\.(\w+)/g)].map((m) => m[1]))];
  tvrdi(
    citana.every((p) => KORISTENA_POLJA.includes(p)),
    `/prosli-tank cita samo ${KORISTENA_POLJA.join(", ")} s kucice`,
    `cita: ${citana.join(", ")}`
  );

  console.log("\n3. Korijen koji kucicu ne sadrzi");
  const t42 = sviTankovi.find((t) => t.broj === 42)!;
  const t12 = sviTankovi.find((t) => t.broj === 12)!;
  const stablo42 = korijeni.get(t42.id)!;
  const uzorak = kucicePosude(stablo42).find((p) => pojaveKucice(korijeni.get(t12.id)!, izTank(p.s)!, p.s.kljucCina).length === 0)!;
  const tudi = nadjiKucicu(knjiga.cini, sorte, {
    korijen: korijeni.get(t12.id)!,
    izTankId: izTank(uzorak.s)!,
    kljucCina: uzorak.s.kljucCina,
  });
  tvrdi(
    tudi !== null && tudi.kroz === "kljuc" && bezUdjela(tudi.sastavnica) === bezUdjela(uzorak.s),
    "kucica T42 s korijenom T12 otvara se iz kljuca, ista sastavnica"
  );

  console.log("\n4. T42 do dna, adresom bez korijena");
  const sveT42 = kucicePosude(stablo42);
  const jedinstveneT42 = new Set(sveT42.map((p) => kljuc(p.s)));
  const dubinaT42 = dubinaHoda(sveT42);
  const h = hodDoDna(knjiga, sorte, stablo42.vrsta === "spoj" ? stablo42.sastavnice : []);
  console.log(
    `  stablo: ${jedinstveneT42.size} kucica posude, najdublja pojava ${Math.max(...sveT42.map((p) => p.dubina))}, ` +
      `do svake kucice najvise ${dubinaT42} klikova; hod: posjeceno ${h.posjeceno.size}, dubina ${h.dubina}, listova berbe ${h.partija}`
  );
  tvrdi(h.padovi.length === 0, "nijedna razina ne puca", h.padovi.slice(0, 5).join("; "));
  tvrdi(h.posjeceno.size === jedinstveneT42.size, `posjecena svaka kucica (${jedinstveneT42.size})`);
  tvrdi(h.dubina === dubinaT42, `dosegnuta zadnja razina (${dubinaT42})`);
  tvrdi(h.prekinuto === 0, "nijedna prekinuta kucica");
  tvrdi(h.partija > 0, "hod zavrsava na berbi");

  console.log("\n5. Ispod snimki izlaza");
  const snimke = await prisma.snimkaVina.findMany({
    where: { izlazVinaId: { not: null } },
    select: { id: true, tankId: true, dogodenoAt: true },
    orderBy: { dogodenoAt: "asc" },
  });
  for (const sn of snimke) {
    const trenutak = new Date(sn.dogodenoAt.getTime() - 1);
    const pod = await podrijetloTanka(prisma, sn.tankId, { doTrenutka: trenutak });
    const vino = vinoUTanku(knjiga.cini, sorte, sn.tankId, trenutak.getTime(), {}, [], pod.ukupnoL);
    const { zadnjiCvor } = await prozoriVina(prisma, { tankId: sn.tankId, trenutak, doAt: sn.dogodenoAt, vino });
    const spoj = zadnjiCvor.vrsta === "spoj" && zadnjiCvor.sastavnice.length > 1 ? zadnjiCvor : null;
    const oznaka = `snimka T${broj.get(sn.tankId)} ${sn.dogodenoAt.toISOString().slice(0, 16)}`;
    if (!spoj) {
      console.log(`  ${oznaka}: nema spoja, nema se kamo ici`);
      continue;
    }
    const sve = kucicePosude(spoj);
    const jedinstvene = new Set(sve.map((p) => kljuc(p.s)));
    const dub = dubinaHoda(sve);
    const hs = hodDoDna(knjiga, sorte, spoj.sastavnice);
    tvrdi(
      hs.padovi.length === 0 && hs.posjeceno.size === jedinstvene.size && hs.dubina === dub,
      `${oznaka}: ${hs.posjeceno.size}/${jedinstvene.size} kucica, dubina ${hs.dubina}/${dub}`,
      hs.padovi.slice(0, 3).join("; ")
    );
  }

  console.log("\n6. Kriva adresa");
  const pravi = sveT42[0];
  const iz = izTank(pravi.s)!;
  const drugiTank = sviTankovi.find((t) => t.id !== iz && t.id !== pravi.roditelj)!.id;
  tvrdi(nadjiKucicu(knjiga.cini, sorte, { korijen: null, izTankId: iz, kljucCina: "nema:takvog:cina" }) === null, "nepostojeci cin -> null");
  tvrdi(nadjiKucicu(knjiga.cini, sorte, { korijen: null, izTankId: iz, kljucCina: "bezdvotocke" }) === null, "kljuc bez dijelova -> null");
  tvrdi(nadjiKucicu(knjiga.cini, sorte, { korijen: null, izTankId: drugiTank, kljucCina: pravi.s.kljucCina }) === null, "pravi cin, kriva posuda -> null");
  tvrdi(
    nadjiKucicu(knjiga.cini, sorte, { korijen: stablo42, izTankId: drugiTank, kljucCina: pravi.s.kljucCina }) === null,
    "pravi cin, kriva posuda, s korijenom -> null"
  );

  console.log(`\nproslo: ${proslo}, palo: ${palo}`);
  if (palo > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
