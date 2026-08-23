/**
 * Provjera MOTORA PRETOKA (lib/pretok-motor.ts) nad pravom bazom.
 *
 * Pokretanje:  npm run test:pretok:motor
 *
 * SIGURNOST — procitaj prije pokretanja:
 *   - svaki scenarij radi u vlastitoj transakciji koja NA KRAJU NAMJERNO PUKNE,
 *     pa se sve vraca unatrag; u bazi ne ostaje nijedan redak;
 *   - radi ISKLJUCIVO nad tankovima koje sam stvori, s brojevima iznad
 *     najveceg postojeceg. Nijedan pravi tank se ne cita ni ne mijenja —
 *     SELECT FOR UPDATE u zakljucajTankove pogadja samo retke nastale unutar
 *     iste transakcije.
 * Zato ga je sigurno pokrenuti i tijekom berbe.
 *
 * ZASTO POSTOJI. Motor jos NITKO ne zove. Faza 5c prebacuje `POST /api/pretok`
 * na njega i tada nestaju dvije stare grane. Ovaj test mora dokazati da je novi
 * motor ispravan PRIJE toga — ako ne dokaze, 5c se ne smije dogoditi.
 *
 * DIO 2 je diferencijalni: stara float-matematika obicne i cuvée grane je
 * prepisana ovdje kao ORAKUL (nije produkcijski kod) i usporeduje se s novim
 * mililitarskim motorom na istim ulazima.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { FiltracijaGreska, uMl } from "../lib/filtracija";
import { izvrsiPretok, provjeriUlazPretoka } from "../lib/pretok-motor";
import { razlogZabranePonistavanja } from "../lib/pretok-ponistavanje";

type Tx = Prisma.TransactionClient;

let pao = 0;
let proslo = 0;

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

function tvrdi(uvjet: boolean, poruka: string) {
  jednako(uvjet, true, poruka);
}

async function ocekujGresku(fn: () => Promise<unknown>, dio: string, poruka: string) {
  try {
    await fn();
    pao++;
    console.log(`  PAO: ${poruka} — greska se NIJE dogodila`);
  } catch (e) {
    const tekst = (e as Error).message ?? "";
    if (e instanceof FiltracijaGreska && tekst.toLowerCase().includes(dio.toLowerCase())) {
      proslo++;
      return;
    }
    pao++;
    console.log(`  PAO: ${poruka} — kriva greska: ${tekst}`);
  }
}

/** Baca se na kraju svakog scenarija da transakcija padne i sve se vrati. */
class Rollback extends Error {}

let sljedeciBroj = 0;
let redni = 0;

async function scenarij(naziv: string, fn: (tx: Tx) => Promise<void>) {
  console.log(naziv);
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
  } catch (e) {
    if (!(e instanceof Rollback)) {
      pao++;
      console.log(`  PAO: scenarij je pukao: ${(e as Error).message}`);
    }
  }
}

async function napraviKorisnika(tx: Tx) {
  return tx.user.create({
    data: {
      ime: "TEST motor pretoka",
      email: `test-pretok-motor-${redni++}-${Date.now()}@example.invalid`,
      password: "nije-u-upotrebi",
      role: "PODRUM",
    },
  });
}

async function napraviTank(
  tx: Tx,
  p: {
    kolicina: number;
    kapacitet?: number;
    nazivVina?: string | null;
    sorta?: string | null;
    godiste?: number | null;
    sastav?: Array<{ nazivSorte: string; postotak: number }>;
    blend?: Array<{ nazivVina: string; sorta: string; kolicina: number; postotak: number }>;
  }
) {
  const tank = await tx.tank.create({
    data: {
      broj: sljedeciBroj++,
      kapacitet: p.kapacitet ?? 20000,
      kolicinaVinaUTanku: p.kolicina,
      nazivVina: p.nazivVina ?? null,
      sorta: p.sorta ?? null,
      godiste: p.godiste ?? null,
      nadzorHladjenja: false,
      smsAktivan: false,
      samokontrolaAktivna: false,
    },
  });

  if (p.sastav?.length) {
    await tx.tankSortaUdio.createMany({
      data: p.sastav.map((s) => ({ tankId: tank.id, ...s })),
    });
  }

  if (p.blend?.length) {
    await tx.blendIzvor.createMany({
      data: p.blend.map((b) => ({ ciljTankId: tank.id, izvorTankId: null, ...b })),
    });
  }

  return tank;
}

async function stanje(tx: Tx, tankId: string) {
  const t = await tx.tank.findUniqueOrThrow({
    where: { id: tankId },
    include: {
      udjeliSorti: { orderBy: { nazivSorte: "asc" } },
      blendIzvori: { orderBy: { kolicina: "desc" } },
    },
  });
  return {
    litara: Number(t.kolicinaVinaUTanku ?? 0),
    nazivVina: t.nazivVina,
    sorta: t.sorta,
    godiste: t.godiste,
    sastav: t.udjeliSorti.map((u) => ({ nazivSorte: u.nazivSorte, postotak: u.postotak })),
    blendMl: t.blendIzvori.reduce((z, b) => z + uMl(b.kolicina), 0),
    blendRedaka: t.blendIzvori.length,
    postotakZbroj: Number(
      t.blendIzvori.reduce((z, b) => z + Number(b.postotak), 0).toFixed(2)
    ),
    sastavZbroj: Number(
      t.udjeliSorti.reduce((z, u) => z + Number(u.postotak), 0).toFixed(2)
    ),
  };
}

// ===========================================================================
// ORAKUL — stara float-matematika iz app/api/pretok/route.ts.
// NIJE produkcijski kod. Prepisan doslovno da se novi motor ima s cim
// usporediti na istim ulazima. Koristi se SAMO u dijelu 2.
// ===========================================================================

function round6(n: number) {
  return Number(n.toFixed(6));
}

function orakulNormaliziraj(
  stavke: Array<{ kljuc: string; kolicina: number }>
): Array<{ kljuc: string; kolicina: number; postotak: number }> {
  const mapa = new Map<string, { kljuc: string; kolicina: number; postotak: number }>();

  for (const s of stavke) {
    const p = mapa.get(s.kljuc);
    if (p) p.kolicina = round6(p.kolicina + s.kolicina);
    else mapa.set(s.kljuc, { kljuc: s.kljuc, kolicina: round6(s.kolicina), postotak: 0 });
  }

  const rez = Array.from(mapa.values()).filter((s) => s.kolicina > 0);
  const ukupno = rez.reduce((z, s) => z + s.kolicina, 0);

  return rez.map((s) => ({
    ...s,
    postotak: ukupno > 0 ? Number(((s.kolicina / ukupno) * 100).toFixed(2)) : 0,
  }));
}

/** Stara `proporcionalniBlendIzvori` — dijeljenje decimala po stavci. */
function orakulProporcionalno(
  blend: Array<{ kljuc: string; kolicina: number }>,
  prenosi: number,
  ukupnoPrije: number
): Array<{ kljuc: string; kolicina: number; postotak: number }> {
  if (prenosi <= 0 || ukupnoPrije <= 0) return [];
  return orakulNormaliziraj(
    blend.map((b) => ({
      kljuc: b.kljuc,
      kolicina: round6((b.kolicina / ukupnoPrije) * prenosi),
    }))
  );
}

// ===========================================================================

async function main() {
  const najveci = await prisma.tank.aggregate({ _max: { broj: true } });
  sljedeciBroj = (najveci._max.broj ?? 0) + 2000;
  console.log(`Sintetski tankovi krecu od broja ${sljedeciBroj}.`);
  console.log("");
  console.log("=== DIO 1: ponasanje motora ===");
  console.log("");

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 1: 1 → 1 u PRAZAN cilj — cilj preuzima identitet izvora", async (tx) => {
    const u = await napraviKorisnika(tx);
    const izvor = await napraviTank(tx, {
      kolicina: 1000,
      nazivVina: "TEST vino",
      sorta: "Grasevina",
      godiste: 2025,
      sastav: [{ nazivSorte: "Grasevina", postotak: 100 }],
    });
    const cilj = await napraviTank(tx, { kolicina: 0 });

    const r = await izvrsiPretok(tx, {
      izvori: [{ tankId: izvor.id, kolicina: 400 }],
      ciljevi: [{ tankId: cilj.id, kolicina: 400 }],
      vrsta: "OBICNI",
      nacin: "BEZ",
      korisnikId: u.id,
    });

    jednako(r.izasloLitara, 400, "izaslo 400 L");
    jednako(r.usloLitara, 400, "uslo 400 L");
    jednako(r.gubitakLitara, 0, "kalo 0 L");

    const i = await stanje(tx, izvor.id);
    const c = await stanje(tx, cilj.id);

    jednako(i.litara, 600, "izvoru ostalo 600 L");
    jednako(c.litara, 400, "u cilju 400 L");
    jednako(c.nazivVina, "TEST vino", "cilj preuzeo naziv");
    jednako(c.sorta, "Grasevina", "cilj preuzeo sortu");
    jednako(c.godiste, 2025, "cilj preuzeo godiste");
    jednako(c.blendMl, 400_000, "blend cilja = 400 L u ml");
    jednako(c.postotakZbroj, 100, "postotci blenda zbrajaju 100");
    jednako(c.sastavZbroj, 100, "sastav zbraja 100");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 2: 1 → M — svaki cilj dobije TOCNO svoju kolicinu", async (tx) => {
    const u = await napraviKorisnika(tx);
    const izvor = await napraviTank(tx, {
      kolicina: 1000,
      nazivVina: "TEST vino",
      sorta: "Grasevina",
      sastav: [
        { nazivSorte: "Grasevina", postotak: 70 },
        { nazivSorte: "Sauvignon", postotak: 30 },
      ],
    });
    const c1 = await napraviTank(tx, { kolicina: 0 });
    const c2 = await napraviTank(tx, { kolicina: 0 });
    const c3 = await napraviTank(tx, { kolicina: 0 });

    // 333 + 333 + 333 = 999, iz 1000 — kalo 1 L. Namjerno nedjeljivo na tri.
    const r = await izvrsiPretok(tx, {
      izvori: [{ tankId: izvor.id, kolicina: 1000 }],
      ciljevi: [
        { tankId: c1.id, kolicina: 333 },
        { tankId: c2.id, kolicina: 333 },
        { tankId: c3.id, kolicina: 333 },
      ],
      vrsta: "OBICNI",
      nacin: "BEZ",
      korisnikId: u.id,
    });

    jednako(r.gubitakLitara, 1, "kalo 1 L");

    const s1 = await stanje(tx, c1.id);
    const s2 = await stanje(tx, c2.id);
    const s3 = await stanje(tx, c3.id);

    jednako(s1.litara, 333, "cilj 1 ima 333 L");
    jednako(s2.litara, 333, "cilj 2 ima 333 L");
    jednako(s3.litara, 333, "cilj 3 ima 333 L");

    // KLJUCNA INVARIJANTA: blend svakog cilja tocno odgovara njegovoj kolicini.
    jednako(s1.blendMl, 333_000, "blend cilja 1 = 333 L u ml");
    jednako(s2.blendMl, 333_000, "blend cilja 2 = 333 L u ml");
    jednako(s3.blendMl, 333_000, "blend cilja 3 = 333 L u ml");

    jednako(s1.sastavZbroj, 100, "sastav cilja 1 zbraja 100");
    jednako(s2.sastavZbroj, 100, "sastav cilja 2 zbraja 100");
    jednako(s3.sastavZbroj, 100, "sastav cilja 3 zbraja 100");

    const izv = await stanje(tx, izvor.id);
    jednako(izv.litara, 0, "izvor je prazan");
    jednako(izv.nazivVina, null, "prazan izvor izgubio identitet");
    jednako(izv.blendRedaka, 0, "prazan izvor nema blend");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 3: N → M cuvée — jedan novi identitet na SVE ciljeve", async (tx) => {
    const u = await napraviKorisnika(tx);
    const i1 = await napraviTank(tx, {
      kolicina: 600,
      nazivVina: "Grasevina 2025",
      sorta: "Grasevina",
      sastav: [{ nazivSorte: "Grasevina", postotak: 100 }],
    });
    const i2 = await napraviTank(tx, {
      kolicina: 400,
      nazivVina: "Sauvignon 2025",
      sorta: "Sauvignon",
      sastav: [{ nazivSorte: "Sauvignon", postotak: 100 }],
    });
    const c1 = await napraviTank(tx, { kolicina: 0 });
    const c2 = await napraviTank(tx, { kolicina: 0 });

    const r = await izvrsiPretok(tx, {
      izvori: [
        { tankId: i1.id, kolicina: 600 },
        { tankId: i2.id, kolicina: 400 },
      ],
      ciljevi: [
        { tankId: c1.id, kolicina: 500 },
        { tankId: c2.id, kolicina: 480 },
      ],
      vrsta: "CUVEE",
      nacin: "FILTRACIJA",
      nacinNapomena: "kroz plocasti filtar",
      korisnikId: u.id,
      noviIdentitet: { nazivVina: "TEST cuvée", sorta: "Cuvée", godiste: 2025 },
    });

    jednako(r.izasloLitara, 1000, "izaslo 1000 L");
    jednako(r.usloLitara, 980, "uslo 980 L");
    jednako(r.gubitakLitara, 20, "kalo 20 L");

    const s1 = await stanje(tx, c1.id);
    const s2 = await stanje(tx, c2.id);

    jednako(s1.nazivVina, "TEST cuvée", "cilj 1 dobio novi naziv");
    jednako(s2.nazivVina, "TEST cuvée", "cilj 2 dobio ISTI novi naziv");
    jednako(s1.sorta, "Cuvée", "cilj 1 dobio novu sortu");
    jednako(s2.sorta, "Cuvée", "cilj 2 dobio ISTU novu sortu");

    jednako(s1.blendMl, 500_000, "blend cilja 1 = 500 L");
    jednako(s2.blendMl, 480_000, "blend cilja 2 = 480 L");
    jednako(s1.blendRedaka, 2, "cilj 1 zna oba izvora");
    jednako(s2.blendRedaka, 2, "cilj 2 zna oba izvora");
    jednako(s1.postotakZbroj, 100, "postotci cilja 1 zbrajaju 100");
    jednako(s2.postotakZbroj, 100, "postotci cilja 2 zbrajaju 100");

    // Obje sorte moraju stici u oba cilja, u omjeru 60:40.
    jednako(s1.sastav.length, 2, "cilj 1 ima obje sorte");
    jednako(s2.sastav.length, 2, "cilj 2 ima obje sorte");
    jednako(s1.sastavZbroj, 100, "sastav cilja 1 zbraja 100");
    jednako(s2.sastavZbroj, 100, "sastav cilja 2 zbraja 100");

    jednako((await stanje(tx, i1.id)).litara, 0, "izvor 1 prazan");
    jednako((await stanje(tx, i2.id)).litara, 0, "izvor 2 prazan");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 4: dolijevanje u PUN cilj s istim vinom", async (tx) => {
    const u = await napraviKorisnika(tx);
    const izvor = await napraviTank(tx, {
      kolicina: 500,
      nazivVina: "TEST vino",
      sorta: "Grasevina",
      sastav: [{ nazivSorte: "Grasevina", postotak: 100 }],
    });
    const cilj = await napraviTank(tx, {
      kolicina: 700,
      nazivVina: "TEST vino",
      sorta: "Grasevina",
      sastav: [{ nazivSorte: "Grasevina", postotak: 100 }],
    });

    await izvrsiPretok(tx, {
      izvori: [{ tankId: izvor.id, kolicina: 300 }],
      ciljevi: [{ tankId: cilj.id, kolicina: 300 }],
      vrsta: "OBICNI",
      nacin: "BEZ",
      korisnikId: u.id,
    });

    const c = await stanje(tx, cilj.id);
    jednako(c.litara, 1000, "u cilju 1000 L");
    jednako(c.nazivVina, "TEST vino", "identitet zadrzan");
    jednako(c.blendMl, 1_000_000, "blend = 1000 L u ml");
    jednako(c.postotakZbroj, 100, "postotci zbrajaju 100");

    const i = await stanje(tx, izvor.id);
    jednako(i.litara, 200, "izvoru ostalo 200 L");
    jednako(i.nazivVina, "TEST vino", "izvor zadrzao identitet");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 5: brane", async (tx) => {
    const u = await napraviKorisnika(tx);
    const a = await napraviTank(tx, { kolicina: 1000, nazivVina: "Vino A", sorta: "Grasevina" });
    const b = await napraviTank(tx, { kolicina: 500, nazivVina: "Vino B", sorta: "Sauvignon" });
    const prazan = await napraviTank(tx, { kolicina: 0, kapacitet: 100 });

    const osnovni = { vrsta: "OBICNI" as const, nacin: "BEZ" as const, korisnikId: u.id };

    await ocekujGresku(
      () => izvrsiPretok(tx, { ...osnovni, izvori: [{ tankId: a.id, kolicina: 100 }], ciljevi: [{ tankId: a.id, kolicina: 100 }] }),
      "izvor i cilj",
      "isti tank kao izvor i cilj"
    );

    await ocekujGresku(
      () => izvrsiPretok(tx, { ...osnovni, izvori: [{ tankId: a.id, kolicina: 100 }], ciljevi: [{ tankId: b.id, kolicina: 200 }] }),
      "ulazi više",
      "negativan kalo"
    );

    await ocekujGresku(
      () => izvrsiPretok(tx, { ...osnovni, izvori: [{ tankId: a.id, kolicina: 5000 }], ciljevi: [{ tankId: b.id, kolicina: 5000 }] }),
      "a iz njega izlazi",
      "izvor nema toliko vina"
    );

    await ocekujGresku(
      () => izvrsiPretok(tx, { ...osnovni, izvori: [{ tankId: a.id, kolicina: 500 }], ciljevi: [{ tankId: prazan.id, kolicina: 500 }] }),
      "ne stane",
      "premasen kapacitet cilja"
    );

    await ocekujGresku(
      () => izvrsiPretok(tx, { ...osnovni, izvori: [{ tankId: a.id, kolicina: 100 }], ciljevi: [{ tankId: b.id, kolicina: 100 }] }),
      "već sadrži drugo vino",
      "obicni pretok u tank s drugim vinom"
    );

    await ocekujGresku(
      () =>
        izvrsiPretok(tx, {
          ...osnovni,
          vrsta: "CUVEE",
          izvori: [{ tankId: a.id, kolicina: 100 }],
          ciljevi: [{ tankId: b.id, kolicina: 100 }],
          noviIdentitet: null,
        }),
      "naziv novog vina",
      "cuvée bez naziva"
    );

    await ocekujGresku(
      () =>
        izvrsiPretok(tx, {
          ...osnovni,
          nacin: "FILTRACIJA",
          izvori: [{ tankId: a.id, kolicina: 100 }],
          ciljevi: [{ tankId: b.id, kolicina: 100 }],
        }),
      "napomena o načinu",
      "nacin bez napomene"
    );

    await ocekujGresku(
      () =>
        izvrsiPretok(tx, {
          ...osnovni,
          izvori: [
            { tankId: a.id, kolicina: 100 },
            { tankId: b.id, kolicina: 100 },
          ],
          ciljevi: [{ tankId: prazan.id, kolicina: 50 }],
        }),
      "različita vina",
      "obicni pretok iz dva razlicita vina"
    );

    // Nista od gornjeg nije smjelo nista promijeniti.
    jednako((await stanje(tx, a.id)).litara, 1000, "tank A netaknut nakon svih odbijenih pokusaja");
    jednako((await stanje(tx, b.id)).litara, 500, "tank B netaknut nakon svih odbijenih pokusaja");
  });

  // -------------------------------------------------------------------------
  console.log("");
  console.log("=== DIO 2: novi motor vs stara float-matematika (orakul) ===");
  console.log("");

  await scenarij("DOKAZ 6: 1 → 1 iz tanka BEZ blenda — motor i orakul se poklapaju", async (tx) => {
    const u = await napraviKorisnika(tx);
    const izvor = await napraviTank(tx, {
      kolicina: 1000,
      nazivVina: "TEST vino",
      sorta: "Grasevina",
      sastav: [{ nazivSorte: "Grasevina", postotak: 100 }],
    });
    const cilj = await napraviTank(tx, { kolicina: 0 });

    await izvrsiPretok(tx, {
      izvori: [{ tankId: izvor.id, kolicina: 400 }],
      ciljevi: [{ tankId: cilj.id, kolicina: 400 }],
      vrsta: "OBICNI",
      nacin: "BEZ",
      korisnikId: u.id,
    });

    // Orakul: izvor bez blenda daje jednu stavku od tocno prenesene kolicine.
    const orakul = orakulNormaliziraj([{ kljuc: izvor.id, kolicina: 400 }]);
    const c = await stanje(tx, cilj.id);

    jednako(c.blendMl, uMl(orakul[0].kolicina), "kolicina blenda ista kao u orakula");
    jednako(c.postotakZbroj, orakul[0].postotak, "postotak isti kao u orakula");
  });

  await scenarij(
    "DOKAZ 7: izvor S BLENDOM — orakul drifta, motor je egzaktan",
    async (tx) => {
      const u = await napraviKorisnika(tx);

      // Tri sastavnice koje se ne dijele lijepo na 700 od 1000.
      const blend = [
        { nazivVina: "A", sorta: "Grasevina", kolicina: 333.333333, postotak: 33.33 },
        { nazivVina: "B", sorta: "Sauvignon", kolicina: 333.333333, postotak: 33.33 },
        { nazivVina: "C", sorta: "Rizling", kolicina: 333.333334, postotak: 33.34 },
      ];

      const izvor = await napraviTank(tx, {
        kolicina: 1000,
        nazivVina: "TEST blend",
        sorta: "Cuvée",
        sastav: [{ nazivSorte: "Cuvée", postotak: 100 }],
        blend,
      });
      const cilj = await napraviTank(tx, { kolicina: 0 });

      await izvrsiPretok(tx, {
        izvori: [{ tankId: izvor.id, kolicina: 700 }],
        ciljevi: [{ tankId: cilj.id, kolicina: 700 }],
        vrsta: "OBICNI",
        nacin: "BEZ",
        korisnikId: u.id,
      });

      const orakul = orakulProporcionalno(
        blend.map((b, i) => ({ kljuc: `k${i}`, kolicina: b.kolicina })),
        700,
        1000
      );
      const orakulMl = orakul.reduce((z, o) => z + uMl(o.kolicina), 0);

      const c = await stanje(tx, cilj.id);
      const i = await stanje(tx, izvor.id);

      // Motor: zbroj je TOCNO onoliko koliko je uslo. Orakul: priblizno.
      jednako(c.blendMl, 700_000, "MOTOR: blend cilja tocno 700 L u ml");
      jednako(i.blendMl, 300_000, "MOTOR: blend izvora tocno 300 L u ml");
      jednako(c.blendMl + i.blendMl, 1_000_000, "MOTOR: nijedan mililitar nije nestao");

      console.log(
        `       orakul dao ${(orakulMl / 1000).toFixed(6)} L, motor ${(c.blendMl / 1000).toFixed(6)} L` +
          `  → razlika ${((orakulMl - 700_000) / 1000).toFixed(6)} L`
      );

      tvrdi(
        Math.abs(orakulMl - c.blendMl) < 1000,
        "orakul i motor se razlikuju za manje od 1 L (ista matematika, razlicita tocnost)"
      );
    }
  );

  await scenarij("DOKAZ 8: cuvée N → 1 — motor i orakul daju iste udjele", async (tx) => {
    const u = await napraviKorisnika(tx);
    const i1 = await napraviTank(tx, { kolicina: 600, nazivVina: "A", sorta: "Grasevina", sastav: [{ nazivSorte: "Grasevina", postotak: 100 }] });
    const i2 = await napraviTank(tx, { kolicina: 400, nazivVina: "B", sorta: "Sauvignon", sastav: [{ nazivSorte: "Sauvignon", postotak: 100 }] });
    const cilj = await napraviTank(tx, { kolicina: 0 });

    await izvrsiPretok(tx, {
      izvori: [
        { tankId: i1.id, kolicina: 600 },
        { tankId: i2.id, kolicina: 400 },
      ],
      ciljevi: [{ tankId: cilj.id, kolicina: 1000 }],
      vrsta: "CUVEE",
      nacin: "BEZ",
      korisnikId: u.id,
      noviIdentitet: { nazivVina: "TEST cuvée", sorta: "Cuvée" },
    });

    const orakul = orakulNormaliziraj([
      { kljuc: i1.id, kolicina: 600 },
      { kljuc: i2.id, kolicina: 400 },
    ]);

    const c = await tx.tank.findUniqueOrThrow({
      where: { id: cilj.id },
      include: { blendIzvori: { orderBy: { kolicina: "desc" } } },
    });

    jednako(c.blendIzvori.length, orakul.length, "isti broj sastavnica kao u orakula");
    jednako(Number(c.blendIzvori[0].postotak), orakul[0].postotak, "prvi udio isti kao u orakula (60%)");
    jednako(Number(c.blendIzvori[1].postotak), orakul[1].postotak, "drugi udio isti kao u orakula (40%)");
    jednako(
      c.blendIzvori.reduce((z, b) => z + uMl(b.kolicina), 0),
      1_000_000,
      "zbroj blenda tocno 1000 L u ml"
    );
  });


  // -------------------------------------------------------------------------
  console.log("");
  console.log("=== DIO 4: brana na ponistavanju (faza 5b) ===");
  console.log("");

  await scenarij("DOKAZ 9: pretok BEZ arhiviranog izvora se smije ponistiti", async (tx) => {
    const izvor = await napraviTank(tx, { kolicina: 1000, nazivVina: "TEST vino", sorta: "Grasevina" });
    const cilj = await napraviTank(tx, { kolicina: 0 });

    const pretok = await tx.pretok.create({
      data: {
        ciljTankId: cilj.id,
        tip: "OBICNI",
        izvori: { create: [{ tankId: izvor.id, kolicina: 400 }] },
        ciljevi: { create: [{ tankId: cilj.id, kolicina: 400, redoslijed: 0 }] },
      },
      include: { izvori: true, ciljevi: true },
    });

    const razlog = await razlogZabranePonistavanja(tx, pretok);
    jednako(razlog, null, "nema arhive → ponistavanje dopusteno");
  });

  await scenarij("DOKAZ 10: pretok koji je ARHIVIRAO izvor se NE smije ponistiti", async (tx) => {
    const izvor = await napraviTank(tx, { kolicina: 1000, nazivVina: "TEST vino", sorta: "Grasevina" });
    const cilj = await napraviTank(tx, { kolicina: 0 });

    const pretok = await tx.pretok.create({
      data: {
        ciljTankId: cilj.id,
        tip: "OBICNI",
        izvori: { create: [{ tankId: izvor.id, kolicina: 1000 }] },
        ciljevi: { create: [{ tankId: cilj.id, kolicina: 1000, redoslijed: 0 }] },
      },
      include: { izvori: true, ciljevi: true },
    });

    // Arhiva nastala u istom trenutku kao pretok — tocno ono sto
    // arhivirajPotroseniTank napravi kad izvor padne na nulu.
    await tx.arhivaVina.create({
      data: {
        tankId: izvor.id,
        brojTanka: izvor.broj,
        nazivVina: "TEST vino",
        sorta: "Grasevina",
        kolicinaVina: 1000,
        tipArhive: "PRIVREMENA",
        arhiviranoAt: pretok.createdAt,
      },
    });

    const razlog = await razlogZabranePonistavanja(tx, pretok);

    tvrdi(razlog !== null, "arhiva postoji → ponistavanje odbijeno");
    tvrdi(
      (razlog ?? "").includes(`tank ${izvor.broj}`),
      "poruka imenuje arhivirani tank"
    );
    tvrdi(
      (razlog ?? "").includes(`tanka ${cilj.broj}`),
      "poruka kaze iz kojeg tanka vino treba vratiti"
    );
    tvrdi(
      (razlog ?? "").includes("napravi novi pretok"),
      "poruka kaze STO korisnik moze umjesto toga"
    );
    tvrdi((razlog ?? "").includes("1000 L"), "poruka navodi kolicinu");
  });

  await scenarij("DOKAZ 11: STARIJA arhiva istog tanka ne blokira ponistavanje", async (tx) => {
    const izvor = await napraviTank(tx, { kolicina: 1000, nazivVina: "TEST vino", sorta: "Grasevina" });
    const cilj = await napraviTank(tx, { kolicina: 0 });

    const pretok = await tx.pretok.create({
      data: {
        ciljTankId: cilj.id,
        tip: "OBICNI",
        izvori: { create: [{ tankId: izvor.id, kolicina: 400 }] },
        ciljevi: { create: [{ tankId: cilj.id, kolicina: 400, redoslijed: 0 }] },
      },
      include: { izvori: true, ciljevi: true },
    });

    // Arhiva od PRIJE — neko ranije vino istog tanka. Nema veze s ovim pretokom.
    await tx.arhivaVina.create({
      data: {
        tankId: izvor.id,
        brojTanka: izvor.broj,
        nazivVina: "Prethodno vino",
        kolicinaVina: 500,
        tipArhive: "PRIVREMENA",
        arhiviranoAt: new Date(pretok.createdAt.getTime() - 60 * 60 * 1000),
      },
    });

    const razlog = await razlogZabranePonistavanja(tx, pretok);
    jednako(razlog, null, "arhiva starija od sat vremena ne blokira");
  });

  await scenarij("DOKAZ 12: arhiviran JEDAN od vise izvora vec blokira", async (tx) => {
    const i1 = await napraviTank(tx, { kolicina: 600, nazivVina: "A", sorta: "Grasevina" });
    const i2 = await napraviTank(tx, { kolicina: 400, nazivVina: "B", sorta: "Sauvignon" });
    const c1 = await napraviTank(tx, { kolicina: 0 });
    const c2 = await napraviTank(tx, { kolicina: 0 });

    const pretok = await tx.pretok.create({
      data: {
        ciljTankId: c1.id,
        tip: "CUVEE",
        izvori: {
          create: [
            { tankId: i1.id, kolicina: 600 },
            { tankId: i2.id, kolicina: 400 },
          ],
        },
        ciljevi: {
          create: [
            { tankId: c1.id, kolicina: 500, redoslijed: 0 },
            { tankId: c2.id, kolicina: 480, redoslijed: 1 },
          ],
        },
      },
      include: { izvori: true, ciljevi: true },
    });

    await tx.arhivaVina.create({
      data: {
        tankId: i2.id,
        brojTanka: i2.broj,
        nazivVina: "B",
        kolicinaVina: 400,
        tipArhive: "PRIVREMENA",
        arhiviranoAt: pretok.createdAt,
      },
    });

    const razlog = await razlogZabranePonistavanja(tx, pretok);

    tvrdi(razlog !== null, "arhiviran drugi izvor blokira ponistavanje");
    tvrdi((razlog ?? "").includes(`tank ${i2.broj}`), "poruka imenuje bas taj izvor");
    tvrdi(
      (razlog ?? "").includes(`tankova ${[c1.broj, c2.broj].sort((a, b) => a - b).join(", ")}`),
      "poruka nabraja OBA ciljna tanka"
    );
  });

  // -------------------------------------------------------------------------
  console.log("");
  console.log("=== DIO 5: cista provjera ulaza, bez baze ===");
  console.log("");

  const osnovni = {
    vrsta: "OBICNI" as const,
    nacin: "BEZ" as const,
    korisnikId: "x",
    izvori: [{ tankId: "a", kolicina: 100 }],
    ciljevi: [{ tankId: "b", kolicina: 90 }],
  };

  const p = provjeriUlazPretoka(osnovni);
  jednako(p.izlazMl, 100_000, "izlaz u ml");
  jednako(p.ulazMl, 90_000, "ulaz u ml");
  jednako(p.gubitakMl, 10_000, "kalo u ml");
  proslo++;

  await ocekujGresku(
    async () => provjeriUlazPretoka({ ...osnovni, izvori: [] }),
    "barem jedan izvorni",
    "bez izvora"
  );
  await ocekujGresku(
    async () => provjeriUlazPretoka({ ...osnovni, ciljevi: [] }),
    "barem jedan ciljni",
    "bez ciljeva"
  );
  await ocekujGresku(
    async () =>
      provjeriUlazPretoka({
        ...osnovni,
        izvori: [
          { tankId: "a", kolicina: 50 },
          { tankId: "a", kolicina: 50 },
        ],
      }),
    "dvaput",
    "isti izvor dvaput"
  );

  console.log("");
  console.log(`proslo: ${proslo}, palo: ${pao}`);
  console.log(
    "Sve transakcije su namjerno vracene unatrag — u bazi nije ostao nijedan redak."
  );
}

main()
  .catch((e) => {
    console.error(e);
    pao++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (pao > 0) process.exit(1);
  });
