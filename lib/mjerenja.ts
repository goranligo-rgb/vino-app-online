import type { Prisma } from "@prisma/client";

/**
 * Osam mjerenih polja — jedini popis u aplikaciji.
 *
 * Zivi OVDJE, a ne u lib/filtracija.ts gdje je nastao, jer ga trebaju i pretok
 * i monitor, a filtracija treba `vrijednostiTankaPoPolju` iz ovog modula. Da je
 * ostao ondje, uvoz bi isao u krug (filtracija -> mjerenja -> filtracija).
 * lib/filtracija.ts ga re-izvozi, pa zateceni uvozi rade nepromijenjeno.
 */
export const POLJA_MJERENJA = [
  "alkohol",
  "ukupneKiseline",
  "hlapiveKiseline",
  "slobodniSO2",
  "ukupniSO2",
  "secer",
  "ph",
  "temperatura",
] as const;

export type VrijednostiMjerenja = {
  [K in (typeof POLJA_MJERENJA)[number]]: number | null;
};

/**
 * Zadnja vrijednost PO SVAKOM POLJU zasebno, a ne zadnji redak mjerenja.
 *
 * Zasto: vinarija ne mjeri sve odjednom. U fermentaciji se secer mjeri svaki
 * dan, alkohol i kiseline svakih pet, a slobodni SO2 tjedno kroz cijelu godinu.
 * Pravilo "uzmi zadnje mjerenje" zato sustavno baca alkohol, kiseline i secer —
 * u zatecenoj bazi 11 tankova time gubi 41 popunjeno polje.
 *
 * Isto vec radi prikaz na stranici tanka (`sloziZadnjeMjerenjePoPoljima`), ali
 * kao funkcija lokalna toj stranici i s prepoznavanjem automatskih mjerenja
 * TRAZENJEM RIJECI U NAPOMENI. Ovdje se koristi stupac `jeRucno`, koji za to
 * i postoji. Provjereno na svih 63 zapisa u bazi: nijedno neslaganje izmedju
 * ta dva nacina, pa je prijelaz siguran.
 *
 * Koriste je: ponderiranje u pretoku i filtraciji, te prikaz parametara na
 * monitoru tanka.
 */

/** Minimalni oblik retka `Mjerenje` koji ovoj logici treba. */
export type RedakMjerenja = {
  id: string;
  izmjerenoAt: Date;
  jeRucno: boolean;
} & {
  [K in (typeof POLJA_MJERENJA)[number]]: number | null;
};

/** Odakle je pojedino polje doslo — da vrijednost nikad ne stoji gola. */
export type PodrijetloPolja = {
  mjerenjeId: string;
  izmjerenoAt: Date;
  jeRucno: boolean;
} | null;

/** Podrijetlo svih osam polja jednog tanka. */
export type IzvorPolja = Record<
  (typeof POLJA_MJERENJA)[number],
  PodrijetloPolja
>;

export type MjerenjePoPolju = {
  vrijednosti: VrijednostiMjerenja;
  izvorPolja: IzvorPolja;
  /** Granica arhive koja je primijenjena, ako je postojala. */
  granicaArhive: Date | null;
  /** Koliko je redaka uopce razmatrano (nakon granice). */
  brojRazmatranih: number;
};

/**
 * Cisti dio — bez baze. Ocekuje retke SORTIRANE od najnovijeg prema starijem.
 *
 * Za svako polje: prvo najnovija ne-null vrijednost iz RUCNOG mjerenja; ako
 * takve nema, najnovija ne-null iz bilo kojeg. Rucno ima prednost da se
 * izracunata vrijednost ne bi vrtjela sama u sebe kroz niz prijenosa.
 */
export function sloziPoPolju(mjerenja: RedakMjerenja[]): {
  vrijednosti: VrijednostiMjerenja;
  izvorPolja: IzvorPolja;
} {
  const vrijednosti = {} as VrijednostiMjerenja;
  const izvorPolja = {} as IzvorPolja;

  for (const polje of POLJA_MJERENJA) {
    const rucno = mjerenja.find((m) => m.jeRucno && m[polje] != null);
    const bilokoje = rucno ?? mjerenja.find((m) => m[polje] != null);

    if (bilokoje) {
      vrijednosti[polje] = Number(bilokoje[polje]);
      izvorPolja[polje] = {
        mjerenjeId: bilokoje.id,
        izmjerenoAt: bilokoje.izmjerenoAt,
        jeRucno: bilokoje.jeRucno,
      };
    } else {
      vrijednosti[polje] = null;
      izvorPolja[polje] = null;
    }
  }

  return { vrijednosti, izvorPolja };
}

/**
 * Niz vrijednosti jednog polja kroz vrijeme — za graf tog parametra.
 * Ulaz je isti popis redaka; izlaz je poredan od NAJSTARIJEG prema najnovijem,
 * jer se graf tako crta.
 */
export function nizPolja(
  mjerenja: RedakMjerenja[],
  polje: (typeof POLJA_MJERENJA)[number]
): Array<{
  mjerenjeId: string;
  izmjerenoAt: Date;
  vrijednost: number;
  jeRucno: boolean;
}> {
  return mjerenja
    .filter((m) => m[polje] != null)
    .map((m) => ({
      mjerenjeId: m.id,
      izmjerenoAt: m.izmjerenoAt,
      vrijednost: Number(m[polje]),
      jeRucno: m.jeRucno,
    }))
    .sort((a, b) => a.izmjerenoAt.getTime() - b.izmjerenoAt.getTime());
}

/** Prihvaca i `prisma` i `tx` iz `$transaction`. */
type Citac = Pick<Prisma.TransactionClient, "mjerenje" | "arhivaVina">;

/**
 * Cita mjerenja tanka i slaze vrijednosti po polju.
 *
 * BRANA NA ARHIVIRANJU
 * --------------------
 * Ne poseze se ispred zadnjeg `ArhivaVina.arhiviranoAt` tog tanka. Arhiviranje
 * znaci da je u tanku bilo DRUGO vino; njegovi parametri ne smiju procuriti u
 * novo.
 *
 * Danas je ovo uglavnom pojas uz tregere: arhiviranje i samo brise mjerenja
 * (`tx.mjerenje.deleteMany({ where: { tankId } })`), pa ispred te tocke ionako
 * nista ne prezivi. Brana postoji zbog JEDNOG puta koji tanku uzme vino a NE
 * arhivira ga — F1 grana filtracije, koja arhiviranje odgadja do faze 3B
 * (vidi komentar u lib/filtracija.ts). Tamo mjerenja prethodnog vina ostaju na
 * tanku i bez ove brane bi ih fallback pokupio.
 *
 * Kad 3B uvede arhiviranje i na toj grani, brana postaje suvisna — ali ostaje,
 * jer ne kosta nista i jer bi njezino uklanjanje znacilo osloniti se na to da
 * nijedan buduci put ne isprazni tank bez arhiviranja.
 *
 * NAMJERNO NEMA granice na zadnjem PUNJENJU. Izmjereno na zatecenoj bazi: tank
 * 1 bi time pao s 5 popunjenih polja na 1, jer mu je punjenje od 28.05.2026
 * zapis pocetnog unosa zatecenog vina u aplikaciju, a ne stvarno prepunjavanje.
 * Mjerenje od 21.05. je isto vino, samo starije od zapisa o njemu.
 */
export async function vrijednostiTankaPoPolju(
  db: Citac,
  tankId: string,
  opts?: { limit?: number; doDatuma?: Date }
): Promise<MjerenjePoPolju> {
  const limit = opts?.limit ?? 100;

  const zadnjaArhiva = await db.arhivaVina.findFirst({
    where: { tankId },
    orderBy: { arhiviranoAt: "desc" },
    select: { arhiviranoAt: true },
  });

  const granicaArhive = zadnjaArhiva?.arhiviranoAt ?? null;

  const uvjetVremena: Prisma.DateTimeFilter = {};
  if (granicaArhive) uvjetVremena.gte = granicaArhive;
  if (opts?.doDatuma) uvjetVremena.lte = opts.doDatuma;

  const mjerenja = (await db.mjerenje.findMany({
    where: {
      tankId,
      ...(Object.keys(uvjetVremena).length > 0
        ? { izmjerenoAt: uvjetVremena }
        : {}),
    },
    orderBy: { izmjerenoAt: "desc" },
    take: limit,
    select: {
      id: true,
      izmjerenoAt: true,
      jeRucno: true,
      alkohol: true,
      ukupneKiseline: true,
      hlapiveKiseline: true,
      slobodniSO2: true,
      ukupniSO2: true,
      secer: true,
      ph: true,
      temperatura: true,
    },
  })) as RedakMjerenja[];

  const { vrijednosti, izvorPolja } = sloziPoPolju(mjerenja);

  return {
    vrijednosti,
    izvorPolja,
    granicaArhive,
    brojRazmatranih: mjerenja.length,
  };
}

/**
 * Raspon datuma iz kojih je slozen jedan PONDERIRANI rezultat.
 *
 * Za jedan tank je `napomenaOMijesanimDatumima` tocnija jer moze reci koje
 * polje je od kojeg datuma. Kod prijenosa i pretoka rezultat je prosjek preko
 * VISE tankova, pa je "polje X od datuma Y" viseznacno — ondje se kaze samo
 * raspon. Vraca null kad je sve iz jednog dana (nema sto napomenuti).
 */
export function rasponDatumaIzvora(
  izvori: Array<IzvorPolja>
): { od: Date; do: Date } | null {
  const datumi: Date[] = [];

  for (const izvor of izvori) {
    for (const polje of POLJA_MJERENJA) {
      const p = izvor[polje];
      if (p) datumi.push(p.izmjerenoAt);
    }
  }

  if (datumi.length === 0) return null;

  datumi.sort((a, b) => a.getTime() - b.getTime());
  const od = datumi[0];
  const doD = datumi[datumi.length - 1];

  if (od.toDateString() === doD.toDateString()) return null;

  return { od, do: doD };
}

// ---------------------------------------------------------------------------
// Parametri blenda — racunaju se PRI PRIKAZU, iz trenutnih sastavnica
// ---------------------------------------------------------------------------

/** Jedna sastavnica koja je za KONKRETNO polje dala broj. */
export type DoprinosPolju = {
  naziv: string;
  kolicina: number;
  vrijednost: number;
};

/** Jedno polje blenda: vrijednost + koliko je blenda uopce doprinijelo. */
export type PokrivenostPolja = {
  vrijednost: number | null;
  /** Litre sastavnica koje su za OVO polje imale podatak. */
  pokrivenoL: number;
  /** Ukupne litre svih sastavnica. */
  ukupnoL: number;
  /** pokrivenoL / ukupnoL * 100 */
  postotak: number;
  /**
   * Tko je ulazio u prosjek BAS ZA OVO polje. Prikaz time moze pokazati sam
   * racun umjesto da broj stoji gol: 300 L x 11,8 + 200 L x 11,4 -> 11,63.
   * Bez toga se izracunata vrijednost ne razlikuje od izmjerene.
   */
  doprinosi: DoprinosPolju[];
};

export type SastavnicaBlenda = {
  naziv: string;
  kolicina: number;
  /** Polja za koja ova sastavnica ima podatak. */
  polja: (typeof POLJA_MJERENJA)[number][];
  /** Zivi tank cije se vino u medjuvremenu promijenilo — podatak je sumnjiv. */
  sumnjiv: boolean;
};

export type ParametriBlenda = {
  poPolju: Record<(typeof POLJA_MJERENJA)[number], PokrivenostPolja>;
  sastavnice: SastavnicaBlenda[];
  /** Sastavnice bez ijednog mjerenja — one koje ruse pokrivenost. */
  bezPodataka: SastavnicaBlenda[];
  ukupnoL: number;
};

type CitacBlenda = Citac &
  Pick<Prisma.TransactionClient, "blendIzvor" | "arhivaVinaMjerenje">;

/** Ista logika po polju, ali nad arhiviranim mjerenjima. */
export async function vrijednostiArhivePoPolju(
  db: Pick<Prisma.TransactionClient, "arhivaVinaMjerenje">,
  arhivaVinaId: string,
  opts?: { limit?: number }
): Promise<{ vrijednosti: VrijednostiMjerenja; izvorPolja: IzvorPolja }> {
  const mjerenja = (await db.arhivaVinaMjerenje.findMany({
    where: { arhivaVinaId },
    orderBy: { izmjerenoAt: "desc" },
    take: opts?.limit ?? 100,
    select: {
      id: true,
      izmjerenoAt: true,
      alkohol: true,
      ukupneKiseline: true,
      hlapiveKiseline: true,
      slobodniSO2: true,
      ukupniSO2: true,
      secer: true,
      ph: true,
      temperatura: true,
    },
    // ArhivaVinaMjerenje nema `jeRucno` — arhiva ga ne prenosi. Sve se tretira
    // kao rucno, sto je za prednost-rucnom pravilo bez posljedice: kad su svi
    // redovi "rucni", pravilo se svodi na "najnoviji ne-null".
  })) as unknown as Array<Omit<RedakMjerenja, "jeRucno">>;

  return sloziPoPolju(mjerenja.map((m) => ({ ...m, jeRucno: true })));
}

/**
 * Parametri vina koje je BLEND — ponderirani prosjek TRENUTNIH sastavnica.
 *
 * Zasto pri prikazu, a ne iz zapisanog retka: prijenos i pretok upisu prosjek
 * JEDNOM, u trenutku kad se dogode. Ako se poslije izmjeri neka sastavnica,
 * taj zamrznuti redak to ne zna. Racunanjem pri prikazu prosjek se osvjezi cim
 * bilo koja sastavnica dobije novo mjerenje.
 *
 * Pokrivenost se vodi PO POLJU, ne skupno: SO2 zna biti pokriven cijelim
 * blendom, a alkohol samo polovicom. Jedan skupni postotak bi lagao za oba.
 *
 * OGRANICENJE: za sastavnicu koja pokazuje na ZIVI tank cita se sto je u tom
 * tanku SADA. Ako je tank u medjuvremenu ispraznjen i napunjen drugim vinom,
 * podatak pripada tudjem vinu — takva sastavnica se vraca s `sumnjiv: true`,
 * da prikaz to moze reci. Pravi popravak je preusmjeravanje pokazivaca na
 * arhivu pri arhiviranju (faza 3B).
 */
export async function parametriBlenda(
  db: CitacBlenda,
  tankId: string
): Promise<ParametriBlenda | null> {
  const izvori = await db.blendIzvor.findMany({
    where: { ciljTankId: tankId },
    orderBy: { kolicina: "desc" },
    include: {
      izvorTank: {
        select: { broj: true, nazivVina: true, sorta: true, kolicinaVinaUTanku: true },
      },
      izvorArhivaVina: { select: { brojTanka: true, arhiviranoAt: true } },
    },
  });

  if (izvori.length === 0) return null;

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  const ulazi: Array<{
    kolicina: number;
    vrijednosti: VrijednostiMjerenja;
    opis: SastavnicaBlenda;
  }> = [];

  for (const b of izvori) {
    const kolicina = Number(b.kolicina ?? 0);

    let vrijednosti: VrijednostiMjerenja;
    let naziv: string;
    let sumnjiv = false;

    if (b.izvorArhivaVinaId) {
      naziv = `arhiva tanka ${b.izvorArhivaVina?.brojTanka ?? "?"}`;
      vrijednosti = (await vrijednostiArhivePoPolju(db, b.izvorArhivaVinaId))
        .vrijednosti;
    } else if (b.izvorTankId) {
      naziv = `tank ${b.izvorTank?.broj ?? "?"}`;
      vrijednosti = (await vrijednostiTankaPoPolju(db, b.izvorTankId))
        .vrijednosti;

      // Zapis kaze jedno vino, tank sada drzi drugo -> podatak je tudji.
      const t = b.izvorTank;
      if (t && b.izvorTankId !== tankId) {
        const prazan =
          Number(t.kolicinaVinaUTanku ?? 0) <= 0 && !t.nazivVina && !t.sorta;
        if (!prazan && (norm(t.nazivVina) !== norm(b.nazivVina) ||
            norm(t.sorta) !== norm(b.sorta))) {
          sumnjiv = true;
        }
      }
    } else {
      naziv = b.nazivVina ?? "nepoznat izvor";
      vrijednosti = sloziPoPolju([]).vrijednosti;
    }

    const polja = POLJA_MJERENJA.filter((p) => vrijednosti[p] != null);

    ulazi.push({
      kolicina,
      vrijednosti,
      opis: { naziv, kolicina, polja: [...polja], sumnjiv },
    });
  }

  const ukupnoL = ulazi.reduce((s, u) => s + u.kolicina, 0);
  const poPolju = {} as Record<
    (typeof POLJA_MJERENJA)[number],
    PokrivenostPolja
  >;

  for (const polje of POLJA_MJERENJA) {
    const doprinose = ulazi.filter(
      (u) => u.vrijednosti[polje] != null && u.kolicina > 0
    );
    const pokrivenoL = doprinose.reduce((s, u) => s + u.kolicina, 0);

    poPolju[polje] = {
      doprinosi: doprinose.map((u) => ({
        naziv: u.opis.naziv,
        kolicina: u.kolicina,
        vrijednost: Number(u.vrijednosti[polje]),
      })),
      vrijednost:
        pokrivenoL > 0
          ? Number(
              (
                doprinose.reduce(
                  (s, u) => s + u.kolicina * Number(u.vrijednosti[polje]),
                  0
                ) / pokrivenoL
              ).toFixed(3)
            )
          : null,
      pokrivenoL,
      ukupnoL,
      postotak: ukupnoL > 0 ? Number(((pokrivenoL / ukupnoL) * 100).toFixed(2)) : 0,
    };
  }

  return {
    poPolju,
    sastavnice: ulazi.map((u) => u.opis),
    bezPodataka: ulazi.filter((u) => u.opis.polja.length === 0).map((u) => u.opis),
    ukupnoL,
  };
}

/**
 * Napomena za mjerenje jednog tanka slozeno iz vise datuma.
 *
 * Bez ovoga bi redak izgledao kao jedno mjerenje uzeto u jednom trenutku, a
 * zapravo nosi alkohol iz svibnja i SO2 iz srpnja. Za alkohol, secer i kiseline
 * to je tocno (poslije vrenja se prakticki ne mijenjaju); za SO2 i temperaturu
 * fallback gotovo nikad ne poseze unatrag jer se oni mjere tjedno.
 */
export function napomenaOMijesanimDatumima(
  izvorPolja: IzvorPolja
): string | null {
  const datumi = new Set(
    POLJA_MJERENJA.map((p) => izvorPolja[p]?.izmjerenoAt?.toDateString()).filter(
      Boolean
    ) as string[]
  );

  if (datumi.size <= 1) return null;

  const format = (d: Date) =>
    d.toLocaleDateString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const dijelovi = POLJA_MJERENJA.filter((p) => izvorPolja[p] != null).map(
    (p) => `${p} ${format(izvorPolja[p]!.izmjerenoAt)}`
  );

  return `Vrijednosti su iz više mjerenja: ${dijelovi.join(", ")}.`;
}
