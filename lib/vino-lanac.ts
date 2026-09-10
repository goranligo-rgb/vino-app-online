import { uMl } from "@/lib/filtracija";

/**
 * LANAC VINA — tko je s vinom putovao i koliki mu je danas udio.
 * ======================================================================
 *
 * PRAVILO KOJE OVAJ MODUL PROVODI: tank je posuda, sve putuje s vinom.
 * Radnja (dodavanje kvasca, bentonita, SO2, korekcija) danas visi na
 * `Radnja.tankId` i ostaje ondje kad vino ode dalje. Odrediste zato o
 * vlastitoj fermentaciji ne zna nista — a fermentiralo je bas to vino.
 *
 * Ovdje se povijest PONOVNO ODIGRAVA nad knjigom kretanja (`BerbaKretanje`),
 * kronoloski, i za svaki se trenutak zna:
 *   - koliko je vina u kojem tanku (racunato iz knjige, nikad iz
 *     `Tank.kolicinaVinaUTanku` — vidi biljesku uz model BerbaKretanje),
 *   - koji dio te kolicine potjece iz koje radnje.
 *
 * KAKO SE RACUNA UDIO
 * -------------------
 * Radnja upisana u tanku T vrijedi za SVE vino koje je tada u T — udio 1.
 * Kad u T udje jos vina, sve se razrjeduje istim omjerom:
 *
 *     udio_novi = udio_stari * V_prije / V_poslije
 *
 * a ono sto dolazi iz izvora S ulazi vec razrijedeno onim sto je bilo u S:
 *
 *     udio_u_T = udio_u_S * L_iz_S / V_poslije
 *
 * Time se kaskada mnozi sama od sebe: 50 % vina iz tanka koji je sam bio
 * 40 % nekog kvasca daje 20 %. Odlazak vina (prodaja, punjenje u boce, kalo)
 * udjele NE MIJENJA — iz tanka odlazi presjek cijelog sadrzaja, pa omjeri
 * ostaju isti.
 *
 * Ono sto nedostaje do 100 % u pojedinom tanku je vino BEZ ZAPISA i prikaz
 * ga mora imenovati (vidi `bezZapisa`), inace izgleda kao greska u racunu.
 *
 * ISTA RADNJA DVAMA PUTEVIMA. Cuvée od pet izvora moze istu izvornu radnju
 * dobiti kroz vise njih. Tada se udjeli ZBRAJAJU, a redak ostaje jedan —
 * kljuc je `izvornaRadnjaId`, ne sadrzaj. Zbrajanje je jedino tocno: 30 %
 * iz izvora koji je bio 100 % i 20 % iz izvora koji je bio 50 % daju 40 %.
 *
 * STO OVAJ MODUL NE RADI: ne cita `BlendIzvor`. Ti su pokazivaci u zatecenoj
 * bazi mjestimicno krivi (T6/T32/T15 namjerno ostavljeni takvima, T43 razmak
 * 20 L) i normaliziraju se na postotke. Knjiga kretanja je jedini zapis koji
 * se samo dopisuje i u kojem litre odgovaraju stvarnosti.
 */

/** Jedno kretanje vina iz knjige. `null` na strani tanka = izvan podruma. */
export type Kretanje = {
  id: string;
  izTankId: string | null;
  uTankId: string | null;
  litre: number;
  /** ULAZ, PRETOK, FILTRACIJA, IZLAZ, ISPRAVAK, PONISTENJE. */
  vrsta: string;
  dogodenoAt: Date;
  createdAt: Date;
  /** Cin na koji je kretanje vezano — sva kretanja istog cina su istovremena. */
  pretokId: string | null;
  zadatakId: string | null;
  izlazVinaId: string | null;
  punjenjeId: string | null;
};

/**
 * SAT LANCA — koji trenutak vrijedi za jedno kretanje.
 *
 * `dogodenoAt` NIJE jedinstven sat. Za pretok je to prava vremenska oznaka
 * (upisuje ga motor), ali za punjenje i izlaz je datum IZ FORME: punjenje
 * upisano u 16:48 zna nositi `dogodenoAt` 18:46, jer je covjek tako datirao.
 * Citano samo po `dogodenoAt`, ULAZ tada pada IZA radnje koja je nastala u
 * istoj transakciji, pa lanac zakljuci da je tank u trenutku punjenja bio
 * prazan — i cijelo punjenje proglasi nepripisivim.
 *
 * `createdAt` sam po sebi je jednako los: backfill knjige (26.08.2026) upisao
 * je 174 povijesna retka u istoj minuti, pa bi kronologija cijele sezone
 * propala.
 *
 * Uzima se ono STO JE RANIJE — najraniji trenutak za koji se zna da je
 * kretanje postojalo. Za zivi upis to je vrijeme upisa (tocno), za unatrag
 * datiran unos isto (tocno), za backfillan redak `dogodenoAt` (tocno).
 *
 * Ista logika kao izbor `createdAt` u lib/granica-arhive.ts, samo sto ondje
 * pitanje ima jedan izvor, a ovdje dva.
 */
function satKretanja(k: Kretanje): number {
  return Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime());
}

/**
 * DOPUSTENJE ZA ISTU TRANSAKCIJU.
 *
 * Punjenje pise `Radnja` i knjizi ULAZ u jednoj transakciji, u razmaku od
 * nekoliko desetaka milisekundi — i pise ih TIM redoslijedom, radnju prvu.
 * Redoslijed dvaju upisa unutar jedne transakcije ne govori nista o tome sto
 * je bilo prije u tanku.
 *
 * Zato se unutar ovog prozora primjenjuje ZNACENJE, ne vremenska oznaka:
 *   - ono sto je UŠLO bilo je u tanku kad se radnja dogodila (punis pa
 *     sumporis), pa ulaz ide PRIJE radnje;
 *   - ono sto je IZAŠLO bilo je u tanku do trenutka izlaska (tocis pa
 *     zapisujes da si natocio), pa izlaz ide POSLIJE radnje.
 *
 * Izvan prozora odlucuje pravo vrijeme.
 */
const PROZOR_ISTE_TRANSAKCIJE_MS = 5_000;

/** Radnja onako kako je lancu treba: gdje se dogodila i kada. */
export type RadnjaULancu = {
  id: string;
  tankId: string;
  createdAt: Date;
};

/** Koliki dio danasnjeg vina u tanku potjece iz jedne izvorne radnje. */
export type UdioRadnje = {
  radnjaId: string;
  /** Tank u kojem je radnja STVARNO izvedena. Prikaz ga imenuje uz kvasac. */
  izvorniTankId: string;
  /** 0..1 udjela danasnjeg volumena tanka. */
  udio: number;
};

export type StanjeTanka = {
  tankId: string;
  /** Litre po knjizi, ne po `Tank.kolicinaVinaUTanku`. */
  litre: number;
  udjeli: UdioRadnje[];
};

/**
 * Sto je knjiga znala o tanku u trenutku radnje.
 *
 * Radnja izvedena nad tankom za koji knjiga tada nije znala nijednu litru
 * NIJE PRIPISIVA: nema vina kojem bi se pripisala, pa ne moze ni putovati.
 * Takva radnja ostaje vidljiva na svom tanku, ali bez veze na lanac — i mora
 * se POPISATI, jer je to rupa u zapisima, a ne racun.
 */
export type BiljeskaRadnje = {
  radnjaId: string;
  tankId: string;
  /** Litre koje je knjiga tada znala u tom tanku. */
  litreUTanku: number;
  pripisiva: boolean;
};

export type RezultatLanca = {
  stanje: Map<string, StanjeTanka>;
  biljeske: BiljeskaRadnje[];
};

/**
 * Cin je skup kretanja koja su se dogodila ISTOVREMENO. Pretok iz tri izvora
 * u dva cilja je jedan cin: kad bi se njegova kretanja primjenjivala jedno po
 * jedno, drugi bi cilj racunao razrjedenje nad vec promijenjenim izvorom i
 * rezultat bi ovisio o redoslijedu redaka u tablici.
 */
function kljucCina(k: Kretanje): string {
  const veza =
    k.pretokId ?? k.zadatakId ?? k.izlazVinaId ?? k.punjenjeId ?? `sam:${k.id}`;

  // VRSTA JE DIO KLJUCA, i to nije kozmetika.
  //
  // Ispravak i ponistenje nose ISTU vezu kao ono sto ispravljaju: brisanje
  // pogresne stavke punjenja upisuje ISPRAVAK s `punjenjeId` izvornog
  // punjenja, ponistenje pretoka upisuje PONISTENJE s `pretokId` izvornog
  // pretoka. Bez vrste u kljucu oni se spajaju s originalom u jedan cin, pa
  // vino "izlazi" u istom trenutku u kojem je uslo — i tank cijelo vrijeme
  // izgleda prazan. Tocno to je tanku 7 progutalo dva punjenja od 28.08.2026.
  //
  // Ispravak je zaseban cin koji se dogodio KASNIJE. Da je i ostao spojen,
  // racun bi bio isti tek na kraju, ali sve izmedju bi bilo krivo.
  return `${veza}:${k.vrsta}`;
}

type Cin = { kljuc: string; kada: number; kretanja: Kretanje[] };

function grupirajUCine(kretanja: Kretanje[]): Cin[] {
  const mapa = new Map<string, Cin>();

  for (const k of kretanja) {
    const kljuc = kljucCina(k);
    const kada = satKretanja(k);
    const postojeci = mapa.get(kljuc);

    if (postojeci) {
      postojeci.kretanja.push(k);
      // Cin se dogodio kad je POCEO. Redci jednog pretoka nastaju u istoj
      // transakciji, ali sat im se zna razlikovati za milisekundu.
      if (kada < postojeci.kada) postojeci.kada = kada;
    } else {
      mapa.set(kljuc, { kljuc, kada, kretanja: [k] });
    }
  }

  return Array.from(mapa.values());
}

/** Udjeli iste radnje se ZBRAJAJU, redak ostaje jedan. */
function dodaj(
  cilj: Map<string, UdioRadnje>,
  radnjaId: string,
  izvorniTankId: string,
  udio: number
) {
  if (udio <= 0) return;
  const p = cilj.get(radnjaId);

  if (p) {
    p.udio += udio;
    return;
  }

  cilj.set(radnjaId, { radnjaId, izvorniTankId, udio });
}

/**
 * Cin se u vremensku crtu razlaze na DVIJE polovice — ulaznu i izlaznu.
 *
 * To je sigurno: izlaz iz tanka NE MIJENJA udjele u njemu (odlazi presjek
 * cijelog sadrzaja), pa cilj koji cita izvor dobiva iste udjele bez obzira je
 * li izvor vec umanjen. Mijenja se samo redoslijed prema radnjama, a to je
 * upravo ono sto se ovime i zeljelo.
 */
type Dogadjaj =
  | { kada: number; red: 0; ulaz: Cin }
  | { kada: number; red: 1; radnja: RadnjaULancu }
  | { kada: number; red: 2; izlaz: Cin };

/**
 * Odigraj cijelu povijest i vrati stanje svakog tanka na kraju.
 *
 * Ulaz se NE cita iz baze — pozivatelj dohvaca retke (skripta jednim upitom,
 * backfill unutar svoje transakcije), pa je racun ovdje cist i testabilan.
 *
 * Redoslijed je jedini izvor istine o tome sto je bilo prije cega. Radnje i
 * kretanja se spajaju u jednu vremensku crtu: radnja upisana PRIJE pretoka
 * putuje s vinom, ona upisana POSLIJE ostaje u tanku u kojem je nastala.
 */
export function odigrajLanac(
  kretanja: Kretanje[],
  radnje: RadnjaULancu[]
): RezultatLanca {
  const litreMl = new Map<string, number>();
  const udjeli = new Map<string, Map<string, UdioRadnje>>();
  const biljeske: BiljeskaRadnje[] = [];

  const uzmi = (tankId: string) => {
    let m = udjeli.get(tankId);
    if (!m) {
      m = new Map();
      udjeli.set(tankId, m);
    }
    return m;
  };

  const cini = grupirajUCine(kretanja);

  const crta: Dogadjaj[] = [
    ...cini
      .filter((c) => c.kretanja.some((k) => k.uTankId))
      .map((cin) => ({
        kada: cin.kada - PROZOR_ISTE_TRANSAKCIJE_MS,
        red: 0 as const,
        ulaz: cin,
      })),
    ...radnje.map((r) => ({
      kada: r.createdAt.getTime(),
      red: 1 as const,
      radnja: r,
    })),
    ...cini
      .filter((c) => c.kretanja.some((k) => k.izTankId))
      .map((cin) => ({
        kada: cin.kada + PROZOR_ISTE_TRANSAKCIJE_MS,
        red: 2 as const,
        izlaz: cin,
      })),
  ];

  crta.sort((a, b) => a.kada - b.kada || a.red - b.red);

  for (const d of crta) {
    if (d.red === 1) {
      const uTankuMl = litreMl.get(d.radnja.tankId) ?? 0;

      biljeske.push({
        radnjaId: d.radnja.id,
        tankId: d.radnja.tankId,
        litreUTanku: uTankuMl / 1000,
        pripisiva: uTankuMl > 0,
      });

      // Radnja vrijedi za sve vino koje je u tom trenutku u tanku.
      dodaj(uzmi(d.radnja.tankId), d.radnja.id, d.radnja.tankId, 1);
      continue;
    }

    // IZLAZNA POLOVICA: iz tankova se samo oduzima. Udjeli se NE MIJENJAJU —
    // iz tanka odlazi presjek cijelog sadrzaja.
    if (d.red === 2) {
      const izlazi = new Map<string, number>();

      for (const k of d.izlaz.kretanja) {
        const ml = uMl(k.litre);
        if (ml <= 0 || !k.izTankId) continue;
        izlazi.set(k.izTankId, (izlazi.get(k.izTankId) ?? 0) + ml);
      }

      for (const [izvorId, ml] of izlazi) {
        const ostatak = (litreMl.get(izvorId) ?? 0) - ml;

        // Tank ispraznjen do kraja gubi svoje udjele: vino koje je nosilo te
        // radnje je otislo. Ostavljeni bi se zalijepili na sljedece vino koje
        // u taj tank udje. Isti razlog zbog kojeg postoji granica arhive.
        if (ostatak <= 0) {
          litreMl.set(izvorId, 0);
          udjeli.delete(izvorId);
        } else {
          litreMl.set(izvorId, ostatak);
        }
      }

      continue;
    }

    // ULAZNA POLOVICA.
    const cin = d.ulaz;

    // 1) Sto u koji tank ULAZI, i odakle.
    const ulazi = new Map<
      string,
      Array<{ izTankId: string | null; ml: number }>
    >();

    for (const k of cin.kretanja) {
      const ml = uMl(k.litre);
      if (ml <= 0 || !k.uTankId) continue;

      const p = ulazi.get(k.uTankId) ?? [];
      p.push({ izTankId: k.izTankId, ml });
      ulazi.set(k.uTankId, p);
    }

    // 2) Udjeli ciljeva se racunaju nad stanjem PRIJE cina — za sve ciljeve
    //    odjednom, prije ijednog umanjenja izvora.
    const noviUdjeli = new Map<string, Map<string, UdioRadnje>>();

    for (const [ciljId, dolasci] of ulazi) {
      const prijeMl = litreMl.get(ciljId) ?? 0;
      const usloMl = dolasci.reduce((z, x) => z + x.ml, 0);
      const poslijeMl = prijeMl + usloMl;

      if (poslijeMl <= 0) continue;

      const nova = new Map<string, UdioRadnje>();

      // Ono sto je u cilju vec bilo — razrijedeno.
      if (prijeMl > 0) {
        for (const u of uzmi(ciljId).values()) {
          dodaj(
            nova,
            u.radnjaId,
            u.izvorniTankId,
            (u.udio * prijeMl) / poslijeMl
          );
        }
      }

      // Ono sto dolazi — udio u izvoru, skaliran doslim litrama.
      for (const dolazak of dolasci) {
        if (!dolazak.izTankId) continue; // ulaz izvana (berba) nema zapisa

        const izvor = udjeli.get(dolazak.izTankId);
        if (!izvor) continue;

        for (const u of izvor.values()) {
          dodaj(
            nova,
            u.radnjaId,
            u.izvorniTankId,
            (u.udio * dolazak.ml) / poslijeMl
          );
        }
      }

      noviUdjeli.set(ciljId, nova);
    }

    // 3) Tek sada se stanja mijenjaju.
    for (const [ciljId, dolasci] of ulazi) {
      const usloMl = dolasci.reduce((z, x) => z + x.ml, 0);
      litreMl.set(ciljId, (litreMl.get(ciljId) ?? 0) + usloMl);
    }

    for (const [ciljId, nova] of noviUdjeli) {
      udjeli.set(ciljId, nova);
    }
  }

  const stanje = new Map<string, StanjeTanka>();

  for (const [tankId, ml] of litreMl) {
    if (ml <= 0) continue;

    stanje.set(tankId, {
      tankId,
      litre: ml / 1000,
      udjeli: Array.from(udjeli.get(tankId)?.values() ?? []).sort(
        (a, b) => b.udio - a.udio
      ),
    });
  }

  // Tank koji ima udjele, a knjiga za njega ne zna nista (radnja upisana na
  // tank bez ijednog kretanja), svejedno mora biti vidljiv — inace bi backfill
  // takvu radnju tiho izgubio.
  for (const [tankId, m] of udjeli) {
    if (stanje.has(tankId) || m.size === 0) continue;

    stanje.set(tankId, {
      tankId,
      litre: 0,
      udjeli: Array.from(m.values()).sort((a, b) => b.udio - a.udio),
    });
  }

  return { stanje, biljeske };
}

/**
 * Udio vina BEZ ZAPISA, u postocima, za jedan skup udjela.
 *
 * Prikaz ga mora pokazati kad postoji: zbroj mora davati 100 %, inace
 * "Uvaferm 33 % · Sensy 19 %" izgleda kao da je racun negdje pojeo 48 %.
 * Kad zbroj prijedje 100 % (dva kvasca u istoj sarzi), vraca 0 — nedostatka
 * nema, pa se nista ne prikazuje.
 */
export function bezZapisa(udjeli: Array<{ udio: number }>): number {
  const zbroj = udjeli.reduce((z, u) => z + u.udio, 0);
  return Math.max(0, 1 - zbroj) * 100;
}

/** Postotak zaokruzen na cijeli broj, za prikaz. */
export function upostotcima(udio: number): number {
  return Math.round(udio * 100);
}
