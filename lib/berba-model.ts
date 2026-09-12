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
import { doTrenutkaSQL, praznjenjaPosuda, satKretanja } from "@/lib/sat-knjige";

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

  /**
   * STANJE U PROSLOM TRENUTKU — u obzir ulaze samo kretanja koja su se do
   * tada dogodila. Bez njega vrijedi "sada" i upit je znak za znak jednak
   * onome prije faze A.
   *
   * Sat je `lib/sat-knjige.ts`, ne goli `dogodenoAt`: 202 od 577 kretanja
   * datirano je unatrag, pa bi citanje po jednom stupcu razmjestilo povijest.
   *
   * CEMU SLUZI: mjerenje je stanje SMJESE u trenutku, a ne svojstvo berbe.
   * Adresu (tank + vrijeme) zadrzava, a odgovor na "koje je vino tada bilo u
   * tanku" daje knjiga — vidi `vinoUTrenucima`.
   */
  doTrenutka?: Date | null;
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
    WHERE (k."uTankId" = ${tankId} OR k."izTankId" = ${tankId})
      ${doTrenutkaSQL(opts?.doTrenutka)}
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
export async function litreUTanku(
  db: CitacBerbe,
  tankId: string,
  opts?: Opcije
): Promise<number> {
  const stanje = await stanjeTanka(db, tankId, opts);
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
      WHERE k."uTankId" IS NOT NULL ${doTrenutkaSQL(opts?.doTrenutka)}
      UNION ALL
      SELECT k."izTankId" AS "tankId", k."berbaId", b.obrisano,
             -ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
      JOIN "Berba" b ON b.id = k."berbaId"
      WHERE k."izTankId" IS NOT NULL ${doTrenutkaSQL(opts?.doTrenutka)}
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

/** Jedan tank u koji je berba USLA, s litrama tog ulaza. */
export type UlazniTank = {
  tankId: string;
  ml: number;
  litre: number;
};

/**
 * U KOJE JE TANKOVE BERBA USLA — iz njezinih ULAZ redaka.
 *
 * Razlicito od `gdjeJeBerba`, i to je cijela poanta:
 *   `gdjeJeBerba`         -> gdje je vino DANAS (nakon pretoka, izlaza, ispravaka)
 *   `ulazniTankoviBerbe`  -> gdje je USLO, sto se poslije nikad ne mijenja
 *
 * Otkad jedna berba smije uci u vise tankova (samotok u jedan, presovina u
 * drugi), `Berba.prviTankId` je "jedan od", ne "jedini" — pun popis stoji samo
 * ovdje. Cita se na dva mjesta: stranica berbe ga ispisuje, a cuvar brisanja
 * po njemu prepoznaje berbu razlivenu u vise tankova.
 *
 * Zbraja po tanku jer se dva ULAZ retka u isti tank ne smiju prikazati kao dva
 * tanka; knjiga ih doduse odbija pri upisu, ali backfill starijih zapisa nije
 * prosao kroz tu provjeru.
 */
export async function ulazniTankoviBerbe(
  db: CitacBerbe,
  berbaId: string
): Promise<UlazniTank[]> {
  const redci = await db.$queryRaw<Array<{ tankId: string; ml: number }>>`
    SELECT k."uTankId" AS "tankId",
           SUM(ROUND(k.litre::numeric * 1000))::float8 AS ml
    FROM "BerbaKretanje" k
    WHERE k."berbaId" = ${berbaId}
      AND k.vrsta = 'ULAZ'
      AND k."uTankId" IS NOT NULL
    GROUP BY k."uTankId"
    ORDER BY ml DESC, k."uTankId" ASC
  `;

  return redci.map((r) => ({
    tankId: r.tankId,
    ml: Number(r.ml),
    litre: uLitre(Number(r.ml)),
  }));
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
        ${doTrenutkaSQL(opts?.doTrenutka)}
      UNION ALL
      SELECT k."izTankId" AS "tankId", -ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
      WHERE k."berbaId" = ${berbaId} AND k."izTankId" IS NOT NULL
        ${doTrenutkaSQL(opts?.doTrenutka)}
    ) s
    GROUP BY s."tankId"
    ORDER BY ml DESC, s."tankId" ASC
  `;

  return redci
    .map((r) => ({ tankId: r.tankId, ml: Number(r.ml), litre: uLitre(Number(r.ml)) }))
    .filter((r) => opts?.svi || r.ml > 0);
}

/**
 * Gdje su danas SVE berbe — jedan upit za cijeli podrum.
 *
 * Parnjak `stanjeSvihTankova`, i postoji iz istog razloga: `gdjeJeBerba` je po
 * jednoj berbi, pa bi stranica `/berba` s 32 zapisa napravila 32 upita. To je
 * tocno ono sto lib/paralelno.ts zabranjuje — pooler drzi 15 veza za CIJELU
 * aplikaciju.
 *
 * Vraca mapu berbaId → mjesta. Berba koje danas nema nigdje NEMA kljuc u mapi;
 * to nije rupa nego odgovor: to je vino otislo iz podruma. Prikaz to mora reci
 * naglas, ne pokazati praznu nulu.
 */
export async function gdjeJeSveBerbe(
  db: CitacBerbe,
  opts?: Opcije
): Promise<Map<string, MjestoBerbe[]>> {
  const redci = await db.$queryRaw<Array<{ berbaId: string; tankId: string; ml: number }>>`
    SELECT s."berbaId", s."tankId", SUM(s.ml)::float8 AS ml
    FROM (
      SELECT k."berbaId", k."uTankId" AS "tankId",  ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
      WHERE k."uTankId" IS NOT NULL ${doTrenutkaSQL(opts?.doTrenutka)}
      UNION ALL
      SELECT k."berbaId", k."izTankId" AS "tankId", -ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
      WHERE k."izTankId" IS NOT NULL ${doTrenutkaSQL(opts?.doTrenutka)}
    ) s
    GROUP BY s."berbaId", s."tankId"
    ORDER BY s."berbaId" ASC, ml DESC, s."tankId" ASC
  `;

  const mapa = new Map<string, MjestoBerbe[]>();

  for (const r of redci) {
    const ml = Number(r.ml);
    if (!opts?.svi && ml <= 0) continue;

    const popis = mapa.get(r.berbaId) ?? [];
    popis.push({ tankId: r.tankId, ml, litre: uLitre(ml) });
    mapa.set(r.berbaId, popis);
  }

  return mapa;
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
   *
   * UVIJEK 0 kad se cita prosli trenutak (`Opcije.doTrenutka`): `Tank`
   * pamti samo danasnju kolicinu, pa usporedba s njom o proslom trenutku ne
   * govori nista. Bolje nula nego izmisljena razlika.
   */
  razlikaOdTankaL: number;
  /** Trenutak na koji stanje vrijedi; `null` znaci "sada". */
  naTrenutak: Date | null;
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
  tankId: string,
  opts?: Opcije
): Promise<Podrijetlo> {
  const naTrenutak = opts?.doTrenutka ?? null;
  const stanje = await stanjeTanka(db, tankId, opts);

  // `Tank` se za prosli trenutak NE cita: stupac zna samo danasnju kolicinu.
  const tank = naTrenutak
    ? null
    : await db.tank.findUnique({
        where: { id: tankId },
        select: { kolicinaVinaUTanku: true },
      });

  const uTankuMl = stanje.reduce((z, s) => z + s.ml, 0);
  const uTankuL = uLitre(uTankuMl);
  const uTanku = Number(tank?.kolicinaVinaUTanku ?? 0);

  if (stanje.length === 0) {
    return {
      stavke: [],
      ukupnoL: 0,
      razlikaOdTankaL: naTrenutak ? 0 : Number(uTanku.toFixed(3)),
      naTrenutak,
    };
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
    razlikaOdTankaL: naTrenutak ? 0 : Number((uTanku - uTankuL).toFixed(3)),
    naTrenutak,
  };
}

// ---------------------------------------------------------------------------
// Sastav izveden iz knjige (faza B)
// ---------------------------------------------------------------------------

/**
 * SASTAV KOJI SE NE PAMTI NEGO RACUNA.
 *
 * `TankSortaUdio` je SPREMLJENO stanje: postotci koje je netko upisao ili koje
 * je pretok izracunao i ostavio. Cim se upise, moze odlutati od stvarnosti i
 * nista ga ne vraca natrag — isto vrijedi za `BlendIzvor`, koji na tanku 43
 * tvrdi 585 L dok je u tanku 565.
 *
 * Isti podatak knjiga zna izvesti: svaka berba u tanku nosi svoj `nazivSorte`,
 * a koliko je koje berbe u tanku racuna se iz redaka. Zbroj redaka ne moze
 * biti u neskladu s tim redcima.
 *
 * PONDERIRA SE PO LITRAMA, nikad obicnim prosjekom po broju berbi. Tri berbe
 * Grasevine od 100 L i jedna Chardonnaya od 3.000 L nisu 75 % naprama 25 %,
 * nego 9 % naprama 91 %. Zato se zbrajaju MILILITRI pa se tek onda dijeli.
 *
 * Postotci idu kroz `postotciIzMl` (metoda najveceg ostatka), pa im je zbroj
 * tocno 100,00 — isti racun koji vec slaze blend i sastav pri pretoku.
 */
/**
 * Ime pod kojim knjiga vodi litre kojima sortu ne zna.
 *
 * Nastaje na dva mjesta: `zabiljeziIzlaz` kad tank ima vise vina nego knjiga
 * (`ZATECENO` nadopuna) i backfill knjige za pocetno stanje podruma. Danas je
 * tako zavedeno 17 zapisa i 55.800 L.
 *
 * NIJE SORTA i ne smije se citati kao neslaganje sa spremljenim sastavom:
 * "Grasevina 91,9 % naprama knjizi 70,6 %" ne znaci da je jedno od toga krivo,
 * nego da knjiga za 21 % litara ne zna sto su. Zato se usporedjuje samo POZNATI
 * dio, a nepoznati se imenuje posebno.
 */
export const SORTA_NEPOZNATA = "Nepoznato podrijetlo";

export type StavkaSastava = {
  nazivSorte: string;
  litre: number;
  /** Udio u CIJELOM tanku. */
  postotak: number;
  /**
   * Udio u dijelu kojemu knjiga zna sortu. `null` na samom nepoznatom retku i
   * kad poznatog dijela uopce nema.
   *
   * Postoji zbog usporedbe sa spremljenim sastavom: `TankSortaUdio` opisuje
   * poznato vino i zbraja se na 100, pa se s `postotak` (koji ukljucuje i
   * nepoznato) ne smije usporedjivati izravno.
   */
  postotakOdPoznatog: number | null;
  /** Je li ovo redak litara bez poznate sorte. */
  nepoznata: boolean;
  /** Koliko je razlicitih zapisa berbe slozeno u ovaj redak. */
  berbi: number;
};

/**
 * Sastav po sortama iz vec procitanog podrijetla — CISTA funkcija, bez upita.
 *
 * Racuna se iz `Podrijetlo`, a ne vlastitim citanjem, iz dva razloga: stranica
 * tanka podrijetlo ionako cita, pa ovo ne dodaje nijedan upit; i sastav i
 * podrijetlo tada ne mogu ispasti iz dva razlicita stanja.
 */
export function sastavIzPodrijetla(p: Podrijetlo): StavkaSastava[] {
  const poSorti = new Map<string, { ml: number; berbi: number }>();

  for (const s of p.stavke) {
    const naziv = s.nazivSorte?.trim() || "Nepoznata sorta";
    const prije = poSorti.get(naziv) ?? { ml: 0, berbi: 0 };

    // Natrag u mililitre: `uTankuL` je vec zaokruzen iz njih, pa je pretvorba
    // tocna, a zbrajanje cijelih brojeva ne ostavlja repove.
    poSorti.set(naziv, {
      ml: prije.ml + Math.round(s.uTankuL * 1000),
      berbi: prije.berbi + 1,
    });
  }

  const redci = [...poSorti.entries()].sort(
    (a, b) => b[1].ml - a[1].ml || a[0].localeCompare(b[0], "hr")
  );

  if (redci.length === 0) return [];

  const jeNepoznata = (naziv: string) => naziv === SORTA_NEPOZNATA;

  const postotci = postotciIzMl(redci.map(([, v]) => v.ml));

  // Drugi racun, samo nad poznatim dijelom — opet metodom najveceg ostatka, pa
  // se i taj niz zbraja na tocno 100,00. Racuna se odvojeno, a ne skaliranjem
  // prvoga: skaliranje bi zaokruzivanje primijenilo dvaput.
  const poznati = redci.filter(([naziv]) => !jeNepoznata(naziv));
  const postotciPoznatih = postotciIzMl(poznati.map(([, v]) => v.ml));
  const poznatiPoNazivu = new Map(
    poznati.map(([naziv], i) => [naziv, postotciPoznatih[i]])
  );

  return redci.map(([nazivSorte, v], i) => ({
    nazivSorte,
    litre: uLitre(v.ml),
    postotak: postotci[i],
    postotakOdPoznatog: poznatiPoNazivu.get(nazivSorte) ?? null,
    nepoznata: jeNepoznata(nazivSorte),
    berbi: v.berbi,
  }));
}

/** Litre kojima knjiga ne zna sortu, i njihov udio u tanku. */
export function nepoznatiDio(stavke: StavkaSastava[]): {
  litre: number;
  postotak: number;
} {
  const redak = stavke.find((s) => s.nepoznata);
  return { litre: redak?.litre ?? 0, postotak: redak?.postotak ?? 0 };
}

/** Jedna sorta, kako je stoji u spremljenom i kako je racuna knjiga. */
export type RazlikaSastava = {
  nazivSorte: string;
  /** `null` = te sorte u spremljenom sastavu uopce nema. */
  spremljeno: number | null;
  /** `null` = knjiga tu sortu ne poznaje. */
  izKnjige: number | null;
  /** Knjiga minus spremljeno, u postotnim bodovima. */
  razlika: number;
};

/**
 * Usporedi spremljeni sastav s izvedenim — SAMO nad poznatim dijelom.
 *
 * Nepoznati redak (`SORTA_NEPOZNATA`) se izostavlja i uzimaju se
 * `postotakOdPoznatog` vrijednosti: `TankSortaUdio` opisuje vino kojemu je
 * sorta poznata i zbraja se na 100, pa bi usporedba s udjelom u cijelom tanku
 * svaku nepoznanicu prikazala kao neslaganje. Koliko je nepoznatog, kaze
 * `nepoznatiDio` — zasebno, jer je to druga tvrdnja.
 *
 * PRAG je 0,5 postotnog boda i nije proizvoljan: oba niza zaokruzuju na dvije
 * decimale metodom najveceg ostatka, pa se na istim podacima smiju razici za
 * najvise jedan bod u zadnjem retku. Sve ispod praga je zaokruzivanje, sve
 * iznad je stvarna razlika.
 *
 * Ne ispravlja nista i ne odlucuje tko je u pravu — samo pokazuje oba broja.
 */
export function razlikaSastava(
  spremljeno: Array<{ nazivSorte: string; postotak: number }>,
  izKnjige: StavkaSastava[],
  prag = 0.5
): RazlikaSastava[] {
  const kljuc = (s: string) => s.trim().toLocaleLowerCase("hr");

  const a = new Map(spremljeno.map((s) => [kljuc(s.nazivSorte), s]));
  const b = new Map(
    izKnjige
      .filter((s) => !s.nepoznata && s.postotakOdPoznatog != null)
      .map((s) => [
        kljuc(s.nazivSorte),
        { nazivSorte: s.nazivSorte, postotak: s.postotakOdPoznatog as number },
      ])
  );

  const sviKljucevi = [...new Set([...a.keys(), ...b.keys()])];
  const razlike: RazlikaSastava[] = [];

  for (const k of sviKljucevi) {
    const x = a.get(k);
    const y = b.get(k);

    const spremljenoP = x ? Number(x.postotak) : null;
    const knjigaP = y ? Number(y.postotak) : null;
    const razlika = Number(((knjigaP ?? 0) - (spremljenoP ?? 0)).toFixed(2));

    if (Math.abs(razlika) < prag) continue;

    razlike.push({
      nazivSorte: y?.nazivSorte ?? x?.nazivSorte ?? k,
      spremljeno: spremljenoP,
      izKnjige: knjigaP,
      razlika,
    });
  }

  return razlike.sort((p, q) => Math.abs(q.razlika) - Math.abs(p.razlika));
}

// ---------------------------------------------------------------------------
// Koje je vino bilo u tanku u nekom trenutku (faza C)
// ---------------------------------------------------------------------------

/** Jedna berba u tanku u jednom trenutku. */
export type UdioUTrenutku = {
  berbaId: string;
  nazivSorte: string;
  oznakaBerbe: string | null;
  datumBerbe: Date | null;
  vrstaUnosa: "BERBA" | "ZATECENO";
  litre: number;
  /** Udio u onome sto je tada bilo u tanku. Zbroj je tocno 100,00. */
  postotak: number;
  nepoznata: boolean;
};

export type VinoUTrenutku = {
  trenutak: Date;
  ukupnoL: number;
  stavke: UdioUTrenutku[];
};

/**
 * KOJE JE VINO BILO U TANKU U SVAKOM OD ZADANIH TRENUTAKA.
 *
 * Ovo je cijela poanta faze C. Mjerenje ZADRZAVA svoju adresu — tank i
 * vrijeme — jer je mjerenje stanje SMJESE u trenutku, a ne svojstvo nijedne
 * berbe: vino od cetrnaest berbi ima jedan pH, ne cetrnaest. Ono sto se
 * izvodi iz knjige nije vrijednost nego ODGOVOR NA PITANJE CIJE JE TO VINO
 * BILO.
 *
 * JEDAN UPIT ZA SVE TRENUTKE, ne jedan po mjerenju. Tank ima najvise
 * nekoliko desetaka redaka u knjizi, pa se svi povuku odjednom i preklope u
 * JavaScriptu — dvadeset mjerenja inace znaci dvadeset odlazaka do baze, sto
 * je tocno ono sto lib/paralelno.ts zabranjuje (pooler drzi 15 veza za
 * CIJELU aplikaciju).
 *
 * SAT je `lib/sat-knjige.ts`, isti koji koristi i SQL grana — zato ovdje ne
 * stoji vlastita usporedba datuma.
 *
 * GRANICA JE UKLJUCIVA: mjerenje iz iste sekunde kad je vino uslo mjerilo je
 * vino koje je vec bilo unutra. Punjenje i njegovo pocetno mjerenje inace bi
 * pala na dvije strane granice.
 */
export async function vinoUTrenucima(
  db: CitacBerbe,
  tankId: string,
  trenuci: Date[]
): Promise<VinoUTrenutku[]> {
  if (trenuci.length === 0) return [];

  const kretanja = await db.berbaKretanje.findMany({
    where: { OR: [{ uTankId: tankId }, { izTankId: tankId }] },
    select: {
      id: true,
      berbaId: true,
      uTankId: true,
      izTankId: true,
      litre: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });

  if (kretanja.length === 0) {
    return trenuci.map((t) => ({ trenutak: t, ukupnoL: 0, stavke: [] }));
  }

  const berbe = await db.berba.findMany({
    where: { id: { in: [...new Set(kretanja.map((k) => k.berbaId))] } },
    select: {
      id: true,
      nazivSorte: true,
      oznakaBerbe: true,
      datumBerbe: true,
      vrstaUnosa: true,
      createdAt: true,
    },
  });

  const poId = new Map(berbe.map((b) => [b.id, b]));

  // Sat po retku racuna se JEDNOM, ne u petlji po trenucima. Praznjenja se
  // racunaju iz istih redaka — donja brana unatrag datiranog punjenja mora
  // vrijediti i ovdje, inace bi mjerenje dobilo vino koje je iz tanka vec
  // otislo (vidi lib/sat-knjige.ts).
  const praznjenja = praznjenjaPosuda(kretanja);

  const sKlokom = kretanja.map((k) => ({
    berbaId: k.berbaId,
    ml:
      (k.uTankId === tankId ? Math.round(Number(k.litre) * 1000) : 0) -
      (k.izTankId === tankId ? Math.round(Number(k.litre) * 1000) : 0),
    sat: satKretanja(k, praznjenja),
  }));

  return trenuci.map((trenutak) => {
    const ms = trenutak.getTime();
    const poBerbi = new Map<string, number>();

    for (const k of sKlokom) {
      if (k.sat > ms) continue;
      poBerbi.set(k.berbaId, (poBerbi.get(k.berbaId) ?? 0) + k.ml);
    }

    // Berba na nuli ili u minusu ne opisuje vino koje je tada bilo u tanku.
    // Minus je moguc kod unatrag datiranog unosa i tada je izostavljanje
    // jedino posteno: reci "-40 L Grasevine" znacilo bi tvrditi nesto o vinu,
    // a to je trag redoslijeda upisa.
    const redci = [...poBerbi.entries()]
      .filter(([, ml]) => ml > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    if (redci.length === 0) {
      return { trenutak, ukupnoL: 0, stavke: [] };
    }

    const postotci = postotciIzMl(redci.map(([, ml]) => ml));
    const ukupnoMl = redci.reduce((z, [, ml]) => z + ml, 0);

    return {
      trenutak,
      ukupnoL: uLitre(ukupnoMl),
      stavke: redci.map(([berbaId, ml], i) => {
        const b = poId.get(berbaId);
        const naziv = b?.nazivSorte?.trim() || SORTA_NEPOZNATA;

        return {
          berbaId,
          nazivSorte: naziv,
          oznakaBerbe: b?.oznakaBerbe ?? null,
          datumBerbe: b?.datumBerbe ?? null,
          vrstaUnosa: (b?.vrstaUnosa ?? "ZATECENO") as "BERBA" | "ZATECENO",
          litre: uLitre(ml),
          postotak: postotci[i],
          nepoznata: naziv === SORTA_NEPOZNATA,
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Sastav za CIJELI podrum (faza E)
// ---------------------------------------------------------------------------

/**
 * IZVEDENI SASTAV SVIH TANKOVA — dva upita za cijeli podrum.
 *
 * Faza E. `TankSortaUdio` prestaje biti izvor istine i postaje predmemorija;
 * ekrani koji prikazuju sastav citaju odavde. Postoji odvojeno od
 * `sastavIzPodrijetla` jer stranice s vise tankova (izvjestaj podruma,
 * statistika, popis sadrzaja) inace trebaju dva upita PO TANKU — 96 upita za
 * 48 tankova, sto lib/paralelno.ts zabranjuje.
 *
 * Racun je isti: mililitri po sorti, pa postotci metodom najveceg ostatka.
 * Ponder je LITRA, nikad broj zapisa berbe.
 *
 * Tank kojeg nema u mapi nema vina po knjizi — to nije isto sto i prazan
 * popis, pa pozivatelj razlikuje `undefined` (knjiga ne zna nista) od `[]`.
 */
export async function sastavSvihTankova(
  db: CitacBerbe,
  opts?: Opcije
): Promise<Map<string, StavkaSastava[]>> {
  const stanje = await stanjeSvihTankova(db, opts);
  if (stanje.size === 0) return new Map();

  const berbaIds = new Set<string>();
  for (const popis of stanje.values())
    for (const s of popis) berbaIds.add(s.berbaId);

  const berbe = await db.berba.findMany({
    where: { id: { in: [...berbaIds] } },
    select: { id: true, nazivSorte: true },
  });

  const nazivPoId = new Map(berbe.map((b) => [b.id, b.nazivSorte]));
  const izlaz = new Map<string, StavkaSastava[]>();

  for (const [tankId, popis] of stanje) {
    const poSorti = new Map<string, { ml: number; berbi: number }>();

    for (const s of popis) {
      if (s.ml <= 0) continue;
      const naziv = (nazivPoId.get(s.berbaId) ?? "").trim() || SORTA_NEPOZNATA;
      const prije = poSorti.get(naziv) ?? { ml: 0, berbi: 0 };
      poSorti.set(naziv, { ml: prije.ml + s.ml, berbi: prije.berbi + 1 });
    }

    const redci = [...poSorti.entries()].sort(
      (a, b) => b[1].ml - a[1].ml || a[0].localeCompare(b[0], "hr")
    );

    if (redci.length === 0) {
      izlaz.set(tankId, []);
      continue;
    }

    const postotci = postotciIzMl(redci.map(([, v]) => v.ml));
    const poznati = redci.filter(([naziv]) => naziv !== SORTA_NEPOZNATA);
    const postotciPoznatih = postotciIzMl(poznati.map(([, v]) => v.ml));
    const poznatiPoNazivu = new Map(
      poznati.map(([naziv], i) => [naziv, postotciPoznatih[i]])
    );

    izlaz.set(
      tankId,
      redci.map(([nazivSorte, v], i) => ({
        nazivSorte,
        litre: uLitre(v.ml),
        postotak: postotci[i],
        postotakOdPoznatog: poznatiPoNazivu.get(nazivSorte) ?? null,
        nepoznata: nazivSorte === SORTA_NEPOZNATA,
        berbi: v.berbi,
      }))
    );
  }

  return izlaz;
}
