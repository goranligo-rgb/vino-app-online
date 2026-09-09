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
import { stvarnaZadana } from "@/lib/temperatura";

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
    const najveci = udjeli[0] ?? null;
    const jednosortni =
      najveci != null && Number(najveci.postotak) > PRAG_JEDNOSORTNI;

    let berba: BlokBerbe | null = null;
    if (jednosortni) {
      // Berba se trazi po sorti dominantnog udjela. Kad ih je vise (ista sorta
      // brana u dva navrata), uzima se ona s najvise litara u tanku — upit ih
      // vec vraca poredane silazno.
      const partije = berbePo.get(t.id) ?? [];
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
            litre: (Number(t.kolicinaVinaUTanku ?? 0) * Number(u.postotak)) / 100,
            postotak: Number(u.postotak),
            izvor: null,
          })),
        };
      }
      // Berba nije dohvatljiva -> pada na "Sastav mjesavine" nize.
    }

    // Sastav se slaze iz `BlendIzvor` kad ga ima, inace iz udjela sorti.
    let sastav: Sastavnica[] | null = null;
    if (!berba) {
      const sirovo =
        blend.length > 0
          ? blend.map((b) => ({
              naziv: b.nazivVina ?? b.sorta ?? "nepoznat izvor",
              litre: Number(b.kolicina ?? 0),
              postotak: Number(b.postotak ?? 0),
              izvorVrsta: b.izvorVrsta,
              izvorBroj: b.izvorBroj,
            }))
          : udjeli.map((u) => ({
              naziv: u.nazivSorte,
              litre:
                (Number(t.kolicinaVinaUTanku ?? 0) * Number(u.postotak)) / 100,
              postotak: Number(u.postotak),
              izvorVrsta: null,
              izvorBroj: null,
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
