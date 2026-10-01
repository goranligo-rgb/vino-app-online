/**
 * Provjera SNIMKE VINA KOJE IZLAZI (lib/snimka-vina.ts) nad pravom bazom.
 *
 * Pokretanje:  npx tsx scripts/test-snimka-vina.ts
 *
 * SIGURNOST: svaki scenarij radi u vlastitoj transakciji koja NA KRAJU
 * NAMJERNO PUKNE, pa se sve vraca unatrag. Scenariji diraju PRAVE tankove
 * (zato da snimka vidi pravi blend, prave kvasce i prava mjerenja) i drze ih
 * zakljucane nekoliko sekundi. Na kraju se provjerava da nije ostala nijedna
 * snimka i nijedan probni pretok ili zadatak.
 *
 * STO SE DOKAZUJE, za svaki izvor, kroz PRAVI put pisanja (motor pretoka i
 * izvrsiFiltraciju), ne kroz izravan poziv snimke:
 *   - snimka postoji, tocno jedna po izvoru i cinu;
 *   - radnje = `VinoRadnja` izvora NEPOSREDNO PRIJE cina: broj redaka, zbroj
 *     udjela, i redak po redak jeKvasac, udio, vrsta, preparat;
 *   - polja = ono sto monitor vraca neposredno prije cina, po vrijednosti i
 *     po podrijetlu. Referenca je NEOVISAN prijepis citanja stranice tanka,
 *     ne `procitajMonitorVina` — inace bi funkcija provjeravala samu sebe;
 *   - izvor koji se ispraznio vise nema `VinoRadnja` (snimka je dakle jedini
 *     zapis) i imao ih je prije cina — inace test ne bi dokazivao redoslijed.
 *
 *   - izvrsi, ponisti, izvrsi ponovno: ponistavanje filtracije brise snimku
 *     tog cina, pa drugo izvrsenje prolazi i ima tocno jednu, svjezu snimku.
 *
 * MUTACIJA: bez poziva snimke u motoru ili u filtraciji test mora pasti; bez
 * brisanja snimke u `ponistiFiltraciju` takodjer.
 *
 * NIJE POKRIVENO: brisanje snimke pri ponistavanju PRETOKA. Ono zivi u
 * rukovatelju rute (app/api/pretok/undo/route.ts), koji trazi prijavu i ne da
 * se zvati iz skripte. Kod pretoka zaostala snimka ne rusi nista (ponovljeni
 * pretok dobiva novi pretokId), nego ostaje trag ponistenog cina.
 *
 * NIJE POKRIVENO (29.09.2026.): podrijetlo KNJIGA. Nijedan od izabranih
 * tankova danas nema polje iz knjige — pokriveni su MJERENO, PRENESENO,
 * BLEND i NEMA. Pravilo je isto kao za ostala podrijetla, ali stvarno nije
 * provjereno.
 */

import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { granicaVina } from "../lib/granica-vina";
import { imeVina } from "../lib/ime-vina";
import {
  mjerenjaTrenutnogVina,
  parametriBlenda,
  sloziPoPolju,
  type RedakMjerenja,
} from "../lib/mjerenja";
import { vrijednostiMonitora } from "../lib/monitor-vina";
import { parametriVinaIzKnjige } from "../lib/parametri-vina";
import { punjenjaTrenutnogVina } from "../lib/punjenje-vina";
import { izvrsiPretok } from "../lib/pretok-motor";
import {
  FiltracijaGreska,
  izvrsiFiltraciju,
  ponistiFiltraciju,
} from "../lib/filtracija";
import { citajUlazneCine, vinoUTanku } from "../lib/identitet-vina";
import { snimkaKucice } from "../lib/snimka-vina";
import { IzlazGreska, izvrsiIzlaz } from "../lib/izlaz-vina";

type Tx = Prisma.TransactionClient;

class Rollback extends Error {}

let pao = 0;
let proslo = 0;

function tvrdi(uvjet: boolean, poruka: string) {
  if (uvjet) {
    proslo++;
  } else {
    pao++;
    console.log(`   PAO: ${poruka}`);
  }
}

function jednako(dobiveno: unknown, ocekivano: unknown, poruka: string) {
  const d = JSON.stringify(dobiveno);
  const o = JSON.stringify(ocekivano);
  tvrdi(d === o, `${poruka} — dobiveno ${d}, ocekivano ${o}`);
}

// ---------------------------------------------------------------------------
// REFERENCA: monitor kakav stranica tanka racuna (app/tankovi/[id]/page.tsx),
// prepisan neovisno o lib/snimka-vina.ts.
// ---------------------------------------------------------------------------
async function monitorKaoStranica(tx: Tx, tankId: string, sada: Date) {
  const tank = await tx.tank.findUniqueOrThrow({
    where: { id: tankId },
    include: { blendIzvori: { select: { id: true } } },
  });
  const granica = await granicaVina(tx, tankId);
  const tankBezVina = granica.razlog === "PRAZAN";
  const mjerenja = await tx.mjerenje.findMany({
    where: { tankId },
    orderBy: { izmjerenoAt: "desc" },
    take: 200,
  });
  const svaPunjenja = await tx.punjenjeTanka.findMany({
    where: { tankId, stavke: { some: { obrisano: false } } },
    orderBy: { datumPunjenja: "desc" },
    include: {
      stavke: { where: { obrisano: false }, orderBy: { createdAt: "asc" } },
    },
  });
  const kretanjaTanka = await tx.berbaKretanje.findMany({
    where: { OR: [{ uTankId: tankId }, { izTankId: tankId }] },
    select: {
      id: true,
      uTankId: true,
      izTankId: true,
      berbaId: true,
      litre: true,
      vrsta: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });
  const parametriVina = await parametriVinaIzKnjige(tx, tankId);
  const blend =
    tank.blendIzvori.length > 0
      ? await parametriBlenda(tx, tankId, { sirina: 1 })
      : null;
  const ime = await imeVina(tx, tankId, granica);

  const pripadnost = punjenjaTrenutnogVina(
    tankId,
    svaPunjenja,
    kretanjaTanka,
    granica.odAt
  );
  const mjerenjaZaParametre = (
    tankBezVina
      ? []
      : mjerenjaTrenutnogVina(mjerenja, granica.odAt, pripadnost.pocetnaMjerenja)
  ) as unknown as RedakMjerenja[];

  const izbor = vrijednostiMonitora({
    poPolju: sloziPoPolju(mjerenjaZaParametre),
    blend,
    parametriVina,
    tankBezVina,
    sada,
  });

  return { izbor, ime, tank };
}

type Referenca = {
  tankId: string;
  broj: number;
  litrePrije: number;
  litreOtislo: number;
  ispraznjen: boolean;
  vinoRadnje: Array<{
    izvornaRadnjaId: string;
    jeKvasac: boolean;
    udio: number;
    vrsta: string;
    preparatNaziv: string | null;
  }>;
  monitor: Awaited<ReturnType<typeof monitorKaoStranica>>;
};

async function referenca(
  tx: Tx,
  tankId: string,
  litreOtislo: number,
  sada: Date
): Promise<Referenca> {
  const monitor = await monitorKaoStranica(tx, tankId, sada);
  const vinoRadnje = await tx.vinoRadnja.findMany({
    where: { tankId },
    select: {
      izvornaRadnjaId: true,
      jeKvasac: true,
      udio: true,
      vrsta: true,
      preparatNaziv: true,
    },
  });
  const litrePrije = Number(monitor.tank.kolicinaVinaUTanku ?? 0);
  return {
    tankId,
    broj: monitor.tank.broj,
    litrePrije,
    litreOtislo,
    ispraznjen: litreOtislo >= litrePrije,
    vinoRadnje,
    monitor,
  };
}

// ---------------------------------------------------------------------------
// PROVJERA jedne snimke protiv reference.
// ---------------------------------------------------------------------------
async function provjeriSnimku(
  tx: Tx,
  where: { pretokId: string } | { zadatakId: string } | { izlazVinaId: string },
  cin: string,
  r: Referenca
) {
  const t = `T${r.broj}`;
  const snimke = await tx.snimkaVina.findMany({
    where: { ...where, tankId: r.tankId },
    include: { polja: true, radnje: true },
  });

  jednako(snimke.length, 1, `${t}: tocno jedna snimka`);
  const s = snimke[0];
  if (!s) return;

  jednako(s.cin, cin, `${t}: cin`);
  jednako(s.litrePrije, r.litrePrije, `${t}: litrePrije`);
  jednako(s.litreOtislo, r.litreOtislo, `${t}: litreOtislo`);
  jednako(s.ispraznjen, r.ispraznjen, `${t}: ispraznjen`);
  jednako(s.nazivVina, r.monitor.ime.naziv, `${t}: ime`);
  jednako(s.sorta, r.monitor.ime.deklariranaSorta, `${t}: sorta`);
  jednako(s.godiste, r.monitor.tank.godiste, `${t}: godiste`);

  // RADNJE — broj, zbroj udjela, redak po redak.
  jednako(s.radnje.length, r.vinoRadnje.length, `${t}: broj radnji`);
  const zbroj = (xs: Array<{ udio: number }>) => xs.reduce((z, x) => z + x.udio, 0);
  tvrdi(
    Math.abs(zbroj(s.radnje) - zbroj(r.vinoRadnje)) < 1e-9,
    `${t}: zbroj udjela ${zbroj(s.radnje)} != ${zbroj(r.vinoRadnje)}`
  );
  const poId = new Map(s.radnje.map((x) => [x.izvornaRadnjaId, x]));
  let kvasaca = 0;
  for (const v of r.vinoRadnje) {
    const x = poId.get(v.izvornaRadnjaId);
    tvrdi(!!x, `${t}: radnja ${v.izvornaRadnjaId} nedostaje u snimci`);
    if (!x) continue;
    jednako(x.jeKvasac, v.jeKvasac, `${t}: jeKvasac ${v.izvornaRadnjaId}`);
    jednako(x.udio, v.udio, `${t}: udio ${v.izvornaRadnjaId}`);
    jednako(x.vrsta, v.vrsta, `${t}: vrsta ${v.izvornaRadnjaId}`);
    jednako(x.preparatNaziv, v.preparatNaziv, `${t}: preparat ${v.izvornaRadnjaId}`);
    if (v.jeKvasac) kvasaca++;
  }

  // POLJA — sto monitor vraca neposredno prije cina.
  jednako(s.polja.length, r.monitor.izbor.length, `${t}: broj polja`);
  const poKljucu = new Map(s.polja.map((p) => [p.kljuc, p]));
  for (const o of r.monitor.izbor) {
    const p = poKljucu.get(o.kljuc);
    tvrdi(!!p, `${t}: polje ${o.kljuc} nedostaje`);
    if (!p) continue;
    jednako(p.vrijednost, o.vrijednost, `${t}: ${o.kljuc} vrijednost`);
    jednako(p.podrijetlo, o.podrijetlo.toUpperCase(), `${t}: ${o.kljuc} podrijetlo`);
  }

  const podrijetla = r.monitor.izbor.map((o) => o.podrijetlo).join(",");
  console.log(
    `   ${t}: ${s.radnje.length} radnji (${kvasaca} kvasaca, udio ${zbroj(s.radnje).toFixed(3)}), polja ${podrijetla}, ${r.litreOtislo}/${r.litrePrije} L${r.ispraznjen ? ", ispraznjen" : ""}`
  );
}

// ---------------------------------------------------------------------------
// KUCICA U STABLU CILJA nalazi SVOJU snimku (korak 3, /prosli-tank).
// Stablo se gradi istim putem kao /prosli-tank, unutar iste transakcije,
// pa vidi upravo upisana kretanja.
// ---------------------------------------------------------------------------
async function provjeriKuciceUStablu(
  tx: Tx,
  roditeljTankId: string,
  brojRoditelja: number,
  veza: { pretokId: string } | { zadatakId: string },
  izvori: Array<{ tankId: string; broj: number }>
) {
  const tankovi = await tx.tank.findMany({ select: { id: true, kolicinaVinaUTanku: true } });
  const sorte = new Map(
    (await tx.berba.findMany({ select: { id: true, nazivSorte: true } })).map(
      (b) => [b.id, b.nazivSorte] as const
    )
  );
  const { cini } = await citajUlazneCine(tx, tankovi.map((t) => t.id));
  const litre = Number(tankovi.find((t) => t.id === roditeljTankId)?.kolicinaVinaUTanku ?? 0);
  const korijen = vinoUTanku(cini, sorte, roditeljTankId, Date.now(), { dubina: 1 }, [], litre);
  const sastavnice = korijen.vrsta === "spoj" ? korijen.sastavnice : [];

  for (const iz of izvori) {
    const t = `T${iz.broj} u T${brojRoditelja}`;
    const kucica = sastavnice.find(
      (s) => s.vino.vrsta !== "partija" && s.vino.tankId === iz.tankId
    );
    tvrdi(!!kucica, `${t}: kucica postoji u stablu cilja`);
    if (!kucica) continue;

    const ocekivana = await tx.snimkaVina.findFirstOrThrow({
      where: { ...veza, tankId: iz.tankId },
      select: { id: true },
    });
    const nadjena = await snimkaKucice(tx, {
      kljucCina: kucica.kljucCina,
      izTankId: iz.tankId,
      roditeljTankId,
    });
    jednako(nadjena?.id ?? null, ocekivana.id, `${t}: kucica nalazi SVOJU snimku`);

    // Ista veza, krivi tank: snimka tuđeg izvora ne smije doći na ovu kućicu.
    const drugi = izvori.find((x) => x.tankId !== iz.tankId);
    if (drugi) {
      const tuda = await snimkaKucice(tx, {
        kljucCina: kucica.kljucCina,
        izTankId: drugi.tankId,
        roditeljTankId,
      });
      tvrdi(
        tuda === null || tuda.tankId === drugi.tankId,
        `${t}: pod tankom T${drugi.broj} ne dolazi snimka T${iz.broj}`
      );
    }

    // Ponistenje nosi istu vezu kao cin — snimku ne smije naci.
    const ponistenje = kucica.kljucCina.replace(/:[A-Z]+$/, ":PONISTENJE");
    jednako(
      await snimkaKucice(tx, { kljucCina: ponistenje, izTankId: iz.tankId, roditeljTankId }),
      null,
      `${t}: kljuc PONISTENJA ne nalazi snimku`
    );
  }
}

async function uRollbacku(fn: (tx: Tx) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 60_000, maxWait: 5_000 }
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

async function main() {
  const tankovi = await prisma.tank.findMany({
    include: {
      _count: { select: { vinoRadnje: true, blendIzvori: true } },
    },
    orderBy: { broj: "asc" },
  });
  const korisnik = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const arhivaPrije = await prisma.arhivaVina.count();
  const izlazaPrije = await prisma.izlazVina.count();
  // Produkcija ima prave snimke iz podruma: broji se razlika, ne apsolutna nula.
  const snimkiPrije = await prisma.snimkaVina.count();

  const puni = tankovi.filter((t) => Number(t.kolicinaVinaUTanku ?? 0) > 0);
  const prazni = tankovi
    .filter((t) => Number(t.kolicinaVinaUTanku ?? 0) === 0)
    .sort((a, b) => Number(b.kapacitet ?? 0) - Number(a.kapacitet ?? 0));

  // Najteza snimka: najvise blend izvora (djelomicno), pa najvise radnji koje
  // se isprazne do kraja — samo tako se vidi da je snimka uzeta PRIJE
  // `ocistiVinoRadnje`.
  const poBlendu = [...puni].sort((a, b) => b._count.blendIzvori - a._count.blendIzvori);
  const djelomicni = poBlendu[0];
  const cijeli = [...puni]
    .filter((t) => t.id !== djelomicni.id)
    .sort((a, b) => b._count.vinoRadnje - a._count.vinoRadnje)
    .find((t) => Number(t.kolicinaVinaUTanku) + 150 <= Number(prazni[0].kapacitet ?? 0))!;
  const cilj = prazni[0];

  // -------------------------------------------------------------------------
  // 1. PRETOK — kroz motor, kako ga zove POST /api/pretok.
  // -------------------------------------------------------------------------
  console.log(
    `\n1. PRETOK (cuvée): T${djelomicni.broj} 150 L + T${cijeli.broj} sve → T${cilj.broj}`
  );
  await uRollbacku(async (tx) => {
    const izvori = [
      { tankId: djelomicni.id, kolicina: 150 },
      { tankId: cijeli.id, kolicina: Number(cijeli.kolicinaVinaUTanku) },
    ];
    const ukupno = izvori.reduce((z, i) => z + i.kolicina, 0);
    const pretok = await tx.pretok.create({
      data: {
        ciljTankId: cilj.id,
        tip: "CUVEE",
        korisnikId: korisnik.id,
        napomena: "TEST snimka — rollback",
        nacin: "BEZ",
        izvori: { create: izvori },
        ciljevi: { create: [{ tankId: cilj.id, kolicina: ukupno, redoslijed: 0 }] },
      },
    });

    const reference: Referenca[] = [];
    for (const i of izvori) {
      reference.push(await referenca(tx, i.tankId, i.kolicina, pretok.datum));
    }

    await izvrsiPretok(tx, {
      izvori,
      ciljevi: [{ tankId: cilj.id, kolicina: ukupno }],
      vrsta: "CUVEE",
      nacin: "BEZ",
      korisnikId: korisnik.id,
      pretokId: pretok.id,
      dogodenoAt: pretok.datum,
      noviIdentitet: { nazivVina: "TEST snimka", sorta: "Cuvée", godiste: 2026, sifra: "44-0926-1" },
    });

    for (const r of reference) {
      await provjeriSnimku(tx, { pretokId: pretok.id }, "PRETOK", r);
    }

    // Redoslijed: ispraznjeni izvor je IMAO radnje, a sada ih NEMA.
    const r = reference.find((x) => x.ispraznjen)!;
    tvrdi(r.vinoRadnje.length > 0, `T${r.broj}: prije cina ima VinoRadnja (inace test ne dokazuje redoslijed)`);
    jednako(
      await tx.vinoRadnja.count({ where: { tankId: r.tankId } }),
      0,
      `T${r.broj}: nakon cina nema VinoRadnja — snimka je jedini zapis`
    );
    jednako(
      await tx.snimkaVina.count({ where: { pretokId: pretok.id } }),
      izvori.length,
      "pretok: snimka za svaki izvor, nijedna za cilj"
    );

    console.log(`   kucice u stablu T${cilj.broj}:`);
    await provjeriKuciceUStablu(tx, cilj.id, cilj.broj, { pretokId: pretok.id }, [
      { tankId: djelomicni.id, broj: djelomicni.broj },
      { tankId: cijeli.id, broj: cijeli.broj },
    ]);
  });

  // -------------------------------------------------------------------------
  // 2. FILTRACIJA — kroz izvrsiFiltraciju. Izvor se isprazni do kraja.
  //    Prvi kandidat kojem redoslijed zadataka dopusta prijenos.
  // -------------------------------------------------------------------------
  // Prednost imaju tankovi s najvise KVASACA — inace jeKvasac ne bi bio
  // stvarno provjeren (T43, najbogatiji radnjama, nema nijedan).
  const kvasaca = new Map(
    (
      await prisma.vinoRadnja.groupBy({
        by: ["tankId"],
        where: { jeKvasac: true },
        _count: { _all: true },
      })
    ).map((g) => [g.tankId, g._count._all])
  );
  const kandidati = [...puni]
    .filter((t) => t._count.vinoRadnje > 0)
    .filter((t) => Number(t.kolicinaVinaUTanku) <= Number(cilj.kapacitet ?? 0))
    .sort(
      (a, b) =>
        (kvasaca.get(b.id) ?? 0) - (kvasaca.get(a.id) ?? 0) ||
        b._count.vinoRadnje - a._count.vinoRadnje
    );

  let filtracijaProvjerena = false;
  for (const izvor of kandidati) {
    const litre = Number(izvor.kolicinaVinaUTanku);
    try {
      await uRollbacku(async (tx) => {
        const zadatak = await tx.zadatak.create({
          data: {
            tankId: izvor.id,
            zadaoKorisnikId: korisnik.id,
            vrsta: "FILTRACIJA",
            status: "OTVOREN",
            naslov: "TEST snimka — rollback",
            kolicinaIzlaz: litre,
            tankStavke: {
              create: [{ ciljTankId: cilj.id, kolicina: litre, redoslijed: 0 }],
            },
          },
        });

        const r = await referenca(tx, izvor.id, litre, new Date());

        await izvrsiFiltraciju(tx, {
          zadatakId: zadatak.id,
          izvrsioKorisnikId: korisnik.id,
        });

        console.log(`\n2. FILTRACIJA: T${izvor.broj} sve (${litre} L) → T${cilj.broj}`);
        await provjeriSnimku(tx, { zadatakId: zadatak.id }, "FILTRACIJA", r);
        tvrdi(r.vinoRadnje.length > 0, `T${r.broj}: prije cina ima VinoRadnja`);
        jednako(
          await tx.vinoRadnja.count({ where: { tankId: izvor.id } }),
          0,
          `T${r.broj}: nakon filtracije nema VinoRadnja — snimka je jedini zapis`
        );
        filtracijaProvjerena = true;

        console.log(`   kucica u stablu T${cilj.broj}:`);
        await provjeriKuciceUStablu(tx, cilj.id, cilj.broj, { zadatakId: zadatak.id }, [
          { tankId: izvor.id, broj: izvor.broj },
        ]);

        // 3. IZVRSI, PONISTI, IZVRSI PONOVNO. Ponistavanje vraca zadatak u
        //    OTVOREN; zaostala snimka bi drugo izvrsenje srusila na
        //    jedinstvenosti (zadatakId, tankId).
        console.log(`\n3. FILTRACIJA: izvrsi, ponisti, izvrsi ponovno (T${izvor.broj})`);
        await ponistiFiltraciju(tx, { zadatakId: zadatak.id });
        jednako(
          await tx.snimkaVina.count({ where: { zadatakId: zadatak.id } }),
          0,
          "nakon ponistavanja nema snimke tog cina"
        );

        const r2 = await referenca(tx, izvor.id, litre, new Date());
        let drugoIzvrsenje: string | null = null;
        try {
          // Unutarnja tocka spremanja: pad drugog izvrsenja ne smije
          // pokvariti vanjsku transakciju, nego se zabiljeziti kao PAO.
          await tx.$executeRawUnsafe("SAVEPOINT drugo_izvrsenje");
          await izvrsiFiltraciju(tx, {
            zadatakId: zadatak.id,
            izvrsioKorisnikId: korisnik.id,
          });
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT drugo_izvrsenje");
        } catch (e: any) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT drugo_izvrsenje");
          drugoIzvrsenje = String(e?.code ?? e?.message ?? e).slice(0, 200);
        }
        jednako(drugoIzvrsenje, null, "drugo izvrsenje prolazi");
        if (drugoIzvrsenje == null) {
          await provjeriSnimku(tx, { zadatakId: zadatak.id }, "FILTRACIJA", r2);
        }
      });
    } catch (e: any) {
      // Redoslijed zadataka na PRAVOM tanku smije odbiti kandidata; sve
      // drugo je greska testa.
      if (e instanceof FiltracijaGreska) {
        console.log(`   (T${izvor.broj} preskocen: ${e.message})`);
        continue;
      }
      throw e;
    }
    break;
  }
  tvrdi(filtracijaProvjerena, "filtracija je provjerena na barem jednom tanku");

  // -------------------------------------------------------------------------
  // 4. IZLAZ, DJELOMICAN — prodaja iz tanka s najvise blend izvora, kroz
  //    izvrsiIzlaz (lib/izlaz-vina.ts), kako ga zove POST /api/izlaz-vina.
  // -------------------------------------------------------------------------
  console.log(`\n4. IZLAZ (prodaja, djelomicno): T${djelomicni.broj} 100 L`);
  await uRollbacku(async (tx) => {
    const datum = new Date();
    const r = await referenca(tx, djelomicni.id, 100, datum);
    const rez = await izvrsiIzlaz(
      tx,
      { tankId: djelomicni.id, tip: "PRODAJA", datum, kolicinaLitara: 100, brojBocaRaw: null, volumenBoce: null, korisnickaNapomena: null },
      { id: korisnik.id, ime: null }
    );
    await provjeriSnimku(tx, { izlazVinaId: rez.izlaz.id }, "PRODAJA", r);
    jednako(rez.arhivaId, null, `T${r.broj}: djelomican izlaz nema arhive`);
    const s = await tx.snimkaVina.findFirst({ where: { izlazVinaId: rez.izlaz.id } });
    jednako(s?.arhivaVinaId ?? null, null, `T${r.broj}: snimka djelomicnog izlaza nema arhivaVinaId`);
  });

  // -------------------------------------------------------------------------
  // 5. IZLAZ, ZAVRSNI — punjenje cijelog tanka u boce. Tank s kvascem i s
  //    vlastitim vrijednostima monitora: samo tako pada snimka koja bi se
  //    uzela POSLIJE knjige (monitor bi vidio prazan tank) ili POSLIJE
  //    praznjenja (`VinoRadnja` bi bile obrisane).
  // -------------------------------------------------------------------------
  const zavrsni = kandidati[0];
  const litreZavrsnog = Number(zavrsni.kolicinaVinaUTanku);
  console.log(`\n5. IZLAZ (punjenje, zavrsno): T${zavrsni.broj} sve (${litreZavrsnog} L)`);
  await uRollbacku(async (tx) => {
    const datum = new Date();
    const r = await referenca(tx, zavrsni.id, litreZavrsnog, datum);
    tvrdi(
      r.monitor.izbor.some((o) => o.vrijednost != null),
      `T${r.broj}: prije izlaza monitor ima barem jednu vrijednost (inace test ne dokazuje redoslijed)`
    );
    tvrdi(r.vinoRadnje.some((v) => v.jeKvasac), `T${r.broj}: prije izlaza ima kvasac`);
    const mjerenjaPrije = await tx.mjerenje.count({ where: { tankId: zavrsni.id } });
    tvrdi(mjerenjaPrije > 0, `T${r.broj}: prije izlaza ima mjerenja (inace kopija ne bi imala sto kopirati)`);

    const rez = await izvrsiIzlaz(
      tx,
      { tankId: zavrsni.id, tip: "PUNJENJE", datum, kolicinaLitara: litreZavrsnog, brojBocaRaw: null, volumenBoce: 0.75, korisnickaNapomena: null },
      { id: korisnik.id, ime: null }
    );
    await provjeriSnimku(tx, { izlazVinaId: rez.izlaz.id }, "PUNJENJE", r);
    tvrdi(!!rez.arhivaId, `T${r.broj}: zavrsni izlaz stvara arhivu`);
    const s = await tx.snimkaVina.findFirst({ where: { izlazVinaId: rez.izlaz.id } });
    jednako(s?.arhivaVinaId ?? null, rez.arhivaId, `T${r.broj}: snimka nosi arhivaVinaId arhive istog izlaza`);
    jednako(
      await tx.vinoRadnja.count({ where: { tankId: zavrsni.id } }),
      0,
      `T${r.broj}: nakon zavrsnog izlaza nema VinoRadnja — snimka je jedini zapis`
    );

    // Korak 5d: arhiva izlaza mjerenja, zadatke i radnje vise NE kopira —
    // originali ostaju, a druga kopija se citala dvaput.
    const arhivaId = rez.arhivaId ?? "-";
    for (const [tablica, n] of [
      ["ArhivaVinaMjerenje", await tx.arhivaVinaMjerenje.count({ where: { arhivaVinaId: arhivaId } })],
      ["ArhivaVinaZadatak", await tx.arhivaVinaZadatak.count({ where: { arhivaVinaId: arhivaId } })],
      ["ArhivaVinaRadnja", await tx.arhivaVinaRadnja.count({ where: { arhivaVinaId: arhivaId } })],
    ] as const) {
      jednako(n, 0, `T${r.broj}: ${tablica} — nijedan kopirani redak`);
    }
    jednako(
      await tx.mjerenje.count({ where: { tankId: zavrsni.id } }),
      mjerenjaPrije,
      `T${r.broj}: originalna mjerenja ostaju (${mjerenjaPrije})`
    );
  });

  // -------------------------------------------------------------------------
  // 6. IZLAZ VECI OD STANJA — provjera pod zakljucavanjem, ista greska kao
  //    prije (IzlazGreska 400), i nista se ne upisuje.
  // -------------------------------------------------------------------------
  console.log(`\n6. IZLAZ veci od stanja: T${zavrsni.broj}`);
  {
    let greska: any = null;
    try {
      await prisma.$transaction((tx) =>
        izvrsiIzlaz(
          tx,
          { tankId: zavrsni.id, tip: "PRODAJA", datum: new Date(), kolicinaLitara: 9_999_999, brojBocaRaw: null, volumenBoce: null, korisnickaNapomena: null },
          { id: korisnik.id, ime: null }
        )
      );
    } catch (e) {
      greska = e;
    }
    tvrdi(greska instanceof IzlazGreska && greska.status === 400, `izlaz veci od stanja: IzlazGreska 400 (dobiveno ${greska?.name} ${greska?.status})`);
    jednako(
      String(greska?.message ?? "").startsWith("Nema dovoljno vina u tanku. Trenutno stanje je "),
      true,
      "izlaz veci od stanja: ista poruka kao prije"
    );
  }

  // -------------------------------------------------------------------------
  // Nista nije ostalo.
  // -------------------------------------------------------------------------
  const [ostalo] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT (SELECT count(*) FROM "SnimkaVina")::int AS snimke,
            (SELECT count(*) FROM "Pretok" WHERE napomena LIKE 'TEST snimka%')::int AS pretoci,
            (SELECT count(*) FROM "Zadatak" WHERE naslov LIKE 'TEST snimka%')::int AS zadaci,
            (SELECT count(*) FROM "ArhivaVina")::int AS arhiva`
  );
  jednako(ostalo, { snimke: snimkiPrije, pretoci: 0, zadaci: 0, arhiva: arhivaPrije }, "u bazi nije nista ostalo");
  jednako(await prisma.izlazVina.count(), izlazaPrije, "nijedan izlaz nije ostao");

  console.log(`\n${proslo} proslo, ${pao} palo`);
  if (pao > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
