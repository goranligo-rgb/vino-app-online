/**
 * Normalizacija neobaveznih polja berbe PRIJE slanja na /api/punjenje.
 *
 * Zasto postoji: `Number("")` je 0, a `Number.isFinite(0)` je true — pa
 * postojeci `parseBroj` iz forme na prazno polje vraca **0**, ne null. Za
 * litre je to bezopasno (0 pada na validaciji), ali za secer, kiseline, pH i
 * godinu berbe bi znacilo da prazno polje zavrsi u bazi kao izmjerena nula.
 * U izvjestaju o berbi to nije "nije se mjerilo" nego "izmjereno 0" — i ulazi
 * u prosjeke.
 *
 * Zato: prazno, sami razmaci i neparsabilno -> null. Nikad 0, nikad "".
 * Upisana nula ("0") je i dalje nula — to je podatak, ne praznina.
 *
 * API radi istu normalizaciju na svojoj strani (`ocistiString`, `brojIliNull`
 * u app/api/punjenje/route.ts). Ovo je drugi pojas, ne zamjena za taj —
 * klijent ne smije poslati 0 koji API nema kako razlikovati od upisane nule.
 */

/** Tekstualno polje: trimano, prazno -> null. */
export function tekstIliNull(vrijednost: string | null | undefined): string | null {
  if (vrijednost == null) return null;
  const cisto = String(vrijednost).trim();
  return cisto === "" ? null : cisto;
}

/**
 * Brojcano polje: prazno ili neparsabilno -> null, inace broj.
 * Prihvaca i decimalni zarez ("3,4" -> 3.4) jer tipkovnica na mobitelu u
 * hrvatskom rasporedu nudi zarez.
 */
export function brojIliNull(vrijednost: string | null | undefined): number | null {
  const cisto = tekstIliNull(vrijednost);
  if (cisto === null) return null;

  const broj = Number(cisto.replace(",", "."));
  return Number.isFinite(broj) ? broj : null;
}

/**
 * Datum iz <input type="date">: prazno -> null, inace "YYYY-MM-DD" kakav jest.
 *
 * NAMJERNO se ne pretvara u Date ni u ISO — salje se goli "YYYY-MM-DD", jer
 * ECMAScript takav oblik parsira kao UTC ponoc, pa datum ostaje tocan u
 * Hrvatskoj (UTC+1/+2). Suprotno tome, `datumPunjenja` ide kao datum-vrijeme
 * bez zone ("2026-08-21T12:53"), sto se parsira kao LOKALNO vrijeme servera
 * (UTC na Vercelu) i daje pomak od +2 h. Taj pomak se rjesava u fazi 5 i ovdje
 * se NE dira.
 */
export function datumIliNull(vrijednost: string | null | undefined): string | null {
  const cisto = tekstIliNull(vrijednost);
  if (cisto === null) return null;

  // <input type="date"> uvijek daje "YYYY-MM-DD"; sve drugo je smece iz
  // rucnog upisa ili autofilla i ne salje se dalje.
  return /^\d{4}-\d{2}-\d{2}$/.test(cisto) ? cisto : null;
}

/** Danasnji datum za <input type="date">, po LOKALNOM satu preglednika. */
export function danasZaDateInput(sada: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Namjerno NE toISOString(): on prevodi u UTC, pa bi navecer poslije 22:00
  // (ljeti) vratio sutrasnji datum.
  return `${sada.getFullYear()}-${pad(sada.getMonth() + 1)}-${pad(sada.getDate())}`;
}

/** Godina iz "YYYY-MM-DD"; prazno ili neispravno -> null. */
export function godinaIzDatuma(datum: string | null | undefined): number | null {
  const cisto = datumIliNull(datum);
  if (cisto === null) return null;

  const godina = Number(cisto.slice(0, 4));
  return Number.isFinite(godina) ? godina : null;
}

/**
 * Maceracija u citljivom obliku, iz dva polja PunjenjeStavka.
 *
 * Tri stanja daju tri razlicita ishoda, i to je cijela poanta:
 *   null   -> null   (nije se pitalo — pozivatelj ne prikazuje nista)
 *   false  -> "ne"
 *   true   -> "da" ili "da — 3 sata"
 *
 * Zivi ovdje, a ne u komponenti, jer isti tekst treba na monitoru tanka i u
 * pregledu berbe; dvije kopije bi se razisle prvom izmjenom.
 */
export function opisMaceracije(
  maceracija: boolean | null | undefined,
  sati: number | null | undefined
): string | null {
  if (maceracija == null) return null;
  if (!maceracija) return "ne";
  if (sati == null || !Number.isFinite(Number(sati))) return "da";
  return `da — ${formatSati(Number(sati))}`;
}

/**
 * "1 sat", "3 sata", "12 sati", "1,5 sata".
 *
 * Hrvatska sklonidba ide po ZADNJOJ znamenki, uz iznimku za 11-14 ("11 sati",
 * ne "11 sat"). Decimalni broj uvijek ide s "sata" ("1,5 sata").
 */
export function formatSati(v: number): string {
  const broj = Number(v);

  if (!Number.isInteger(broj)) {
    return `${broj.toLocaleString("hr-HR", { maximumFractionDigits: 2 })} sata`;
  }

  const zadnja = Math.abs(broj) % 10;
  const zadnjeDvije = Math.abs(broj) % 100;

  const rijec =
    zadnja === 1 && zadnjeDvije !== 11
      ? "sat"
      : zadnja >= 2 && zadnja <= 4 && (zadnjeDvije < 12 || zadnjeDvije > 14)
        ? "sata"
        : "sati";

  return `${broj} ${rijec}`;
}
