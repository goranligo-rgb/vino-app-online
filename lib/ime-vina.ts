import type { Prisma } from "@prisma/client";
import { granicaSvihTankova, type GranicaVina } from "@/lib/granica-vina";

/**
 * IME VINA — izvedeno iz cinova imenovanja, ne iz posude.
 * ======================================================================
 *
 * Citaci ovog modula postavljaju jedno pitanje: „kako se zove vino koje je
 * SADA u ovom tanku". Odgovor se ne cita s tanka nego se racuna:
 *
 *   1. `lib/granica-vina.ts` kaze OTKAD je u tanku ovo vino;
 *   2. uzme se zadnji `ImeVina` zapis koji pada U TAJ PROZOR.
 *
 * Zapis nosi adresu (tank + vrijeme), a ne pokazivac na vino — isto pravilo
 * kao kod mjerenja u fazi C. Cim tank prodje kroz prazno, granica se pomakne
 * i svi stariji zapisi ispadnu iz prozora SAMI OD SEBE. Vino koje je upravo
 * uslo krece bezimeno dok ga netko ne imenuje; ne nasljedjuje ime prethodnika
 * samo zato sto je usao u istu posudu.
 *
 * ZASTO ZAPIS MOZE ISPASTI IZ PROZORA, A NE BRISE SE: povijest imenovanja je
 * povijest. Ekran „kako se vino zove danas" ga ne smije vidjeti, ali popis
 * „kako se ova posuda kroz godine zvala" smije.
 *
 * BEZIMENO NIJE GRESKA. Sest tankova danas nema ime i backfill ga nece
 * izmisliti. Razlika izmedju „vina nema" i „vino ima, ali nije imenovano"
 * mora dovde stici citava, pa ide u `razlog`, a ne u `naziv === null`.
 *
 * DEKLARIRANA SORTA NIJE SASTAV. Vraca se odvojeno i pozivatelj je duzan
 * prikazati je uz stvarni sastav iz knjige, ne umjesto njega.
 */

/** Samo tablica koju ovaj racun cita i pise — ne cijeli klijent. */
type Klijent = Pick<Prisma.TransactionClient, "imeVina">;

export type IzvorImena =
  | "RUCNO"
  | "CUVEE"
  | "PRETOK"
  | "PUNJENJE"
  | "FILTRACIJA"
  | "BACKFILL";

export type ImeVina = {
  naziv: string | null;
  deklariranaSorta: string | null;
  /** Kad je vino tako nazvano. `null` kad imena nema. */
  odAt: Date | null;
  izvor: IzvorImena | null;
  /**
   * IMENOVANO — u prozoru danasnjeg vina postoji cin imenovanja.
   * BEZIMENO  — vino u tanku ima, ali ga nitko nije imenovao.
   * PRAZAN    — u tanku nema vina, pa nema ni imena. Zapisi prethodnika se
   *             namjerno ne citaju.
   */
  razlog: "IMENOVANO" | "BEZIMENO" | "PRAZAN";
  /** Id zapisa iz kojeg je ime doslo — treba ekranu za uredjivanje. */
  zapisId: string | null;
};

/** Zapis u obliku koji racun treba. Odvojeno od baze radi testova. */
export type ZapisImena = {
  id: string;
  tankId: string;
  odAt: Date;
  naziv: string | null;
  deklariranaSorta: string | null;
  izvor: IzvorImena;
  obrisano: boolean;
  createdAt: Date;
};

const BEZ_IMENA: ImeVina = {
  naziv: null,
  deklariranaSorta: null,
  odAt: null,
  izvor: null,
  razlog: "BEZIMENO",
  zapisId: null,
};

/**
 * CISTI RACUN — bez baze.
 *
 * `doTrenutka` postoji iz istog razloga kao u `granicaVina`: onaj tko cita
 * tudi tank kao sastavnicu blenda pita kako se zvalo vino koje je ODANDE
 * doslo, a to je vino koje je ondje bilo u trenutku pretoka.
 */
export function izracunajImeVina(
  granica: Pick<GranicaVina, "odAt" | "razlog">,
  zapisi: ZapisImena[],
  doTrenutka?: Date | null
): ImeVina {
  // Prazan tank nema vino o kojem bi se govorilo. `OTISLO` je iznimka: to je
  // izricit zahtjev za vinom koje je upravo izaslo, i granica ga opisuje.
  if (!granica.odAt) {
    return { ...BEZ_IMENA, razlog: granica.razlog === "PRAZAN" ? "PRAZAN" : "BEZIMENO" };
  }

  const od = granica.odAt.getTime();
  const do_ = doTrenutka ? doTrenutka.getTime() : null;

  const uProzoru = zapisi
    .filter((z) => !z.obrisano)
    .filter((z) => z.odAt.getTime() >= od)
    // Ukljucivo, kao i granica vina: sto se dogodilo u istoj sekundi dio je
    // onoga sto se tada citalo.
    .filter((z) => do_ === null || z.odAt.getTime() <= do_)
    .sort(poredak);

  const zadnji = uProzoru[uProzoru.length - 1];
  if (!zadnji) return { ...BEZ_IMENA, razlog: "BEZIMENO" };

  return {
    naziv: zadnji.naziv,
    deklariranaSorta: zadnji.deklariranaSorta,
    odAt: zadnji.odAt,
    izvor: zadnji.izvor,
    razlog: "IMENOVANO",
    zapisId: zadnji.id,
  };
}

/**
 * Poredak: po `odAt`, a neodluceno razrjesava `createdAt`.
 *
 * Dva zapisa u istoj sekundi nisu teorija — backfill pise cijelu povijest
 * jednog tanka odjednom, a cuvée s vise ciljeva pise vise zapisa iz istog
 * pretoka. Bez drugog kljuca poredak bi ovisio o tome kako ih je baza vratila.
 */
function poredak(a: ZapisImena, b: ZapisImena): number {
  const d = a.odAt.getTime() - b.odAt.getTime();
  if (d !== 0) return d;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/** Ime vina u jednom tanku. Jedan upit (granica se predaje izvana). */
export async function imeVina(
  db: Klijent,
  tankId: string,
  granica: Pick<GranicaVina, "odAt" | "razlog">,
  opts?: { doTrenutka?: Date | null }
): Promise<ImeVina> {
  if (!granica.odAt) return izracunajImeVina(granica, [], opts?.doTrenutka);

  const zapisi = await db.imeVina.findMany({
    where: { tankId, obrisano: false, odAt: { gte: granica.odAt } },
    orderBy: [{ odAt: "asc" }, { createdAt: "asc" }],
  });

  return izracunajImeVina(granica, zapisi as ZapisImena[], opts?.doTrenutka);
}

/**
 * Imena SVIH tankova — jedan upit za cijeli podrum.
 *
 * Postoji iz istog razloga kao `granicaSvihTankova`: 48 odvojenih upita je
 * tocno ono sto lib/paralelno.ts zabranjuje (pooler drzi 15 veza za CIJELU
 * aplikaciju). Granice se predaju izvana jer ih pozivatelj ionako vec ima.
 */
export async function imenaSvihTankova(
  db: Klijent,
  granice: Map<string, Pick<GranicaVina, "odAt" | "razlog">>
): Promise<Map<string, ImeVina>> {
  // Najranija granica u podrumu je donja medja za CIJELI upit; po tanku se
  // rezu tocno. Bez toga bi se citala cijela tablica, s njom samo ono sto
  // nekome jos moze pripasti.
  const najranija = [...granice.values()]
    .map((g) => g.odAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const zapisi = najranija
    ? ((await db.imeVina.findMany({
        where: { obrisano: false, odAt: { gte: najranija } },
        orderBy: [{ odAt: "asc" }, { createdAt: "asc" }],
      })) as ZapisImena[])
    : [];

  const poTanku = new Map<string, ZapisImena[]>();
  for (const z of zapisi) {
    const popis = poTanku.get(z.tankId) ?? [];
    popis.push(z);
    poTanku.set(z.tankId, popis);
  }

  const mapa = new Map<string, ImeVina>();
  for (const [tankId, granica] of granice) {
    mapa.set(tankId, izracunajImeVina(granica, poTanku.get(tankId) ?? []));
  }

  return mapa;
}

/**
 * IMENA CIJELOG PODRUMA — jedan poziv, cetiri upita.
 *
 * Ovo je ulaz za sve citace faze 4: dvije API rute (`/api/tank`,
 * `/api/tank/monitor`) i poslužiteljske stranice koje citaju `Tank` izravno.
 * Postoji da nijedan od njih ne mora znati da se ime racuna iz DVA izvora
 * (granica iz knjige + zapisi o imenovanju) ni da ih mora spojiti sam.
 *
 * Cetiri upita za cijeli podrum, ne cetiri po tanku — `lib/paralelno.ts`
 * zabranjuje neograniceno grananje jer pooler drzi 15 veza za cijelu
 * aplikaciju.
 */
export async function imenaPodruma(
  db: Klijent & Parameters<typeof granicaSvihTankova>[0]
): Promise<Map<string, ImeVina>> {
  const granice = await granicaSvihTankova(db);
  return imenaSvihTankova(db, granice);
}

/**
 * Sto pisati na ekran umjesto imena.
 *
 * BEZIMENO SE VIDI, NE OSTAJE PRAZNO. Osam tankova danas nema ime (T20, T22,
 * T27, T28, T33, T34, T40, T45) i backfill im ga po dogovoru nije izmislio.
 * Prazno polje izgleda kao da podatak nedostaje ili se nije ucitao; „Bez
 * imena" je tvrdnja — ovo vino nitko jos nije imenovao, i to je posao koji
 * ceka covjeka.
 *
 * Kad imena nema, ali ima DEKLARIRANE SORTE, ona nastupa kao ime — tako se
 * ponasao i stari lanac `nazivVina || sorta`, pa se ekran ne osiromasuje.
 */
export const BEZ_IMENA_TEKST = "bez imena";

/**
 * BEZIMENO ZNACI „NEMA IMENA", NE „NEMA NIJEDNOG ZAPISA".
 *
 * Osam tankova ima zapis o imenovanju koji nosi SAMO deklariranu sortu —
 * punjenje je upisalo sortu, a ime nitko nije dao. Da se bezimenost vezala uz
 * `razlog === "BEZIMENO"` (dakle uz izostanak zapisa), ti bi tankovi tiho
 * pokazivali sortu na mjestu imena i nitko ne bi vidio da ime nedostaje —
 * tocno ono sto se trazilo da se vidi.
 *
 * Prazna posuda NIJE bezimena: ondje nema vina o kojem bi se govorilo.
 */
export function jeBezImena(ime: ImeVina | null | undefined): boolean {
  if (!ime || ime.razlog === "PRAZAN") return false;
  return ocisti(ime.naziv) == null;
}

/**
 * Jedan redak za uske prikaze — monitor, kartica hladjenja, kartica podruma.
 *
 * Kad imena nema, a deklarirana sorta postoji, ispisuje se OBOJE:
 * „bez imena · Muškat žuti". Sama sorta bi se citala kao ime (a nije), sam
 * „bez imena" bi izgubio podatak koji ekran danas pokazuje.
 */
export function imeZaPrikaz(ime: ImeVina | null | undefined): {
  tekst: string;
  bezimeno: boolean;
} {
  if (!ime || ime.razlog === "PRAZAN") return { tekst: "—", bezimeno: false };

  const naziv = ocisti(ime.naziv);
  if (naziv) return { tekst: naziv, bezimeno: false };

  const sorta = ocisti(ime.deklariranaSorta);
  return {
    tekst: sorta ? `${BEZ_IMENA_TEKST} · ${sorta}` : BEZ_IMENA_TEKST,
    bezimeno: true,
  };
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

/**
 * Cijela povijest imenovanja jedne posude — i ono sto je ispalo iz prozora.
 *
 * Namjerno NE reze granicom: ovo je odgovor na pitanje „kako se kroz godine
 * zvalo ono sto je bilo u ovoj posudi", a ne „kako se zove vino u njoj sada".
 * Obrisani zapisi se vracaju takodjer — meko brisanje je oznaka, ne nestanak.
 */
export async function povijestImenovanja(
  db: Klijent,
  tankId: string
): Promise<ZapisImena[]> {
  return (await db.imeVina.findMany({
    where: { tankId },
    orderBy: [{ odAt: "desc" }, { createdAt: "desc" }],
  })) as ZapisImena[];
}

/**
 * Ima li ovaj cin ista za reci. Zapis kojem su i ime i sorta prazni se ne
 * pise — bezimeno vino nema zapis, a ne zapis s praznim imenom.
 */
export function vrijediUpisati(
  naziv: string | null | undefined,
  sorta: string | null | undefined
): boolean {
  return Boolean(ocisti(naziv) || ocisti(sorta));
}

/** Prazan string iz obrasca je isto sto i „nije upisano". */
export function ocisti(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * ZABILJEZI CIN IMENOVANJA. Jedini nacin na koji se u ovu tablicu pise.
 * ======================================================================
 *
 * Zove se ODMAH UZ upis identiteta na tank, unutar iste transakcije: pretok,
 * punjenje, filtracija i rucna izmjena tanka. Dok traje faza 3, `Tank.nazivVina`
 * se i dalje pise — ovo mu je dvojnik koji ce ga u fazi 4 zamijeniti kao izvor
 * za citanje, a u fazi 5 i kao jedini upis.
 *
 * NE PISE SE KAD SE NISTA NIJE PROMIJENILO. Obican pretok koji dolije vino u
 * tank koji se vec tako zove nije cin imenovanja i ne treba zapis; bez ovoga
 * bi svaki od 94 pretoka ostavio redak, a povijest imenovanja bi prestala
 * razlikovati imenovanje od premjestanja.
 *
 * IZUZETAK JE PRAZNA POSUDA. Tada se zapis pise UVIJEK, cak i kad je ime isto
 * kao zadnji put: granica vina se pomakla, stariji zapisi su ispali iz prozora
 * i bez novoga bi vino koje je upravo uslo bilo bezimeno. Isto pravilo vrijedi
 * u backfillu (`scripts/backfill-ime-vina.ts`).
 *
 * Vraca je li zapis nastao.
 */
export async function zabiljeziImenovanje(
  db: Klijent,
  arg: {
    tankId: string;
    /** Kad se cin dogodio — datum iz obrasca, ne trenutak upisa. */
    odAt: Date;
    naziv: string | null | undefined;
    deklariranaSorta: string | null | undefined;
    izvor: IzvorImena;
    /** Stanje tanka NEPOSREDNO PRIJE ovog cina. Sluzi samo za usporedbu. */
    prijeNaziv?: string | null;
    prijeSorta?: string | null;
    /** Je li posuda bila prazna — vidi „IZUZETAK" iznad. */
    bioPrazan?: boolean;
    pretokId?: string | null;
    punjenjeId?: string | null;
    korisnikId?: string | null;
    razlog?: string | null;
    napomena?: string | null;
  }
): Promise<boolean> {
  const naziv = ocisti(arg.naziv);
  const sorta = ocisti(arg.deklariranaSorta);

  if (!vrijediUpisati(naziv, sorta)) return false;

  const isto =
    naziv === ocisti(arg.prijeNaziv) && sorta === ocisti(arg.prijeSorta);
  if (isto && !arg.bioPrazan) return false;

  await db.imeVina.create({
    data: {
      tankId: arg.tankId,
      odAt: arg.odAt,
      naziv,
      deklariranaSorta: sorta,
      izvor: arg.izvor,
      pretokId: arg.pretokId ?? null,
      punjenjeId: arg.punjenjeId ?? null,
      korisnikId: arg.korisnikId ?? null,
      razlog: ocisti(arg.razlog),
      napomena: ocisti(arg.napomena),
    },
  });

  return true;
}
