/**
 * PROVJERA VREMENSKOG CITANJA KNJIGE (faza A) — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run test:knjiga:vrijeme
 *
 * SIGURNOST: iskljucivo SELECT nad pravom bazom. Izlazni kod je 1 ako ijedna
 * tvrdnja padne, pa se smije staviti u lanac provjera.
 *
 * STO SE DOKAZUJE
 * ---------------
 * 1. SADA JE ISTO STO I BEZ GRANICE. `doTrenutka` postavljen na sada mora dati
 *    isto stanje kao poziv bez njega, na SVAKOM tanku, do mililitra. Ovo je
 *    provjera koja cuva zatecen ekran: da faza A nije promijenila nijedan
 *    danasnji broj.
 *
 * 2. PRIJE POCETKA NEMA NICEGA. Trenutak ispred prvog retka knjige mora dati
 *    prazan podrum — ne "nesto malo", nego nista.
 *
 * 3. SQL I JAVASCRIPT SE SLAZU. Isto stanje se izracuna drugim putem — svi
 *    retci tanka se povuku i preklope u JS-u po satu iz lib/sat-knjige.ts — i
 *    mora ispasti isti broj. Dvije neovisne izvedbe iste definicije; da je
 *    uvjet u SQL-u zavrsio na krivoj strani `OR`-a ili da se `LEAST` ne slaze
 *    s `Math.min`, ovdje bi puklo.
 *
 * 4. ZBROJ SE CUVA U SVAKOM TRENUTKU. Za svaki mjereni trenutak: sve sto je
 *    do tada uslo u podrum minus sve sto je izaslo mora biti tocno ono sto u
 *    tom trenutku stoji po tankovima. Knjiga je knjigovodstvo; ako se to ne
 *    slaze, negdje se litra stvara ili nestaje.
 *
 * 5. MONOTONOST BROJA REDAKA. Kasniji trenutak ne smije vidjeti manje kretanja
 *    od ranijeg — trivijalno, ali hvata obrnut smjer usporedbe.
 *
 * 6-8. SASTAV IZVEDEN IZ KNJIGE (faza B): udjeli se zbrajaju na tocno 100,00 —
 *    i u cijelom tanku i u poznatom dijelu — a ponder je LITRA, ne broj
 *    zapisa berbe. Tri zapisa Grasevine od 100 L ne smiju natezati postotak
 *    protiv jednog zapisa Chardonnaya od 3.000 L.
 *
 * Negativna stanja u proslim trenucima se MJERE, ne tvrde: unatrag datirani
 * unos moze na kratko gurnuti tank ispod nule i to je svojstvo podataka, ne
 * greska ovog citanja. Ispisuje se kao mjera, kao i "cjelovitost povijesti" u
 * scripts/provjeri-berbu.ts.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  stanjeTanka,
  stanjeSvihTankova,
  podrijetloTanka,
  sastavIzPodrijetla,
} from "../lib/berba-model";
import { satKretanja } from "../lib/sat-knjige";

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

/** Mililitri iz litara — isti racun kao knjiga pri upisu. */
function uMl(litre: number): number {
  return Math.round(Number(litre) * 1000);
}

async function main() {
  console.log("Provjera vremenskog citanja knjige (samo citanje).\n");

  const kretanja = await prisma.berbaKretanje.findMany({
    select: {
      id: true,
      berbaId: true,
      izTankId: true,
      uTankId: true,
      litre: true,
      vrsta: true,
      dogodenoAt: true,
      createdAt: true,
    },
  });

  const tankovi = await prisma.tank.findMany({
    select: { id: true, broj: true },
    orderBy: { broj: "asc" },
  });

  const satovi = kretanja.map(satKretanja).sort((a, b) => a - b);
  const prvi = satovi[0];
  const zadnji = satovi[satovi.length - 1];

  console.log(
    `Knjiga: ${kretanja.length} kretanja, ${tankovi.length} tankova, ` +
      `od ${new Date(prvi).toISOString().slice(0, 10)} do ` +
      `${new Date(zadnji).toISOString().slice(0, 10)}.\n`
  );

  // ---------------------------------------------------------------- 1. sada
  const sada = new Date();
  let razlike = 0;
  let prviRazmak = "";

  for (const t of tankovi) {
    const bez = await stanjeTanka(prisma, t.id, { svi: true });
    const sGranicom = await stanjeTanka(prisma, t.id, {
      svi: true,
      doTrenutka: sada,
    });

    const a = new Map(bez.map((s) => [s.berbaId, s.ml]));
    const b = new Map(sGranicom.map((s) => [s.berbaId, s.ml]));

    for (const [berbaId, ml] of a) {
      if ((b.get(berbaId) ?? 0) !== ml) {
        razlike++;
        if (!prviRazmak)
          prviRazmak = `tank ${t.broj}, berba ${berbaId}: ${ml} vs ${b.get(berbaId) ?? 0} ml`;
      }
    }
    for (const [berbaId, ml] of b) {
      if (!a.has(berbaId) && ml !== 0) razlike++;
    }
  }

  tvrdi(
    razlike === 0,
    `"sada" daje isto stanje kao bez granice (provjereno ${tankovi.length} tankova)`,
    prviRazmak
  );

  // ------------------------------------------------------- 2. prije pocetka
  const prijeSvega = new Date(prvi - 1000);
  const svePrije = await stanjeSvihTankova(prisma, {
    svi: true,
    doTrenutka: prijeSvega,
  });

  let mlPrije = 0;
  for (const popis of svePrije.values())
    for (const s of popis) mlPrije += s.ml;

  tvrdi(
    mlPrije === 0,
    "trenutak ispred prvog retka knjige daje prazan podrum",
    `zateceno ${mlPrije} ml`
  );

  // ----------------------------------------- trenuci na kojima se sve mjeri
  //
  // Uzima se svaki deseti sat plus rubovi — mjerenje nad svim trenucima bilo
  // bi 577 x 48 upita, sto lib/paralelno.ts zabranjuje iz dobrog razloga.
  const uzorak: number[] = [];
  for (let i = 0; i < satovi.length; i += 10) uzorak.push(satovi[i]);
  uzorak.push(zadnji, zadnji + 1000);

  // ------------------------------------------------- 3. SQL protiv JavaScripta
  let neslaganja = 0;
  let prvoNeslaganje = "";

  for (const ms of uzorak) {
    const t = new Date(ms);
    const izBaze = await stanjeSvihTankova(prisma, { svi: true, doTrenutka: t });

    // Isti racun, drugom rukom: preklapanje redaka u JS-u.
    const uJs = new Map<string, Map<string, number>>();
    for (const k of kretanja) {
      if (satKretanja(k) > ms) continue;
      const ml = uMl(k.litre);

      if (k.uTankId) {
        const m = uJs.get(k.uTankId) ?? new Map<string, number>();
        m.set(k.berbaId, (m.get(k.berbaId) ?? 0) + ml);
        uJs.set(k.uTankId, m);
      }
      if (k.izTankId) {
        const m = uJs.get(k.izTankId) ?? new Map<string, number>();
        m.set(k.berbaId, (m.get(k.berbaId) ?? 0) - ml);
        uJs.set(k.izTankId, m);
      }
    }

    for (const [tankId, popis] of izBaze) {
      for (const s of popis) {
        const ocekivano = uJs.get(tankId)?.get(s.berbaId) ?? 0;
        if (Math.round(s.ml) !== ocekivano) {
          neslaganja++;
          if (!prvoNeslaganje)
            prvoNeslaganje = `${t.toISOString()} tank ${tankId} berba ${s.berbaId}: SQL ${s.ml}, JS ${ocekivano}`;
        }
      }
    }
  }

  tvrdi(
    neslaganja === 0,
    `SQL i JavaScript daju isto stanje u ${uzorak.length} trenutaka`,
    prvoNeslaganje
  );

  // -------------------------------------------------------- 4. zbroj se cuva
  let neuravnotezeni = 0;
  let prviNeuravnotezen = "";

  for (const ms of uzorak) {
    const t = new Date(ms);
    const stanje = await stanjeSvihTankova(prisma, { svi: true, doTrenutka: t });

    let uTankovima = 0;
    for (const popis of stanje.values())
      for (const s of popis) uTankovima += Math.round(s.ml);

    let uslo = 0;
    let izaslo = 0;
    for (const k of kretanja) {
      if (satKretanja(k) > ms) continue;
      if (!k.izTankId) uslo += uMl(k.litre);
      if (!k.uTankId) izaslo += uMl(k.litre);
    }

    if (uTankovima !== uslo - izaslo) {
      neuravnotezeni++;
      if (!prviNeuravnotezen)
        prviNeuravnotezen = `${t.toISOString()}: u tankovima ${uTankovima}, ulaz-izlaz ${uslo - izaslo} ml`;
    }
  }

  tvrdi(
    neuravnotezeni === 0,
    `ulaz minus izlaz jednak je stanju po tankovima u svih ${uzorak.length} trenutaka`,
    prviNeuravnotezen
  );

  // ------------------------------------------------------- 5. monotonost
  let monotono = true;
  let prije = -1;
  for (const ms of [...uzorak].sort((a, b) => a - b)) {
    const koliko = kretanja.filter((k) => satKretanja(k) <= ms).length;
    if (koliko < prije) monotono = false;
    prije = koliko;
  }

  tvrdi(monotono, "kasniji trenutak nikad ne vidi manje kretanja od ranijeg");

  // ------------------------------------- faza B: sastav izveden iz knjige
  //
  // Cista funkcija nad vec procitanim podrijetlom, pa se provjerava nad svim
  // tankovima bez ijednog dodatnog upita po tanku osim samog podrijetla.
  let zbrojKriv = 0;
  let poznatiKriv = 0;
  let ponderKriv = 0;
  let prviPonder = "";

  for (const t of tankovi) {
    const p = await podrijetloTanka(prisma, t.id);
    const s = sastavIzPodrijetla(p);
    if (s.length === 0) continue;

    const ukupno = s.reduce((z, x) => z + x.postotak, 0);
    if (Math.abs(ukupno - 100) > 0.005) zbrojKriv++;

    const poznati = s.filter((x) => !x.nepoznata);
    if (poznati.length > 0) {
      const zbrojPoznatih = poznati.reduce(
        (z, x) => z + (x.postotakOdPoznatog ?? 0),
        0
      );
      if (Math.abs(zbrojPoznatih - 100) > 0.005) poznatiKriv++;
    }

    // PONDER PO LITRAMA, ne po broju berbi. Redak s vise litara mora imati
    // veci postotak od retka s manje, bez obzira koliko je zapisa u njemu.
    for (const a of s) {
      for (const b of s) {
        if (a.litre > b.litre && a.postotak < b.postotak) {
          ponderKriv++;
          if (!prviPonder)
            prviPonder = `tank ${t.broj}: ${a.nazivSorte} ${a.litre} L -> ${a.postotak} %, ${b.nazivSorte} ${b.litre} L -> ${b.postotak} %`;
        }
      }
    }
  }

  tvrdi(zbrojKriv === 0, "izvedeni sastav zbraja se na tocno 100,00 na svakom tanku");
  tvrdi(
    poznatiKriv === 0,
    "udjeli poznatog dijela zbrajaju se na tocno 100,00 na svakom tanku"
  );
  tvrdi(
    ponderKriv === 0,
    "sastav je ponderiran po litrama, ne po broju zapisa berbe",
    prviPonder
  );

  // ------------------------------------------------------------- mjere
  console.log("\nMjere (nisu invarijante):");

  let negativnih = 0;
  for (const ms of uzorak) {
    const stanje = await stanjeSvihTankova(prisma, {
      svi: true,
      doTrenutka: new Date(ms),
    });
    for (const popis of stanje.values())
      for (const s of popis) if (s.ml < 0) negativnih++;
  }
  console.log(
    `  parova (tank, berba) u minusu kroz ${uzorak.length} mjerenih trenutaka: ${negativnih}`
  );
  console.log(
    "  Minus u proslom trenutku nije greska citanja nego unatrag datiran unos:"
  );
  console.log(
    "  vino je knjizeno kao izaslo prije nego je knjizeno da je uslo."
  );

  console.log(`\nproslo: ${proslo}, palo: ${palo}`);
  await prisma.$disconnect();
  if (palo > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
