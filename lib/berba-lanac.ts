import type { Prisma } from "@prisma/client";
import { uValovima } from "@/lib/paralelno";

/**
 * BERBA KROZ LANAC BLENDA
 * =======================
 *
 * `PunjenjeTanka` nastaje na jednom jedinom mjestu — `/api/punjenje`. Pretok,
 * filtracija, flotacija i talozenje vino PREMJESTAJU, a punjenja ne diraju.
 * Zato zapis o berbi (parcela, vinograd, oznaka, kilogrami grozdja, secer /
 * kiseline / pH na grozdju, maceracija) ostaje na tanku u koji je grozdje
 * USLO, dok vino zavrsi negdje trece. Odrediste — tank u kojem vino stvarno
 * jest — o svojoj berbi ne pokazuje nista.
 *
 * Ovaj modul cita berbu ISTIM PUTEM kojim `parametriBlenda` (lib/mjerenja.ts)
 * cita mjerenja: kroz `BlendIzvor`, redak po redak, s tanka na tank. Nista se
 * ne upisuje — racuna se pri prikazu, pa se osvjezi cim se sastavnica ispravi.
 *
 * CETIRI ODLUKE, sve namjerne:
 *
 * 1. LITRE OSTAJU IZVORNE, NE SKALIRAJU SE.
 *    Kad je od 5.200 L u izvoru preslo 4.800 L, stavka berbe se i dalje
 *    prikazuje s onoliko litara i kilograma koliko je zapisano pri punjenju.
 *    Skaliranje bi izmislilo kilograme koje nitko nije izvagao: kg grozdja i
 *    secer pri berbi opisuju BERBENU PARTIJU, ne sadrzaj tanka. Umjesto toga
 *    svaka karika nosi `presloL` i `odUkupnoL`, pa prikaz moze reci
 *    "preslo 4.800 L od 5.200 L" i pustiti citatelja da sam vidi omjer.
 *
 * 2. SUMNJIVO SE PRENOSI.
 *    Isto pravilo koje `parametriBlenda` vec ima: sastavnica koja pokazuje na
 *    ZIVI tank cita ono sto je u tom tanku SADA, a tank se u medjuvremenu
 *    mogao isprazniti i napuniti tudjim vinom. Takva karika ide s
 *    `sumnjiv: true`, i sumnja se nasljedjuje niz cijeli put — sve sto dolazi
 *    kroz sumnjivu kariku je sumnjivo. Bolje da se krivi pokazivaci vide kao
 *    sumnjivi nego da se citaju kao cinjenica (u bazi postoje retci koji su
 *    krivi vec pri nastanku i namjerno ostavljeni takvima).
 *
 * 3. DUBINA 2.
 *    Tank -> njegove sastavnice -> njihove sastavnice, i tu stane. Dublje
 *    citanje mnozi upite, a treca razina je u praksi vec toliko razrijedjena
 *    da "od 5.200 L preslo 4.800 L, od toga 900 L" vise ne kaze nista korisno.
 *    Kad se stane a ima jos, vraca se `staloNaDubini: true` — prikaz to smije
 *    reci, umjesto da sutnja izgleda kao "nema vise".
 *
 * 4. REGISTAR POSJECENIH.
 *    `BlendIzvor` u zatecenoj bazi ima retke koji pokazuju sami na sebe
 *    (T34 <- T34, T1 <- T1, T3 <- T3) — nastaju kad tank blenda u samog sebe.
 *    Bez registra bi obilazak takav redak citao u krug. Registar je GLOBALAN
 *    za cijeli obilazak, ne po grani: isti izvor dosegnut dvama putevima
 *    prikazuje se jednom, po prvom (dakle najkracem) putu.
 *
 * OGRANICENJE, zapisano da se ne trazi dvaput: iz ARHIVE se ne ide dublje.
 * Arhiviranje brise `BlendIzvor` retke tanka koji se prazni
 * (lib/pretok-arhiviranje.ts, `blendIzvor.deleteMany`), pa arhivirano vino
 * nema zapisa o vlastitim sastavnicama. Arhiva je zato uvijek list lanca —
 * njezina se berba procita i tu je kraj.
 */

/** Jedna stavka berbe, u obliku zajednickom zivom tanku i arhivi. */
export type StavkaBerbe = {
  id: string;
  nazivSorte: string;
  kolicinaLitara: number;
  kolicinaKgGrozdja: number | null;
  opis: string | null;
  datumBerbe: Date | null;
  godinaBerbe: number | null;
  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
  secer: number | null;
  kiseline: number | null;
  ph: number | null;
  napomenaBerbe: string | null;
  maceracija: boolean | null;
  maceracijaSati: number | null;
};

/** Jedno punjenje sa svojim stavkama. */
export type PunjenjeBerbe = {
  id: string;
  nazivVina: string | null;
  datumPunjenja: Date;
  stavke: StavkaBerbe[];
};

/**
 * Jedan korak puta od promatranog tanka prema izvoru berbe.
 *
 * `presloL` je `BlendIzvor.kolicina` — koliko je litara tim korakom doslo.
 * `odUkupnoL` je zbroj litara koje IZVOR ima zapisane u vlastitim punjenjima,
 * dakle nazivnik za "preslo X od Y". Nula znaci da izvor nema svojih punjenja
 * (berba mu dolazi jos dublje) i tada se omjer nema s cim iskazati.
 */
export type KarikaLanca = {
  /** `BlendIzvor.id` — jedini stabilan kljuc te veze. */
  blendIzvorId: string;
  /** "tank 12" ili "arhiva tanka 7". */
  naziv: string;
  presloL: number;
  odUkupnoL: number;
  /** Zivi tank cije se vino u medjuvremenu promijenilo. */
  sumnjiv: boolean;
};

/** Berba jednog izvora, zajedno s putem kojim se do njega doslo. */
export type IzvorBerbe = {
  /** Stabilan kljuc za React: id-evi karika spojeni crticom. */
  kljuc: string;
  /** Od promatranog tanka prema izvoru. Duljina = dubina (1 ili 2). */
  put: KarikaLanca[];
  /** Bilo koja karika na putu sumnjiva -> cijeli izvor je sumnjiv. */
  sumnjiv: boolean;
  punjenja: PunjenjeBerbe[];
};

/**
 * Jedna stavka berbe izvadjena iz grupe, sa svojim putem uza se.
 *
 * ZASTO RAVNO, A NE PO IZVORIMA: u pogonu se most uvijek dijeli — dobar dio u
 * jednu bacvu, zadnji (mutniji) dio u drugu. Ta druga bacva prima zadnje
 * dijelove IZ VISE BERBI I VISE DANA, pa joj blend naraste na pet, deset,
 * dvadeset izvora. Grupirano po izvoru to je popis popisa bez ijednog datuma
 * na koji se oko moze uhvatiti. Kronoloski poredane stavke citaju se kao ono
 * sto jesu — dnevnik berbe.
 *
 * Put ide UZ SVAKU STAVKU, ne iznad grupe, jer nakon sortiranja susjedne
 * stavke vise ne dijele izvor.
 */
export type StavkaULancu = {
  /** Stabilan kljuc za React: put + id stavke. */
  kljuc: string;
  stavka: StavkaBerbe;
  /** Punjenje iz kojeg stavka dolazi (naziv vina i datum punjenja). */
  punjenje: { id: string; nazivVina: string | null; datumPunjenja: Date };
  /** Isti put kao na `IzvorBerbe`, prenesen radi prikaza uz stavku. */
  put: KarikaLanca[];
  sumnjiv: boolean;
  /** Ima li stavka stvarni datum berbe — one bez njega idu na kraj. */
  imaDatumBerbe: boolean;
};

/**
 * Zbroj naslijedjene berbe.
 *
 * NEMA I NECE IMATI ZBROJ KILOGRAMA. Iz svake berbe je u ovaj tank dosao samo
 * DIO (obicno zadnji, mutniji), a kilogrami grozdja opisuju cijelu berbenu
 * partiju. Zbrojeni bi tvrdili da je u ovom tanku grozdje kojeg vecina nikad
 * nije ni usla — jedan broj koji je kriv za svaku bacvu na kojoj bi stajao.
 * Litre se smiju zbrojiti jer se za njih zna koliko ih je stvarno preslo.
 */
export type SazetakLanca = {
  /** Koliko zapisa berbe (stavki punjenja) dolazi kroz lanac. */
  zapisa: number;
  /** Koliko IZRAVNIH sastavnica ih je donijelo. */
  izravnihIzvora: number;
  /**
   * Litre koje su u OVAJ tank stvarno usle, zbrojene po izravnim sastavnicama
   * i bez dvostrukog brojanja: dublje karike su dio iste kolicine, ne dodatak
   * njoj. Broje se samo sastavnice koje su ista i donijele — ona kroz koju
   * nema nijednog zapisa berbe nema se ovdje cime iskazati.
   */
  presloUkupnoL: number;
  /** Raspon datuma berbe medju stavkama koje ga imaju. */
  odDatuma: Date | null;
  doDatuma: Date | null;
};

export type BerbaLanca = {
  /** Poredano po dubini, pa po kolicini prve karike (silazno). */
  izvori: IzvorBerbe[];
  /** Iste stavke, ravno i poredano po DATUMU BERBE — ovo prikazuje monitor. */
  stavke: StavkaULancu[];
  sazetak: SazetakLanca;
  /** Koliko je izvora preskoceno jer su vec bili posjeceni (ciklus ili drugi put do istog). */
  preskocenoCiklusa: number;
  /** Ima jos sastavnica ispod zadnje procitane razine, ali se ne citaju. */
  staloNaDubini: boolean;
};

/**
 * Prazan rezultat, za tank koji nema nijednu sastavnicu.
 *
 * Izvezen, da ga pozivatelj ne mora prepisivati rukom — takva bi kopija pri
 * svakom novom polju u `BerbaLanca` prestala odgovarati tipu, i to na mjestu
 * koje s obilaskom nema veze.
 */
export const PRAZAN_LANAC: BerbaLanca = {
  izvori: [],
  stavke: [],
  sazetak: {
    zapisa: 0,
    izravnihIzvora: 0,
    presloUkupnoL: 0,
    odDatuma: null,
    doDatuma: null,
  },
  preskocenoCiklusa: 0,
  staloNaDubini: false,
};

type CitacBerbe = Pick<
  Prisma.TransactionClient,
  "blendIzvor" | "punjenjeTanka" | "arhivaVina" | "arhivaPunjenjeTanka"
>;

/** Cvor u obilasku: tank cije sastavnice tek treba procitati. */
type Cvor = {
  tankId: string;
  put: KarikaLanca[];
};

/** Kandidat za sljedecu razinu, prije provjere registra. */
type Kandidat = {
  kljucPosjeta: string;
  karika: KarikaLanca;
  put: KarikaLanca[];
  /** Popunjen samo za zive tankove — arhiva je uvijek list. */
  izvorTankId: string | null;
  izvorArhivaVinaId: string | null;
};

export async function berbaKrozLanac(
  db: CitacBerbe,
  tankId: string,
  opts?: { dubina?: number; sirina?: number }
): Promise<BerbaLanca> {
  const maxDubina = opts?.dubina ?? 2;
  // Sirina 2, ne 4: ovo se na stranici tanka vrti pored ostalih valova, a
  // pooler drzi 15 veza za CIJELU aplikaciju (vidi lib/paralelno.ts).
  const sirina = opts?.sirina ?? 2;

  const posjeceni = new Set<string>([`tank:${tankId}`]);
  const izvori: IzvorBerbe[] = [];
  let preskocenoCiklusa = 0;
  let staloNaDubini = false;

  let razina: Cvor[] = [{ tankId, put: [] }];

  for (let dubina = 1; dubina <= maxDubina; dubina++) {
    if (razina.length === 0) break;

    // Sastavnice svih cvorova ove razine — usporedno, ali ograniceno.
    const poCvoru = await uValovima(
      razina.map((cvor) => () => sastavniceTanka(db, cvor)),
      sirina
    );

    // Registar se primjenjuje SEKVENCIJALNO, po redu (kolicina silazno unutar
    // cvora, cvorovi po redu s prethodne razine), da ishod ne ovisi o tome
    // koji je upit prvi zavrsio.
    const kandidati: Kandidat[] = [];
    for (const k of poCvoru.flat()) {
      if (posjeceni.has(k.kljucPosjeta)) {
        preskocenoCiklusa++;
        continue;
      }
      posjeceni.add(k.kljucPosjeta);
      kandidati.push(k);
    }

    if (kandidati.length === 0) break;

    if (dubina === maxDubina && kandidati.some((k) => k.izvorTankId)) {
      // Zadnja razina koju citamo, a medju izvorima ima zivih tankova koji bi
      // mogli imati vlastite sastavnice. Ne provjerava se upitom je li ih
      // stvarno ima — ta bi provjera bila tocno onaj upit koji smo odlucili ne
      // poslati. Radije se kaze "moglo bi biti jos" nego da se sutnja procita
      // kao "nema vise".
      staloNaDubini = true;
    }

    const procitani = await uValovima(
      kandidati.map((k) => () => berbaIzvora(db, k)),
      sirina
    );

    const sljedeca: Cvor[] = [];
    for (let i = 0; i < kandidati.length; i++) {
      const k = kandidati[i];
      const { punjenja, ukupnoL } = procitani[i];

      // `odUkupnoL` se zna tek nakon citanja punjenja, pa se karika ovdje
      // dopunjuje. Sumnja se nasljedjuje niz put.
      const karika: KarikaLanca = { ...k.karika, odUkupnoL: ukupnoL };
      const put = [...k.put, karika];

      if (punjenja.length > 0) {
        izvori.push({
          kljuc: put.map((x) => x.blendIzvorId).join("-"),
          put,
          sumnjiv: put.some((x) => x.sumnjiv),
          punjenja,
        });
      }

      // Dalje se ide i kad izvor NEMA svojih punjenja — upravo tada je berba
      // jos dublje. Iz arhive se ne ide (nema zapisanih sastavnica).
      if (k.izvorTankId) sljedeca.push({ tankId: k.izvorTankId, put });
    }

    razina = sljedeca;
  }

  const stavke = poredajPoBerbi(izvori);

  return { izvori, stavke, sazetak: sazmi(izvori, stavke), preskocenoCiklusa, staloNaDubini };
}

/**
 * Kljuc po kojem se stavke berbe poredaju — bilo cije, vlastite ili naslijedjene.
 */
export type PoredakBerbe = {
  datumBerbe: Date | null;
  /** Zamjena kad datuma berbe nema; stavke bez njega idu na kraj. */
  datumPunjenja: Date;
  /** Pri istom datumu ide veca kolicina prva (presle litre ili litre stavke). */
  tezina: number;
  /** Zadnji rasplet, da poredak ne ovisi o redoslijedu citanja iz baze. */
  kljuc: string;
};

/**
 * Poredak zapisa berbe: po DATUMU BERBE, uzlazno.
 *
 * Uzlazno, jer je ovo dnevnik: bacva se punila redom kojim je grozdje stizalo,
 * pa se tako i cita. Stavke BEZ datuma berbe idu NA KRAJ (medjusobno po datumu
 * punjenja) — nepoznat datum nije "davno", pa se ne smije uguravati na pocetak.
 *
 * JEDNO PRAVILO ZA OBA POPISA: monitor tanka njime slaze i vlastite stavke
 * punjenja i one naslijedjene kroz lanac. Razlog je isti za oba — most se
 * uvijek dijeli, a bacva sa zadnjim dijelovima puni se kroz vise dana i vise
 * berbi, bilo izravno iz prese (vlastite stavke) bilo pretokom (naslijedjene).
 * Dva razlicita poretka u istoj kartici citala bi se kao greska.
 */
export function usporediPoBerbi(a: PoredakBerbe, b: PoredakBerbe): number {
  const aIma = a.datumBerbe != null;
  const bIma = b.datumBerbe != null;
  if (aIma !== bIma) return aIma ? -1 : 1;

  const da = (a.datumBerbe ?? a.datumPunjenja).getTime();
  const dbb = (b.datumBerbe ?? b.datumPunjenja).getTime();
  if (da !== dbb) return da - dbb;

  if (a.tezina !== b.tezina) return b.tezina - a.tezina;

  return a.kljuc.localeCompare(b.kljuc);
}

/** Sve stavke svih izvora u jedan popis, poredan istim pravilom. */
function poredajPoBerbi(izvori: IzvorBerbe[]): StavkaULancu[] {
  const popis: StavkaULancu[] = [];

  for (const izvor of izvori) {
    for (const p of izvor.punjenja) {
      for (const s of p.stavke) {
        popis.push({
          kljuc: `${izvor.kljuc}-${s.id}`,
          stavka: s,
          punjenje: {
            id: p.id,
            nazivVina: p.nazivVina,
            datumPunjenja: p.datumPunjenja,
          },
          put: izvor.put,
          sumnjiv: izvor.sumnjiv,
          imaDatumBerbe: s.datumBerbe != null,
        });
      }
    }
  }

  const kljucPoretka = (x: StavkaULancu): PoredakBerbe => ({
    datumBerbe: x.stavka.datumBerbe,
    datumPunjenja: x.punjenje.datumPunjenja,
    // Tezina su litre koje su PRESLE, ne litre stavke: kod naslijedjenih je
    // mjera vaznosti koliko ih je u ovaj tank stvarno uslo.
    tezina: x.put[0]?.presloL ?? 0,
    kljuc: x.kljuc,
  });

  return popis.sort((a, b) => usporediPoBerbi(kljucPoretka(a), kljucPoretka(b)));
}

function sazmi(izvori: IzvorBerbe[], stavke: StavkaULancu[]): SazetakLanca {
  // Po IZRAVNIM sastavnicama (prva karika), svaka jednom. Dublje karike opisuju
  // odakle je ta ista kolicina dosla prije, pa bi njihovo zbrajanje ista brojalo
  // dvaput.
  const izravne = new Map<string, number>();
  for (const izvor of izvori) {
    const prva = izvor.put[0];
    if (prva) izravne.set(prva.blendIzvorId, prva.presloL);
  }

  const datumi = stavke
    .map((x) => x.stavka.datumBerbe)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    zapisa: stavke.length,
    izravnihIzvora: izravne.size,
    presloUkupnoL: Array.from(izravne.values()).reduce((z, l) => z + l, 0),
    odDatuma: datumi[0] ?? null,
    doDatuma: datumi[datumi.length - 1] ?? null,
  };
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Zapis kaze jedno vino, tank sada drzi drugo -> podatak pripada tudjem vinu.
 *
 * Istovjetno pravilo koristi `parametriBlenda` u lib/mjerenja.ts. Prazan tank
 * NIJE sumnjiv: on nista ne tvrdi, pa nema s cim proturjeciti zapisu.
 */
export function izvorJeSumnjiv(
  zapis: { nazivVina: string | null; sorta: string | null },
  tank:
    | {
        nazivVina: string | null;
        sorta: string | null;
        kolicinaVinaUTanku: number | null;
      }
    | null
    | undefined
): boolean {
  if (!tank) return false;

  const prazan =
    Number(tank.kolicinaVinaUTanku ?? 0) <= 0 && !tank.nazivVina && !tank.sorta;
  if (prazan) return false;

  return (
    norm(tank.nazivVina) !== norm(zapis.nazivVina) ||
    norm(tank.sorta) !== norm(zapis.sorta)
  );
}

/** Sastavnice jednog tanka, vec pretvorene u kandidate za sljedecu razinu. */
async function sastavniceTanka(db: CitacBerbe, cvor: Cvor): Promise<Kandidat[]> {
  const redci = await db.blendIzvor.findMany({
    where: { ciljTankId: cvor.tankId },
    orderBy: { kolicina: "desc" },
    include: {
      izvorTank: {
        select: {
          broj: true,
          nazivVina: true,
          sorta: true,
          kolicinaVinaUTanku: true,
        },
      },
      izvorArhivaVina: { select: { brojTanka: true } },
    },
  });

  const kandidati: Kandidat[] = [];

  for (const b of redci) {
    // Sastavnica bez pokazivaca (rucno upisan naziv vina) nema odakle imati
    // berbu — ne stvara kariku i ne trosi upit.
    if (!b.izvorTankId && !b.izvorArhivaVinaId) continue;

    const naziv = b.izvorArhivaVinaId
      ? `arhiva tanka ${b.izvorArhivaVina?.brojTanka ?? "?"}`
      : `tank ${b.izvorTank?.broj ?? "?"}`;

    kandidati.push({
      kljucPosjeta: b.izvorArhivaVinaId
        ? `arhiva:${b.izvorArhivaVinaId}`
        : `tank:${b.izvorTankId}`,
      karika: {
        blendIzvorId: b.id,
        naziv,
        presloL: Number(b.kolicina ?? 0),
        odUkupnoL: 0, // popunjava se nakon citanja punjenja
        sumnjiv: b.izvorTankId
          ? izvorJeSumnjiv({ nazivVina: b.nazivVina, sorta: b.sorta }, b.izvorTank)
          : false,
      },
      put: cvor.put,
      izvorTankId: b.izvorTankId,
      izvorArhivaVinaId: b.izvorArhivaVinaId,
    });
  }

  return kandidati;
}

/** Punjenja jednog izvora — zivog tanka ili arhive — u zajednickom obliku. */
async function berbaIzvora(
  db: CitacBerbe,
  k: Kandidat
): Promise<{ punjenja: PunjenjeBerbe[]; ukupnoL: number }> {
  const punjenja = k.izvorArhivaVinaId
    ? await punjenjaArhive(db, k.izvorArhivaVinaId)
    : await punjenjaTanka(db, k.izvorTankId!);

  const ukupnoL = punjenja.reduce(
    (zbroj, p) =>
      zbroj + p.stavke.reduce((s, x) => s + Number(x.kolicinaLitara ?? 0), 0),
    0
  );

  return { punjenja, ukupnoL };
}

async function punjenjaTanka(
  db: CitacBerbe,
  tankId: string
): Promise<PunjenjeBerbe[]> {
  // Granica arhive, istim rezonom kao u `vrijednostiTankaPoPolju`: ispred
  // zadnjeg arhiviranja je bilo DRUGO vino. Arhiviranje punjenja i brise, pa
  // je ovo danas pojas uz tregere — ali filtracija tank prazni BEZ arhiviranja
  // (lib/filtracija.ts), pa ondje stara punjenja stvarno ostaju na tanku.
  const zadnjaArhiva = await db.arhivaVina.findFirst({
    where: { tankId },
    orderBy: { arhiviranoAt: "desc" },
    select: { arhiviranoAt: true },
  });

  const punjenja = await db.punjenjeTanka.findMany({
    where: {
      tankId,
      ...(zadnjaArhiva
        ? { datumPunjenja: { gte: zadnjaArhiva.arhiviranoAt } }
        : {}),
      stavke: { some: { obrisano: false } },
    },
    orderBy: { datumPunjenja: "desc" },
    include: {
      stavke: {
        where: { obrisano: false },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return punjenja.map((p) => ({
    id: p.id,
    nazivVina: p.nazivVina,
    datumPunjenja: p.datumPunjenja,
    stavke: p.stavke.map((s) => ({
      id: s.id,
      nazivSorte: s.nazivSorte,
      kolicinaLitara: Number(s.kolicinaLitara ?? 0),
      kolicinaKgGrozdja:
        s.kolicinaKgGrozdja == null ? null : Number(s.kolicinaKgGrozdja),
      opis: s.opis,
      datumBerbe: s.datumBerbe,
      godinaBerbe: s.godinaBerbe,
      polozaj: s.polozaj,
      parcela: s.parcela,
      vinograd: s.vinograd,
      oznakaBerbe: s.oznakaBerbe,
      secer: s.secer == null ? null : Number(s.secer),
      kiseline: s.kiseline == null ? null : Number(s.kiseline),
      ph: s.ph == null ? null : Number(s.ph),
      napomenaBerbe: s.napomenaBerbe,
      maceracija: s.maceracija,
      maceracijaSati:
        s.maceracijaSati == null ? null : Number(s.maceracijaSati),
    })),
  }));
}

async function punjenjaArhive(
  db: CitacBerbe,
  arhivaVinaId: string
): Promise<PunjenjeBerbe[]> {
  const punjenja = await db.arhivaPunjenjeTanka.findMany({
    where: { arhivaVinaId },
    orderBy: { datumPunjenja: "desc" },
    include: { stavke: { orderBy: { createdAt: "asc" } } },
  });

  // NAPOMENA: `ArhivaPunjenjeStavka` nema `obrisano`, a arhiviranje kopira i
  // obrisane stavke (lib/pretok-arhiviranje.ts cita punjenja bez tog filtra).
  // U arhivi se zato obrisana stavka ne moze razlikovati od zive. To je
  // zatecena rupa u ARHIVIRANJU, ne u ovom citanju — popravlja se ondje.
  return punjenja.map((p) => ({
    id: p.id,
    nazivVina: p.nazivVina,
    datumPunjenja: p.datumPunjenja,
    stavke: p.stavke.map((s) => ({
      id: s.id,
      nazivSorte: s.nazivSorte,
      kolicinaLitara: Number(s.kolicinaLitara ?? 0),
      kolicinaKgGrozdja:
        s.kolicinaKgGrozdja == null ? null : Number(s.kolicinaKgGrozdja),
      opis: s.opis,
      datumBerbe: s.datumBerbe,
      godinaBerbe: s.godinaBerbe,
      polozaj: s.polozaj,
      parcela: s.parcela,
      vinograd: s.vinograd,
      oznakaBerbe: s.oznakaBerbe,
      secer: s.secer == null ? null : Number(s.secer),
      kiseline: s.kiseline == null ? null : Number(s.kiseline),
      ph: s.ph == null ? null : Number(s.ph),
      napomenaBerbe: s.napomenaBerbe,
      maceracija: s.maceracija,
      maceracijaSati:
        s.maceracijaSati == null ? null : Number(s.maceracijaSati),
    })),
  }));
}
