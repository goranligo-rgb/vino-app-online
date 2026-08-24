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

// ---------------------------------------------------------------------------
// Pocetno mjerenje iz stavki berbe
// ---------------------------------------------------------------------------

/** Ono sto forma zna o parametrima jedne stavke, vec normalizirano na broj|null. */
export type ParametriStavke = {
  kolicinaLitara: number;
  secer: number | null;
  kiseline: number | null;
  ph: number | null;
  /** "YYYY-MM-DD" ili null — datum berbe te stavke. */
  datumBerbe: string | null;
};

/** Tijelo koje /api/punjenje ocekuje pod `pocetnoMjerenje`. */
export type PocetnoMjerenjeTijelo = {
  secer: number | null;
  /**
   * Kiselina grozdja je UKUPNA kiselina. `hlapiveKiseline` se namjerno ne
   * salju — na mostu ne postoje, a poslati ih kao null bi bilo isto kao ne
   * poslati ih.
   */
  ukupneKiseline: number | null;
  ph: number | null;
  /** ISO ili "YYYY-MM-DD"; API ga parsira s `datumIliNull`. */
  izmjerenoAt: string;
};

/**
 * Prosjek jednog polja PONDERIRAN LITRAMA, samo preko stavki koje to polje
 * stvarno imaju.
 *
 * Prazno polje NE ulazi ni u brojnik ni u nazivnik. Da ulazi kao nula, dvije
 * stavke od kojih je samo jedna izmjerena dale bi pola stvarnog secera — sto
 * je gore od "nema podataka", jer izgleda kao podatak.
 *
 * Stavke bez litara (ili s nulom) se preskacu: bez tezine nemaju sto pridonijeti,
 * a bile bi jedini clan nazivnika ako su jedine s tim poljem -> dijeljenje s 0.
 */
function ponderiraniProsjek(
  stavke: ParametriStavke[],
  kljuc: "secer" | "kiseline" | "ph"
): number | null {
  let zbrojUmnozaka = 0;
  let zbrojTezina = 0;

  for (const s of stavke) {
    const v = s[kljuc];
    const litara = Number(s.kolicinaLitara);

    if (v == null || !Number.isFinite(v)) continue;
    if (!Number.isFinite(litara) || litara <= 0) continue;

    zbrojUmnozaka += v * litara;
    zbrojTezina += litara;
  }

  if (zbrojTezina <= 0) return null;

  // Zaokruzeno na dvije decimale: ponderiranje zna dati 21.799999999999997,
  // a to nije preciznija istina nego 21,8 — samo ruznija.
  return Math.round((zbrojUmnozaka / zbrojTezina) * 100) / 100;
}

/**
 * Sastavi `pocetnoMjerenje` za /api/punjenje iz stavki berbe.
 *
 * Vraca `null` kad NIJEDNA stavka nema nijedan od tri parametra — tada se
 * kljuc uopce ne salje i API ne stvara mjerenje.
 *
 * ZASTO JEDNO MJERENJE, A NE JEDNO PO STAVCI: `PunjenjeTanka.pocetnoMjerenjeId`
 * je jedan FK, a `Mjerenje` ima samo `tankId` — nema kamo zakvaciti drugo.
 * K tome monitor tanka uzima najnoviju vrijednost PO POLJU (`sloziPoPolju`),
 * pa bi dva mjerenja s istim trenutkom dala secer jedne sorte kao secer
 * cijelog tanka, i to proizvoljno koje.
 *
 * OGRANICENJE, namjerno: ako se puni u tank u kojem vec ima vina, ovo opisuje
 * ONO STO JE USLO, ne mjesavinu. Zateceno vino nema pouzdane parametre za
 * mijesanje, a "pocetno mjerenje punjenja" i znaci upravo to.
 *
 * Datum: najraniji datum berbe medju stavkama koje su ista dale parametar,
 * jer su parametri izmjereni NA GROZDJU, ne u trenutku unosa. Kad datuma
 * berbe nema, pada na datum punjenja.
 */
export function pocetnoMjerenjeIzStavki(
  stavke: ParametriStavke[],
  datumPunjenja: string
): PocetnoMjerenjeTijelo | null {
  const secer = ponderiraniProsjek(stavke, "secer");
  const ukupneKiseline = ponderiraniProsjek(stavke, "kiseline");
  const ph = ponderiraniProsjek(stavke, "ph");

  // Dovoljan je JEDAN parametar. Mjerenje s jednim popunjenim poljem je i
  // dalje podatak; nijedno mjerenje je rupa koju nista kasnije ne zatvara.
  if (secer == null && ukupneKiseline == null && ph == null) return null;

  const datumiBerbe = stavke
    .filter(
      (s) =>
        (s.secer != null || s.kiseline != null || s.ph != null) &&
        Number(s.kolicinaLitara) > 0
    )
    .map((s) => datumIliNull(s.datumBerbe))
    .filter((d): d is string => d !== null)
    .sort();

  return {
    secer,
    ukupneKiseline,
    ph,
    // "YYYY-MM-DD" se parsira kao UTC ponoc, pa datum ostaje tocan u
    // Hrvatskoj — isti razlog kao u `datumIliNull`.
    izmjerenoAt: datumiBerbe[0] ?? datumPunjenja,
  };
}
