/**
 * Jedan redak izvoza podruma u Excel — sadrzaj celija, bez oblikovanja.
 *
 * ZASTO IZVAN RUTE: `app/api/izvoz/podrum/route.ts` se ne da pokrenuti izvan
 * zahtjeva (cita sesiju iz kolacica), pa bi se sadrzaj celija mogao provjeriti
 * samo prepisivanjem u skriptu — a prepisana provjera potvrduje prijepis, ne
 * izvoz. Ovdje je racun na jednom mjestu: ruta ga zove, skripta ga zove.
 *
 * SAMO PRETVORBA. Nijedan upit, nijedan datum "sada", nikakvo stanje — ulaz je
 * gotova `Kartica` iz `sloziKartice`.
 *
 * STO OVDJE NAMJERNO NE ULAZI: oznake porijekla (vlastito / blend / knjiga),
 * kucice i grafovi. To je za papir i ekran; u tablici bi smetalo sortiranju.
 */

import { opisPopisa } from "@/lib/kvasci";
import { zagrebYMD } from "@/lib/preparat-stanje";
import type { Kartica } from "@/app/dashboard/izvjestaji/podrum/model";

/**
 * Redoslijed i kljucevi stupaca. Ruta iz ovoga NE gradi zaglavlje — naslovi i
 * sirine su njezini — ali kljucevi moraju biti isti, pa stoje ovdje uz racun.
 */
export type RedakIzvoza = {
  broj: number;
  kolicina: number;
  kapacitet: number;
  sorta: string | null;
  sastav: string | null;
  kiselina: number | null;
  secer: number | null;
  alkohol: number | null;
  ph: number | null;
  so2Slobodni: number | null;
  so2Ukupni: number | null;
  mjereno: Date | null;
  kvasac: string | null;
  napomena: string | null;
};

/**
 * Prazan tekst je `null`, ne `""`.
 *
 * Izmjereno na gotovoj datoteci: prazan string je u Excelu CELIJA S TEKSTOM
 * duljine nula, pa je filtar "Blanks" ne nade i `COUNTBLANK` je ne broji.
 * Stupac "Napomena" bi tako bio neupotrebljiv za ono cemu sluzi — izdvajanje
 * tankova koji napomenu imaju.
 */
function tekst(s: string): string | null {
  return s.trim() === "" ? null : s;
}

/**
 * Postotak sorte: isti format kao na kartici (`broj(s.postotak, 1)`).
 * Cijeli sastav ide u JEDNU celiju — tablica ima jedan redak po tanku.
 */
export function opisSastava(k: Kartica): string {
  return k.sastavSvi
    .map(
      (s) =>
        `${s.naziv} ${s.postotak.toLocaleString("hr-HR", {
          maximumFractionDigits: 1,
        })} %`
    )
    .join(" · ");
}

/**
 * Kvasci u jednoj celiji, s udjelima — `opisPopisa` iz lib/kvasci.ts.
 *
 * `sloziKartice` rastavi `PopisKvasaca` na dva polja kartice, pa se ovdje
 * slaze natrag. `vecinski` je nepotreban (od njega se racuna samo dan
 * fermentacije) i ne ulazi u ispis.
 */
export function opisKvasaca(k: Kartica): string {
  return opisPopisa({
    stavke: k.kvasci,
    bezZapisaPostotak: k.kvasciBezZapisa,
    vecinski: null,
  });
}

/**
 * NAPOMENA — samo ono sto je PROCJENA, nista drugo.
 *
 * U ovim podacima postoji tocno jedna: kvasac pripisan PO BERBENOJ PARTIJI,
 * kad u tanku nema zapisa o dodavanju. Nazivnik je tada cijela berbena sarza,
 * pa su postotci sustavno nizi nego kod racuna po trenutku pretoka i ne smiju
 * se citati kao ista mjera (vidi `StavkaKvasca.poPartiji`).
 *
 * Parametri (kiselina, secer, alkohol, pH, SO2) OVDJE NISU procjene: izvjestaj
 * podruma ih uzima iskljucivo iz `Mjerenje` samog tanka i nikad ne nadopunjava
 * prosjekom blenda — to radi samo stranica tanka. Kad se to promijeni, napomena
 * mora dobiti i taj slucaj.
 */
export function napomena(k: Kartica): string {
  const dijelovi: string[] = [];

  if (k.kvasci.some((s) => s.poPartiji)) {
    dijelovi.push("kvasac je procjena po berbenoj partiji");
  }

  if (k.kvasciBezZapisa > 0) {
    dijelovi.push(`bez zapisa o kvascu: ${k.kvasciBezZapisa} % vina`);
  }

  return dijelovi.join(" · ");
}

/**
 * Datum kao PRAVI datum, ne tekst — inace se po stupcu ne moze sortirati.
 *
 * exceljs racuna serijski broj iz `getTime()`, pa se dan gradi kao UTC ponoc
 * hrvatskog kalendarskog dana (isti postupak kao izvoz skladista).
 */
export function danZaExcel(d: Date | null): Date | null {
  if (!d) return null;
  const { y, m, d: dan } = zagrebYMD(d);
  return new Date(Date.UTC(y, m - 1, dan));
}

/**
 * PRAZNO OSTAJE PRAZNO. `null` se u celiju ne upisuje kao nula ni kao crtica:
 * nula bi u filtru "manje od 5" izasla kao da je izmjerena, a crtica bi cijeli
 * stupac pretvorila u tekst i onemogucila sortiranje po broju.
 */
export function redakIzvoza(k: Kartica): RedakIzvoza {
  return {
    broj: k.broj,
    kolicina: k.kolicina,
    kapacitet: k.kapacitet,
    sorta: tekst(k.sorta ?? ""),
    sastav: tekst(opisSastava(k)),
    kiselina: k.ukupneKiseline,
    secer: k.secerGL,
    alkohol: k.alkohol,
    ph: k.ph,
    so2Slobodni: k.slobodniSO2,
    so2Ukupni: k.ukupniSO2,
    mjereno: danZaExcel(k.mjerenoU),
    kvasac: tekst(opisKvasaca(k)),
    napomena: tekst(napomena(k)),
  };
}
