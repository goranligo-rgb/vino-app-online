/**
 * MJERENJE → BERBA. Ovdje se nista ne upisuje i nista se ne mijenja.
 *
 * Nacelo je isto kao kod berbe: nositelj podatka je VINO, ne tank. Mjerenje
 * danas zna samo `tankId` i `izmjerenoAt`, a tank je posuda kroz koju je proslo
 * vise vina. Veza na vino se zato ne cita nego RACUNA, iz knjige kretanja:
 *
 *     berbe pogodjene mjerenjem M (tank T, trenutak t)
 *       = sve berbe B kojima je stanje u T u trenutku t vece od nule
 *     stanje B u T u trenutku t
 *       = SUM(litre WHERE berbaId=B AND uTankId=T  AND dogodenoAt <= t)
 *       - SUM(litre WHERE berbaId=B AND izTankId=T AND dogodenoAt <= t)
 *
 * To je ista formula koju `stanjeTanka` (lib/berba-model.ts) vec koristi, samo
 * s vremenskim rezom umjesto "sada". Nista se ne sprema, pa nema druge tablice
 * koja moze odlutati od knjige.
 *
 * MJERENJE → SKUP BERBI, NE JEDNA BERBA
 * -------------------------------------
 * Vraca se POPIS, i to nije nedostatak nego istina o pogonu. Mjerenje blenda
 * opisuje mjesavinu, a ne svaku berbu u njoj posebno: alkohol izmjeren na
 * tanku u kojem su tri berbe je jedan podatak o toj mjesavini. Vratiti jednu
 * berbu znacilo bi izabrati "glavnu" i pripisati joj tudju brojku.
 *
 * Zato uz svaku berbu ide i `udio` — koliko je te berbe u tanku bilo u tom
 * trenutku. Prikaz smije reci "mjereno na mjesavini, 68 % ova berba", ali ne
 * smije brojku pripisati berbi kao njezinu.
 *
 * ZIVO I ARHIVIRANO ZAJEDNO
 * -------------------------
 * Mjerenja se pri praznjenju tanka BRISU iz `Mjerenje` i sele u
 * `ArhivaVinaMjerenje` (app/api/izlaz-vina, app/api/tank/arhiviraj,
 * lib/pretok-arhiviranje — tri para kopiraj→obrisi). Citati samo zivu tablicu
 * znacilo bi da dnevnik nestane tocno onda kad fermentacija zavrsi i tank se
 * isprazni. Zato se cita UNIJA.
 *
 * Unija je sigurna: provjereno nad bazom 28.08.2026 — 84 arhivirana retka, 83
 * s pokazivacem na izvor, i NIJEDAN izvor nije vise ziv. Dvostrukog brojanja
 * nema. Ako se to ikad promijeni (npr. app/api/arhiva/route.ts:123 kopira a ne
 * brise), `dvojnika()` nize to izmjeri umjesto da se pretpostavlja.
 *
 * STO OVAJ MODUL NE RADI
 * ----------------------
 * Ne dira `vrijednostiTankaPoPolju` (lib/mjerenja.ts) i ne natjece se s njim.
 * Ono odgovara na drugo pitanje — "sto je SAD u ovom tanku" — i kroz njega idu
 * pretok, filtracija i monitor tanka. Ovaj modul odgovara na "cije je vino
 * bilo mjereno", i nijedan postojeci citac ga ne poznaje.
 *
 * TRI OGRADE, mjerene nad bazom 28.08.2026 i zapisane da se ne traze dvaput:
 *
 *  1. ISPRAVAK i PONISTENJE retci nose `dogodenoAt` = dan backfilla
 *     (25.08.2026), ne datum izvornog dogadjaja — 21 + 5 redaka. Za berbe koje
 *     su ispravljane, stanje u trenutku prije toga je stanje PRIJE ispravka.
 *     Kretanja ULAZ/PRETOK/FILTRACIJA/IZLAZ nose prave datume (27.05.–27.08.),
 *     pa je os inace vjerodostojna.
 *
 *  2. Dio mjerenja ne veze se ni na jednu berbu: 7 zivih i 29 arhiviranih.
 *     Gotovo sva su iz svibnja i lipnja — vino koje je u podrumu bilo prije
 *     nego ga knjiga pokriva. To NIJE greska i ne smije se sakriti; vraca se
 *     kao prazan popis, a prikaz mora reci "nepoznato podrijetlo".
 *
 *  4. TANK KROZ KOJI VINO SAMO PROLAZI NE VEZE SE. Izmjereno na T7: berba
 *     udje u 05:32 i cijela je pretocena dalje u 05:37 — pet minuta. Knjiga
 *     je tocna, ali mjerenja mosta uzeta tog dana nose rucno upisan datum
 *     bez vremena (00:00) ili padnu sat-dva iza zadnjeg pretoka, pa im je
 *     stanje tanka u tom trenutku nula. Tri kolovoska mjerenja na T7 tako
 *     ostaju bez berbe iako je ocito cije su.
 *
 *     Za fermentaciju to NIJE prepreka: tank u kojem fermentacija stvarno
 *     traje drzi vino danima, ne minutama. Prijemne posude su druga prica i
 *     za njih se veza po tanku i vremenu ne moze izvesti — trebalo bi je
 *     upisati, sto je razina 3. Prikaz zato mora podnijeti prazan popis.
 * *  3. `ArhivaVinaMjerenje` nema `jeRucno` — arhiva ga ne prenosi (isto vec
 *     biljezi lib/mjerenja.ts:404). Nad unijom se zato u arhiviranom dijelu ne
 *     razlikuje pravo mjerenje od kopije koju je upisao pretok. Polje
 *     `jeRucno` je ovdje `null` za arhivirano, a ne lazno `true`.
 */

// `Prisma` treba kao VRIJEDNOST (Prisma.sql / Prisma.empty u citajPomake),
// ne samo kao tip — zato dva uvoza.
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { uLitre } from "@/lib/filtracija";

export type CitacMjerenja = Prisma.TransactionClient | PrismaClient;

/** Odakle je redak dosao. Arhivirano se ne pretvara u zivo. */
export type IzvorMjerenja = "ZIVO" | "ARHIVA";

/** Osam brojki koje `Mjerenje` i `ArhivaVinaMjerenje` dijele. */
export type VrijednostiRetka = {
  alkohol: number | null;
  ukupneKiseline: number | null;
  hlapiveKiseline: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  secer: number | null;
  ph: number | null;
  temperatura: number | null;
};

/** Jedno mjerenje, iz zive tablice ili iz arhive. */
export type Redak = {
  id: string;
  izvor: IzvorMjerenja;
  tankId: string | null;
  izmjerenoAt: Date;
  /**
   * `null` za arhivirano — arhiva taj stupac ne prenosi, pa se ne izmislja.
   * Vidi ogradu 3 u zaglavlju.
   */
  jeRucno: boolean | null;
  napomena: string | null;
  vrijednosti: VrijednostiRetka;
};

/** Jedna berba pogodjena mjerenjem, s udjelom u tanku u tom trenutku. */
export type PogodjenaBerba = {
  berbaId: string;
  /** Naziv sorte prepisan sa zapisa berbe — ne cita se kroz relaciju. */
  nazivSorte: string;
  datumBerbe: Date | null;
  godinaBerbe: number | null;
  oznakaBerbe: string | null;
  /** Je li zapis berbe meko obrisan (pogresan unos). */
  obrisano: boolean;
  /** Koliko je te berbe bilo u tanku u trenutku mjerenja. */
  ml: number;
  litre: number;
  /** Postotak tanka koji je ta berba drzala u tom trenutku, 0–100. */
  udio: number;
};

/** Mjerenje zajedno s vinom na kojem je obavljeno. */
export type MjerenjeSBerbom = {
  mjerenje: Redak;
  /**
   * Prazan popis znaci "u tom trenutku knjiga za taj tank ne zna nista" —
   * NE znaci da vina nije bilo. Prikaz to mora reci naglas.
   */
  berbe: PogodjenaBerba[];
  /** Zbroj litara svih pogodjenih berbi. 0 kad je popis prazan. */
  ukupnoLitara: number;
  /** Je li mjerenje obavljeno na mjesavini vise berbi. */
  mjesavina: boolean;
};

// ---------------------------------------------------------------------------
// Cisti dio — bez baze
// ---------------------------------------------------------------------------

/** Jedno kretanje, svedeno na predznak prema promatranom tanku. */
export type Pomak = {
  berbaId: string;
  /** Pozitivno = uslo u tank, negativno = izaslo. U CIJELIM mililitrima. */
  ml: number;
  dogodenoAt: Date;
};

/**
 * Stanje svih berbi u jednom tanku u zadanom trenutku, iz pomaka tog tanka.
 *
 * Zbraja se u CIJELIM MILILITRIMA — isti razlog koji vec stoji u
 * lib/berba-model.ts: `litre` je DOUBLE PRECISION i zbrajanje petnaest pretoka
 * u pokretnom zarezu ostavlja repove tipa 4799.999999999999. Knjiga pise
 * iskljucivo cijele mililitre, pa je zbroj cijelih brojeva tocan.
 *
 * Rub je UKLJUCIV (`dogodenoAt <= trenutak`): vino koje je u tank uslo u istoj
 * sekundi u kojoj je mjereno smatra se prisutnim. Suprotna odluka bi mjerenje
 * uzeto odmah po punjenju ostavila bez berbe, a upravo je to najcesci trenutak
 * mjerenja — pocetno mjerenje pri punjenju uzima `datumPunjenja` kad vlastitog
 * vremena nema (app/api/punjenje/route.ts:339).
 */
export function stanjeUTrenutku(
  pomaci: Pomak[],
  trenutak: Date
): Map<string, number> {
  const zbroj = new Map<string, number>();

  for (const p of pomaci) {
    if (p.dogodenoAt.getTime() > trenutak.getTime()) continue;
    zbroj.set(p.berbaId, (zbroj.get(p.berbaId) ?? 0) + p.ml);
  }

  for (const [berbaId, ml] of zbroj) {
    if (ml <= 0) zbroj.delete(berbaId);
  }

  return zbroj;
}

/**
 * Postotni udjeli iz mililitara, zaokruzeni na dvije decimale.
 *
 * NAMJERNO se ne koristi `postotciIzMl` iz lib/filtracija.ts: ondje se udjeli
 * dorucavaju da zbroj bude tocno 100 %, jer se po njima DIJELI vino i zadnji
 * mililitar mora negdje zavrsiti. Ovdje se nista ne dijeli — udio je samo
 * napomena uz prikaz, i doracunavanje bi tvrdilo tocnost koje nema.
 */
export function udjeliIzMl(mlPoBerbi: number[]): number[] {
  const ukupno = mlPoBerbi.reduce((s, v) => s + v, 0);
  if (ukupno <= 0) return mlPoBerbi.map(() => 0);
  return mlPoBerbi.map((ml) => Math.round((ml / ukupno) * 10000) / 100);
}

// ---------------------------------------------------------------------------
// Citanje iz baze
// ---------------------------------------------------------------------------

type RedakZive = {
  id: string;
  tankId: string;
  izmjerenoAt: Date;
  jeRucno: boolean;
  napomena: string | null;
} & VrijednostiRetka;

type RedakArhive = {
  id: string;
  tankId: string | null;
  izmjerenoAt: Date;
  napomena: string | null;
} & VrijednostiRetka;

function uRedak(r: RedakZive | RedakArhive, izvor: IzvorMjerenja): Redak {
  return {
    id: r.id,
    izvor,
    tankId: r.tankId,
    izmjerenoAt: r.izmjerenoAt,
    jeRucno: "jeRucno" in r ? r.jeRucno : null,
    napomena: r.napomena,
    vrijednosti: {
      alkohol: r.alkohol,
      ukupneKiseline: r.ukupneKiseline,
      hlapiveKiseline: r.hlapiveKiseline,
      slobodniSO2: r.slobodniSO2,
      ukupniSO2: r.ukupniSO2,
      secer: r.secer,
      ph: r.ph,
      temperatura: r.temperatura,
    },
  };
}

const POLJA = {
  id: true,
  tankId: true,
  izmjerenoAt: true,
  napomena: true,
  alkohol: true,
  ukupneKiseline: true,
  hlapiveKiseline: true,
  slobodniSO2: true,
  ukupniSO2: true,
  secer: true,
  ph: true,
  temperatura: true,
} as const;

export type Filtar = {
  /** Samo ovi tankovi. Izostavljeno = svi. */
  tankIds?: string[];
  od?: Date;
  do?: Date;
  /** Preskoci `ArhivaVinaMjerenje`. Zadano `false` — arhiva se cita. */
  bezArhive?: boolean;
};

/**
 * Sva mjerenja, ziva i arhivirana, poredana od najnovijeg.
 *
 * Dva upita, ne jedan: dvije tablice imaju razlicite stupce (`jeRucno` samo
 * ziva) i razlicite indekse (`Mjerenje` ima [tankId, izmjerenoAt],
 * `ArhivaVinaMjerenje` samo [tankId]). Rucni UNION u sirovom SQL-u ne bi
 * dobio nista osim gubitka tipova.
 */
export async function citajMjerenja(
  db: CitacMjerenja,
  filtar: Filtar = {}
): Promise<Redak[]> {
  const uvjetVremena =
    filtar.od || filtar.do
      ? { ...(filtar.od ? { gte: filtar.od } : {}), ...(filtar.do ? { lte: filtar.do } : {}) }
      : undefined;

  const gdje = {
    ...(filtar.tankIds ? { tankId: { in: filtar.tankIds } } : {}),
    ...(uvjetVremena ? { izmjerenoAt: uvjetVremena } : {}),
  };

  const ziva = await db.mjerenje.findMany({
    where: gdje,
    orderBy: { izmjerenoAt: "desc" },
    select: { ...POLJA, jeRucno: true },
  });

  const redci: Redak[] = ziva.map((r) => uRedak(r as RedakZive, "ZIVO"));

  if (!filtar.bezArhive) {
    const arhiva = await db.arhivaVinaMjerenje.findMany({
      where: gdje,
      orderBy: { izmjerenoAt: "desc" },
      select: POLJA,
    });
    redci.push(...arhiva.map((r) => uRedak(r as RedakArhive, "ARHIVA")));
  }

  redci.sort((a, b) => b.izmjerenoAt.getTime() - a.izmjerenoAt.getTime());
  return redci;
}

type RedakPomaka = {
  tankId: string;
  berbaId: string;
  ml: number;
  dogodenoAt: Date;
};

/**
 * Svi pomaci knjige, grupirani po tanku — JEDAN upit za cijeli podrum.
 *
 * Zasto odjednom, a ne po tanku: `/berba` ima 32 zapisa, a mjerenja ih diraju
 * jos vise. Upit po tanku bio bi desetci upita, sto je tocno ono sto
 * lib/paralelno.ts zabranjuje — pooler drzi 15 veza za CIJELU aplikaciju.
 * Knjiga je danas 207 redaka; kad naraste toliko da ovo zasmeta, filtar po
 * tanku ide u `WHERE`, ne u petlju.
 */
export async function citajPomake(
  db: CitacMjerenja,
  tankIds?: string[]
): Promise<Map<string, Pomak[]>> {
  const redci = await db.$queryRaw<RedakPomaka[]>`
    SELECT s."tankId", s."berbaId", s.ml::float8 AS ml, s."dogodenoAt"
    FROM (
      SELECT k."uTankId"  AS "tankId", k."berbaId",
             ROUND(k.litre::numeric * 1000)  AS ml, k."dogodenoAt"
      FROM "BerbaKretanje" k WHERE k."uTankId" IS NOT NULL
      UNION ALL
      SELECT k."izTankId" AS "tankId", k."berbaId",
             -ROUND(k.litre::numeric * 1000) AS ml, k."dogodenoAt"
      FROM "BerbaKretanje" k WHERE k."izTankId" IS NOT NULL
    ) s
    ${
      tankIds && tankIds.length > 0
        ? Prisma.sql`WHERE s."tankId" = ANY(${tankIds})`
        : Prisma.empty
    }
    ORDER BY s."dogodenoAt" ASC
  `;

  const mapa = new Map<string, Pomak[]>();
  for (const r of redci) {
    const popis = mapa.get(r.tankId) ?? [];
    popis.push({ berbaId: r.berbaId, ml: Number(r.ml), dogodenoAt: r.dogodenoAt });
    mapa.set(r.tankId, popis);
  }
  return mapa;
}

type PodaciBerbe = {
  nazivSorte: string;
  datumBerbe: Date | null;
  godinaBerbe: number | null;
  oznakaBerbe: string | null;
  obrisano: boolean;
};

/**
 * Glavni ulaz: mjerenja s vinom na kojem su obavljena.
 *
 * Tri upita ukupno, bez obzira na broj mjerenja: ziva mjerenja, arhivirana,
 * knjiga. Sve ostalo je racun u memoriji.
 */
export async function mjerenjaSBerbom(
  db: CitacMjerenja,
  filtar: Filtar = {}
): Promise<MjerenjeSBerbom[]> {
  const mjerenja = await citajMjerenja(db, filtar);
  if (mjerenja.length === 0) return [];

  const tankovi = [...new Set(mjerenja.map((m) => m.tankId).filter((t): t is string => !!t))];
  const pomaci = await citajPomake(db, filtar.tankIds ?? tankovi);

  const berbe = new Map<string, PodaciBerbe>(
    (
      await db.berba.findMany({
        select: {
          id: true,
          nazivSorte: true,
          datumBerbe: true,
          godinaBerbe: true,
          oznakaBerbe: true,
          obrisano: true,
        },
      })
    ).map((b) => [b.id, b])
  );

  return mjerenja.map((mjerenje) => {
    if (!mjerenje.tankId) {
      return { mjerenje, berbe: [], ukupnoLitara: 0, mjesavina: false };
    }

    const stanje = stanjeUTrenutku(
      pomaci.get(mjerenje.tankId) ?? [],
      mjerenje.izmjerenoAt
    );

    const stavke = [...stanje.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    const udjeli = udjeliIzMl(stavke.map(([, ml]) => ml));

    const pogodjene: PogodjenaBerba[] = stavke.map(([berbaId, ml], i) => {
      const b = berbe.get(berbaId);
      return {
        berbaId,
        nazivSorte: b?.nazivSorte ?? "(zapis berbe ne postoji)",
        datumBerbe: b?.datumBerbe ?? null,
        godinaBerbe: b?.godinaBerbe ?? null,
        oznakaBerbe: b?.oznakaBerbe ?? null,
        obrisano: b?.obrisano ?? false,
        ml,
        litre: uLitre(ml),
        udio: udjeli[i],
      };
    });

    const ukupnoMl = stavke.reduce((s, [, ml]) => s + ml, 0);

    return {
      mjerenje,
      berbe: pogodjene,
      ukupnoLitara: uLitre(ukupnoMl),
      mjesavina: pogodjene.length > 1,
    };
  });
}

/**
 * Koliko arhiviranih mjerenja ima izvor koji je JOS ZIV u `Mjerenje`.
 *
 * Ocekuje se 0, i 28.08.2026. je bilo 0 od 84. Ako ikad postane vece od nule,
 * unija u `citajMjerenja` broji isto mjerenje dvaput — a to se mora VIDJETI,
 * ne pretpostaviti. Zove je scripts/provjeri-mjerenja-berba.ts.
 */
export async function dvojnika(db: CitacMjerenja): Promise<number> {
  const arhiva = await db.arhivaVinaMjerenje.findMany({
    where: { izvornoMjerenjeId: { not: null } },
    select: { izvornoMjerenjeId: true },
  });

  const ids = arhiva
    .map((a) => a.izvornoMjerenjeId)
    .filter((x): x is string => !!x);

  if (ids.length === 0) return 0;

  return db.mjerenje.count({ where: { id: { in: ids } } });
}
