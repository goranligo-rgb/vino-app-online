/**
 * Provjera RAZINE 1 ARHIVE — vino koje je izaslo kroz izlaz
 * (/prosli-tank?snimka=, lib/kronologija-vina.ts) nad pravom bazom.
 *
 * Pokretanje:  npm run test:snimka:izlaza
 *
 * SIGURNOST: svaki scenarij radi u vlastitoj transakciji koja NA KRAJU
 * NAMJERNO PUKNE, pa se sve vraca unatrag. Izlaz ide kroz PRAVI put
 * (`izvrsiIzlaz`, lib/izlaz-vina.ts), nad pravim tankom, i drzi ga zakljucanog
 * nekoliko sekundi. Na kraju se provjerava da nije ostala nijedna snimka,
 * izlaz, arhiva ni probni redak.
 *
 * STO SE DOKAZUJE, nad snimkom koju je taj izlaz upravo napisao:
 *   - `snimkaIzlazaPoId` je nalazi, a kvasci iz nje su tocno `VinoRadnja`
 *     s `jeKvasac` neposredno prije izlaza, s istim udjelom;
 *   - prozori: posuda izlaza od granice vina do samog izlaza, pa isti
 *     jednolinijski lanac koji stranica tanka racuna za danasnje vino
 *     (neovisan prijepis `lanacVina` iz app/tankovi/[id]/page.tsx);
 *   - kronologija: izlaz stoji tocno jednom (arhiva nosi njegovu kopiju);
 *     arhivska radnja bez originala ULAZI, s oznakom "iz arhive" (arhiva se
 *     cita obavezno); arhivska kopija zive radnje NE ulazi drugi put;
 *     arhivski zadatak bez originala ulazi; zapis izvan prozora ne ulazi —
 *     ni prije granice ni poslije izlaza; nijedan dogadaj dvaput;
 *   - djelomican izlaz: snimka je nadjena, posuda nije ispraznjena, izlaz je
 *     u kronologiji;
 *   - napomena prije 11.09.2026.: cisti racun nad rubovima.
 *
 * MUTACIJE (rucno, 29.09.2026.): bez citanja `ArhivaVinaRadnja`, bez
 * uklanjanja dvojnika po `izvornaRadnjaId` i bez gornjeg ruba prozora test
 * mora pasti.
 */

import "dotenv/config";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { granicaVina } from "../lib/granica-vina";
import { citajUlazneCine, vinoUTanku, type VinoCvor } from "../lib/identitet-vina";
import { podrijetloTanka } from "../lib/berba-model";
import { izvrsiIzlaz } from "../lib/izlaz-vina";
import { kvasciIzSnimke, snimkaIzlazaPoId } from "../lib/snimka-vina";
import {
  dogadajiVina,
  prozoriPrijePrezivljavanja,
  prozoriVina,
  uProzoru,
  PREZIVLJAVA_OD,
  type ProzorVina,
} from "../lib/kronologija-vina";

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

async function uRollbacku(fn: (tx: Tx) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 90_000, maxWait: 5_000 }
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

/**
 * REFERENCA: lanac vina kakav stranica tanka racuna za DANASNJE vino
 * (app/tankovi/[id]/page.tsx, `lanacVina`), prepisan neovisno. Pozvan prije
 * izlaza mora dati iste karike kao `prozoriVina` na trenutak izlaza.
 */
async function lanacKaoStranica(tx: Tx, tankId: string, sviTankovi: string[]) {
  const knjiga = await citajUlazneCine(tx, sviTankovi);
  const sorte = new Map(
    (await tx.berba.findMany({ select: { id: true, nazivSorte: true } })).map(
      (b) => [b.id, b.nazivSorte] as const
    )
  );
  const pod = await podrijetloTanka(tx, tankId);
  const vinoDanas = vinoUTanku(knjiga.cini, sorte, tankId, Date.now(), {}, [], pod.ukupnoL);
  const lanac: { tankId: string; odAt: Date | null; doAt: Date }[] = [];
  let cvor: VinoCvor = vinoDanas;
  while (cvor.vrsta === "spoj" && cvor.sastavnice.length === 1) {
    const s = cvor.sastavnice[0];
    if (s.vino.vrsta === "partija") break;
    const g = await granicaVina(tx, s.vino.tankId, { doTrenutka: s.usloAt, zadnjeVino: true });
    lanac.push({ tankId: s.vino.tankId, odAt: g.odAt, doAt: s.usloAt });
    cvor = s.vino;
  }
  return lanac
    .filter((k) => k.odAt != null)
    .map((k) => ({ tankId: k.tankId, od: k.odAt!.toISOString(), do: k.doAt.toISOString() }));
}

/** Sve sto razina 1 cita, redom kao vino-iz-snimke.tsx. */
async function citajRazinu1(tx: Tx, snimkaId: string, sviTankovi: { id: string; broj: number }[]) {
  const snimka = await snimkaIzlazaPoId(tx, snimkaId);
  if (!snimka) return null;
  const trenutak = new Date(snimka.dogodenoAt.getTime() - 1);
  const knjiga = await citajUlazneCine(tx, sviTankovi.map((t) => t.id));
  const sorte = new Map(
    (await tx.berba.findMany({ select: { id: true, nazivSorte: true } })).map(
      (b) => [b.id, b.nazivSorte] as const
    )
  );
  const pod = await podrijetloTanka(tx, snimka.tankId, { doTrenutka: trenutak });
  const vino = vinoUTanku(knjiga.cini, sorte, snimka.tankId, trenutak.getTime(), {}, [], pod.ukupnoL);
  const { prozori } = await prozoriVina(tx, {
    tankId: snimka.tankId,
    trenutak,
    doAt: snimka.dogodenoAt,
    vino,
  });
  const dogadaji = await dogadajiVina(tx, {
    prozori,
    tankIzlazaId: snimka.tankId,
    brojTanka: new Map(sviTankovi.map((t) => [t.id, t.broj])),
    trenutnaSnimkaId: snimka.id,
  });
  return { snimka, trenutak, prozori, dogadaji };
}

function cistiRacun() {
  console.log("\n0. Cisti racun: prozor i napomena prije 11.09.2026.");
  const t = (s: string) => new Date(s);
  const p: ProzorVina[] = [
    { tankId: "A", od: t("2026-09-12T00:00:00Z"), do: t("2026-09-20T00:00:00Z") },
    { tankId: "B", od: t("2026-08-01T00:00:00Z"), do: t("2026-09-12T00:00:00Z") },
  ];
  tvrdi(uProzoru(p, "A", t("2026-09-12T00:00:00Z")), "donji rub je ukljuciv");
  tvrdi(uProzoru(p, "A", t("2026-09-20T00:00:00Z")), "gornji rub je ukljuciv");
  tvrdi(!uProzoru(p, "A", t("2026-09-20T00:00:00.001Z")), "iza gornjeg ruba ne ulazi");
  tvrdi(!uProzoru(p, "A", t("2026-08-15T00:00:00Z")), "prozor druge posude ne vrijedi za ovu");
  tvrdi(!uProzoru(p, null, t("2026-09-15T00:00:00Z")), "zapis bez posude ne ulazi");
  jednako(prozoriPrijePrezivljavanja(p).map((x) => x.tankId), ["B"], "napomena samo za prozor koji pocinje prije 11.09.");
  jednako(
    prozoriPrijePrezivljavanja([{ tankId: "C", od: PREZIVLJAVA_OD, do: t("2026-09-20T00:00:00Z") }]).length,
    0,
    "prozor koji pocinje tocno 11.09. nema napomenu"
  );
  jednako(
    prozoriPrijePrezivljavanja([{ tankId: "C", od: null, do: t("2026-09-20T00:00:00Z") }]).length,
    1,
    "prozor bez granice (knjiga ne zna) ima napomenu"
  );
}

async function main() {
  cistiRacun();

  const tankovi = await prisma.tank.findMany({
    include: { _count: { select: { vinoRadnje: true } } },
    orderBy: { broj: "asc" },
  });
  const sviTankovi = tankovi.map((t) => ({ id: t.id, broj: t.broj }));
  const korisnik = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const prije = {
    snimke: await prisma.snimkaVina.count(),
    izlazi: await prisma.izlazVina.count(),
    arhive: await prisma.arhivaVina.count(),
    arhivskeRadnje: await prisma.arhivaVinaRadnja.count(),
    arhivskiZadaci: await prisma.arhivaVinaZadatak.count(),
    radnje: await prisma.radnja.count(),
  };

  // Tank s kvascem i sto duljim lancem — samo tako test vidi i karike lanca.
  const puni = tankovi.filter((t) => Number(t.kolicinaVinaUTanku ?? 0) > 0 && t._count.vinoRadnje > 0);
  const kvasaca = new Map(
    (
      await prisma.vinoRadnja.groupBy({ by: ["tankId"], where: { jeKvasac: true }, _count: true })
    ).map((r) => [r.tankId, r._count] as const)
  );
  const duljina = new Map<string, number>();
  for (const t of puni) {
    const lanac = await lanacKaoStranica(prisma as unknown as Tx, t.id, sviTankovi.map((x) => x.id));
    duljina.set(t.id, lanac.length);
  }
  const kandidati = [...puni].sort(
    (a, b) =>
      Number((kvasaca.get(b.id) ?? 0) > 0) - Number((kvasaca.get(a.id) ?? 0) > 0) ||
      (duljina.get(b.id) ?? 0) - (duljina.get(a.id) ?? 0)
  );
  tvrdi(kandidati.length >= 2, "postoje barem dva puna tanka s radnjama");
  const zavrsni = kandidati[0];
  const djelomicni = kandidati[1];

  // -------------------------------------------------------------------------
  const litre = Number(zavrsni.kolicinaVinaUTanku);
  console.log(
    `\n1. ZAVRSNI IZLAZ (punjenje): T${zavrsni.broj} sve (${litre} L), lanac ${duljina.get(zavrsni.id)} karika`
  );
  await uRollbacku(async (tx) => {
    const lanacPrije = await lanacKaoStranica(tx, zavrsni.id, sviTankovi.map((x) => x.id));
    const kvasciPrije = (
      await tx.vinoRadnja.findMany({ where: { tankId: zavrsni.id, jeKvasac: true } })
    )
      .map((v) => ({ id: v.izvornaRadnjaId, udio: v.udio }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const datum = new Date(Date.now() - 60_000);
    const rez = await izvrsiIzlaz(
      tx,
      { tankId: zavrsni.id, tip: "PUNJENJE", datum, kolicinaLitara: litre, brojBocaRaw: null, volumenBoce: 0.75, korisnickaNapomena: null },
      { id: korisnik.id, ime: null }
    );
    tvrdi(!!rez.arhivaId, `T${zavrsni.broj}: zavrsni izlaz stvara arhivu`);
    const glava = await tx.snimkaVina.findFirstOrThrow({ where: { izlazVinaId: rez.izlaz.id } });

    // Sintetski zapisi posude — upisani u arhivu istog izlaza, sve u rollbacku.
    const granica = await granicaVina(tx, zavrsni.id, {
      doTrenutka: new Date(datum.getTime() - 1),
      zadnjeVino: true,
    });
    const odAt = granica.odAt ?? new Date(datum.getTime() - 30 * 86_400_000);
    const unutra = new Date(Math.max(odAt.getTime() + 1_000, datum.getTime() - 3_600_000));
    const ziva = await tx.radnja.create({
      data: { tankId: zavrsni.id, korisnikId: korisnik.id, vrsta: "DODAVANJE", opis: "TEST izlaza ziva", createdAt: unutra },
    });
    const poslije = await tx.radnja.create({
      data: { tankId: zavrsni.id, korisnikId: korisnik.id, vrsta: "DODAVANJE", opis: "TEST izlaza poslije", createdAt: new Date(datum.getTime() + 1) },
    });
    const arh = (opis: string, createdAt: Date, izvornaRadnjaId: string | null) =>
      tx.arhivaVinaRadnja.create({
        data: { arhivaVinaId: rez.arhivaId!, tankId: zavrsni.id, vrsta: "DODAVANJE", opis, createdAt, izvornaRadnjaId },
      });
    const sama = await arh("TEST izlaza arhivska sama", unutra, randomUUID());
    const kopija = await arh("TEST izlaza arhivska kopija", unutra, ziva.id);
    const prijeGranice = granica.odAt
      ? await arh("TEST izlaza prije granice", new Date(granica.odAt.getTime() - 86_400_000), randomUUID())
      : null;
    const arhZadatak = await tx.arhivaVinaZadatak.create({
      data: {
        arhivaVinaId: rez.arhivaId!,
        tankId: zavrsni.id,
        vrsta: "DODAVANJE",
        status: "IZVRSEN",
        naslov: "TEST izlaza arhivski zadatak",
        zadanoAt: unutra,
        izvrsenoAt: unutra,
      },
    });

    const r = await citajRazinu1(tx, glava.id, sviTankovi);
    tvrdi(!!r, `T${zavrsni.broj}: snimkaIzlazaPoId nalazi snimku izlaza`);
    if (!r) return;
    const { snimka, prozori, dogadaji } = r;
    jednako(snimka.cin, "PUNJENJE", "cin snimke");
    jednako(snimka.ispraznjen, true, "zavrsni izlaz: posuda ispraznjena");

    jednako(
      kvasciIzSnimke(snimka)
        .map((k) => ({ id: k.izvornaRadnjaId, udio: k.udio }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      kvasciPrije,
      `T${zavrsni.broj}: kvasci iz snimke = VinoRadnja jeKvasac prije izlaza (${kvasciPrije.length}, s udjelom)`
    );

    jednako(prozori[0].tankId, zavrsni.id, "prvi prozor je posuda izlaza");
    jednako(prozori[0].do.toISOString(), datum.toISOString(), "prozor posude izlaza ide do samog izlaza");
    jednako(prozori[0].od?.toISOString() ?? null, granica.odAt?.toISOString() ?? null, "prozor posude izlaza pocinje granicom vina");
    jednako(
      prozori.slice(1).map((p) => ({ tankId: p.tankId, od: p.od!.toISOString(), do: p.do.toISOString() })),
      lanacPrije,
      `T${zavrsni.broj}: lanac na trenutak izlaza = lanac stranice tanka prije izlaza (${lanacPrije.length} karika)`
    );

    const ids = dogadaji.map((d) => d.id);
    jednako(ids.length, new Set(ids).size, "nijedan dogadaj dvaput");
    jednako(ids.filter((i) => i === `iz-${rez.izlaz.id}`).length, 1, "zavrsni izlaz stoji tocno jednom");
    jednako(
      ids.filter((i) => i.startsWith("aiz-")).length,
      0,
      "arhivska kopija izlaza (ArhivaVinaIzlaz) ne stoji uz original"
    );
    tvrdi(ids.includes(`rad-${ziva.id}`), "ziva samostalna radnja u prozoru ulazi");
    tvrdi(!ids.includes(`arad-${kopija.id}`), "arhivska kopija zive radnje NE ulazi drugi put");
    const d = dogadaji.find((x) => x.id === `arad-${sama.id}`);
    tvrdi(!!d, "arhivska radnja bez originala ULAZI (arhiva se cita obavezno)");
    tvrdi(!!d?.podnaslov?.includes("iz arhive"), "arhivska radnja nosi oznaku 'iz arhive'");
    tvrdi(ids.includes(`azad-${arhZadatak.id}`), "arhivski zadatak bez originala ulazi");
    tvrdi(!ids.includes(`rad-${poslije.id}`), "radnja poslije izlaza ne ulazi (gornji rub)");
    if (prijeGranice) tvrdi(!ids.includes(`arad-${prijeGranice.id}`), "arhivska radnja prije granice ne ulazi (donji rub)");

    // Svaka ziva samostalna radnja posude izlaza iz prozora je u kronologiji.
    const ocekivane = await tx.radnja.findMany({
      where: {
        tankId: zavrsni.id,
        zadatakId: null,
        createdAt: { ...(prozori[0].od ? { gte: prozori[0].od } : {}), lte: prozori[0].do },
      },
      select: { id: true },
    });
    const arhZadatakRadnje = new Set(
      (
        await tx.arhivaVinaRadnja.findMany({
          where: { izvornaRadnjaId: { in: ocekivane.map((x) => x.id) }, izvorniZadatakId: { not: null } },
          select: { izvornaRadnjaId: true },
        })
      ).map((x) => x.izvornaRadnjaId)
    );
    const nedostaje = ocekivane.filter((x) => !arhZadatakRadnje.has(x.id) && !ids.includes(`rad-${x.id}`));
    jednako(nedostaje.length, 0, `sve samostalne radnje posude izlaza u prozoru su u kronologiji (${ocekivane.length})`);

    console.log(
      `   T${zavrsni.broj}: ${prozori.length} prozora, ${dogadaji.length} dogadaja, kvasaca ${kvasciPrije.length}, napomena prije 11.09.: ${prozoriPrijePrezivljavanja(prozori).length}`
    );
  });

  // -------------------------------------------------------------------------
  console.log(`\n2. DJELOMICAN IZLAZ (prodaja): T${djelomicni.broj} 100 L`);
  await uRollbacku(async (tx) => {
    const datum = new Date(Date.now() - 60_000);
    const rez = await izvrsiIzlaz(
      tx,
      { tankId: djelomicni.id, tip: "PRODAJA", datum, kolicinaLitara: 100, brojBocaRaw: null, volumenBoce: null, korisnickaNapomena: null },
      { id: korisnik.id, ime: null }
    );
    const glava = await tx.snimkaVina.findFirstOrThrow({ where: { izlazVinaId: rez.izlaz.id } });
    const r = await citajRazinu1(tx, glava.id, sviTankovi);
    tvrdi(!!r, "djelomican izlaz: snimka je nadjena");
    if (!r) return;
    jednako(r.snimka.cin, "PRODAJA", "cin snimke");
    jednako(r.snimka.ispraznjen, false, "djelomican izlaz: posuda nije ispraznjena");
    jednako(r.snimka.arhivaVinaId, null, "djelomican izlaz: bez arhive");
    tvrdi(r.dogadaji.some((d) => d.id === `iz-${rez.izlaz.id}`), "djelomican izlaz je u kronologiji");
    console.log(`   T${djelomicni.broj}: ${r.prozori.length} prozora, ${r.dogadaji.length} dogadaja`);
  });

  // -------------------------------------------------------------------------
  console.log("\n3. Adresa koja ne vodi na snimku izlaza");
  jednako(await snimkaIzlazaPoId(prisma, randomUUID()), null, "nepostojeci id: null");
  jednako(await snimkaIzlazaPoId(prisma, "nije-uuid"), null, "rucno sastavljen id: null, bez pucanja");

  // -------------------------------------------------------------------------
  const poslije = {
    snimke: await prisma.snimkaVina.count(),
    izlazi: await prisma.izlazVina.count(),
    arhive: await prisma.arhivaVina.count(),
    arhivskeRadnje: await prisma.arhivaVinaRadnja.count(),
    arhivskiZadaci: await prisma.arhivaVinaZadatak.count(),
    radnje: await prisma.radnja.count(),
  };
  jednako(poslije, prije, "u bazi nije nista ostalo");

  console.log(`\n${proslo} proslo, ${pao} palo`);
  if (pao > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
