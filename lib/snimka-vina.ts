import { Prisma } from "@prisma/client";
import { granicaVina } from "@/lib/granica-vina";
import { imeVina, type ImeVina } from "@/lib/ime-vina";
import {
  mjerenjaTrenutnogVina,
  parametriBlenda,
  sloziPoPolju,
  type RedakMjerenja,
} from "@/lib/mjerenja";
import {
  vrijednostiMonitora,
  type IzborPolja,
  type PodrijetloMonitora,
} from "@/lib/monitor-vina";
import { parametriVinaIzKnjige } from "@/lib/parametri-vina";
import { punjenjaTrenutnogVina } from "@/lib/punjenje-vina";
import { rastaviKljucCina } from "@/lib/prosli-tank";

/**
 * SNIMKA VINA KOJE IZLAZI — vino kakvo je bilo u trenutku kad (dio) napusta
 * posudu.
 * ======================================================================
 *
 * Odluke vlasnika 29.09.2026. (AGENTS.md, "Arhivira se VINO, ne tank"):
 * snimka za SVAKI izvor pri SVAKOM pretoku i filtraciji/flotaciji/talozenju,
 * i djelomicnom, te pri SVAKOM izlazu. Komponenta koja ode u cuvée (razina 2
 * arhive) cita SAMO snimku.
 *
 * Sprema: vrijednosti monitora po polju (isti izbor kao stranica tanka,
 * lib/monitor-vina.ts), `VinoRadnja` retke s `udio` i `jeKvasac`, litre, ime,
 * sortu i godiste.
 *
 * MORA NASTATI PRIJE `ocistiVinoRadnje` (lib/prazni-tank.ts), U ISTOJ
 * TRANSAKCIJI. `VinoRadnja` je jedini tocan izvor udjela kvasca; odigravanje
 * knjige grijesi (T7/T20). Kad se izvor isprazni, redci nestaju, a s njima i
 * jedini tocan zapis.
 *
 * AKO SNIMKA PADNE, PADA I CIN. Namjerno: pretok bez snimke je TRAJNA rupa u
 * jedinom tocnom izvoru kvasaca — nema je iz cega naknadno sloziti. Zato se
 * greska ne hvata ni ovdje ni kod pozivatelja.
 *
 * CIJENA — izmjereno 29.09.2026. (scripts/mjeri-snimku.ts, rollback nad
 * pravim podacima, s lokalnog racunala, ~22 ms po upitu):
 *   - pretok s pet izvora BEZ snimke 2,4–2,8 s (99 upita),
 *     SA snimkom 6,2–6,4 s (254 upita);
 *   - timeout transakcije pretoka 30 s, prag vlasnika 10 s — iznad njega
 *     snimka ne ide u transakciju nego drugim putem, i to je druga odluka;
 *   - jedan izvor: median 0,4 s / 16 upita, upis uvijek 3 upita;
 *   - najskuplji je T42 (1,3 s / 56 upita) zbog blenda od 14 izvora: trosak
 *     raste s brojem BLEND IZVORA, ne s kolicinom vina.
 * Kad se usporenje pojavi na produkciji, mjerenje se ponavlja istim alatom.
 *
 * `parametriBlenda` ovdje ide sa `sirina: 1`. Usporedni upiti na istoj vezi
 * transakcije pucaju s pg@9 (vidi lib/paralelno.ts); stranica tanka smije 2
 * jer ne radi u transakciji.
 */

type Tx = Prisma.TransactionClient;

/** Na sto se snimka vjesa — tocno jedno (CHECK u bazi). */
export type CinSnimke =
  | { cin: "PRETOK"; pretokId: string }
  | { cin: "FILTRACIJA" | "FLOTACIJA" | "TALOZENJE"; zadatakId: string }
  | { cin: "PUNJENJE" | "PRODAJA"; izlazVinaId: string };

export type UlazSnimke = CinSnimke & {
  tankId: string;
  /** Trenutak cina. Po njemu se sudi i fermentira li vino (monitor). */
  dogodenoAt: Date;
  /**
   * Litre prije cina, koliko je UKUPNO izaslo i je li izvor ostao prazan.
   * Salje ih pozivatelj iz SVOG racuna u mililitrima — pravilo "pao na nulu"
   * smije postojati samo na jednom mjestu, u cinu.
   */
  litrePrije: number;
  litreOtislo: number;
  ispraznjen: boolean;
  korisnikId: string | null;
  arhivaVinaId?: string | null;
};

const PODRIJETLO: Record<
  PodrijetloMonitora,
  "MJERENO" | "PRENESENO" | "BLEND" | "KNJIGA" | "NEMA"
> = {
  mjereno: "MJERENO",
  preneseno: "PRENESENO",
  blend: "BLEND",
  knjiga: "KNJIGA",
  nema: "NEMA",
};

/**
 * Monitor tanka onako kako ga stranica tanka racuna — isti upiti, isti
 * redoslijed pravila, samo u nizu (transakcija ima jednu vezu).
 *
 * Stranica cita iste stvari u svojim valovima uz jos dvadesetak drugih, pa
 * ovo nije zajednicki citac nego njegov prijepis. Da se ne razidju, pazi
 * scripts/test-snimka-vina.ts: usporeduje snimku s neovisnim prijepisom
 * stranice.
 */
export async function procitajMonitorVina(
  tx: Tx,
  tankId: string,
  sada: Date
): Promise<{
  izbor: IzborPolja[];
  ime: ImeVina;
  tank: { broj: number; godiste: number | null };
}> {
  const tank = await tx.tank.findUniqueOrThrow({
    where: { id: tankId },
    select: {
      broj: true,
      godiste: true,
      _count: { select: { blendIzvori: true } },
    },
  });

  const granica = await granicaVina(tx, tankId);
  const tankBezVina = granica.razlog === "PRAZAN";

  const mjerenja = await tx.mjerenje.findMany({
    where: { tankId },
    orderBy: { izmjerenoAt: "desc" },
    take: 200,
  });

  const svaPunjenja = await tx.punjenjeTanka.findMany({
    where: { tankId, stavke: { some: { obrisano: false } } },
    orderBy: { datumPunjenja: "desc" },
    include: {
      stavke: { where: { obrisano: false }, orderBy: { createdAt: "asc" } },
    },
  });

  const kretanjaTanka = await tx.berbaKretanje.findMany({
    where: { OR: [{ uTankId: tankId }, { izTankId: tankId }] },
    select: {
      id: true,
      uTankId: true,
      izTankId: true,
      berbaId: true,
      litre: true,
      vrsta: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });

  const parametriVina = await parametriVinaIzKnjige(tx, tankId);

  const blend =
    tank._count.blendIzvori > 0
      ? await parametriBlenda(tx, tankId, { sirina: 1 })
      : null;

  const ime = await imeVina(tx, tankId, granica);

  const pripadnost = punjenjaTrenutnogVina(
    tankId,
    svaPunjenja,
    kretanjaTanka,
    granica.odAt
  );

  const mjerenjaZaParametre = (
    tankBezVina
      ? []
      : mjerenjaTrenutnogVina(mjerenja, granica.odAt, pripadnost.pocetnaMjerenja)
  ) as unknown as RedakMjerenja[];

  const izbor = vrijednostiMonitora({
    poPolju: sloziPoPolju(mjerenjaZaParametre),
    blend,
    parametriVina,
    tankBezVina,
    sada,
  });

  return { izbor, ime, tank: { broj: tank.broj, godiste: tank.godiste } };
}

/** Kad je prikazana vrijednost izmjerena. Blend je racun nad vise datuma. */
function izmjerenoAt(o: IzborPolja): Date | null {
  switch (o.podrijetlo) {
    case "mjereno":
    case "preneseno":
      return o.vlastito?.izmjerenoAt ?? null;
    case "knjiga":
      return o.izKnjige?.najnovijeAt ?? null;
    default:
      return null;
  }
}

/**
 * Snimi vino koje izlazi iz `tankId`. Vraca id snimke.
 *
 * Poziva se nakon zakljucavanja tankova i nakon svih provjera koje mogu reci
 * NE, a PRIJE nego se izvor pocne umanjivati ili prazniti.
 */
export async function snimiVinoKojeIzlazi(
  tx: Tx,
  u: UlazSnimke
): Promise<string> {
  const { izbor, ime, tank } = await procitajMonitorVina(
    tx,
    u.tankId,
    u.dogodenoAt
  );

  // Bez granice, isto kao stranica tanka: `VinoRadnja` na tanku je uvijek
  // danasnje vino, jer se pri praznjenju brise.
  const vinoRadnje = await tx.vinoRadnja.findMany({
    where: { tankId: u.tankId },
  });

  const snimka = await tx.snimkaVina.create({
    data: {
      tankId: u.tankId,
      brojTanka: tank.broj,
      cin: u.cin,
      pretokId: u.cin === "PRETOK" ? u.pretokId : null,
      zadatakId: "zadatakId" in u ? u.zadatakId : null,
      izlazVinaId: "izlazVinaId" in u ? u.izlazVinaId : null,
      arhivaVinaId: u.arhivaVinaId ?? null,
      dogodenoAt: u.dogodenoAt,
      litrePrije: u.litrePrije,
      litreOtislo: u.litreOtislo,
      ispraznjen: u.ispraznjen,
      nazivVina: ime.naziv,
      sorta: ime.deklariranaSorta,
      // ZAMRZNUTA: komponenta koja ode u cuvée nosi sifru ovdje i ne
      // prenosi je nikome (odluka vlasnika 30.09.2026.).
      sifra: ime.sifra,
      godiste: tank.godiste,
      korisnikId: u.korisnikId,
    },
    select: { id: true },
  });

  // Redak za SVAKO polje, i kad vrijednosti nema: NEMA razlikuje "nije bilo"
  // od "nije snimljeno".
  await tx.snimkaVinaPolje.createMany({
    data: izbor.map((o) => ({
      snimkaVinaId: snimka.id,
      kljuc: o.kljuc,
      vrijednost: o.vrijednost,
      podrijetlo: PODRIJETLO[o.podrijetlo],
      izmjerenoAt: izmjerenoAt(o),
    })),
  });

  if (vinoRadnje.length > 0) {
    await tx.snimkaVinaRadnja.createMany({
      data: vinoRadnje.map((v) => ({
        snimkaVinaId: snimka.id,
        izvornaRadnjaId: v.izvornaRadnjaId,
        izvorniTankId: v.izvorniTankId,
        izvorniBrojTanka: v.izvorniBrojTanka,
        preparatId: v.preparatId,
        preparatNaziv: v.preparatNaziv,
        jedinicaNaziv: v.jedinicaNaziv,
        korisnikIme: v.korisnikIme,
        vrsta: v.vrsta,
        opis: v.opis,
        napomena: v.napomena,
        kolicina: v.kolicina,
        jeKvasac: v.jeKvasac,
        udio: v.udio,
        dogodenoAt: v.dogodenoAt,
      })),
    });
  }

  return snimka.id;
}

// ===========================================================================
// CITANJE — snimka za kucicu u sastavu (razina 2 arhive, /prosli-tank).
// ===========================================================================

/** Snimka sa svim poljima i radnjama. */
export type SnimkaSRetcima = Prisma.SnimkaVinaGetPayload<{
  include: { polja: true; radnje: true };
}>;

/** Vrste kretanja u knjizi koje nose snimku, i cini snimke koji im odgovaraju. */
const CINI_PO_VRSTI_KRETANJA: Record<string, ReadonlyArray<string>> = {
  PRETOK: ["PRETOK"],
  // Knjiga sva tri prijenosa bilježi kao FILTRACIJA (lib/filtracija.ts, 8b).
  FILTRACIJA: ["FILTRACIJA", "FLOTACIJA", "TALOZENJE"],
};

/**
 * Moze li kucica uopce imati snimku — cisti racun, bez upita.
 *
 * NE MOZE:
 *   - vino koje je u posudi vec bilo (`izTankId` je sam roditelj): ono nije
 *     izaslo, rodni cin ga je samo razrijedio;
 *   - kretanje koje nije izlazak vina: PONISTENJE i ISPRAVAK nose istu vezu
 *     kao cin koji ispravljaju, ULAZ i IZLAZ nisu prijenos medju posudama;
 *   - kljuc koji se ne da rastaviti, ili ciljni tank u kljucu nije roditelj
 *     (kucica i kljuc tada ne govore o istom ulasku).
 */
export function vezaZaSnimku(u: {
  kljucCina: string;
  izTankId: string;
  roditeljTankId: string;
}): { veza: string; vrsta: string } | null {
  if (u.izTankId === u.roditeljTankId) return null;

  const cin = rastaviKljucCina(u.kljucCina);
  if (!cin) return null;
  if (cin.ciljTankId !== u.roditeljTankId) return null;
  if (!(cin.vrsta in CINI_PO_VRSTI_KRETANJA)) return null;

  return { veza: cin.veza, vrsta: cin.vrsta };
}

/**
 * SNIMKA KUCICE — vino onakvo kakvo je bilo kad je izaslo iz `izTankId`
 * cinom iz `kljucCina`. `null` kad je nema; tada kucica radi kao prije
 * (knjiga, prijevod kvasaca). Staro se ne spasava, ali se ni ne skriva.
 *
 * JEDNOZNACNOST: veza je `pretokId` ili `zadatakId` (UUID, ne sudaraju se),
 * a jedinstveni indeksi (pretokId, tankId) i (zadatakId, tankId) jamce
 * najvise jedan redak. Cin u snimci mora odgovarati vrsti kretanja. Ako
 * ista od toga ne stoji — dva retka, krivi cin — vraca se `null`: bolje
 * kucica iz knjige nego pogodjena snimka.
 *
 * Jedan upit kad snimke nema, tri kad je ima (glava, polja, radnje).
 */
export async function snimkaKucice(
  db: { snimkaVina: Tx["snimkaVina"] },
  u: { kljucCina: string; izTankId: string; roditeljTankId: string }
): Promise<SnimkaSRetcima | null> {
  const v = vezaZaSnimku(u);
  if (!v) return null;

  const nadjene = await db.snimkaVina.findMany({
    where: {
      tankId: u.izTankId,
      OR: [{ pretokId: v.veza }, { zadatakId: v.veza }],
    },
    include: { polja: true, radnje: true },
    take: 2,
  });

  if (nadjene.length !== 1) return null;
  const s = nadjene[0];
  if (!CINI_PO_VRSTI_KRETANJA[v.vrsta].includes(s.cin)) return null;
  return s;
}

/**
 * SNIMKA IZLAZA po id-u — razina 1 arhive (/prosli-tank?snimka=).
 *
 * Samo snimka IZLAZA (punjenje u boce, prodaja). Snimka pretoka ili
 * filtracije je kucica u necijem stablu i otvara se preko korijena (razina
 * 2); ovdje bi vino bez stabla izgledalo kao da je otislo iz podruma.
 * Jedan upit.
 */
export async function snimkaIzlazaPoId(
  db: { snimkaVina: Tx["snimkaVina"] },
  id: string
): Promise<SnimkaSRetcima | null> {
  return db.snimkaVina.findFirst({
    where: { id, izlazVinaId: { not: null } },
    include: { polja: true, radnje: true },
  });
}

/** Ime iz snimke u obliku koji `imeZaPrikaz` prima. */
export function imeIzSnimke(
  s: Pick<SnimkaSRetcima, "nazivVina" | "sorta" | "sifra">
): ImeVina {
  return {
    naziv: s.nazivVina,
    deklariranaSorta: s.sorta,
    sifra: s.sifra,
    odAt: null,
    izvor: null,
    razlog: s.nazivVina ? "IMENOVANO" : "BEZIMENO",
    zapisId: null,
  };
}

/**
 * KVASCI IZ SNIMKE — udio je udio u vinu IZVORA u trenutku izlaska. Vino
 * koje izlazi je homogeno, pa je to tocno udio u vinu kucice: bez dijeljenja
 * s udjelom kucice u korijenu, bez "vise putova" i bez "nesklada".
 *
 * ZAMJENJUJE prijevod (`kvasciKucice`, lib/prosli-tank.ts) za kucicu sa
 * snimkom; ne stoji uz njega (vlasnik, 29.09.2026.) — dva broja bila bi dvije
 * tvrdnje o istom vinu. Snimka zapis ne popravlja nego ga zamrzava: kriva
 * tvrdnja u `VinoRadnja` (npr. FC-513) prenosi se jednako kao i danas.
 *
 * `jeKvasac` je oznaka iz trenutka cina; naknadno oznacavanje u katalogu
 * je ne mijenja (isto pravilo kao `VinoRadnja`).
 */
export function kvasciIzSnimke(s: Pick<SnimkaSRetcima, "radnje">) {
  return s.radnje
    .filter((r) => r.jeKvasac)
    .sort((a, b) => a.dogodenoAt.getTime() - b.dogodenoAt.getTime());
}
