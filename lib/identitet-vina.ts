import { praznjenjaPosuda, satKretanja } from "@/lib/sat-knjige";
import { jePravaSorta } from "@/lib/sorta-naziv";
import { vinoUTrenucimaVise, type CitacBerbe } from "@/lib/berba-model";

/**
 * IDENTITET VINA — svako vino ima svoj, i izvodi se iz knjige.
 * ======================================================================
 *
 * BEZ VLASTITOG REPLAYA, i to je glavna odluka ovog modula.
 *
 * Prva izvedba (13.09.2026) vodila je vlastitu evidenciju stanja cijelog
 * podruma da bi odgovorila na jedno pitanje: koliko je bilo u tanku prije
 * dolijevanja. Prosla je svih 36 tvrdnji — scenarije, mutacije, invarijante
 * udjela — i svejedno za T7 tvrdila 25.650 L umjesto 10.000, a za T20 4.600
 * umjesto 2.000. Knjiga zna otici u minus (unatrag datirani unosi, backfill
 * koji izlaz upise prije ulaza), a nijedna tvrdnja koja gleda samo unutarnju
 * dosljednost to ne vidi.
 *
 * Zato stanje ovdje NE racuna nitko nov. Volumen prije svakog ulaza dolazi iz
 * ISTE formule koju koristi `stanjeTanka` (lib/berba-model.ts), samo
 * izracunate u bazi za sve ulaze odjednom — pa podrum ne placa poziv po tanku.
 * Vidi [[stanje-tanka-mjerilo]].
 *
 * STO OSTAJE OVOM MODULU: pravilo i stablo. Akumulator je JEDAN BROJ —
 * kumulativno doliveno — koji se nulira pri rodjenju.
 *
 * PRAVILA (vlasnikove odluke, 12.–14.09.2026):
 *
 * 1. Novo vino nastaje kad kumulativno dolijevanje od zadnjeg rodjenja
 *    prijedje 20 % volumena NEPOSREDNO PRIJE tog dolijevanja.
 * 2. Premjestanje cijelog sadrzaja u praznu posudu NE rada novo vino; vise
 *    izvora odjednom rada.
 * 3. Progutano dolijevanje ostaje vidljivo: litre i udio, bez kucice i klika.
 * 4. Vino je SORTNO kad jedna sorta ima preko 80 %, inace CUVEE; ako najveci
 *    udio nije prava sorta ("Nepoznato podrijetlo"), vino je BEZ TVRDNJE.
 * 5. Klik otvara 5–6 razina, ispod toga prikaz kaze "jos N razina".
 */

export const PRAG_RODJENJA = 0.2;
export const PRAG_SORTNOSTI = 80;
export const DUBINA_KLIKA = 6;

/** Cijeli citac knjige — `vinoUTrenucima` trazi vise od jedne tablice. */
type Klijent = CitacBerbe;

/** Jedan ulazni cin: kad, koliko, odakle — i koliko je bilo PRIJE njega. */
export type UlazniCin = {
  tankId: string;
  kljuc: string;
  kada: Date;
  /** Litre koje su tim cinom usle u tank. */
  uslo: number;
  /** Litre u tanku neposredno prije — iz formule `stanjeTanka`. */
  prije: number;
  /**
   * Izvori, grupirani po posudi; `null` je ulaz izvana (berba).
   *
   * `litre` je ono sto je U OVAJ tank uslo, `otpusteno` ono sto je iz izvora
   * izaslo. Razlika je kalo i ne smije se progutati — vidi `grupirajIzvore`.
   */
  izvori: Array<{
    izTankId: string | null;
    litre: number;
    otpusteno: number;
    berbe: string[];
  }>;
};

export type StavkaSastava = {
  berbaId: string;
  nazivSorte: string;
  litre: number;
  postotak: number;
};

export type VinoCvor =
  | { vrsta: "partija"; berbaId: string; nazivSorte: string; litre: number }
  /**
   * KUCICA KOJA NIJE RAZMOTANA — i razlog zasto.
   *
   * Tri stanja, i prikaz ih MORA razlikovati:
   *   "neotvoreno" — ima jos, samo se nije islo dublje (plitko stablo ili
   *                  granica dubine). Klik vodi na stranicu te posude.
   *   "bez_knjige" — knjiga za tu posudu ne zna nista prije tog trenutka:
   *                  zateceno vino iz rekonstrukcije. Uredan kraj lanca.
   *   "prekinuto"  — lanac BI trebao ici dalje, ali ne moze (kruzni pretok).
   *                  To je KVAR i mora se vidjeti kao kvar, ne kao kraj.
   */
  | {
      vrsta: "posuda";
      tankId: string;
      kada: Date;
      litre: number;
      razlog: "neotvoreno" | "bez_knjige" | "prekinuto";
    }
  | {
      vrsta: "spoj";
      kada: Date;
      tankId: string;
      sastavnice: Sastavnica[];
      litre: number;
    };

export type Sastavnica = {
  vino: VinoCvor;
  /** Litre koje su tim izvorom USLE u tank. */
  litre: number;
  udio: number;
  /**
   * Cas kad je to vino USLO u roditelja — gornji rub njegove povijesti.
   *
   * Cvor tipa `spoj` nosi `kada` = svoje RODJENJE, a ne cas odlaska. Bez ovog
   * polja se prozor "od rodjenja u toj posudi do casa kad je otislo dalje" ne
   * moze zatvoriti (lib/povijest-vina.ts).
   */
  usloAt: Date;
  /** Litre koje su iz izvora IZASLE; `litre + kalo`. */
  otpusteno: number;
  /** Otpusteno minus uslo. Enolog gleda sto je u tanku, ali kalo mora vidjeti. */
  kalo: number;
  /**
   * Dolijevanje koje prag nije priznao kao novo vino (pravilo 3).
   *
   * Model ga drzi kao obicnu sastavnicu jer je pravilo "kucica po svakom
   * izvoru" mladje i jace; prikaz ga po pravilu 3 nudi sivo i bez klika.
   */
  progutano: boolean;
};

/** Kamo je vino otislo otkad je nastalo — svaka litra pod svojim imenom. */
export type VrstaOdljeva = "izdano" | "odliveno" | "kalo" | "ispravak";

export type StavkaOdljeva = {
  vrsta: VrstaOdljeva | "neobjasnjeno";
  litre: number;
};

/** Jedan izlazni redak knjige, vec razvrstan. */
export type RedakOdljeva = { kada: number; litre: number; vrsta: VrstaOdljeva };

/** Sto `citajUlazneCine` vrati: ulazi po tanku i izlazi po tanku. */
export type KnjigaIdentiteta = {
  cini: Map<string, UlazniCin[]>;
  odljevi: Map<string, RedakOdljeva[]>;
};

export type VrstaVina = "SORTNO" | "CUVEE" | "BEZ_TVRDNJE";

export type Identitet = {
  tankId: string;
  vino: VinoCvor;
  rodjenje: Date | null;
  /** Litre danas — iz `stanjeTanka`, ne iz vlastitog zbroja. */
  litre: number;
  sastav: StavkaSastava[];
  vrsta: VrstaVina;
  glavna: { nazivSorte: string; postotak: number } | null;
  /**
   * Razlika izmedju zbroja kucica i danasnje kolicine, po imenima.
   *
   * Kucice nose litre koje su USLE; tank otad zna biti manji jer je vino
   * prodano, odliveno dalje, iscurilo ili ispravljeno. Ta razlika mora biti
   * imenovana, ne progutana — a ono sto ni jedno ime ne pokriva zove se
   * "neobjasnjeno" i vidi se kao kvar (vlasnik, 14.09.2026).
   */
  odljev: StavkaOdljeva[];
};

// ---------------------------------------------------------------------------
// Pravilo — cisti racun, jedan akumulator
// ---------------------------------------------------------------------------

/** Sto je pravilo odlucilo za jedan ulaz. */
export type Odluka = {
  cin: UlazniCin;
  /** `true` = tim je cinom nastalo novo vino. */
  rodjenje: boolean;
  /** `true` = posuda je bila prazna, pa cin otvara epizodu. */
  izPrazne: boolean;
};

/**
 * Prodji ulaze redom i reci koji su rodili vino.
 *
 * AKUMULATOR JE JEDAN BROJ. Nema mape stanja, nema `poBerbi`, nema praznjenja —
 * volumene daje pozivatelj, iz dokazanog citaca.
 *
 * Prazna posuda (`prije < 1 L`) otvara epizodu: ondje novo vino nastaje samo
 * ako se slije VISE izvora odjednom (pravilo 2), a akumulator se nulira.
 */
export function primijeniPravilo(ulazi: UlazniCin[]): Odluka[] {
  let doliveno = 0;
  const out: Odluka[] = [];

  for (const cin of [...ulazi].sort((a, b) => a.kada.getTime() - b.kada.getTime())) {
    const izPrazne = cin.prije < 1;

    if (izPrazne) {
      doliveno = 0;
      out.push({ cin, rodjenje: cin.izvori.length > 1, izPrazne });
      continue;
    }

    doliveno += cin.uslo;
    const rodjenje = doliveno > PRAG_RODJENJA * cin.prije;
    if (rodjenje) doliveno = 0;

    out.push({ cin, rodjenje, izPrazne });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Razvrstavanje i stablo
// ---------------------------------------------------------------------------

function poSorti(sastav: StavkaSastava[]) {
  const zbroj = new Map<string, number>();
  for (const s of sastav) zbroj.set(s.nazivSorte, (zbroj.get(s.nazivSorte) ?? 0) + s.postotak);
  return [...zbroj.entries()]
    .map(([nazivSorte, postotak]) => ({ nazivSorte, postotak }))
    .sort((a, b) => b.postotak - a.postotak);
}

/** SORTNO, CUVEE ili BEZ TVRDNJE — vidi pravilo 4. */
export function razvrstaj(sastav: StavkaSastava[]): {
  vrsta: VrstaVina;
  glavna: { nazivSorte: string; postotak: number } | null;
} {
  const glavna = poSorti(sastav)[0] ?? null;
  if (!glavna) return { vrsta: "BEZ_TVRDNJE", glavna: null };
  if (!jePravaSorta(glavna.nazivSorte)) return { vrsta: "BEZ_TVRDNJE", glavna };
  return { vrsta: glavna.postotak > PRAG_SORTNOSTI ? "SORTNO" : "CUVEE", glavna };
}

export function dubina(v: VinoCvor): number {
  if (v.vrsta === "partija" || v.vrsta === "posuda") return 0;
  return 1 + Math.max(0, ...v.sastavnice.map((s) => dubina(s.vino)));
}

export function listovi(v: VinoCvor): string[] {
  if (v.vrsta === "partija") return [v.berbaId];
  if (v.vrsta === "posuda") return [];
  return [...new Set(v.sastavnice.flatMap((s) => listovi(s.vino)))];
}

/** Podreze stablo na `razina` razina i kaze koliko ih je ostalo ispod. */
export function skrati(
  v: VinoCvor,
  razina: number = DUBINA_KLIKA
): { vino: VinoCvor; jos: number } {
  if (v.vrsta === "partija" || v.vrsta === "posuda") return { vino: v, jos: 0 };
  if (razina <= 0) return { vino: { ...v, sastavnice: [] }, jos: dubina(v) };

  let jos = 0;
  const sastavnice = v.sastavnice.map((s) => {
    const r = skrati(s.vino, razina - 1);
    jos = Math.max(jos, r.jos);
    return { ...s, vino: r.vino };
  });
  return { vino: { ...v, sastavnice }, jos };
}

// ---------------------------------------------------------------------------
// Citanje iz baze
// ---------------------------------------------------------------------------

/**
 * BEZ VLASTITOG SQL-a, i to je odluka jednako vazna kao odustajanje od replaya.
 *
 * Prva izvedba ovog dijela imala je vlastiti `$queryRaw` koji je racunao
 * "koliko je bilo prije" — istu formulu kao `stanjeTanka`, ali prepisanu.
 * Bio je to PETI put u jednom danu da isti racun zivi na dva mjesta, i odmah
 * je i pokazao zasto: u tom je upitu tablica bila alijasirana kao `b`, sto je
 * zasjenilo unutarnji alias u `satSQL` i tiho dalo krivi sat na 20 redaka.
 *
 * Zato volumen prije ulaza daje `vinoUTrenucimaVise` (lib/berba-model.ts) —
 * isti citac koji `test:knjiga:vrijeme` usporeduje sa `stanjeTanka` u 68
 * trenutaka.
 *
 * SKUPNO, NE PO TANKU. Prva izvedba zvala je `vinoUTrenucima` za svaki tank
 * posebno: ~88 upita i 481 ms za podrum, jer ta funkcija radi dva upita po
 * pozivu. Knjiga cijelog podruma ima 660 redaka i povuce se jednim upitom, pa
 * je skupna varijanta 2 upita i 47 ms — uz identican rezultat na svih 242
 * trenutka (`npm run test:trenuci:vise`).
 */


/** Izvori po cinu — obicno grupiranje redaka, bez ikakvog zbrajanja stanja. */
function grupirajIzvore(
  kretanja: Array<{
    id: string;
    berbaId: string;
    uTankId: string | null;
    izTankId: string | null;
    litre: number;
    vrsta: string;
    dogodenoAt: Date;
    createdAt: Date;
    pretokId: string | null;
    zadatakId: string | null;
    izlazVinaId: string | null;
    punjenjeId: string | null;
  }>
): Map<string, UlazniCin["izvori"]> {
  const out = new Map<string, UlazniCin["izvori"]>();

  // KALO SE MJERI PO CINU, PRIJE GRUPIRANJA.
  //
  // Pretok upisuje jedan redak po paru izvor->cilj: izTankId I uTankId stoje na
  // istom retku (355 redaka, 386.535 L). Kad vino izadje a nikamo ne stigne,
  // ostane redak sa samo izvorom — 36 redaka, 1.750 L. To je kalo.
  //
  // Kljuc nosi i `vrsta`, pa se prodaja (IZLAZ, 148 redaka) i ispravak stanja
  // (ISPRAVAK, 23 retka) — koji takodjer nemaju cilj — nikad ne mogu pripisati
  // pretoku kao kalo. Prva mjera kala brojala je i njih i dala 100 % na T43.
  const stiglo = new Map<string, number>();
  const nikamo = new Map<string, number>();

  for (const k of kretanja) {
    if (!k.izTankId) continue;
    const veza = k.pretokId ?? k.zadatakId ?? k.izlazVinaId ?? k.punjenjeId ?? `sam:${k.id}`;
    const kljuc = `${veza}:${k.vrsta}:${k.izTankId}`;
    const mapa = k.uTankId ? stiglo : nikamo;
    mapa.set(kljuc, (mapa.get(kljuc) ?? 0) + Number(k.litre));
  }

  for (const k of kretanja) {
    if (!k.uTankId) continue;
    const veza = k.pretokId ?? k.zadatakId ?? k.izlazVinaId ?? k.punjenjeId ?? `sam:${k.id}`;

    // KLJUC IDE PO CINU **I CILJNOM TANKU**.
    //
    // Jedan pretok zna puniti vise tankova, i 48 cinova u knjizi to radi. 14.09.
    // je iz T12 istim cinom otislo 4.000 L u T3 i 100 L u T47. Grupira li se
    // samo po cinu, kucice tanka 3 pokupe i tih 100 L koje u njega nikad nisu
    // usle, pa prva razina tvrdi 4.100 L za tank koji ima 4.000.
    //
    // Litre kucice su ono sto je USLO U OVAJ tank.
    const kljuc = `${veza}:${k.uTankId}:${k.vrsta}`;

    const litre = Number(k.litre);

    // Kalo cina razdijeli se ciljevima razmjerno primljenom; kad je cilj jedan,
    // dobiva ga cijelog. Za ulaz izvana (berba) kalo se ne zna i nema ga.
    let otpusteno = litre;
    if (k.izTankId) {
      const kaloKljuc = `${veza}:${k.vrsta}:${k.izTankId}`;
      const sve = stiglo.get(kaloKljuc) ?? 0;
      const kalo = nikamo.get(kaloKljuc) ?? 0;
      if (sve > 0) otpusteno = litre + (kalo * litre) / sve;
    }

    const popis = out.get(kljuc) ?? [];
    const postoji = popis.find((x) => x.izTankId === k.izTankId);
    if (postoji) {
      postoji.litre += litre;
      postoji.otpusteno += otpusteno;
      postoji.berbe.push(k.berbaId);
    } else {
      popis.push({ izTankId: k.izTankId, litre, otpusteno, berbe: [k.berbaId] });
    }
    out.set(kljuc, popis);
  }

  return out;
}

/**
 * Ulazni cinovi zadanih posuda, spremni za pravilo.
 *
 * TRI UPITA, bez obzira na broj posuda: jedan `findMany` nad knjigom
 * (grupiranje cinova je obicno grupiranje redaka, ne knjigovodstvo) i jedan
 * skupni `vinoUTrenucimaVise` za sve trazene posude odjednom.
 *
 * Stranica tanka salje SVE tankove, ne samo svoj — stablo se spusta u posude iz
 * kojih je vino doslo, pa su mu potrebni i njihovi ulazni cinovi.
 */
export async function citajUlazneCine(
  db: Klijent,
  tankIds: string[]
): Promise<KnjigaIdentiteta> {
  const out = new Map<string, UlazniCin[]>();
  const odljevi = new Map<string, RedakOdljeva[]>();
  if (tankIds.length === 0) return { cini: out, odljevi };
  const trazeni = new Set(tankIds);

  const kretanja = await db.berbaKretanje.findMany({
    select: {
      id: true,
      berbaId: true,
      uTankId: true,
      izTankId: true,
      litre: true,
      vrsta: true,
      dogodenoAt: true,
      createdAt: true,
      pretokId: true,
      zadatakId: true,
      izlazVinaId: true,
      punjenjeId: true,
    },
  });

  const praznjenja = praznjenjaPosuda(kretanja);
  const izvori = grupirajIzvore(kretanja);

  // ODLJEV: svaki izlazni redak, vec razvrstan po imenu. Bez njega se razlika
  // izmedju zbroja kucica i danasnje kolicine ne moze imenovati — a na T43 je
  // ta razlika 670 L (prodaja i ispravak), sto je 61 % sadrzaja tanka.
  for (const k of kretanja) {
    if (!k.izTankId || !trazeni.has(k.izTankId)) continue;

    const vrsta: VrstaOdljeva =
      k.vrsta === "IZLAZ"
        ? "izdano"
        : k.vrsta === "ISPRAVAK"
          ? "ispravak"
          : k.uTankId
            ? "odliveno"
            : "kalo";

    const popis = odljevi.get(k.izTankId) ?? [];
    popis.push({ kada: satKretanja(k, praznjenja), litre: Number(k.litre), vrsta });
    odljevi.set(k.izTankId, popis);
  }

  // Cinovi po tanku: kljuc, trenutak i koliko je uslo. Sve iz redaka, bez
  // ijednog zbrajanja stanja.
  const cini = new Map<string, Map<string, { kada: number; uslo: number }>>();

  for (const k of kretanja) {
    if (!k.uTankId || !trazeni.has(k.uTankId)) continue;

    const veza =
      k.pretokId ?? k.zadatakId ?? k.izlazVinaId ?? k.punjenjeId ?? `sam:${k.id}`;
    // Isti kljuc kao u `grupirajIzvore` — po cinu I ciljnom tanku.
    const kljuc = `${veza}:${k.uTankId}:${k.vrsta}`;
    const sat = satKretanja(k, praznjenja);

    const zaTank = cini.get(k.uTankId) ?? new Map();
    const c = zaTank.get(kljuc);

    if (c) {
      c.uslo += Number(k.litre);
      if (sat < c.kada) c.kada = sat;
    } else {
      zaTank.set(kljuc, { kada: sat, uslo: Number(k.litre) });
    }

    cini.set(k.uTankId, zaTank);
  }

  // VOLUMEN PRIJE SVAKOG ULAZA — iz dokazanog citaca, nikad iz vlastitog zbroja.
  // Trenutak je milisekundu prije cina: `vinoUTrenucima` ima UKLJUCIVU granicu
  // (vidi `doTrenutkaSQL`), pa bi sam trenutak cina uracunao i njega.
  const redom = [...cini.entries()];

  const volumeni = await vinoUTrenucimaVise(
    db,
    redom.map(([tankId, zaTank]) => ({
      tankId,
      trenuci: [...zaTank.values()]
        .sort((a, b) => a.kada - b.kada)
        .map((c) => new Date(c.kada - 1)),
    }))
  );

  redom.forEach(([tankId, zaTank]) => {
    const poredani = [...zaTank.entries()].sort((a, b) => a[1].kada - b[1].kada);

    out.set(
      tankId,
      poredani.map(([kljuc, c], j) => ({
        tankId,
        kljuc,
        kada: new Date(c.kada),
        uslo: c.uslo,
        prije: volumeni.get(tankId)?.[j]?.ukupnoL ?? 0,
        izvori: izvori.get(kljuc) ?? [],
      }))
    );
  });

  return { cini: out, odljevi };
}

// ---------------------------------------------------------------------------
// Stablo kucica
// ---------------------------------------------------------------------------

/**
 * KUCICA PO SVAKOM IZVORU, UVIJEK — i kad je izvor jedan.
 *
 * Rodjenje odredjuje STO je vino; kucice odgovaraju na drugo pitanje: ODAKLE
 * je doslo. Zato i tank koji je vino samo primio iz jedne posude ima kucicu —
 * jednu, i ona se moze otvoriti.
 *
 * IZVANA IDE KUCICA PO PARTIJI, ne po ulazu. Berba je prvi unos i svaka je
 * partija vlastiti list: dvije sorte u prazan tank su DVA izvora, ne jedan.
 * Slijedi iz pravila da se ime zasluzuje sastavom (vlasnik, 14.09.2026).
 * Danas to ne mijenja nijedan broj — nijedno zivo vino nema takav ulaz — ali
 * pravilo stoji prije nego zatreba.
 *
 * DUBINA. `opcije.dubina` kaze koliko se razina razmotava; sto je ispod ostaje
 * kao neotvorena kucica (`vrsta: "posuda"`), koju prikaz nudi na klik.
 * Izvjestaj podruma gradi PLITKO (jedna razina): puna dubina za 36 kartica
 * kosta ~73 upita, a dubina se placa tek kad je netko zatrazi. Stranica tanka
 * gradi do kraja.
 */
export type OpcijeStabla = {
  /** Koliko razina razmotati. `undefined` = do berbe. */
  dubina?: number;
};

/** Cinovi koji su usli u vino od zadnjeg rodjenja — ukljucivo ono sto je prag progutao. */
function cinoviVina(odluke: Odluka[]): { od: number; do: number } | null {
  if (odluke.length === 0) return null;

  const zadnjiVazan = [...odluke]
    .map((o, i) => ({ o, i }))
    .reverse()
    .find((x) => x.o.rodjenje || x.o.izPrazne);

  if (!zadnjiVazan) return null;

  // Od cina koji je vino rodio (ili otvorio epizodu) do kraja: sve poslije
  // njega je progutano i po pravilu 3 ide u popis, ali bez kucice.
  return { od: zadnjiVazan.i, do: odluke.length - 1 };
}

/**
 * Vino koje je u posudi `tankId` bilo u trenutku `trenutak`, kao stablo.
 *
 * Cisti racun nad vec procitanim cinovima — nijedan upit. `nazivSorte` sluzi
 * samo za imena listova.
 */
export function vinoUTanku(
  cini: Map<string, UlazniCin[]>,
  nazivSorte: Map<string, string>,
  tankId: string,
  trenutak: number,
  opcije: OpcijeStabla = {},
  put: string[] = [],
  litreOcekivane = 0
): VinoCvor {
  const naziv = (berbaId: string) => nazivSorte.get(berbaId) ?? "Nepoznato podrijetlo";
  const kljucPuta = `${tankId}:${trenutak}`;

  const stub = (razlog: "neotvoreno" | "bez_knjige" | "prekinuto"): VinoCvor => ({
    vrsta: "posuda",
    tankId,
    kada: new Date(trenutak),
    litre: litreOcekivane,
    razlog,
  });

  // Knjiga zna imati kruzne pretoke (A -> B -> A). Registar puta ih zaustavlja,
  // isti razlog kao u lib/berba-lanac.ts — ali to je KVAR, ne uredan kraj.
  if (put.includes(kljucPuta)) return stub("prekinuto");

  const ulazi = (cini.get(tankId) ?? []).filter(
    (u) => u.kada.getTime() <= trenutak
  );
  // Knjiga za ovu posudu ne zna nista prije tog trenutka: zateceno vino.
  if (ulazi.length === 0) return stub("bez_knjige");

  const odluke = primijeniPravilo(ulazi);
  const raspon = cinoviVina(odluke);
  if (!raspon) return stub("bez_knjige");

  const rodni = odluke[raspon.od];
  const noviPut = [...put, kljucPuta];
  const razina = opcije.dubina;
  const dalje = razina === undefined ? undefined : razina - 1;
  const dubljeSmije = razina === undefined || razina > 1;

  const sastavnice: Sastavnica[] = [];

  const dodajIzvor = (
    izTankId: string | null,
    litre: number,
    otpusteno: number,
    berbe: string[],
    kada: Date,
    progutano: boolean
  ) => {
    if (izTankId) {
      sastavnice.push({
        vino: dubljeSmije
          ? // UKLJUCIVO U TRENUTKU CINA, ne milisekundu prije.
            //
            // Posuda zna dati vino u istoj sekundi u kojoj ga je i primila:
            // T8 je 18.06. u 10:22 primio 10.500 L iz T5, a T5 je tih 10.500 L
            // primio istim cinom. Rez na `kada - 1` ondje ne nalazi nista i
            // lanac stane prije berbe (mjereno: T15 i T32 bez ijednog lista).
            // Ono sto je posuda dala ukljucuje i ono sto je tim cinom primila.
            vinoUTanku(cini, nazivSorte, izTankId, kada.getTime(), { dubina: dalje }, noviPut, litre)
          : { vrsta: "posuda", tankId: izTankId, kada, litre, razlog: "neotvoreno" },
        litre,
        udio: 0,
        usloAt: kada,
        otpusteno,
        kalo: Math.max(0, otpusteno - litre),
        progutano,
      });
      return;
    }

    // Izvana: kucica PO PARTIJI. Berba je prvi unos i svaka je partija vlastiti
    // list — dvije sorte u prazan tank su DVA izvora, ne jedan.
    const jedinstvene = [...new Set(berbe)];
    for (const berbaId of jedinstvene) {
      sastavnice.push({
        vino: {
          vrsta: "partija",
          berbaId,
          nazivSorte: naziv(berbaId),
          litre: litre / jedinstvene.length,
        },
        litre: litre / jedinstvene.length,
        udio: 0,
        usloAt: kada,
        otpusteno: otpusteno / jedinstvene.length,
        kalo: Math.max(0, (otpusteno - litre) / jedinstvene.length),
        progutano,
      });
    }
  };

  // Vino koje je u posudi bilo PRIJE nego je ovo nastalo — samo kad je rodjenje
  // bilo dolijevanje, a ne otvaranje prazne posude. Ovdje rez OSTAJE strogi:
  // ono sto je tim cinom uslo nije dio onoga sto je prije bilo.
  if (!rodni.izPrazne && rodni.cin.prije > 0) {
    sastavnice.push({
      vino: dubljeSmije
        ? vinoUTanku(cini, nazivSorte, tankId, rodni.cin.kada.getTime() - 1, { dubina: dalje }, noviPut, rodni.cin.prije)
        : { vrsta: "posuda", tankId, kada: rodni.cin.kada, litre: rodni.cin.prije, razlog: "neotvoreno" },
      litre: rodni.cin.prije,
      udio: 0,
      // Prethodno vino je "otislo" u trenutku kad je novo nastalo.
      usloAt: rodni.cin.kada,
      // Vino koje je vec bilo u posudi nije nikamo putovalo: nema otpustanja,
      // pa ni kala.
      otpusteno: rodni.cin.prije,
      kalo: 0,
      progutano: false,
    });
  }

  // Izvori svih cinova od rodjenja nadalje: onaj koji je rodio vino i svi koje
  // je prag poslije progutao.
  for (let i = raspon.od; i <= raspon.do; i++) {
    const progutano = i > raspon.od;
    for (const izv of odluke[i].cin.izvori) {
      dodajIzvor(izv.izTankId, izv.litre, izv.otpusteno, izv.berbe, odluke[i].cin.kada, progutano);
    }
  }

  const ukupno = sastavnice.reduce((z, s) => z + s.litre, 0);
  for (const s of sastavnice) s.udio = ukupno > 0 ? s.litre / ukupno : 0;

  // NEMA URUSAVANJA. Kucica ide po SVAKOM izvoru, pa i kad je jedan — vino koje
  // je samo doteklo iz jedne posude ima kucicu, i ona se moze kliknuti.
  return {
    vrsta: "spoj",
    kada: rodni.cin.kada,
    tankId,
    sastavnice,
    litre: ukupno,
  };
}

// ---------------------------------------------------------------------------
// Imenovani odljev i sastavljanje identiteta
// ---------------------------------------------------------------------------

/**
 * RAZLIKA IZMEDJU ZBROJA KUCICA I DANASNJE KOLICINE MORA DOBITI IME.
 *
 * Kucica nosi litre koje su USLE u tank. Tank je otad cesto manji: vino je
 * prodano (IZLAZ), odliveno dalje, iscurilo (kalo) ili je stanje ispravljeno.
 * Dok se to ne imenuje, prva razina kucica i knjiga se razilaze bez objasnjenja
 * — na T43 za 670 L od 1.100, dakle vise od polovice.
 *
 * Ono sto ni jedno ime ne pokrije zove se "neobjasnjeno" i namjerno se vidi:
 * sutnja bi zamaskirala kvar (vlasnik, 14.09.2026).
 *
 * Gleda se samo ono sto je izaslo OTKAD je vino nastalo — starije se tice
 * prethodnog vina.
 */
export function imenujOdljev(
  redci: RedakOdljeva[],
  odKada: number,
  kucice: number,
  danas: number
): StavkaOdljeva[] {
  const zbroj = new Map<VrstaOdljeva, number>();

  for (const r of redci) {
    if (r.kada < odKada) continue;
    zbroj.set(r.vrsta, (zbroj.get(r.vrsta) ?? 0) + r.litre);
  }

  const stavke: StavkaOdljeva[] = [...zbroj.entries()]
    .filter(([, litre]) => litre > 0.5)
    .map(([vrsta, litre]) => ({ vrsta, litre }))
    .sort((a, b) => b.litre - a.litre);

  const imenovano = stavke.reduce((z, s) => z + s.litre, 0);
  const ostatak = kucice - danas - imenovano;
  if (Math.abs(ostatak) > 1) stavke.push({ vrsta: "neobjasnjeno", litre: ostatak });

  return stavke;
}

/**
 * Identitet vina u posudi: stablo, rodjenje, sastav i imenovani odljev.
 *
 * Cisti racun — nijedan upit. `sastav` i `litre` dolaze iz dokazanih citaca
 * (`stanjeTanka` / `podrijetloTanka`), jer se isti racun ne pise dvaput.
 */
export function identitetTanka(
  knjiga: KnjigaIdentiteta,
  nazivSorte: Map<string, string>,
  tankId: string,
  sastav: StavkaSastava[],
  litre: number,
  opcije: OpcijeStabla = {},
  trenutak: number = Date.now()
): Identitet {
  const vino = vinoUTanku(knjiga.cini, nazivSorte, tankId, trenutak, opcije, [], litre);

  const kucice =
    vino.vrsta === "spoj" ? vino.sastavnice.reduce((z, s) => z + s.litre, 0) : vino.litre;
  const rodjenje = vino.vrsta === "spoj" ? vino.kada : null;

  const { vrsta, glavna } = razvrstaj(sastav);

  return {
    tankId,
    vino,
    rodjenje,
    litre,
    sastav,
    vrsta,
    glavna,
    odljev: imenujOdljev(
      knjiga.odljevi.get(tankId) ?? [],
      rodjenje ? rodjenje.getTime() : 0,
      kucice,
      litre
    ),
  };
}
