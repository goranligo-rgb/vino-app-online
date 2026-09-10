/**
 * Slaganje kartica iz sirovih dohvata. Cisti izracun, bez ijednog upita.
 *
 * Sve sto ovdje radi petlju po tankovima radi je nad vec dohvacenim poljima —
 * ako ikad zatreba `await` u ovoj datoteci, to je znak da podatak nedostaje u
 * `podaci.ts` i da ondje treba prosiriti upit, a ne dodati upit ovdje.
 */

import {
  CILJ_SLOBODNI_SO2,
  DANA_GRAF,
  PRAG_JEDNOSORTNI,
  TJEDANA_SO2,
  type PodrumPodaci,
} from "./podaci";
import { jeHladjenjeIskljuceno } from "@/lib/tank-komanda";
import { stvarnaZadana, uBroj } from "@/lib/temperatura";
import { popisKvasaca, type StavkaKvasca } from "@/lib/kvasci";

const DAN_MS = 24 * 3600 * 1000;

/** Usporedba naziva sorti otporna na razmake i velika slova. */
function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function danaOd(datum: Date, sada: Date): number {
  return Math.floor((sada.getTime() - datum.getTime()) / DAN_MS);
}

/**
 * Kilogrami grozdja koji otpadaju na litre koje su OD TE PARTIJE u ovom tanku.
 *
 * Vraca `null` kad se ne moze izracunati — nema kilograma, nema litara partije,
 * ili je partija upisana s nula litara. Prazan redak je bolji od broja koji
 * tvrdi nesto drugo nego sto pise.
 *
 * Omjer se REZE NA 1: knjiga zna imati u tanku vise litara nego sto partija
 * ima upisano (nadopune, zatecene kolicine), a "vise kilograma nego sto je
 * ubrano" je besmislica.
 */
function kgRazmjerno(
  kgPartije: number | null,
  litaraUTanku: number,
  litaraPartije: number | null
): number | null {
  if (kgPartije == null || !Number.isFinite(kgPartije)) return null;
  if (litaraPartije == null || !(litaraPartije > 0)) return null;
  if (!(litaraUTanku > 0)) return null;

  // CIJELI KILOGRAMI. Ostali parametri kartice idu na dvije decimale i to je
  // ondje tocno (pH 3,20; kiseline 6,23 g/L), ali "4.176,68 kg" je lazna
  // preciznost: broj je procjena iz omjera litara, a ne vaga.
  return Math.round(kgPartije * Math.min(1, litaraUTanku / litaraPartije));
}

// --- Tipovi kartice --------------------------------------------------------

export type TockaSecera = { t: number; secerGL: number };
export type TockaTemp = { t: number; avg: number; min: number; max: number };
export type TjedanSO2 = {
  t: number;
  slobodni: number | null;
  ukupni: number | null;
};

export type Sastavnica = {
  naziv: string;
  litre: number;
  postotak: number;
  /** "tank 12" / "arhiva T7" — popunjeno SAMO kad se `naziv` ponavlja. */
  izvor: string | null;
};

export type BlokBerbe = {
  nazivSorte: string;
  /** Koliko partija tank drzi ukupno; 1 = zaglavlje bez dodatka. */
  ukupnoPartija: number;
  // NEMA `manjinski`: popis sorti se od sada ispisuje na SVAKOJ kartici, iz
  // `Kartica.sastavSvi`, jednako i pod berbom i pod mjesavinom.
  datumBerbe: Date | null;
  kolicinaKgGrozdja: number | null;
  /** °Oe. Nikad se ne prikazuje u istom stupcu kao `secerGL`. */
  secerOe: number | null;
  kiseline: number | null;
  ph: number | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
};

export type Stavka = {
  datum: Date;
  naslov: string;
  detalj: string | null;
};

export type Kartica = {
  id: string;
  broj: number;
  nazivVina: string | null;
  sorta: string | null;
  kolicina: number;
  kapacitet: number;
  grana: string | null;

  tempTrenutna: number | null;
  tempZadana: number | null;
  /** Zadana od PRIJE soft-OFF-a; jedina smislena brojka dok je hladjenje ugaseno. */
  tempZapamcena: number | null;
  hladjenjeAktivno: boolean;
  hladjenjeIskljuceno: boolean;
  ocitanoU: Date | null;

  /** Broj dana, ili null kad kvasac nije zapisan. */
  danFermentacije: number | null;
  /** Svi kvasci koje danasnje vino nosi, s udjelom i oznakom izvornog tanka. */
  kvasci: StavkaKvasca[];
  /** Postotak vina bez zapisa o kvascu; 0 kad ga nema. Prikaz ga MORA pokazati
   *  kad postoji — inace zbroj ne daje 100 % i izgleda kao greska u racunu. */
  kvasciBezZapisa: number;
  /** Zamjena za dan fermentacije kad kvasca nema. */
  dolazakDatum: Date | null;
  dolazakVrsta: "PUNJENJE" | "PRETOK" | null;

  /** Trenutni parametri iz zadnjeg `Mjerenje`. `secerGL` je g/L zaostalog secera. */
  secerGL: number | null;
  ukupneKiseline: number | null;
  ph: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  mjerenoU: Date | null;

  /** Tocno jedno od ovoga dvoga je popunjeno. */
  berba: BlokBerbe | null;
  sastav: Sastavnica[] | null;

  /**
   * SVE sorte tanka s postotkom, za uski redak "Sastav: ..." u dnu desnog
   * bloka — ispisuje se na SVAKOJ kartici, i pod berbom i pod mjesavinom.
   *
   * Postotak dolazi iz `TankSortaUdio`, istog izvora koji cita pravilo >90 %,
   * pa redak i pravilo ne mogu reci razlicito. Zamjenjuje raniji redak
   * "+ 4,5 % Muskat zuti", koji je pokazivao samo manjinske sorte i samo na
   * karticama s berbom.
   */
  sastavSvi: Sastavnica[];

  grafSecer: TockaSecera[];
  grafTemp: TockaTemp[];
  grafSO2: TjedanSO2[];
  imaSO2: boolean;
  /** Oba grafa prazna -> kartica ih izbacuje i daje vise mjesta za biljesku. */
  bezGrafova: boolean;

  zadnjiDodaci: Stavka[];
  zadnjeRadnje: Stavka[];
};

/** Grupiranje niza u Map po kljucu, uz cuvanje redoslijeda. */
function poKljucu<T>(niz: T[], kljuc: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of niz) {
    const k = kljuc(x);
    const p = m.get(k);
    if (p) p.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function sloziKartice(p: PodrumPodaci, sada = new Date()): Kartica[] {
  const mjerenjaPo = poKljucu(p.mjerenja, (x) => x.tankId);
  const radnjePo = poKljucu(p.radnje, (x) => x.tankId);
  const udjeliPo = poKljucu(p.udjeli, (x) => x.tankId);
  const blendPo = poKljucu(p.blendovi, (x) => x.ciljTankId);
  const tempPo = poKljucu(p.temperatura, (x) => x.tankId);
  const berbePo = poKljucu(p.berbe, (x) => x.tankId);
  const ocitanjePo = new Map(p.ocitanja.map((x) => [x.tankId, x]));
  const dolazakPo = new Map(p.dolasci.map((x) => [x.tankId, x]));

  const odGrafa = sada.getTime() - DANA_GRAF * DAN_MS;

  return p.puni.map((t): Kartica => {
    const mj = mjerenjaPo.get(t.id) ?? []; // vec sortirana izmjerenoAt DESC

    // GRANICE ARHIVE OVDJE VISE NEMA, i to je namjerno.
    //
    // Dok se citalo iz `Radnja`, crta je bila obavezna: `Radnja` se pri
    // arhiviranju NE brise, pa je kartica bez nje pokazivala radnje prethodnog
    // vina (23 od 29 punih tankova s arhivom, 126 zapisa, mjereno 09.09.2026).
    //
    // `VinoRadnja` se pri praznjenju tanka BRISE, pa tudjih redaka nema. A
    // crta bi sada RADILA STETU: kvasac dodan u tanku 11 u srpnju je stariji
    // od arhiviranja tanka 5, a opisuje bas ono vino koje je danas u tanku 5.
    // Granica bi ga odrezala i vratila nas na "kvasac nije zapisan".
    const rad = radnjePo.get(t.id) ?? []; // vec sortirane dogodenoAt DESC
    const udjeli = udjeliPo.get(t.id) ?? []; // vec sortirani postotak DESC
    const blend = blendPo.get(t.id) ?? [];
    const oc = ocitanjePo.get(t.id) ?? null;
    const zadnje = mj[0] ?? null;

    // --- Traka: temperatura i hladjenje ---
    const zadana = stvarnaZadana(oc?.zadanaTemperatura, t.zadanaTemp);

    // --- Kvasci ---
    //
    // POPIS, ne jedan. Vino u tanku obicno nije fermentiralo jednim kvascem;
    // tank 5 danas nosi pet kvasaca iz cetiri druga tanka. Racun je u
    // lib/kvasci.ts, zajednicki sa stranicom tanka — dva ekrana ne smiju
    // racunati postotke svaki za sebe.
    //
    // JEDINA dopustena upotreba `jeKvasac` na ovoj stranici. Popis dodataka
    // nize se NE filtrira njime — mora pokazati sve sto je islo u tank.
    // Model `Fermentacija` se namjerno ne cita: prazan je.
    //
    // Dan fermentacije se racuna od VECINSKOG kvasca, ne od najmladjeg — vidi
    // `PopisKvasaca.vecinski`. Tank 7 je s najmladjim pokazivao 4. dan zbog
    // kvasca koji drzi 5 % tanka, umjesto 9. po vecini vina.
    const kvasci = popisKvasaca(rad);
    const dolazak = dolazakPo.get(t.id) ?? null;

    // --- Desni blok: berba ili sastav ---
    const partije = berbePo.get(t.id) ?? [];

    // LITRE PO SORTI IZ KNJIGE.
    //
    // `TankSortaUdio` nosi samo postotak, pa bi litre inace bile izvedene iz
    // njega (kolicina x postotak) i nosile njegovu zaokruzenu gresku. Knjiga
    // ih zna tocno: za T9 daje 2.689,437 + 660,563 = 3.350,000 L, sto je do
    // decimale `kolicinaVinaUTanku`.
    //
    // Postotak se NE racuna odavde nego ostaje iz `TankSortaUdio` — to je isti
    // izvor koji cita pravilo >90 %, pa se prikaz i pravilo ne mogu razici.
    const litrePoSorti = new Map<string, number>();
    for (const b of partije) {
      const k = norm(b.nazivSorte);
      litrePoSorti.set(k, (litrePoSorti.get(k) ?? 0) + Number(b.litre));
    }
    const kolicina = Number(t.kolicinaVinaUTanku ?? 0);

    // KNJIGA SE KORISTI SVE-ILI-NISTA, PO TANKU.
    //
    // Knjiga imenuje sorte vlastitim nazivima ("Veltlinac zeleni") koji se ne
    // moraju poklopiti s onima u `TankSortaUdio` ("Zeleni veltlinac"), a zna
    // drzati i sorte kojih u udjelima uopce nema. Kad se to dogodi, dio litara
    // ispadne iz zbroja i kartica pokaze retke koji se zbrajaju na 100 %, ali
    // im litre ne daju kolicinu u tanku — na T6 je manjkalo 7.550 od 10.500 L.
    //
    // Zato se knjizne litre uzimaju samo ako pokrivaju CIJELI tank (do 1 L).
    // Inace se za sve retke izvode iz postotka, pa je kartica bar sama sa
    // sobom u skladu. Provjereno: knjiga pokriva 10 od 15 tankova sa sastavom,
    // medju njima i T9 zbog kojeg je ovo i krenulo.
    const pokriveno = udjeli.reduce(
      (s, u) => s + (litrePoSorti.get(norm(u.nazivSorte)) ?? 0),
      0
    );
    const knjigaPokrivaTank =
      udjeli.length > 0 && Math.abs(pokriveno - kolicina) <= 1;

    /** Litre sorte: knjiga kad pokriva cijeli tank, inace iz postotka. */
    const litreSorte = (nazivSorte: string, postotak: number) =>
      knjigaPokrivaTank
        ? (litrePoSorti.get(norm(nazivSorte)) ?? 0)
        : (kolicina * postotak) / 100;

    const najveci = udjeli[0] ?? null;
    const jednosortni =
      najveci != null && Number(najveci.postotak) > PRAG_JEDNOSORTNI;

    let berba: BlokBerbe | null = null;
    if (jednosortni) {
      // Berba se trazi po sorti dominantnog udjela. Kad ih je vise (ista sorta
      // brana u dva navrata), uzima se ona s najvise litara u tanku — upit ih
      // vec vraca poredane silazno.
      const kandidat = partije.find(
        (b) => norm(b.nazivSorte) === norm(najveci.nazivSorte)
      );
      if (kandidat) {
        berba = {
          nazivSorte: kandidat.nazivSorte,
          // Blok ima mjesta za JEDNU partiju, a tank ih zna drzati vise (T7
          // drzi cetiri Veltlinca). Prikazuje se najveca po litrama, pa
          // zaglavlje mora reci da to nije sve — inace ispis tvrdi da je tank
          // jedna berba.
          ukupnoPartija: partije.length,
          datumBerbe: kandidat.datumBerbe,
          // GROZDJE RAZMJERNO LITRAMA U TANKU, ne kilogrami cijele partije.
          //
          // `Berba.kolicinaKgGrozdja` opisuje BERBENU PARTIJU, a partija ide u
          // vise tankova i putuje dalje. Neskalirano je isti broj stajao na
          // vise kartica: 11.503 kg pisalo je na T22, T34 i T40 istovremeno,
          // sto zbrojeno daje trostruku berbu.
          //
          // NAMJERNO DRUKCIJE OD `lib/berba-lanac.ts`, koji kilograme izricito
          // NE skalira. Ondje je odluka tocna: kartica lanca pokazuje `presloL`
          // uz `odUkupnoL`, pa citatelj sam vidi omjer i neskalirani kg je
          // provjerljiva cinjenica. Ovdje tog konteksta nema — stoji samo
          // "Grožđe 11.503 kg" i cita se kao kilogrami OVOG tanka.
          //
          // Rezultat je PROCJENA i tako je i oznacen (≈ na ispisu). Kad se
          // nazivnik ne zna, kilogrami se ne prikazuju — radije nista nego broj
          // koji ne znaci ono sto pise.
          kolicinaKgGrozdja: kgRazmjerno(
            kandidat.kolicinaKgGrozdja,
            kandidat.litre,
            kandidat.litaraBerbe
          ),
          secerOe: kandidat.secerOe,
          kiseline: kandidat.kiseline,
          ph: kandidat.ph,
          vinograd: kandidat.vinograd,
          oznakaBerbe: kandidat.oznakaBerbe,
        };
      }
      // Berba nije dohvatljiva -> pada na "Sastav mjesavine" nize.
    }

    // SASTAV SE PUNI IZ `TankSortaUdio`; `BlendIzvor` samo kad udjela nema.
    //
    // Prije je bilo obrnuto i to je bila greska u imenu bloka koliko i u
    // podatku: u ovom repozitoriju "Sastav" znaci udjele sorti
    // (`app/tankovi/[id]/page.tsx`, Card "Sastav"), a `BlendIzvor` je
    // "Porijeklo vina / sastavnice blenda" — druga kartica, drugi pojam.
    //
    // Podatak je uz to i netocan: od 38 punih tankova `BlendIzvor` se s
    // `TankSortaUdio` ne slaze na 9, a kod 6 od tih 9 knjiga potvrdjuje
    // udjele. T9 je najgori — udjeli i knjiga slozno kazu Grasevina 80,28 % /
    // Muskat zuti 19,72 %, a blend tvrdi Muskat zuti 100 %, dakle gubi 4/5
    // tanka i proturjeci zaglavlju kartice (`Tank.sorta`), koje monitor cita
    // iz istog polja.
    let sastav: Sastavnica[] | null = null;
    if (!berba) {
      const sirovo =
        udjeli.length > 0
          ? udjeli.map((u) => ({
              naziv: u.nazivSorte,
              litre: litreSorte(u.nazivSorte, Number(u.postotak)),
              postotak: Number(u.postotak),
              izvorVrsta: null,
              izvorBroj: null,
            }))
          : blend.map((b) => ({
              naziv: b.nazivVina ?? b.sorta ?? "nepoznat izvor",
              litre: Number(b.kolicina ?? 0),
              postotak: Number(b.postotak ?? 0),
              izvorVrsta: b.izvorVrsta,
              izvorBroj: b.izvorBroj,
            }));

      // Izvor se dopisuje SAMO ondje gdje naziv ne razlikuje retke. Tank 2 ima
      // cetiri sastavnice "Graševina" i jednu "Muškat žuti" — Graševine dobiju
      // oznaku izvora, Muškat ne, jer mu ne treba.
      const koliko = new Map<string, number>();
      for (const s of sirovo) koliko.set(s.naziv, (koliko.get(s.naziv) ?? 0) + 1);

      sastav = sirovo.map((s) => ({
        naziv: s.naziv,
        litre: s.litre,
        postotak: s.postotak,
        izvor:
          (koliko.get(s.naziv) ?? 0) > 1 && s.izvorVrsta && s.izvorBroj != null
            ? s.izvorVrsta === "arhiva"
              ? `arhiva T${s.izvorBroj}`
              : `tank ${s.izvorBroj}`
            : null,
      }));
      if (sastav.length === 0) sastav = null;
    }

    // --- Graf 1a: zaostali secer g/L kroz 10 dana ---
    const grafSecer: TockaSecera[] = mj
      .filter(
        (m) => m.secer != null && m.izmjerenoAt.getTime() >= odGrafa
      )
      .map((m) => ({ t: m.izmjerenoAt.getTime(), secerGL: Number(m.secer) }))
      .sort((a, b) => a.t - b.t);

    // --- Graf 1b: temperatura po danu ---
    const grafTemp: TockaTemp[] = (tempPo.get(t.id) ?? [])
      .map((d) => ({
        t: new Date(d.dan).getTime(),
        avg: d.avg,
        min: d.min,
        max: d.max,
      }))
      .sort((a, b) => a.t - b.t);

    // --- Graf 2: SO2 po tjednu ---
    const tjedni = new Map<number, { sl: number[]; uk: number[] }>();
    for (const m of mj) {
      if (m.slobodniSO2 == null && m.ukupniSO2 == null) continue;
      // Tjedan se kljucira pocetkom sedmodnevnog razdoblja unatrag od danas,
      // da zadnji stupac uvijek zavrsi na danasnjem danu.
      const proslo = Math.floor(
        (sada.getTime() - m.izmjerenoAt.getTime()) / (7 * DAN_MS)
      );
      if (proslo < 0 || proslo >= TJEDANA_SO2) continue;
      const k = TJEDANA_SO2 - 1 - proslo;
      const u = tjedni.get(k) ?? { sl: [], uk: [] };
      if (m.slobodniSO2 != null) u.sl.push(Number(m.slobodniSO2));
      if (m.ukupniSO2 != null) u.uk.push(Number(m.ukupniSO2));
      tjedni.set(k, u);
    }
    const prosjek = (a: number[]) =>
      a.length === 0 ? null : a.reduce((s, x) => s + x, 0) / a.length;
    const grafSO2: TjedanSO2[] = Array.from({ length: TJEDANA_SO2 }, (_, i) => {
      const u = tjedni.get(i);
      return {
        t: i,
        slobodni: u ? prosjek(u.sl) : null,
        ukupni: u ? prosjek(u.uk) : null,
      };
    });
    const imaSO2 = grafSO2.some((x) => x.slobodni != null || x.ukupni != null);

    // --- Stupci: dodaci i radnje. Vise od tri se ODBACUJE, ne prelama. ---
    const opisRadnje = (r: (typeof rad)[number]): Stavka => {
      const kol =
        r.kolicina != null
          ? `${formatBrojKratko(r.kolicina)}${
              r.jedinicaNaziv ? ` ${r.jedinicaNaziv}` : ""
            }`
          : null;
      return {
        datum: r.dogodenoAt,
        naslov: r.preparatNaziv ?? r.opis ?? r.vrsta,
        detalj: kol,
      };
    };

    return {
      id: t.id,
      broj: t.broj,
      nazivVina: t.nazivVina,
      sorta: t.sorta,
      kolicina: Number(t.kolicinaVinaUTanku ?? 0),
      kapacitet: Number(t.kapacitet ?? 0),
      grana: t.grana,

      tempTrenutna: oc?.temperatura ?? null,
      tempZadana: zadana,
      tempZapamcena: uBroj(t.zadnjaZadanaTemp),
      hladjenjeAktivno: oc?.hladjenjeAktivno ?? false,
      hladjenjeIskljuceno: jeHladjenjeIskljuceno(zadana),
      ocitanoU: oc?.mjerenoU ?? null,

      danFermentacije: kvasci.vecinski
        ? danaOd(kvasci.vecinski.datum, sada)
        : null,
      kvasci: kvasci.stavke,
      kvasciBezZapisa: kvasci.bezZapisaPostotak,
      dolazakDatum: dolazak?.datum ?? null,
      dolazakVrsta: dolazak?.vrsta ?? null,

      secerGL: zadnje?.secer != null ? Number(zadnje.secer) : null,
      ukupneKiseline:
        zadnje?.ukupneKiseline != null ? Number(zadnje.ukupneKiseline) : null,
      ph: zadnje?.ph != null ? Number(zadnje.ph) : null,
      slobodniSO2:
        zadnje?.slobodniSO2 != null ? Number(zadnje.slobodniSO2) : null,
      ukupniSO2: zadnje?.ukupniSO2 != null ? Number(zadnje.ukupniSO2) : null,
      mjerenoU: zadnje?.izmjerenoAt ?? null,

      berba,
      sastav,

      sastavSvi: udjeli.map((u) => ({
        naziv: u.nazivSorte,
        litre: litreSorte(u.nazivSorte, Number(u.postotak)),
        postotak: Number(u.postotak),
        izvor: null,
      })),

      grafSecer,
      grafTemp,
      grafSO2,
      imaSO2,
      // Kartica bez ijedne krivulje ne treba dvije prazne osi — one zauzimaju
      // trecinu visine da bi rekle "nema podataka". Mjesto ide biljesci.
      bezGrafova: grafSecer.length === 0 && grafTemp.length === 0 && !imaSO2,

      // Sumporenje se NE prepoznaje: u bazi ne postoji kao vrsta radnje, samo
      // kao DODAVANJE s preparatom. Kalij metabisulfit se ovdje ispisuje isto
      // kao i svaki drugi dodatak, bez posebne oznake.
      zadnjiDodaci: rad
        .filter((r) => r.vrsta === "DODAVANJE")
        .slice(0, 3)
        .map(opisRadnje),

      // DODAVANJE se ovdje ISKLJUCUJE — ima vlastiti stupac lijevo. Bez toga
      // su na tanku u fermentaciji oba stupca ista tri retka (T7: tri puta
      // FERMAID/OPTI-MUM), pa treci stupac ne kaze nista novo. Ostaje ono sto
      // se s vinom radilo: pretoci, punjenja, filtracije, flotacija, ostalo.
      zadnjeRadnje: rad
        .filter((r) => r.vrsta !== "DODAVANJE")
        .slice(0, 3)
        .map(opisRadnje),
    };
  });
}

export function formatBrojKratko(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toLocaleString("hr-HR", { maximumFractionDigits: 1 });
}

export { CILJ_SLOBODNI_SO2, DANA_GRAF, TJEDANA_SO2 };
