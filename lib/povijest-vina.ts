/**
 * POVIJEST JEDNOG VINA — sto je s njim radeno dok je bilo u toj posudi.
 * ===========================================================================
 *
 * Kucica odgovara na pitanje ODAKLE je vino doslo. Ovo odgovara na drugo: sto
 * je s njim radeno od rodjenja u toj posudi do casa kad je otislo dalje.
 *
 * BEZ IJEDNOG UPITA. Sve sto treba vec je dohvaceno:
 *   - `VinoRadnja` danasnjeg tanka nosi `izvorniTankId` i `dogodenoAt`, a ti
 *     redci zive u posudi koja vino DANAS drzi — pa ih praznjenje pretka ne
 *     brise. Mjereno 14.09.2026: 299 od 393 cvora u stablima podruma ima
 *     naslijedene retke.
 *   - `Mjerenje` je po posudi i preživi praznjenje; dohvaca ga pozivatelj,
 *     jednim upitom za sve pretke odjednom.
 *   - Ulazi i izlazi dolaze iz knjige, koju modul identiteta ionako drzi.
 *
 * `izvorniTankId` znaci GDJE JE RADNJA IZVEDENA. Zato kucica pokazuje sto je
 * radeno NA TOJ RAZINI, a dublje razine pokazuju svoje — nista se ne
 * duplicira i nista ne ispada.
 *
 * TRI PRAZNA KRAJA SE RAZLIKUJU, i to je vlasnikov zahtjev (14.09.2026):
 * "ako vino iz te posude nema nijedan zapis nigdje, a proslo je fermentaciju,
 * to je rupa u evidenciji i ne smije izgledati kao uredan kraj".
 *
 * Granice nisu odabrane od oka nego iz podruma (mjereno 14.09.2026, 242 cvora
 * bez ijedne radnje):
 *   - 172 ih ima prozor KRACI OD SATA — vino je uslo i odmah otislo;
 *   - 190 ih ima prozor do jednog dana i nijedno mjerenje;
 *   - 38 ih ima prozor duzi od tri dana bez ijednog zapisa i bez mjerenja.
 * Prvo je istina o vinu, zadnje je rupa u evidenciji. Izmedju se ne tvrdi
 * nista.
 */

export const PRAG_PROLAZNA_MS = 24 * 60 * 60 * 1000;
export const PRAG_RUPE_MS = 3 * 24 * 60 * 60 * 1000;

/** `VinoRadnja` onoliko koliko ovaj racun treba. */
export type RedakRadnje = {
  izvorniTankId: string;
  dogodenoAt: Date;
  vrsta: string;
  opis: string | null;
  preparatNaziv: string | null;
  jedinicaNaziv: string | null;
  kolicina: number | null;
  jeKvasac: boolean;
  /** Kljuc deduplikacije naprama arhivi; ista radnja zna postojati dvaput. */
  izvornaRadnjaId?: string | null;
};

/**
 * `ArhivaVinaRadnja` — radnja posude koja je u medjuvremenu ARHIVIRANA.
 *
 * NEMA `jeKvasac`, i to se ne da zaobici: arhiva to polje ne nosi, a naknadno
 * spajanje na `Preparation.jeKvasac` je zabranjeno — gasenje oznake u katalogu
 * unatrag bi mijenjalo povijest fermentacije. Arhivska radnja zato ulazi u
 * dodatke i radnje, ali NIKAD u popis kvasaca.
 */
export type RedakArhivskeRadnje = {
  tankId: string | null;
  /** Arhiva nema `dogodenoAt`; `createdAt` je cas kad se radnja dogodila. */
  createdAt: Date;
  vrsta: string;
  opis: string | null;
  preparatNaziv: string | null;
  jedinicaNaziv: string | null;
  kolicina: number | null;
  izvornaRadnjaId?: string | null;
};

/**
 * `Mjerenje` onoliko koliko ovaj racun treba, S POSUDOM.
 *
 * NIJE `RedakMjerenja` iz lib/mjerenja.ts i namjerno se drukcije zove: onaj je
 * vec vezan uz jedan tank pa `tankId` nema, a nosi `id`, `jeRucno`, bentotest i
 * sva `POLJA_MJERENJA` za mrezu parametara. Ovdje je `tankId` bit — mjerenja se
 * grupiraju preko VISE posuda u stablu.
 */
export type RedakMjerenjaPosude = {
  tankId: string;
  izmjerenoAt: Date;
  alkohol: number | null;
  secer: number | null;
  ukupneKiseline: number | null;
  ph: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
};

/** Jedan redak povijesti, spreman za ispis. */
export type StavkaPovijesti = {
  datum: Date;
  naslov: string;
  detalj: string | null;
};

/**
 * Zasto je popis prazan.
 *
 *   "ima"        — ima zapisa, popis nije prazan;
 *   "prolazna"   — vino je uslo i odmah otislo; "nista radeno" je ISTINA;
 *   "nema_zapisa"— prozor je prekratak za tvrdnju u bilo kojem smjeru;
 *   "rupa"       — vino je dugo stajalo, a nista nije zapisano. To je KVAR i
 *                  prikaz ga MORA pokazati kao kvar.
 */
export type StanjePovijesti = "ima" | "prolazna" | "nema_zapisa" | "rupa";

export type PovijestVina = {
  tankId: string;
  od: Date;
  do: Date;
  kvasci: StavkaPovijesti[];
  dodaci: StavkaPovijesti[];
  mjerenja: StavkaPovijesti[];
  radnje: StavkaPovijesti[];
  stanje: StanjePovijesti;
};

/**
 * Je li redak dodavanje preparata u vino.
 *
 * Nije samo vrsta DODAVANJE: SO2 korekcija Sumpovinom zapisuje se kao
 * KOREKCIJA s preparatom, a fizicki je dodavanje u vino. Mjereno 11.09.2026 na
 * punim tankovima: 186 DODAVANJE i 38 KOREKCIJA nose preparat, nijedna druga
 * vrsta ga nema.
 *
 * Izvezeno je da bi izvjestaj podruma i ovaj modul sudili isto — pravilo je
 * prije ovoga zivjelo u dvije kopije.
 */
export function jeDodavanjePreparata(r: {
  vrsta: string;
  preparatNaziv: string | null;
}): boolean {
  return r.vrsta === "DODAVANJE" || r.preparatNaziv != null;
}

/** "350 g" — kolicina kako je zapisana, NIKAD skalirana udjelom. */
function kolicinaRadnje(r: RedakRadnje): string | null {
  if (r.kolicina == null || !Number.isFinite(r.kolicina)) return null;
  const broj = r.kolicina.toLocaleString("hr-HR", { maximumFractionDigits: 1 });
  return r.jedinicaNaziv ? `${broj} ${r.jedinicaNaziv}` : broj;
}

/** Parametri jednog mjerenja u jedan redak; prazno mjerenje daje `null`. */
function opisMjerenja(m: RedakMjerenjaPosude): string | null {
  const dio: string[] = [];
  const b = (x: number, d = 2) => x.toLocaleString("hr-HR", { maximumFractionDigits: d });

  if (m.secer != null) dio.push(`šećer ${b(m.secer, 1)}`);
  if (m.alkohol != null) dio.push(`alk. ${b(m.alkohol)} % vol`);
  if (m.ukupneKiseline != null) dio.push(`kis. ${b(m.ukupneKiseline)}`);
  if (m.ph != null) dio.push(`pH ${b(m.ph)}`);
  if (m.slobodniSO2 != null) dio.push(`SO₂ sl. ${b(m.slobodniSO2, 0)}`);
  if (m.ukupniSO2 != null) dio.push(`SO₂ uk. ${b(m.ukupniSO2, 0)}`);

  return dio.length > 0 ? dio.join(" · ") : null;
}

/**
 * Zasto je popis prazan — vidi `StanjePovijesti`.
 *
 * Izdvojeno da se moze ubaciti u testu: pravilo koje razlikuje rupu od
 * prolazne posude jedino je mjesto gdje ovaj modul nesto TVRDI.
 */
export function razvrstajStanje(
  imaIkakavZapis: boolean,
  trajanjeMs: number
): StanjePovijesti {
  if (imaIkakavZapis) return "ima";
  if (trajanjeMs < PRAG_PROLAZNA_MS) return "prolazna";
  if (trajanjeMs > PRAG_RUPE_MS) return "rupa";
  return "nema_zapisa";
}

/**
 * Povijest vina koje je bilo u posudi `tankId` u prozoru `[od, do]`.
 *
 * Cisti racun nad vec procitanim retcima. `radnje` su `VinoRadnja` DANASNJEG
 * tanka (sve, nefiltrirane); ovdje se biraju one izvedene u toj posudi i u tom
 * prozoru. `mjerenja` su redci te posude.
 *
 * GRANICE SU UKLJUCIVE na oba kraja, iz istog razloga kao u `vinoUTrenucima`:
 * radnja iz iste sekunde u kojoj je vino otislo jos je pripadala tom vinu.
 */
export function povijestVina(args: {
  tankId: string;
  od: Date;
  do: Date;
  radnje: RedakRadnje[];
  mjerenja: RedakMjerenjaPosude[];
  /**
   * ARHIVSKI REDCI SU OBAVEZNI, ne opcijski — i zato stoje u potpisu.
   *
   * Arhiviranje SELI podatke, ne kopira ih: `Mjerenje` i `Radnja` su PRAZNE za
   * svaku posudu koja je u medjuvremenu arhivirana, a u stablima porijekla
   * takve su gotovo sve. Bez ovoga je detektor rupa 14.09.2026 prijavio 36
   * rupa, od kojih je svih 36 bilo lazno — T3 ima sest mjerenja u prozoru koji
   * je modul zvao praznim.
   *
   * Potpis ih trazi izrijekom da ih sljedeci pozivatelj ne moze presutjeti.
   */
  arhivskeRadnje: RedakArhivskeRadnje[];
  arhivskaMjerenja: RedakMjerenjaPosude[];
}): PovijestVina {
  const odMs = args.od.getTime();
  const doMs = args.do.getTime();

  // Arhivska radnja u obliku zive. `jeKvasac` je uvijek `false` — vidi
  // `RedakArhivskeRadnje`.
  const izArhive: RedakRadnje[] = args.arhivskeRadnje
    .filter((r) => r.tankId === args.tankId)
    .map((r) => ({
      izvorniTankId: r.tankId ?? "",
      dogodenoAt: r.createdAt,
      vrsta: r.vrsta,
      opis: r.opis,
      preparatNaziv: r.preparatNaziv,
      jedinicaNaziv: r.jedinicaNaziv,
      kolicina: r.kolicina,
      jeKvasac: false,
      izvornaRadnjaId: r.izvornaRadnjaId ?? null,
    }));

  // ISTA RADNJA ZNA POSTOJATI DVAPUT: kao `VinoRadnja` u zivom tanku i kao
  // `ArhivaVinaRadnja` u arhivi. Oboje nose `izvornaRadnjaId`, pa se arhivski
  // duplikat odbacuje — ziva kopija ima `jeKvasac` i preciznija je.
  const vecImam = new Set(
    args.radnje.map((r) => r.izvornaRadnjaId).filter((x): x is string => !!x)
  );

  const moje = [
    ...args.radnje,
    ...izArhive.filter((r) => !r.izvornaRadnjaId || !vecImam.has(r.izvornaRadnjaId)),
  ]
    .filter(
      (r) =>
        r.izvorniTankId === args.tankId &&
        r.dogodenoAt.getTime() >= odMs &&
        r.dogodenoAt.getTime() <= doMs
    )
    .sort((a, b) => a.dogodenoAt.getTime() - b.dogodenoAt.getTime());

  // KVASAC SE NE FILTRIRA IZ POPISA DODATAKA, samo se izdvaja i u njega.
  // Popis dodataka mora pokazati sve sto je islo u vino — vidi zabranu uz
  // `Preparation.jeKvasac`.
  const kvasci: StavkaPovijesti[] = moje
    .filter((r) => r.jeKvasac)
    .map((r) => ({
      datum: r.dogodenoAt,
      naslov: r.preparatNaziv ?? r.opis ?? r.vrsta,
      detalj: kolicinaRadnje(r),
    }));

  const dodaci: StavkaPovijesti[] = moje
    .filter(jeDodavanjePreparata)
    .map((r) => ({
      datum: r.dogodenoAt,
      naslov: r.preparatNaziv ?? r.opis ?? r.vrsta,
      detalj: kolicinaRadnje(r),
    }));

  // Sve ostalo: pretoci, filtracije, flotacija, korekcije bez preparata.
  const radnje: StavkaPovijesti[] = moje
    .filter((r) => !jeDodavanjePreparata(r))
    .map((r) => ({
      datum: r.dogodenoAt,
      naslov: r.opis ?? r.vrsta,
      detalj: kolicinaRadnje(r),
    }));

  const mjerenja: StavkaPovijesti[] = [...args.mjerenja, ...args.arhivskaMjerenja]
    .filter(
      (m) =>
        m.tankId === args.tankId &&
        m.izmjerenoAt.getTime() >= odMs &&
        m.izmjerenoAt.getTime() <= doMs
    )
    .sort((a, b) => a.izmjerenoAt.getTime() - b.izmjerenoAt.getTime())
    .map((m) => ({
      datum: m.izmjerenoAt,
      naslov: "mjerenje",
      detalj: opisMjerenja(m),
    }));

  return {
    tankId: args.tankId,
    od: args.od,
    do: args.do,
    kvasci,
    dodaci,
    mjerenja,
    radnje,
    stanje: razvrstajStanje(
      dodaci.length + radnje.length + mjerenja.length > 0,
      doMs - odMs
    ),
  };
}
