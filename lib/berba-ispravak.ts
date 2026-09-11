import type { Prisma } from "@prisma/client";
import { kljucGrupeBerbe } from "@/lib/berba-kljuc";
import { gdjeJeBerba } from "@/lib/berba-model";
import { razlikaPolja, zabiljeziIzmjene } from "@/lib/dnevnik-izmjena";

/**
 * ISPRAVAK BERBE — ispravak greske pri unosu, na cijeloj grupi odjednom.
 * ======================================================================
 *
 * Zove ga `PUT /api/berba/[id]` iz obrasca `/berba/[id]/uredi`. Sva pravila su
 * ovdje, da ih test nad bazom provjerava bez HTTP-a.
 *
 * STO SE NE DIRA — KNJIGA. `kolicinaLitara` je knjigovodstvo: iz nje je nastao
 * ULAZ redak i stanje tanka. Ispravlja se brisanjem stavke punjenja i ponovnim
 * upisom, ne ovdje. `datumBerbe` je OPIS: ULAZ nosi datum punjenja, a granica
 * vina cita sat knjige i `PunjenjeTanka.datumPunjenja` — datum berbe ne ulazi
 * ni u jedno ni u drugo (provjereno 11.09.2026.).
 *
 * GRUPA (odluka 3). Ista berba zna stajati u vise zapisa (vise punjenja). Grupa
 * je `kljucGrupeBerbe` — isti kljuc kao bocna traka — i trazi se SAMO medju
 * zapisima vrste BERBA. Zateceni zapis (ZATECENO) nema pouzdan datum ni
 * parcelu, pa bi ih kljuc spojio nasumce; on se ispravlja sam.
 *
 * STAVKE PUNJENJA (odluka 1). Stranica tanka podatke berbe cita s
 * `PunjenjeStavka`, ne s `Berba`. U istoj transakciji ispravljaju se i stavke
 * vezane preko `berbaId`, za polja koja stavka ima. Kilogrami idu SAMO na
 * stavku iz koje je berba nastala (`izvornaPunjenjeStavkaId`): kad je berba
 * razlivena u vise tankova, kilogrami stoje na prvoj stavci i ne ponavljaju se
 * na ostalima — da se ponove, stranica bi ih zbrojila dvaput.
 *
 * SORTA (odluka 2). Promjena sorte odmah mijenja sastav iz knjige u svakom
 * tanku u kojem je berba danas. `Tank.sorta` i ime vina se NE diraju. Zato
 * promjena sorte trazi izricitu potvrdu, a pozivatelj dobiva popis tankova.
 *
 * TRAG (odluka 5). `ispravljenoAt` / `ispravioKorisnikId` / `razlogIspravka`
 * na zapisu nose ZADNJI ispravak; dnevnik (`ActivityLog`, redak po polju)
 * cuva sve, pa raniji razlog ne nestane.
 */

type Tx = Prisma.TransactionClient;

export class IspravakBerbeGreska extends Error {
  constructor(poruka: string) {
    super(poruka);
    this.name = "IspravakBerbeGreska";
  }
}

export const TIP_ISPRAVAK_BERBE = "ISPRAVAK_BERBE";

/** Polja koja ispravak smije mijenjati — i nijedno drugo. */
export const POLJA_ISPRAVKA = [
  "nazivSorte",
  "kolicinaKgGrozdja",
  "secer",
  "kiseline",
  "ph",
  "polozaj",
  "parcela",
  "vinograd",
  "oznakaBerbe",
  "datumBerbe",
  "godinaBerbe",
  "napomena",
  "maceracija",
  "maceracijaSati",
  "vlastitaBerba",
  "pocetakBranja",
  "krajBranja",
  "brojBeraca",
] as const;

export type PoljeIspravka = (typeof POLJA_ISPRAVKA)[number];

const TEKST: PoljeIspravka[] = ["polozaj", "parcela", "vinograd", "oznakaBerbe", "napomena"];
const BROJ: PoljeIspravka[] = ["kolicinaKgGrozdja", "secer", "kiseline", "ph", "maceracijaSati"];
const CIJELI: PoljeIspravka[] = ["godinaBerbe", "brojBeraca"];
const DA_NE: PoljeIspravka[] = ["maceracija", "vlastitaBerba"];
const TRENUTAK: PoljeIspravka[] = ["pocetakBranja", "krajBranja"];

/** Polja koja postoje i na `PunjenjeStavka` — ondje se ispravljaju isto. */
const NA_STAVCI: Partial<Record<PoljeIspravka, string>> = {
  nazivSorte: "nazivSorte",
  datumBerbe: "datumBerbe",
  godinaBerbe: "godinaBerbe",
  polozaj: "polozaj",
  parcela: "parcela",
  vinograd: "vinograd",
  oznakaBerbe: "oznakaBerbe",
  secer: "secer",
  kiseline: "kiseline",
  ph: "ph",
  napomena: "napomenaBerbe",
  maceracija: "maceracija",
  maceracijaSati: "maceracijaSati",
  // kolicinaKgGrozdja: samo izvorna stavka — vidi zaglavlje.
};

type Vrijednost = string | number | boolean | Date | null;
type Stanje = Record<PoljeIspravka, Vrijednost>;

const ODABIR_BERBE = {
  id: true,
  vrstaUnosa: true,
  nazivSorte: true,
  sortaId: true,
  kolicinaLitara: true,
  kolicinaKgGrozdja: true,
  secer: true,
  kiseline: true,
  ph: true,
  polozaj: true,
  parcela: true,
  vinograd: true,
  oznakaBerbe: true,
  datumBerbe: true,
  godinaBerbe: true,
  napomena: true,
  maceracija: true,
  maceracijaSati: true,
  vlastitaBerba: true,
  pocetakBranja: true,
  krajBranja: true,
  brojBeraca: true,
  izvornaPunjenjeStavkaId: true,
  ispravljenoAt: true,
  razlogIspravka: true,
} as const;

type ZapisBerbe = Prisma.BerbaGetPayload<{ select: typeof ODABIR_BERBE }>;

export type ClanGrupe = ZapisBerbe & { datumUlaska: Date | null };

export type TankUpozorenja = { tankId: string; broj: number | null; litre: number };

export type StanjeZaUredjivanje = {
  glava: ClanGrupe;
  grupa: ClanGrupe[];
  /** Gdje su zapisi grupe danas, zbrojeno po tanku — za upozorenje o sorti. */
  tankoviDanas: TankUpozorenja[];
  /** Kljucevi SVIH ostalih grupa vrste BERBA — za upozorenje o sudaru. */
  kljuceviOstalih: string[];
  stavkiUGrupi: number;
};

/** Prvi ULAZ u knjizi po berbi — datum ulaska u podrum. */
async function datumiUlaska(db: Tx, berbaIds: string[]): Promise<Map<string, Date>> {
  const ulazi = await db.berbaKretanje.findMany({
    where: { vrsta: "ULAZ", berbaId: { in: berbaIds } },
    orderBy: { dogodenoAt: "asc" },
    select: { berbaId: true, dogodenoAt: true },
  });
  const mapa = new Map<string, Date>();
  for (const u of ulazi) if (!mapa.has(u.berbaId)) mapa.set(u.berbaId, u.dogodenoAt);
  return mapa;
}

/**
 * Zapis i njegova grupa, gdje je danas, i kljucevi ostalih grupa.
 *
 * Svi zapisi vrste BERBA citaju se odjednom (desetci redaka), a ne po kljucu u
 * SQL-u: kljuc ukljucuje datum ulaska iz knjige i normalizaciju slova, i mora
 * biti tocno onaj iz `lib/berba-kljuc.ts`.
 */
export async function stanjeZaUredjivanje(
  db: Tx,
  berbaId: string
): Promise<StanjeZaUredjivanje> {
  const zapis = await db.berba.findFirst({
    where: { id: berbaId, obrisano: false },
    select: ODABIR_BERBE,
  });

  if (!zapis) {
    throw new IspravakBerbeGreska("Berba ne postoji ili je obrisana.");
  }

  const kandidati =
    zapis.vrstaUnosa === "BERBA"
      ? await db.berba.findMany({
          where: { vrstaUnosa: "BERBA", obrisano: false },
          select: ODABIR_BERBE,
          orderBy: { createdAt: "asc" },
        })
      : [zapis];

  const ulasci = await datumiUlaska(db, kandidati.map((k) => k.id));
  const sDatumom = kandidati.map((k) => ({ ...k, datumUlaska: ulasci.get(k.id) ?? null }));
  const glava = sDatumom.find((k) => k.id === zapis.id)!;
  const kljucGlave = kljucGrupeBerbe(glava);

  const grupa =
    zapis.vrstaUnosa === "BERBA"
      ? sDatumom.filter((k) => kljucGrupeBerbe(k) === kljucGlave)
      : [glava];
  const uGrupi = new Set(grupa.map((g) => g.id));

  const kljuceviOstalih =
    zapis.vrstaUnosa === "BERBA"
      ? [...new Set(sDatumom.filter((k) => !uGrupi.has(k.id)).map(kljucGrupeBerbe))]
      : [];

  // Po zapisu, redom — grupa je tri-cetiri zapisa, a `gdjeJeBerba` je jedan upit.
  const poTanku = new Map<string, number>();
  for (const g of grupa) {
    for (const m of await gdjeJeBerba(db, g.id)) {
      poTanku.set(m.tankId, (poTanku.get(m.tankId) ?? 0) + m.litre);
    }
  }
  const brojevi = new Map(
    (
      await db.tank.findMany({
        where: { id: { in: [...poTanku.keys()] } },
        select: { id: true, broj: true },
      })
    ).map((t) => [t.id, t.broj])
  );
  const tankoviDanas = [...poTanku.entries()]
    .map(([tankId, litre]) => ({ tankId, broj: brojevi.get(tankId) ?? null, litre }))
    .sort((a, b) => (a.broj ?? 0) - (b.broj ?? 0));

  const stavkiUGrupi = await db.punjenjeStavka.count({
    where: { berbaId: { in: [...uGrupi] }, obrisano: false },
  });

  return { glava, grupa, tankoviDanas, kljuceviOstalih, stavkiUGrupi };
}

// ---------------------------------------------------------------------------
// Citanje tijela
// ---------------------------------------------------------------------------

function tekst(v: unknown, polje: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new IspravakBerbeGreska(`Polje ${polje} mora biti tekst.`);
  const s = v.trim();
  return s === "" ? null : s;
}

function broj(v: unknown, polje: string, cijeli: boolean): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    throw new IspravakBerbeGreska(`Polje ${polje} mora biti broj, nula ili veci.`);
  }
  if (cijeli && !Number.isInteger(n)) {
    throw new IspravakBerbeGreska(`Polje ${polje} mora biti cijeli broj.`);
  }
  return n;
}

function daNe(v: unknown, polje: string): boolean | null {
  // Samo pravi boolean — NULL znaci "nije se pitalo", false "izricito nije bilo".
  if (v === null || v === undefined) return null;
  if (typeof v !== "boolean") throw new IspravakBerbeGreska(`Polje ${polje} mora biti da/ne.`);
  return v;
}

function trenutak(v: unknown, polje: string): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new IspravakBerbeGreska(`Polje ${polje} nije ispravan datum.`);
  return d;
}

/** "YYYY-MM-DD" -> UTC ponoc, kao kod punjenja. */
function dan(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new IspravakBerbeGreska("Datum berbe mora biti oblika GGGG-MM-DD.");
  }
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new IspravakBerbeGreska("Datum berbe nije ispravan.");
  return d;
}

/** Iz tijela zahtjeva — samo poslana polja. Nepoznato polje je greska, ne tisina. */
export function procitajPromjene(tijelo: Record<string, unknown>): Partial<Stanje> {
  if ("kolicinaLitara" in tijelo) {
    throw new IspravakBerbeGreska(
      "Kolicina litara se ne ispravlja ovdje: iz nje je nastao ulaz u knjigu i stanje tanka. Ispravlja se brisanjem stavke punjenja i ponovnim upisom."
    );
  }

  const dopusteno = new Set<string>([...POLJA_ISPRAVKA, "razlog", "potvrdaSorte", "sortaId"]);
  const nepoznato = Object.keys(tijelo).filter((k) => !dopusteno.has(k));
  if (nepoznato.length > 0) {
    throw new IspravakBerbeGreska(`Ta polja se ne mogu ispravljati: ${nepoznato.join(", ")}.`);
  }

  const p: Partial<Stanje> = {};
  for (const polje of POLJA_ISPRAVKA) {
    if (!(polje in tijelo)) continue;
    const v = tijelo[polje];
    if (polje === "nazivSorte") {
      const s = tekst(v, polje);
      if (!s) throw new IspravakBerbeGreska("Sorta ne smije ostati prazna.");
      p.nazivSorte = s;
    } else if (polje === "datumBerbe") p.datumBerbe = dan(v);
    else if (TEKST.includes(polje)) p[polje] = tekst(v, polje);
    else if (BROJ.includes(polje)) p[polje] = broj(v, polje, false);
    else if (CIJELI.includes(polje)) p[polje] = broj(v, polje, true);
    else if (DA_NE.includes(polje)) p[polje] = daNe(v, polje);
    else if (TRENUTAK.includes(polje)) p[polje] = trenutak(v, polje);
  }
  return p;
}

/** Stanje zapisa u obliku za usporedbu — Decimal i Float kao broj. */
function stanjeZapisa(z: ZapisBerbe): Stanje {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    nazivSorte: z.nazivSorte,
    kolicinaKgGrozdja: n(z.kolicinaKgGrozdja),
    secer: n(z.secer),
    kiseline: n(z.kiseline),
    ph: n(z.ph),
    polozaj: z.polozaj,
    parcela: z.parcela,
    vinograd: z.vinograd,
    oznakaBerbe: z.oznakaBerbe,
    datumBerbe: z.datumBerbe,
    godinaBerbe: z.godinaBerbe,
    napomena: z.napomena,
    maceracija: z.maceracija,
    maceracijaSati: n(z.maceracijaSati),
    vlastitaBerba: z.vlastitaBerba,
    pocetakBranja: z.pocetakBranja,
    krajBranja: z.krajBranja,
    brojBeraca: z.brojBeraca,
  };
}

/** Vrijednost za dnevnik i usporedbu: datum kao ISO, ostalo kakvo jest. */
function zaUsporedbu(v: Vrijednost): unknown {
  return v instanceof Date ? v.toISOString() : v;
}

/**
 * Pravila koja vrijede za GOTOVO stanje, isto kao kod punjenja: sati
 * maceracije bez potvrdjene maceracije nisu podatak; vrijeme i beraci vrijede
 * samo za vlastitu berbu.
 */
function uskladi(s: Stanje): Stanje {
  const r = { ...s };
  if (r.maceracija !== true) r.maceracijaSati = null;
  if (r.vlastitaBerba !== true) {
    r.pocetakBranja = null;
    r.krajBranja = null;
    r.brojBeraca = null;
  }
  if (
    r.pocetakBranja instanceof Date &&
    r.krajBranja instanceof Date &&
    r.krajBranja.getTime() <= r.pocetakBranja.getTime()
  ) {
    throw new IspravakBerbeGreska("Kraj branja mora biti poslije pocetka.");
  }
  return r;
}

// ---------------------------------------------------------------------------
// Ispravak
// ---------------------------------------------------------------------------

export type UlazIspravkaBerbe = {
  berbaId: string;
  tijelo: Record<string, unknown>;
  korisnikId: string;
  sada?: Date;
};

export type RezultatIspravkaBerbe = {
  zapisa: number;
  stavki: number;
  /** Polja koja su se stvarno promijenila, na bilo kojem zapisu grupe. */
  polja: string[];
  upozorenja: {
    /** Tankovi kojima se mijenja sastav — samo kad se mijenja sorta. */
    sorta: TankUpozorenja[] | null;
    /** Novi kljuc vec ima druga grupa — upozorava se, ne blokira (odluka 4). */
    sudarGrupe: boolean;
  };
};

export async function ispraviBerbu(
  tx: Tx,
  ulaz: UlazIspravkaBerbe
): Promise<RezultatIspravkaBerbe> {
  const razlog = tekst(ulaz.tijelo.razlog, "razlog");
  if (!razlog) {
    throw new IspravakBerbeGreska("Upiši razlog ispravka.");
  }

  const promjene = procitajPromjene(ulaz.tijelo);
  if (Object.keys(promjene).length === 0) {
    throw new IspravakBerbeGreska("Nijedno polje nije poslano.");
  }

  const stanje = await stanjeZaUredjivanje(tx, ulaz.berbaId);
  const { glava, grupa, tankoviDanas, kljuceviOstalih } = stanje;

  // Sorta iz sifrarnika kad takva postoji — isti naziv, pa i veza.
  let sortaId: string | null | undefined;
  if (promjene.nazivSorte !== undefined) {
    const s = await tx.sorta.findFirst({
      where: { naziv: { equals: String(promjene.nazivSorte), mode: "insensitive" } },
      select: { id: true, naziv: true },
    });
    if (s) promjene.nazivSorte = s.naziv;
    sortaId = s?.id ?? null;
  }

  const mijenjaSortu =
    promjene.nazivSorte !== undefined &&
    String(promjene.nazivSorte).toLocaleLowerCase("hr") !==
      glava.nazivSorte.trim().toLocaleLowerCase("hr");

  if (mijenjaSortu && ulaz.tijelo.potvrdaSorte !== true) {
    const gdje = tankoviDanas.length
      ? tankoviDanas.map((t) => `T${t.broj ?? "?"}`).join(", ")
      : "nijednom tanku";
    throw new IspravakBerbeGreska(
      `Promjena sorte trazi potvrdu: berba je danas u ${gdje} i tim tankovima se mijenja sastav.`
    );
  }

  const sada = ulaz.sada ?? new Date();
  const promijenjenaPolja = new Set<string>();
  let zapisa = 0;
  let stavki = 0;

  for (const clan of grupa) {
    const prije = stanjeZapisa(clan);
    const poslije = uskladi({ ...prije, ...promjene });

    const izmjene = razlikaPolja(
      Object.fromEntries(POLJA_ISPRAVKA.map((p) => [p, zaUsporedbu(prije[p])])),
      Object.fromEntries(POLJA_ISPRAVKA.map((p) => [p, zaUsporedbu(poslije[p])])),
      [...POLJA_ISPRAVKA]
    );
    if (izmjene.length === 0) continue;

    const data: Record<string, unknown> = {};
    for (const i of izmjene) {
      data[i.polje] = poslije[i.polje as PoljeIspravka];
      promijenjenaPolja.add(i.polje);
    }
    if (sortaId !== undefined && data.nazivSorte !== undefined) data.sortaId = sortaId;

    await tx.berba.update({
      where: { id: clan.id },
      data: {
        ...data,
        ispravljenoAt: sada,
        ispravioKorisnikId: ulaz.korisnikId,
        razlogIspravka: razlog,
      },
    });
    zapisa++;

    await zabiljeziIzmjene(tx, {
      entityType: "Berba",
      entityId: clan.id,
      opisEntiteta: `Berba ${clan.nazivSorte}${clan.parcela ? `, parcela ${clan.parcela}` : ""}`,
      userId: ulaz.korisnikId,
      tip: TIP_ISPRAVAK_BERBE,
      izmjene,
    });

    // STAVKE PUNJENJA te berbe — ista polja, gdje ih stavka ima.
    const stavkeClana = await tx.punjenjeStavka.findMany({
      where: { berbaId: clan.id, obrisano: false },
      select: { id: true },
    });
    for (const st of stavkeClana) {
      const d: Record<string, unknown> = {};
      for (const i of izmjene) {
        const naStavci = NA_STAVCI[i.polje as PoljeIspravka];
        if (naStavci) d[naStavci] = poslije[i.polje as PoljeIspravka];
        if (
          i.polje === "kolicinaKgGrozdja" &&
          st.id === clan.izvornaPunjenjeStavkaId
        ) {
          d.kolicinaKgGrozdja = poslije.kolicinaKgGrozdja;
        }
      }
      if (d.nazivSorte !== undefined && sortaId !== undefined) d.sortaId = sortaId;
      if (Object.keys(d).length === 0) continue;
      await tx.punjenjeStavka.update({ where: { id: st.id }, data: d });
      stavki++;
    }
  }

  if (zapisa === 0) {
    throw new IspravakBerbeGreska("Nista se nije promijenilo — sva polja su ista kao sada.");
  }

  const novaGlava = uskladi({ ...stanjeZapisa(glava), ...promjene });
  const noviKljuc = kljucGrupeBerbe({
    datumBerbe: novaGlava.datumBerbe as Date | null,
    datumUlaska: glava.datumUlaska,
    nazivSorte: String(novaGlava.nazivSorte),
    parcela: novaGlava.parcela as string | null,
  });

  return {
    zapisa,
    stavki,
    polja: [...promijenjenaPolja],
    upozorenja: {
      sorta: mijenjaSortu ? tankoviDanas : null,
      sudarGrupe: kljuceviOstalih.includes(noviKljuc),
    },
  };
}
