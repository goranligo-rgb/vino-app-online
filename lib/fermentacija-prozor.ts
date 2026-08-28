/**
 * PROZOR FERMENTACIJE — gdje je vino bilo kroz cijelu fermentaciju.
 *
 * Ovdje se nista ne upisuje i nista se ne mijenja.
 *
 * `Fermentacija` zna samo gdje je POCELA (`tankId`) i kad (`pocetakAt`,
 * `krajAt`). Vino u meduvremenu smije otici u drugi tank i fermentacija ide s
 * njim — to je odluka A iz faze 0. Ovaj modul iz knjige kretanja slaze put
 * kojim je proslo, kao niz segmenata:
 *
 *     { berbaId, tankId, od, do, litre }
 *
 * Dnevnik time zna za koji tank i koji raspon citati temperaturu, koje zadatke
 * pokupiti i koja mjerenja pripadaju kojem dijelu fermentacije.
 *
 * VINO SE PRATI UNAPRIJED IZ POCETNOG TANKA — NE PRATI SE BERBA
 * ------------------------------------------------------------
 * Ovo je glavna odluka modula i lako ju je promasiti.
 *
 * Berba je u pravilu razdijeljena na vise mjesta, a fermentira samo ono sto je
 * u POCETNOM TANKU u trenutku pocetka. Primjer iz baze: Chardonnay ulazi u T7,
 * 4.800 L ide u T10 i 400 L u T2. Kvasac dobiva samo T10. Onih 400 L u T2 je
 * ista berba, ali druga partija — nije dio ove fermentacije i njegova
 * temperatura nema sto raditi u ovom dnevniku.
 *
 * Zato se ne zbraja stanje berbe po podrumu, nego se od pocetne kolicine u
 * pocetnom tanku ide UNAPRIJED: kad vino izade iz tanka koji fermentacija drzi,
 * ide za njim u odrediste; kad izade iz tanka koji ne drzi, to je tude vino i
 * ne dira se. Tank ulazi u prozor tek kad u njega dotece vino OVE fermentacije.
 *
 * SEGMENT JE INTERVAL STALNE KOLICINE
 * -----------------------------------
 * Segment traje dok je kolicina u tanku NEPROMIJENJENA i veca od nule. Svaki
 * pretok, izlaz ili ispravak zatvara jedan segment i otvara sljedeci.
 *
 * Zasto tako, a ne "jedan segment po boravku": kolicina se kroz boravak mijenja
 * (T10, Chardonnay: 4.800 → 4.300 → 4.000 L), pa bi jedan broj nad cijelim
 * boravkom bio netocan za dva od tri dana. Polje `litre` je ovako uvijek tocno.
 *
 * Za prikaz to zna biti sitno, pa `spojiSusjedne` susjedne segmente istog tanka
 * spaja u jedan boravak s rasponom `litreOd` → `litreDo`. Racun ostaje tocan,
 * prikaz citljiv, i nijedno ne laze.
 *
 * ISTOVREMENI DOGADAJI IDU ZAJEDNO
 * --------------------------------
 * Jedan pretok upisuje vise redaka s ISTIM `dogodenoAt` (T7 → cetiri tanka u
 * 16:16). Svi se primjenjuju prije nego se ista zakljuci, inace bi se izmedu
 * njih vidjela stanja koja nikad nisu postojala.
 *
 * RUB JE UKLJUCIV NA POCETKU, ISKLJUCIV NA KRAJU
 * ----------------------------------------------
 * Segment `[od, do)`. Vino koje ode u 16:16 i drugo koje dode u 16:16 ne
 * preklapaju se. Isti rub koji lib/mjerenja-berba.ts vec koristi.
 *
 * STO OVAJ MODUL NE RADI
 * ----------------------
 * Ne dira `vrijednostiTankaPoPolju` (lib/mjerenja.ts) ni bilo koji postojeci
 * citac. Ne pise u bazu. Ne zna za tablicu `Fermentacija` — prima obican
 * `{ tankId, pocetakAt, krajAt }`, pa radi i prije nego ijedna fermentacija
 * bude unesena (upravo to radi scripts/provjeri-fermentacija-prozor.ts).
 *
 * OGRADE
 *
 *  1. ISPRAVAK i PONISTENJE nose `dogodenoAt` = dan backfilla (25.–26.08.2026),
 *     ne datum izvornog dogadaja. Ispravak od 2.504 L na T11 tako pada usred
 *     fermentacije umjesto na svoje pravo mjesto. Segmenti su tocan prikaz
 *     KNJIGE; knjiga na tom mjestu nije tocan prikaz povijesti.
 *
 *  2. Vino koje knjiga ne pokriva ne daje nijedan segment. Prazan rezultat
 *     znaci "knjiga ne zna", NE "vina nije bilo".
 *
 *  3. DOLIJEVANJE SE NE PRATI. Kad u tank koji fermentacija drzi dotece vino
 *     iz tanka koji ne drzi (ili izravan ULAZ iz berbe), to se NE pribraja.
 *     Fermentacija ostaje ono sto je u tanku bilo na pocetku, plus put kojim je
 *     islo. Knjiga nema identitet partije — samo stanja po tanku — pa se
 *     dotoceno vino ne moze razluciti od zatecenog. Radije manje nego izmisljeno.
 *
 *  4. Kad vise redaka u istom trenutku vuce iz istog tanka vise nego sto
 *     fermentacija ondje drzi, uzima se redom dok ima; ostatak je tude vino i
 *     preskace se. Bez identiteta partije tocnija podjela ne postoji.
 *
 * BEZ NEOGRANICENOG Promise.all
 * -----------------------------
 * Ovaj modul ga uopce ne koristi. Broj upita je STALAN (dva po fermentaciji) i
 * ne raste s brojem berbi ni segmenata — sve ide jednim `WHERE berbaId = ANY`.
 * To je jaca garancija od ogranicavanja sirine. Tko cita vise fermentacija
 * odjednom, neka ih pusti kroz `uValovima` iz lib/paralelno.ts; primjer stoji u
 * scripts/provjeri-fermentacija-prozor.ts.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { uLitre } from "@/lib/filtracija";

export type CitacProzora = Prisma.TransactionClient | PrismaClient;

/**
 * Jedan redak knjige, s OBA kraja.
 *
 * Razlikuje se od `Pomak` u lib/mjerenja-berba.ts namjerno: ondje se gleda
 * stanje jednog tanka pa je redak rastavljen na dva predznaka, ovdje se vino
 * PRATI s tanka na tank pa se izvor i odrediste ne smiju razdvojiti — inace se
 * izgubi upravo ono sto je potrebno.
 */
export type KretanjeBerbe = {
  berbaId: string;
  izTankId: string | null;
  uTankId: string | null;
  /** Uvijek pozitivno, u CIJELIM mililitrima. */
  ml: number;
  dogodenoAt: Date;
};

/** Interval stalne kolicine jedne berbe u jednom tanku. */
export type Segment = {
  berbaId: string;
  tankId: string;
  od: Date;
  /**
   * Iskljuciv kraj. NAPOMENA: `do` je rezervirana rijec u JavaScriptu — kao ime
   * svojstva je ispravno, ali se NE SMIJE destrukturirati (`const { do } = s`
   * je sintakticka greska). Cita se kao `s.do`.
   */
  do: Date;
  /** Kolicina kroz cijeli segment. Stalna po definiciji segmenta. */
  litre: number;
  ml: number;
  /** Vino je na kraju prozora jos bilo u tanku — segment je odrezan granicom. */
  otvoren: boolean;
};

/** Vise susjednih segmenata istog tanka, spojenih radi prikaza. */
export type Boravak = {
  berbaId: string;
  tankId: string;
  od: Date;
  do: Date;
  litreOd: number;
  litreDo: number;
  mijenjalaSe: boolean;
  segmenata: number;
  otvoren: boolean;
};

export type Prozor = {
  /** Tank u kojem je fermentacija POCELA. */
  tankId: string;
  pocetakAt: Date;
  /** `null` = jos traje; kraj prozora je tada `sada`. */
  krajAt: Date | null;
};

// ---------------------------------------------------------------------------
// Cisti dio — bez baze
// ---------------------------------------------------------------------------

function ms(d: Date): number {
  return d.getTime();
}

/** Predznak retka prema promatranom tanku. 0 = redak taj tank ne dira. */
function ucinak(k: KretanjeBerbe, tankId: string): number {
  let n = 0;
  if (k.uTankId === tankId) n += k.ml;
  if (k.izTankId === tankId) n -= k.ml;
  return n;
}

/**
 * Berbe koje su u tanku bile u zadanom trenutku, s kolicinom u mililitrima.
 *
 * Rub je ukljuciv — isto pravilo koje `stanjeUTrenutku` u lib/mjerenja-berba.ts
 * vec primjenjuje, da dva modula nad istom knjigom ne daju razlicit odgovor.
 */
export function berbeUTanku(
  kretanja: KretanjeBerbe[],
  tankId: string,
  trenutak: Date
): Map<string, number> {
  const zbroj = new Map<string, number>();

  for (const k of kretanja) {
    if (ms(k.dogodenoAt) > ms(trenutak)) continue;
    const n = ucinak(k, tankId);
    if (n === 0) continue;
    zbroj.set(k.berbaId, (zbroj.get(k.berbaId) ?? 0) + n);
  }

  for (const [berbaId, mlv] of zbroj) {
    if (mlv <= 0) zbroj.delete(berbaId);
  }

  return zbroj;
}

/** Kretanja grupirana po trenutku, kronoloski. */
function poTrenucima(kretanja: KretanjeBerbe[]): Array<{ t: number; redci: KretanjeBerbe[] }> {
  const mapa = new Map<number, KretanjeBerbe[]>();
  for (const k of kretanja) {
    const t = ms(k.dogodenoAt);
    mapa.set(t, [...(mapa.get(t) ?? []), k]);
  }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([t, redci]) => ({ t, redci }));
}

/**
 * Segmenti jedne berbe, pracene UNAPRIJED iz pocetnog tanka.
 *
 * Cisto racunanje: ulaz su redci knjige, izlaz su segmenti. Nema baze i nema
 * `new Date()` — granice prozora dolaze kao podatak, pa je rezultat ponovljiv i
 * dade se testirati bez baze.
 */
export function segmentiIzTanka(
  kretanja: KretanjeBerbe[],
  berbaId: string,
  pocetniTankId: string,
  prozorOd: Date,
  prozorDo: Date
): Segment[] {
  const odMs = ms(prozorOd);
  const doMs = ms(prozorDo);
  if (doMs <= odMs) return [];

  const moja = kretanja.filter((k) => k.berbaId === berbaId);

  // Koliko fermentacija drzi na pocetku: stanje POCETNOG tanka u tom trenutku.
  let pocetno = 0;
  for (const k of moja) {
    if (ms(k.dogodenoAt) > odMs) continue;
    pocetno += ucinak(k, pocetniTankId);
  }
  if (pocetno <= 0) return [];

  /** Sto fermentacija drzi, po tanku. Tank koji padne na nulu ispada. */
  const drzi = new Map<string, number>([[pocetniTankId, pocetno]]);

  type Sirovi = { tankId: string; od: number; do: number; ml: number };
  const sirovi: Sirovi[] = [];

  let od = odMs;

  const zabiljezi = (doTrenutka: number) => {
    if (doTrenutka <= od) return;
    for (const [tankId, mlv] of drzi) {
      if (mlv > 0) sirovi.push({ tankId, od, do: doTrenutka, ml: mlv });
    }
    od = doTrenutka;
  };

  for (const { t, redci } of poTrenucima(moja)) {
    if (t <= odMs) continue;
    if (t >= doMs) break;

    zabiljezi(t);

    // Svi redci istog trenutka primjenjuju se ZAJEDNO. `preostalo` pazi da se
    // iz jednog tanka ne uzme vise nego sto fermentacija ondje drzi — visak je
    // tude vino iste berbe (ograda 4).
    const preostalo = new Map(drzi);
    const promjena = new Map<string, number>();

    for (const k of redci) {
      if (!k.izTankId) continue; // ULAZ izvana se ne pribraja — ograda 3
      const dostupno = preostalo.get(k.izTankId) ?? 0;
      if (dostupno <= 0) continue;

      const uzmi = Math.min(k.ml, dostupno);
      preostalo.set(k.izTankId, dostupno - uzmi);
      promjena.set(k.izTankId, (promjena.get(k.izTankId) ?? 0) - uzmi);
      if (k.uTankId) promjena.set(k.uTankId, (promjena.get(k.uTankId) ?? 0) + uzmi);
    }

    for (const [tankId, d] of promjena) {
      const novo = (drzi.get(tankId) ?? 0) + d;
      if (novo > 0) drzi.set(tankId, novo);
      else drzi.delete(tankId);
    }
  }

  zabiljezi(doMs);

  // Spoji uzastopne intervale istog tanka s istom kolicinom — segment postaje
  // MAKSIMALAN interval stalne kolicine, a ne po jedan po dogadaju.
  const spojeni: Sirovi[] = [];
  for (const s of sirovi
    .slice()
    .sort((a, b) => a.tankId.localeCompare(b.tankId) || a.od - b.od)) {
    const zadnji = spojeni[spojeni.length - 1];
    if (zadnji && zadnji.tankId === s.tankId && zadnji.do === s.od && zadnji.ml === s.ml) {
      zadnji.do = s.do;
      continue;
    }
    spojeni.push({ ...s });
  }

  return spojeni
    .map((s) => ({
      berbaId,
      tankId: s.tankId,
      od: new Date(s.od),
      do: new Date(s.do),
      ml: s.ml,
      litre: uLitre(s.ml),
      otvoren: s.do >= doMs,
    }))
    .sort((a, b) => ms(a.od) - ms(b.od) || a.tankId.localeCompare(b.tankId));
}

/**
 * Segmenti svih berbi koje su na pocetku bile u tanku, poredani kronoloski.
 *
 * Glavni cisti ulaz: `prozorFermentacije` samo dobavi podatke i pozove ovo.
 * Sve odluke su ovdje i sve su provjerljive bez baze.
 */
export function sloziSegmente(
  kretanja: KretanjeBerbe[],
  berbaIds: string[],
  pocetniTankId: string,
  prozorOd: Date,
  prozorDo: Date
): Segment[] {
  return berbaIds
    .flatMap((b) => segmentiIzTanka(kretanja, b, pocetniTankId, prozorOd, prozorDo))
    .sort(
      (a, b) =>
        ms(a.od) - ms(b.od) ||
        a.tankId.localeCompare(b.tankId) ||
        a.berbaId.localeCompare(b.berbaId)
    );
}

/**
 * Susjedni segmenti iste berbe u istom tanku spojeni u jedan boravak.
 *
 * Za prikaz i za citanje temperature nije vazno da je kolicina pala s 4.800 na
 * 4.300, nego da je vino bilo u T10 od 24. do 28.08. Kolicina se cuva kao
 * raspon, pa se ne gubi ni ne izmislja.
 */
export function spojiSusjedne(segmenti: Segment[]): Boravak[] {
  const poredani = segmenti
    .slice()
    .sort(
      (a, b) =>
        a.berbaId.localeCompare(b.berbaId) ||
        a.tankId.localeCompare(b.tankId) ||
        ms(a.od) - ms(b.od)
    );

  const boravci: Boravak[] = [];

  for (const s of poredani) {
    const zadnji = boravci[boravci.length - 1];
    const nastavak =
      zadnji &&
      zadnji.berbaId === s.berbaId &&
      zadnji.tankId === s.tankId &&
      ms(zadnji.do) === ms(s.od);

    if (nastavak) {
      zadnji.do = s.do;
      zadnji.litreDo = s.litre;
      zadnji.mijenjalaSe = zadnji.mijenjalaSe || zadnji.litreOd !== s.litre;
      zadnji.segmenata++;
      zadnji.otvoren = s.otvoren;
      continue;
    }

    boravci.push({
      berbaId: s.berbaId,
      tankId: s.tankId,
      od: s.od,
      do: s.do,
      litreOd: s.litre,
      litreDo: s.litre,
      mijenjalaSe: false,
      segmenata: 1,
      otvoren: s.otvoren,
    });
  }

  return boravci.sort((a, b) => ms(a.od) - ms(b.od) || a.tankId.localeCompare(b.tankId));
}

// ---------------------------------------------------------------------------
// Citanje iz baze — dva upita, broj ne raste s podacima
// ---------------------------------------------------------------------------

type Redak = {
  berbaId: string;
  izTankId: string | null;
  uTankId: string | null;
  ml: number;
  dogodenoAt: Date;
};

function uKretanje(r: Redak): KretanjeBerbe {
  return {
    berbaId: r.berbaId,
    izTankId: r.izTankId,
    uTankId: r.uTankId,
    ml: Number(r.ml),
    dogodenoAt: r.dogodenoAt,
  };
}

/** Svi redci knjige za zadane berbe — jedan upit. */
export async function citajKretanjaBerbi(
  db: CitacProzora,
  berbaIds: string[]
): Promise<KretanjeBerbe[]> {
  if (berbaIds.length === 0) return [];

  const redci = await db.$queryRaw<Redak[]>`
    SELECT k."berbaId", k."izTankId", k."uTankId",
           ROUND(k.litre::numeric * 1000)::float8 AS ml,
           k."dogodenoAt"
    FROM "BerbaKretanje" k
    WHERE k."berbaId" = ANY(${berbaIds})
    ORDER BY k."dogodenoAt" ASC
  `;

  return redci.map(uKretanje);
}

/** Redci koji diraju jedan tank do zadanog trenutka — da se vidi koje su berbe u njemu. */
async function citajKretanjaTanka(
  db: CitacProzora,
  tankId: string,
  doTrenutka: Date
): Promise<KretanjeBerbe[]> {
  const redci = await db.$queryRaw<Redak[]>`
    SELECT k."berbaId", k."izTankId", k."uTankId",
           ROUND(k.litre::numeric * 1000)::float8 AS ml,
           k."dogodenoAt"
    FROM "BerbaKretanje" k
    WHERE (k."uTankId" = ${tankId} OR k."izTankId" = ${tankId})
      AND k."dogodenoAt" <= ${doTrenutka}
    ORDER BY k."dogodenoAt" ASC
  `;

  return redci.map(uKretanje);
}

export type RezultatProzora = {
  /** Berbe koje su u POCETNOM tanku bile na pocetku — to je vino ove fermentacije. */
  berbaIds: string[];
  /** Kolicina svake od njih na pocetku, u litrama. */
  pocetneLitre: Map<string, number>;
  segmenti: Segment[];
  boravci: Boravak[];
  /** Stvarni kraj prozora — `krajAt`, ili `sada` kad fermentacija jos traje. */
  prozorDo: Date;
  /** Tankovi kroz koje je vino proslo, redom pojavljivanja. */
  tankovi: string[];
};

/**
 * Prozor jedne fermentacije: koje vino, i gdje je bilo od pocetka do kraja.
 *
 * TOCNO DVA UPITA, bez obzira na broj berbi i segmenata:
 *   1. redci koji diraju pocetni tank do `pocetakAt` — koje su berbe u njemu,
 *   2. svi redci tih berbi — kamo su dalje otisle.
 *
 * `sada` se predaje izvana i ne cita se iz sata unutar funkcije: tako je
 * rezultat ponovljiv i skripta ga moze provjeriti.
 */
export async function prozorFermentacije(
  db: CitacProzora,
  prozor: Prozor,
  sada: Date
): Promise<RezultatProzora> {
  const prozorDo = prozor.krajAt ?? sada;

  const kretanjaTanka = await citajKretanjaTanka(db, prozor.tankId, prozor.pocetakAt);
  const naPocetku = berbeUTanku(kretanjaTanka, prozor.tankId, prozor.pocetakAt);

  const berbaIds = [...naPocetku.keys()].sort(
    (a, b) => (naPocetku.get(b) ?? 0) - (naPocetku.get(a) ?? 0) || a.localeCompare(b)
  );

  if (berbaIds.length === 0) {
    return {
      berbaIds: [],
      pocetneLitre: new Map(),
      segmenti: [],
      boravci: [],
      prozorDo,
      tankovi: [],
    };
  }

  const kretanja = await citajKretanjaBerbi(db, berbaIds);
  const segmenti = sloziSegmente(kretanja, berbaIds, prozor.tankId, prozor.pocetakAt, prozorDo);
  const boravci = spojiSusjedne(segmenti);

  const tankovi: string[] = [];
  for (const s of segmenti) if (!tankovi.includes(s.tankId)) tankovi.push(s.tankId);

  const pocetneLitre = new Map<string, number>();
  for (const [berbaId, mlv] of naPocetku) pocetneLitre.set(berbaId, uLitre(mlv));

  return { berbaIds, pocetneLitre, segmenti, boravci, prozorDo, tankovi };
}
