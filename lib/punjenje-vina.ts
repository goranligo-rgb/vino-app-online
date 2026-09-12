import type { Prisma } from "@prisma/client";
import {
  praznjenjaPosuda,
  satKretanja,
  type Praznjenja,
} from "@/lib/sat-knjige";

/**
 * KOJA PUNJENJA PRIPADAJU VINU KOJE JE DANAS U TANKU.
 * ======================================================================
 *
 * Granica vina kaze OTKAD je u tanku ovo vino (lib/granica-vina.ts). Pitanje
 * koje ovaj modul rjesava je drugo: je li konkretno punjenje dio tog vina.
 *
 * ZASTO NE PO `datumPunjenja`. Datum je ono sto je covjek utipkao u obrazac i
 * smije biti unatrag. Otkad sat knjige ima donju branu (redak punjenja ne pada
 * ispred praznjenja posude), datum i redak se razilaze: punjenje T27 nosi datum
 * 09.09. 15:14, a njegov ULAZ redak sjedi na 10.09. 12:58, jer je tank do tada
 * bio pun prethodnog vina. Granica je 10.09., pa filtar po datumu ispusti bas
 * to punjenje — i s njim pocetno mjerenje berbe. Izmjereno 12.09.2026: T27,
 * T33 i T45 tako gube secer, kiseline i pH s grozdja, a T2 jedno punjenje.
 *
 * ZASTO NE PO `BerbaKretanje.punjenjeId`. Taj stupac je goli pokazivac bez
 * stranog kljuca i pokazuje na punjenja koja vise ne postoje: 66 redaka knjige
 * pokazuje na 36 razlicitih id-eva, a `PunjenjeTanka` ima 20 redaka (punjenja
 * se pri ispravku berbe brisu i stvaraju iznova). Trazenje retka preko njega
 * uspijeva na 9 od 20 punjenja. Isto vrijedi za `grupaId`, koji se razrjesava
 * kroz isti pokazivac.
 *
 * KLJUC JE `PunjenjeStavka.berbaId`. Ruta punjenja upisuje `berbaId` na SVE
 * stavke te berbe (app/api/punjenje/route.ts), a svaki redak knjige nosi
 * `berbaId`. To je veza po sadrzaju, ne po pokazivacu koji se brise, i drzi na
 * 17 od 20 punjenja.
 *
 * ZASTITNA MREZA. Preostale tri stavke (najstarije: T30, T31, T44) nemaju
 * `berbaId`. Za njih vrijedi staro pravilo po datumu — punjenje bez traga u
 * knjizi ne smije tiho ispasti. Izmjereno: s mrezom se ne gubi nijedno
 * mjerenje.
 */

type Klijent = Pick<
  Prisma.TransactionClient,
  "punjenjeTanka" | "berbaKretanje"
>;

/** Redak knjige u obliku koji ovaj racun treba. */
export type RedakKnjigePunjenja = {
  id: string;
  uTankId: string | null;
  izTankId: string | null;
  berbaId: string;
  litre: number;
  vrsta: string;
  dogodenoAt: Date;
  createdAt: Date;
  punjenjeId?: string | null;
};

/** Punjenje u obliku koji ovaj racun treba. */
export type PunjenjeZaProvjeru = {
  id: string;
  datumPunjenja: Date;
  pocetnoMjerenjeId?: string | null;
  stavke: Array<{ berbaId: string | null }>;
};

export type PunjenjaVina = {
  /** Id-evi punjenja koja pripadaju danasnjem vinu. */
  ids: string[];
  /**
   * Pocetna mjerenja tih punjenja. Ona nose DATUM BERBE (secer, kiseline i pH
   * izmjereni su na grozdju), pa redovno padaju ispred granice — prikaz ih
   * pusta kroz `mjerenjaTrenutnogVina`, a pripadnost vinu utvrdjuje punjenje,
   * ne sat mjerenja.
   */
  pocetnaMjerenja: Set<string>;
};

/**
 * CISTI RACUN — bez baze, pa se testira bez transakcije.
 *
 * `odAt` je granica vina; `null` znaci "nema granice" i tada prolazi sve.
 */
export function punjenjaTrenutnogVina(
  tankId: string,
  punjenja: PunjenjeZaProvjeru[],
  kretanja: RedakKnjigePunjenja[],
  odAt: Date | null,
  praznjenja?: Praznjenja
): PunjenjaVina {
  const ids: string[] = [];
  const pocetnaMjerenja = new Set<string>();

  const prihvati = (p: PunjenjeZaProvjeru) => {
    ids.push(p.id);
    if (p.pocetnoMjerenjeId) pocetnaMjerenja.add(p.pocetnoMjerenjeId);
  };

  if (!odAt) {
    for (const p of punjenja) prihvati(p);
    return { ids, pocetnaMjerenja };
  }

  const prag = odAt.getTime();
  const sati = praznjenja ?? praznjenjaPosuda(kretanja);

  for (const p of punjenja) {
    const berbe = new Set(
      p.stavke.map((s) => s.berbaId).filter((x): x is string => !!x)
    );

    const redci =
      berbe.size > 0
        ? kretanja.filter(
            (k) =>
              k.uTankId === tankId && k.vrsta === "ULAZ" && berbe.has(k.berbaId)
          )
        : [];

    if (redci.length > 0) {
      // Vino je u tank uslo kad je uslo PRVO od njegovih kretanja.
      const sat = Math.min(...redci.map((k) => satKretanja(k, sati)));
      if (sat >= prag) prihvati(p);
      continue;
    }

    // Zastitna mreza: punjenje bez traga u knjizi sudi se po datumu, kao prije.
    if (p.datumPunjenja.getTime() >= prag) prihvati(p);
  }

  return { ids, pocetnaMjerenja };
}

/**
 * Isti racun, ali sam dohvaca sto mu treba. Dva upita.
 *
 * Pozivatelj koji punjenja ionako cita (stranica tanka) neka koristi cisti
 * racun i ne place drugi dohvat.
 */
export async function citajPunjenjaTrenutnogVina(
  db: Klijent,
  tankId: string,
  odAt: Date | null
): Promise<PunjenjaVina> {
  const [punjenja, kretanja] = await Promise.all([
    db.punjenjeTanka.findMany({
      where: { tankId },
      select: {
        id: true,
        datumPunjenja: true,
        pocetnoMjerenjeId: true,
        stavke: { select: { berbaId: true } },
      },
    }),
    db.berbaKretanje.findMany({
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
    }),
  ]);

  return punjenjaTrenutnogVina(tankId, punjenja, kretanja, odAt);
}
