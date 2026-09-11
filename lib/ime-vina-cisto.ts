/**
 * CISTI DIO lib/ime-vina.ts — bez ijedne ovisnosti.
 *
 * Postoji zato sto obrazac imenovanja (app/tankovi/[id]/imenuj-vino.tsx) treba
 * ISTU usporedbu deklarirane sorte s knjigom dok covjek tipka, a lib/ime-vina.ts
 * preko lib/granica-vina.ts vuce `@prisma/client`, koji ne smije u paket
 * preglednika. Pravilo stoji ovdje JEDNOM; lib/ime-vina.ts ga samo prosljeduje,
 * pa stranica tanka, izvjestaj i obrazac ne mogu presuditi razlicito.
 */

/** Prazan string iz obrasca je isto sto i „nije upisano". */
export function ocisti(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * DEKLARIRANA SORTA NAPRAMA STVARNOM SASTAVU — dvije tvrdnje o istom vinu.
 *
 * Deklarirana sorta je ono sto bi pisalo na etiketi i upisuje ju covjek ili
 * cin koji je vino premjestio. Stvarni sastav se IZVODI iz knjige pri svakom
 * prikazu. Smiju se razlikovati — cuvée se zove „Cuvée bijeli" i to nije
 * greska — pa ekran mora pokazati OBOJE, a ne birati jedno.
 *
 * RAZILAZENJE SE TVRDI SAMO KAD JE NEDVOSMISLENO: kad je vino po knjizi
 * praktički jednosortno (jedna sorta drzi bar `PRAG_JEDNOSORTNO` posto), a
 * deklarirana sorta imenuje nesto drugo. Za pravi blend se nista ne tvrdi —
 * „Cuvée" naprama cetiri sorte nije nesklad nego opis.
 *
 * Usporedjuje se bez obzira na velicina slova, ali se NE normaliziraju
 * tipfeleri ni obrnut red rijeci („Rajnski riesling" naprama „Rajnski
 * rizling", „Zeleni veltlinac" naprama „Veltlinac zeleni"). To je odluka
 * vlasnika: takvi se popravljaju rukom, a dotle je posteno da se vide.
 */
export const PRAG_JEDNOSORTNO = 95;

export type UsporedbaSorte = {
  deklarirana: string | null;
  /** Sorta koja u knjizi drzi najveci udio, ako je vino jednosortno. */
  glavna: string | null;
  glavniPostotak: number | null;
  /** `true` samo kad je nesklad nedvojben — vidi biljesku iznad. */
  razilazi: boolean;
};

export function usporediSaSastavom(
  deklarirana: string | null | undefined,
  sastav: ReadonlyArray<{ nazivSorte: string; postotak: number; nepoznata?: boolean }>
): UsporedbaSorte {
  const d = ocisti(deklarirana);
  const poznate = sastav.filter((s) => !s.nepoznata);
  const najveca = [...poznate].sort((a, b) => b.postotak - a.postotak)[0];

  if (!najveca || najveca.postotak < PRAG_JEDNOSORTNO) {
    return { deklarirana: d, glavna: null, glavniPostotak: null, razilazi: false };
  }

  return {
    deklarirana: d,
    glavna: najveca.nazivSorte,
    glavniPostotak: najveca.postotak,
    razilazi:
      d != null &&
      d.toLowerCase() !== najveca.nazivSorte.toLowerCase(),
  };
}
