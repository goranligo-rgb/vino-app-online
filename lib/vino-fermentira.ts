/**
 * FERMENTIRA LI VINO — i smije li zato naslijedjena vrijednost na ekran.
 * ======================================================================
 *
 * Tank 5 je pokazivao alkohol 11,3 % i ukupni SO2 86 izmjerene 15.07., dok mu
 * je secer 10.09. bio 28 g/L i padao jedanaest mjerenja zaredom. Vino usred
 * fermentacije svaki dan ima drugi alkohol; vrijednost od prije dva mjeseca
 * opisuje vino koje je tada bilo u nekoj drugoj posudi, ne ovo.
 *
 * PRAG PO STAROSTI NAslijedjene VRIJEDNOSTI NE RJESAVA TO. Mjereno nad bazom:
 * tank 15 nosi vrijednost staru 85 dana i ona je TOCNA (vino miruje), a tank 5
 * vrijednost staru 57 dana i ona je KRIVA. Razlika nije u starosti nego u tome
 * mijenja li se vino.
 *
 * STO JE FERMENTACIJA (vlasnikova odluka, 11.09.2026)
 * ---------------------------------------------------
 * Vlastiti secer iznad 5 g/L, izmjeren u zadnja tri tjedna. SMJER (pad, rast
 * ili ravno) je POTVRDA, ne uvjet:
 *
 *   - mirno vino nema 86 g/L secera, bez obzira pada li krivulja;
 *   - rast secera usred berbe znaci da se u tank dolijeva most — takvo se vino
 *     mijenja jos jace od onoga koje mirno fermentira;
 *   - cetiri tanka imaju samo JEDNO mjerenje secera, pa smjera nema; dva od
 *     njih (87 i 83 g/L, mjereno prije tri i sest dana) ocito fermentiraju.
 *
 * ZASTO SVJEZINA SECERA, a ne smjer: secer izmjeren prije sto dana ne govori o
 * danas. Tankovi 30 i 31 imaju jedino mjerenje od 03.06.; bez uvjeta svjezine
 * ostali bi zauvijek oznaceni kao "fermentira" i nikad vise ne bi vidjeli
 * nijednu naslijedjenu vrijednost.
 *
 * TRI TJEDNA jer se secer u fermentaciji upisuje svakih par dana — tank 7 ima
 * cetrnaest mjerenja u deset dana. Nakon tri tjedna sutnje krivulja vise nije
 * dokaz o danasnjem stanju.
 */

/** Iznad ovoga vino nije mirno. Gram po litri. */
export const PRAG_SECERA = 5;

/** Koliko dugo mjerenje secera vrijedi kao dokaz o danasnjem stanju. */
export const DANA_SVJEZ_SECER = 21;

/**
 * Polja koja fermentacija mijenja iz dana u dan.
 *
 * Secer i temperatura NISU ovdje: secer je sam dokaz, a temperatura je
 * svojstvo posude i hladjenja, ne vina. Ukupne i hlapive kiseline takodjer ne
 * — one se kroz fermentaciju micu bitno manje od alkohola i SO2, a enolog ih
 * cita kao grubu orijentaciju.
 */
export const POLJA_KOJA_FERMENTACIJA_MIJENJA = [
  "alkohol",
  "slobodniSO2",
  "ukupniSO2",
  "ph",
] as const;

export type StanjeVina = {
  fermentira: boolean;
  /** Zadnji vlastiti secer, ako ga ima. */
  secer: number | null;
  mjerenoAt: Date | null;
  /** Koliko je dana star taj podatak. `null` kad secera nema. */
  danaStar: number | null;
};

/**
 * Fermentira li vino u tanku, po njegovom VLASTITOM seceru.
 *
 * Namjerno se NE gleda naslijedjeni secer: dokaz o tome sto se u ovoj posudi
 * sada dogadja mora doci iz ove posude. Naslijedjen secer bi tank proglasio
 * fermentirajucim na temelju mjerenja koje je netko napravio drugdje, prije
 * nego je vino uopce stiglo ovamo.
 */
export function stanjeVina(
  secer: number | null | undefined,
  mjerenoAt: Date | null | undefined,
  sada: Date = new Date()
): StanjeVina {
  if (secer == null || mjerenoAt == null) {
    return { fermentira: false, secer: null, mjerenoAt: null, danaStar: null };
  }

  const danaStar = Math.floor(
    (sada.getTime() - mjerenoAt.getTime()) / 86_400_000
  );

  return {
    fermentira: secer > PRAG_SECERA && danaStar <= DANA_SVJEZ_SECER,
    secer: Number(secer),
    mjerenoAt,
    danaStar,
  };
}

/**
 * Smije li naslijedjena vrijednost na ekran.
 *
 * SVJEZIJA VRIJEDNOST OSTAJE. Pravilo je pisano protiv vrijednosti od 15.07.
 * uz secer od 10.09. Kad je naslijedjena vrijednost novija ili jednako stara
 * kao secer koji dokazuje fermentaciju, ona opisuje isto ono stanje koje i
 * secer — nema je razloga skrivati. Bez te iznimke bi tankovi 1, 10, 12 i 28
 * izgubili vrijednosti od 03.09. i 10.09., dakle upravo one svjeze.
 *
 * Vraca `null` kad vrijednost smije ostati, ili razlog kad se skriva.
 */
export function razlogSkrivanja(
  polje: string,
  naslijedenoAt: Date | null | undefined,
  stanje: StanjeVina
): string | null {
  if (!stanje.fermentira || !stanje.mjerenoAt) return null;

  const dira = (POLJA_KOJA_FERMENTACIJA_MIJENJA as readonly string[]).includes(
    polje
  );
  if (!dira) return null;

  if (!naslijedenoAt) return null;

  // Jednako stara ostaje — usporedjuje se po danu, ne po sekundi: mjerenje
  // secera i mjerenje alkohola istog jutra nisu "starije" jedno od drugoga.
  if (naslijedenoAt.getTime() >= pocetakDana(stanje.mjerenoAt)) return null;

  return `vino fermentira, vrijednost je od ${hrDatum(naslijedenoAt)}`;
}

function pocetakDana(d: Date): number {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  ).getTime();
}

function hrDatum(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}
