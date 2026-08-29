/**
 * BERBA — PISANJE. Knjiga kretanja vina.
 *
 * Par s lib/berba-model.ts: ondje je citanje, ovdje pet jedinih nacina na
 * koja u `BerbaKretanje` smije doci redak.
 *
 *   zabiljeziUlaz       grozdje / most ulazi u podrum   (izTank = NULL)
 *   zabiljeziPrijenos   vino se seli iz tanka u tankove (pretok, filtracija)
 *   zabiljeziIzlaz      vino napusta podrum             (uTank  = NULL)
 *   zabiljeziIspravak   JEDNA berba izlazi iz tanka     (pogresan unos)
 *   zabiljeziPonistenje protustavka za sve gore         (nista se ne brise)
 *
 * Peti je dosao s korakom 4 i jedini je koji NE dijeli razmjerno — obrazlozenje
 * stoji uz njega.
 *
 * SAMO SE DOPISUJE. Nijedan redak se ne mijenja ni ne brise — ni ovdje ni
 * igdje drugdje. Ponistavanje pretoka ne uklanja retke nego dopisuje njihovo
 * zrcalo. Zato knjiga uvijek zna i STO se dogodilo i STO je poslije opovrgnuto;
 * brisanje bi drugo od toga bacilo.
 *
 * RAZMJERNA RASPODJELA — zasto uopce postoji
 * ------------------------------------------
 * Vino u tanku je IZMIJESANO. Kad iz tanka u kojem su dvije berbe izadje 1.000
 * L, nemoguce je da su izasle samo iz jedne — izaslo je od obje, u onom omjeru
 * u kojem stoje u tanku. Knjiga zato ne bira "iz koje berbe se toci", nego
 * svaki izlazak razdijeli na sve berbe koje su u tanku, razmjerno njihovim
 * litrama. Isto vrijedi za drugu razinu: sto od jedne berbe izadje, dijeli se
 * na ciljne tankove razmjerno njihovim ulazima.
 *
 * SVE U CIJELIM MILILITRIMA
 * -------------------------
 * Racuna se `podijeliMl` iz lib/filtracija.ts — metoda najveceg ostatka, ista
 * koja vec dijeli blend i sastav i koju pokriva scripts/test-filtracija.ts s
 * 900.006 invarijanti. Zbroj dijelova je UVIJEK jednak cjelini, do mililitra.
 * `Math.round` po komponenti to ne cuva (tri puta 33,4 ml daju 99 od 100 ml) i
 * upravo bi taj izgubljeni mililitar kroz petnaest pretoka postao razlika koju
 * nitko ne moze objasniti.
 *
 * ZAKLJUCAVANJE JE POSAO POZIVATELJA
 * ----------------------------------
 * Ove funkcije citaju stanje tanka pa na temelju njega pisu. Izmedju to dvoje
 * ne smije se ugurati drugi pretok. Pozivatelj (pretok, filtracija) vec drzi
 * `zakljucajTankove` (lib/filtracija.ts) nad istim tankovima u istoj
 * transakciji, pa se ovdje NE zakljucava ponovno — dvostruko zakljucavanje ne
 * bi nista dodalo osim jos jednog mjesta na kojem se redoslijed moze razici i
 * proizvesti mrtvu petlju.
 */

import type { Prisma } from "@prisma/client";
import { podijeliMl, uLitre, uMl } from "@/lib/filtracija";
import { stanjeTanka } from "@/lib/berba-model";

export type Tx = Prisma.TransactionClient;

/**
 * Greska koju pozivatelj mapira na HTTP 400 i cija se poruka pokazuje
 * korisniku. Isti obrazac kao `FiltracijaGreska` u lib/filtracija.ts.
 */
export class BerbaGreska extends Error {
  constructor(poruka: string) {
    super(poruka);
    this.name = "BerbaGreska";
  }
}

/**
 * Na koji je cin kretanje vezano. Tocno JEDAN kljuc, i to je ujedno kljuc po
 * kojem `zabiljeziPonistenje` kasnije nadje sto ponistiti.
 *
 * Svi su goli stupci bez stranog kljuca — namjerno, vidi biljesku uz model u
 * prisma/schema.prisma. Zapis berbe ne smije nestati kad nestane pretok.
 */
export type Veza = {
  pretokId?: string | null;
  zadatakId?: string | null;
  izlazVinaId?: string | null;
  punjenjeId?: string | null;
};

/** Tank i kolicina, u litrama. Pretvara se u mililitre odmah pri ulasku. */
export type UdioTanka = { tankId: string; litre: number };

/**
 * Sto uciniti kad iz tanka izlazi vise nego sto knjiga u njemu ima.
 *
 *   "PUKNI"    — baci `BerbaGreska` i ne upisi nista. ZADANO.
 *   "ZATECENO" — upisi razliku kao novu berbu vrste ZATECENO ("vino koje je
 *                vec bilo u podrumu") i tek onda toci.
 *
 * Negativno stanje NIJE nijedna od opcija i ne moze nastati: knjiga nikad ne
 * upise redak koji bi berbu u tanku odveo ispod nule.
 *
 * "ZATECENO" postoji zbog jednog jedinog pozivatelja — `scripts/backfill-berba.ts`.
 * Povijest u bazi je nepotpuna (stari nacin arhiviranja brisao je i punjenja i
 * izlaze), pa se pri obnovi nailazi na tankove koji su tocili vino za koje
 * nema zapisa odakle je doslo. Alternativa bi bila preskociti taj pretok i
 * time izgubiti i sve sto se iz njega dalje granalo. Ovako se rupa upise
 * VIDLJIVO, kao imenovan zapis koji se moze prebrojati i kasnije ispraviti.
 *
 * U REDOVNOM RADU (korak 3) ovo se NE prosljedjuje. Ondje manjak znaci da se
 * knjiga i tank razilaze i to mora puknuti glasno, prije upisa, a ne se sanirati
 * izmisljenom berbom.
 */
export type NaManjak = "PUKNI" | "ZATECENO";

// ---------------------------------------------------------------------------
// Pomocno
// ---------------------------------------------------------------------------

/** Koliko je kljuceva veze popunjeno. Mora biti tocno jedan. */
function kljuceviVeze(veza: Veza): string[] {
  const popis: string[] = [];
  if (veza.pretokId) popis.push("pretokId");
  if (veza.zadatakId) popis.push("zadatakId");
  if (veza.izlazVinaId) popis.push("izlazVinaId");
  if (veza.punjenjeId) popis.push("punjenjeId");
  return popis;
}

/**
 * Veza smije imati NAJVISE jedan kljuc, a bez ijednog trazi napomenu.
 *
 * Dva kljuca bi znacila da `zabiljeziPonistenje` isti redak nadje dvaput
 * (jednom po pretoku, jednom po zadatku) i dvaput ga ponisti.
 *
 * Nula kljuceva je dopusteno, ali samo uz napomenu. Takvo kretanje se poslije
 * NE MOZE ponistiti po kljucu — nema po cemu ga naci — i to je tocan opis
 * jedine vrste kretanja koja nastaje bez cina: ISPRAVAK kojim
 * `scripts/backfill-berba.ts` na kraju usaglasava knjigu sa stanjem tankova.
 * Ispravak se ne ponistava, ispravak se ispravlja novim ispravkom. Napomena je
 * obavezna da takav redak nikad ne ostane anoniman.
 */
function provjeriVezu(veza: Veza, gdje: string, napomena: string | null): void {
  const kljucevi = kljuceviVeze(veza);

  if (kljucevi.length > 1) {
    throw new BerbaGreska(
      `${gdje}: kretanje smije imati samo jednu vezu, a ima ${kljucevi.length} (${kljucevi.join(", ")}).`
    );
  }

  if (kljucevi.length === 0 && !String(napomena ?? "").trim()) {
    throw new BerbaGreska(
      `${gdje}: kretanje bez veze na cin mora imati napomenu koja kaze odakle dolazi.`
    );
  }
}

/** Ponistiti se moze samo cin, i to jedan. Prazna veza bi pogodila sve retke bez veze. */
function provjeriTocnoJednuVezu(veza: Veza, gdje: string): void {
  const kljucevi = kljuceviVeze(veza);

  if (kljucevi.length !== 1) {
    throw new BerbaGreska(
      `${gdje}: trazi tocno jednu vezu na cin, a dobio ih je ${kljucevi.length}.`
    );
  }
}

function normalizirajUdjele(udjeli: UdioTanka[]): Array<{ tankId: string; ml: number }> {
  return udjeli
    .map((u) => ({ tankId: String(u.tankId), ml: uMl(u.litre) }))
    .filter((u) => u.tankId && u.ml > 0);
}

/** Zbroj mililitara, kao cijeli broj. */
function zbroj(brojevi: number[]): number {
  return brojevi.reduce((z, x) => z + x, 0);
}

// ---------------------------------------------------------------------------
// Razmjerna raspodjela — jedina kopija racuna
// ---------------------------------------------------------------------------

/** Jedan dio razdiobe: koliko je od koje berbe otislo na koje odrediste. */
export type Dio = {
  berbaId: string;
  /** Redni broj odredista u polju `tezineOdredista`. */
  odrediste: number;
  ml: number;
};

/**
 * Raspodjela s DVA zadana ruba: matrica cijelih mililitara ciji su i zbrojevi
 * redaka i zbrojevi stupaca tocno oni koji su traZeni.
 *
 * ZASTO OVO, A NE DVA UZASTOPNA `podijeliMl`
 * ------------------------------------------
 * Prvo rjesenje je bilo: podijeli po redcima, pa svaki redak posebno podijeli
 * po stupcima. Redci tada ispadnu tocni, ali stupci NE. Tri berbe po 1.000 L
 * iz jednog tanka u tri cilja po 1.000 L daju ciljeve 1.000,002 / 999,999 /
 * 999,999 L — jer svaka berba zasebno zaokruzi svoju trecinu na istu stranu.
 * Ukupno se nista ne izgubi, ali BAS TA razlika je ono s cime se
 * `Tank.kolicinaVinaUTanku` poslije ne poklapa, i to raste sa svakim pretokom.
 *
 * Obrnut redoslijed (prvo stupci pa redci) ima zrcalnu manu, i goru: berba
 * moze otici u minus. Tri berbe po 1 ml u tri cilja po 1 ml — svaki cilj po
 * zaokruzivanju uzme SVU prvu berbu, pa ona da 3 ml a ima 1 ml.
 *
 * Zato: oba ruba se izracunaju unaprijed (`podijeliMl` daje tocne zbrojeve i
 * redaka i stupaca), zatim se matrica popuni razmjerno i na kraju POPRAVI —
 * visak u stupcu se premjesta u stupac s manjkom, unutar istog retka, pa
 * zbroj retka ostaje netaknut. Premjesta se iz retka koji u tom stupcu ima
 * najvise, da popravak ide na najveca polja i najmanje se osjeti.
 *
 * Popravak je uvijek kratak: greska po stupcu ne moze biti veca od broja
 * redaka, a ukupni visak i ukupni manjak su po definiciji jednaki.
 */
export function raspodijeliMatricu(redci: number[], stupci: number[]): number[][] {
  const n = redci.length;
  const m = stupci.length;

  if (n === 0 || m === 0) return [];

  // Razmjerno punjenje: svaki redak podijeljen po tezinama stupaca. Zbrojevi
  // redaka su vec tocni; stupci se popravljaju ispod.
  const matrica = redci.map((r) => podijeliMl(stupci, r));

  const uStupcu = new Array<number>(m).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) uStupcu[j] += matrica[i][j];
  }

  for (let j = 0; j < m; j++) {
    while (uStupcu[j] > stupci[j]) {
      const manjkav = uStupcu.findIndex((v, k) => v < stupci[k]);
      if (manjkav < 0) break;

      let redak = -1;
      let najvise = 0;

      for (let i = 0; i < n; i++) {
        if (matrica[i][j] > najvise) {
          najvise = matrica[i][j];
          redak = i;
        }
      }

      if (redak < 0) break;

      matrica[redak][j] -= 1;
      matrica[redak][manjkav] += 1;
      uStupcu[j] -= 1;
      uStupcu[manjkav] += 1;
    }
  }

  return matrica;
}

/**
 * RAZMJERNA RASPODJELA onoga sto izlazi iz JEDNOG tanka. Cisti racun — bez
 * baze, bez upisa.
 *
 * Izdvojeno u zasebnu funkciju s razlogom: isti racun treba i upis u bazu
 * (`zabiljeziPrijenos`) i suhi hod backfilla (`scripts/backfill-berba.ts`,
 * koji ne smije nista upisati pa ne moze proci kroz transakciju). Da su to
 * dvije kopije, suhi bi hod s vremenom pokazivao jedno a upis radio drugo — a
 * suhi hod postoji upravo zato da se upisu vjeruje.
 *
 * PO BERBAMA (redci): vino u tanku je izmijesano, pa ono sto izlazi izlazi od
 * SVIH berbi u tanku, svake razmjerno njezinom udjelu.
 *
 * PO ODREDISTIMA (stupci): tezine su litre koje u svaki cilj ulaze, plus kalo
 * kao odrediste bez tanka.
 *
 * Oba ruba su tocna — vidi `raspodijeliMatricu`.
 */
export function razdijeliIzlaz(
  stanje: Array<{ berbaId: string; ml: number }>,
  izlazMl: number,
  tezineOdredista: number[]
): Dio[] {
  const dijelovi: Dio[] = [];

  if (izlazMl <= 0 || stanje.length === 0 || tezineOdredista.length === 0) {
    return dijelovi;
  }

  const poBerbi = podijeliMl(
    stanje.map((s) => s.ml),
    izlazMl
  );

  const poOdredistu = podijeliMl(tezineOdredista, izlazMl);
  const matrica = raspodijeliMatricu(poBerbi, poOdredistu);

  for (let i = 0; i < stanje.length; i++) {
    for (let j = 0; j < tezineOdredista.length; j++) {
      const ml = matrica[i][j];
      if (ml <= 0) continue;
      dijelovi.push({ berbaId: stanje[i].berbaId, odrediste: j, ml });
    }
  }

  return dijelovi;
}

/**
 * Koliko od svakog IZVORA ide u svako ODREDISTE, kad izvora ima vise.
 *
 * Ista zamka jednu razinu iznad: da svaki izvor sam za sebe dijeli po
 * odredistima, zbroj po odredistu bi se razisao s onim sto je u cilj stvarno
 * uslo. Zato se i tu odmah racuna matrica s oba tocna ruba, pa svaki izvor
 * dobije SVOJ stupac tezina umjesto zajednickog.
 *
 * Zbroj izvora i zbroj odredista MORAJU biti jednaki — kalo je vec ukljuceno
 * u odredista kao stavka bez tanka.
 */
export function planPrijenosa(izvoriMl: number[], odredistaMl: number[]): number[][] {
  return raspodijeliMatricu(izvoriMl, odredistaMl);
}

/** Redak knjige prije upisa. Skuplja se pa upisuje odjednom. */
type Redak = {
  berbaId: string;
  izTankId: string | null;
  uTankId: string | null;
  litre: number;
  vrsta: "ULAZ" | "PRETOK" | "FILTRACIJA" | "IZLAZ" | "ISPRAVAK" | "PONISTENJE";
  pretokId: string | null;
  zadatakId: string | null;
  izlazVinaId: string | null;
  punjenjeId: string | null;
  dogodenoAt: Date;
  korisnikId: string | null;
  napomena: string | null;
};

// ---------------------------------------------------------------------------
// 1. ULAZ
// ---------------------------------------------------------------------------

/** Podaci jednog unosa grozdja u podrum. Zrcalo polja modela `Berba`. */
export type UlazBerbe = {
  /** Tank u koji vino prvo ulazi. */
  tankId: string;
  litre: number;

  vrstaUnosa?: "BERBA" | "ZATECENO";
  nazivSorte: string;
  sortaId?: string | null;

  datumBerbe?: Date | null;
  godinaBerbe?: number | null;
  kolicinaKgGrozdja?: number | null;

  polozaj?: string | null;
  parcela?: string | null;
  vinograd?: string | null;
  oznakaBerbe?: string | null;

  secer?: number | null;
  kiseline?: number | null;
  ph?: number | null;

  maceracija?: boolean | null;
  maceracijaSati?: number | null;

  napomena?: string | null;
  korisnikId?: string | null;

  /** Veza na stari zapis. Cini ponovljeni backfill neskodljivim. */
  izvornaPunjenjeStavkaId?: string | null;
  izvornaArhivaStavkaId?: string | null;

  /** Na koji je cin ulaz vezan. Za berbu je to punjenje tanka. */
  veza: Veza;

  /** Kad se dogodilo. Zadano: sada. */
  dogodenoAt?: Date;
  napomenaKretanja?: string | null;
};

export type RezultatUlaza = {
  berbaId: string;
  kretanjeId: string;
  ml: number;
  litre: number;
};

/** Jedno odrediste ulaza: koliko litara te iste berbe ide u koji tank. */
export type OdredisteUlaza = {
  tankId: string;
  litre: number;
};

/**
 * Ulaz jedne berbe u VISE tankova.
 *
 * Isto sto i `UlazBerbe`, samo sto umjesto para (tankId, litre) stoji popis
 * odredista. Sva ostala polja su nedirnuta — jer i opisuju jednu te istu berbu.
 */
export type UlazBerbeUVise = Omit<UlazBerbe, "tankId" | "litre"> & {
  odredista: OdredisteUlaza[];
};

export type RezultatUlazaUVise = {
  berbaId: string;
  /** Po jedan redak za svako odrediste, redoslijedom kojim su predana. */
  kretanja: Array<{
    tankId: string;
    kretanjeId: string;
    ml: number;
    litre: number;
  }>;
  /** Zbroj svih odredista. Toliko stoji i na `Berba.kolicinaLitara`. */
  ml: number;
  litre: number;
};

/**
 * Jezgra ULAZA. Oba javna ulaza (`zabiljeziUlaz`, `zabiljeziUlazUVise`) idu
 * ovuda, pa je ponasanje jedno. `gdje` je samo ime u porukama o gresci.
 */
async function upisiUlaz(
  tx: Tx,
  ulaz: UlazBerbeUVise,
  gdje: string
): Promise<RezultatUlazaUVise> {
  provjeriVezu(ulaz.veza, gdje, ulaz.napomenaKretanja ?? null);

  const odredista = ulaz.odredista ?? [];

  if (odredista.length === 0) {
    throw new BerbaGreska(`${gdje}: berba mora uci u barem jedan tank.`);
  }

  // Sve provjere PRIJE ijednog upisa. Djelomicno upisana berba — jedan tank
  // da, drugi ne — bila bi gora od nikakve: tvrdila bi da je grozdja bilo
  // manje nego sto ga je bilo, a nista je poslije ne bi razlikovalo od berbe
  // koja je stvarno tolika.
  const komadi = odredista.map((o, i) => {
    const tankId = String(o?.tankId ?? "").trim();

    if (!tankId) {
      throw new BerbaGreska(`${gdje}: nedostaje tank na ${i + 1}. retku.`);
    }

    const ml = uMl(o?.litre);

    if (ml <= 0) {
      throw new BerbaGreska(
        `${gdje}: kolicina za ${i + 1}. tank mora biti veca od nule (dobiveno ${o?.litre}).`
      );
    }

    return { tankId, ml, litre: uLitre(ml) };
  });

  // Isti tank dvaput nije podatak nego greska u unosu. Dva ULAZ retka u isti
  // tank knjiga zbraja ispravno, ali korisnik je ocito htio jedan redak i
  // negdje se zabunio — bolje odbiti nego tiho spojiti.
  if (new Set(komadi.map((k) => k.tankId)).size !== komadi.length) {
    throw new BerbaGreska(
      `${gdje}: isti tank je naveden vise puta. Spoji ga u jedan redak.`
    );
  }

  const naziv = String(ulaz.nazivSorte ?? "").trim();

  if (!naziv) {
    throw new BerbaGreska(`${gdje}: nedostaje naziv sorte.`);
  }

  const ukupnoMl = komadi.reduce((zbroj, k) => zbroj + k.ml, 0);
  const ukupnoLitre = uLitre(ukupnoMl);
  const kada = ulaz.dogodenoAt ?? new Date();

  const berba = await tx.berba.create({
    data: {
      vrstaUnosa: ulaz.vrstaUnosa ?? "BERBA",
      nazivSorte: naziv,
      sortaId: ulaz.sortaId ?? null,
      datumBerbe: ulaz.datumBerbe ?? null,
      godinaBerbe: ulaz.godinaBerbe ?? null,
      // Kilogrami se NE dijele po tankovima: ubrano je jednom, s jednog
      // polozaja. Sto je od toga zavrsilo u kojem tanku mjeri se litrama.
      kolicinaKgGrozdja: ulaz.kolicinaKgGrozdja ?? null,
      kolicinaLitara: ukupnoLitre,
      polozaj: ulaz.polozaj ?? null,
      parcela: ulaz.parcela ?? null,
      vinograd: ulaz.vinograd ?? null,
      oznakaBerbe: ulaz.oznakaBerbe ?? null,
      secer: ulaz.secer ?? null,
      kiseline: ulaz.kiseline ?? null,
      ph: ulaz.ph ?? null,
      maceracija: ulaz.maceracija ?? null,
      maceracijaSati: ulaz.maceracijaSati ?? null,
      napomena: ulaz.napomena ?? null,
      korisnikId: ulaz.korisnikId ?? null,
      // Prvi tank s popisa. Kad ih je vise, ovo je "jedan od", ne "jedini" —
      // potpun popis stoji u ULAZ retcima i cita se odande.
      prviTankId: komadi[0].tankId,
      izvornaPunjenjeStavkaId: ulaz.izvornaPunjenjeStavkaId ?? null,
      izvornaArhivaStavkaId: ulaz.izvornaArhivaStavkaId ?? null,
    },
    select: { id: true },
  });

  const kretanja: RezultatUlazaUVise["kretanja"] = [];

  // Sekvencijalno, ne Promise.all — jedna transakcijska veza (lib/paralelno.ts).
  for (const k of komadi) {
    const kretanje = await tx.berbaKretanje.create({
      data: {
        berbaId: berba.id,
        izTankId: null,
        uTankId: k.tankId,
        litre: k.litre,
        vrsta: "ULAZ",
        pretokId: ulaz.veza.pretokId ?? null,
        zadatakId: ulaz.veza.zadatakId ?? null,
        izlazVinaId: ulaz.veza.izlazVinaId ?? null,
        punjenjeId: ulaz.veza.punjenjeId ?? null,
        dogodenoAt: kada,
        korisnikId: ulaz.korisnikId ?? null,
        napomena: ulaz.napomenaKretanja ?? null,
      },
      select: { id: true },
    });

    kretanja.push({
      tankId: k.tankId,
      kretanjeId: kretanje.id,
      ml: k.ml,
      litre: k.litre,
    });
  }

  return { berbaId: berba.id, kretanja, ml: ukupnoMl, litre: ukupnoLitre };
}

/**
 * Grozdje / most ulazi u podrum, u VISE tankova odjednom.
 *
 * Nastaje TOCNO JEDAN zapis `Berba` i po jedan ULAZ redak za svaki tank.
 *
 * ZASTO JEDNA BERBA, A NE PO JEDNA PO TANKU
 * -----------------------------------------
 * Jedna berba je jedno grozdje s jednog polozaja, ubrano jednom. To sto je u
 * podrumu razliveno u dva tanka — samotok u jedan, presovina u drugi, ili
 * jednostavno ne stane u jedan — ne cini ju dvjema berbama. Dva poziva
 * `zabiljeziUlaz` dala bi dva zapisa: dva polozaja gdje je jedan, dvaput
 * ubrano gdje je ubrano jednom, i kilograme koji se moraju ili podijeliti
 * (netocno) ili udvostruciti (jos netocnije).
 *
 * LITRE SE OVDJE NE DIJELE NEGO ZBRAJAJU
 * --------------------------------------
 * Za razliku od pretoka i izlaza, ovdje se nista ne raspodjeljuje: za svaki
 * tank su litre upisane rukom. Svaka se zasebno pretvori u cijele mililitre,
 * pa je zbroj tocan po definiciji — `podijeliMl` ovdje nema sto raditi i
 * namjerno se ne zove.
 *
 * `Berba.kolicinaLitara` je ZBROJ svih ULAZ redaka. Tvrdnja je ista kao i
 * dosad ("toliko je ubrano" = "toliko je uslo u podrum"), samo sto podrum sad
 * smije biti vise tankova; `scripts/provjeri-berbu.ts` tu jednakost vec cuva
 * nad zbrojem kretanja, pa ga ovo ne mijenja.
 */
export async function zabiljeziUlazUVise(
  tx: Tx,
  ulaz: UlazBerbeUVise
): Promise<RezultatUlazaUVise> {
  return upisiUlaz(tx, ulaz, "zabiljeziUlazUVise");
}

/**
 * Grozdje / most ulazi u podrum: nastaje zapis berbe I prvi redak knjige.
 *
 * Oboje ili nista — zato je `tx` obavezan. Berba bez ijednog ULAZ retka bila bi
 * zapis o vinu koje nigdje nije, a ULAZ bez berbe je nemoguc (strani kljuc).
 *
 * `kolicinaLitara` na berbi i litre ULAZ retka su ISTI broj. To nije
 * podvostrucenje nego dvije razlicite tvrdnje koje se moraju poklopiti na
 * pocetku: prva je "toliko je ubrano", druga "toliko je uslo u tank". Kasnija
 * kretanja mijenjaju samo drugu. `scripts/provjeri-berbu.ts` cuva da su na
 * pocetku jednake.
 *
 * Otkad postoji `zabiljeziUlazUVise`, ovo je njegov slucaj s jednim
 * odredistem — jedan kod, jedno ponasanje. Potpis i povratna vrijednost su
 * nepromijenjeni. Vlastite provjere tanka i kolicine stoje samo zato da
 * poruka o gresci govori o tanku, a ne o "1. retku" popisa koji pozivatelj
 * nije ni vidio.
 */
export async function zabiljeziUlaz(
  tx: Tx,
  ulaz: UlazBerbe
): Promise<RezultatUlaza> {
  const { tankId, litre, ...ostalo } = ulaz;

  provjeriVezu(ulaz.veza, "zabiljeziUlaz", ulaz.napomenaKretanja ?? null);

  if (uMl(litre) <= 0) {
    throw new BerbaGreska(
      `zabiljeziUlaz: kolicina mora biti veca od nule (dobiveno ${litre}).`
    );
  }

  if (!String(tankId ?? "").trim()) {
    throw new BerbaGreska("zabiljeziUlaz: nedostaje tank u koji vino ulazi.");
  }

  const r = await upisiUlaz(
    tx,
    { ...ostalo, odredista: [{ tankId, litre }] },
    "zabiljeziUlaz"
  );

  return {
    berbaId: r.berbaId,
    kretanjeId: r.kretanja[0].kretanjeId,
    ml: r.ml,
    litre: r.litre,
  };
}

// ---------------------------------------------------------------------------
// Jezgra: razdioba onoga sto izlazi iz jednog tanka
// ---------------------------------------------------------------------------

/** Kamo ide ono sto iz tanka izlazi. `tankId: null` = napusta podrum. */
type Odrediste = { tankId: string | null; ml: number; napomena?: string | null };

type ZajednickiUlaz = {
  vrsta: Redak["vrsta"];
  veza: Veza;
  korisnikId: string | null;
  dogodenoAt: Date;
  napomena: string | null;
  naManjak: NaManjak;
  /** Napomena koja ide na ZATECENO zapis nastao zbog manjka. */
  opisManjka: string;
};

/** Berba dopisana zato sto knjiga nije znala odakle je vino u tanku. */
export type Nadopuna = {
  tankId: string;
  berbaId: string;
  ml: number;
  litre: number;
};

/**
 * Iz JEDNOG tanka izadje `izlazMl`, razdijeljeno na berbe koje su u njemu, pa
 * svaki taj dio dalje na odredista.
 *
 * Vraca retke — ne upisuje ih. Upis je jedan `createMany` na kraju cijelog
 * cina, da se pri gresci ne ostavi pola knjige.
 */
async function izTanka(
  tx: Tx,
  tankId: string,
  izlazMl: number,
  odredista: Odrediste[],
  z: ZajednickiUlaz
): Promise<{ redci: Redak[]; nadopune: Nadopuna[] }> {
  const redci: Redak[] = [];
  const nadopune: Nadopuna[] = [];

  const stanje = await stanjeTanka(tx, tankId);
  let raspolozivoMl = zbroj(stanje.map((s) => s.ml));

  // --- manjak -------------------------------------------------------------
  if (raspolozivoMl < izlazMl) {
    const manjakMl = izlazMl - raspolozivoMl;

    if (z.naManjak === "PUKNI") {
      throw new BerbaGreska(
        `Iz tanka izlazi ${uLitre(izlazMl)} L, a knjiga berbe u njemu ima ${uLitre(raspolozivoMl)} L ` +
          `(manjak ${uLitre(manjakMl)} L). Nista nije upisano.`
      );
    }

    // ZATECENO: rupa se upise kao imenovana berba, pa se moze prebrojati.
    // Vezana je na ISTI cin kao i kretanje zbog kojeg je nastala, da ju
    // ponistavanje tog cina povuce sa sobom.
    const nadopuna = await zabiljeziUlaz(tx, {
      tankId,
      litre: uLitre(manjakMl),
      vrstaUnosa: "ZATECENO",
      nazivSorte: "Nepoznato podrijetlo",
      napomena: z.opisManjka,
      veza: z.veza,
      dogodenoAt: z.dogodenoAt,
      napomenaKretanja: z.opisManjka,
    });

    nadopune.push({
      tankId,
      berbaId: nadopuna.berbaId,
      ml: nadopuna.ml,
      litre: nadopuna.litre,
    });

    stanje.push({
      berbaId: nadopuna.berbaId,
      ml: nadopuna.ml,
      litre: nadopuna.litre,
      obrisano: false,
    });

    raspolozivoMl += nadopuna.ml;
  }

  // --- razdioba ------------------------------------------------------------
  const dijelovi = razdijeliIzlaz(
    stanje,
    izlazMl,
    odredista.map((o) => o.ml)
  );

  for (const d of dijelovi) {
    redci.push({
      berbaId: d.berbaId,
      izTankId: tankId,
      uTankId: odredista[d.odrediste].tankId,
      litre: uLitre(d.ml),
      vrsta: z.vrsta,
      pretokId: z.veza.pretokId ?? null,
      zadatakId: z.veza.zadatakId ?? null,
      izlazVinaId: z.veza.izlazVinaId ?? null,
      punjenjeId: z.veza.punjenjeId ?? null,
      dogodenoAt: z.dogodenoAt,
      korisnikId: z.korisnikId,
      napomena: odredista[d.odrediste].napomena ?? z.napomena,
    });
  }

  return { redci, nadopune };
}

async function upisiRetke(tx: Tx, redci: Redak[]): Promise<number> {
  if (redci.length === 0) return 0;
  const rezultat = await tx.berbaKretanje.createMany({ data: redci });
  return rezultat.count;
}

// ---------------------------------------------------------------------------
// 2. PRIJENOS
// ---------------------------------------------------------------------------

export type Prijenos = {
  izvori: UdioTanka[];
  ciljevi: UdioTanka[];
  /** PRETOK ili FILTRACIJA — flotacija i talozenje idu kao FILTRACIJA. */
  vrsta: "PRETOK" | "FILTRACIJA";
  veza: Veza;
  korisnikId?: string | null;
  dogodenoAt?: Date;
  napomena?: string | null;
  naManjak?: NaManjak;
  opisManjka?: string;
};

export type RezultatPrijenosa = {
  redaka: number;
  izasloMl: number;
  usloMl: number;
  /** Razlika izlaza i ulaza. Upisuje se kao odlazak iz podruma bez odredista. */
  kaloMl: number;
  nadopune: Nadopuna[];
};

/**
 * Vino se seli: N izvornih tankova u M ciljnih. Pokriva pretok, filtraciju,
 * flotaciju i talozenje — mehanika je za sve ista, razlikuje se samo `vrsta`.
 *
 * KAKO SE DIJELI, u dva koraka:
 *
 *   1. Po BERBAMA. Iz izvornog tanka izadje `izlaz` litara; svaka berba u tom
 *      tanku daje onoliki dio koliki joj je udio u tanku.
 *   2. Po CILJEVIMA. Ono sto je od jedne berbe izaslo dijeli se na ciljne
 *      tankove razmjerno njihovim ulazima, plus kalo kao odredisce bez tanka.
 *
 * Oba koraka su `podijeliMl`, pa je zbroj dijelova tocno jednak cjelini — ni
 * mililitar se ne moze izgubiti ni izmisliti.
 *
 * KALO (izlaz vece od ulaza) upisuje se kao redak s `uTankId = NULL`: te litre
 * su iz tanka stvarno izasle, ali nigdje nisu usle. Da se ne upisuje, knjiga bi
 * i dalje tvrdila da su u izvoru.
 *
 * KAD IZ IZVORA IZLAZI VISE NEGO STO KNJIGA IMA — vidi `NaManjak`. Zadano
 * puca prije ijednog upisa. Negativno stanje ne nastaje ni u jednom slucaju.
 */
export async function zabiljeziPrijenos(
  tx: Tx,
  p: Prijenos
): Promise<RezultatPrijenosa> {
  provjeriVezu(p.veza, "zabiljeziPrijenos", p.napomena ?? null);

  const izvori = normalizirajUdjele(p.izvori);
  const ciljevi = normalizirajUdjele(p.ciljevi);

  if (izvori.length === 0) {
    throw new BerbaGreska("zabiljeziPrijenos: nema izvora s kolicinom vecom od nule.");
  }

  // Isti tank i s jedne i s druge strane: razdioba bi mu citala stanje prije
  // upisa, a onda mu istim cinom i oduzimala i dodavala. Rezultat bi ovisio o
  // redoslijedu, pa se odbija umjesto da se pogadja.
  const uIzvorima = new Set(izvori.map((i) => i.tankId));
  const dvostruki = ciljevi.filter((c) => uIzvorima.has(c.tankId));

  if (dvostruki.length > 0) {
    throw new BerbaGreska(
      "zabiljeziPrijenos: isti tank ne moze biti i izvor i cilj istog prijenosa."
    );
  }

  const izasloMl = zbroj(izvori.map((i) => i.ml));
  const usloMl = zbroj(ciljevi.map((c) => c.ml));
  const kaloMl = izasloMl - usloMl;

  if (kaloMl < 0) {
    throw new BerbaGreska(
      `zabiljeziPrijenos: u ciljeve ulazi ${uLitre(usloMl)} L, a iz izvora izlazi samo ${uLitre(izasloMl)} L.`
    );
  }

  const z: ZajednickiUlaz = {
    vrsta: p.vrsta,
    veza: p.veza,
    korisnikId: p.korisnikId ?? null,
    dogodenoAt: p.dogodenoAt ?? new Date(),
    napomena: p.napomena ?? null,
    naManjak: p.naManjak ?? "PUKNI",
    opisManjka:
      p.opisManjka ??
      "Vino zateceno u tanku bez zapisa o tome odakle je doslo.",
  };

  // Odredista su ciljevi plus, kad ga ima, kalo kao odrediste bez tanka.
  const odredistaTankovi: Array<string | null> = ciljevi.map((c) => c.tankId);
  const odredistaMl: number[] = ciljevi.map((c) => c.ml);
  const odredistaNapomene: Array<string | null> = ciljevi.map(() => p.napomena ?? null);

  if (kaloMl > 0) {
    odredistaTankovi.push(null);
    odredistaMl.push(kaloMl);
    odredistaNapomene.push(`Kalo ${uLitre(kaloMl)} L`);
  }

  // Koliko od kojeg izvora ide u koje odrediste. Racuna se ODMAH za sve
  // izvore, jer se tocan zbroj po odredistu ne moze dobiti ako svaki izvor
  // dijeli za sebe — vidi `raspodijeliMatricu`.
  const matrica = planPrijenosa(
    izvori.map((i) => i.ml),
    odredistaMl
  );

  const sviRedci: Redak[] = [];
  const sveNadopune: Nadopuna[] = [];

  // Sekvencijalno, NE Promise.all: ovo radi unutar transakcije, a usporedni
  // upiti nad jednom transakcijskom vezom su tocno ono sto pg@9 odbija
  // (vidi lib/paralelno.ts i biljesku o arhiviranju). Izvora je uz to u praksi
  // jedan do tri, pa se nema sto ni dobiti.
  for (let s = 0; s < izvori.length; s++) {
    const odredista: Odrediste[] = odredistaTankovi.map((tankId, j) => ({
      tankId,
      ml: matrica[s][j],
      napomena: odredistaNapomene[j],
    }));

    const { redci, nadopune } = await izTanka(tx, izvori[s].tankId, izvori[s].ml, odredista, z);
    sviRedci.push(...redci);
    sveNadopune.push(...nadopune);
  }

  const redaka = await upisiRetke(tx, sviRedci);

  return { redaka, izasloMl, usloMl, kaloMl, nadopune: sveNadopune };
}

// ---------------------------------------------------------------------------
// 3. IZLAZ
// ---------------------------------------------------------------------------

export type Izlaz = {
  tankId: string;
  litre: number;
  /**
   * IZLAZ = vino je stvarno otislo iz podruma (prodaja, boce, otpis). ZADANO.
   *
   * ISPRAVAK = tih litara zapravo nije ni bilo; knjiga se usaglasava sa
   * stvarnim stanjem tanka. Mehanika je identicna — razdioba po berbama
   * razmjerno stanju — pa se ne prepisuje; razlikuje se samo ono sto redak
   * TVRDI, a to je cijela svrha razdvojenih vrsta. Jedini pozivatelj je
   * `scripts/backfill-berba.ts`; u redovnom radu ispravaka nema.
   */
  vrsta?: "IZLAZ" | "ISPRAVAK";
  veza: Veza;
  korisnikId?: string | null;
  dogodenoAt?: Date;
  napomena?: string | null;
  naManjak?: NaManjak;
  opisManjka?: string;
};

export type RezultatIzlaza = {
  redaka: number;
  ml: number;
  nadopune: Nadopuna[];
};

/**
 * Vino napusta podrum: prodaja rinfuze, punjenje u boce, otpis.
 *
 * Isti prvi korak kao kod prijenosa — razdioba po berbama razmjerno stanju u
 * tanku — samo bez druge razine: odrediste je jedno i bez tanka.
 */
export async function zabiljeziIzlaz(
  tx: Tx,
  i: Izlaz
): Promise<RezultatIzlaza> {
  provjeriVezu(i.veza, "zabiljeziIzlaz", i.napomena ?? null);

  const ml = uMl(i.litre);

  if (ml <= 0) {
    throw new BerbaGreska(
      `zabiljeziIzlaz: kolicina mora biti veca od nule (dobiveno ${i.litre}).`
    );
  }

  const z: ZajednickiUlaz = {
    vrsta: i.vrsta ?? "IZLAZ",
    veza: i.veza,
    korisnikId: i.korisnikId ?? null,
    dogodenoAt: i.dogodenoAt ?? new Date(),
    napomena: i.napomena ?? null,
    naManjak: i.naManjak ?? "PUKNI",
    opisManjka:
      i.opisManjka ?? "Vino zateceno u tanku bez zapisa o tome odakle je doslo.",
  };

  const { redci, nadopune } = await izTanka(
    tx,
    i.tankId,
    ml,
    [{ tankId: null, ml }],
    z
  );

  const redaka = await upisiRetke(tx, redci);

  return { redaka, ml, nadopune };
}

// ---------------------------------------------------------------------------
// 4. ISPRAVAK JEDNE BERBE
// ---------------------------------------------------------------------------

export type IspravakBerbe = {
  /** Koja berba izlazi. Ne "koliko vina", nego "koja berba". */
  berbaId: string;
  /** Iz kojeg tanka. */
  tankId: string;
  /**
   * Koliko te berbe izlazi iz tog tanka. Ograniceno je stanjem: knjiga ne
   * upisuje redak koji bi berbu u tanku odveo ispod nule.
   */
  litre: number;
  veza: Veza;
  korisnikId?: string | null;
  dogodenoAt?: Date;
  napomena?: string | null;
};

export type RezultatIspravka = {
  kretanjeId: string;
  ml: number;
  litre: number;
  /** Koliko je te berbe ostalo u tom tanku nakon ispravka. */
  ostatakMl: number;
};

/**
 * Pogresno upisana berba izlazi iz tanka. JEDINI upis koji ne dijeli razmjerno.
 *
 * ZASTO NE `zabiljeziIzlaz`
 * -------------------------
 * `zabiljeziIzlaz` razdijeli ono sto izlazi na SVE berbe u tanku, razmjerno
 * njihovim udjelima — i to je tocno kod prodaje ili punjenja u boce, jer je vino
 * izmijesano pa iz tanka izlazi od svake berbe pomalo.
 *
 * Ispravak tvrdi nesto drugo: te berbe u tanku NIKAD NIJE BILO, netko je upisao
 * krivu stavku punjenja. Razmjerna raspodjela bi tada maknula pomalo od svake
 * DRUGE berbe — vina koje je stvarno ondje — i ostavila dio izmisljene. Zato
 * ovdje ide tocno jedan redak, tocno na tu berbu.
 *
 * KOLIKO SE SMIJE ODUZETI
 * -----------------------
 * Najvise onoliko koliko knjiga danas tvrdi da je te berbe U TOM TANKU. Vino se
 * u medjuvremenu moglo pretociti dalje, pa ista berba stoji u dva ili tri tanka;
 * pozivatelj tada odlucuje sto s tim (vidi cuvar u
 * app/api/punjenje-stavka/[id]/route.ts). Oduzimanje izvornih litara iz izvornog
 * tanka odvelo bi berbu u minus i tvrdilo da je vino bilo ondje gdje vise nije.
 */
export async function zabiljeziIspravak(
  tx: Tx,
  i: IspravakBerbe
): Promise<RezultatIspravka> {
  provjeriVezu(i.veza, "zabiljeziIspravak", i.napomena ?? null);

  const ml = uMl(i.litre);

  if (ml <= 0) {
    throw new BerbaGreska(
      `zabiljeziIspravak: kolicina mora biti veca od nule (dobiveno ${i.litre}).`
    );
  }

  if (!String(i.berbaId ?? "").trim() || !String(i.tankId ?? "").trim()) {
    throw new BerbaGreska("zabiljeziIspravak: nedostaje berba ili tank.");
  }

  const stanje = await stanjeTanka(tx, i.tankId, { svi: true });
  const uTankuMl = stanje.find((s) => s.berbaId === i.berbaId)?.ml ?? 0;

  if (ml > uTankuMl) {
    throw new BerbaGreska(
      `Iz tanka se mice ${uLitre(ml)} L te berbe, a knjiga je u njemu ima ${uLitre(uTankuMl)} L. Nista nije upisano.`
    );
  }

  const litre = uLitre(ml);

  const kretanje = await tx.berbaKretanje.create({
    data: {
      berbaId: i.berbaId,
      izTankId: i.tankId,
      uTankId: null,
      litre,
      vrsta: "ISPRAVAK",
      pretokId: i.veza.pretokId ?? null,
      zadatakId: i.veza.zadatakId ?? null,
      izlazVinaId: i.veza.izlazVinaId ?? null,
      punjenjeId: i.veza.punjenjeId ?? null,
      dogodenoAt: i.dogodenoAt ?? new Date(),
      korisnikId: i.korisnikId ?? null,
      napomena: i.napomena ?? null,
    },
    select: { id: true },
  });

  return { kretanjeId: kretanje.id, ml, litre, ostatakMl: uTankuMl - ml };
}

// ---------------------------------------------------------------------------
// 5. PONISTENJE
// ---------------------------------------------------------------------------

export type RezultatPonistenja = {
  redaka: number;
  ml: number;
};

/**
 * Cin se ponistava: za svaki njegov redak upise se zrcalni redak.
 *
 * NISTA SE NE BRISE. Zrcalo ima zamijenjene tankove i istu kolicinu, pa se
 * zbrojevi po tanku vracaju TOCNO na staro — dva jednaka cijela broja u
 * mililitrima, jedan u plusu i jedan u minusu. Ne priblizno: tocno.
 *
 * Zasto protustavka umjesto brisanja: obrisani redci ne mogu odgovoriti na
 * pitanje "zasto se u tanku 43 dvaput promijenila brojka". Knjiga koja pamti i
 * potez i njegovo povlacenje odgovara na oboje. Isti razlog stoji i iza toga
 * sto se ponistavanjem pretoka ne dira `Berba` — zapis o berbi nije bio
 * pogresan, samo je vino vraceno.
 *
 * POKRIVA I NADOPUNE: ZATECENO berba koju je taj cin morao izmisliti vezana je
 * na isti kljuc, pa ju ponistenje povlaci sa sobom. Sam `Berba` redak ostaje —
 * na nuli je, a `scripts/provjeri-berbu.ts` ga zna prepoznati.
 *
 * VISE KRUGOVA NA ISTOM CINU. Pretok se ponistavanjem brise, pa za njega postoji
 * samo jedan krug. Zadatak NE — ponisti se, vrati u OTVOREN i moze se izvrsiti
 * ponovno, pa isti `zadatakId` nosi FILTRACIJA, PONISTENJE, pa opet FILTRACIJA.
 * Zato se ne gleda "ima li ijedna protustavka" nego se svaka protustavka SPARI
 * sa svojim izvornim retkom, a zrcali se samo ono sto je ostalo nespareno. Dva
 * kruga bi inace ili puknula na drugom ponistavanju iako novi krug jos stoji,
 * ili bi zrcalila i vec zrcaljene retke i tank bi dobio vino kojeg nema.
 *
 * Sparuje se po sadrzaju (berba, oba tanka, mililitri), ne po vremenu: retci
 * upisani u istoj transakciji imaju ISTI `createdAt` — Postgresov
 * CURRENT_TIMESTAMP je vrijeme pocetka transakcije — pa poredak po njemu ne
 * razlikuje krug od njegova zrcala.
 */
export async function zabiljeziPonistenje(
  tx: Tx,
  veza: Veza,
  opts?: { korisnikId?: string | null; dogodenoAt?: Date; napomena?: string | null }
): Promise<RezultatPonistenja> {
  provjeriTocnoJednuVezu(veza, "zabiljeziPonistenje");

  const gdje = {
    ...(veza.pretokId ? { pretokId: veza.pretokId } : {}),
    ...(veza.zadatakId ? { zadatakId: veza.zadatakId } : {}),
    ...(veza.izlazVinaId ? { izlazVinaId: veza.izlazVinaId } : {}),
    ...(veza.punjenjeId ? { punjenjeId: veza.punjenjeId } : {}),
  };

  const postojeci = await tx.berbaKretanje.findMany({
    where: gdje,
    orderBy: { createdAt: "asc" },
  });

  if (postojeci.length === 0) {
    throw new BerbaGreska(
      "zabiljeziPonistenje: taj cin nema nijedno kretanje u knjizi berbe."
    );
  }

  // Sparivanje protustavki s izvornim retcima — vidi biljesku o vise krugova.
  const kljuc = (
    berbaId: string,
    izTankId: string | null,
    uTankId: string | null,
    litre: number
  ) => `${berbaId}|${izTankId ?? ""}|${uTankId ?? ""}|${uMl(litre)}`;

  const vecZrcaljeno = new Map<string, number>();

  for (const k of postojeci) {
    if (k.vrsta !== "PONISTENJE") continue;
    // Zrcalo ima zamijenjene tankove, pa se kljuc vraca u izvorni smjer.
    const kl = kljuc(k.berbaId, k.uTankId, k.izTankId, Number(k.litre));
    vecZrcaljeno.set(kl, (vecZrcaljeno.get(kl) ?? 0) + 1);
  }

  const zaPonistiti = postojeci.filter((k) => {
    if (k.vrsta === "PONISTENJE") return false;

    const kl = kljuc(k.berbaId, k.izTankId, k.uTankId, Number(k.litre));
    const preostalo = vecZrcaljeno.get(kl) ?? 0;

    if (preostalo > 0) {
      vecZrcaljeno.set(kl, preostalo - 1);
      return false;
    }

    return true;
  });

  // Dvaput ponisten cin vratio bi u tank vise nego sto je iz njega izaslo.
  // Zato se odbija umjesto da se tiho preskoci: tiho preskakanje bi izgledalo
  // kao da je ponistenje uspjelo.
  if (zaPonistiti.length === 0) {
    throw new BerbaGreska(
      "zabiljeziPonistenje: taj je cin vec ponisten (u knjizi vec stoje protustavke)."
    );
  }

  const kada = opts?.dogodenoAt ?? new Date();

  const zrcala: Redak[] = zaPonistiti.map((k) => ({
    berbaId: k.berbaId,
    // Zamijenjeni tankovi — to je cijelo ponistenje. ULAZ (izTank NULL) time
    // postaje odlazak iz podruma, cime berba u tanku pada na nulu.
    izTankId: k.uTankId,
    uTankId: k.izTankId,
    litre: Number(k.litre),
    vrsta: "PONISTENJE",
    pretokId: k.pretokId,
    zadatakId: k.zadatakId,
    izlazVinaId: k.izlazVinaId,
    punjenjeId: k.punjenjeId,
    dogodenoAt: kada,
    korisnikId: opts?.korisnikId ?? null,
    napomena: opts?.napomena ?? null,
  }));

  const redaka = await upisiRetke(tx, zrcala);

  return { redaka, ml: zbroj(zrcala.map((z) => uMl(z.litre))) };
}
