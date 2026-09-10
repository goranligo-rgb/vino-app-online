import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * KVASAC PRIPISAN BERBENOJ PARTIJI.
 * ======================================================================
 *
 * DOPUNA, NE ZAMJENA. Glavno pravilo ostaje ono u `lib/vino-radnja.ts`:
 * pri pretoku se kopira ono sto izvor ima U TOM TRENUTKU. Za bentonit,
 * sumporenje i korekcije to je tocno — tretman koji je dodan nakon sto je vino
 * otislo doista nije dirao to vino.
 *
 * Fermentacija je iznimka, jer je ona NASTANAK vina, a ne tretman. Kvasac
 * pripada SARZI: 1.400 L Veltlinca 002/2026 otislo je iz T7 25.08., a T7 je
 * inokuliran 31.08. — fizicki je to ista berbena partija koja je fermentirala s
 * tim kvascem, ali ju je glavno pravilo ostavilo bez zapisa.
 *
 * Ovaj modul odgovara na drugo pitanje od `VinoRadnja`:
 *
 *   VinoRadnja      -> "sto je OVO VINO dobilo, dok je bilo u tanku"
 *   kvasciPoPartiji -> "s cime je SARZA u ovom tanku fermentirala"
 *
 * KORISTI SE SAMO ZA TANK KOJI PO GLAVNOM PRAVILU NEMA NIJEDAN KVASAC.
 * Nijedan tank koji danas ima tocan odgovor ne smije se dirati — pripisivanje
 * po partiji ima siri nazivnik pa daje nize postotke (T22 bi s tocnih 100 %
 * pao na 73 %), i mijesanje dvaju pravila u istom broju ucinilo bi postotke
 * neusporedivima. Zato retci odavde nose `poPartiji: true` i prikaz ih MORA
 * oznaciti.
 *
 * BEZ NOVE TABLICE. Racuna se iz knjige pri prikazu, kao `berbaKrozLanac`.
 * Dva upita, oba nad cijelim skupom (527 kretanja + 21 kvasac, 10.09.2026), pa
 * ne rastu s brojem tankova. Materijalizacija tek ako mjerenje pokaze da je
 * presporo.
 */

type Klijent = Prisma.TransactionClient | PrismaClient;

/**
 * Sat kretanja — ISTI racun kao `satKretanja` u lib/vino-lanac.ts.
 *
 * Prepisan, a ne uvezen: ondje je privatan, a izvoz bi vezao ovaj modul na
 * lanac s kojim inace nema veze. Ako se pravilo ikad promijeni, mijenja se na
 * oba mjesta — zato je i ondje i ovdje opisano istim rijecima.
 *
 * `dogodenoAt` nije jedinstven sat: za pretok je prava oznaka, za punjenje
 * datum IZ FORME (punjenje upisano u 16:48 zna nositi 18:46). `createdAt` sam
 * po sebi je jednako los — backfill knjige upisao je 174 povijesna retka u
 * istoj minuti. Uzima se ono sto je ranije.
 */
function sat(k: { dogodenoAt: Date; createdAt: Date }): number {
  return Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
}

/**
 * PROZOR ISTE TRANSAKCIJE, isti kao u lib/vino-lanac.ts.
 *
 * Punjenje pise `Radnja` i knjizi ULAZ u jednoj transakciji, u razmaku od
 * nekoliko desetaka milisekundi, i pise ih tim redoslijedom. Unutar prozora
 * odlucuje znacenje, ne vremenska oznaka:
 *   - partija koja je USLA bila je u tanku kad je kvasac dodan (punis pa
 *     inokuliras), pa se ulaz racuna do `t + prozor`;
 *   - partija koja je IZASLA bila je u tanku do trenutka izlaska, pa se izlaz
 *     racuna samo do `t - prozor`.
 *
 * Ovo je ujedno jedina brana protiv unatrag datiranog punjenja: partija
 * upisana naknadno, s datumom prije inokulacije, ima `createdAt` daleko
 * kasnije, pa je `sat` smjesta iza prozora i u zahvat ne ulazi.
 */
const PROZOR_ISTE_TRANSAKCIJE_MS = 5_000;

/** Jedan kvasac pripisan preko partije, s udjelom u danasnjem tanku. */
export type KvasacPartije = {
  /** `Radnja` kojom je kvasac dodan; kad ih je vise s istim imenom, prva. */
  radnjaId: string;
  naziv: string;
  /** Kad je kvasac dodan — najranije dodavanje kad ih je vise. */
  datum: Date;
  /**
   * Broj tanka u kojem je inokulirano, ILI null kad ih je vise.
   *
   * Partija razdijeljena u dva tanka pa u svakom inokulirana istim kvascem
   * (10 od 11 takvih slucajeva u zatecenim podacima) dala bi dva retka istog
   * imena s besmislenom oznakom tanka. Retci se zato spajaju po IMENU kvasca,
   * a oznaka tanka ostaje samo kad je izvor jedan.
   */
  brojTanka: number | null;
  /** 0..1 danasnjeg volumena tanka. */
  udio: number;
};

type Kretanje = {
  berbaId: string;
  izTankId: string | null;
  uTankId: string | null;
  litre: number;
  dogodenoAt: Date;
  createdAt: Date;
};

/**
 * Kvasci pripisani preko partija, po tanku.
 *
 * Vraca mapu tankId -> popis, poredan po udjelu silazno. Tank bez ijedne
 * inokulirane partije u mapi nema unos.
 *
 * NAZIVNIK UDJELA je UKUPNO LITARA KOJE JE PARTIJA UNIJELA U PODRUM, ne ono
 * sto je bilo u tanku pri inokulaciji. Posljedica je vidljiva i namjerna: kad
 * je inokulirano 3.050 od 8.400 L partije, tank koji drzi tu partiju pokazuje
 * 36 %, a ne 100 %. Vise od toga se ne zna — knjiga prati partiju po TANKU, ne
 * pod-sarze unutar partije, pa se ne moze reci koje su litre presle u koji
 * tank prije inokulacije.
 */
export async function kvasciPoPartiji(
  db: Klijent,
  tankIds: string[]
): Promise<Map<string, KvasacPartije[]>> {
  const rezultat = new Map<string, KvasacPartije[]>();
  const trazeni = new Set(tankIds);

  if (trazeni.size === 0) return rezultat;

  // Cijela knjiga i svi kvasci — dva upita, oba neovisna o broju tankova.
  // Knjiga se mora citati CIJELA: da bi se znalo sto je bilo u tanku X u
  // trenutku t, trebaju i kretanja tankova koji nisu medju trazenima.
  const [kretanja, kvasci, tankovi] = await Promise.all([
    db.berbaKretanje.findMany({
      select: {
        berbaId: true,
        izTankId: true,
        uTankId: true,
        litre: true,
        dogodenoAt: true,
        createdAt: true,
      },
    }),
    db.radnja.findMany({
      where: { vrsta: "DODAVANJE", preparat: { jeKvasac: true } },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
        preparat: { select: { naziv: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.tank.findMany({ select: { id: true, broj: true } }),
  ]);

  if (kvasci.length === 0) return rezultat;

  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));

  // Ukupno litara koje je partija unijela u podrum — nazivnik udjela.
  // ULAZ izvana je kretanje bez izvornog tanka.
  const ukupnoPartije = new Map<string, number>();

  for (const k of kretanja as Kretanje[]) {
    if (!k.izTankId && k.uTankId) {
      ukupnoPartije.set(k.berbaId, (ukupnoPartije.get(k.berbaId) ?? 0) + k.litre);
    }
  }

  // Koliki je UDIO partije bio u tanku kad je kvasac dodan.
  // partijaId -> popis inokulacija.
  const inokulacije = new Map<
    string,
    Array<{ radnjaId: string; naziv: string; datum: Date; tankId: string; udio: number }>
  >();

  for (const r of kvasci) {
    const t = r.createdAt.getTime();
    const uTanku = new Map<string, number>();

    for (const k of kretanja as Kretanje[]) {
      const s = sat(k);

      if (k.uTankId === r.tankId && s <= t + PROZOR_ISTE_TRANSAKCIJE_MS) {
        uTanku.set(k.berbaId, (uTanku.get(k.berbaId) ?? 0) + k.litre);
      }

      if (k.izTankId === r.tankId && s < t - PROZOR_ISTE_TRANSAKCIJE_MS) {
        uTanku.set(k.berbaId, (uTanku.get(k.berbaId) ?? 0) - k.litre);
      }
    }

    for (const [partijaId, litre] of uTanku) {
      if (litre <= 0.5) continue; // zaokruzni ostatci nisu partija u tanku

      const ukupno = ukupnoPartije.get(partijaId) ?? 0;
      if (ukupno <= 0) continue;

      const p = inokulacije.get(partijaId) ?? [];

      p.push({
        radnjaId: r.id,
        naziv: r.preparat?.naziv ?? "kvasac bez imena",
        datum: r.createdAt,
        tankId: r.tankId,
        // Odrezano na 1: knjiga zna imati u tanku vise litara nego sto je
        // partija unijela (nadopune, zatecene kolicine).
        udio: Math.min(1, litre / ukupno),
      });

      inokulacije.set(partijaId, p);
    }
  }

  if (inokulacije.size === 0) return rezultat;

  // Stanje partija DANAS, po tanku.
  const danas = new Map<string, Map<string, number>>();

  const upisi = (tankId: string, partijaId: string, litre: number) => {
    if (!trazeni.has(tankId)) return;
    const m = danas.get(tankId) ?? new Map<string, number>();
    m.set(partijaId, (m.get(partijaId) ?? 0) + litre);
    danas.set(tankId, m);
  };

  for (const k of kretanja as Kretanje[]) {
    if (k.uTankId) upisi(k.uTankId, k.berbaId, k.litre);
    if (k.izTankId) upisi(k.izTankId, k.berbaId, -k.litre);
  }

  for (const [tankId, partije] of danas) {
    const uTanku = [...partije.entries()].filter(([, l]) => l > 0.5);
    const ukupnoUTanku = uTanku.reduce((z, [, l]) => z + l, 0);

    if (ukupnoUTanku <= 0) continue;

    // Spajanje PO IMENU kvasca — vidi `brojTanka`.
    const poImenu = new Map<
      string,
      { radnjaId: string; datum: Date; tankovi: Set<string>; litre: number }
    >();

    for (const [partijaId, litre] of uTanku) {
      for (const ink of inokulacije.get(partijaId) ?? []) {
        const p = poImenu.get(ink.naziv) ?? {
          radnjaId: ink.radnjaId,
          datum: ink.datum,
          tankovi: new Set<string>(),
          litre: 0,
        };

        p.litre += litre * ink.udio;
        p.tankovi.add(ink.tankId);

        // Najranije dodavanje odreduje datum i redak na koji se pokazuje.
        if (ink.datum < p.datum) {
          p.datum = ink.datum;
          p.radnjaId = ink.radnjaId;
        }

        poImenu.set(ink.naziv, p);
      }
    }

    if (poImenu.size === 0) continue;

    const popis: KvasacPartije[] = [...poImenu.entries()]
      .map(([naziv, p]) => ({
        radnjaId: p.radnjaId,
        naziv,
        datum: p.datum,
        brojTanka:
          p.tankovi.size === 1
            ? brojTanka.get([...p.tankovi][0]) ?? null
            : null,
        udio: p.litre / ukupnoUTanku,
      }))
      .filter((x) => x.udio > 0)
      .sort((a, b) => b.udio - a.udio);

    if (popis.length > 0) rezultat.set(tankId, popis);
  }

  return rezultat;
}
