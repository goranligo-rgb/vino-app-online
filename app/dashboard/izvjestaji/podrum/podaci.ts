/**
 * Dohvat podataka za tiskani izvjestaj podruma.
 *
 * ZASTO NE `app/tankovi/[id]/page.tsx`: taj radi ~25 upita u 6 krugova ZA JEDAN
 * tank (val od 4, pa blend sirine 2, pa lanac berbe). Puta 38 punih tankova to
 * je oko 950 upita — neupotrebljivo uz pooler koji drzi malo veza za cijelu
 * aplikaciju. Ovdje je obrnuto: JEDAN `findMany` po modelu za SVE tankove, pa
 * se sve slaze u memoriji. Osam upita ukupno, u tri kruga.
 *
 * NIJEDAN upit ne smije biti po tanku. Kad zatreba novi podatak, prosiri
 * postojeci upit ili dodaj jedan nad svim tankovima — ne petlju.
 */

import { prisma } from "@/lib/prisma";
import { uValovima } from "@/lib/paralelno";

/** Koliko dana unatrag gledaju traka i graf temperature/secera. */
export const DANA_GRAF = 10;
/** Koliko tjedana unatrag gleda graf SO2. */
export const TJEDANA_SO2 = 8;
/** Ciljna vrijednost slobodnog SO2 na grafu. */
export const CILJ_SLOBODNI_SO2 = 30;
/** Iznad ovog udjela tank se tretira kao jednosortni (blok "Berba"). */
export const PRAG_JEDNOSORTNI = 90;

// --- Sirovi oblici koje vracaju $queryRaw upiti -----------------------------

type DanTemperature = {
  tankId: string;
  dan: Date;
  avg: number;
  min: number;
  max: number;
  hladi: boolean;
};

type ZadnjeOcitanje = {
  tankId: string;
  temperatura: number | null;
  zadanaTemperatura: number | null;
  hladjenjeAktivno: boolean;
  status: string;
  mjerenoU: Date;
};

type ZadnjiDolazak = {
  tankId: string;
  datum: Date;
  vrsta: "PUNJENJE" | "PRETOK";
};

/**
 * Zapis berbe koji je SADA u tanku, po knjizi kretanja.
 *
 * ZASTO KNJIGA, A NE `Berba.prviTankId`: `prviTankId` je tank u koji je vino
 * PRVO uslo. Cim se pretoci dalje, veza vise ne pokazuje gdje vino jest.
 * Izmjereno 09.09.2026: od 25 tankova s dominantnom sortom, preko `prviTankId`
 * berba je dohvatljiva za 12, a preko knjige za 23 — medju izgubljenima su i
 * tankovi koji su 100 % jedne sorte. Knjiga je ionako jedini izvor istine za
 * stanje (vidi biljesku uz model `BerbaKretanje`).
 */
/**
 * Oblici redaka Prisma upita ispisani RUCNO.
 *
 * `Awaited<ReturnType<typeof prisma.x.findMany>>` ovdje ne valja: on daje puni
 * model, a ne ono sto `select` stvarno vraca — pa bi `preparat` i `jedinica`
 * ispali iz tipa, a polja koja se ne dohvacaju u njemu ostala.
 */
export type RedMjerenja = {
  tankId: string;
  izmjerenoAt: Date;
  secer: number | null;
  ukupneKiseline: number | null;
  ph: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  temperatura: number | null;
};

export type RedRadnje = {
  tankId: string;
  vrsta: string;
  opis: string | null;
  kolicina: number | null;
  /** Kad se cin dogodio — ne kad je izvedeni redak nastao. */
  dogodenoAt: Date;
  preparatNaziv: string | null;
  jedinicaNaziv: string | null;
  jeKvasac: boolean;
  /** Koliki dio danasnjeg vina u tanku je taj cin zahvatio, 0..1. */
  udio: number;
  /** Tank u kojem je cin izveden — prikaz kaze "(T17)". */
  izvorniBrojTanka: number | null;
};

export type RedUdjela = {
  tankId: string;
  nazivSorte: string;
  postotak: number;
};

/**
 * Sastavnica blenda, s OZNAKOM IZVORA.
 *
 * `izvorBroj` je broj tanka (za zivi izvor) ili broj tanka iz kojeg je vino
 * arhivirano; `izvorVrsta` kaze koje je od toga. Treba jer se `nazivVina`
 * ponavlja: tank 2 ima cetiri sastavnice koje se sve zovu "Graševina", pa bi
 * bez izvora ispis bio cetiri jednaka retka s razlicitim litrama.
 *
 * Dohvaca se kroz `$queryRaw` s dva LEFT JOIN-a umjesto Prismina
 * ugnijezdjenog `select`-a: ovako je to i dalje TOCNO JEDAN upit.
 */
export type RedBlenda = {
  ciljTankId: string;
  nazivVina: string | null;
  sorta: string | null;
  kolicina: number;
  postotak: number;
  izvorVrsta: "tank" | "arhiva" | null;
  izvorBroj: number | null;
};

type BerbaUTanku = {
  tankId: string;
  berbaId: string;
  litre: number;
  nazivSorte: string;
  datumBerbe: Date | null;
  godinaBerbe: number | null;
  kolicinaKgGrozdja: number | null;
  /** °Oe — NIKAD se ne mijesa s `Mjerenje.secer`, koji je g/L. */
  secerOe: number | null;
  kiseline: number | null;
  ph: number | null;
  vinograd: string | null;
  parcela: string | null;
  oznakaBerbe: string | null;
};

export type PodrumPodaci = Awaited<ReturnType<typeof dohvatiPodrum>>;

export async function dohvatiPodrum() {
  const pocelo = Date.now();
  let brojUpita = 0;

  const odGrafa = new Date(Date.now() - DANA_GRAF * 24 * 3600 * 1000);
  const odSO2 = new Date(Date.now() - TJEDANA_SO2 * 7 * 24 * 3600 * 1000);

  // --- KRUG 1: tankovi. Svi ostali upiti trebaju popis id-eva. ---
  const tankovi = await prisma.tank.findMany({
    orderBy: { broj: "asc" },
    select: {
      id: true,
      broj: true,
      nazivVina: true,
      sorta: true,
      kolicinaVinaUTanku: true,
      kapacitet: true,
      grana: true,
      zadanaTemp: true,
      // Zapamcena zadana od PRIJE soft-OFF-a. Treba jer kod iskljucenog
      // hladjenja `zadanaTemp` drzi 20,0 — oznaku "ugaseno", ne zeljenu
      // temperaturu. Isto polje cita i stranica tanka.
      zadnjaZadanaTemp: true,
    },
  });
  brojUpita++;

  const puni = tankovi.filter((t) => Number(t.kolicinaVinaUTanku ?? 0) > 0);
  const prazni = tankovi.filter((t) => !(Number(t.kolicinaVinaUTanku ?? 0) > 0));
  const ids = puni.map((t) => t.id);

  if (ids.length === 0) {
    return {
      puni: [],
      prazni,
      mjerenja: [],
      radnje: [],
      udjeli: [],
      blendovi: [],
      temperatura: [] as DanTemperature[],
      ocitanja: [] as ZadnjeOcitanje[],
      dolasci: [] as ZadnjiDolazak[],
      berbe: [] as BerbaUTanku[],
      brojUpita,
      trajanjeMs: Date.now() - pocelo,
    };
  }

  // --- KRUGOVI 2-3: osam upita, cetiri odjednom. ---
  //
  // `uValovima` umjesto golog `Promise.all` iz istog razloga kao svugdje u
  // aplikaciji: broj veza je zajednicki budzet, a osam upita odjednom ga trosi
  // bez potrebe. Cetiri po valu daju gotovo cijelu dobit.
  const [
    temperatura,
    mjerenja,
    radnje,
    berbe,
    udjeli,
    blendovi,
    ocitanja,
    dolasci,
  ] = (await uValovima<unknown>(
    [
      // 1. POVIJEST TEMPERATURE — jedan agregat za sve tankove odjednom.
      //
      // Sirovo je ovo ~237.000 redaka za 10 dana (720/dan/tank), pa dohvat
      // redaka ne dolazi u obzir. Bucketiranje je isto kao u
      // `app/api/tank/[id]/temperatura/route.ts`, samo je bucket cijeli dan i
      // grupira se JOS po `tankId`.
      //
      // `= ANY(ids)` a NE `JOIN "Tank" ... WHERE kolicinaVinaUTanku > 0`:
      // indeks je `@@index([tankId, mjerenoU desc])` i radi tek kad je
      // `tankId` vodeci uvjet. Izmjereno 09.09.2026 na istim podacima:
      // JOIN 1924 ms, `= ANY` 588 ms, oba vracaju istih 363 retka.
      () =>
        prisma.$queryRaw<DanTemperature[]>`
          SELECT
            "tankId",
            to_timestamp(floor(extract(epoch from "mjerenoU") / 86400) * 86400) AS dan,
            avg("temperatura")::float8   AS avg,
            min("temperatura")::float8   AS min,
            max("temperatura")::float8   AS max,
            bool_or("hladjenjeAktivno")  AS hladi
          FROM "OcitanjeTemperature"
          WHERE "tankId" = ANY(${ids}::text[])
            AND "mjerenoU" >= ${odGrafa}
          GROUP BY "tankId", dan
          ORDER BY "tankId", dan ASC
        `,

      // 2. MJERENJA — jedan prozor pokriva i trenutne parametre i oba grafa.
      // Provjereno 09.09.2026: nijedan pun tank nema zadnje mjerenje starije
      // od 8 tjedana, pa zaseban upit za "zadnje mjerenje" nije potreban.
      () =>
        prisma.mjerenje.findMany({
          where: { tankId: { in: ids }, izmjerenoAt: { gte: odSO2 } },
          orderBy: { izmjerenoAt: "desc" },
          select: {
            tankId: true,
            izmjerenoAt: true,
            secer: true,
            ukupneKiseline: true,
            ph: true,
            slobodniSO2: true,
            ukupniSO2: true,
            temperatura: true,
          },
        }),

      // 3. RADNJE KOJE PUTUJU S VINOM — iz `VinoRadnja`, ne iz `Radnja`.
      //
      // `Radnja` opisuje POSUDU: kartica tanka 5 je do sada pokazivala samo
      // ono sto je netko radio stojeci kraj tanka 5, a vino u njemu je
      // fermentiralo u cetiri druga tanka. `VinoRadnja` opisuje VINO i putuje
      // s njim.
      //
      // GRANICA ARHIVE SE OVDJE VISE NE PRIMJENJUJE, i to je bitno: kvasac
      // dodan u tanku 11 u srpnju je stariji od arhiviranja tanka 5, a
      // opisuje bas ono vino koje je danas u tanku 5. Granica bi ga odrezala.
      // Ne treba je ni biti — `VinoRadnja` se pri praznjenju tanka BRISE
      // (lib/pretok-arhiviranje.ts, app/api/izlaz-vina/route.ts), pa redaka
      // prethodnog vina nema.
      //
      // `jeKvasac` se dohvaca, ali se njime NE FILTRIRA popis dodataka —
      // vidi biljesku uz `Preparation.jeKvasac`.
      () =>
        prisma.vinoRadnja.findMany({
          where: { tankId: { in: ids } },
          orderBy: { dogodenoAt: "desc" },
          select: {
            tankId: true,
            vrsta: true,
            opis: true,
            kolicina: true,
            dogodenoAt: true,
            preparatNaziv: true,
            jedinicaNaziv: true,
            jeKvasac: true,
            udio: true,
            izvorniBrojTanka: true,
          },
        }),

      // 4. BERBE KOJE SU SADA U TANKU, po knjizi kretanja.
      //
      // Stanje se racuna, ne cita: ulazi minus izlazi po (berba, tank).
      // `HAVING > 0.5` odbacuje berbe koje su iz tanka vec otisle i zaokruzne
      // ostatke. `obrisano = false` izbacuje pogresne unose (tank 7 ima dva).
      () =>
        prisma.$queryRaw<BerbaUTanku[]>`
          SELECT
            k."tankId",
            b."id"                        AS "berbaId",
            k."litre"::float8             AS litre,
            b."nazivSorte",
            b."datumBerbe",
            b."godinaBerbe",
            b."kolicinaKgGrozdja"::float8 AS "kolicinaKgGrozdja",
            b."secer"::float8             AS "secerOe",
            b."kiseline"::float8          AS kiseline,
            b."ph"::float8                AS ph,
            b."vinograd",
            b."parcela",
            b."oznakaBerbe"
          FROM (
            SELECT "berbaId", "tankId", sum(litre) AS litre
            FROM (
              SELECT "berbaId", "uTankId"  AS "tankId",  litre FROM "BerbaKretanje" WHERE "uTankId"  IS NOT NULL
              UNION ALL
              SELECT "berbaId", "izTankId" AS "tankId", -litre FROM "BerbaKretanje" WHERE "izTankId" IS NOT NULL
            ) x
            WHERE "tankId" = ANY(${ids}::text[])
            GROUP BY "berbaId", "tankId"
            HAVING sum(litre) > 0.5
          ) k
          JOIN "Berba" b ON b."id" = k."berbaId" AND b."obrisano" = false
          ORDER BY k."tankId", k."litre" DESC
        `,

      // 5. + 6. Sastav: udjeli sorti i sastavnice blenda.
      () =>
        prisma.tankSortaUdio.findMany({
          where: { tankId: { in: ids } },
          orderBy: { postotak: "desc" },
          select: { tankId: true, nazivSorte: true, postotak: true },
        }),
      () =>
        prisma.$queryRaw<RedBlenda[]>`
          SELECT
            b."ciljTankId",
            b."nazivVina",
            b."sorta",
            b."kolicina"::float8 AS kolicina,
            b."postotak"::float8 AS postotak,
            CASE
              WHEN b."izvorTankId"       IS NOT NULL THEN 'tank'
              WHEN b."izvorArhivaVinaId" IS NOT NULL THEN 'arhiva'
              ELSE NULL
            END AS "izvorVrsta",
            coalesce(t."broj", a."brojTanka") AS "izvorBroj"
          FROM "BlendIzvor" b
          LEFT JOIN "Tank"       t ON t."id" = b."izvorTankId"
          LEFT JOIN "ArhivaVina" a ON a."id" = b."izvorArhivaVinaId"
          WHERE b."ciljTankId" = ANY(${ids}::text[])
          ORDER BY b."ciljTankId", b."kolicina" DESC
        `,

      // 7. ZADNJE OCITANJE po tanku — `DISTINCT ON` je jedan prolaz po istom
      // indeksu, umjesto 38 zasebnih `findFirst`.
      () =>
        prisma.$queryRaw<ZadnjeOcitanje[]>`
          SELECT DISTINCT ON ("tankId")
            "tankId",
            "temperatura"::float8       AS temperatura,
            "zadanaTemperatura"::float8 AS "zadanaTemperatura",
            "hladjenjeAktivno",
            "status",
            "mjerenoU"
          FROM "OcitanjeTemperature"
          WHERE "tankId" = ANY(${ids}::text[])
          ORDER BY "tankId", "mjerenoU" DESC
        `,

      // 8. ZADNJI DOLAZAK VINA — punjenje ili pretok, sto je novije.
      //
      // Sluzi kao zamjena za dan fermentacije ondje gdje kvasca nema. Cita se
      // iz `PunjenjeTanka` i `PretokCilj`, a NE iz `Radnja`: `Radnja` vrste
      // PUNJENJE ne nastaje pouzdano, pa bi tankovi tiho ostajali bez datuma.
      () =>
        prisma.$queryRaw<ZadnjiDolazak[]>`
          SELECT DISTINCT ON ("tankId") "tankId", datum, vrsta
          FROM (
            SELECT "tankId", "datumPunjenja" AS datum, 'PUNJENJE' AS vrsta
            FROM "PunjenjeTanka"
            WHERE "tankId" = ANY(${ids}::text[])
            UNION ALL
            SELECT c."tankId", p."datum" AS datum, 'PRETOK' AS vrsta
            FROM "PretokCilj" c
            JOIN "Pretok" p ON p."id" = c."pretokId"
            WHERE c."tankId" = ANY(${ids}::text[])
          ) y
          ORDER BY "tankId", datum DESC
        `,

    ],
    4
  )) as [
    DanTemperature[],
    RedMjerenja[],
    RedRadnje[],
    BerbaUTanku[],
    RedUdjela[],
    RedBlenda[],
    ZadnjeOcitanje[],
    ZadnjiDolazak[],
  ];
  brojUpita += 8;

  return {
    puni,
    prazni,
    mjerenja,
    radnje,
    udjeli,
    blendovi,
    temperatura,
    ocitanja,
    dolasci,
    berbe,
    brojUpita,
    trajanjeMs: Date.now() - pocelo,
  };
}
