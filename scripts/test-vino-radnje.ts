/**
 * Provjera da RADNJE PUTUJU S VINOM (`VinoRadnja`), nad pravom bazom.
 *
 * Pokretanje:  npm run test:vino:radnje
 *
 * SIGURNOST — isti obrazac kao scripts/test-pretok-motor.ts:
 *   - svaki scenarij radi u vlastitoj transakciji koja NA KRAJU NAMJERNO PUKNE,
 *     pa se sve vraca unatrag; u bazi ne ostaje nijedan redak;
 *   - radi ISKLJUCIVO nad tankovima koje sam stvori, s brojevima iznad
 *     najveceg postojeceg.
 * Zato ga je sigurno pokrenuti i tijekom berbe.
 *
 * STO DOKAZUJE
 *   1. Pretok prenosi radnju u cilj, s oznakom izvornog tanka.
 *   2. Cuvée iz PET izvora koji svi nose ISTU izvornu radnju ne duplicira je —
 *      redak je jedan, a udio je zbroj svih pet putova. To je razlika izmedju
 *      odbacivanja po kljucu (tocno) i odbacivanja po sadrzaju (pojede udio).
 *   3. Kaskada mnozi udio: radnja razrijedena na pola pa opet na pola daje
 *      cetvrtinu.
 *   4. Ponistavanje pretoka vraca stanje na prije.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { uMl } from "../lib/filtracija";
import { izvrsiPretok } from "../lib/pretok-motor";
import { upisiVinoRadnju, preracunajVinoRadnje } from "../lib/vino-radnja";

type Tx = Prisma.TransactionClient;

let pao = 0;
let proslo = 0;
let redni = 0;
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

function blizu(dobiveno: number, ocekivano: number, poruka: string, eps = 0.001) {
  if (Math.abs(dobiveno - ocekivano) <= eps) {
    proslo++;
    return;
  }
  pao++;
  console.log(`  PAO: ${poruka}`);
  console.log(`       ocekivano: ${ocekivano} (±${eps})`);
  console.log(`       dobiveno:  ${dobiveno}`);
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

async function napraviKorisnika(tx: Tx) {
  return tx.user.create({
    data: {
      ime: "TEST vino radnje",
      email: `test-vino-radnje-${redni++}-${Date.now()}@example.invalid`,
      password: "nije-u-upotrebi",
      role: "PODRUM",
    },
  });
}

async function napraviTank(tx: Tx, kolicina: number, kapacitet = 50000) {
  return tx.tank.create({
    data: {
      broj: sljedeciBroj++,
      kapacitet,
      kolicinaVinaUTanku: kolicina,
      nazivVina: "TEST vino",
      sorta: "Grasevina",
      nadzorHladjenja: false,
      smsAktivan: false,
      samokontrolaAktivna: false,
    },
  });
}

/**
 * Dodavanje preparata u tank: `Radnja` + `VinoRadnja`, tocno kako to radi
 * izvrsenje zadatka (app/api/zadatak/route.ts).
 */
async function dodajURadnju(
  tx: Tx,
  tankId: string,
  korisnikId: string,
  opis: string,
  kada?: Date
) {
  const radnja = await tx.radnja.create({
    data: {
      tankId,
      korisnikId,
      vrsta: "DODAVANJE",
      opis,
      ...(kada ? { createdAt: kada } : {}),
    },
  });

  await upisiVinoRadnju(tx, {
    radnjaId: radnja.id,
    tankId,
    vrsta: "DODAVANJE",
    opis,
    dogodenoAt: radnja.createdAt,
    korisnikId,
  });

  return radnja;
}

/**
 * Knjiga mora znati za vino, inace pretok pise ZATECENO retke.
 *
 * `kada` se zadaje IZRICITO i namjerno u proslost. Unutar jedne transakcije
 * Postgresov `now()` vraca trenutak POCETKA transakcije za svaki redak, pa
 * `createdAt` svih redaka scenarija ispadne isti — a sat lanca uzima raniji od
 * `dogodenoAt` i `createdAt` (vidi `satKretanja`). U pogonu je svaki cin svoja
 * transakcija pa se to ne dogada; u testu se kronologija mora napisati rukom.
 */
async function zabiljeziPocetak(
  tx: Tx,
  tankId: string,
  litre: number,
  kada = new Date("2020-01-01T00:00:00Z")
) {
  const berba = await tx.berba.create({
    data: {
      vrstaUnosa: "ZATECENO",
      nazivSorte: "Grasevina",
      kolicinaLitara: litre,
      prviTankId: tankId,
    },
  });

  await tx.berbaKretanje.create({
    data: {
      berbaId: berba.id,
      uTankId: tankId,
      litre,
      vrsta: "ULAZ",
      dogodenoAt: kada,
      createdAt: kada,
    },
  });
}

async function redci(tx: Tx, tankId: string) {
  return tx.vinoRadnja.findMany({ where: { tankId } });
}

async function main() {
  const najveci = await prisma.tank.aggregate({ _max: { broj: true } });
  sljedeciBroj = (najveci._max.broj ?? 0) + 5000;

  console.log("");
  console.log("RADNJE PUTUJU S VINOM — provjera nad pravom bazom");
  console.log("");

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 1: pretok prenosi radnju u cilj, s oznakom izvornog tanka",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, 1000);
      const cilj = await napraviTank(tx, 0);

      await zabiljeziPocetak(tx, izvor.id, 1000);
      const radnja = await dodajURadnju(tx, izvor.id, u.id, "TEST kvasac");

      jednako((await redci(tx, izvor.id)).length, 1, "izvor ima redak");
      jednako((await redci(tx, cilj.id)).length, 0, "cilj jos nema nista");

      await izvrsiPretok(tx, {
        izvori: [{ tankId: izvor.id, kolicina: 400 }],
        ciljevi: [{ tankId: cilj.id, kolicina: 400 }],
        vrsta: "OBICNI",
        nacin: "BEZ",
        korisnikId: u.id,
      });

      const uCilju = await redci(tx, cilj.id);

      jednako(uCilju.length, 1, "cilj je dobio tocno jedan redak");
      jednako(
        uCilju[0]?.izvornaRadnjaId,
        radnja.id,
        "redak pokazuje na izvornu radnju"
      );
      jednako(
        uCilju[0]?.izvorniTankId,
        izvor.id,
        "izvorni tank je onaj u kojem je cin izveden"
      );
      jednako(
        uCilju[0]?.izvorniBrojTanka,
        izvor.broj,
        "broj izvornog tanka je prepisan"
      );
      blizu(uCilju[0]?.udio ?? 0, 1, "cilj je bio prazan pa je udio 1");

      // Izvor je ostao s 600 L svog vina — udio se odlaskom ne mijenja.
      const uIzvoru = await redci(tx, izvor.id);
      jednako(uIzvoru.length, 1, "izvor je zadrzao svoj redak");
      blizu(uIzvoru[0]?.udio ?? 0, 1, "izvoru se udio nije promijenio");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 2: cilj koji vec ima svoje vino razrjeduje dolazno",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, 1000);
      const cilj = await napraviTank(tx, 1000);

      await zabiljeziPocetak(tx, izvor.id, 1000);
      await zabiljeziPocetak(tx, cilj.id, 1000);

      await dodajURadnju(tx, izvor.id, u.id, "TEST kvasac izvora");
      await dodajURadnju(tx, cilj.id, u.id, "TEST kvasac cilja");

      await izvrsiPretok(tx, {
        izvori: [{ tankId: izvor.id, kolicina: 1000 }],
        ciljevi: [{ tankId: cilj.id, kolicina: 1000 }],
        vrsta: "CUVEE",
        nacin: "BEZ",
        korisnikId: u.id,
        noviIdentitet: { nazivVina: "TEST cuvee", sorta: "Cuvee", godiste: 2026 },
      });

      const uCilju = await redci(tx, cilj.id);

      jednako(uCilju.length, 2, "cilj ima oba retka");

      for (const r of uCilju) {
        blizu(r.udio, 0.5, `udio ${r.opis} je pola`);
      }

      blizu(
        uCilju.reduce((z, r) => z + r.udio, 0),
        1,
        "zbroj udjela je 1 — nista bez zapisa"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 3: cuvée iz PET izvora s istom radnjom — jedan redak, zbrojen udio",
    async (tx) => {
      const u = await napraviKorisnika(tx);

      // Jedan tank s jednom radnjom, pa iz njega u pet tankova. Svih pet od
      // tada nosi ISTU izvornu radnju.
      const izvorSvega = await napraviTank(tx, 5000);
      await zabiljeziPocetak(tx, izvorSvega.id, 5000);
      const radnja = await dodajURadnju(tx, izvorSvega.id, u.id, "TEST kvasac");

      const posrednici = [];
      for (let i = 0; i < 5; i++) posrednici.push(await napraviTank(tx, 0));

      await izvrsiPretok(tx, {
        izvori: [{ tankId: izvorSvega.id, kolicina: 5000 }],
        ciljevi: posrednici.map((p) => ({ tankId: p.id, kolicina: 1000 })),
        vrsta: "OBICNI",
        nacin: "BEZ",
        korisnikId: u.id,
      });

      for (const p of posrednici) {
        const r = await redci(tx, p.id);
        jednako(r.length, 1, `posrednik ${p.broj} nosi radnju`);
        blizu(r[0]?.udio ?? 0, 1, `posrednik ${p.broj} je cijeli od te radnje`);
      }

      // Sada svih pet u jedan cuvée.
      const cuvee = await napraviTank(tx, 0);

      await izvrsiPretok(tx, {
        izvori: posrednici.map((p) => ({ tankId: p.id, kolicina: 1000 })),
        ciljevi: [{ tankId: cuvee.id, kolicina: 5000 }],
        vrsta: "CUVEE",
        nacin: "BEZ",
        korisnikId: u.id,
        noviIdentitet: { nazivVina: "TEST cuvee", sorta: "Cuvee", godiste: 2026 },
      });

      const uCuveeu = await redci(tx, cuvee.id);

      jednako(uCuveeu.length, 1, "pet putova, JEDAN redak");
      jednako(
        uCuveeu[0]?.izvornaRadnjaId,
        radnja.id,
        "i to onaj s izvornom radnjom"
      );
      blizu(
        uCuveeu[0]?.udio ?? 0,
        1,
        "udio je ZBROJ svih pet putova, ne udio jednoga"
      );
      jednako(
        uCuveeu[0]?.izvorniTankId,
        izvorSvega.id,
        "oznaka izvornog tanka prezivjela je dva pretoka"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 4: kaskada mnozi — pola pa opet pola daje cetvrtinu",
    async (tx) => {
      const u = await napraviKorisnika(tx);

      const a = await napraviTank(tx, 1000);
      const b = await napraviTank(tx, 1000);
      const c = await napraviTank(tx, 1000);

      await zabiljeziPocetak(tx, a.id, 1000);
      await zabiljeziPocetak(tx, b.id, 1000);
      await zabiljeziPocetak(tx, c.id, 1000);

      await dodajURadnju(tx, a.id, u.id, "TEST kvasac");

      // A -> B: 1000 L u tank koji vec ima 1000 L => udio 1/2
      await izvrsiPretok(tx, {
        izvori: [{ tankId: a.id, kolicina: 1000 }],
        ciljevi: [{ tankId: b.id, kolicina: 1000 }],
        vrsta: "CUVEE",
        nacin: "BEZ",
        korisnikId: u.id,
        noviIdentitet: { nazivVina: "TEST 1", sorta: "Cuvee", godiste: 2026 },
      });

      const uB = await redci(tx, b.id);
      blizu(uB[0]?.udio ?? 0, 0.5, "u B je pola");

      // B -> C: 1000 L (od 2000) u tank koji ima 1000 L => 1/2 * 1000/2000... ne:
      // iz B izlazi 1000 od 2000 L, u C koji ima 1000 => poslije 2000,
      // udio = 0.5 * 1000/2000 = 0.25
      await izvrsiPretok(tx, {
        izvori: [{ tankId: b.id, kolicina: 1000 }],
        ciljevi: [{ tankId: c.id, kolicina: 1000 }],
        vrsta: "CUVEE",
        nacin: "BEZ",
        korisnikId: u.id,
        noviIdentitet: { nazivVina: "TEST 2", sorta: "Cuvee", godiste: 2026 },
      });

      const uC = await redci(tx, c.id);
      jednako(uC.length, 1, "C ima jedan redak");
      blizu(uC[0]?.udio ?? 0, 0.25, "u C je cetvrtina");
      jednako(uC[0]?.izvorniTankId, a.id, "izvorni tank je i dalje A");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 5: izvor koji padne na nulu ne ostavlja zaostale retke",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, 1000);
      const cilj = await napraviTank(tx, 0);

      await zabiljeziPocetak(tx, izvor.id, 1000);
      await dodajURadnju(tx, izvor.id, u.id, "TEST kvasac");

      await izvrsiPretok(tx, {
        izvori: [{ tankId: izvor.id, kolicina: 1000 }],
        ciljevi: [{ tankId: cilj.id, kolicina: 1000 }],
        vrsta: "OBICNI",
        nacin: "BEZ",
        korisnikId: u.id,
      });

      jednako(
        (await redci(tx, izvor.id)).length,
        0,
        "ispraznjen izvor je ocisten"
      );
      jednako((await redci(tx, cilj.id)).length, 1, "cilj je preuzeo radnju");

      // POVIJEST OSTAJE NA TANKU (faza D). Prije je pretok izvor arhivirao i
      // radnju prepisivao u `ArhivaVinaRadnja`; sada se ne arhivira nista, a
      // sam `Radnja` redak nikad se ni prije nije brisao. Ono sto se cisti su
      // samo UDJELI (`VinoRadnja`), jer oni opisuju vino koje je otislo.
      jednako(
        await tx.arhivaVinaRadnja.count({ where: { tankId: izvor.id } }),
        0,
        "pretok ne stvara arhivu radnje — ne arhivira se"
      );
      jednako(
        await tx.radnja.count({ where: { tankId: izvor.id } }),
        1,
        "sama radnja je i dalje na tanku, nije izgubljena"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 6: preracun iz knjige vraca isto sto je prijenos upisao",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, 1000);
      const cilj = await napraviTank(tx, 1000);

      await zabiljeziPocetak(tx, izvor.id, 1000);
      await zabiljeziPocetak(tx, cilj.id, 1000);
      await dodajURadnju(
        tx,
        izvor.id,
        u.id,
        "TEST kvasac",
        new Date("2020-01-02T00:00:00Z")
      );

      // `pretokId` je OBAVEZAN da motor pretok uopce knjizi (vidi korak 9 u
      // lib/pretok-motor.ts). Bez njega knjiga o pretoku ne zna nista, pa ni
      // preracun iz knjige ne bi imao sto vratiti — a bas to se ovdje mjeri.
      const zapisPretoka = await tx.pretok.create({
        data: { ciljTankId: cilj.id, tip: "CUVEE", korisnikId: u.id },
      });

      await izvrsiPretok(tx, {
        izvori: [{ tankId: izvor.id, kolicina: 500 }],
        ciljevi: [{ tankId: cilj.id, kolicina: 500 }],
        vrsta: "CUVEE",
        nacin: "BEZ",
        korisnikId: u.id,
        pretokId: zapisPretoka.id,
        noviIdentitet: { nazivVina: "TEST", sorta: "Cuvee", godiste: 2026 },
      });

      const prije = (await redci(tx, cilj.id)).map((r) => ({
        id: r.izvornaRadnjaId,
        udio: Math.round(r.udio * 1e6),
      }));

      // Isti racun, drugi put: preracun iz knjige mora dati isti rezultat kao
      // prijenos. Kad se razidu, jedno od dvoga je krivo — a ponistavanje se
      // oslanja bas na preracun.
      await preracunajVinoRadnje(tx, [cilj.id]);

      const poslije = (await redci(tx, cilj.id)).map((r) => ({
        id: r.izvornaRadnjaId,
        udio: Math.round(r.udio * 1e6),
      }));

      jednako(
        JSON.stringify(poslije.sort((x, y) => x.id.localeCompare(y.id))),
        JSON.stringify(prije.sort((x, y) => x.id.localeCompare(y.id))),
        "prijenos i preracun daju isto"
      );
      blizu(
        poslije.reduce((z, r) => z + r.udio / 1e6, 0),
        1 / 3,
        "500 od 1500 L nosi radnju — trecina"
      );
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

  // `uMl` se uvozi da test i motor racunaju istim mjerama; ovdje samo dokazuje
  // da uvoz nije mrtav.
  void uMl;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
