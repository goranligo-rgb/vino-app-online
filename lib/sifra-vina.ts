/**
 * INTERNA SIFRA VINA — cisti dio, bez ijedne ovisnosti.
 * ======================================================================
 *
 * Oblik: prefiks-MMGG-broj, npr. `11-0926-3` = treca Graševina nastala u
 * rujnu 2026. Stoji na `ImeVina.sifra` i zamrznuta na `SnimkaVina.sifra`.
 *
 * Bez ovisnosti iz istog razloga kao lib/ime-vina-cisto.ts: obrazac u
 * pregledniku mora sifru sloziti i provjeriti po ISTOM pravilu kao posluzitelj,
 * a lib/ime-vina.ts vuce `@prisma/client`.
 *
 * ODLUKE VLASNIKA (30.09.2026.):
 *
 * - Sifra se upisuje RUKOM, ne izvodi. MMGG je mjesec NASTANKA vina, ne upisa:
 *   za zateceno vino granica laze (T44 je Cabernet 2023, a granica mu je
 *   06/2026, kad je unesen kroz simuliranu berbu).
 * - Broj tece po prefiks+MMGG: `11-0926-1`, `11-0926-2`, pa `11-1026-1`.
 * - NIJE JEDINSTVENA. Vino razdvojeno u dvije prazne posude je jedno vino i
 *   nosi istu sifru. Obrazac upozorava na duplikat i predlaze sljedeci broj;
 *   baza ne brani (brava pokriva tank, ne brojac).
 * - 49 je za vino kojem SASTAV ne znamo — ne za sortu koje nema na popisu.
 *   Sorta koje nema dobiva svoj prefiks.
 * - Sifra je OZNAKA, ne identitet: motor po njoj ne odlucuje je li u posudi
 *   „drugo vino". To i dalje odlucuje naziv.
 */

export type StavkaSifarnika = { prefiks: string; naziv: string };

/** Redoslijed je redoslijed u padajucem izborniku. */
export const SIFARNIK: readonly StavkaSifarnika[] = [
  { prefiks: "11", naziv: "Graševina" },
  { prefiks: "12", naziv: "Sauvignon" },
  { prefiks: "13", naziv: "Veltlinac zeleni" },
  { prefiks: "14", naziv: "Rajnski rizling" },
  { prefiks: "15", naziv: "Muškat žuti" },
  { prefiks: "16", naziv: "Pinot bijeli" },
  { prefiks: "17", naziv: "Chardonnay" },
  { prefiks: "18", naziv: "Zeleni silvanac" },
  { prefiks: "19", naziv: "Pinot sivi" },
  { prefiks: "21", naziv: "Traminac" },
  { prefiks: "25", naziv: "Cabernet Sauvignon" },
  { prefiks: "44", naziv: "Cuvée" },
  { prefiks: "49", naziv: "Zatečeno, nepoznatog sastava" },
];

export type DijeloviSifre = {
  prefiks: string;
  /** "01".."12" */
  mjesec: string;
  /** Dvije znamenke godine, "26" */
  godina: string;
  broj: number;
};

const OBLIK = /^(\d{2})-(\d{2})(\d{2})-([1-9]\d{0,3})$/;

/** Prazan string iz obrasca je isto sto i „nije upisano". */
function prazno(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Sto ne valja sa sifrom, ili `null` kad valja. Prazna sifra NIJE greska
 * ovdje — je li obavezna odlucuje pozivatelj (cuvée da, rucno imenovanje ne).
 */
export function greskaSifre(sifra: string | null | undefined): string | null {
  const s = prazno(sifra);
  if (s == null) return null;

  const m = OBLIK.exec(s);
  if (!m) {
    return `Šifra „${s}” nije u obliku prefiks-MMGG-broj (npr. 11-0926-3).`;
  }

  const [, prefiks, mjesec] = m;

  if (!SIFARNIK.some((x) => x.prefiks === prefiks)) {
    return `Prefiks ${prefiks} nije u šifarniku.`;
  }

  const mj = Number(mjesec);
  if (mj < 1 || mj > 12) {
    return `Mjesec ${mjesec} u šifri ne postoji.`;
  }

  return null;
}

/** Rastavi ispravnu sifru; neispravna ili prazna daje `null`. */
export function rastaviSifru(sifra: string | null | undefined): DijeloviSifre | null {
  const s = prazno(sifra);
  if (s == null || greskaSifre(s)) return null;

  const [, prefiks, mjesec, godina, broj] = OBLIK.exec(s)!;
  return { prefiks, mjesec, godina, broj: Number(broj) };
}

/** Prefiks-MMGG: dio sifre unutar kojeg tece broj. */
export function korijenSifre(d: Pick<DijeloviSifre, "prefiks" | "mjesec" | "godina">): string {
  return `${d.prefiks}-${d.mjesec}${d.godina}`;
}

export function sloziSifru(d: DijeloviSifre): string {
  return `${korijenSifre(d)}-${d.broj}`;
}

/**
 * Sifra kakva ide u bazu: obrezana, a prazna postaje `null`. Neispravna baca
 * — do ovdje je smije dovesti samo kod koji je zaboravio `greskaSifre`, a
 * tiho upisano smece u sifri bilo bi gore od pada.
 */
export function sifraZaUpis(sifra: string | null | undefined): string | null {
  const s = prazno(sifra);
  const g = greskaSifre(s);
  if (g) throw new Error(g);
  return s;
}

/**
 * Sljedeci slobodan broj za korijen: najveci zauzeti + 1. Rupe se NE
 * popunjavaju — broj koji je netko jednom nosio (pa ga je ispravio) mogao je
 * zavrsiti na etiketi ili u biljeznici.
 */
export function sljedeciBroj(
  korijen: string,
  postojeceSifre: Iterable<string | null | undefined>
): number {
  let najveci = 0;
  for (const s of postojeceSifre) {
    const d = rastaviSifru(s);
    if (d && korijenSifre(d) === korijen) najveci = Math.max(najveci, d.broj);
  }
  return najveci + 1;
}

/**
 * SIFRA NOVOG VINA IZ OBRASCA PRETOKA — trazi je SAMO cuvée.
 *
 * Kod blenda iste sorte sifra putuje s vinom kroz motor (prazan cilj je
 * preuzima od izvora, pun zadrzava svoju — odluka C) i obrazac je ne salje.
 * Ako je ipak stigla, zanemaruje se: tvrdnja koja se ne smije upisati ne smije
 * ni proci do motora, jer bi je `noviIdentitet` prenio dalje.
 *
 * Vraca `sifra: undefined` za vrste koje sifru ne primaju.
 */
export function sifraNovogVinaPretoka(
  tipPretoka: string,
  sifra: unknown
): { sifra: string | undefined; greska: string | null } {
  if (tipPretoka !== "CUVEE") return { sifra: undefined, greska: null };

  const s = typeof sifra === "string" ? prazno(sifra) : null;
  if (s == null) {
    return { sifra: undefined, greska: "Šifra novog vina je obavezna za cuvée." };
  }

  const g = greskaSifre(s);
  return g ? { sifra: undefined, greska: g } : { sifra: s, greska: null };
}

/**
 * SIFRA IZ OBRASCA PUNJENJA — obavezna cim ijedna posuda prima vino prazna
 * (tamo nastaje novo vino); kad su sve pune, obrazac je ne treba i ne salje.
 * Jedno polje po obrascu, ne po tanku: jedna berba u vise tankova je jedno
 * vino i nosi istu sifru (odluka G).
 */
export function sifraObrascaPunjenja(
  imaPraznih: boolean,
  sifra: unknown
): { sifra: string | null; greska: string | null } {
  if (!imaPraznih) return { sifra: null, greska: null };

  const s = typeof sifra === "string" ? prazno(sifra) : null;
  if (s == null) {
    return {
      sifra: null,
      greska: "Šifra vina je obavezna kad se puni prazna posuda.",
    };
  }

  const g = greskaSifre(s);
  return g ? { sifra: null, greska: g } : { sifra: s, greska: null };
}

/**
 * Sifra posude NAKON punjenja: prazna dobiva sifru iz obrasca, puna zadrzava
 * svoju i kad obrazac nosi drugu — dolijevanje ne mijenja sifru (odluka F).
 */
export function sifraNakonPunjenja(arg: {
  bioPrazan: boolean;
  sifraObrasca: string | null;
  sifraPrije: string | null;
}): string | null {
  return arg.bioPrazan ? arg.sifraObrasca : arg.sifraPrije;
}
