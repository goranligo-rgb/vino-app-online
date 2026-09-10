import { Prisma } from "@prisma/client";

/**
 * SAT KNJIGE — koji trenutak vrijedi za jedan redak `BerbaKretanje`.
 * ======================================================================
 *
 * Knjiga je do sada odgovarala samo na pitanje "sto je u tanku SADA": svaki
 * citac zbrajao je sve retke, bez obzira kad su nastali. Cim se pita "sto je
 * bilo u tanku 21.08. u 14:30" — a to pita svako mjerenje, jer je mjerenje
 * stanje smjese u trenutku — treba sat, i mora biti JEDAN.
 *
 * ZASTO NI `dogodenoAt` NI `createdAt` SAM
 * ----------------------------------------
 * `dogodenoAt` je za pretok prava vremenska oznaka, ali za punjenje i izlaz
 * datum IZ FORME: covjek datira unatrag. Danas je takvih redaka 202 od 577.
 * Citano samo po `dogodenoAt`, ULAZ pada IZA radnje nastale u istoj
 * transakciji i lanac zakljuci da je tank bio prazan.
 *
 * `createdAt` sam po sebi je jednako los: backfill knjige (26.08.2026) upisao
 * je 174 povijesna retka u istoj minuti, pa bi kronologija cijele sezone
 * propala.
 *
 * Uzima se ONO STO JE RANIJE — najraniji trenutak za koji se zna da je
 * kretanje postojalo. Za zivi upis to je vrijeme upisa (tocno), za unatrag
 * datiran unos isto (tocno), za backfillan redak `dogodenoAt` (tocno).
 *
 * Pravilo NIJE novo: `lib/vino-lanac.ts` ga je uveo za lanac radnji i ondje
 * je prezivio backfill 279 radnji. Ovdje je samo izvucen na jedno mjesto i
 * dobio SQL parnjaka, da JS i baza ne bi mogli imati dva razlicita sata.
 */

/** Trenutak jednog kretanja, u milisekundama. Sat za JavaScript. */
export function satKretanja(k: {
  dogodenoAt: Date;
  createdAt: Date;
}): number {
  return Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
}

/**
 * Isti sat, izrazen u SQL-u. Pise se `LEAST`, ne `CASE`, jer oba stupca imaju
 * `NOT NULL` pa nema treceg ishoda.
 *
 * `alias` je ime tablice u upitu i UVIJEK je konstanta iz koda — nikad
 * korisnicki unos. Zato smije ici kroz `Prisma.raw`.
 */
export function satSQL(alias = "k"): Prisma.Sql {
  return Prisma.raw(`LEAST(${alias}."dogodenoAt", ${alias}."createdAt")`);
}

/**
 * Uvjet "do ovog trenutka, ukljucivo", spreman za umetanje u `WHERE`.
 *
 * Bez trenutka vraca PRAZAN fragment — upit je tada znak za znak jednak
 * onome prije ovog modula, pa "sada" ne postaje poseban slucaj koji se moze
 * razici od "tada".
 *
 * Granica je UKLJUCIVA (`<=`): mjerenje upisano u istoj sekundi kad je vino
 * uslo mjerilo je vino koje je vec bilo unutra. Suprotno bi punjenje i njegovo
 * pocetno mjerenje razdvojilo na dvije strane granice.
 */
export function doTrenutkaSQL(
  trenutak: Date | null | undefined,
  alias = "k"
): Prisma.Sql {
  if (!trenutak) return Prisma.empty;

  return Prisma.sql` AND ${satSQL(alias)} <= ${trenutak} `;
}
