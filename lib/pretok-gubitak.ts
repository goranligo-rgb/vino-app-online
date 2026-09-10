/**
 * GUBITAK PRI PRETOKU — kalo ili talog, ovisno o nacinu.
 * ======================================================================
 *
 * `Pretok.gubitakLitara` je JEDAN broj za dvije fizicki razlicite pojave:
 *
 *   gubitak u crijevu i pumpi   — nekoliko promila do par postotaka
 *   odbacena gusca frakcija     — 15 do 70 %, kod izvlacenja vina iz taloga
 *
 * Zbrajati ih pod jednim imenom je krivo: tko na kraju sezone zbroji "kalo",
 * dobije 1.400 L, od cega je 1.300 L namjerno bacen talog. Podrum to onda ne
 * prepozna kao svoj broj — a upravo se to i dogodilo.
 *
 * PODJELA SE IZVODI IZ `Pretok.nacin`, ne iz posebnog polja. Razlozi:
 *
 *   - `nacin` bira covjek u formi pri svakom pretoku, dakle nije nagadjanje;
 *   - radi UNATRAG, na svim zatecenim zapisima, bez migracije;
 *   - kod vec tretira ta dva kao razlicite pojave — prag upozorenja je 5 % za
 *     BEZ i FILTRACIJA, a 15 % za FLOTACIJA. Ovo samo dovrsava tu odluku.
 *
 * Izmjereno 10.09.2026. nad svim pretocima: `BEZ` daje gubitke od 1,0 do
 * 1,4 %, `FLOTACIJA` od 14,3 do 67 %. Populacije se NE PREKLAPAJU, pa podjela
 * po nacinu ne rasporeduje krivo nijedan zatecen zapis.
 *
 * STO OVO NE RJESAVA, zapisano da se ne trazi dvaput: flotacijski pretok ima
 * i talog I gubitak u crijevu, a jedan broj ih ne razdvaja. Ime kaze sto
 * PREVLADAVA, ne sto je tocno. Razdvajanje unutar jednog pretoka trazi novo
 * polje i pitanje u formi; ceka da ga podrum zatrazi.
 */

/** KAKO je pretok izveden. Zrcali `Pretok.nacin`, koji je slobodan tekst. */
export type NacinPretoka = "BEZ" | "FILTRACIJA" | "FLOTACIJA";

/**
 * Prag iznad kojeg se gubitak istice — VEZAN UZ NACIN, ne konstanta.
 *
 * Talozenje normalno ima 10-15 % taloga, pa bi ga jedan prag od 5 % stalno
 * isticao bez razloga.
 *
 * JEDINI IZVOR ISTINE. Forma `/pretok` cita odavde; prije je imala vlastitu
 * kopiju, pa su upozorenje pri unosu i isticanje pri pregledu mogli reci
 * razlicito.
 */
export const PRAG_GUBITKA: Record<NacinPretoka, number> = {
  BEZ: 5,
  FILTRACIJA: 5,
  FLOTACIJA: 15,
};

/** Prag za nacin koji nije poznat — najstroziji od postojecih. */
const PRAG_NEPOZNAT = 5;

export function jeNacinPretoka(x: unknown): x is NacinPretoka {
  return x === "BEZ" || x === "FILTRACIJA" || x === "FLOTACIJA";
}

/**
 * Kako se gubitak ZOVE za dani nacin.
 *
 * "gubitak" je za pretoke prije 23.08.2026., kad `nacin` jos nije postojao.
 * Oni ionako imaju `gubitakLitara = NULL` pa se ne prikazuju, ali ime mora
 * postojati da prikaz ne mora pogadjati.
 */
export function nazivGubitka(nacin: string | null | undefined): string {
  if (nacin === "BEZ") return "kalo";
  if (nacin === "FLOTACIJA" || nacin === "FILTRACIJA") return "talog";
  return "gubitak";
}

/** Duze ime, za mjesta gdje stoji samo jedan redak bez konteksta. */
export function objasnjenjeGubitka(nacin: string | null | undefined): string {
  if (nacin === "BEZ") return "gubitak u crijevu i pumpi";
  if (nacin === "FLOTACIJA") return "odbačena gušća frakcija (talog)";
  if (nacin === "FILTRACIJA") return "zadržano na filtru";
  return "gubitak — način pretoka nije zapisan";
}

export type OpisGubitka = {
  /** "kalo" | "talog" | "gubitak" */
  naziv: string;
  objasnjenje: string;
  litre: number;
  /** Udio u onome sto je iz izvora izaslo; null kad se izlaz ne zna. */
  postotak: number | null;
  /** Iznad praga za taj nacin — prikaz ga smije istaknuti. */
  visok: boolean;
};

/**
 * Opis gubitka za prikaz, ili `null` kad ga nema sto prikazati.
 *
 * Vraca `null` i kad je gubitak NULL (stari pretoci — nitko ga nije racunao,
 * pa lazna nula ne smije tvrditi da gubitka nije bilo) i kad je tocno 0.
 */
export function opisGubitka(p: {
  nacin?: string | null;
  gubitakLitara?: number | null;
  kolicinaIzlaz?: number | null;
}): OpisGubitka | null {
  const litre = p.gubitakLitara;

  if (litre == null || !Number.isFinite(litre) || litre <= 0) return null;

  const izlaz = p.kolicinaIzlaz;
  const postotak =
    izlaz != null && izlaz > 0 ? (litre / izlaz) * 100 : null;

  const prag = jeNacinPretoka(p.nacin) ? PRAG_GUBITKA[p.nacin] : PRAG_NEPOZNAT;

  return {
    naziv: nazivGubitka(p.nacin),
    objasnjenje: objasnjenjeGubitka(p.nacin),
    litre,
    postotak,
    visok: postotak != null && postotak > prag,
  };
}
