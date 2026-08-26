/**
 * BERBA — CITANJE. Ovdje se nista ne upisuje.
 *
 * Par s lib/berba-knjiga.ts: ondje je pisanje, ovdje odgovori na dva pitanja
 * koja aplikacija stvarno postavlja.
 *
 *   1. STANJE BERBE PO TANKU — koliko litara koje berbe je SADA u tanku T.
 *   2. PODRIJETLO TANKA — isti odgovor, ali s podacima berbe uza se
 *      (sorta, datum, polozaj, kilogrami) i s postotcima, spreman za prikaz.
 *
 * ZASTO SE STANJE RACUNA, A NE CITA IZ STUPCA
 * -------------------------------------------
 * Stanje NIGDJE nije spremljeno. Racuna se iz knjige, svaki put:
 *
 *     litre berbe B u tanku T
 *       = SUM(litre WHERE berbaId=B AND uTankId=T)
 *       - SUM(litre WHERE berbaId=B AND izTankId=T)
 *
 * Tako nema druge tablice koja moze odlutati od knjige. Da se moze — vec se
 * dogodilo: `TankSortaUdio` i `BlendIzvor` su spremljena stanja i danas na
 * tanku 43 pisu 585 L dok je u tanku 565 L. Zbroj koji se racuna iz redaka ne
 * moze biti u neskladu s tim redcima.
 *
 * MILILITRI, NE LITRE
 * -------------------
 * Zbraja se u CIJELIM MILILITRIMA, u SQL-u, preko `numeric` — ne u litrama i
 * ne u JavaScriptu. `litre` je DOUBLE PRECISION, pa bi zbrajanje petnaest
 * pretoka u pokretnom zarezu ostavljalo repove tipa 4799.999999999999. Knjiga
 * pise iskljucivo cijele mililitre (`uLitre` u lib/filtracija.ts), pa je
 * `ROUND(litre * 1000)` tocan povratak u njih, a zbroj cijelih brojeva ne
 * moze odlutati. U litre se pretvara tek na izlazu iz ovog modula.
 *
 * MJERE KOJE SE OVDJE NE ZBRAJAJU
 * -------------------------------
 * Kilogrami grozdja se NE zbrajaju i nema funkcije koja bi to radila — isto
 * pravilo koje vec drzi lib/berba-lanac.ts. Iz svake berbe u tank dolazi samo
 * DIO, a kilogrami opisuju cijelu berbenu partiju; zbroj bi tvrdio grozdje
 * koje u tank nikad nije uslo. Kilogrami se prikazuju uz izvornu berbu, s
 * omjerom pored ("od 10.450 L u ovom tanku ima 4.800 L").
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { postotciIzMl, uLitre } from "@/lib/filtracija";
import { usporediPoBerbi } from "@/lib/berba-lanac";

export type CitacBerbe = Prisma.TransactionClient | PrismaClient;

/** Koliko mililitara jedne berbe stoji u jednom tanku. */
export type StanjeBerbe = {
  berbaId: string;
  ml: number;
  /** Isti broj u litrama, zaokruzen iz mililitara — nikad iz decimalnog racuna. */
  litre: number;
  /** Je li zapis berbe meko obrisan (pogresan unos). Vidi `Opcije.svi`. */
  obrisano: boolean;
};

/**
 * Stanje jedne berbe rasprseno po tankovima — druga strana istog pitanja.
 * "Gdje je danas grozdje ubrano 24.08.?" umjesto "sto je u tanku 12?".
 */
export type MjestoBerbe = {
  tankId: string;
  ml: number;
  litre: number;
};

export type Opcije = {
  /**
   * Vratiti i berbe koje su na nuli ili u minusu, i one meko obrisane.
   *
   * Zadano `false` — prikaz ih ne treba. Postavlja ga `scripts/provjeri-berbu.ts`,
   * kojem su upravo ti redci predmet provjere: obrisana berba koja jos ima
   * pozitivno stanje znaci da je zapis maknut a vino ostalo, i to se mora
   * VIDJETI, a ne tiho nestati iz zbroja.
   */
  svi?: boolean;
};

// ---------------------------------------------------------------------------
// Stanje
// ---------------------------------------------------------------------------

type RedakStanja = { berbaId: string; ml: number; obrisano: boolean };

/**
 * Koje berbe i s koliko litara stoje u jednom tanku.
 *
 * Jedan upit, bez obzira na broj berbi u tanku. Poredak je po kolicini
 * silazno, pa po id-u — da ishod ne ovisi o tome kako je Postgres slozio
 * retke. Taj je poredak ujedno ULAZ U `podijeliMl` pri sljedecem pretoku
 * (lib/berba-knjiga.ts), pa bi njegova nestalnost bez razloga pomicala
 * mililitar-dva medju berbama.
 */
export async function stanjeTanka(
  db: CitacBerbe,
  tankId: string,
  opts?: Opcije
): Promise<StanjeBerbe[]> {
  const redci = await db.$queryRaw<RedakStanja[]>`
    SELECT k."berbaId",
           b.obrisano,
           SUM(
             (CASE WHEN k."uTankId"  = ${tankId} THEN ROUND(k.litre::numeric * 1000) ELSE 0 END)
           - (CASE WHEN k."izTankId" = ${tankId} THEN ROUND(k.litre::numeric * 1000) ELSE 0 END)
           )::float8 AS ml
    FROM "BerbaKretanje" k
    JOIN "Berba" b ON b.id = k."berbaId"
    WHERE k."uTankId" = ${tankId} OR k."izTankId" = ${tankId}
    GROUP BY k."berbaId", b.obrisano
    ORDER BY ml DESC, k."berbaId" ASC
  `;

  return redci
    .map((r) => ({
      berbaId: r.berbaId,
      ml: Number(r.ml),
      litre: uLitre(Number(r.ml)),
      obrisano: r.obrisano,
    }))
    .filter((r) => opts?.svi || (r.ml > 0 && !r.obrisano));
}

/** Zbroj svih berbi u tanku, u litrama. Ono s cime se usporedjuje `Tank.kolicinaVinaUTanku`. */
export async function litreUTanku(db: CitacBerbe, tankId: string): Promise<number> {
  const stanje = await stanjeTanka(db, tankId);
  return uLitre(stanje.reduce((z, s) => z + s.ml, 0));
}

/**
 * Stanje SVIH tankova odjednom — jedan upit za cijeli podrum.
 *
 * Postoji zbog `scripts/provjeri-berbu.ts` i zavrsnog usaglasavanja u
 * `scripts/backfill-berba.ts`: oboje mora proci kroz 44 tanka, a 44 odvojena
 * upita su tocno ono sto lib/paralelno.ts zabranjuje (pooler drzi 15 veza za
 * CIJELU aplikaciju).
 */
export async function stanjeSvihTankova(
  db: CitacBerbe,
  opts?: Opcije
): Promise<Map<string, StanjeBerbe[]>> {
  const redci = await db.$queryRaw<
    Array<{ tankId: string; berbaId: string; ml: number; obrisano: boolean }>
  >`
    SELECT s."tankId", s."berbaId", s.obrisano, SUM(s.ml)::float8 AS ml
    FROM (
      SELECT k."uTankId" AS "tankId", k."berbaId", b.obrisano,
             ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
      JOIN "Berba" b ON b.id = k."berbaId"
      WHERE k."uTankId" IS NOT NULL
      UNION ALL
      SELECT k."izTankId" AS "tankId", k."berbaId", b.obrisano,
             -ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
      JOIN "Berba" b ON b.id = k."berbaId"
      WHERE k."izTankId" IS NOT NULL
    ) s
    GROUP BY s."tankId", s."berbaId", s.obrisano
    ORDER BY s."tankId" ASC, ml DESC, s."berbaId" ASC
  `;

  const mapa = new Map<string, StanjeBerbe[]>();

  for (const r of redci) {
    const ml = Number(r.ml);
    if (!opts?.svi && (ml <= 0 || r.obrisano)) continue;

    const popis = mapa.get(r.tankId) ?? [];
    popis.push({ berbaId: r.berbaId, ml, litre: uLitre(ml), obrisano: r.obrisano });
    mapa.set(r.tankId, popis);
  }

  return mapa;
}

/** Gdje je danas jedna berba — po tankovima. Obrnut smjer od `stanjeTanka`. */
export async function gdjeJeBerba(
  db: CitacBerbe,
  berbaId: string,
  opts?: Opcije
): Promise<MjestoBerbe[]> {
  const redci = await db.$queryRaw<Array<{ tankId: string; ml: number }>>`
    SELECT s."tankId", SUM(s.ml)::float8 AS ml
    FROM (
      SELECT k."uTankId" AS "tankId",  ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
      WHERE k."berbaId" = ${berbaId} AND k."uTankId" IS NOT NULL
      UNION ALL
      SELECT k."izTankId" AS "tankId", -ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
      WHERE k."berbaId" = ${berbaId} AND k."izTankId" IS NOT NULL
    ) s
    GROUP BY s."tankId"
    ORDER BY ml DESC, s."tankId" ASC
  `;

  return redci
    .map((r) => ({ tankId: r.tankId, ml: Number(r.ml), litre: uLitre(Number(r.ml)) }))
    .filter((r) => opts?.svi || r.ml > 0);
}

// ---------------------------------------------------------------------------
// Podrijetlo
// ---------------------------------------------------------------------------

/**
 * Jedan zapis berbe onako kako se prikazuje uz tank: podaci berbe kakvi jesu,
 * plus KOLIKO JE OD NJE u ovom tanku.
 *
 * `kolicinaLitara` i `kolicinaKgGrozdja` su IZVORNI brojevi berbe i ne
 * skaliraju se — ista odluka koja vec stoji u lib/berba-lanac.ts. Omjer se
 * kaze s dva broja jedan pored drugoga (`uTankuL` od `kolicinaLitara`), ne
 * izmisljanjem trece brojke.
 */
export type ZapisPodrijetla = {
  berbaId: string;
  vrstaUnosa: "BERBA" | "ZATECENO";
  nazivSorte: string;
  datumBerbe: Date | null;
  godinaBerbe: number | null;
  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
  secer: number | null;
  kiseline: number | null;
  ph: number | null;
  maceracija: boolean | null;
  maceracijaSati: number | null;
  napomena: string | null;
  /** Litre i kilogrami CIJELE berbe, neskalirani. */
  kolicinaLitara: number;
  kolicinaKgGrozdja: number | null;
  /** Tank u koji je vino prvo uslo — moze i ne biti ovaj. */
  prviTankId: string | null;
  /** Koliko te berbe ima U OVOM TANKU. */
  uTankuL: number;
  /** Udio u ovom tanku. Zbroj je tocno 100,00 (metoda najveceg ostatka). */
  postotak: number;
};

export type Podrijetlo = {
  stavke: ZapisPodrijetla[];
  /** Zbroj svih stavki. Ono sto knjiga tvrdi da je u tanku. */
  ukupnoL: number;
  /**
   * Koliko litara tank ima, a knjiga ih ne zna objasniti (negativno = obrnuto).
   * Nula je uredno stanje. Prikaz ovo smije reci naglas — sutnja bi
   * neobjasnjene litre pretvorila u nevidljive.
   */
  razlikaOdTankaL: number;
};

/**
 * Podrijetlo vina u tanku — stanje iz knjige, spojeno s podacima berbi.
 *
 * Tri upita, bez obzira na broj berbi: stanje (grupiran zbroj), pogodjeni
 * `Berba` redci odjednom, i `Tank` radi `razlikaOdTankaL`.
 *
 * POREDAK je `usporediPoBerbi` iz lib/berba-lanac.ts — namjerno ISTI kojim
 * monitor tanka vec slaze karticu berbe. Dva razlicita poretka u dvije
 * kartice istog ekrana citala bi se kao greska.
 */
export async function podrijetloTanka(
  db: CitacBerbe,
  tankId: string
): Promise<Podrijetlo> {
  const stanje = await stanjeTanka(db, tankId);

  const tank = await db.tank.findUnique({
    where: { id: tankId },
    select: { kolicinaVinaUTanku: true },
  });

  const uTankuMl = stanje.reduce((z, s) => z + s.ml, 0);
  const uTankuL = uLitre(uTankuMl);
  const uTanku = Number(tank?.kolicinaVinaUTanku ?? 0);

  if (stanje.length === 0) {
    return { stavke: [], ukupnoL: 0, razlikaOdTankaL: Number(uTanku.toFixed(3)) };
  }

  const berbe = await db.berba.findMany({
    where: { id: { in: stanje.map((s) => s.berbaId) } },
  });

  const poId = new Map(berbe.map((b) => [b.id, b]));

  // Postotci se racunaju iz MILILITARA i metodom najveceg ostatka, pa im je
  // zbroj tocno 100,00. Tri jednake trecine ovdje ne daju 99,99.
  const postotci = postotciIzMl(stanje.map((s) => s.ml));

  const stavke: ZapisPodrijetla[] = [];

  for (let i = 0; i < stanje.length; i++) {
    const s = stanje[i];
    const b = poId.get(s.berbaId);
    // Berba bez retka ne moze postojati (`BerbaKretanje.berbaId` ima strani
    // kljuc s onDelete: Restrict), ali tip je opcijski pa se preskace bez pada.
    if (!b) continue;

    stavke.push({
      berbaId: b.id,
      vrstaUnosa: b.vrstaUnosa,
      nazivSorte: b.nazivSorte,
      datumBerbe: b.datumBerbe,
      godinaBerbe: b.godinaBerbe,
      polozaj: b.polozaj,
      parcela: b.parcela,
      vinograd: b.vinograd,
      oznakaBerbe: b.oznakaBerbe,
      secer: b.secer == null ? null : Number(b.secer),
      kiseline: b.kiseline == null ? null : Number(b.kiseline),
      ph: b.ph == null ? null : Number(b.ph),
      maceracija: b.maceracija,
      maceracijaSati: b.maceracijaSati == null ? null : Number(b.maceracijaSati),
      napomena: b.napomena,
      kolicinaLitara: Number(b.kolicinaLitara ?? 0),
      kolicinaKgGrozdja:
        b.kolicinaKgGrozdja == null ? null : Number(b.kolicinaKgGrozdja),
      prviTankId: b.prviTankId,
      uTankuL: s.litre,
      postotak: postotci[i],
    });
  }

  const poredak = (x: ZapisPodrijetla) => ({
    datumBerbe: x.datumBerbe,
    // Berba nema `datumPunjenja`; zamjena je trenutak upisa zapisa, sto je
    // tocno uloga koju `datumPunjenja` ima u usporedbi — zamjena za datum
    // berbe kad ga nema.
    datumPunjenja: poId.get(x.berbaId)!.createdAt,
    tezina: x.uTankuL,
    kljuc: x.berbaId,
  });

  stavke.sort((a, b) => usporediPoBerbi(poredak(a), poredak(b)));

  return {
    stavke,
    ukupnoL: uTankuL,
    razlikaOdTankaL: Number((uTanku - uTankuL).toFixed(3)),
  };
}
