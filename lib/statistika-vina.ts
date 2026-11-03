import type { PodrijetloMonitora } from "@/lib/monitor-vina";
import { jePravaSorta } from "@/lib/sorta-naziv";

/**
 * PREGLED VINA — cisti racun tablice i simulacije kupaze.
 * ======================================================================
 *
 * Bez Prisme i bez Reacta: isti kod zove stranica, a test ga zove nad pravim
 * podacima. Citanje iz baze je u lib/statistika-vina-baza.ts.
 *
 * SIMULACIJA SE NIGDJE NE SPREMA. Sve ovdje je racun nad onim sto je stiglo s
 * rute i onim sto je korisnik upisao.
 *
 * SECER SE NE PROSJECUJE (vlasnik, 03.11.2026.). Podrum mjeri °Oe dok vrenje
 * traje, a g/L kad je vino gotovo; oba zavrse u `Mjerenje.secer`, a jedinica
 * nije zapisana. Prosjek bi zbrajao dvije ljestvice, a iz vrijednosti se
 * jedinica ne smije nagadjati. Zato `prosjekPoLitrama` secer ne prima ni po
 * tipu. Kad jedinica postane podatak, ovo se mijenja na jednom mjestu.
 *
 * PONDER JE LITRA, racun je u cijelim mililitrima.
 */

/** Polja tablice, redom prikaza. Temperatura namjerno nije tu. */
export const POLJA_PREGLEDA = [
  { kljuc: "alkohol", naziv: "Alkohol %", decimale: 2 },
  { kljuc: "secer", naziv: "Šećer (°Oe / g/L — nepotvrđeno)", decimale: 2 },
  { kljuc: "ukupneKiseline", naziv: "Ukupne kis.", decimale: 2 },
  { kljuc: "ph", naziv: "pH", decimale: 2 },
  { kljuc: "hlapiveKiseline", naziv: "Hlapive", decimale: 2 },
  { kljuc: "slobodniSO2", naziv: "SO₂ sl.", decimale: 1 },
  { kljuc: "ukupniSO2", naziv: "SO₂ uk.", decimale: 1 },
] as const;

export type PoljePregleda = (typeof POLJA_PREGLEDA)[number]["kljuc"];

/** Polja koja se smiju prosjecovati — sva osim secera. */
export type PoljeProsjeka = Exclude<PoljePregleda, "secer">;

export const POLJA_PROSJEKA = POLJA_PREGLEDA.filter(
  (p): p is Extract<(typeof POLJA_PREGLEDA)[number], { kljuc: PoljeProsjeka }> =>
    p.kljuc !== "secer"
);

/** Stalna oznaka uz svaku sirovu vrijednost secera u simulaciji. */
export const OZNAKA_SECERA = "jedinica nije zapisana (°Oe ili g/L)";

export type VrijednostPolja = {
  vrijednost: number | null;
  podrijetlo: PodrijetloMonitora;
  /** Samo kad je vrijednost stvarno izmjerena na ovom vinu, u ovoj posudi. */
  izmjerenoAt: string | null;
};

export type StavkaSorte = { nazivSorte: string; postotak: number };

export type VrstaVina = "SORTNO" | "CUVEE" | "BEZ_TVRDNJE";

export type VinoRedak = {
  tankId: string;
  broj: number;
  /** `null` = sifra nije upisana. */
  sifra: string | null;
  naziv: string;
  godiste: number | null;
  ml: number;
  sastav: StavkaSorte[];
  vrsta: VrstaVina;
  glavna: StavkaSorte | null;
  parametri: Record<PoljePregleda, VrijednostPolja>;
  /** Najnoviji datum medju stvarno izmjerenim poljima. */
  zadnjeMjerenjeAt: string | null;
};

export type PregledVina = {
  /** Prag iz lib/identitet-vina.ts: klijent ga ne smije imati kao drugi broj. */
  pragSortnosti: number;
  vina: VinoRedak[];
};

export const NAZIV_VRSTE: Record<VrstaVina, string> = {
  SORTNO: "Sortno",
  CUVEE: "Cuvée",
  BEZ_TVRDNJE: "Bez tipa",
};

/** Litre u cijele mililitre. */
export function uMl(litre: number | null | undefined): number {
  return Math.round(Number(litre ?? 0) * 1000);
}

export function uLitre(ml: number): number {
  return ml / 1000;
}

/** Udio za prikaz: trag sorte nije nula, ali se na jednu decimalu ne vidi. */
export function opisUdjela(postotak: number): string {
  if (postotak > 0 && postotak < 0.05) return "<0,1 %";
  return `${postotak.toLocaleString("hr-HR", { maximumFractionDigits: 1 })} %`;
}

// ---------------------------------------------------------------------------
// Prosjek i sastav — isti racun za zbirni red i za simulaciju
// ---------------------------------------------------------------------------

export type Prosjek = {
  vrijednost: number | null;
  /** Mililitri vina koje za ovo polje ima podatak. */
  pokrivenoMl: number;
  /** Mililitri cijelog skupa. */
  ukupnoMl: number;
  /** Dio pokrivenog koji nije izmjeren na tom vinu (preneseno, knjiga, blend). */
  neizmjerenoMl: number;
};

type StavkaProsjeka = Pick<VinoRedak, "ml" | "parametri">;

/** Ponderirani prosjek; vino bez vrijednosti ne ulazi, ali se vidi u pokrivenosti. */
export function prosjekPoLitrama(stavke: StavkaProsjeka[], polje: PoljeProsjeka): Prosjek {
  let zbroj = 0;
  let pokrivenoMl = 0;
  let ukupnoMl = 0;
  let neizmjerenoMl = 0;

  for (const s of stavke) {
    if (s.ml <= 0) continue;
    ukupnoMl += s.ml;

    const p = s.parametri[polje];
    if (p.vrijednost == null) continue;

    zbroj += p.vrijednost * s.ml;
    pokrivenoMl += s.ml;
    if (p.podrijetlo !== "mjereno") neizmjerenoMl += s.ml;
  }

  return {
    vrijednost: pokrivenoMl > 0 ? zbroj / pokrivenoMl : null,
    pokrivenoMl,
    ukupnoMl,
    neizmjerenoMl,
  };
}

export type SortaSmjese = StavkaSorte & { ml: number };

/**
 * Sastav smjese po sortama. Vino bez poznatog sastava ide pod "Nepoznato
 * podrijetlo": njegove litre su stvarne, pa ne smiju napuhati udjele ostalih.
 */
export function sastavSmjese(stavke: Array<Pick<VinoRedak, "ml" | "sastav">>): SortaSmjese[] {
  const poSorti = new Map<string, number>();

  for (const s of stavke) {
    if (s.ml <= 0) continue;
    const sastav =
      s.sastav.length > 0 ? s.sastav : [{ nazivSorte: "Nepoznato podrijetlo", postotak: 100 }];
    for (const x of sastav) {
      poSorti.set(
        x.nazivSorte,
        (poSorti.get(x.nazivSorte) ?? 0) + Math.round((s.ml * x.postotak) / 100)
      );
    }
  }

  const ukupno = [...poSorti.values()].reduce((z, x) => z + x, 0);
  if (ukupno <= 0) return [];

  return [...poSorti.entries()]
    .map(([nazivSorte, ml]) => ({
      nazivSorte,
      ml,
      // Dvije decimale: mililitar zaokruzivanja ne smije prevagnuti na pragu.
      postotak: Math.round((ml / ukupno) * 10_000) / 100,
    }))
    .sort((a, b) => b.postotak - a.postotak);
}

/**
 * Isto pravilo kao `razvrstaj` (lib/identitet-vina.ts), koji se u klijentski kod
 * ne moze uvesti jer vuce citace knjige. Prag stize s rute, a
 * scripts/test-statistika-vina.ts usporeduje ovo s izvornikom na svim tankovima.
 */
export function razvrstajSastav(
  sastav: StavkaSorte[],
  prag: number
): { vrsta: VrstaVina; glavna: StavkaSorte | null } {
  const zbroj = new Map<string, number>();
  for (const s of sastav) zbroj.set(s.nazivSorte, (zbroj.get(s.nazivSorte) ?? 0) + s.postotak);

  const glavna =
    [...zbroj.entries()]
      .map(([nazivSorte, postotak]) => ({ nazivSorte, postotak }))
      .sort((a, b) => b.postotak - a.postotak)[0] ?? null;

  if (!glavna) return { vrsta: "BEZ_TVRDNJE", glavna: null };
  if (!jePravaSorta(glavna.nazivSorte)) return { vrsta: "BEZ_TVRDNJE", glavna };
  return { vrsta: glavna.postotak > prag ? "SORTNO" : "CUVEE", glavna };
}

// ---------------------------------------------------------------------------
// Zbroj skupa i simulacija
// ---------------------------------------------------------------------------

export type ZbrojVina = {
  ukupnoMl: number;
  prosjeci: Record<PoljeProsjeka, Prosjek>;
};

export function zbrojVina(stavke: StavkaProsjeka[]): ZbrojVina {
  const prosjeci = {} as Record<PoljeProsjeka, Prosjek>;
  for (const p of POLJA_PROSJEKA) prosjeci[p.kljuc] = prosjekPoLitrama(stavke, p.kljuc);
  return {
    ukupnoMl: stavke.reduce((z, s) => z + Math.max(0, s.ml), 0),
    prosjeci,
  };
}

/** Upis litara. `null` = nije valjan broj; prazno je nula, a ne greska. */
export function procitajUpis(upis: string): number | null {
  const t = upis.trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return uMl(n);
}

export type StavkaSimulacije = {
  vino: VinoRedak;
  /** Upisani mililitri; 0 kad je upis prazan ili neispravan. */
  ml: number;
  neispravno: boolean;
  /** Upisano vise nego sto je u tanku: dopusteno, ali se vidi. */
  preko: boolean;
};

export type RezultatSimulacije = ZbrojVina & {
  stavke: StavkaSimulacije[];
  sastav: SortaSmjese[];
  vrsta: VrstaVina;
  glavna: StavkaSorte | null;
};

export function simuliraj(
  odabir: Array<{ vino: VinoRedak; upis: string }>,
  prag: number
): RezultatSimulacije {
  const stavke = odabir.map(({ vino, upis }): StavkaSimulacije => {
    const ml = procitajUpis(upis);
    return {
      vino,
      ml: ml ?? 0,
      neispravno: ml === null,
      preko: (ml ?? 0) > vino.ml,
    };
  });

  const zaRacun = stavke.map((s) => ({
    ml: s.ml,
    parametri: s.vino.parametri,
    sastav: s.vino.sastav,
  }));

  const sastav = sastavSmjese(zaRacun);
  return { ...zbrojVina(zaRacun), stavke, sastav, ...razvrstajSastav(sastav, prag) };
}

// ---------------------------------------------------------------------------
// Filtri, sortiranje, grupiranje, stupci
// ---------------------------------------------------------------------------

/** Polja koja imaju podatak barem na jednom vinu. Prazan stupac se ne crta. */
export function stupciSPodacima(vina: VinoRedak[]) {
  return POLJA_PREGLEDA.filter((p) =>
    vina.some((v) => v.parametri[p.kljuc].vrijednost != null)
  );
}

export const BEZ_GODISTA = "bez-godista";
export const BEZ_SIFRE = "bez-sifre";

export function kljucGodine(v: VinoRedak): string {
  return v.godiste == null ? BEZ_GODISTA : String(v.godiste);
}

export function kljucVina(v: VinoRedak): string {
  return v.sifra ?? BEZ_SIFRE;
}

export const GRUPA_CUVEE = NAZIV_VRSTE.CUVEE;
export const GRUPA_BEZ_TIPA = NAZIV_VRSTE.BEZ_TVRDNJE;

/**
 * Pod kojom "sortom" vino stoji — tip iz `razvrstaj`, ne najveci udio
 * (vlasnik, 03.11.2026.). Sortno vino ide pod svoju sortu, a cuvée nije ni pod
 * kojom: T42 je 53 % Graševina, a nije Graševina.
 */
export function grupaSorte(v: VinoRedak): string {
  if (v.vrsta === "CUVEE") return GRUPA_CUVEE;
  if (v.vrsta === "SORTNO" && v.glavna) return v.glavna.nazivSorte;
  return GRUPA_BEZ_TIPA;
}

/** Je li izbor filtra prava sorta, a ne oznaka "Cuvée" ili "Bez tipa". */
export function jeIzborSorte(izbor: string): boolean {
  return izbor !== "" && izbor !== GRUPA_CUVEE && izbor !== GRUPA_BEZ_TIPA;
}

/**
 * Izbor filtra: sorte sortnih vina i sorte iz cuvéea (do njih vodi kvacica), pa
 * dvije oznake na kraju, ako takvih vina ima.
 */
export function opcijeSorte(vina: VinoRedak[]): string[] {
  const sorte = new Set<string>();
  for (const v of vina) {
    if (v.vrsta === "SORTNO" && v.glavna) sorte.add(v.glavna.nazivSorte);
    if (v.vrsta === "CUVEE") {
      for (const s of v.sastav) if (jePravaSorta(s.nazivSorte)) sorte.add(s.nazivSorte);
    }
  }
  const oznake = [GRUPA_CUVEE, GRUPA_BEZ_TIPA].filter((o) => vina.some((v) => grupaSorte(v) === o));
  return [...[...sorte].sort((a, b) => a.localeCompare(b, "hr")), ...oznake];
}

/** "Graševina" -> "grasevina", da "grase" nadje Graševinu i na mobitelu. */
function bezKvacica(s: string): string {
  return s
    .toLocaleLowerCase("hr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

export type Filtri = {
  tekst: string;
  /** Prazno = sve. Ista podjela po kojoj se i grupira: `grupaSorte`. */
  sorta: string;
  /** Uz odabranu sortu pokazuje i cuvée koji je sadrzi. Zadano iskljuceno. */
  ukljuciCuvee: boolean;
  /** Kljuc vina: sifra. Isti naziv nose i razlicita vina. */
  vino: string;
  godina: string;
  tip: "" | VrstaVina;
};

export const PRAZNI_FILTRI: Filtri = {
  tekst: "",
  sorta: "",
  ukljuciCuvee: false,
  vino: "",
  godina: "",
  tip: "",
};

function prolaziSortu(v: VinoRedak, f: Filtri): boolean {
  if (!f.sorta || grupaSorte(v) === f.sorta) return true;
  return (
    f.ukljuciCuvee &&
    v.vrsta === "CUVEE" &&
    jeIzborSorte(f.sorta) &&
    v.sastav.some((s) => s.nazivSorte === f.sorta)
  );
}

export function filtrirajVina(vina: VinoRedak[], f: Filtri): VinoRedak[] {
  const t = bezKvacica(f.tekst.trim());

  return vina.filter((v) => {
    if (!prolaziSortu(v, f)) return false;
    if (f.vino && kljucVina(v) !== f.vino) return false;
    if (f.godina && kljucGodine(v) !== f.godina) return false;
    if (f.tip && v.vrsta !== f.tip) return false;
    if (!t) return true;
    const pretraga = [
      `t${v.broj}`,
      v.sifra ?? "",
      v.naziv,
      ...v.sastav.map((s) => s.nazivSorte),
    ].join(" ");
    return bezKvacica(pretraga).includes(t);
  });
}

export type StupacSorta =
  | "broj"
  | "sifra"
  | "vino"
  | "sastav"
  | "godina"
  | "litre"
  | "datum"
  | PoljePregleda;

export type Smjer = "asc" | "desc";

const USPOREDBA = new Intl.Collator("hr", { numeric: true, sensitivity: "base" });

function vrijednostZaSort(v: VinoRedak, s: StupacSorta): string | number | null {
  switch (s) {
    case "broj":
      return v.broj;
    case "sifra":
      return v.sifra;
    case "vino":
      return v.naziv;
    case "sastav":
      return v.glavna?.nazivSorte ?? null;
    case "godina":
      return v.godiste;
    case "litre":
      return v.ml;
    case "datum":
      return v.zadnjeMjerenjeAt;
    default:
      return v.parametri[s].vrijednost;
  }
}

/** Prazno je uvijek na dnu, u oba smjera. Unutar istog: po broju tanka. */
export function sortirajVina(vina: VinoRedak[], stupac: StupacSorta, smjer: Smjer): VinoRedak[] {
  const znak = smjer === "asc" ? 1 : -1;

  return [...vina].sort((x, y) => {
    const a = vrijednostZaSort(x, stupac);
    const b = vrijednostZaSort(y, stupac);
    if (a == null && b == null) return x.broj - y.broj;
    if (a == null) return 1;
    if (b == null) return -1;
    const r =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : USPOREDBA.compare(String(a), String(b));
    return r !== 0 ? znak * r : x.broj - y.broj;
  });
}

export type Grupiranje = "nista" | "sorta" | "vino" | "godina" | "tip";

export type GrupaVina = { kljuc: string; naziv: string; vina: VinoRedak[] };

function kljucGrupe(v: VinoRedak, po: Exclude<Grupiranje, "nista">): string {
  if (po === "sorta") return grupaSorte(v);
  if (po === "vino") return kljucVina(v);
  if (po === "godina") return kljucGodine(v);
  return v.vrsta;
}

function nazivGrupe(kljuc: string, po: Exclude<Grupiranje, "nista">, prvo: VinoRedak): string {
  if (po === "vino") return kljuc === BEZ_SIFRE ? "bez šifre" : `${kljuc} · ${prvo.naziv}`;
  if (po === "godina") return kljuc === BEZ_GODISTA ? "bez godišta" : kljuc;
  if (po === "tip") return NAZIV_VRSTE[kljuc as VrstaVina];
  return kljuc;
}

/** Oznake koje nisu vrijednost nego kategorija idu iza abecednih grupa. */
function redGrupe(kljuc: string): number {
  if (kljuc === GRUPA_CUVEE) return 1;
  if (kljuc === GRUPA_BEZ_TIPA) return 2;
  if (kljuc === BEZ_GODISTA || kljuc === BEZ_SIFRE) return 3;
  return 0;
}

/** Grupe abecedno; vina unutar grupe zadrzavaju poredak koji im je dan. */
export function grupirajVina(vina: VinoRedak[], po: Grupiranje): GrupaVina[] {
  if (po === "nista") return [{ kljuc: "sve", naziv: "", vina }];

  const mapa = new Map<string, VinoRedak[]>();
  for (const v of vina) {
    const k = kljucGrupe(v, po);
    const lista = mapa.get(k);
    if (lista) lista.push(v);
    else mapa.set(k, [v]);
  }

  return [...mapa.entries()]
    .sort(([a], [b]) => redGrupe(a) - redGrupe(b) || USPOREDBA.compare(a, b))
    .map(([kljuc, z]) => ({ kljuc, naziv: nazivGrupe(kljuc, po, z[0]), vina: z }));
}
