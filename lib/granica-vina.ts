import type { Prisma } from "@prisma/client";
import { satKretanja } from "@/lib/sat-knjige";

/**
 * GRANICA VINA — otkad je u tanku VINO KOJE JE U NJEMU SADA.
 * ======================================================================
 *
 * Nasljednik `lib/granica-arhive.ts`, i razlog je cijela faza D.
 *
 * DOSADASNJA GRANICA bila je trenutak zadnjeg ARHIVIRANJA. To je radilo samo
 * zato sto se pri svakom pretoku koji isprazni tank stvarala arhiva — dakle
 * zato sto je posuda, kad se isprazni, dobivala zapis. Cim se arhiviranje
 * prestane raditi pri premjestanju vina (a to je smisao faze D: vino se
 * arhivira kad ode u bocu ili rinfuzu, ne kad predje u drugi tank), te granice
 * vise nema — i odmah se vidi da je nikad nije ni trebalo biti:
 *
 *   - filtracija prazni tank BEZ arhiviranja (`lib/filtracija.ts`, „CEKA SE
 *     KRAJ BERBE"), pa cetiri prazna tanka danas nemaju granicu i na njima
 *     filtar ne rezuje nista;
 *   - arhiva je zapis o VINU, a pitanje „sto pokazati na ovom ekranu" je
 *     pitanje o POSUDI: otkad je u njoj ovo sto je sada unutra.
 *
 * NOVA GRANICA se racuna iz knjige: tank se prati kroz vrijeme i pamti se
 * zadnji trenutak u kojem je bio PRAZAN. Sve poslije toga pripada vinu koje je
 * u njemu danas; sve prije toga pripada necem drugom.
 *
 * Knjiga je za to jedini posten izvor — ona se samo dopisuje, zna i litre i
 * trenutak, i po njoj se stanje vec racuna svugdje drugdje (`stanjeTanka`).
 * `Tank.kolicinaVinaUTanku` zna samo danasnji broj i o proslosti ne moze reci
 * nista.
 *
 * SAT je `lib/sat-knjige.ts` — ono sto je ranije od `dogodenoAt` i `createdAt`.
 * Bez njega bi unatrag datirano punjenje (202 od 577 redaka) palo iza pretoka
 * koji ga je iznio iz tanka.
 *
 * PRAG OD JEDNE LITRE. Prazno nije „tocno 0 ml" nego „ispod litre": pretok
 * ostavi mililitre zaokruzivanja, a tank s 300 ml nije tank s vinom. Isti prag
 * (`PRAZNO_PRAG`) vec koristi `app/api/izlaz-vina/route.ts` kad odlucuje je li
 * tank ispraznjen do kraja.
 */

/**
 * Samo dvije tablice koje ova racunica cita — ne cijeli klijent.
 *
 * Uski tip, kao `Citac` u lib/mjerenja.ts: pozivatelj koji sam radi s
 * ogranicenim klijentom (a takvih je vise) ne mora imati punog `PrismaClient`
 * da bi dobio granicu. `PrismaClient` i `TransactionClient` oba zadovoljavaju
 * ovaj oblik.
 */
type Klijent = Pick<
  Prisma.TransactionClient,
  "berbaKretanje" | "punjenjeTanka"
>;

/** Ispod ovoga se tank smatra praznim. Mililitri. */
export const PRAZNO_ML = 1_000;

export type GranicaVina = {
  /**
   * Otkad je u tanku ovo vino. `null` znaci „nema granice":
   *   - tank je danas prazan (nema vina o kojem bi se govorilo), ili
   *   - knjiga za taj tank ne zna nista (nijedan redak).
   * Oba slucaja prikaz mora razlikovati, pa uz granicu ide i `razlog`.
   */
  odAt: Date | null;
  razlog: "PUNJENJE" | "PRAZAN" | "OTISLO" | "NEMA_KNJIGE";
  /** Koliko je vina u tanku po knjizi, u litrama. */
  litre: number;
};

/**
 * Sirovi retci knjige za jedan tank, u obliku koji ova racunica treba.
 * Odvojeno od racuna da se isti racun moze pokrenuti nad vec procitanim
 * retcima (test, ili stranica koja knjigu ionako cita).
 */
export type RedakZaGranicu = {
  uTankId: string | null;
  izTankId: string | null;
  litre: number;
  dogodenoAt: Date;
  createdAt: Date;
  /** Punjenje kojim je redak nastao, ako ga ima. Vidi `datumiPunjenja`. */
  punjenjeId?: string | null;
};

/**
 * KAD JE VINO FIZICKI USLO, kad se to razlikuje od trenutka upisa.
 *
 * Knjiga za dio ULAZ redaka nosi trenutak UPISA, ne datum iz forme: tank 30 je
 * napunjen 01.06. u 12:24, a redak je upisan 16.06. u 10:38. Mjerenje od
 * 03.06. pripada bas tom vinu — ono je vec bilo u tanku — pa bi granica na
 * 16.06. sakrila mjerenje vina koje je u tanku i danas.
 *
 * Zato se za redak nastao punjenjem uzima RANIJE od to dvoje. Isto pravilo
 * kao sat knjige, samo nad jos jednim izvorom: najraniji trenutak za koji se
 * zna da je vino bilo u tanku.
 */
export type DatumiPunjenja = Map<string, Date>;

/**
 * CISTI RACUN — bez baze, pa se testira bez transakcije.
 *
 * Retci se poredaju po satu i preklapaju. Pamti se trenutak PRVOG retka nakon
 * zadnjeg praznjenja: to je cas kad je u tank uslo vino koje je u njemu danas.
 *
 * Zasto prvi redak NAKON praznjenja, a ne sam trenutak praznjenja: izmedju
 * dva vina tank zna stajati prazan tjednima. Granica na trenutku praznjenja
 * pustila bi kroz sve sto se u tom praznom razdoblju dogodilo — a to nije
 * povijest ovog vina nego povijest prazne posude.
 */
export function izracunajGranicuVina(
  tankId: string,
  redci: RedakZaGranicu[],
  datumiPunjenja?: DatumiPunjenja,
  /**
   * Racunaj granicu kakva je bila U TOM TRENUTKU, ne danas.
   *
   * Treba onome tko cita tudi tank kao sastavnicu blenda: pitanje nije „sto je
   * u tanku 5 sada" nego „kakvo je bilo vino koje je iz tanka 5 doslo ovamo",
   * a to je vino koje je ondje bilo u trenutku pretoka. Bez ovoga bi
   * sastavnica citala sljedece vino tog tanka, ili nista ako je tank prazan.
   */
  doTrenutka?: Date | null,
  /**
   * Kad je tank u tom trenutku PRAZAN, opisi vino koje je upravo otislo
   * umjesto da kazes da vina nema.
   *
   * Treba sastavnici blenda: redak nastaje u trenutku pretoka, a pretok je
   * izvor do tada vec ispraznio. Bez ovoga bi sastavnica citala prazan tank i
   * ne bi dala nijedno polje — izmjereno, devet od sesnaest zivih pokazivaca.
   */
  zadnjeVino?: boolean
): GranicaVina {
  if (redci.length === 0) {
    return { odAt: null, razlog: "NEMA_KNJIGE", litre: 0 };
  }

  const poredani = redci
    .map((r) => {
      const sat = satKretanja(r);
      const punjeno = r.punjenjeId
        ? datumiPunjenja?.get(r.punjenjeId)?.getTime()
        : undefined;

      return {
        // Najraniji trenutak za koji se zna da je vino bilo u tanku.
        sat: punjeno != null ? Math.min(sat, punjeno) : sat,
        // Poredak i dalje po satu knjige — datum iz forme smije pomaknuti
        // granicu unatrag, ali ne smije prerasporediti same dogadaje.
        poredak: sat,
        ml:
          (r.uTankId === tankId ? Math.round(Number(r.litre) * 1000) : 0) -
          (r.izTankId === tankId ? Math.round(Number(r.litre) * 1000) : 0),
      };
    })
    .sort((a, b) => a.poredak - b.poredak);

  let ml = 0;
  let pocetakMs: number | null = null;
  /** Pocetak zadnjeg punjenja koje je ZAVRSILO praznjenjem. Vidi `zadnjeVino`. */
  let pocetakOtislog: number | null = null;
  const granicaMs = doTrenutka ? doTrenutka.getTime() : null;

  for (const r of poredani) {
    // Ukljucivo, kao i `doTrenutkaSQL`: ono sto se dogodilo u istoj sekundi
    // dio je onoga sto se tada citalo.
    if (granicaMs !== null && r.poredak > granicaMs) break;

    const prijeMl = ml;
    ml += r.ml;

    // Tank je bio prazan pa je vino uslo — ovdje pocinje danasnje vino.
    if (prijeMl < PRAZNO_ML && ml >= PRAZNO_ML) {
      pocetakMs = r.sat;
    }

    // Tank se ispraznio — sve do sada pripada vinu kojeg vise nema.
    if (ml < PRAZNO_ML) {
      if (pocetakMs !== null) pocetakOtislog = pocetakMs;
      pocetakMs = null;
    }
  }

  const litre = Math.round(ml) / 1000;

  if (ml < PRAZNO_ML || pocetakMs === null) {
    // Prazan tank NEMA vino — osim kad se izricito pita za ono koje je upravo
    // otislo. Tada se vraca granica tog, zadnjeg punjenja.
    if (zadnjeVino && pocetakOtislog !== null) {
      return {
        odAt: pocetakDana(pocetakOtislog),
        razlog: "OTISLO",
        litre: Math.max(0, litre),
      };
    }

    return { odAt: null, razlog: "PRAZAN", litre: Math.max(0, litre) };
  }

  return { odAt: pocetakDana(pocetakMs), razlog: "PUNJENJE", litre };
}

/**
 * Granica se spusta na POCETAK DANA u kojem je vino uslo.
 *
 * Mjerenja i zadaci se redovno upisuju s datumom bez vremena, dakle na ponoc:
 * tank 40 ima mjerenje 05.09. u 00:00, a vino je po knjizi uslo 05.09. u
 * 08:47. Granica u 08:47 sakrila bi mjerenje TOG vina zbog osam sati.
 *
 * Sat ostaje pun unutar racuna (redoslijed dogadaja se ne dira) — zaokruzuje
 * se tek ono sto ide van, i to samo prema dolje. Granica time nikad ne rezuje
 * vise nego sto bi rezao puni sat.
 */
function pocetakDana(ms: number): Date {
  const d = new Date(ms);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
}

/** Datumi punjenja za retke knjige koji su nastali punjenjem. */
async function citajDatumePunjenja(
  db: Klijent,
  redci: RedakZaGranicu[]
): Promise<DatumiPunjenja> {
  const ids = [...new Set(redci.map((r) => r.punjenjeId).filter(Boolean))] as string[];
  if (ids.length === 0) return new Map();

  const punjenja = await db.punjenjeTanka.findMany({
    where: { id: { in: ids } },
    select: { id: true, datumPunjenja: true },
  });

  return new Map(punjenja.map((p) => [p.id, p.datumPunjenja]));
}

/** Granica vina za jedan tank. Dva upita. */
export async function granicaVina(
  db: Klijent,
  tankId: string,
  opts?: { doTrenutka?: Date | null; zadnjeVino?: boolean }
): Promise<GranicaVina> {
  const redci = await db.berbaKretanje.findMany({
    where: { OR: [{ uTankId: tankId }, { izTankId: tankId }] },
    select: {
      uTankId: true,
      izTankId: true,
      litre: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });

  return izracunajGranicuVina(
    tankId,
    redci,
    await citajDatumePunjenja(db, redci),
    opts?.doTrenutka,
    opts?.zadnjeVino
  );
}

/**
 * Granica vina za SVE tankove — jedan upit za cijeli podrum.
 *
 * Postoji iz istog razloga kao `stanjeSvihTankova`: 48 odvojenih upita je
 * tocno ono sto lib/paralelno.ts zabranjuje (pooler drzi 15 veza za CIJELU
 * aplikaciju).
 */
export async function granicaSvihTankova(
  db: Klijent
): Promise<Map<string, GranicaVina>> {
  const redci = await db.berbaKretanje.findMany({
    select: {
      uTankId: true,
      izTankId: true,
      litre: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });

  const datumi = await citajDatumePunjenja(db, redci);
  const poTanku = new Map<string, RedakZaGranicu[]>();

  for (const r of redci) {
    for (const tankId of [r.uTankId, r.izTankId]) {
      if (!tankId) continue;
      const popis = poTanku.get(tankId) ?? [];
      popis.push(r);
      poTanku.set(tankId, popis);
    }
  }

  const mapa = new Map<string, GranicaVina>();
  for (const [tankId, popis] of poTanku) {
    mapa.set(tankId, izracunajGranicuVina(tankId, popis, datumi));
  }

  return mapa;
}

/**
 * Prevedi granicu u Prisma `where` fragment nad DateTime poljem.
 *
 * Isti oblik kao `odGranice` u lib/granica-arhive.ts, pa se pozivi zamjenjuju
 * jedan za jedan. `null` daje `undefined` — Prisma to cita kao „nema uvjeta",
 * sto je ponasanje tanka koji nikad nije bio prazan.
 */
export function odGraniceVina(
  g: GranicaVina | null | undefined
): { gte: Date } | undefined {
  if (g?.odAt) return { gte: g.odAt };

  // PRAZAN TANK NE POKAZUJE NICIJU POVIJEST.
  //
  // Ovdje `null` ne smije znaciti „nema uvjeta". Prazan tank nema vino o
  // kojem bi govorio, a sve sto na njemu stoji pripada vinu koje je otislo.
  // Dok arhiviranje te zapise brise, razlika se ne vidi — ali faza D upravo
  // to brisanje ukida, pa bi bez ovoga ispraznjen tank pokazao mjerenja
  // prethodnog vina kao svoja.
  //
  // `NEMA_KNJIGE` je drugi slucaj i ostaje bez uvjeta: ondje knjiga nema sto
  // reci, pa se ne smije praviti da zna da nema nicega.
  if (g?.razlog === "PRAZAN") return { gte: KRAJ_VREMENA };

  return undefined;
}

/**
 * Datum iza svega sto u bazi moze postojati — filtar koji ne propusta nista.
 * Godina 9999 je unutar raspona Postgresova `timestamptz`.
 */
export const KRAJ_VREMENA = new Date("9999-12-31T00:00:00.000Z");
