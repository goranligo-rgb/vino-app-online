/**
 * BACKFILL — obnova knjige berbe iz zatecene povijesti.
 *
 * Pokretanje:
 *   npm run berba:backfill              suhi hod: NISTA ne pise, samo ispisuje
 *   npm run berba:backfill -- --upisi   stvarni upis, u jednoj transakciji
 *
 * SUHI HOD JE ZADAN. `--upisi` se mora napisati rukom. Razlog nije opreznost
 * nacelno nego to sto je ovo jednokratan cin nad produkcijskom bazom bez
 * kopije: kad se upise, natrag se ide samo brisanjem obiju tablica.
 *
 * ------------------------------------------------------------------------
 * STO OVO RADI
 * ------------------------------------------------------------------------
 * Knjiga berbe je prazna. Povijest podruma NIJE — postoji u petnaest zapisa
 * punjenja, 39 pretoka, cetiri prijenosna zadatka i osam izlaza. Backfill tu
 * povijest PROLAZI KRONOLOSKI i kroz lib/berba-knjiga.ts je zapisuje iznova,
 * pa knjiga na kraju kaze isto sto i tankovi danas kazu.
 *
 * Tri koraka:
 *
 *   1. ZAPISI BERBE — svaka `PunjenjeStavka` i svaka `ArhivaPunjenjeStavka`
 *      postaje jedan `Berba` redak s ULAZ kretanjem u tank u koji je vino
 *      tada uslo. Arhivske se broje jer im je original OBRISAN pri arhiviranju
 *      (lib/pretok-arhiviranje.ts) — kopija je jedino sto je od njih ostalo.
 *
 *   2. KRETANJA — pretoci, prijenosni zadaci i izlazi, redom kojim su se
 *      dogodili, svaki kroz `zabiljeziPrijenos` / `zabiljeziIzlaz`.
 *
 *   3. USAGLASAVANJE — na kraju se svaki tank usporedi s `kolicinaVinaUTanku`
 *      i razlika se zatvori.
 *
 * ------------------------------------------------------------------------
 * ZASTO KORAK 3 UOPCE TREBA: POVIJEST JE NEPOTPUNA
 * ------------------------------------------------------------------------
 * Backfill ne moze biti tocniji od podataka koje ima, a podaci imaju rupe koje
 * su nastale prije njega:
 *
 *   - STARO ARHIVIRANJE BRISALO JE IZLAZE. Osam arhiva ima `tipArhive`
 *     IZLAZ_VINA — tank je ispraznjen prodajom ili punjenjem u boce — a
 *     `IzlazVina` redaka za njih vise nema. `ArhivaVinaIzlaz` postoji tek od
 *     23.08.2026 i ima jedan jedini redak.
 *   - ARHIVIRANJE BRISE I PUNJENJA. Punjenja tanka arhiviranog PRIJE nego je
 *     `ArhivaPunjenjeTanka` uvedena (24.08.2026) nestala su bez kopije — zato
 *     29 arhiva ima samo cetiri arhivirana punjenja.
 *   - POCETNI POPIS NIJE BERBA. Vino koje je u podrumu bilo prije nego je
 *     aplikacija uvedena nema zapis o ulasku ni u kakvom obliku.
 *
 * Zato se na dva mjesta upisuju zapisi vrste ZATECENO:
 *
 *   NADOPUNA usred hoda — tank toci vino kojem knjiga ne zna podrijetlo.
 *     Alternativa bi bila preskociti taj pretok, cime bi otpalo i sve sto se
 *     iz njega dalje granalo. Ovako se rupa upise VIDLJIVO i prebrojivo.
 *   MANJAK na kraju — tank ima vise nego sto knjiga zna objasniti.
 *
 * I jedan slucaj u kojem se upisuje ISPRAVAK:
 *
 *   VISAK na kraju — knjiga tvrdi vise nego sto u tanku stvarno jest. To je
 *     obrisani izlaz kojem se izgubio trag. Litre se skidaju razmjerno, jer
 *     nema podatka koja je berba prodana; poznato ogranicenje, zapisano da se
 *     ne trazi dvaput.
 *
 * NIJEDNA OD TE TRI VRSTE REDAKA NE LAZE: svaka kaze tocno "ovdje se ne zna".
 * Suhi hod ih prebroji unaprijed, pa je njihov broj mjerilo koliko je zatecena
 * povijest cjelovita — i to se vidi PRIJE nego se ista upise.
 *
 * ------------------------------------------------------------------------
 * REDOSLIJED: `createdAt`, NE `datum`
 * ------------------------------------------------------------------------
 * Svaki dogadjaj ima dva vremena: kad ga je korisnik DATIRAO i kad je stvarno
 * upisan. Za redoslijed hoda vrijedi samo drugo. `datumPunjenja` je slobodan
 * unos i u ovoj bazi je datiran unatrag i po jedanaest dana (punjenje tanka 3:
 * upisano 12.06., datirano na 01.06.), pa bi po njemu vino izlazilo iz tanka
 * prije nego je u njega uslo. Isti rezon vec stoji u lib/granica-arhive.ts.
 *
 * Iznimka su prijenosni zadaci: ondje je `createdAt` trenutak ZADAVANJA, a
 * vino se pomaknulo tek pri izvrsenju, pa vrijedi `izvrsenoAt`.
 *
 * Datirani datumi se ne bacaju — `datumBerbe` ide na `Berba` redak, gdje mu
 * je i mjesto: on odgovara na "kad je grozdje ubrano", ne na "kojim redom".
 *
 * ------------------------------------------------------------------------
 * SUHI HOD I UPIS RACUNAJU ISTO
 * ------------------------------------------------------------------------
 * Suhi hod ne smije nista upisati, pa ne moze proci kroz transakciju — vodi
 * knjigu u memoriji. Ali RAZDIOBU ne racuna sam: zove `razdijeliIzlaz` iz
 * lib/berba-knjiga.ts, istu funkciju kojom racuna i upis. Postoji jedan hod
 * (`prodjiPovijest`) nad suceljem `Knjiga` i dvije njegove izvedbe. Da su to
 * dva odvojena racuna, suhi bi hod s vremenom pokazivao jedno a upis radio
 * drugo — a suhi hod postoji upravo zato da se upisu vjeruje.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { uLitre, uMl } from "../lib/filtracija";
import { jePrijenosVina, VRSTE_PRIJENOSA } from "../lib/vrste-prijenosa";
import { stanjeSvihTankova, stanjeTanka } from "../lib/berba-model";
import {
  BerbaGreska,
  planPrijenosa,
  razdijeliIzlaz,
  zabiljeziIzlaz,
  zabiljeziPrijenos,
  zabiljeziUlaz,
  type Tx,
  type UlazBerbe,
  type Veza,
} from "../lib/berba-knjiga";

// ---------------------------------------------------------------------------
// Zastavice
// ---------------------------------------------------------------------------

const ARGV = process.argv.slice(2);
const UPISI = ARGV.includes("--upisi");
const SVE_REDCI = ARGV.includes("--sve");

const OPIS_NADOPUNE =
  "Zateceno vino: tank ga je tocio, a u povijesti nema zapisa odakle je doslo. Vidi scripts/backfill-berba.ts.";
const OPIS_MANJKA =
  "Zateceno vino: tank ga ima, a povijest ne kaze odakle. Vidi scripts/backfill-berba.ts.";
const OPIS_VISKA =
  "Ispravak backfilla: knjiga je tvrdila vise nego sto je u tanku. Najvjerojatnije izlaz vina obrisan starim arhiviranjem.";

/** Ispod mililitra je zaokruzivanje, ne razlika. Isti prag kao provjeri-invarijante. */
const PRAG_ML = 1;

// ---------------------------------------------------------------------------
// Sucelje knjige — dvije izvedbe, jedan hod
// ---------------------------------------------------------------------------

type PodaciBerbe = Omit<UlazBerbe, "veza" | "dogodenoAt" | "napomenaKretanja">;

type NalogPrijenosa = {
  izvori: Array<{ tankId: string; litre: number }>;
  ciljevi: Array<{ tankId: string; litre: number }>;
  vrsta: "PRETOK" | "FILTRACIJA";
  veza: Veza;
  dogodenoAt: Date;
  korisnikId: string | null;
};

type NalogIzlaza = {
  tankId: string;
  litre: number;
  veza: Veza;
  dogodenoAt: Date;
  korisnikId: string | null;
  vrsta?: "IZLAZ" | "ISPRAVAK";
  napomena?: string | null;
};

interface Knjiga {
  ulaz(podaci: PodaciBerbe, veza: Veza, kada: Date, napomena?: string): Promise<string>;
  prijenos(nalog: NalogPrijenosa): Promise<void>;
  izlaz(nalog: NalogIzlaza): Promise<void>;
  /** Trenutno stanje jednog tanka, poredano tocno kao `stanjeTanka` u modelu. */
  stanje(tankId: string): Promise<Array<{ berbaId: string; ml: number }>>;
}

// ---------------------------------------------------------------------------
// Izvedba 1: knjiga u memoriji (suhi hod)
// ---------------------------------------------------------------------------

/**
 * Vodi iste zbrojeve koje bi vodila baza, ali nista ne upisuje.
 *
 * Poredak berbi u `stanje` MORA biti isti kao u `stanjeTanka` (lib/berba-model.ts):
 * kolicina silazno, pa id uzlazno. Taj poredak je ulaz u `podijeliMl`, pa bi
 * drukciji poredak pomicao mililitar-dva izmedju berbi i suhi hod bi pokazivao
 * brojeve koje upis nece proizvesti.
 */
class KnjigaUMemoriji implements Knjiga {
  /** tankId -> berbaId -> ml */
  private stanja = new Map<string, Map<string, number>>();

  private brojac = 0;

  /** Sve nastale berbe, redom nastanka. Ispis ih cita. */
  readonly berbe: Array<{ id: string; podaci: PodaciBerbe; kada: Date }> = [];

  /** Nadopune nastale usred hoda, po tanku. */
  readonly nadopune: Array<{ tankId: string; litre: number; kada: Date; zbog: string }> = [];

  private pomak(tankId: string | null, berbaId: string, ml: number) {
    if (!tankId) return;
    const tank = this.stanja.get(tankId) ?? new Map<string, number>();
    tank.set(berbaId, (tank.get(berbaId) ?? 0) + ml);
    this.stanja.set(tankId, tank);
  }

  async stanje(tankId: string) {
    const tank = this.stanja.get(tankId);
    if (!tank) return [];

    return Array.from(tank.entries())
      .map(([berbaId, ml]) => ({ berbaId, ml }))
      .filter((s) => s.ml > 0)
      .sort((a, b) => b.ml - a.ml || a.berbaId.localeCompare(b.berbaId));
  }

  async ulaz(podaci: PodaciBerbe, _veza: Veza, kada: Date): Promise<string> {
    const id = `mem-${++this.brojac}`;
    this.berbe.push({ id, podaci, kada });
    this.pomak(podaci.tankId, id, uMl(podaci.litre));
    return id;
  }

  /** Manjak u izvoru -> nova ZATECENO berba, isto kao sto radi `izTanka` u knjizi. */
  private async pokrijManjak(tankId: string, trebaMl: number, kada: Date, zbog: string) {
    const imaMl = (await this.stanje(tankId)).reduce((z, s) => z + s.ml, 0);
    if (imaMl >= trebaMl) return;

    const manjakMl = trebaMl - imaMl;

    await this.ulaz(
      {
        tankId,
        litre: uLitre(manjakMl),
        vrstaUnosa: "ZATECENO",
        nazivSorte: "Nepoznato podrijetlo",
        napomena: OPIS_NADOPUNE,
      },
      {},
      kada
    );

    this.nadopune.push({ tankId, litre: uLitre(manjakMl), kada, zbog });
  }

  private async razdijeli(
    tankId: string,
    izlazMl: number,
    odredista: Array<string | null>,
    tezine: number[],
    kada: Date,
    zbog: string
  ) {
    await this.pokrijManjak(tankId, izlazMl, kada, zbog);

    const stanje = await this.stanje(tankId);

    for (const d of razdijeliIzlaz(stanje, izlazMl, tezine)) {
      this.pomak(tankId, d.berbaId, -d.ml);
      this.pomak(odredista[d.odrediste], d.berbaId, d.ml);
    }
  }

  async prijenos(n: NalogPrijenosa) {
    const izvori = n.izvori.map((i) => ({ tankId: i.tankId, ml: uMl(i.litre) })).filter((i) => i.ml > 0);
    const ciljevi = n.ciljevi.map((c) => ({ tankId: c.tankId, ml: uMl(c.litre) })).filter((c) => c.ml > 0);

    const kaloMl = izvori.reduce((z, i) => z + i.ml, 0) - ciljevi.reduce((z, c) => z + c.ml, 0);

    const odredista: Array<string | null> = ciljevi.map((c) => c.tankId);
    const odredistaMl = ciljevi.map((c) => c.ml);

    if (kaloMl > 0) {
      odredista.push(null);
      odredistaMl.push(kaloMl);
    }

    // Isti racun kao u `zabiljeziPrijenos` — i to zato sto je to ista funkcija,
    // ne njezina kopija.
    const matrica = planPrijenosa(
      izvori.map((i) => i.ml),
      odredistaMl
    );

    for (let s = 0; s < izvori.length; s++) {
      await this.razdijeli(
        izvori[s].tankId,
        izvori[s].ml,
        odredista,
        matrica[s],
        n.dogodenoAt,
        n.vrsta
      );
    }
  }

  async izlaz(n: NalogIzlaza) {
    const ml = uMl(n.litre);
    await this.razdijeli(n.tankId, ml, [null], [ml], n.dogodenoAt, n.vrsta ?? "IZLAZ");
  }

  /** Zbroj po tanku, u mililitrima — za zavrsno usaglasavanje. */
  zbrojPoTanku(): Map<string, number> {
    const rezultat = new Map<string, number>();

    for (const [tankId, tank] of this.stanja) {
      let ml = 0;
      for (const v of tank.values()) ml += v;
      rezultat.set(tankId, ml);
    }

    return rezultat;
  }
}

// ---------------------------------------------------------------------------
// Izvedba 2: knjiga u bazi (stvarni upis)
// ---------------------------------------------------------------------------

class KnjigaUBazi implements Knjiga {
  constructor(private tx: Tx) {}

  async stanje(tankId: string) {
    return (await stanjeTanka(this.tx, tankId)).map((s) => ({ berbaId: s.berbaId, ml: s.ml }));
  }

  async ulaz(podaci: PodaciBerbe, veza: Veza, kada: Date, napomena?: string): Promise<string> {
    const r = await zabiljeziUlaz(this.tx, {
      ...podaci,
      veza,
      dogodenoAt: kada,
      napomenaKretanja: napomena ?? null,
    });
    return r.berbaId;
  }

  async prijenos(n: NalogPrijenosa) {
    await zabiljeziPrijenos(this.tx, {
      izvori: n.izvori,
      ciljevi: n.ciljevi,
      vrsta: n.vrsta,
      veza: n.veza,
      korisnikId: n.korisnikId,
      dogodenoAt: n.dogodenoAt,
      // Povijest ima rupe — vidi zaglavlje. Ovo je JEDINI pozivatelj koji
      // smije nadopunjavati; u redovnom radu manjak mora puknuti.
      naManjak: "ZATECENO",
      opisManjka: OPIS_NADOPUNE,
    });
  }

  async izlaz(n: NalogIzlaza) {
    await zabiljeziIzlaz(this.tx, {
      tankId: n.tankId,
      litre: n.litre,
      vrsta: n.vrsta,
      veza: n.veza,
      korisnikId: n.korisnikId,
      dogodenoAt: n.dogodenoAt,
      napomena: n.napomena ?? null,
      naManjak: "ZATECENO",
      opisManjka: OPIS_NADOPUNE,
    });
  }
}

// ---------------------------------------------------------------------------
// Citanje povijesti
// ---------------------------------------------------------------------------

/**
 * BERBA ili ZATECENO?
 *
 * Jedini podatak koji o tome nesto kaze je `datumBerbe`. Zapis s datumom
 * berbe je pravi unos grozdja; zapis bez njega je pocetni popis vina koje je
 * u podrumu vec bilo kad je aplikacija uvedena. To potvrdjuje i sama baza:
 * jedanaest zapisa bez datuma berbe nosi datume punjenja 28.05. i 01.06., a
 * grozdje se u ovom podrumu bere u kolovozu i rujnu.
 *
 * Godina se NE NAGADJA iz datuma punjenja. Punjenje od 01.06.2026. ne dokazuje
 * berbu 2026. — vino je moglo biti i starije. Prazno polje je istina koja se
 * kasnije moze ispraviti; izmisljena godina se ne moze ni prepoznati.
 */
function vrstaUnosaZa(datumBerbe: Date | null): "BERBA" | "ZATECENO" {
  return datumBerbe ? "BERBA" : "ZATECENO";
}

type Dogadjaj = {
  trenutak: Date;
  /** Pri istom trenutku prvo ulazi vino, pa se onda seli, pa izlazi. */
  prioritet: number;
  /** Zadnji rasplet, da poredak ne ovisi o redoslijedu citanja iz baze. */
  kljuc: string;
  opis: string;
  primijeni: (k: Knjiga) => Promise<void>;
};

type Povijest = {
  dogadjaji: Dogadjaj[];
  /** Zapisi berbe, u obliku spremnom i za ispis i za upis. */
  ulazi: Array<{ podaci: PodaciBerbe; veza: Veza; kada: Date; izvor: string }>;
  /** Sto se pri citanju moralo preskociti i zasto. */
  upozorenja: string[];
};

async function procitajPovijest(): Promise<Povijest> {
  const dogadjaji: Dogadjaj[] = [];
  const ulazi: Povijest["ulazi"] = [];
  const upozorenja: string[] = [];

  // --- 1. Punjenja zivih tankova ------------------------------------------
  const punjenja = await prisma.punjenjeTanka.findMany({
    include: { stavke: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  for (const p of punjenja) {
    for (const s of p.stavke) {
      if (s.obrisano) {
        upozorenja.push(
          `Preskocena obrisana stavka punjenja ${s.id} (${s.nazivSorte}, ${s.kolicinaLitara} L) — obrisana je kao pogresan unos.`
        );
        continue;
      }

      ulazi.push({
        izvor: `PunjenjeStavka ${s.id}`,
        kada: p.createdAt,
        veza: { punjenjeId: p.id },
        podaci: {
          tankId: p.tankId,
          litre: Number(s.kolicinaLitara ?? 0),
          vrstaUnosa: vrstaUnosaZa(s.datumBerbe),
          nazivSorte: s.nazivSorte,
          sortaId: s.sortaId,
          datumBerbe: s.datumBerbe,
          godinaBerbe: s.godinaBerbe,
          kolicinaKgGrozdja: s.kolicinaKgGrozdja,
          polozaj: s.polozaj,
          parcela: s.parcela,
          vinograd: s.vinograd,
          oznakaBerbe: s.oznakaBerbe,
          secer: s.secer,
          kiseline: s.kiseline,
          ph: s.ph,
          maceracija: s.maceracija,
          maceracijaSati: s.maceracijaSati,
          napomena: s.napomenaBerbe,
          korisnikId: p.korisnikId,
          izvornaPunjenjeStavkaId: s.id,
        },
      });
    }
  }

  // --- 2. Punjenja iz arhive ----------------------------------------------
  // Njihovi originali su OBRISANI pri arhiviranju. Kopija je jedino sto
  // postoji, pa se broji ravnopravno.
  const arhivskaPunjenja = await prisma.arhivaPunjenjeTanka.findMany({
    include: {
      stavke: { orderBy: { createdAt: "asc" } },
      arhivaVina: { select: { tankId: true, brojTanka: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const p of arhivskaPunjenja) {
    const tankId = p.arhivaVina.tankId;

    if (!tankId) {
      upozorenja.push(
        `Preskoceno arhivsko punjenje ${p.id} (arhiva tanka ${p.arhivaVina.brojTanka ?? "?"}) — arhiva nema tankId, pa se ne zna u koji je tank vino uslo.`
      );
      continue;
    }

    for (const s of p.stavke) {
      ulazi.push({
        izvor: `ArhivaPunjenjeStavka ${s.id}`,
        // `createdAt` arhivske kopije je PRENESEN s originala
        // (lib/pretok-arhiviranje.ts), pa je to i dalje trenutak punjenja.
        kada: p.createdAt,
        veza: { punjenjeId: p.izvornoPunjenjeId ?? p.id },
        podaci: {
          tankId,
          litre: Number(s.kolicinaLitara ?? 0),
          vrstaUnosa: vrstaUnosaZa(s.datumBerbe),
          nazivSorte: s.nazivSorte,
          sortaId: s.sortaId,
          datumBerbe: s.datumBerbe,
          godinaBerbe: s.godinaBerbe,
          kolicinaKgGrozdja: s.kolicinaKgGrozdja,
          polozaj: s.polozaj,
          parcela: s.parcela,
          vinograd: s.vinograd,
          oznakaBerbe: s.oznakaBerbe,
          secer: s.secer,
          kiseline: s.kiseline,
          ph: s.ph,
          maceracija: s.maceracija,
          maceracijaSati: s.maceracijaSati,
          napomena: s.napomenaBerbe,
          izvornaArhivaStavkaId: s.id,
        },
      });
    }
  }

  for (const u of ulazi) {
    dogadjaji.push({
      trenutak: u.kada,
      prioritet: 0,
      kljuc: u.izvor,
      opis: `ULAZ ${u.podaci.nazivSorte} ${u.podaci.litre} L`,
      primijeni: (k) => k.ulaz(u.podaci, u.veza, u.kada).then(() => undefined),
    });
  }

  // --- 3. Pretoci ----------------------------------------------------------
  const pretoci = await prisma.pretok.findMany({
    include: { izvori: true, ciljevi: true },
    orderBy: { createdAt: "asc" },
  });

  for (const p of pretoci) {
    const izvori = p.izvori.map((i) => ({ tankId: i.tankId, litre: Number(i.kolicina ?? 0) }));
    const ciljevi = p.ciljevi.map((c) => ({ tankId: c.tankId, litre: Number(c.kolicina ?? 0) }));

    if (izvori.length === 0) {
      upozorenja.push(`Preskocen pretok ${p.id} (${p.createdAt.toISOString()}) — nema nijedan izvor.`);
      continue;
    }

    dogadjaji.push({
      trenutak: p.createdAt,
      prioritet: 1,
      kljuc: `pretok:${p.id}`,
      opis: `PRETOK ${p.tip}`,
      primijeni: (k) =>
        k.prijenos({
          izvori,
          ciljevi,
          vrsta: "PRETOK",
          veza: { pretokId: p.id },
          dogodenoAt: p.createdAt,
          korisnikId: p.korisnikId,
        }),
    });
  }

  // --- 4. Prijenosni zadaci (filtracija / flotacija / talozenje) -----------
  const zadaci = await prisma.zadatak.findMany({
    where: { vrsta: { in: [...VRSTE_PRIJENOSA] } },
    include: { tankStavke: true },
    orderBy: { createdAt: "asc" },
  });

  for (const z of zadaci) {
    // Vrsta je jedini uvjet — vidi lib/vrste-prijenosa.ts. Provjera je ovdje
    // radi citljivosti; `where` iznad vec filtrira po istom popisu.
    if (!jePrijenosVina(z.vrsta)) continue;

    const izlaz = Number(z.kolicinaIzlaz ?? 0);

    if (z.status !== "IZVRSEN" || izlaz <= 0 || z.tankStavke.length === 0) {
      if (izlaz > 0 || z.tankStavke.length > 0) {
        upozorenja.push(
          `Preskocen zadatak ${z.vrsta} ${z.id} — status ${z.status}, izlaz ${izlaz} L, ${z.tankStavke.length} ciljeva.`
        );
      }
      continue;
    }

    // `izvrsenoAt`, ne `createdAt`: vino se pomaknulo pri izvrsenju, a zadatak
    // je mogao biti zadan dan ranije.
    const kada = z.izvrsenoAt ?? z.updatedAt;

    dogadjaji.push({
      trenutak: kada,
      prioritet: 1,
      kljuc: `zadatak:${z.id}`,
      opis: `${z.vrsta}`,
      primijeni: (k) =>
        k.prijenos({
          izvori: [{ tankId: z.tankId, litre: izlaz }],
          ciljevi: z.tankStavke.map((s) => ({
            tankId: s.ciljTankId,
            litre: Number(s.kolicina ?? 0),
          })),
          vrsta: "FILTRACIJA",
          veza: { zadatakId: z.id },
          dogodenoAt: kada,
          korisnikId: z.izvrsioKorisnikId,
        }),
    });
  }

  // --- 5. Izlazi vina ------------------------------------------------------
  const izlazi = await prisma.izlazVina.findMany({ orderBy: { createdAt: "asc" } });
  const ziviIzlazi = new Set(izlazi.map((i) => i.id));

  for (const i of izlazi) {
    dogadjaji.push({
      trenutak: i.createdAt,
      prioritet: 2,
      kljuc: `izlaz:${i.id}`,
      opis: `IZLAZ ${i.tip} ${i.kolicinaLitara} L`,
      primijeni: (k) =>
        k.izlaz({
          tankId: i.tankId,
          litre: Number(i.kolicinaLitara ?? 0),
          veza: { izlazVinaId: i.id },
          dogodenoAt: i.createdAt,
          korisnikId: i.korisnikId,
        }),
    });
  }

  // Arhivske kopije izlaza broje se SAMO ako im original vise ne postoji.
  // Arhiviranje od 23.08.2026 originale ostavlja, pa je vecina kopija duplikat.
  const arhivskiIzlazi = await prisma.arhivaVinaIzlaz.findMany({
    include: { arhivaVina: { select: { tankId: true, brojTanka: true } } },
    orderBy: { createdAt: "asc" },
  });

  for (const a of arhivskiIzlazi) {
    if (a.izvorniIzlazId && ziviIzlazi.has(a.izvorniIzlazId)) continue;

    const tankId = a.tankId ?? a.arhivaVina.tankId;

    if (!tankId) {
      upozorenja.push(
        `Preskocen arhivski izlaz ${a.id} (arhiva tanka ${a.arhivaVina.brojTanka ?? "?"}) — nema tankId.`
      );
      continue;
    }

    dogadjaji.push({
      trenutak: a.createdAt,
      prioritet: 2,
      kljuc: `arhIzlaz:${a.id}`,
      opis: `IZLAZ (iz arhive) ${a.tip} ${a.kolicinaLitara} L`,
      primijeni: (k) =>
        k.izlaz({
          tankId,
          litre: Number(a.kolicinaLitara ?? 0),
          // Arhivska kopija nema vlastiti `IzlazVina` redak na koji bi se
          // vezala; kljuc je original, ako ga je ikad bilo.
          veza: a.izvorniIzlazId ? { izlazVinaId: a.izvorniIzlazId } : {},
          napomena: `Izlaz obnovljen iz arhive ${a.id}`,
          dogodenoAt: a.createdAt,
          korisnikId: null,
        }),
    });
  }

  dogadjaji.sort(
    (a, b) =>
      a.trenutak.getTime() - b.trenutak.getTime() ||
      a.prioritet - b.prioritet ||
      a.kljuc.localeCompare(b.kljuc)
  );

  return { dogadjaji, ulazi, upozorenja };
}

// ---------------------------------------------------------------------------
// Hod kroz povijest — jedan, za obje izvedbe
// ---------------------------------------------------------------------------

async function prodjiPovijest(
  knjiga: Knjiga,
  dogadjaji: Dogadjaj[],
  biljezi: (redak: string) => void
): Promise<void> {
  let redni = 0;

  for (const d of dogadjaji) {
    redni++;
    try {
      await d.primijeni(knjiga);
      biljezi(`  ${String(redni).padStart(3)}. ${vrijeme(d.trenutak)}  ${d.opis}`);
    } catch (e) {
      const poruka = e instanceof BerbaGreska ? e.message : String(e);
      throw new Error(`Dogadjaj ${redni} (${d.kljuc}, ${vrijeme(d.trenutak)}): ${poruka}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Usaglasavanje s tankovima
// ---------------------------------------------------------------------------

type Razlika = {
  tankId: string;
  broj: number;
  uTankuMl: number;
  uKnjiziMl: number;
  razlikaMl: number;
};

/**
 * Razlike izmedju knjige i `Tank.kolicinaVinaUTanku`, za svaki tank koji ima
 * ista na bilo kojoj strani.
 *
 * Pozitivna razlika = tank ima vise nego knjiga zna (manjak u knjizi).
 * Negativna = knjiga tvrdi vise nego sto je u tanku (visak u knjizi).
 */
function razlike(
  tankovi: Array<{ id: string; broj: number; kolicinaVinaUTanku: number | null }>,
  uKnjizi: Map<string, number>
): Razlika[] {
  const rezultat: Razlika[] = [];

  for (const t of tankovi) {
    const uTankuMl = uMl(Number(t.kolicinaVinaUTanku ?? 0));
    const uKnjiziMl = uKnjizi.get(t.id) ?? 0;
    const razlikaMl = uTankuMl - uKnjiziMl;

    if (Math.abs(razlikaMl) < PRAG_ML) continue;

    rezultat.push({ tankId: t.id, broj: t.broj, uTankuMl, uKnjiziMl, razlikaMl });
  }

  return rezultat.sort((a, b) => a.broj - b.broj);
}

// ---------------------------------------------------------------------------
// Ispis
// ---------------------------------------------------------------------------

function vrijeme(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function datum(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function broj(x: number | null | undefined, decimala = 0): string {
  if (x == null) return "—";
  return Number(x).toFixed(decimala);
}

function skrati(s: string | null | undefined, n: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "—";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function ispisiZapiseBerbe(
  ulazi: Povijest["ulazi"],
  brojTanka: Map<string, number>
): void {
  console.log(`\n=== ZAPISI BERBE KOJI NASTAJU (${ulazi.length}) ===\n`);
  console.log(
    "  # " +
      "vrstaUnosa".padEnd(11) +
      "sorta".padEnd(20) +
      "datum".padEnd(12) +
      "litre".padStart(8) +
      "  " +
      "kg".padStart(8) +
      "  " +
      "polozaj".padEnd(18) +
      "prviTank"
  );
  console.log("  " + "-".repeat(96));

  for (let i = 0; i < ulazi.length; i++) {
    const p = ulazi[i].podaci;
    console.log(
      "  " +
        String(i + 1).padStart(2) +
        " " +
        p.vrstaUnosa!.padEnd(11) +
        skrati(p.nazivSorte, 19).padEnd(20) +
        datum(p.datumBerbe).padEnd(12) +
        broj(p.litre).padStart(8) +
        "  " +
        broj(p.kolicinaKgGrozdja).padStart(8) +
        "  " +
        skrati(p.polozaj, 17).padEnd(18) +
        `T${brojTanka.get(p.tankId) ?? "?"}`
    );
  }
}

// ---------------------------------------------------------------------------
// Glavni tok
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    UPISI
      ? "BACKFILL BERBE — STVARNI UPIS. Sve u jednoj transakciji.\n"
      : "BACKFILL BERBE — SUHI HOD. U bazu se NE PISE nista.\n"
  );

  const [tankovi, vecUpisano] = await Promise.all([
    prisma.tank.findMany({
      select: { id: true, broj: true, kolicinaVinaUTanku: true },
      orderBy: { broj: "asc" },
    }),
    prisma.berba.count(),
  ]);

  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));

  if (vecUpisano > 0) {
    console.log(
      `U bazi vec stoji ${vecUpisano} zapisa berbe. Backfill je jednokratan i ne dopisuje se\n` +
        "na postojece — ponovni hod bi udvostrucio kretanja. Prekid."
    );
    process.exitCode = 1;
    return;
  }

  const povijest = await procitajPovijest();

  console.log(
    `Procitano: ${povijest.ulazi.length} zapisa berbe, ${povijest.dogadjaji.length} dogadjaja ukupno.`
  );

  ispisiZapiseBerbe(povijest.ulazi, brojTanka);

  // --- suhi hod uvijek, i prije upisa --------------------------------------
  const mem = new KnjigaUMemoriji();
  const dnevnik: string[] = [];

  await prodjiPovijest(mem, povijest.dogadjaji, (r) => dnevnik.push(r));

  console.log(`\n=== HOD KROZ POVIJEST (${povijest.dogadjaji.length} dogadjaja) ===\n`);
  const prikaz = SVE_REDCI ? dnevnik : dnevnik.slice(0, 12);
  for (const r of prikaz) console.log(r);
  if (!SVE_REDCI && dnevnik.length > prikaz.length) {
    console.log(`  … jos ${dnevnik.length - prikaz.length} dogadjaja (--sve za sve)`);
  }

  // --- nadopune usred hoda -------------------------------------------------
  console.log(
    `\n=== NADOPUNE ZATECENOG VINA USRED HODA (${mem.nadopune.length}) ===\n` +
      "  Tank je tocio vino kojem povijest ne zna podrijetlo.\n"
  );

  if (mem.nadopune.length === 0) {
    console.log("  nema — povijest je za svaki pretok znala odakle vino dolazi\n");
  } else {
    let ukupnoNadopuna = 0;
    for (const n of mem.nadopune) {
      ukupnoNadopuna += n.litre;
      console.log(
        `  ${vrijeme(n.kada)}  T${brojTanka.get(n.tankId) ?? "?"}`.padEnd(30) +
          `${broj(n.litre, 3).padStart(10)} L   (${n.zbog})`
      );
    }
    console.log(`  ${"-".repeat(60)}\n  ukupno ${broj(ukupnoNadopuna, 3)} L`);
  }

  // --- usaglasavanje -------------------------------------------------------
  const zavrsneRazlike = razlike(tankovi, mem.zbrojPoTanku());

  console.log(`\n=== USAGLASAVANJE S TANKOVIMA (${zavrsneRazlike.length} razlika) ===\n`);
  console.log(
    "  tank   " + "u tanku".padStart(11) + "   " + "u knjizi".padStart(11) + "   " + "razlika".padStart(11) + "   sto se upisuje"
  );
  console.log("  " + "-".repeat(78));

  let manjakL = 0;
  let viakL = 0;

  for (const r of zavrsneRazlike) {
    const potez = r.razlikaMl > 0 ? "ZATECENO (manjak u knjizi)" : "ISPRAVAK (visak u knjizi)";
    if (r.razlikaMl > 0) manjakL += uLitre(r.razlikaMl);
    else viakL += uLitre(-r.razlikaMl);

    console.log(
      `  T${String(r.broj).padEnd(5)}` +
        broj(uLitre(r.uTankuMl), 3).padStart(11) +
        "   " +
        broj(uLitre(r.uKnjiziMl), 3).padStart(11) +
        "   " +
        broj(uLitre(r.razlikaMl), 3).padStart(11) +
        "   " +
        potez
    );
  }

  if (zavrsneRazlike.length === 0) {
    console.log("  nema razlika — knjiga i tankovi kazu isto\n");
  }

  // --- upozorenja ----------------------------------------------------------
  if (povijest.upozorenja.length > 0) {
    console.log(`\n=== PRESKOCENO (${povijest.upozorenja.length}) ===\n`);
    for (const u of povijest.upozorenja) console.log(`  ${u}`);
  }

  // --- sazetak -------------------------------------------------------------
  const zateceniIzHoda = mem.berbe.filter((b) => b.podaci.vrstaUnosa === "ZATECENO").length;

  console.log("\n=== SAZETAK ===\n");
  console.log(`  zapisa berbe iz punjenja        ${povijest.ulazi.length}`);
  console.log(`  nadopuna ZATECENO usred hoda    ${mem.nadopune.length}   (${broj(
    mem.nadopune.reduce((z, n) => z + n.litre, 0),
    3
  )} L)`);
  console.log(`  ZATECENO na kraju (manjak)      ${zavrsneRazlike.filter((r) => r.razlikaMl > 0).length}   (${broj(manjakL, 3)} L)`);
  console.log(`  ISPRAVAK na kraju (visak)       ${zavrsneRazlike.filter((r) => r.razlikaMl < 0).length}   (${broj(viakL, 3)} L)`);
  console.log(`  Berba redaka ukupno             ${mem.berbe.length + zavrsneRazlike.filter((r) => r.razlikaMl > 0).length}`);
  console.log(`  od toga ZATECENO                ${zateceniIzHoda + zavrsneRazlike.filter((r) => r.razlikaMl > 0).length}`);

  if (!UPISI) {
    console.log(
      "\nSUHI HOD GOTOV. U bazu nije upisan nijedan redak.\n" +
        "Za stvarni upis:  npm run berba:backfill -- --upisi\n"
    );
    return;
  }

  // --- stvarni upis --------------------------------------------------------
  console.log("\n=== UPIS ===\n");

  await prisma.$transaction(
    async (tx) => {
      const knjiga = new KnjigaUBazi(tx);

      await prodjiPovijest(knjiga, povijest.dogadjaji, () => undefined);

      // Zavrsno usaglasavanje ide kroz ISTE funkcije knjige, nad STVARNIM
      // stanjem nakon hoda — ne nad brojkama iz suhog hoda. Suhi hod je
      // najava, ne izvor istine.
      const stanje = await stanjeSvihTankova(tx);

      const uKnjizi = new Map<string, number>();
      for (const [tankId, popis] of stanje) {
        uKnjizi.set(tankId, popis.reduce((z, s) => z + s.ml, 0));
      }

      const zaZatvoriti = razlike(tankovi, uKnjizi);

      for (const r of zaZatvoriti) {
        if (r.razlikaMl > 0) {
          await zabiljeziUlaz(tx, {
            tankId: r.tankId,
            litre: uLitre(r.razlikaMl),
            vrstaUnosa: "ZATECENO",
            nazivSorte: "Nepoznato podrijetlo",
            napomena: OPIS_MANJKA,
            veza: {},
            napomenaKretanja: OPIS_MANJKA,
          });
        } else {
          await zabiljeziIzlaz(tx, {
            tankId: r.tankId,
            litre: uLitre(-r.razlikaMl),
            vrsta: "ISPRAVAK",
            veza: {},
            napomena: OPIS_VISKA,
          });
        }

        console.log(
          `  T${String(r.broj).padEnd(4)} ${r.razlikaMl > 0 ? "ZATECENO" : "ISPRAVAK"} ${broj(uLitre(Math.abs(r.razlikaMl)), 3)} L`
        );
      }

      const upisanoBerbi = await tx.berba.count();
      const upisanoKretanja = await tx.berbaKretanje.count();

      console.log(`\n  upisano: ${upisanoBerbi} zapisa berbe, ${upisanoKretanja} kretanja`);
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  console.log("\nUPISANO. Sljedeci korak: npm run berba:provjeri\n");
}

main()
  .catch((e) => {
    console.error("\nPUKLO — nista nije upisano.");
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
