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
  dogodenoAt: Date;
  /** Cin na koji je kretanje vezano — sva kretanja istog cina su istovremena. */
  pretokId: string | null;
  zadatakId: string | null;
  izlazVinaId: string | null;
  punjenjeId: string | null;
};

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
 * Cin je skup kretanja koja su se dogodila ISTOVREMENO. Pretok iz tri izvora
 * u dva cilja je jedan cin: kad bi se njegova kretanja primjenjivala jedno po
 * jedno, drugi bi cilj racunao razrjedenje nad vec promijenjenim izvorom i
 * rezultat bi ovisio o redoslijedu redaka u tablici.
 */
function kljucCina(k: Kretanje): string {
  return (
    k.pretokId ?? k.zadatakId ?? k.izlazVinaId ?? k.punjenjeId ?? `sam:${k.id}`
  );
}

type Cin = { kljuc: string; kada: number; kretanja: Kretanje[] };

function grupirajUCine(kretanja: Kretanje[]): Cin[] {
  const mapa = new Map<string, Cin>();

  for (const k of kretanja) {
    const kljuc = kljucCina(k);
    const kada = k.dogodenoAt.getTime();
    const postojeci = mapa.get(kljuc);

    if (postojeci) {
      postojeci.kretanja.push(k);
      // Cin se dogodio kad je POCEO. Redci jednog pretoka nastaju u istoj
      // transakciji, ali `dogodenoAt` im se zna razlikovati za milisekundu.
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

type Dogadjaj =
  | { kada: number; red: 0; cin: Cin }
  | { kada: number; red: 1; radnja: RadnjaULancu };

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
): Map<string, StanjeTanka> {
  const litreMl = new Map<string, number>();
  const udjeli = new Map<string, Map<string, UdioRadnje>>();

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
    ...cini.map((cin) => ({ kada: cin.kada, red: 0 as const, cin })),
    ...radnje.map((r) => ({
      kada: r.createdAt.getTime(),
      red: 1 as const,
      radnja: r,
    })),
  ];

  // Kretanje ide PRIJE radnje iste vremenske oznake (`red` 0 prije 1). Razlog:
  // radnja upisana u istoj transakciji s pretokom (izvrsenje zadatka koje vino
  // i premjesta i tretira) opisuje vino KAKVO JE NAKON premjestanja. Obrnut
  // redoslijed pripisao bi je izvoru, iz kojeg je vino vec otislo.
  crta.sort((a, b) => a.kada - b.kada || a.red - b.red);

  for (const d of crta) {
    if (d.red === 1) {
      // Radnja vrijedi za sve vino koje je u tom trenutku u tanku.
      dodaj(uzmi(d.radnja.tankId), d.radnja.id, d.radnja.tankId, 1);
      continue;
    }

    const { cin } = d;

    // 1) Sto u koji tank ULAZI, i odakle.
    const ulazi = new Map<
      string,
      Array<{ izTankId: string | null; ml: number }>
    >();
    const izlazi = new Map<string, number>();

    for (const k of cin.kretanja) {
      const ml = uMl(k.litre);
      if (ml <= 0) continue;

      if (k.uTankId) {
        const p = ulazi.get(k.uTankId) ?? [];
        p.push({ izTankId: k.izTankId, ml });
        ulazi.set(k.uTankId, p);
      }

      if (k.izTankId) {
        izlazi.set(k.izTankId, (izlazi.get(k.izTankId) ?? 0) + ml);
      }
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

    for (const [izvorId, ml] of izlazi) {
      const ostatak = (litreMl.get(izvorId) ?? 0) - ml;

      // Tank ispraznjen do kraja gubi svoje udjele: vino koje je nosilo te
      // radnje je otislo. Ostavljeni bi se zalijepili na sljedece vino koje u
      // taj tank udje. Isti razlog zbog kojeg postoji granica arhive.
      if (ostatak <= 0) {
        litreMl.set(izvorId, 0);
        udjeli.delete(izvorId);
      } else {
        litreMl.set(izvorId, ostatak);
      }
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

  return stanje;
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
