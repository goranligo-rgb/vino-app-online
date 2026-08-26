/**
 * Provjera KNJIGE BERBE (lib/berba-knjiga.ts + lib/berba-model.ts).
 *
 * Pokretanje:  npm run test:berba:knjiga
 *
 * SIGURNOST — procitaj prije pokretanja:
 *   - svaki scenarij radi u vlastitoj transakciji koja NA KRAJU NAMJERNO PUKNE,
 *     pa se sve vraca unatrag; u bazi ne ostaje nijedan redak;
 *   - radi ISKLJUCIVO nad tankovima koje sam stvori, s brojevima iznad
 *     najveceg postojeceg. Nijedan pravi tank se ne cita ni ne mijenja — knjiga
 *     pogadja samo `tankId` koji joj se preda;
 *   - `Berba` i `BerbaKretanje` nemaju strani kljuc na `Tank`, pa se ne dira ni
 *     jedan zatecen redak.
 * Zato ga je sigurno pokrenuti i tijekom berbe. Isti obrazac kao
 * scripts/test-arhiviranje-baza.ts.
 *
 * Prvi dio (cisti racun) ne dira bazu uopce — `raspodijeliMatricu` i
 * `razdijeliIzlaz` su ciste funkcije i provjeravaju se bez ijedne veze.
 *
 * STO SE DOKAZUJE
 *   1. razmjerna raspodjela ide po SVIM berbama u tanku, ne po jednoj;
 *   2. zbroj po CILJU je tocan (to je rub koji se poslije usporedjuje s
 *      `Tank.kolicinaVinaUTanku`) i zbroj po BERBI je tocan (to je rub koji ne
 *      smije pustiti berbu u minus);
 *   3. kroz lanac pretoka se ne gubi ni mililitar, koliko god zaokruzivanje
 *      bilo nezgodno;
 *   4. iz tanka ne moze izaci vise nego sto knjiga u njemu ima — PUCA, ne
 *      upisuje minus;
 *   5. ponistenje vraca stanje TOCNO na staro i ne moze se izvesti dvaput.
 */

import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { uLitre, uMl } from "../lib/filtracija";
import {
  BerbaGreska,
  planPrijenosa,
  raspodijeliMatricu,
  razdijeliIzlaz,
  zabiljeziIzlaz,
  zabiljeziPonistenje,
  zabiljeziPrijenos,
  zabiljeziUlaz,
  type Tx,
} from "../lib/berba-knjiga";
import { litreUTanku, podrijetloTanka, stanjeTanka } from "../lib/berba-model";

let pao = 0;
let proslo = 0;

function jednako(dobiveno: unknown, ocekivano: unknown, poruka: string) {
  const d = JSON.stringify(dobiveno);
  const o = JSON.stringify(ocekivano);
  if (d === o) {
    proslo++;
    return;
  }
  pao++;
  console.log(`  PAO: ${poruka}`);
  console.log(`       ocekivano: ${o}`);
  console.log(`       dobiveno:  ${d}`);
}

function tvrdi(uvjet: boolean, poruka: string) {
  jednako(uvjet, true, poruka);
}

/** Baca se na kraju svakog scenarija da transakcija padne i sve se vrati. */
class Rollback extends Error {}

async function scenarij(naziv: string, fn: (tx: Tx) => Promise<void>) {
  console.log(naziv);
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 60_000, maxWait: 15_000 }
    );
  } catch (e) {
    if (!(e instanceof Rollback)) {
      pao++;
      console.log(`  PAO: scenarij je pukao: ${(e as Error).message}`);
    }
  }
}

/** Uhvati gresku i vrati je, ili null ako greske nije bilo. */
async function uhvati(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

/** Poruka greske, ili null. Za tvrdnje kojima je vazan tekst, ne tip. */
async function pukne(fn: () => Promise<unknown>): Promise<string | null> {
  const e = await uhvati(fn);
  if (e == null) return null;
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Sintetski tankovi
// ---------------------------------------------------------------------------

let sljedeciBroj = 0;

async function napraviTank(tx: Tx, litre: number) {
  return tx.tank.create({
    data: {
      broj: sljedeciBroj++,
      kapacitet: Math.max(litre * 2, 1000),
      kolicinaVinaUTanku: litre,
      nazivVina: "TEST knjiga berbe",
      sorta: "TEST",
      tip: "INOX",
      // Sintetski tank nema kontroler; bez ovoga bi ga gateway pokusao
      // prozivati i samokontrola bi ga prijavljivala.
      nadzorHladjenja: false,
      smsAktivan: false,
      samokontrolaAktivna: false,
    },
    select: { id: true, broj: true },
  });
}

let rbrBerbe = 0;

async function ulaz(tx: Tx, tankId: string, litre: number, sorta = "Grasevina", datumBerbe: Date | null = null) {
  const r = await zabiljeziUlaz(tx, {
    tankId,
    litre,
    nazivSorte: sorta,
    datumBerbe,
    veza: { punjenjeId: `test-punjenje-${rbrBerbe++}` },
  });
  return r.berbaId;
}

/** Stanje tanka kao {berbaId -> litre}, radi citljivih tvrdnji. */
async function stanjePoBerbi(tx: Tx, tankId: string) {
  const stanje = await stanjeTanka(tx, tankId);
  const mapa: Record<string, number> = {};
  for (const s of stanje) mapa[s.berbaId] = s.litre;
  return mapa;
}

// ---------------------------------------------------------------------------

async function main() {
  const najveci = await prisma.tank.aggregate({ _max: { broj: true } });
  sljedeciBroj = (najveci._max.broj ?? 0) + 1000;

  console.log(
    `Sintetski tankovi dobivaju brojeve od ${sljedeciBroj} (najveci pravi je ${najveci._max.broj}).\n`
  );

  // =========================================================================
  // DIO 1 — cisti racun, bez baze
  // =========================================================================

  console.log("1. Raspodjela s dva ruba (bez baze)");

  {
    // Tri berbe po 1.000.000 ml u tri cilja po 1.000.000 ml.
    // Naivna izvedba (redak po redak, svaki sam po stupcima) ovdje daje
    // stupce 1.000.002 / 999.999 / 999.999. Mora dati tocno.
    const m = raspodijeliMatricu([1_000_000, 1_000_000, 1_000_000], [1_000_000, 1_000_000, 1_000_000]);

    const poStupcu = [0, 1, 2].map((j) => m[0][j] + m[1][j] + m[2][j]);
    const poRetku = m.map((r) => r.reduce((z, x) => z + x, 0));

    jednako(poStupcu, [1_000_000, 1_000_000, 1_000_000], "tri trecine: zbroj po cilju je tocan");
    jednako(poRetku, [1_000_000, 1_000_000, 1_000_000], "tri trecine: zbroj po berbi je tocan");
  }

  {
    // Zrcalni slucaj koji obrnut redoslijed (prvo stupci, pa redci) razbija:
    // tri berbe po 1 ml u tri cilja po 1 ml. Nijedna berba ne smije dati vise
    // nego sto ima.
    const m = raspodijeliMatricu([1, 1, 1], [1, 1, 1]);
    const poRetku = m.map((r) => r.reduce((z, x) => z + x, 0));
    const poStupcu = [0, 1, 2].map((j) => m[0][j] + m[1][j] + m[2][j]);

    jednako(poRetku, [1, 1, 1], "1 ml po berbi: nijedna berba ne daje vise nego ima");
    jednako(poStupcu, [1, 1, 1], "1 ml po cilju: svaki cilj dobije tocno svoje");
  }

  {
    // Nezgodne brojke, sedam berbi u pet ciljeva. Rubovi moraju stati tocno.
    const redci = [70_001, 13, 999_999, 4, 250_500, 1, 33_333];
    const ukupno = redci.reduce((z, x) => z + x, 0);
    const stupci = [ukupno - 4 - 7 - 111_111 - 1, 4, 7, 111_111, 1];

    const m = raspodijeliMatricu(redci, stupci);

    jednako(
      m.map((r) => r.reduce((z, x) => z + x, 0)),
      redci,
      "sedam berbi u pet ciljeva: zbrojevi redaka tocni"
    );
    jednako(
      stupci.map((_, j) => m.reduce((z, r) => z + r[j], 0)),
      stupci,
      "sedam berbi u pet ciljeva: zbrojevi stupaca tocni"
    );
    tvrdi(
      m.every((r) => r.every((x) => x >= 0)),
      "sedam berbi u pet ciljeva: nijedno polje nije negativno"
    );
  }

  {
    // razdijeliIzlaz: iz tanka s dvije berbe izlazi manje nego sto ima.
    const dijelovi = razdijeliIzlaz(
      [
        { berbaId: "A", ml: 3_000_000 },
        { berbaId: "B", ml: 1_000_000 },
      ],
      2_000_000,
      [1_500_000, 500_000]
    );

    const poBerbi: Record<string, number> = {};
    const poOdredistu = [0, 0];

    for (const d of dijelovi) {
      poBerbi[d.berbaId] = (poBerbi[d.berbaId] ?? 0) + d.ml;
      poOdredistu[d.odrediste] += d.ml;
    }

    jednako(poBerbi, { A: 1_500_000, B: 500_000 }, "3:1 u tanku -> 3:1 i u onome sto izlazi");
    jednako(poOdredistu, [1_500_000, 500_000], "ciljevi dobiju tocno svoje kolicine");
  }

  {
    // planPrijenosa: dva izvora u tri cilja.
    const m = planPrijenosa([1000, 2000], [500, 1500, 1000]);
    jednako(
      m.map((r) => r.reduce((z, x) => z + x, 0)),
      [1000, 2000],
      "dva izvora: iz svakog izadje tocno njegovo"
    );
    jednako(
      [0, 1, 2].map((j) => m[0][j] + m[1][j]),
      [500, 1500, 1000],
      "dva izvora: u svaki cilj udje tocno njegovo"
    );
  }

  // =========================================================================
  // DIO 2 — nad bazom, sve u transakcijama koje se vracaju
  // =========================================================================

  await scenarij("\n2. Ulaz: nastaje berba i prvi redak knjige", async (tx) => {
    const t = await napraviTank(tx, 5200);
    const berbaId = await ulaz(tx, t.id, 5200, "Chardonnay", new Date("2026-08-21T00:00:00Z"));

    jednako(await litreUTanku(tx, t.id), 5200, "u tanku je tocno onoliko koliko je uslo");

    const p = await podrijetloTanka(tx, t.id);
    jednako(p.stavke.length, 1, "jedan zapis podrijetla");
    jednako(p.stavke[0].berbaId, berbaId, "i to bas ta berba");
    jednako(p.stavke[0].postotak, 100, "sama u tanku -> 100 %");
    jednako(p.razlikaOdTankaL, 0, "knjiga se slaze s kolicinom u tanku");

    const berba = await tx.berba.findUniqueOrThrow({ where: { id: berbaId } });
    jednako(Number(berba.kolicinaLitara), 5200, "na zapisu berbe stoji ista kolicina");
    jednako(berba.prviTankId, t.id, "prviTankId je tank u koji je vino uslo");
    jednako(berba.vrstaUnosa, "BERBA", "s datumom berbe -> vrsta BERBA");
  });

  await scenarij("\n3. Pretok u cetiri tanka, dvije berbe u izvoru", async (tx) => {
    // Oblik pretoka od 25.08.2026: T7 10.450 L -> 4.800 / 3.700 / 1.400 / 550.
    // Ovdje izvor drzi DVIJE berbe, da se razmjerna raspodjela vidi.
    const izvor = await napraviTank(tx, 10450);
    const c1 = await napraviTank(tx, 0);
    const c2 = await napraviTank(tx, 0);
    const c3 = await napraviTank(tx, 0);
    const c4 = await napraviTank(tx, 0);

    const a = await ulaz(tx, izvor.id, 7000, "Veltlinac zeleni");
    const b = await ulaz(tx, izvor.id, 3450, "Grasevina");

    await zabiljeziPrijenos(tx, {
      izvori: [{ tankId: izvor.id, litre: 10450 }],
      ciljevi: [
        { tankId: c1.id, litre: 4800 },
        { tankId: c2.id, litre: 3700 },
        { tankId: c3.id, litre: 1400 },
        { tankId: c4.id, litre: 550 },
      ],
      vrsta: "PRETOK",
      veza: { pretokId: "test-pretok-4" },
    });

    jednako(await litreUTanku(tx, izvor.id), 0, "izvor je prazan");
    jednako(await litreUTanku(tx, c1.id), 4800, "cilj 1 dobio tocno 4800 L");
    jednako(await litreUTanku(tx, c2.id), 3700, "cilj 2 dobio tocno 3700 L");
    jednako(await litreUTanku(tx, c3.id), 1400, "cilj 3 dobio tocno 1400 L");
    jednako(await litreUTanku(tx, c4.id), 550, "cilj 4 dobio tocno 550 L");

    // Omjer u izvoru je 7000:3450. Svaki cilj mora imati taj isti omjer.
    const u1 = await stanjePoBerbi(tx, c1.id);
    jednako(u1[a], 3215.311, "cilj 1: veltlinac 4800 * 7000/10450");
    jednako(u1[b], 1584.689, "cilj 1: grasevina 4800 * 3450/10450");
    jednako(Number((u1[a] + u1[b]).toFixed(3)), 4800, "cilj 1: dvije berbe daju tocno 4800 L");

    const u4 = await stanjePoBerbi(tx, c4.id);
    jednako(Number((u4[a] + u4[b]).toFixed(3)), 550, "cilj 4: dvije berbe daju tocno 550 L");

    // Svaka berba u cjelini: koliko je uslo, toliko je i razaslano.
    const svi = [c1.id, c2.id, c3.id, c4.id];
    let ukupnoA = 0;
    let ukupnoB = 0;

    for (const id of svi) {
      const s = await stanjePoBerbi(tx, id);
      ukupnoA += uMl(s[a] ?? 0);
      ukupnoB += uMl(s[b] ?? 0);
    }

    jednako(uLitre(ukupnoA), 7000, "veltlinac: svih 7000 L je stiglo negdje");
    jednako(uLitre(ukupnoB), 3450, "grasevina: svih 3450 L je stiglo negdje");

    // I podrijetlo cilja 1 mora zbrajati 100,00 %.
    const p1 = await podrijetloTanka(tx, c1.id);
    jednako(
      Number(p1.stavke.reduce((z, s) => z + s.postotak, 0).toFixed(2)),
      100,
      "cilj 1: postotci podrijetla zbrajaju tocno 100,00"
    );

    // Knjiga NE PISE po `Tank` — to ostaje posao pretoka. Dok se tank ne
    // osvjezi, `razlikaOdTankaL` to i kaze; kad se osvjezi, razlika je nula.
    // Ta dva koraka su ovdje razdvojena namjerno, jer je upravo ta razlika ono
    // sto `scripts/provjeri-berbu.ts` poslije provjerava.
    jednako(p1.razlikaOdTankaL, -4800, "prije osvjezenja tanka razlika se VIDI");

    await tx.tank.update({ where: { id: c1.id }, data: { kolicinaVinaUTanku: 4800 } });
    await tx.tank.update({ where: { id: izvor.id }, data: { kolicinaVinaUTanku: 0 } });

    jednako((await podrijetloTanka(tx, c1.id)).razlikaOdTankaL, 0, "cilj 1: knjiga se slaze s tankom");
    jednako((await podrijetloTanka(tx, izvor.id)).razlikaOdTankaL, 0, "izvor: prazan i u knjizi i u tanku");
  });

  await scenarij("\n4. Kalo: iz tanka izadje vise nego u ciljeve udje", async (tx) => {
    const izvor = await napraviTank(tx, 1000);
    const cilj = await napraviTank(tx, 0);

    const b = await ulaz(tx, izvor.id, 1000);

    const r = await zabiljeziPrijenos(tx, {
      izvori: [{ tankId: izvor.id, litre: 1000 }],
      ciljevi: [{ tankId: cilj.id, litre: 940 }],
      vrsta: "FILTRACIJA",
      veza: { zadatakId: "test-zadatak-kalo" },
    });

    jednako(uLitre(r.kaloMl), 60, "kalo je razlika izlaza i ulaza");
    jednako(await litreUTanku(tx, izvor.id), 0, "izvor je prazan");
    jednako(await litreUTanku(tx, cilj.id), 940, "u cilj je uslo 940 L");

    // Kalo mora imati SVOJ redak, inace bi knjiga tvrdila da je jos u izvoru.
    const kaloRedci = await tx.berbaKretanje.findMany({
      where: { zadatakId: "test-zadatak-kalo", uTankId: null },
    });

    jednako(kaloRedci.length, 1, "kalo je zapisano kao jedan redak bez odredista");
    jednako(Number(kaloRedci[0].litre), 60, "i to na 60 L");
    jednako(kaloRedci[0].berbaId, b, "kalo je pripisano berbi koja je bila u tanku");
  });

  await scenarij("\n5. Lanac pretoka: kroz deset koraka ne nestaje ni mililitar", async (tx) => {
    // Cetiri tanka u krug. Svaki krug: izvor -> dva susjeda (1:2), pa ta dva
    // natrag u treceg. Tankovi se rotiraju za tri, pa izvor nikad nije ujedno
    // i cilj.
    const t = [
      await napraviTank(tx, 1000),
      await napraviTank(tx, 0),
      await napraviTank(tx, 0),
      await napraviTank(tx, 0),
    ];

    // Tri berbe, namjerno nesvodive na okrugle omjere.
    const b1 = await ulaz(tx, t[0].id, 333.333, "Sorta 1");
    const b2 = await ulaz(tx, t[0].id, 333.333, "Sorta 2");
    const b3 = await ulaz(tx, t[0].id, 333.334, "Sorta 3");

    jednako(await litreUTanku(tx, t[0].id), 1000, "pocetnih 1000 L");

    let k = 0;

    for (let i = 0; i < 10; i++) {
      const izvor = t[k].id;
      const prvi = t[(k + 1) % 4].id;
      const drugi = t[(k + 2) % 4].id;
      const skup = t[(k + 3) % 4].id;

      const uIzvoru = await litreUTanku(tx, izvor);
      const prviDio = Number((uIzvoru / 3).toFixed(3));
      const drugiDio = Number((uIzvoru - prviDio).toFixed(3));

      await zabiljeziPrijenos(tx, {
        izvori: [{ tankId: izvor, litre: uIzvoru }],
        ciljevi: [
          { tankId: prvi, litre: prviDio },
          { tankId: drugi, litre: drugiDio },
        ],
        vrsta: "PRETOK",
        veza: { pretokId: `test-lanac-${i}` },
      });

      // Dva izvora natrag u jedan — druga strana raspodjele.
      const uPrvom = await litreUTanku(tx, prvi);
      const uDrugom = await litreUTanku(tx, drugi);

      await zabiljeziPrijenos(tx, {
        izvori: [
          { tankId: prvi, litre: uPrvom },
          { tankId: drugi, litre: uDrugom },
        ],
        ciljevi: [{ tankId: skup, litre: Number((uPrvom + uDrugom).toFixed(3)) }],
        vrsta: "PRETOK",
        veza: { pretokId: `test-lanac-natrag-${i}` },
      });

      k = (k + 3) % 4;
    }

    const zadnji = t[k].id;

    const ukupno = uLitre(
      uMl(await litreUTanku(tx, t[0].id)) +
        uMl(await litreUTanku(tx, t[1].id)) +
        uMl(await litreUTanku(tx, t[2].id)) +
        uMl(await litreUTanku(tx, t[3].id))
    );

    jednako(ukupno, 1000, "nakon 20 pretoka u sva cetiri tanka je i dalje tocno 1000 L");
    jednako(await litreUTanku(tx, zadnji), 1000, "i sve je zavrsilo u zadnjem tanku");

    const zavrsno = await stanjePoBerbi(tx, zadnji);
    jednako(
      Number(((zavrsno[b1] ?? 0) + (zavrsno[b2] ?? 0) + (zavrsno[b3] ?? 0)).toFixed(3)),
      1000,
      "tri berbe i dalje zajedno daju 1000 L"
    );
    tvrdi(
      (zavrsno[b1] ?? 0) > 300 && (zavrsno[b2] ?? 0) > 300 && (zavrsno[b3] ?? 0) > 300,
      "nijedna berba nije nestala kroz zaokruzivanje"
    );
  });

  await scenarij("\n6. Izlaz vina: razmjerno, i tank pada", async (tx) => {
    const t = await napraviTank(tx, 1000);
    const a = await ulaz(tx, t.id, 750, "Grasevina");
    const b = await ulaz(tx, t.id, 250, "Sauvignon");

    await zabiljeziIzlaz(tx, {
      tankId: t.id,
      litre: 400,
      veza: { izlazVinaId: "test-izlaz-1" },
    });

    jednako(await litreUTanku(tx, t.id), 600, "u tanku je ostalo 600 L");

    const s = await stanjePoBerbi(tx, t.id);
    jednako(s[a], 450, "grasevina: 750 - 300");
    jednako(s[b], 150, "sauvignon: 250 - 100");

    const redci = await tx.berbaKretanje.findMany({ where: { izlazVinaId: "test-izlaz-1" } });
    jednako(redci.length, 2, "izlaz je pogodio obje berbe");
    tvrdi(
      redci.every((r) => r.uTankId === null && r.vrsta === "IZLAZ"),
      "izlaz nema odredisni tank i nosi vrstu IZLAZ"
    );
  });

  await scenarij("\n7. Iz tanka ne moze izaci vise nego sto knjiga ima", async (tx) => {
    const izvor = await napraviTank(tx, 1000);
    const cilj = await napraviTank(tx, 0);

    await ulaz(tx, izvor.id, 1000);

    const greska = await uhvati(() =>
      zabiljeziPrijenos(tx, {
        izvori: [{ tankId: izvor.id, litre: 1500 }],
        ciljevi: [{ tankId: cilj.id, litre: 1500 }],
        vrsta: "PRETOK",
        veza: { pretokId: "test-previse" },
      })
    );

    const poruka = greska instanceof Error ? greska.message : null;

    tvrdi(poruka != null, "prevelik izlaz puca");
    // Tip je vazan: rute po njemu razlikuju 400 od 500 (isti obrazac kao
    // FiltracijaGreska). Da puca obicnim Error-om, korisnik bi dobio 500 i
    // recenicu "dogodila se greska" umjesto brojki koje kazu sto ne stima.
    tvrdi(greska instanceof BerbaGreska, "i to kao BerbaGreska, ne kao bilo koja greska");
    tvrdi(String(poruka).includes("manjak"), "poruka imenuje manjak");
    tvrdi(String(poruka).includes("1500"), "poruka kaze koliko je trazeno");

    // Nista se ne smije upisati — ni djelomicno.
    jednako(await litreUTanku(tx, izvor.id), 1000, "izvor je ostao netaknut");
    jednako(await litreUTanku(tx, cilj.id), 0, "u cilj nije uslo nista");

    const redci = await tx.berbaKretanje.count({ where: { pretokId: "test-previse" } });
    jednako(redci, 0, "nijedan redak nije zapisan");

    // I nijedna berba ne smije zavrsiti u minusu.
    const stanje = await stanjeTanka(tx, izvor.id, { svi: true });
    tvrdi(
      stanje.every((s) => s.ml >= 0),
      "nijedna berba nije otisla u minus"
    );
  });

  await scenarij("\n8. Manjak se smije nadopuniti, ali samo izricito", async (tx) => {
    const izvor = await napraviTank(tx, 1500);
    const cilj = await napraviTank(tx, 0);

    await ulaz(tx, izvor.id, 1000);

    const r = await zabiljeziPrijenos(tx, {
      izvori: [{ tankId: izvor.id, litre: 1500 }],
      ciljevi: [{ tankId: cilj.id, litre: 1500 }],
      vrsta: "PRETOK",
      veza: { pretokId: "test-nadopuna" },
      naManjak: "ZATECENO",
    });

    jednako(r.nadopune.length, 1, "nastala je jedna nadopuna");
    jednako(r.nadopune[0].litre, 500, "i to na tocno 500 L koliko je nedostajalo");

    const nova = await tx.berba.findUniqueOrThrow({ where: { id: r.nadopune[0].berbaId } });
    jednako(nova.vrstaUnosa, "ZATECENO", "nadopuna je vrste ZATECENO");
    tvrdi(String(nova.napomena ?? "").length > 0, "nadopuna nosi napomenu zasto postoji");

    jednako(await litreUTanku(tx, izvor.id), 0, "izvor je prazan");
    jednako(await litreUTanku(tx, cilj.id), 1500, "u cilj je uslo svih 1500 L");
  });

  await scenarij("\n9. Ponistenje vraca stanje tocno na staro", async (tx) => {
    const izvor = await napraviTank(tx, 1000);
    const c1 = await napraviTank(tx, 0);
    const c2 = await napraviTank(tx, 0);

    const a = await ulaz(tx, izvor.id, 700, "Grasevina");
    const b = await ulaz(tx, izvor.id, 300, "Sauvignon");

    const prije = await stanjePoBerbi(tx, izvor.id);

    await zabiljeziPrijenos(tx, {
      izvori: [{ tankId: izvor.id, litre: 900 }],
      ciljevi: [
        { tankId: c1.id, litre: 600 },
        { tankId: c2.id, litre: 250 },
      ],
      vrsta: "PRETOK",
      veza: { pretokId: "test-ponisti" },
    });

    jednako(await litreUTanku(tx, izvor.id), 100, "nakon pretoka u izvoru je 100 L");

    const r = await zabiljeziPonistenje(tx, { pretokId: "test-ponisti" });
    tvrdi(r.redaka > 0, "ponistenje je upisalo protustavke");

    jednako(await stanjePoBerbi(tx, izvor.id), prije, "stanje izvora je tocno kao prije");
    jednako(await litreUTanku(tx, c1.id), 0, "cilj 1 je opet prazan");
    jednako(await litreUTanku(tx, c2.id), 0, "cilj 2 je opet prazan");

    // Nista nije obrisano — i potez i njegovo povlacenje ostaju u knjizi.
    const svi = await tx.berbaKretanje.findMany({ where: { pretokId: "test-ponisti" } });
    const izvorni = svi.filter((k) => k.vrsta === "PRETOK").length;
    const protu = svi.filter((k) => k.vrsta === "PONISTENJE").length;

    jednako(izvorni, protu, "svaki izvorni redak ima svoje zrcalo");
    tvrdi(izvorni > 0, "izvorni redci su ostali u knjizi");

    const opet = await pukne(() => zabiljeziPonistenje(tx, { pretokId: "test-ponisti" }));
    tvrdi(opet != null, "dvostruko ponistenje puca");
    tvrdi(String(opet).includes("vec ponisten"), "poruka kaze da je vec ponisteno");
  });

  await scenarij("\n10. Ponistenje ulaza prazni tank, ali ne brise zapis berbe", async (tx) => {
    const t = await napraviTank(tx, 500);

    const r = await zabiljeziUlaz(tx, {
      tankId: t.id,
      litre: 500,
      nazivSorte: "Grasevina",
      veza: { punjenjeId: "test-punjenje-ponisti" },
    });

    jednako(await litreUTanku(tx, t.id), 500, "vino je u tanku");

    await zabiljeziPonistenje(tx, { punjenjeId: "test-punjenje-ponisti" });

    jednako(await litreUTanku(tx, t.id), 0, "nakon ponistenja u tanku nema nista");

    const berba = await tx.berba.findUnique({ where: { id: r.berbaId } });
    tvrdi(berba != null, "zapis berbe je i dalje tu");
    jednako(berba?.obrisano, false, "i nije oznacen obrisanim — ponistenje ga ne dira");
  });

  await scenarij("\n11. Odbijeni ulazi", async (tx) => {
    const a = await napraviTank(tx, 1000);
    const b = await napraviTank(tx, 0);

    await ulaz(tx, a.id, 1000);

    const istiTank = await pukne(() =>
      zabiljeziPrijenos(tx, {
        izvori: [{ tankId: a.id, litre: 500 }],
        ciljevi: [{ tankId: a.id, litre: 500 }],
        vrsta: "PRETOK",
        veza: { pretokId: "test-isti" },
      })
    );
    tvrdi(String(istiTank).includes("i izvor i cilj"), "tank ne moze biti i izvor i cilj");

    const viseUnutra = await pukne(() =>
      zabiljeziPrijenos(tx, {
        izvori: [{ tankId: a.id, litre: 500 }],
        ciljevi: [{ tankId: b.id, litre: 900 }],
        vrsta: "PRETOK",
        veza: { pretokId: "test-vise-unutra" },
      })
    );
    tvrdi(viseUnutra != null, "u ciljeve ne moze uci vise nego sto iz izvora izlazi");

    const dvijeVeze = await pukne(() =>
      zabiljeziPrijenos(tx, {
        izvori: [{ tankId: a.id, litre: 100 }],
        ciljevi: [{ tankId: b.id, litre: 100 }],
        vrsta: "PRETOK",
        veza: { pretokId: "test-p", zadatakId: "test-z" },
      })
    );
    tvrdi(String(dvijeVeze).includes("samo jednu vezu"), "dvije veze se odbijaju");

    const bezVeze = await pukne(() =>
      zabiljeziPrijenos(tx, {
        izvori: [{ tankId: a.id, litre: 100 }],
        ciljevi: [{ tankId: b.id, litre: 100 }],
        vrsta: "PRETOK",
        veza: {},
      })
    );
    tvrdi(String(bezVeze).includes("napomenu"), "bez veze i bez napomene se odbija");

    const nula = await pukne(() =>
      zabiljeziIzlaz(tx, { tankId: a.id, litre: 0, veza: { izlazVinaId: "test-nula" } })
    );
    tvrdi(nula != null, "izlaz od nula litara se odbija");

    const praznoPonistenje = await pukne(() =>
      zabiljeziPonistenje(tx, { pretokId: "test-nepostojeci" })
    );
    tvrdi(
      String(praznoPonistenje).includes("nema nijedno kretanje"),
      "ponistenje cina bez kretanja se odbija"
    );

    tvrdi(
      (await pukne(() => zabiljeziPonistenje(tx, {}))) != null,
      "ponistenje bez veze se odbija"
    );

    // Nakon svih odbijenih poziva knjiga mora biti netaknuta.
    jednako(await litreUTanku(tx, a.id), 1000, "nijedan odbijeni poziv nije nista upisao");
    jednako(await litreUTanku(tx, b.id), 0, "ni u drugi tank");
  });

  await scenarij("\n12. Vise izvora u vise ciljeva", async (tx) => {
    const i1 = await napraviTank(tx, 3000);
    const i2 = await napraviTank(tx, 2000);
    const c1 = await napraviTank(tx, 0);
    const c2 = await napraviTank(tx, 0);

    const a = await ulaz(tx, i1.id, 3000, "Grasevina");
    const b = await ulaz(tx, i2.id, 2000, "Sauvignon");

    await zabiljeziPrijenos(tx, {
      izvori: [
        { tankId: i1.id, litre: 3000 },
        { tankId: i2.id, litre: 2000 },
      ],
      ciljevi: [
        { tankId: c1.id, litre: 3333 },
        { tankId: c2.id, litre: 1667 },
      ],
      vrsta: "PRETOK",
      veza: { pretokId: "test-cuvee" },
    });

    jednako(await litreUTanku(tx, i1.id), 0, "prvi izvor prazan");
    jednako(await litreUTanku(tx, i2.id), 0, "drugi izvor prazan");
    jednako(await litreUTanku(tx, c1.id), 3333, "cilj 1 dobio tocno 3333 L");
    jednako(await litreUTanku(tx, c2.id), 1667, "cilj 2 dobio tocno 1667 L");

    const s1 = await stanjePoBerbi(tx, c1.id);
    const s2 = await stanjePoBerbi(tx, c2.id);

    jednako(
      uLitre(uMl(s1[a] ?? 0) + uMl(s2[a] ?? 0)),
      3000,
      "sva grasevina je stigla u ciljeve"
    );
    jednako(
      uLitre(uMl(s1[b] ?? 0) + uMl(s2[b] ?? 0)),
      2000,
      "sav sauvignon je stigao u ciljeve"
    );
    tvrdi((s1[a] ?? 0) > 0 && (s1[b] ?? 0) > 0, "cilj 1 je dobio od OBA izvora");
    tvrdi((s2[a] ?? 0) > 0 && (s2[b] ?? 0) > 0, "cilj 2 je dobio od OBA izvora");
  });

  await scenarij("\n13. Obrisana berba ispada iz podrijetla, ali ostaje vidljiva", async (tx) => {
    const t = await napraviTank(tx, 1000);
    const a = await ulaz(tx, t.id, 600, "Grasevina");
    await ulaz(tx, t.id, 400, "Sauvignon");

    await tx.berba.update({
      where: { id: a },
      data: { obrisano: true, obrisanoAt: new Date() },
    });

    jednako(await litreUTanku(tx, t.id), 400, "obrisana berba ne ulazi u zbroj");

    const p = await podrijetloTanka(tx, t.id);
    jednako(p.stavke.length, 1, "ni u podrijetlo");
    jednako(p.razlikaOdTankaL, 600, "ali razlika prema tanku to KAZE, umjesto da sutnja");

    const svi = await stanjeTanka(tx, t.id, { svi: true });
    jednako(svi.length, 2, "s opcijom `svi` obrisana se i dalje vidi");
  });

  // -------------------------------------------------------------------------

  console.log("");
  console.log(`proslo: ${proslo}, palo: ${pao}`);

  const ostalo = await prisma.tank.count({ where: { broj: { gte: sljedeciBroj - 1000 } } });
  jednako(ostalo, 0, "nijedan sintetski tank nije prezivio rollback");

  const berbe = await prisma.berba.count({ where: { nazivSorte: { startsWith: "Sorta " } } });
  jednako(berbe, 0, "nijedan testni zapis berbe nije prezivio rollback");
}

main()
  .then(async () => {
    console.log("");
    console.log(`UKUPNO — proslo: ${proslo}, palo: ${pao}`);
    if (pao > 0) process.exitCode = 1;
  })
  .catch((e) => {
    console.error(e instanceof Prisma.PrismaClientKnownRequestError ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


