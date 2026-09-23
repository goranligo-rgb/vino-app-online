/**
 * TABLICA BERBE — filtriranje, sortiranje, grupiranje i zbrojevi.
 * ======================================================================
 *
 * Bez Reacta i bez Prisme: isti kod zove stranica /berba i izvoz u Excel
 * (`POST /api/berba/export`). Izvoz obecaje "ono sto je na ekranu", a to je
 * istina samo ako obje strane racunaju JEDNOM funkcijom.
 *
 * PONDERIRANO PO KILOGRAMIMA
 * --------------------------
 * Secer, kiseline i pH su prosjek ponderiran kilogramima grozdja: berba od
 * 8.000 kg nosi vise od berbe od 300 kg. U prosjek ulazi samo zapis koji ima
 * I vrijednost I kilograme (> 0). Zapis bez kg nema tezinu — ne broji se kao
 * nula i ne dobiva izmisljenu tezinu — ali njegove litre ulaze u zbroj litara.
 * Uz svaki prosjek ide `n od od`, da se vidi koliko ga podaci pokrivaju.
 *
 * RANDMAN u zbroju je Σ L / Σ kg × 100, samo nad zapisima koji imaju kg. To
 * NIJE prosjek randmana po retku — prosjek omjera tezi malim berbama.
 */

/** Zapis kako ga stranica dobiva iz `/api/berba` (datumi su ISO tekst). */
export type RedakBerbe = {
  id: string;
  vrstaUnosa: "BERBA" | "ZATECENO";
  nazivSorte: string;
  sortaId: string | null;

  datumBerbe: string | null;
  datumUlaska: string | null;

  godina: number | null;
  godinaUpisana: number | null;
  godinaIzvedena: boolean;

  kolicinaLitara: number;
  kolicinaKgGrozdja: number | null;

  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;

  secer: number | null;
  kiseline: number | null;
  ph: number | null;

  maceracija: boolean | null;
  maceracijaSati: number | null;

  /** NULL = ne zna se cije je grozdje. `false` = kooperantsko. */
  vlastitaBerba: boolean | null;
  /** Cisto vrijeme branja, bez prijevoza i pauza. */
  pocetakBranja: string | null;
  krajBranja: string | null;
  brojBeraca: number | null;

  napomena: string | null;
  ispravljenoAt: string | null;
  razlogIspravka: string | null;

  prviTankId: string | null;
  prviTankBroj: number | null;
  tankovi: Array<{ tankId: string; broj: number | null; litre: number }>;
  izvornaPunjenjeStavkaId: string | null;
};

// ---------------------------------------------------------------------------
// Godina
// ---------------------------------------------------------------------------

export const BEZ_GODISTA = "bez-godista";

/** Kljuc godine za filtar. Zapis bez godine ima vlastitu ladicu, ne ispada. */
export function kljucGodine(b: RedakBerbe): string {
  return b.godina == null ? BEZ_GODISTA : String(b.godina);
}

// ---------------------------------------------------------------------------
// Zbrojevi
// ---------------------------------------------------------------------------

/**
 * Prosjek uvijek nosi `n` — iz koliko je zapisa izracunat.
 *
 * Bez toga prosjek nad dva zapisa izgleda jednako pouzdano kao nad dvjesto.
 */
export type Prosjek = {
  vrijednost: number | null;
  /** Koliko zapisa ima i vrijednost i kilograme — samo oni nose tezinu. */
  n: number;
  /** Koliko ih je ukupno u skupu. */
  od: number;
};

export type Sazetak = {
  zapisa: number;
  sorte: number;
  litara: number;
  kg: number;
  /** Σ L / Σ kg × 100, samo nad zapisima s kg. */
  randman: Prosjek;
  secer: Prosjek;
  kiseline: Prosjek;
  ph: Prosjek;
};

function imaKg(z: RedakBerbe): boolean {
  return z.kolicinaKgGrozdja != null && z.kolicinaKgGrozdja > 0;
}

/** Prosjek polja ponderiran kilogramima. Zapis bez kg ne ulazi. */
export function ponderiraniProsjek(
  zapisi: RedakBerbe[],
  polje: "secer" | "kiseline" | "ph"
): Prosjek {
  let tezina = 0;
  let zbroj = 0;
  let n = 0;

  for (const z of zapisi) {
    const v = z[polje];
    if (v == null || !imaKg(z)) continue;
    const kg = z.kolicinaKgGrozdja as number;
    zbroj += v * kg;
    tezina += kg;
    n++;
  }

  return {
    vrijednost: tezina > 0 ? zbroj / tezina : null,
    n,
    od: zapisi.length,
  };
}

export function izracunajSazetak(zapisi: RedakBerbe[]): Sazetak {
  const sKg = zapisi.filter(imaKg);
  const kgSKg = sKg.reduce((s, z) => s + (z.kolicinaKgGrozdja as number), 0);
  const litaraSKg = sKg.reduce((s, z) => s + (z.kolicinaLitara || 0), 0);

  return {
    zapisa: zapisi.length,
    sorte: new Set(zapisi.map((z) => z.nazivSorte).filter(Boolean)).size,
    litara: zapisi.reduce((s, z) => s + (z.kolicinaLitara || 0), 0),
    kg: zapisi.reduce((s, z) => s + (z.kolicinaKgGrozdja || 0), 0),
    randman: {
      vrijednost: kgSKg > 0 ? (litaraSKg / kgSKg) * 100 : null,
      n: sKg.length,
      od: zapisi.length,
    },
    secer: ponderiraniProsjek(zapisi, "secer"),
    kiseline: ponderiraniProsjek(zapisi, "kiseline"),
    ph: ponderiraniProsjek(zapisi, "ph"),
  };
}

/** Randman jednog retka, L na 100 kg. Bez kg nema randmana. */
export function randmanRetka(z: RedakBerbe): number | null {
  return imaKg(z) ? (z.kolicinaLitara / (z.kolicinaKgGrozdja as number)) * 100 : null;
}

// ---------------------------------------------------------------------------
// Datum — hrvatski kalendarski dan
// ---------------------------------------------------------------------------

const DAN_ZAGREB = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zagreb",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * "2026-09-12" — dan berbe u Zagrebu. `datumBerbe` je timestamptz, pa bi
 * `slice(0, 10)` nad UTC tekstom berbu upisanu u ponoc stavio u prethodni dan.
 */
export function danBerbe(z: RedakBerbe): string | null {
  if (!z.datumBerbe) return null;
  const d = new Date(z.datumBerbe);
  return Number.isNaN(d.getTime()) ? null : DAN_ZAGREB.format(d);
}

/** "12.09.2026." iz "2026-09-12". */
export function prikazDana(dan: string): string {
  const [y, m, d] = dan.split("-");
  return `${d}.${m}.${y}.`;
}

// ---------------------------------------------------------------------------
// Filtar, sortiranje, grupiranje
// ---------------------------------------------------------------------------

export type Stupac =
  | "datum"
  | "sorta"
  | "polozaj"
  | "kg"
  | "litre"
  | "randman"
  | "secer"
  | "kiseline"
  | "ph"
  | "maceracija"
  | "oznaka";

export const STUPCI: Stupac[] = [
  "datum",
  "sorta",
  "polozaj",
  "kg",
  "litre",
  "randman",
  "secer",
  "kiseline",
  "ph",
  "maceracija",
  "oznaka",
];

export type Smjer = "asc" | "desc";

export type Grupiranje = "nista" | "datum" | "sorta" | "polozaj";

export const GRUPIRANJA: Grupiranje[] = ["nista", "datum", "sorta", "polozaj"];

/**
 * "Graševina" -> "grasevina". Na mobitelu se kvacice cesto ne tipkaju, pa
 * "grase" mora naci Graševinu. `đ` se ne rastavlja kroz NFD, zato posebno.
 */
function bezKvacica(s: string): string {
  return s
    .toLocaleLowerCase("hr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/** Trazilica: samo sorta i polozaj, bez obzira na velika slova i kvacice. */
export function filtrirajTekst(zapisi: RedakBerbe[], tekst: string): RedakBerbe[] {
  const t = bezKvacica(tekst.trim());
  if (!t) return zapisi;
  return zapisi.filter((z) =>
    bezKvacica([z.nazivSorte, z.polozaj].filter(Boolean).join(" ")).includes(t)
  );
}

const USPOREDBA_TEKSTA = new Intl.Collator("hr", { numeric: true, sensitivity: "base" });

/** Vrijednost po kojoj se sortira. `null` = nema podatka, uvijek na dno. */
function vrijednostZaSort(z: RedakBerbe, s: Stupac): string | number | null {
  switch (s) {
    case "datum":
      return danBerbe(z);
    case "sorta":
      return z.nazivSorte || null;
    case "polozaj":
      return z.polozaj?.trim() || null;
    case "kg":
      return z.kolicinaKgGrozdja;
    case "litre":
      return z.kolicinaLitara;
    case "randman":
      return randmanRetka(z);
    case "secer":
      return z.secer;
    case "kiseline":
      return z.kiseline;
    case "ph":
      return z.ph;
    case "maceracija":
      // ne < da; unutar "da" po satima. NULL ("nije se pitalo") na dno.
      return z.maceracija == null ? null : z.maceracija ? 1 + (z.maceracijaSati ?? 0) : 0;
    case "oznaka":
      return z.oznakaBerbe?.trim() || null;
  }
}

function usporedi(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return USPOREDBA_TEKSTA.compare(String(a), String(b));
}

/**
 * Sortiranje po stupcu. Prazno je UVIJEK na dnu, u oba smjera — inace bi
 * "obrni" izbacio sve zapise bez podatka na vrh tablice.
 */
export function sortiraj(zapisi: RedakBerbe[], stupac: Stupac, smjer: Smjer): RedakBerbe[] {
  const znak = smjer === "asc" ? 1 : -1;
  return [...zapisi].sort((x, y) => {
    const a = vrijednostZaSort(x, stupac);
    const b = vrijednostZaSort(y, stupac);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return znak * usporedi(a, b);
  });
}

export type Grupa = {
  kljuc: string;
  naziv: string;
  zapisi: RedakBerbe[];
};

const BEZ = "\u0000bez";

function kljucGrupe(z: RedakBerbe, po: Exclude<Grupiranje, "nista">): string {
  if (po === "datum") return danBerbe(z) ?? BEZ;
  if (po === "sorta") return z.nazivSorte?.trim() || BEZ;
  return z.polozaj?.trim() || BEZ;
}

function nazivGrupe(kljuc: string, po: Exclude<Grupiranje, "nista">): string {
  if (kljuc === BEZ) {
    return po === "datum" ? "bez datuma berbe" : po === "sorta" ? "bez sorte" : "bez položaja";
  }
  return po === "datum" ? prikazDana(kljuc) : kljuc;
}

/**
 * Grupe, redom. Zapisi unutar grupe zadrzavaju poredak koji im je dan (zato
 * se sortira PRIJE grupiranja).
 *
 * Poredak grupa: ako se sortira po istom stupcu po kojem se grupira, grupe
 * prate taj smjer; inace idu uzlazno (datum kronoloski, tekst abecedno).
 * "bez …" je odsutnost podatka i uvijek je zadnja.
 */
export function grupiraj(
  zapisi: RedakBerbe[],
  po: Grupiranje,
  stupac: Stupac,
  smjer: Smjer
): Grupa[] {
  if (po === "nista") return [{ kljuc: "sve", naziv: "", zapisi }];

  const mapa = new Map<string, RedakBerbe[]>();
  for (const z of zapisi) {
    const k = kljucGrupe(z, po);
    const lista = mapa.get(k);
    if (lista) lista.push(z);
    else mapa.set(k, [z]);
  }

  const znak = stupac === po && smjer === "desc" ? -1 : 1;

  return [...mapa.entries()]
    .sort(([a], [b]) => {
      if (a === BEZ) return 1;
      if (b === BEZ) return -1;
      return znak * USPOREDBA_TEKSTA.compare(a, b);
    })
    .map(([kljuc, z]) => ({ kljuc, naziv: nazivGrupe(kljuc, po), zapisi: z }));
}

/**
 * Nad cim se racunaju podzbroj i podnozje: oznaceni, ako je ista oznaceno
 * medju prikazanima — inace svi prikazani.
 */
export function zaZbroj(
  zapisi: RedakBerbe[],
  oznaceni: ReadonlySet<string>,
  imaOznacenih: boolean
): RedakBerbe[] {
  return imaOznacenih ? zapisi.filter((z) => oznaceni.has(z.id)) : zapisi;
}

// ---------------------------------------------------------------------------
// Postavke — sto stranica salje izvozu
// ---------------------------------------------------------------------------

export type PostavkeTablice = {
  godina: string;
  zateceno: boolean;
  tekst: string;
  grupiraj: Grupiranje;
  stupac: Stupac;
  smjer: Smjer;
  /** Prazno = nista nije oznaceno. */
  oznaceni: string[];
};

/**
 * Prikazani zapisi, sortirani: vrsta (zateceno po prekidacu) → godina →
 * trazilica → sortiranje. Stranica i izvoz zovu ovo isto.
 */
export function prikazaniZapisi(sve: RedakBerbe[], p: PostavkeTablice): RedakBerbe[] {
  const podloga = p.zateceno ? sve : sve.filter((z) => z.vrstaUnosa === "BERBA");
  const uGodini = p.godina ? podloga.filter((z) => kljucGodine(z) === p.godina) : podloga;
  return sortiraj(filtrirajTekst(uGodini, p.tekst), p.stupac, p.smjer);
}
