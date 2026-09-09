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

const DAN_MS = 24 * 3600 * 1000;

/** Usporedba naziva sorti otporna na razmake i velika slova. */
function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function danaOd(datum: Date, sada: Date): number {
  return Math.floor((sada.getTime() - datum.getTime()) / DAN_MS);
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
  datumBerbe: Date | null;
  kolicinaKgGrozdja: number | null;
  /** °Oe. Nikad se ne prikazuje u istom stupcu kao `secerGL`. */
  secerOe: number | null;
  kiseline: number | null;
  ph: number | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
  /** "+ 4,5 % Muškat žuti" — manjinski udjeli jednosortnog tanka, u jednom retku. */
  manjinski: Sastavnica[];
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
  kvasacNaziv: string | null;
  kvasacDatum: Date | null;
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
  const granicaPo = new Map(p.granice.map((x) => [x.tankId, x.arhiviranoAt]));

  const odGrafa = sada.getTime() - DANA_GRAF * DAN_MS;

  return p.puni.map((t): Kartica => {
    const mj = mjerenjaPo.get(t.id) ?? []; // vec sortirana izmjerenoAt DESC

    // GRANICA ARHIVE — jedna crta za sve sto se cita iz `Radnja`.
    //
    // Arhiviranje znaci da je u tanku bilo DRUGO vino. `Mjerenje`, punjenja i
    // izlaze arhiviranje BRISE, pa oni ne mogu biti stariji i ne treba im
    // filtar. `Radnja` se NE brise — bez ove crte kartica pokazuje radnje
    // prethodnog vina, i dan fermentacije racuna od tudjeg kvasca.
    //
    // Isto pravilo kao `granicaArhive` u `app/tankovi/[id]/page.tsx`; ondje
    // ide u `where`, ovdje u filtar nad vec dohvacenim redcima, jer je upit
    // jedan za sve tankove.
    const granica = granicaPo.get(t.id) ?? null;
    const sve = radnjePo.get(t.id) ?? []; // vec sortirane createdAt DESC
    const rad = granica ? sve.filter((r) => r.createdAt >= granica) : sve;
    const udjeli = udjeliPo.get(t.id) ?? []; // vec sortirani postotak DESC
    const blend = blendPo.get(t.id) ?? [];
    const oc = ocitanjePo.get(t.id) ?? null;
    const zadnje = mj[0] ?? null;

    // --- Traka: temperatura i hladjenje ---
    const zadana = stvarnaZadana(oc?.zadanaTemperatura, t.zadanaTemp);

    // --- Dan fermentacije ---
    //
    // JEDINA dopustena upotreba `jeKvasac` na ovoj stranici. Popis dodataka
    // nize se NE filtrira njime — mora pokazati sve sto je islo u tank.
    // Model `Fermentacija` se namjerno ne cita: prazan je.
    //
    // Trazi se u `rad`, dakle IZA granice arhive: kvasac dodan prethodnom
    // vinu ne pocinje fermentaciju ovoga. Bez toga je tank 33 pokazivao dan
    // fermentacije racunat od kvasca starijeg od vlastitog arhiviranja.
    const kvasac = rad.find(
      (r) => r.vrsta === "DODAVANJE" && r.preparat?.jeKvasac === true
    );
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
          kolicinaKgGrozdja: kandidat.kolicinaKgGrozdja,
          secerOe: kandidat.secerOe,
          kiseline: kandidat.kiseline,
          ph: kandidat.ph,
          vinograd: kandidat.vinograd,
          oznakaBerbe: kandidat.oznakaBerbe,
          manjinski: udjeli.slice(1).map((u) => ({
            naziv: u.nazivSorte,
            litre: litreSorte(u.nazivSorte, Number(u.postotak)),
            postotak: Number(u.postotak),
            izvor: null,
          })),
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
              r.jedinica?.naziv ? ` ${r.jedinica.naziv}` : ""
            }`
          : null;
      return {
        datum: r.createdAt,
        naslov: r.preparat?.naziv ?? r.opis ?? r.vrsta,
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

      danFermentacije: kvasac ? danaOd(kvasac.createdAt, sada) : null,
      kvasacNaziv: kvasac?.preparat?.naziv ?? kvasac?.opis ?? null,
      kvasacDatum: kvasac?.createdAt ?? null,
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
