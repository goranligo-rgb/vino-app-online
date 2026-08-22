/**
 * Provjera CIJELOG tijeka prijenosa vina nad pravom bazom.
 *
 * Pokretanje:  npm run test:filtracija:baza
 *
 * SIGURNOST — procitaj prije pokretanja:
 *   - svaki scenarij radi u vlastitoj transakciji koja NA KRAJU NAMJERNO PUKNE,
 *     pa se sve vraca unatrag; u bazi ne ostaje nijedan redak;
 *   - radi ISKLJUCIVO nad tankovima koje sam stvori, s brojevima iznad
 *     najveceg postojeceg. Nijedan pravi tank se ne cita, ne mijenja i ne
 *     zakljucava — SELECT FOR UPDATE u zakljucajTankove pogadja samo retke
 *     nastale unutar iste transakcije;
 *   - i korisnik je sintetski, s @example.invalid adresom.
 * Zato ga je sigurno pokrenuti i tijekom berbe. Ipak nije dio nijednog build
 * koraka — pokrece se rucno i svjesno, jer ipak otvara transakciju nad
 * produkcijskom bazom.
 *
 * Cistu matematiku ponderiranja pokriva scripts/test-ponderirano.ts.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  izvrsiFiltraciju,
  ponistiFiltraciju,
  FiltracijaGreska,
  NAPOMENA_BEZ_PARAMETARA,
  type FiltracijaSnapshot,
} from "../lib/filtracija";

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

/** Baca se na kraju svakog scenarija da transakcija padne i sve se vrati. */
class Rollback extends Error {}

let sljedeciBroj = 0;

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
      ime: "TEST prijenos",
      email: `test-prijenos-${sljedeciBroj++}-${Date.now()}@example.invalid`,
      password: "nije-u-upotrebi",
      role: "PODRUM",
    },
  });
}

async function napraviTank(
  tx: Tx,
  podaci: {
    kapacitet: number;
    kolicina: number;
    nazivVina?: string | null;
    sorta?: string | null;
    godiste?: number | null;
  }
) {
  return tx.tank.create({
    data: {
      broj: sljedeciBroj++,
      kapacitet: podaci.kapacitet,
      kolicinaVinaUTanku: podaci.kolicina,
      nazivVina: podaci.nazivVina ?? null,
      sorta: podaci.sorta ?? null,
      godiste: podaci.godiste ?? null,
      // Sintetski tank nema kontroler hladjenja: nista ga ne proziva.
      nadzorHladjenja: false,
      smsAktivan: false,
      samokontrolaAktivna: false,
    },
  });
}

async function napraviZadatak(
  tx: Tx,
  args: {
    izvorTankId: string;
    userId: string;
    kolicinaIzlaz: number;
    ciljevi: Array<{ tankId: string; kolicina: number }>;
    napomena?: string | null;
    vrsta?: "FILTRACIJA" | "FLOTACIJA" | "TALOZENJE";
    maceracija?: boolean | null;
    maceracijaOpis?: string | null;
  }
) {
  return tx.zadatak.create({
    data: {
      tankId: args.izvorTankId,
      zadaoKorisnikId: args.userId,
      vrsta: args.vrsta ?? "FILTRACIJA",
      maceracija: args.maceracija ?? null,
      maceracijaOpis: args.maceracijaOpis ?? null,
      status: "OTVOREN",
      naslov: "TEST prijenos",
      napomena: args.napomena ?? null,
      kolicinaIzlaz: args.kolicinaIzlaz,
      tankStavke: {
        create: args.ciljevi.map((c, i) => ({
          ciljTankId: c.tankId,
          kolicina: c.kolicina,
          redoslijed: i,
        })),
      },
    },
  });
}

function snapshotIz(zadatak: { snapshotJson: unknown }): FiltracijaSnapshot {
  return zadatak.snapshotJson as unknown as FiltracijaSnapshot;
}

async function main() {
  // Brojevi tankova krecu IZNAD najveceg postojeceg, da se ni slucajno ne
  // sudare s pravim tankom. (Sve se ionako vraca unatrag.)
  const najveci = await prisma.tank.aggregate({ _max: { broj: true } });
  sljedeciBroj = (najveci._max.broj ?? 0) + 1000;
  console.log(`Sintetski tankovi krecu od broja ${sljedeciBroj}.`);
  console.log("");

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 1: prijenos u PRAZAN tank kopira parametre izvora",
    async (tx) => {
      const user = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, {
        kapacitet: 2000,
        kolicina: 1000,
        nazivVina: "TEST vino",
        sorta: "Grasevina",
        godiste: 2025,
      });
      const cilj = await napraviTank(tx, { kapacitet: 2000, kolicina: 0 });

      await tx.mjerenje.create({
        data: {
          tankId: izvor.id,
          alkohol: 13.2,
          ukupneKiseline: 6.4,
          ph: 3.44,
          secer: 2.1,
        },
      });

      const zadatak = await napraviZadatak(tx, {
        izvorTankId: izvor.id,
        userId: user.id,
        kolicinaIzlaz: 1000,
        ciljevi: [{ tankId: cilj.id, kolicina: 950 }],
      });

      await izvrsiFiltraciju(tx, {
        zadatakId: zadatak.id,
        izvrsioKorisnikId: user.id,
      });

      const mjerenjaCilja = await tx.mjerenje.findMany({
        where: { tankId: cilj.id },
      });

      jednako(mjerenjaCilja.length, 1, "ciljni tank ima tocno jedno mjerenje");

      const m = mjerenjaCilja[0];
      jednako(m.alkohol, 13.2, "alkohol prepisan s izvora");
      jednako(m.ukupneKiseline, 6.4, "ukupneKiseline prepisane");
      jednako(m.ph, 3.44, "ph prepisan");
      jednako(m.secer, 2.1, "secer prepisan");
      jednako(m.temperatura, null, "polje kojeg izvor nema ostaje null");
      jednako(m.jeRucno, false, "mjerenje je oznaceno kao automatsko");
      jednako(m.korisnikId, null, "automatsko mjerenje nema korisnika");

      const poslije = await tx.zadatak.findUniqueOrThrow({
        where: { id: zadatak.id },
      });
      jednako(poslije.status, "IZVRSEN", "zadatak je izvrsen");
      jednako(poslije.gubitakLitara, 50, "kalo je 1000 - 950 = 50 L");
      jednako(
        snapshotIz(poslije).autoMjerenjaIds?.length,
        1,
        "snapshot pamti id automatskog mjerenja"
      );
      jednako(
        snapshotIz(poslije).autoMjerenjaIds?.[0],
        m.id,
        "u snapshotu je tocno taj id"
      );

      const ciljPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: cilj.id },
      });
      jednako(ciljPoslije.kolicinaVinaUTanku, 950, "u cilju je 950 L");
      jednako(ciljPoslije.nazivVina, "TEST vino", "prazan cilj preuzeo identitet");

      const radnja = await tx.radnja.findFirstOrThrow({
        where: { tankId: izvor.id },
      });
      tvrdi(
        !(radnja.napomena ?? "").includes(NAPOMENA_BEZ_PARAMETARA),
        "radnja NEMA napomenu o neprenesenim parametrima"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 2: prijenos u PUN tank daje ponderirani prosjek",
    async (tx) => {
      const user = await napraviKorisnika(tx);
      // Izvor: 1000 L, alkohol 12,0 / kiseline 6,4 / pH 3,44. Bez secera.
      const izvor = await napraviTank(tx, { kapacitet: 2000, kolicina: 1000 });
      // Cilj: vec 300 L, alkohol 14,0 / kiseline 5,0 / pH 3,30 / secer 2,0.
      const cilj = await napraviTank(tx, {
        kapacitet: 2000,
        kolicina: 300,
        nazivVina: "TEST zateceno",
      });

      await tx.mjerenje.create({
        data: { tankId: izvor.id, alkohol: 12.0, ukupneKiseline: 6.4, ph: 3.44 },
      });
      await tx.mjerenje.create({
        data: {
          tankId: cilj.id,
          alkohol: 14.0,
          ukupneKiseline: 5.0,
          ph: 3.3,
          secer: 2.0,
        },
      });

      const zadatak = await napraviZadatak(tx, {
        izvorTankId: izvor.id,
        userId: user.id,
        kolicinaIzlaz: 700,
        ciljevi: [{ tankId: cilj.id, kolicina: 700 }],
      });

      await izvrsiFiltraciju(tx, {
        zadatakId: zadatak.id,
        izvrsioKorisnikId: user.id,
      });

      const novo = await tx.mjerenje.findFirstOrThrow({
        where: { tankId: cilj.id, jeRucno: false },
        orderBy: { izmjerenoAt: "desc" },
      });

      // 300 L zatecenog + 700 L dolaznog:
      jednako(novo.alkohol, 12.6, "alkohol (300*14,0 + 700*12,0)/1000 = 12,6");
      jednako(
        novo.ukupneKiseline,
        5.98,
        "kiseline (300*5,0 + 700*6,4)/1000 = 5,98"
      );
      jednako(novo.ph, 3.398, "ph (300*3,3 + 700*3,44)/1000 = 3,398");
      jednako(novo.secer, 2.0, "secer — izvor ga nema, ostaje 2,0 iz cilja");
      jednako(novo.temperatura, null, "temperatura — nema je nigdje");

      const ciljPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: cilj.id },
      });
      jednako(
        ciljPoslije.kolicinaVinaUTanku,
        1000,
        "u cilju je 300 + 700 = 1000 L"
      );
      jednako(
        ciljPoslije.nazivVina,
        "TEST zateceno",
        "pun cilj zadrzao svoj naziv"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 3: ponistavanje brise automatska mjerenja i ne blokira samo sebe",
    async (tx) => {
      const user = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, {
        kapacitet: 2000,
        kolicina: 1000,
        nazivVina: "TEST vino",
        sorta: "Grasevina",
        godiste: 2025,
      });
      const cilj = await napraviTank(tx, { kapacitet: 2000, kolicina: 0 });

      await tx.mjerenje.create({
        data: { tankId: izvor.id, alkohol: 13.2, ph: 3.44 },
      });

      const zadatak = await napraviZadatak(tx, {
        izvorTankId: izvor.id,
        userId: user.id,
        kolicinaIzlaz: 1000,
        ciljevi: [{ tankId: cilj.id, kolicina: 950 }],
      });

      await izvrsiFiltraciju(tx, {
        zadatakId: zadatak.id,
        izvrsioKorisnikId: user.id,
      });

      jednako(
        await tx.mjerenje.count({ where: { tankId: cilj.id } }),
        1,
        "prije ponistavanja cilj ima automatsko mjerenje"
      );

      // Jezgra dokaza: bez notIn nad autoMjerenjaIds, sloj 1 bi vlastito
      // mjerenje vidio kao "kasnije mjerenje" i ovdje bacio gresku.
      let greska: string | null = null;
      try {
        await ponistiFiltraciju(tx, { zadatakId: zadatak.id });
      } catch (e) {
        greska = (e as Error).message;
      }

      jednako(greska, null, "ponistavanje NIJE blokiralo samo sebe");

      jednako(
        await tx.mjerenje.count({ where: { tankId: cilj.id } }),
        0,
        "automatsko mjerenje je obrisano — nema fantoma na cilju"
      );
      jednako(
        await tx.mjerenje.count({ where: { tankId: izvor.id } }),
        1,
        "izvorno mjerenje na izvoru je netaknuto"
      );

      const izvorPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: izvor.id },
      });
      jednako(izvorPoslije.kolicinaVinaUTanku, 1000, "izvor vracen na 1000 L");
      jednako(izvorPoslije.nazivVina, "TEST vino", "izvoru vracen identitet vina");

      const ciljPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: cilj.id },
      });
      jednako(ciljPoslije.kolicinaVinaUTanku, 0, "cilj vracen na 0 L");

      const zadatakPoslije = await tx.zadatak.findUniqueOrThrow({
        where: { id: zadatak.id },
      });
      jednako(zadatakPoslije.status, "OTVOREN", "zadatak je ponovno otvoren");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 4a: izvor bez mjerenja — upis se preskace, napomena se upisuje",
    async (tx) => {
      const user = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, {
        kapacitet: 2000,
        kolicina: 1000,
        nazivVina: "TEST bez mjerenja",
      });
      const cilj = await napraviTank(tx, { kapacitet: 2000, kolicina: 0 });

      // NAMJERNO bez ijednog mjerenja na izvoru.

      const zadatak = await napraviZadatak(tx, {
        izvorTankId: izvor.id,
        userId: user.id,
        kolicinaIzlaz: 1000,
        ciljevi: [{ tankId: cilj.id, kolicina: 960 }],
        napomena: "Rucna napomena",
      });

      await izvrsiFiltraciju(tx, {
        zadatakId: zadatak.id,
        izvrsioKorisnikId: user.id,
      });

      jednako(
        await tx.mjerenje.count({ where: { tankId: cilj.id } }),
        0,
        "cilju NIJE upisan nijedan redak (nema praznog mjerenja)"
      );

      const poslije = await tx.zadatak.findUniqueOrThrow({
        where: { id: zadatak.id },
      });
      jednako(
        snapshotIz(poslije).autoMjerenjaIds?.length,
        0,
        "snapshot ima prazan popis automatskih mjerenja"
      );

      const radnja = await tx.radnja.findFirstOrThrow({
        where: { tankId: izvor.id },
      });
      tvrdi(
        (radnja.napomena ?? "").includes(NAPOMENA_BEZ_PARAMETARA),
        "radnja nosi napomenu da parametri nisu preneseni"
      );
      tvrdi(
        (radnja.napomena ?? "").includes("Rucna napomena"),
        "korisnikova napomena je sacuvana uz nju"
      );
      jednako(
        poslije.napomena,
        "Rucna napomena",
        "Zadatak.napomena NIJE prepisana"
      );

      // Prijenos je i dalje odradio svoj posao.
      const ciljPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: cilj.id },
      });
      jednako(ciljPoslije.kolicinaVinaUTanku, 960, "vino je svejedno preslo");
      jednako(poslije.gubitakLitara, 40, "kalo je izracunat");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 4b: stari zapis bez autoMjerenjaIds ponasa se tocno kao prije",
    async (tx) => {
      const user = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, { kapacitet: 2000, kolicina: 1000 });
      const cilj = await napraviTank(tx, { kapacitet: 2000, kolicina: 0 });

      await tx.mjerenje.create({ data: { tankId: izvor.id, alkohol: 13.2 } });

      const zadatak = await napraviZadatak(tx, {
        izvorTankId: izvor.id,
        userId: user.id,
        kolicinaIzlaz: 1000,
        ciljevi: [{ tankId: cilj.id, kolicina: 950 }],
      });

      await izvrsiFiltraciju(tx, {
        zadatakId: zadatak.id,
        izvrsioKorisnikId: user.id,
      });

      const izvrsen = await tx.zadatak.findUniqueOrThrow({
        where: { id: zadatak.id },
      });
      const snap = snapshotIz(izvrsen);
      const autoId = snap.autoMjerenjaIds?.[0] as string;

      // Simulacija zapisa od PRIJE ove faze: snapshot nema polje
      // autoMjerenjaIds, a ni mjerenja nema jer ga stara verzija nije stvarala.
      const bezPolja = { ...snap };
      delete (bezPolja as { autoMjerenjaIds?: string[] }).autoMjerenjaIds;

      await tx.mjerenje.delete({ where: { id: autoId } });
      await tx.zadatak.update({
        where: { id: zadatak.id },
        data: { snapshotJson: bezPolja as unknown as Prisma.InputJsonValue },
      });

      let greska: string | null = null;
      try {
        await ponistiFiltraciju(tx, { zadatakId: zadatak.id });
      } catch (e) {
        greska = (e as Error).message;
      }

      jednako(greska, null, "stari zapis se i dalje moze ponistiti");
      jednako(
        (await tx.tank.findUniqueOrThrow({ where: { id: izvor.id } }))
          .kolicinaVinaUTanku,
        1000,
        "izvor vracen na 1000 L"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 4c: PRAVO kasnije mjerenje i dalje blokira ponistavanje",
    async (tx) => {
      const user = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, { kapacitet: 2000, kolicina: 1000 });
      const cilj = await napraviTank(tx, { kapacitet: 2000, kolicina: 0 });

      await tx.mjerenje.create({ data: { tankId: izvor.id, alkohol: 13.2 } });

      const zadatak = await napraviZadatak(tx, {
        izvorTankId: izvor.id,
        userId: user.id,
        kolicinaIzlaz: 1000,
        ciljevi: [{ tankId: cilj.id, kolicina: 950 }],
      });

      await izvrsiFiltraciju(tx, {
        zadatakId: zadatak.id,
        izvrsioKorisnikId: user.id,
      });

      // Netko je poslije prijenosa RUCNO izmjerio ciljni tank.
      await tx.mjerenje.create({
        data: {
          tankId: cilj.id,
          alkohol: 13.0,
          izmjerenoAt: new Date(Date.now() + 60_000),
        },
      });

      let greska: string | null = null;
      try {
        await ponistiFiltraciju(tx, { zadatakId: zadatak.id });
      } catch (e) {
        greska = e instanceof FiltracijaGreska ? e.message : `NEOCEKIVANO: ${e}`;
      }

      tvrdi(
        (greska ?? "").includes("kasnija mjerenja"),
        "zastita nije oslabljena — rucno mjerenje i dalje blokira"
      );
      jednako(
        (await tx.tank.findUniqueOrThrow({ where: { id: izvor.id } }))
          .kolicinaVinaUTanku,
        0,
        "nista nije vraceno jer je ponistavanje odbijeno"
      );
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "FAZA 4: FLOTACIJA prolazi cijeli put, s maceracijom",
    async (tx) => {
      const user = await napraviKorisnika(tx);
      const izvor = await napraviTank(tx, {
        kapacitet: 5000,
        kolicina: 3000,
        nazivVina: "TEST most",
        sorta: "Grasevina",
        godiste: 2026,
      });
      const cilj = await napraviTank(tx, { kapacitet: 5000, kolicina: 0 });

      await tx.mjerenje.create({
        data: { tankId: izvor.id, secer: 92.5, ukupneKiseline: 8.1, ph: 3.15 },
      });

      const zadatak = await napraviZadatak(tx, {
        izvorTankId: izvor.id,
        userId: user.id,
        vrsta: "FLOTACIJA",
        maceracija: true,
        maceracijaOpis: "12 sati",
        kolicinaIzlaz: 3000,
        ciljevi: [{ tankId: cilj.id, kolicina: 2750 }],
      });

      await izvrsiFiltraciju(tx, {
        zadatakId: zadatak.id,
        izvrsioKorisnikId: user.id,
      });

      const poslije = await tx.zadatak.findUniqueOrThrow({
        where: { id: zadatak.id },
      });
      jednako(poslije.status, "IZVRSEN", "flotacija je izvrsena");
      jednako(poslije.gubitakLitara, 250, "kalo flotacije = 3000 - 2750");
      jednako(poslije.maceracija, true, "maceracija je zapisana");
      jednako(poslije.maceracijaOpis, "12 sati", "opis maceracije je zapisan");

      // Radnja mora nositi vrstu zadatka, ne fiksnu FILTRACIJA.
      const radnja = await tx.radnja.findFirstOrThrow({
        where: { tankId: izvor.id },
      });
      jednako(radnja.vrsta, "FLOTACIJA", "radnja nosi vrstu FLOTACIJA");

      // Parametri mosta su presli u ciljni tank.
      const m = await tx.mjerenje.findFirstOrThrow({
        where: { tankId: cilj.id },
      });
      jednako(m.secer, 92.5, "secer mosta prenesen");
      jednako(m.ukupneKiseline, 8.1, "kiseline prenesene");
      jednako(m.ph, 3.15, "ph prenesen");
      tvrdi(
        (m.napomena ?? "").includes("flotacije"),
        "napomena mjerenja imenuje flotaciju, ne filtraciju"
      );

      const ciljPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: cilj.id },
      });
      jednako(ciljPoslije.kolicinaVinaUTanku, 2750, "most je presao u cilj");
      jednako(ciljPoslije.nazivVina, "TEST most", "identitet prenesen");
    }
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
