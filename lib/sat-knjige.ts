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
 * DONJA BRANA: NIKAD ISPRED PRAZNE POSUDE (12.09.2026)
 * ---------------------------------------------------
 * Datum iz forme smije biti raniji od upisa, ali NE smije biti raniji od
 * trenutka u kojem je ciljna posuda zadnji put bila prazna prije tog upisa.
 * Punjenje datirano 09.09. a upisano 11.09., u tank koji je ispraznjen i
 * arhiviran 10.09., inace se u lancu spoji s vinom koje je iz tanka vec
 * otislo: T27 je tako dobivao 11 tudjih radnji (49 % Polymust Blanc i Fermaid
 * E iz T2), T33 njih 13 (54 % iz T27), T45 njih 15. Mjereno 12.09.2026:
 * pravilo mice 18 od 66 redaka nastalih punjenjem, a ta tri tanka padaju na
 * vlastitu jednu radnju.
 *
 * PRAZNA POSUDA SE RACUNA PO SATU UPISA, i to je jedini razlog zasto racun
 * nije kruzan: `createdAt` se ne datira unatrag, pa ne ovisi o pravilu koje se
 * ovdje tek izvodi. Uzima se zadnje praznjenje PRIJE upisa tog retka, nikad
 * zadnje ukupno — inace bi povijesni redak odletio naprijed na danasnje
 * praznjenje i pojeo vlastitu proslost (mjereno: T10 bi pao s dubine 7 na 1,
 * T13 sa 6 na 0).
 *
 * DATUM IZ FORME SE NE UKIDA. Pomak je donja brana, ne zamjena: punjenje
 * upisano 15 dana kasnije, a bez ijednog praznjenja izmedju, ostaje na svom
 * datumu (T30 i T31, 01.06.). Zamjena satom upisa ondje bi pojela po cetiri
 * mjerenja koja opisuju bas to vino.
 *
 * SQL BLIZANAC. Isto pravilo stoji u `satSQL`. Dvije izvedbe iste definicije
 * moraju dati isti broj do milisekunde — `scripts/test-sat-knjige.ts` to
 * provjerava nad svakim retkom prave knjige.
 */

/** Ispod ovoga se posuda smatra praznom. Isti prag kao `lib/granica-vina.ts`. */
const PRAZNO_ML = 1_000;

/**
 * Koliko iza praznjenja redak sjeda.
 *
 * Sekunda, a ne nula: redak koji bi pao TOCNO na trenutak praznjenja ostaje
 * dvosmislen — cin koji prazni i cin koji puni tada dijele sat, a redoslijed
 * odlucuje `red` u lancu. Sekunda je manja od svakog stvarnog razmaka u
 * podrumu, a veca od milisekundnih razmaka unutar jedne transakcije.
 * SQL blizanac koristi `interval '1 second'`.
 */
const POMAK_MS = 1_000;

/** Mililitri, isti racun kao knjiga pri upisu. */
function uMl(litre: number): number {
  return Math.round(Number(litre) * 1000);
}

/** Redak knjige u obliku koji treba racun praznjenja. */
export type RedakPraznjenja = {
  id: string;
  uTankId: string | null;
  izTankId: string | null;
  litre: number;
  createdAt: Date;
};

/**
 * Trenuci u kojima je posuda bila prazna, po satu UPISA, rastuce.
 * Kljuc je `tankId`.
 */
export type Praznjenja = ReadonlyMap<string, number[]>;

/**
 * Iz redaka knjige izracunaj kad je koja posuda bila prazna.
 *
 * Pozivatelj salje retke kojima raspolaze: cijelu knjigu (lanac, preracun) ili
 * retke jednog tanka (granica). Racun je po posudi, pa je popis jednog tanka
 * dovoljan za taj tank.
 *
 * POREDAK je (`createdAt`, `id`) — isti kao u SQL blizancu. Bez `id` bi dva
 * retka iste transakcije mogla pasti u razlicitom poretku u JS-u i u bazi, pa
 * bi se dvije izvedbe razisle na tanku koji je u istoj sekundi i ispraznjen i
 * napunjen.
 */
export function praznjenjaPosuda(redci: RedakPraznjenja[]): Praznjenja {
  const poTanku = new Map<string, RedakPraznjenja[]>();

  for (const r of redci) {
    for (const tankId of [r.uTankId, r.izTankId]) {
      if (!tankId) continue;
      const popis = poTanku.get(tankId) ?? [];
      popis.push(r);
      poTanku.set(tankId, popis);
    }
  }

  const out = new Map<string, number[]>();

  for (const [tankId, popis] of poTanku) {
    const poredani = [...popis].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );

    let ml = 0;
    const trenuci: number[] = [];

    for (const r of poredani) {
      ml +=
        (r.uTankId === tankId ? uMl(r.litre) : 0) -
        (r.izTankId === tankId ? uMl(r.litre) : 0);

      if (ml < PRAZNO_ML) trenuci.push(r.createdAt.getTime());
    }

    out.set(tankId, trenuci);
  }

  return out;
}

/** Redak onako kako ga sat treba. `punjenjeId` i `uTankId` nose donju branu. */
export type RedakSata = {
  dogodenoAt: Date;
  createdAt: Date;
  punjenjeId?: string | null;
  uTankId?: string | null;
};

/** Zadnje praznjenje posude PRIJE zadanog trenutka upisa. */
function zadnjePraznjenje(
  praznjenja: Praznjenja,
  tankId: string,
  prijeMs: number
): number | null {
  const trenuci = praznjenja.get(tankId);
  if (!trenuci) return null;

  let zadnji: number | null = null;
  for (const t of trenuci) {
    if (t >= prijeMs) break; // rastuce, pa dalje nema smisla gledati
    zadnji = t;
  }

  return zadnji;
}

/**
 * DONJA BRANA za jedan redak, ili `null` kad je nema.
 *
 * Vrijedi SAMO za retke nastale punjenjem: pretok i izlaz nose vlastiti
 * trenutak cina, a njihov `dogodenoAt` nije datum iz forme na isti nacin.
 * Izvezeno jer `lib/granica-vina.ts` istom branom mora skratiti i `datumiPunjenja`,
 * drugi kanal kojim datum iz forme povlaci granicu unatrag.
 */
export function donjaGranicaPunjenja(
  k: RedakSata,
  praznjenja?: Praznjenja
): number | null {
  if (!praznjenja || !k.punjenjeId || !k.uTankId) return null;

  const upis = k.createdAt.getTime();
  const p = zadnjePraznjenje(praznjenja, k.uTankId, upis);
  if (p == null) return null;

  // NIKAD IZA VLASTITOG UPISA. Praznjenje je po definiciji ranije od upisa, ali
  // kad ih dijeli manje od sekunde (pretok pa odmah punjenje, u istoj minuti),
  // pomak bi redak gurnuo u buducnost u odnosu na cas kad je zapisan. Brana je
  // i dalje strogo iza praznjenja, jer je ono strogo ispred upisa.
  return Math.min(p + POMAK_MS, upis);
}

/**
 * Trenutak jednog kretanja, u milisekundama. Sat za JavaScript.
 *
 * Bez `praznjenja` vraca ono sto je i prije: min od dvaju stupaca. Pozivatelj
 * koji ima retke knjige MORA ih poslati — inace unatrag datirano punjenje
 * prolazi ispred praznjenja posude.
 */
export function satKretanja(k: RedakSata, praznjenja?: Praznjenja): number {
  const sat = Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
  const donja = donjaGranicaPunjenja(k, praznjenja);

  return donja == null ? sat : Math.max(sat, donja);
}

/**
 * Isti sat, izrazen u SQL-u — BLIZANAC gornjeg racuna.
 *
 * Pise se `LEAST`, ne `CASE`, jer oba stupca imaju `NOT NULL` pa nema treceg
 * ishoda. Donja brana je korelirani podupit: tekuci zbroj mililitara te posude
 * po satu upisa, pa zadnji trenutak prije upisa ovog retka u kojem je posuda
 * bila ispod praga. Poredak (`createdAt`, `id`) i pomak od sekunde isti su kao
 * u `praznjenjaPosuda`.
 *
 * CIJENA: podupit prolazi kroz retke te posude za svaki redak na koji se
 * primjenjuje, i to samo za retke nastale punjenjem. Knjiga ima 577 redaka i
 * raste nekoliko stotina po sezoni; kad to prestane biti jeftino, zamjena je
 * materijalizirana tablica praznjenja, ne drugo pravilo.
 *
 * `alias` je ime tablice u upitu i UVIJEK je konstanta iz koda — nikad
 * korisnicki unos. Zato smije ici kroz `Prisma.raw`.
 */
export function satSQL(alias = "k"): Prisma.Sql {
  const a = `"${alias.replace(/"/g, "")}"`;

  return Prisma.raw(`
    CASE
      WHEN ${a}."punjenjeId" IS NULL OR ${a}."uTankId" IS NULL
        THEN LEAST(${a}."dogodenoAt", ${a}."createdAt")
      ELSE GREATEST(
        LEAST(${a}."dogodenoAt", ${a}."createdAt"),
        COALESCE(
          (
            -- CIJELI RACUN BRANE IDE UNUTAR PODUPITA, i to nije kozmetika:
            -- agregat nad praznim skupom vraca redak s NULL, a LEAST u
            -- Postgresu NULL PRESKACE — pa bi LEAST(NULL, createdAt) vratio
            -- createdAt i vanjski COALESCE nikad ne bi vidio "nema praznjenja".
            -- (Bez obrnutih navodnika: cijeli upit je JS template literal.)
            -- Tank bez ijednog praznjenja time bi dobio sat upisa umjesto
            -- datuma iz forme (uhvaceno testom, 14 od 606 redaka).
            SELECT CASE
              WHEN max(x.sat) IS NULL THEN NULL
              ELSE LEAST(
                max(x.sat) + interval '${POMAK_MS} milliseconds',
                ${a}."createdAt"
              )
            END
            FROM (
              SELECT
                b."createdAt" AS sat,
                sum(
                    (CASE WHEN b."uTankId"  = ${a}."uTankId" THEN round(b.litre::numeric * 1000) ELSE 0 END)
                  - (CASE WHEN b."izTankId" = ${a}."uTankId" THEN round(b.litre::numeric * 1000) ELSE 0 END)
                ) OVER (ORDER BY b."createdAt", b."id") AS ml
              FROM "BerbaKretanje" b
              WHERE b."uTankId" = ${a}."uTankId" OR b."izTankId" = ${a}."uTankId"
            ) x
            WHERE x.ml < ${PRAZNO_ML} AND x.sat < ${a}."createdAt"
          ),
          LEAST(${a}."dogodenoAt", ${a}."createdAt")
        )
      )
    END
  `);
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
