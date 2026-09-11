/**
 * Provjera PARAMETARA VINA IZ KNJIGE (lib/parametri-vina.ts), nad pravom bazom.
 *
 * Pokretanje:  npm run test:parametri:vina
 *
 * SIGURNOST — isti obrazac kao scripts/test-imenovanje-baza.ts:
 *   - svaki scenarij radi u vlastitoj transakciji koja NA KRAJU NAMJERNO PUKNE,
 *     pa se sve vraca unatrag; u bazi ne ostaje nijedan redak;
 *   - radi ISKLJUCIVO nad tankovima koje sam stvori, s brojevima iznad
 *     najveceg postojeceg, i s datumima iz 2020.
 *
 * STO DOKAZUJE
 *   1. Sestrinska posuda ispada: partija razdijeljena iz punjenja u dvije
 *      posude, a ovamo dosla samo iz jedne (slucaj T11 / T2 od 16.06.).
 *   2. Stvarni lanac ide i preko vise posuda (A -> B -> tank).
 *   3. Sestrinska posuda na razdvajanju pretokom (A -> B i A -> S) ispada,
 *      a zajednicki predak A ostaje.
 *   4. Vremenska brana: posuda koja je dala vino NAKON sto je predak vec
 *      pretocio ovamo nije u lancu.
 *   5. Prozor punjenja ostaje (pravilo T8 -> T15): mjerenje posude prije nego
 *      joj se partija pridruzila vrijedi za tu partiju.
 *   6. Gornja granica je odlazak: mjerenje posude nakon sto je partija otisla
 *      ne ulazi.
 *   7. Ponder je litra, pokrivenost je udio litara, arhiva mjerenja se cita,
 *      vlastito mjerenje tanka ulazi i u vrijednost i u niz za graf.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { parametriVinaIzKnjige } from "../lib/parametri-vina";

type Tx = Prisma.TransactionClient;

let pao = 0;
let proslo = 0;
let sljedeciBroj = 0;

class Rollback extends Error {}

function jednako(dobiveno: unknown, ocekivano: unknown, poruka: string) {
  if (dobiveno === ocekivano) {
    proslo++;
    return;
  }
  pao++;
  console.log(`  PAO: ${poruka}`);
  console.log(`       ocekivano: ${JSON.stringify(ocekivano)}`);
  console.log(`       dobiveno:  ${JSON.stringify(dobiveno)}`);
}

async function scenarij(naziv: string, fn: (tx: Tx) => Promise<void>) {
  console.log(naziv);
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
  } catch (e) {
    if (!(e instanceof Rollback)) {
      pao++;
      console.log(`  PAO: scenarij je pukao: ${(e as Error).message}`);
    }
  }
}

const SAT = 3_600_000;
const POCETAK = Date.parse("2020-03-02T08:00:00Z");
/** Trenutak `h` sati nakon pocetka scenarija. */
const u = (h: number) => new Date(POCETAK + h * SAT);

async function napraviTank(tx: Tx) {
  return tx.tank.create({
    data: {
      broj: sljedeciBroj++,
      kapacitet: 50000,
      kolicinaVinaUTanku: 0,
      nadzorHladjenja: false,
      smsAktivan: false,
      samokontrolaAktivna: false,
    },
  });
}

async function napraviPartiju(tx: Tx, sorta: string) {
  return tx.berba.create({
    data: { vrstaUnosa: "ZATECENO", nazivSorte: `TEST ${sorta}`, kolicinaLitara: 0 },
  });
}

/** Redak knjige. `iz = null` je ulaz u podrum. Sat knjige = `h`. */
async function kretanje(
  tx: Tx,
  berbaId: string,
  iz: string | null,
  uTank: string,
  litre: number,
  h: number
) {
  await tx.berbaKretanje.create({
    data: {
      berbaId,
      izTankId: iz,
      uTankId: uTank,
      litre,
      vrsta: iz ? "PRETOK" : "ULAZ",
      dogodenoAt: u(h),
      createdAt: u(h),
      napomena: "TEST parametri vina",
    },
  });
}

type Polja = Partial<
  Record<"alkohol" | "secer" | "ukupneKiseline" | "slobodniSO2" | "ukupniSO2" | "ph", number>
>;

async function mjeri(tx: Tx, tankId: string, h: number, polja: Polja) {
  await tx.mjerenje.create({
    data: { tankId, izmjerenoAt: u(h), jeRucno: true, ...polja },
  });
}

async function main() {
  const najveci = await prisma.tank.aggregate({ _max: { broj: true } });
  sljedeciBroj = (najveci._max.broj ?? 0) + 7000;

  // -------------------------------------------------------------------------
  await scenarij(
    "1. Sestrinska posuda iz punjenja ispada (slucaj T11 / T2)",
    async (tx) => {
      const a = await napraviTank(tx);
      const sestra = await napraviTank(tx);
      const t = await napraviTank(tx);
      const p = await napraviPartiju(tx, "Sauvignon");

      // Punjenje razdijeli partiju u A i u sestrinsku posudu.
      await kretanje(tx, p.id, null, a.id, 1500, 0);
      await kretanje(tx, p.id, null, sestra.id, 950, 0);
      await mjeri(tx, sestra.id, 1, { alkohol: 11.3, slobodniSO2: 40 });
      await mjeri(tx, a.id, 2, { secer: 87 });
      // U tank dolazi SAMO iz A.
      await kretanje(tx, p.id, a.id, t.id, 1450, 10);

      const r = await parametriVinaIzKnjige(tx, t.id);
      jednako(r?.poPolju.secer?.vrijednost, 87, "secer iz posude iz koje je vino doslo");
      jednako(r?.poPolju.secer?.izvori[0]?.brojTanka, a.broj, "secer nosi broj te posude");
      jednako(r?.poPolju.alkohol, undefined, "alkohol iz sestrinske posude NE ulazi");
      jednako(r?.poPolju.slobodniSO2, undefined, "SO2 iz sestrinske posude NE ulazi");
      jednako(r?.niz.alkohol, undefined, "graf nema tocku iz sestrinske posude");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij("2. Stvarni lanac preko vise posuda (A -> B -> tank)", async (tx) => {
    const a = await napraviTank(tx);
    const b = await napraviTank(tx);
    const t = await napraviTank(tx);
    const p = await napraviPartiju(tx, "Grasevina");

    await kretanje(tx, p.id, null, a.id, 1000, 0);
    await mjeri(tx, a.id, 1, { alkohol: 12.1 });
    await kretanje(tx, p.id, a.id, b.id, 1000, 5);
    await mjeri(tx, b.id, 6, { slobodniSO2: 30 });
    await kretanje(tx, p.id, b.id, t.id, 1000, 10);

    const r = await parametriVinaIzKnjige(tx, t.id);
    jednako(r?.poPolju.alkohol?.vrijednost, 12.1, "alkohol iz posude dvije razine unatrag");
    jednako(r?.poPolju.alkohol?.izvori[0]?.brojTanka, a.broj, "alkohol nosi broj prve posude");
    jednako(r?.poPolju.slobodniSO2?.vrijednost, 30, "SO2 iz izravne posude");
    jednako(r?.poPolju.alkohol?.postotak, 100, "pokrivenost cijelog vina");
  });

  // -------------------------------------------------------------------------
  await scenarij(
    "3. Razdvajanje pretokom: sestra ispada, zajednicki predak ostaje",
    async (tx) => {
      const a = await napraviTank(tx);
      const b = await napraviTank(tx);
      const sestra = await napraviTank(tx);
      const t = await napraviTank(tx);
      const p = await napraviPartiju(tx, "Rizling");

      await kretanje(tx, p.id, null, a.id, 1000, 0);
      await mjeri(tx, a.id, 1, { ukupniSO2: 90 });
      await kretanje(tx, p.id, a.id, b.id, 600, 2);
      await kretanje(tx, p.id, a.id, sestra.id, 400, 2);
      await mjeri(tx, sestra.id, 3, { alkohol: 8 });
      await mjeri(tx, b.id, 3, { secer: 50 });
      await kretanje(tx, p.id, b.id, t.id, 600, 6);

      const r = await parametriVinaIzKnjige(tx, t.id);
      jednako(r?.poPolju.ukupniSO2?.vrijednost, 90, "zajednicki predak A ostaje u lancu");
      jednako(r?.poPolju.secer?.vrijednost, 50, "izravna posuda B ostaje");
      jednako(r?.poPolju.alkohol, undefined, "sestra razdvojena istim pretokom ispada");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "4. Vremenska brana: dotok u pretka nakon sto je predak vec pretocio ovamo",
    async (tx) => {
      const a = await napraviTank(tx);
      const x = await napraviTank(tx);
      const t = await napraviTank(tx);
      const p = await napraviPartiju(tx, "Chardonnay");

      await kretanje(tx, p.id, null, a.id, 1000, 0);
      await kretanje(tx, p.id, null, x.id, 500, 0);
      await mjeri(tx, x.id, 1, { alkohol: 9 });
      await mjeri(tx, a.id, 1, { secer: 20 });
      await kretanje(tx, p.id, a.id, t.id, 500, 5);
      // X da vino u A tek POSLIJE — to vino u tank nije stiglo.
      await kretanje(tx, p.id, x.id, a.id, 500, 8);

      const r = await parametriVinaIzKnjige(tx, t.id);
      jednako(r?.poPolju.secer?.vrijednost, 20, "predak A ostaje");
      jednako(r?.poPolju.alkohol, undefined, "posuda koja je dala vino kasnije NE ulazi");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "5. Prozor punjenja ostaje: mjerenje prije nego se partija pridruzila",
    async (tx) => {
      const a = await napraviTank(tx);
      const t = await napraviTank(tx);
      const staro = await napraviPartiju(tx, "Staro");
      const novo = await napraviPartiju(tx, "Novo");

      await kretanje(tx, staro.id, null, a.id, 2000, 0);
      await mjeri(tx, a.id, 2, { alkohol: 11.3 });
      // Nova partija se pridruzi posudi dan kasnije — posuda nije praznjena.
      await kretanje(tx, novo.id, null, a.id, 1000, 24);
      await kretanje(tx, novo.id, a.id, t.id, 1000, 48);
      await kretanje(tx, staro.id, a.id, t.id, 500, 48);

      const r = await parametriVinaIzKnjige(tx, t.id);
      jednako(r?.poPolju.alkohol?.vrijednost, 11.3, "mjerenje posude vrijedi za obje partije");
      jednako(r?.poPolju.alkohol?.pokrivenoL, 1500, "pokrivene su i nova i stara partija");
      jednako(r?.poPolju.alkohol?.postotak, 100, "pokrivenost 100 %");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "6. Gornja granica je odlazak iz posude",
    async (tx) => {
      const a = await napraviTank(tx);
      const t = await napraviTank(tx);
      const p = await napraviPartiju(tx, "Muskat");

      await kretanje(tx, p.id, null, a.id, 1000, 0);
      await mjeri(tx, a.id, 1, { ph: 3.2 });
      await kretanje(tx, p.id, a.id, t.id, 600, 5);
      // Ostatak u A mjeri se poslije — to vise nije ovo vino.
      await mjeri(tx, a.id, 7, { ph: 3.5 });

      const r = await parametriVinaIzKnjige(tx, t.id);
      jednako(r?.poPolju.ph?.vrijednost, 3.2, "vrijednost prije odlaska, ne poslije");
      jednako(r?.niz.ph?.length, 1, "graf ima samo tocku prije odlaska");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "7. Ponder po litrama, pokrivenost, arhiva, vlastito mjerenje",
    async (tx) => {
      const a = await napraviTank(tx);
      const b = await napraviTank(tx);
      const c = await napraviTank(tx);
      const t = await napraviTank(tx);
      const p1 = await napraviPartiju(tx, "Jedan");
      const p2 = await napraviPartiju(tx, "Dva");
      const p3 = await napraviPartiju(tx, "Tri");

      await kretanje(tx, p1.id, null, a.id, 3000, 0);
      await kretanje(tx, p2.id, null, b.id, 1000, 0);
      await kretanje(tx, p3.id, null, c.id, 1000, 0);
      await mjeri(tx, a.id, 1, { alkohol: 12 });

      // Mjerenje posude B zivi samo u arhivi.
      const arhiva = await tx.arhivaVina.create({
        data: { tankId: b.id, brojTanka: b.broj, kolicinaVina: 1000, tipArhive: "TEST" },
      });
      await tx.arhivaVinaMjerenje.create({
        data: { arhivaVinaId: arhiva.id, tankId: b.id, izmjerenoAt: u(1), alkohol: 10 },
      });

      await kretanje(tx, p1.id, a.id, t.id, 3000, 5);
      await kretanje(tx, p2.id, b.id, t.id, 1000, 5);
      await kretanje(tx, p3.id, c.id, t.id, 1000, 5);
      await mjeri(tx, t.id, 6, { secer: 5 });

      const r = await parametriVinaIzKnjige(tx, t.id);
      jednako(r?.poPolju.alkohol?.vrijednost, 11.5, "prosjek ponderiran litrama (12x3000 + 10x1000)");
      jednako(r?.poPolju.alkohol?.pokrivenoL, 4000, "pokriveno 4000 L");
      jednako(r?.poPolju.alkohol?.ukupnoL, 5000, "ukupno 5000 L");
      jednako(r?.poPolju.alkohol?.postotak, 80, "pokrivenost 80 %");
      jednako(
        r?.poPolju.alkohol?.izvori.some((x) => x.izArhive && x.brojTanka === b.broj),
        true,
        "arhivsko mjerenje posude B je medju izvorima"
      );
      jednako(r?.poPolju.secer?.izvori[0]?.brojTanka, t.broj, "vlastito mjerenje tanka ulazi");
      jednako(r?.niz.secer?.[0]?.vlastito, true, "vlastita tocka na grafu je oznacena kao vlastita");
    }
  );

  // -------------------------------------------------------------------------
  console.log("");
  console.log(`proslo: ${proslo}, palo: ${pao}`);

  if (pao > 0) process.exitCode = 1;
  else
    console.log(
      "Sve transakcije su namjerno vracene unatrag — u bazi nije ostao nijedan redak."
    );

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
