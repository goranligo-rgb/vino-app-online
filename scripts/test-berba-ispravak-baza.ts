/**
 * Provjera ISPRAVKA BERBE (lib/berba-ispravak.ts), nad pravom bazom.
 *
 * Pokretanje:  npm run test:berba:ispravak
 *
 * SIGURNOST — isti obrazac kao scripts/test-imenovanje-baza.ts: svaki scenarij
 * je transakcija koja na kraju namjerno pukne, pa u bazi ne ostaje nista.
 * Postojeci zapisi berbe se ne diraju: grupa se trazi medju SVIM zapisima
 * vrste BERBA, pa sintetski zapisi nose sortu i parcelu kakve nitko nema.
 *
 * STO DOKAZUJE
 *   1. Grupa: isti datum + sorta + parcela (bez obzira na slova i razmake),
 *      samo vrsta BERBA; druga parcela i zateceni zapis ostaju netaknuti.
 *      Trag (tko, kada, razlog) na svakom zapisu, dnevnik redak po polju.
 *   2. Stavke punjenja se ispravljaju; kilogrami SAMO na izvornu stavku.
 *   3. Knjiga, tank i litre ostaju netaknuti — i kad se mijenja datum berbe,
 *      granica vina je ista.
 *   4. Odbijeno bez razloga, s litrama, s nepoznatim poljem, sorta bez
 *      potvrde, prazna sorta, kraj prije pocetka, bez promjene, nepostojeca
 *      berba — i nista se ne upise.
 *   5. Sorta s potvrdom: popis tankova, sortaId iz sifrarnika, Tank.sorta NE.
 *   6. Zateceni zapis se ispravlja sam.
 *   7. Sudar s drugom grupom: upozorenje, ne blokada.
 *   8. Nije vlastita berba -> vrijeme i beraci se brisu; bez maceracije nema sati.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { granicaVina } from "../lib/granica-vina";
import {
  IspravakBerbeGreska,
  ispraviBerbu,
  TIP_ISPRAVAK_BERBE,
} from "../lib/berba-ispravak";

type Tx = Prisma.TransactionClient;

let pao = 0;
let proslo = 0;
let redni = 0;
let sljedeciBroj = 0;

class Rollback extends Error {}

function jednako(dobiveno: unknown, ocekivano: unknown, poruka: string) {
  const a = JSON.stringify(dobiveno);
  const b = JSON.stringify(ocekivano);
  if (a === b) {
    proslo++;
    return;
  }
  pao++;
  console.log(`  PAO: ${poruka}`);
  console.log(`       ocekivano: ${b}`);
  console.log(`       dobiveno:  ${a}`);
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

/** Sorta i parcela kakve nijedan pravi zapis nema — grupa ostaje sintetska. */
const oznaka = () => `TEST-${Date.now()}-${redni++}`;

async function korisnik(tx: Tx) {
  return tx.user.create({
    data: {
      ime: "TEST ispravak berbe",
      email: `test-berba-ispravak-${oznaka()}@example.invalid`,
      password: "nije-u-upotrebi",
      role: "PODRUM",
    },
  });
}

async function tank(tx: Tx, sorta = "TEST sorta tanka") {
  return tx.tank.create({
    data: {
      broj: sljedeciBroj++,
      kapacitet: 50000,
      kolicinaVinaUTanku: 0,
      sorta,
      nadzorHladjenja: false,
      smsAktivan: false,
      samokontrolaAktivna: false,
    },
  });
}

const ULAZ_AT = new Date("2026-08-27T09:00:00Z");

/**
 * Zapis berbe kakav ostavlja punjenje: Berba + ULAZ u svaki tank + po jedna
 * stavka punjenja po tanku. Kilogrami na prvoj stavci, kao u pogonu.
 */
async function berba(
  tx: Tx,
  p: {
    sorta: string;
    parcela: string | null;
    datumBerbe: Date | null;
    tankovi: Array<{ id: string; litre: number }>;
    vrsta?: "BERBA" | "ZATECENO";
    kg?: number | null;
    secer?: number | null;
  }
) {
  const litre = p.tankovi.reduce((z, t) => z + t.litre, 0);
  const b = await tx.berba.create({
    data: {
      vrstaUnosa: p.vrsta ?? "BERBA",
      nazivSorte: p.sorta,
      parcela: p.parcela,
      datumBerbe: p.datumBerbe,
      godinaBerbe: 2026,
      kolicinaLitara: litre,
      kolicinaKgGrozdja: p.kg ?? null,
      secer: p.secer ?? null,
      prviTankId: p.tankovi[0].id,
    },
  });

  const stavke: string[] = [];
  for (const [i, t] of p.tankovi.entries()) {
    await tx.berbaKretanje.create({
      data: { berbaId: b.id, uTankId: t.id, litre: t.litre, vrsta: "ULAZ", dogodenoAt: ULAZ_AT, createdAt: ULAZ_AT },
    });
    await tx.tank.update({
      where: { id: t.id },
      data: { kolicinaVinaUTanku: { increment: t.litre } },
    });
    const pun = await tx.punjenjeTanka.create({
      data: { tankId: t.id, datumPunjenja: ULAZ_AT, ukupnoLitara: t.litre },
    });
    const st = await tx.punjenjeStavka.create({
      data: {
        punjenjeId: pun.id,
        nazivSorte: p.sorta,
        parcela: p.parcela,
        datumBerbe: p.datumBerbe,
        kolicinaLitara: t.litre,
        kolicinaKgGrozdja: i === 0 ? (p.kg ?? null) : null,
        secer: p.secer ?? null,
        berbaId: b.id,
      },
    });
    stavke.push(st.id);
  }

  await tx.berba.update({ where: { id: b.id }, data: { izvornaPunjenjeStavkaId: stavke[0] } });
  return { id: b.id, stavke };
}

async function odbijeno(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof IspravakBerbeGreska) return e.message;
    throw e;
  }
}

const DATUM = new Date("2026-08-27T00:00:00Z");

async function main() {
  const najveci = await prisma.tank.aggregate({ _max: { broj: true } });
  sljedeciBroj = (najveci._max.broj ?? 0) + 8000;

  console.log("");
  console.log("ISPRAVAK BERBE — provjera nad pravom bazom");
  console.log("");

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 1: grupa, trag i dnevnik", async (tx) => {
    const u = await korisnik(tx);
    const s = oznaka();
    const t1 = await tank(tx);
    const a = await berba(tx, { sorta: `${s} Sauvignon`, parcela: "13", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 3000 }], secer: 90 });
    const b = await berba(tx, { sorta: `  ${s} SAUVIGNON `, parcela: " 13", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 2000 }], secer: 90 });
    const c = await berba(tx, { sorta: `${s} sauvignon`, parcela: "13", datumBerbe: new Date("2026-08-27T15:00:00Z"), tankovi: [{ id: t1.id, litre: 1000 }], secer: 90 });
    const drugaParcela = await berba(tx, { sorta: `${s} Sauvignon`, parcela: "14", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 500 }], secer: 90 });
    const zateceno = await berba(tx, { sorta: `${s} Sauvignon`, parcela: "13", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 400 }], vrsta: "ZATECENO", secer: 90 });

    const r = await ispraviBerbu(tx, {
      berbaId: b.id,
      tijelo: { secer: 94.5, razlog: "krivo ocitan refraktometar" },
      korisnikId: u.id,
      sada: new Date("2026-09-11T10:00:00Z"),
    });

    jednako(r.zapisa, 3, "ispravljena tri zapisa iste berbe");
    jednako(r.polja, ["secer"], "promijenjeno samo polje secer");

    const zapisi = await tx.berba.findMany({
      where: { id: { in: [a.id, b.id, c.id, drugaParcela.id, zateceno.id] } },
      select: { id: true, secer: true, ispravljenoAt: true, ispravioKorisnikId: true, razlogIspravka: true },
    });
    const po = new Map(zapisi.map((z) => [z.id, z]));
    for (const [ime, id] of [["a", a.id], ["b", b.id], ["c", c.id]] as const) {
      jednako(po.get(id)?.secer, 94.5, `zapis ${ime}: novi secer`);
      jednako(po.get(id)?.razlogIspravka, "krivo ocitan refraktometar", `zapis ${ime}: razlog`);
      jednako(po.get(id)?.ispravioKorisnikId, u.id, `zapis ${ime}: tko`);
      jednako(po.get(id)?.ispravljenoAt?.toISOString(), "2026-09-11T10:00:00.000Z", `zapis ${ime}: kada`);
    }
    jednako(po.get(drugaParcela.id)?.secer, 90, "druga parcela netaknuta");
    jednako(po.get(zateceno.id)?.secer, 90, "zateceni zapis netaknut");
    jednako(po.get(zateceno.id)?.ispravljenoAt, null, "zateceni zapis bez traga ispravka");

    const dnevnik = await tx.activityLog.findMany({
      where: { entityType: "Berba", entityId: { in: [a.id, b.id, c.id] } },
    });
    jednako(dnevnik.length, 3, "dnevnik: redak po zapisu za jedno polje");
    jednako(dnevnik.every((d) => d.tip === TIP_ISPRAVAK_BERBE), true, "dnevnik: tip ISPRAVAK_BERBE");
    // jsonb ne cuva redoslijed kljuceva — usporedjuje se polje po polje.
    const payload = dnevnik[0]?.payload as { polje?: string; staro?: string; novo?: string } | null;
    jednako([payload?.polje, payload?.staro, payload?.novo], ["secer", "90", "94.5"], "dnevnik: polje, staro, novo");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 2 i 3: stavke da, knjiga i tank ne; datum ne mice granicu", async (tx) => {
    const u = await korisnik(tx);
    const s = oznaka();
    const t1 = await tank(tx, "TEST sorta na tanku");
    const t2 = await tank(tx, "TEST sorta na tanku");
    const razlivena = await berba(tx, {
      sorta: `${s} Grasevina`,
      parcela: "7",
      datumBerbe: DATUM,
      tankovi: [{ id: t1.id, litre: 3000 }, { id: t2.id, litre: 1500 }],
      kg: 8400,
    });

    const knjigaPrije = await tx.berbaKretanje.findMany({
      where: { berbaId: razlivena.id },
      orderBy: { uTankId: "asc" },
      select: { id: true, litre: true, dogodenoAt: true, createdAt: true, uTankId: true },
    });
    const granicaPrije = await granicaVina(tx, t1.id);

    await ispraviBerbu(tx, {
      berbaId: razlivena.id,
      tijelo: {
        kolicinaKgGrozdja: 9100,
        datumBerbe: "2026-08-25",
        napomena: "dopisano naknadno",
        razlog: "vaga je bila krivo tarirana",
      },
      korisnikId: u.id,
    });

    const stavke = await tx.punjenjeStavka.findMany({
      where: { id: { in: razlivena.stavke } },
      select: { id: true, kolicinaKgGrozdja: true, datumBerbe: true, napomenaBerbe: true, kolicinaLitara: true },
    });
    const prva = stavke.find((x) => x.id === razlivena.stavke[0])!;
    const druga = stavke.find((x) => x.id === razlivena.stavke[1])!;
    jednako(prva.kolicinaKgGrozdja, 9100, "izvorna stavka dobila nove kilograme");
    jednako(druga.kolicinaKgGrozdja, null, "druga stavka NE dobiva kilograme (ne zbrajaju se dvaput)");
    jednako(prva.datumBerbe?.toISOString(), "2026-08-25T00:00:00.000Z", "stavka: novi datum berbe");
    jednako(druga.napomenaBerbe, "dopisano naknadno", "stavka: napomena u napomenaBerbe");
    jednako([prva.kolicinaLitara, druga.kolicinaLitara], [3000, 1500], "stavke: litre netaknute");

    const knjigaPoslije = await tx.berbaKretanje.findMany({
      where: { berbaId: razlivena.id },
      orderBy: { uTankId: "asc" },
      select: { id: true, litre: true, dogodenoAt: true, createdAt: true, uTankId: true },
    });
    jednako(knjigaPoslije, knjigaPrije, "knjiga netaknuta (litre, datumi, tankovi)");
    jednako(
      (await granicaVina(tx, t1.id)).odAt?.toISOString(),
      granicaPrije.odAt?.toISOString(),
      "promjena datuma berbe ne mice granicu vina"
    );

    const zapis = await tx.berba.findUniqueOrThrow({ where: { id: razlivena.id } });
    jednako(zapis.kolicinaLitara, 4500, "Berba.kolicinaLitara netaknuta");
    const tankovi = await tx.tank.findMany({ where: { id: { in: [t1.id, t2.id] } }, orderBy: { broj: "asc" } });
    jednako(tankovi.map((t) => [t.sorta, t.kolicinaVinaUTanku]), [["TEST sorta na tanku", 3000], ["TEST sorta na tanku", 1500]], "tankovi netaknuti");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 4: odbijeno — i nista upisano", async (tx) => {
    const u = await korisnik(tx);
    const s = oznaka();
    const t1 = await tank(tx);
    const z = await berba(tx, { sorta: `${s} Rizling`, parcela: "2", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 1000 }], secer: 88 });
    const probaj = (tijelo: Record<string, unknown>, berbaId = z.id) =>
      odbijeno(() => ispraviBerbu(tx, { berbaId, tijelo, korisnikId: u.id }));

    jednako(await probaj({ secer: 90 }), "Upiši razlog ispravka.", "bez razloga");
    jednako(
      (await probaj({ kolicinaLitara: 900, razlog: "x" }))?.startsWith("Kolicina litara se ne ispravlja ovdje"),
      true,
      "litre su zakljucane, s objasnjenjem"
    );
    jednako(await probaj({ vrstaUnosa: "ZATECENO", razlog: "x" }), "Ta polja se ne mogu ispravljati: vrstaUnosa.", "nepoznato polje");
    jednako(
      (await probaj({ nazivSorte: `${s} Chardonnay`, razlog: "x" }))?.includes(`T${t1.broj}`),
      true,
      "sorta bez potvrde — poruka imenuje tank"
    );
    jednako(await probaj({ nazivSorte: "   ", razlog: "x" }), "Sorta ne smije ostati prazna.", "prazna sorta");
    jednako(
      await probaj({
        vlastitaBerba: true,
        pocetakBranja: "2026-08-27T10:00:00Z",
        krajBranja: "2026-08-27T08:00:00Z",
        razlog: "x",
      }),
      "Kraj branja mora biti poslije pocetka.",
      "kraj prije pocetka"
    );
    jednako(await probaj({ secer: 88, razlog: "x" }), "Nista se nije promijenilo — sva polja su ista kao sada.", "bez promjene");
    jednako(await probaj({ secer: 1, razlog: "x" }, "00000000-0000-0000-0000-000000000000"), "Berba ne postoji ili je obrisana.", "nepostojeca berba");

    const poslije = await tx.berba.findUniqueOrThrow({ where: { id: z.id } });
    jednako([poslije.secer, poslije.ispravljenoAt, poslije.nazivSorte], [88, null, `${s} Rizling`], "zapis netaknut");
    jednako(await tx.activityLog.count({ where: { entityId: z.id } }), 0, "dnevnik prazan");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 5: sorta s potvrdom", async (tx) => {
    const u = await korisnik(tx);
    const s = oznaka();
    const sifra = await tx.sorta.create({ data: { naziv: `${s} Chardonnay` } });
    const t1 = await tank(tx, "TEST stara sorta tanka");
    const t2 = await tank(tx, "TEST stara sorta tanka");
    const z = await berba(tx, { sorta: `${s} Pinot`, parcela: "5", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 2000 }, { id: t2.id, litre: 700 }] });

    const r = await ispraviBerbu(tx, {
      berbaId: z.id,
      tijelo: { nazivSorte: `${s} chardonnay`, potvrdaSorte: true, razlog: "zamijenjene sorte pri unosu" },
      korisnikId: u.id,
    });

    jednako(r.upozorenja.sorta?.map((t) => [t.broj, t.litre]), [[t1.broj, 2000], [t2.broj, 700]], "upozorenje nabraja tankove i litre");
    const zapis = await tx.berba.findUniqueOrThrow({ where: { id: z.id } });
    jednako([zapis.nazivSorte, zapis.sortaId], [`${s} Chardonnay`, sifra.id], "sorta i sifra iz sifrarnika");
    const stavke = await tx.punjenjeStavka.findMany({ where: { berbaId: z.id }, select: { nazivSorte: true, sortaId: true } });
    jednako(stavke.every((x) => x.nazivSorte === `${s} Chardonnay` && x.sortaId === sifra.id), true, "stavke dobile novu sortu");
    const tankovi = await tx.tank.findMany({ where: { id: { in: [t1.id, t2.id] } } });
    jednako(tankovi.every((t) => t.sorta === "TEST stara sorta tanka"), true, "Tank.sorta NIJE diran");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 6 i 7: zateceni sam; sudar grupa samo upozorava", async (tx) => {
    const u = await korisnik(tx);
    const s = oznaka();
    const t1 = await tank(tx);
    const z1 = await berba(tx, { sorta: `${s} Muskat`, parcela: null, datumBerbe: null, tankovi: [{ id: t1.id, litre: 100 }], vrsta: "ZATECENO", secer: 70 });
    const z2 = await berba(tx, { sorta: `${s} Muskat`, parcela: null, datumBerbe: null, tankovi: [{ id: t1.id, litre: 200 }], vrsta: "ZATECENO", secer: 70 });

    const r1 = await ispraviBerbu(tx, { berbaId: z1.id, tijelo: { secer: 75, razlog: "x" }, korisnikId: u.id });
    jednako(r1.zapisa, 1, "zateceni: ispravljen samo taj zapis");
    jednako((await tx.berba.findUniqueOrThrow({ where: { id: z2.id } })).secer, 70, "drugi zateceni istog kljuca netaknut");

    const x = await berba(tx, { sorta: `${s} Silvanac`, parcela: "1", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 300 }] });
    await berba(tx, { sorta: `${s} Silvanac`, parcela: "2", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 300 }] });
    const r2 = await ispraviBerbu(tx, { berbaId: x.id, tijelo: { parcela: "2", razlog: "krivi broj parcele" }, korisnikId: u.id });
    jednako(r2.upozorenja.sudarGrupe, true, "sudar s drugom grupom: upozorenje");
    jednako((await tx.berba.findUniqueOrThrow({ where: { id: x.id } })).parcela, "2", "sudar: ispravak ipak spremljen");
  });

  // -------------------------------------------------------------------------
  await scenarij("DOKAZ 8: pravila gotovog stanja", async (tx) => {
    const u = await korisnik(tx);
    const s = oznaka();
    const t1 = await tank(tx);
    const z = await berba(tx, { sorta: `${s} Traminac`, parcela: "9", datumBerbe: DATUM, tankovi: [{ id: t1.id, litre: 800 }] });
    await tx.berba.update({
      where: { id: z.id },
      data: {
        vlastitaBerba: true,
        pocetakBranja: new Date("2026-08-27T06:00:00Z"),
        krajBranja: new Date("2026-08-27T11:00:00Z"),
        brojBeraca: 12,
        maceracija: true,
        maceracijaSati: 6,
      },
    });

    await ispraviBerbu(tx, {
      berbaId: z.id,
      tijelo: { vlastitaBerba: false, maceracija: false, razlog: "kooperantsko grozdje, bez maceracije" },
      korisnikId: u.id,
    });
    const poslije = await tx.berba.findUniqueOrThrow({ where: { id: z.id } });
    jednako(
      [poslije.pocetakBranja, poslije.krajBranja, poslije.brojBeraca, poslije.maceracijaSati],
      [null, null, null, null],
      "nije vlastita: nema vremena ni beraca; nema maceracije: nema sati"
    );
    const polja = (await tx.activityLog.findMany({ where: { entityId: z.id } }))
      .map((d) => (d.payload as { polje: string }).polje)
      .sort();
    jednako(
      polja,
      ["brojBeraca", "krajBranja", "maceracija", "maceracijaSati", "pocetakBranja", "vlastitaBerba"],
      "dnevnik biljezi i posljedicna brisanja"
    );
  });

  console.log("");
  console.log(`proslo: ${proslo}, palo: ${pao}`);
  if (pao > 0) process.exitCode = 1;
  else console.log("Sve transakcije su namjerno vracene unatrag — u bazi nije ostao nijedan redak.");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
