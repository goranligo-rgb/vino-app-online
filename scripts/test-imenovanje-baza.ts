/**
 * Provjera RUCNOG IMENOVANJA VINA (faza 5), nad pravom bazom.
 *
 * Pokretanje:  npm run test:imenovanje:baza
 *
 * SIGURNOST — isti obrazac kao scripts/test-vino-radnje.ts:
 *   - svaki scenarij radi u vlastitoj transakciji koja NA KRAJU NAMJERNO PUKNE,
 *     pa se sve vraca unatrag; u bazi ne ostaje nijedan redak;
 *   - radi ISKLJUCIVO nad tankovima koje sam stvori, s brojevima iznad
 *     najveceg postojeceg.
 *
 * STO DOKAZUJE
 *   1. Imenovanje upisuje cin (RUCNO, razlog, tko, kada), ekran cita novo ime,
 *      `Tank.nazivVina` se NE pise (faza 5), dnevnik biljezi samo stupce.
 *   2. Bez razloga, bez imena i sorte, bez promjene, u prazan i nepostojeci
 *      tank — odbijeno, i NISTA se ne upise.
 *   3. Nesklad deklarirane sorte s knjigom NE brani upis; `Tank.sorta` se zrcali.
 *   4. Preimenovanje prezivi pretok iako je stupac zamrznut — motor ime cita
 *      izvedeno.
 *   5. Kopija u povijest (arhiva) nosi izvedeno ime; pitanje za "zadnje vino"
 *      vraca ime vina koje je upravo izaslo.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { izvrsiPretok } from "../lib/pretok-motor";
import { granicaVina } from "../lib/granica-vina";
import { imeVina, imeVinaSada, zabiljeziImenovanje } from "../lib/ime-vina";
import { ImenovanjeGreska, imenujVinoRucno } from "../lib/imenovanje-rucno";
import { arhivirajPotroseniTank } from "../lib/pretok-arhiviranje";

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
      ime: "TEST imenovanje",
      email: `test-imenovanje-${redni++}-${Date.now()}@example.invalid`,
      password: "nije-u-upotrebi",
      role: "PODRUM",
    },
  });
}

const POCETAK = new Date("2020-01-01T00:00:00Z");

/**
 * Tank s vinom koje knjiga zna i koje je vec imenovano — kako ga je ostavilo
 * punjenje. Prazan tank (`litre = 0`) nema ni knjigu ni ime.
 */
async function napraviTank(
  tx: Tx,
  litre: number,
  naziv: string | null = null,
  sorta: string | null = null
) {
  const tank = await tx.tank.create({
    data: {
      broj: sljedeciBroj++,
      kapacitet: 50000,
      kolicinaVinaUTanku: litre,
      nazivVina: naziv,
      sorta,
      nadzorHladjenja: false,
      smsAktivan: false,
      samokontrolaAktivna: false,
    },
  });

  if (litre > 0) {
    const berba = await tx.berba.create({
      data: {
        vrstaUnosa: "ZATECENO",
        nazivSorte: sorta ?? "Grasevina",
        kolicinaLitara: litre,
        prviTankId: tank.id,
      },
    });
    await tx.berbaKretanje.create({
      data: {
        berbaId: berba.id,
        uTankId: tank.id,
        litre,
        vrsta: "ULAZ",
        dogodenoAt: POCETAK,
        createdAt: POCETAK,
      },
    });
    await zabiljeziImenovanje(tx, {
      tankId: tank.id,
      odAt: POCETAK,
      naziv,
      deklariranaSorta: sorta,
      izvor: "PUNJENJE",
      bioPrazan: true,
    });
  }

  return tank;
}

async function ekran(tx: Tx, tankId: string) {
  return imeVina(tx, tankId, await granicaVina(tx, tankId));
}

/** Pokusaj koji MORA biti odbijen — vraca poruku ili `null` ako je prosao. */
async function odbijeno(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof ImenovanjeGreska) return e.message;
    throw e;
  }
}

async function main() {
  const najveci = await prisma.tank.aggregate({ _max: { broj: true } });
  sljedeciBroj = (najveci._max.broj ?? 0) + 6000;

  console.log("");
  console.log("RUCNO IMENOVANJE VINA — provjera nad pravom bazom");
  console.log("");

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 1: imenovanje upisuje cin, ekran cita novo ime, stupci i dnevnik prate",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const t = await napraviTank(tx, 1000, "TEST Grasevina", "Grasevina");
      const sada = new Date("2026-09-11T12:00:00Z");

      const r = await imenujVinoRucno(tx, {
        tankId: t.id,
        naziv: "  TEST Grasevina 2025  ",
        deklariranaSorta: "Grasevina",
        razlog: "ispravak — dodano godiste",
        korisnikId: u.id,
        sada,
      });

      jednako(r.prije.naziv, "TEST Grasevina", "prije: ime kakvo je bilo");
      jednako(r.poslije.naziv, "TEST Grasevina 2025", "poslije: novo ime, obrezano");

      const zapisi = await tx.imeVina.findMany({
        where: { tankId: t.id, izvor: "RUCNO" },
      });
      jednako(zapisi.length, 1, "tocno jedan rucni zapis");
      jednako(zapisi[0]?.razlog, "ispravak — dodano godiste", "zapis nosi razlog");
      jednako(zapisi[0]?.korisnikId, u.id, "zapis nosi tko je imenovao");
      jednako(zapisi[0]?.odAt.toISOString(), sada.toISOString(), "zapis nosi trenutak cina");
      jednako(zapisi[0]?.deklariranaSorta, "Grasevina", "zapis nosi deklariranu sortu");

      jednako((await ekran(tx, t.id)).naziv, "TEST Grasevina 2025", "ekran cita novo ime");

      const stupci = await tx.tank.findUniqueOrThrow({ where: { id: t.id } });
      jednako(stupci.nazivVina, "TEST Grasevina", "Tank.nazivVina se NE pise (faza 5)");
      jednako(stupci.sorta, "Grasevina", "Tank.sorta nepromijenjen");

      // Dnevnik izmjena tanka biljezi stupce; mijenja se samo ime, a ono nije
      // stupac — tko, kad i zasto stoji na samom cinu.
      const dnevnik = await tx.activityLog.findMany({
        where: { entityType: "Tank", entityId: t.id },
      });
      jednako(dnevnik.length, 0, "dnevnik: nista, nijedan stupac se nije promijenio");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 2: odbijeni pokusaji ne upisuju nista",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const t = await napraviTank(tx, 1000, "TEST Grasevina", "Grasevina");
      const prazan = await napraviTank(tx, 0);
      const osnovno = {
        tankId: t.id,
        naziv: "TEST Novo ime",
        deklariranaSorta: "Grasevina",
        razlog: "test",
        korisnikId: u.id,
      };

      jednako(
        await odbijeno(() => imenujVinoRucno(tx, { ...osnovno, razlog: "   " })),
        "Upiši razlog promjene imena.",
        "bez razloga"
      );
      jednako(
        await odbijeno(() =>
          imenujVinoRucno(tx, { ...osnovno, naziv: "", deklariranaSorta: " " })
        ),
        "Upiši naziv vina ili deklariranu sortu.",
        "bez imena i sorte"
      );
      jednako(
        await odbijeno(() =>
          imenujVinoRucno(tx, { ...osnovno, naziv: "TEST Grasevina" })
        ),
        "Naziv i deklarirana sorta su isti kao sada — nema se što upisati.",
        "nista se nije promijenilo"
      );
      jednako(
        await odbijeno(() => imenujVinoRucno(tx, { ...osnovno, tankId: prazan.id })),
        `Tank ${prazan.broj} je prazan — nema vina koje bi se imenovalo.`,
        "prazan tank"
      );
      jednako(
        await odbijeno(() =>
          imenujVinoRucno(tx, { ...osnovno, tankId: "00000000-0000-0000-0000-000000000000" })
        ),
        "Tank ne postoji.",
        "nepostojeci tank"
      );

      jednako(
        await tx.imeVina.count({ where: { tankId: { in: [t.id, prazan.id] }, izvor: "RUCNO" } }),
        0,
        "nijedan rucni zapis nije nastao"
      );
      jednako(
        (await tx.tank.findUniqueOrThrow({ where: { id: t.id } })).nazivVina,
        "TEST Grasevina",
        "stupac nije diran"
      );
      jednako(
        await tx.activityLog.count({ where: { entityId: { in: [t.id, prazan.id] } } }),
        0,
        "dnevnik prazan"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 3: nesklad deklarirane sorte s knjigom ne brani upis",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const t = await napraviTank(tx, 1000, null, "Grasevina");

      const r = await imenujVinoRucno(tx, {
        tankId: t.id,
        naziv: "TEST Muskat za etiketu",
        deklariranaSorta: "Muskat zuti",
        razlog: "test nesklada",
        korisnikId: u.id,
      });

      jednako(r.prije.naziv, null, "prije: bezimeno (samo sorta)");
      jednako(r.poslije.naziv, "TEST Muskat za etiketu", "ime upisano");
      jednako(r.poslije.deklariranaSorta, "Muskat zuti", "deklarirana sorta upisana");
      jednako(
        (await tx.tank.findUniqueOrThrow({ where: { id: t.id } })).sorta,
        "Muskat zuti",
        "Tank.sorta zrcaljen (ne gasi se u fazi 5)"
      );

      const dnevnik = await tx.activityLog.findMany({
        where: { entityType: "Tank", entityId: t.id },
      });
      jednako(dnevnik.length, 1, "dnevnik: jedan redak za promijenjenu sortu");
      jednako(
        (dnevnik[0]?.payload as { polje?: string } | null)?.polje,
        "sorta",
        "dnevnik: polje je sorta"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 4: preimenovanje prezivi pretok u prazan tank",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, 1000, "TEST Staro ime", "Grasevina");
      const cilj = await napraviTank(tx, 0);

      await imenujVinoRucno(tx, {
        tankId: izvor.id,
        naziv: "TEST Novo ime",
        deklariranaSorta: "Grasevina",
        razlog: "test pretoka",
        korisnikId: u.id,
      });

      const pretok = await tx.pretok.create({
        data: { ciljTankId: cilj.id, tip: "OBICNI", korisnikId: u.id },
      });

      await izvrsiPretok(tx, {
        izvori: [{ tankId: izvor.id, kolicina: 400 }],
        ciljevi: [{ tankId: cilj.id, kolicina: 400 }],
        vrsta: "OBICNI",
        nacin: "BEZ",
        nacinNapomena: null,
        napomena: null,
        korisnikId: u.id,
        pretokId: pretok.id,
        dogodenoAt: pretok.datum,
        noviIdentitet: null,
      });

      jednako((await ekran(tx, cilj.id)).naziv, "TEST Novo ime", "cilj nosi NOVO ime");
      jednako((await ekran(tx, izvor.id)).naziv, "TEST Novo ime", "izvor zadrzava novo ime");
      jednako(
        (await tx.tank.findUniqueOrThrow({ where: { id: izvor.id } })).nazivVina,
        "TEST Staro ime",
        "stupac izvora je zamrznut, a ime ipak putuje — motor ga ne cita"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 5: kopija u povijest nosi IZVEDENO ime, i kad je vino upravo otislo",
    async (tx) => {
      const u = await napraviKorisnika(tx);
      const t = await napraviTank(tx, 1000, "TEST Zamrznut stupac", "Grasevina");

      await imenujVinoRucno(tx, {
        tankId: t.id,
        naziv: "TEST Pravo ime",
        deklariranaSorta: "Grasevina",
        razlog: "test kopije",
        korisnikId: u.id,
        sada: new Date("2026-01-01T00:00:00Z"),
      });

      // Arhiva iz pretoka — ime iz cina, ne sa stupca.
      const tank = await tx.tank.findUniqueOrThrow({ where: { id: t.id } });
      const arhiva = await arhivirajPotroseniTank(tx, tank, 1000, "TEST");
      jednako(arhiva.nazivVina, "TEST Pravo ime", "arhiva nosi izvedeno ime");

      // Vino je OTISLO (knjiga: izlaz iz podruma) — obicno pitanje nema ime,
      // a pitanje za zadnje vino vraca ime onoga koje je izaslo.
      const berba = await tx.berba.findFirstOrThrow({ where: { prviTankId: t.id } });
      await tx.berbaKretanje.create({
        data: {
          berbaId: berba.id,
          izTankId: t.id,
          litre: 1000,
          vrsta: "IZLAZ",
          dogodenoAt: new Date("2026-02-01T00:00:00Z"),
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
      });

      jednako((await imeVinaSada(tx, t.id)).naziv, null, "prazan tank nema ime");
      jednako(
        (await imeVinaSada(tx, t.id, { zadnjeVino: true })).naziv,
        "TEST Pravo ime",
        "zadnje vino: ime vina koje je upravo izaslo"
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
