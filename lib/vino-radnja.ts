import type { Prisma, VrstaRadnje } from "@prisma/client";
import { odigrajLanac } from "@/lib/vino-lanac";

type Tx = Prisma.TransactionClient;

/**
 * UPIS I SELIDBA `VinoRadnja` ZAPISA.
 * ======================================================================
 *
 * `Radnja` opisuje POSUDU (gdje je netko stajao), `VinoRadnja` opisuje VINO
 * (sto je to vino dobilo, ma gdje danas bilo). Ovaj modul je jedino mjesto
 * koje `VinoRadnja` pise — pet mjesta koja pisu `Radnja` i pet koja vino
 * premjestaju zovu njegove funkcije, nijedno ne slaze `create` samo.
 *
 * PRAVILO UDJELA, isto kao u lib/vino-lanac.ts:
 *   - radnja upisana u tanku vrijedi za sve vino koje je tada u njemu -> 1
 *   - kad vino ULAZI, sve se razrjeduje omjerom V_prije / V_poslije
 *   - ono sto dolazi iz izvora ulazi vec razrijedeno: udio_izvora * L / V_poslije
 *   - kad vino ODLAZI, udjeli se NE MIJENJAJU (odlazi presjek sadrzaja)
 *
 * ZASTO SE PRI SELIDBI BRISE PA PISE, umjesto upserta redak po redak:
 * cuvée od pet izvora u tank koji vec ima vino zna dati sedamdesetak redaka,
 * a svaki bi upsert bio zaseban round trip unutar transakcije. Ovako su to
 * dva upita. Redci su IZVEDENI — na njih ne pokazuje nijedan strani kljuc —
 * pa se smiju prepisati; `createdAt` se pritom prenosi, da redak koji je u
 * tanku vec bio ne izgleda kao da je nastao danas.
 *
 * NIKAD Promise.all: sve ide redom. Usporedni upiti nad jednom transakcijskom
 * vezom su tocno ono sto pg@9 odbija (vidi lib/paralelno.ts).
 */

/** Sve sto jedan `VinoRadnja` redak nosi, bez tanka u kojem trenutno lezi. */
type Sadrzaj = {
  izvornaRadnjaId: string;
  izvorniTankId: string;
  izvorniBrojTanka: number | null;
  preparatId: string | null;
  preparatNaziv: string | null;
  jedinicaNaziv: string | null;
  korisnikIme: string | null;
  vrsta: VrstaRadnje;
  opis: string | null;
  napomena: string | null;
  kolicina: number | null;
  jeKvasac: boolean;
  dogodenoAt: Date;
  createdAt: Date;
};

export type NovaVinoRadnja = {
  /** `Radnja` koja je upravo nastala — njezin id je kljuc deduplikacije. */
  radnjaId: string;
  /** Tank u kojem redak lezi, dakle gdje je vino DANAS. */
  tankId: string;
  /**
   * Tank u kojem je cin STVARNO izveden, kad to nije `tankId`. Filtracija
   * radnju upisuje na izvorni tank, a vino je vec u ciljevima — ondje redak
   * mora reci "(T17)", ne ime tanka u kojem sada lezi.
   */
  izvorniTankId?: string;
  /**
   * Koliki dio danasnjeg volumena `tankId` je ovaj cin zahvatio. Zadano 1:
   * radnja izvedena u tanku vrijedi za sve vino koje je tada u njemu. Manje od
   * 1 salje samo filtracija, ciji cilj uz filtrirano vino ima i svoje.
   */
  udio?: number;
  vrsta: VrstaRadnje;
  opis?: string | null;
  napomena?: string | null;
  kolicina?: number | null;
  dogodenoAt: Date;
  preparatId?: string | null;
  jedinicaId?: string | null;
  korisnikId?: string | null;
  /**
   * Vec poznata imena. Sto se posalje, ne dohvaca se iz baze — pozivatelj
   * koji preparat ionako ima u ruci (izvrsenje zadatka) ne placa dodatni upit.
   */
  imena?: {
    brojTanka?: number | null;
    preparatNaziv?: string | null;
    jeKvasac?: boolean;
    jedinicaNaziv?: string | null;
    korisnikIme?: string | null;
  };
};

/**
 * Dopisi `VinoRadnja` uz upravo nastalu `Radnja`.
 *
 * Udio je 1: radnja izvedena u tanku vrijedi za sve vino koje je tada u njemu.
 *
 * `Radnja` se pise PRVA i ostaje mjerodavna — ako se ovdje ista slomi, slomit
 * ce se cijela transakcija, pa dvije tablice ne mogu razici.
 */
export async function upisiVinoRadnju(tx: Tx, n: NovaVinoRadnja): Promise<void> {
  const imena = n.imena ?? {};
  const izvorniTankId = n.izvorniTankId ?? n.tankId;
  const udio = n.udio ?? 1;

  if (udio <= 0) return;

  let brojTanka = imena.brojTanka ?? null;
  let preparatNaziv = imena.preparatNaziv ?? null;
  let jeKvasac = imena.jeKvasac ?? false;
  let jedinicaNaziv = imena.jedinicaNaziv ?? null;
  let korisnikIme = imena.korisnikIme ?? null;

  if (brojTanka === null) {
    const t = await tx.tank.findUnique({
      where: { id: izvorniTankId },
      select: { broj: true },
    });
    brojTanka = t?.broj ?? null;
  }

  if (n.preparatId && preparatNaziv === null) {
    const p = await tx.preparation.findUnique({
      where: { id: n.preparatId },
      select: { naziv: true, jeKvasac: true },
    });
    preparatNaziv = p?.naziv ?? null;
    // PREPISUJE SE, ne spaja naknadno: gasenje oznake u katalogu ne smije
    // unatrag promijeniti povijest fermentacije.
    jeKvasac = p?.jeKvasac ?? false;
  }

  if (n.jedinicaId && jedinicaNaziv === null) {
    const j = await tx.unit.findUnique({
      where: { id: n.jedinicaId },
      select: { naziv: true },
    });
    jedinicaNaziv = j?.naziv ?? null;
  }

  if (n.korisnikId && korisnikIme === null) {
    const k = await tx.user.findUnique({
      where: { id: n.korisnikId },
      select: { ime: true },
    });
    korisnikIme = k?.ime ?? null;
  }

  await tx.vinoRadnja.create({
    data: {
      tankId: n.tankId,
      izvornaRadnjaId: n.radnjaId,
      izvorniTankId,
      izvorniBrojTanka: brojTanka,
      preparatId: n.preparatId ?? null,
      preparatNaziv,
      jedinicaNaziv,
      korisnikIme,
      vrsta: n.vrsta,
      opis: n.opis ?? null,
      napomena: n.napomena ?? null,
      kolicina: n.kolicina ?? null,
      jeKvasac,
      udio,
      dogodenoAt: n.dogodenoAt,
    },
  });
}

/**
 * SNIMKA REDAKA IZVORA, uzeta PRIJE nego se izvori diraju.
 *
 * Redoslijed u pretoku i filtraciji je: prvo se obrade izvori (onaj koji padne
 * na nulu se ARHIVIRA, a arhiviranje mu brise `VinoRadnja`), pa tek onda
 * ciljevi. Kad bi cilj svoje retke citao iz baze u svom koraku, od izvora koji
 * se ispraznio ne bi zatekao nista — a to je najcesci pretok od svih.
 *
 * Zato pozivatelj snimi izvore na pocetku i snimku prosljedi ciljevima.
 */
/** Redak snimke: sadrzaj plus udio koji je u tom tanku imao. */
export type RedakSnimke = Sadrzaj & { udio: number };

export type Snimka = Map<string, RedakSnimke[]>;

export async function snimiVinoRadnje(
  tx: Tx,
  tankIds: string[]
): Promise<Snimka> {
  const snimka: Snimka = new Map();
  const jedinstveni = Array.from(new Set(tankIds));

  if (jedinstveni.length === 0) return snimka;

  // Jedan upit za sve izvore. `in` je ovdje jeftiniji od N upita u
  // transakciji, a izvora zna biti pet (cuvée).
  const redci = await tx.vinoRadnja.findMany({
    where: { tankId: { in: jedinstveni } },
  });

  for (const t of jedinstveni) snimka.set(t, []);

  for (const r of redci) {
    snimka.get(r.tankId)!.push(r);
  }

  return snimka;
}

/** Jedan dolazak vina u tank: iz kojeg tanka i koliko mililitara. */
export type Dolazak = { izvorTankId: string; ml: number };

export type Ulaz = {
  ciljTankId: string;
  /** Stanje cilja PRIJE cina, u mililitrima. */
  ciljPrijeMl: number;
  /** Vino koje dolazi iz drugih tankova. */
  dolasci?: Dolazak[];
  /** Snimka izvora; obavezna cim ima dolazaka. */
  snimka?: Snimka;
  /** Vino koje dolazi izvan podruma (berba, punjenje) — samo razrjeduje. */
  izvanaMl?: number;
};

/**
 * Vino je uslo u tank: prenesi radnje izvora i razrijedi sve udjele.
 *
 * Zove se JEDNOM po ciljnom tanku i cinu, s POPISOM svih dolazaka. Poziv po
 * dolasku bio bi kriv: drugi bi racunao razrjedenje nad vec uvecanim
 * volumenom, pa bi rezultat ovisio o redoslijedu izvora.
 *
 * DEDUPLIKACIJA. Ista izvorna radnja moze u cilj doci kroz vise izvora
 * (cuvée). Redak ostaje JEDAN, kljuc je `izvornaRadnjaId`, a udjeli se
 * ZBRAJAJU — 30 % iz izvora koji je bio 100 % i 20 % iz izvora koji je bio
 * 50 % daju 40 %. Odbacivanje po sadrzaju bi ovdje dalo 30 % i tiho pojelo
 * desetinu.
 */
export async function prenesiVinoRadnje(tx: Tx, u: Ulaz): Promise<void> {
  const dolasci = (u.dolasci ?? []).filter((d) => d.ml > 0);
  const izvanaMl = Math.max(0, u.izvanaMl ?? 0);
  const usloMl = dolasci.reduce((z, d) => z + d.ml, 0) + izvanaMl;
  const prijeMl = Math.max(0, u.ciljPrijeMl);
  const poslijeMl = prijeMl + usloMl;

  if (poslijeMl <= 0) return;
  if (usloMl <= 0) return; // nista nije uslo, nema se sto razrijediti

  const spojeni = new Map<string, Sadrzaj & { udio: number }>();

  const dodaj = (s: Sadrzaj, udio: number) => {
    if (udio <= 0) return;
    const p = spojeni.get(s.izvornaRadnjaId);

    if (p) {
      p.udio += udio;
      // Prvi put zabiljezen `createdAt` je stariji i ostaje.
      if (s.createdAt < p.createdAt) p.createdAt = s.createdAt;
      return;
    }

    spojeni.set(s.izvornaRadnjaId, { ...s, udio });
  };

  // 1) Sto je u cilju vec bilo — razrijedeno.
  if (prijeMl > 0) {
    const zatecene = await tx.vinoRadnja.findMany({
      where: { tankId: u.ciljTankId },
    });

    for (const r of zatecene) {
      dodaj(r, (r.udio * prijeMl) / poslijeMl);
    }
  }

  // 2) Sto dolazi — udio u izvoru, skaliran doslim litrama. Iz snimke, ne iz
  //    baze: izvor je do ovog trenutka mozda vec arhiviran.
  for (const d of dolasci) {
    for (const r of u.snimka?.get(d.izvorTankId) ?? []) {
      dodaj(r, (r.udio * d.ml) / poslijeMl);
    }
  }

  // 3) Prepisi. Dva upita umjesto upserta redak po redak.
  await tx.vinoRadnja.deleteMany({ where: { tankId: u.ciljTankId } });

  if (spojeni.size === 0) return;

  await tx.vinoRadnja.createMany({
    data: Array.from(spojeni.values()).map((s) => ({
      tankId: u.ciljTankId,
      izvornaRadnjaId: s.izvornaRadnjaId,
      izvorniTankId: s.izvorniTankId,
      izvorniBrojTanka: s.izvorniBrojTanka,
      preparatId: s.preparatId,
      preparatNaziv: s.preparatNaziv,
      jedinicaNaziv: s.jedinicaNaziv,
      korisnikIme: s.korisnikIme,
      vrsta: s.vrsta,
      opis: s.opis,
      napomena: s.napomena,
      kolicina: s.kolicina,
      jeKvasac: s.jeKvasac,
      udio: s.udio,
      dogodenoAt: s.dogodenoAt,
      createdAt: s.createdAt,
    })),
  });
}

/**
 * Tank je ispraznjen: vino koje je nosilo te radnje je otislo.
 *
 * Bez ovoga bi se zaostali redci zalijepili na sljedece vino koje u tank
 * udje — isti razlog zbog kojeg postoji granica arhive. Zove se svugdje gdje
 * tank padne na nulu (arhiviranje, zavrsni izlaz, filtracija koja isprazni
 * izvor).
 */
export async function ocistiVinoRadnje(tx: Tx, tankId: string): Promise<void> {
  await tx.vinoRadnja.deleteMany({ where: { tankId } });
}

/**
 * PONISTAVANJE: preracunaj zadane tankove iz knjige.
 *
 * Zasto se ne racuna unatrag. Ulaz spaja dva skupa u jedan
 * (`udio_novi = udio_cilja * V_prije/V_poslije + udio_izvora * L/V_poslije`) i
 * iz rezultata se vise ne vidi koji je pribrojnik ciji. Da bi se ponistio,
 * trebalo bi cuvati snimku izvora uz svaki pretok — jos jedna tablica koja
 * moze odlutati od knjige, tocno ono cega se `BerbaKretanje` rijesio.
 *
 * `VinoRadnja` je IZVEDENA iz `Radnja` i knjige, a ponistavanje je u knjigu
 * vec upisalo protustavku (PONISTENJE). Zato se odigra povijest iznova i
 * prepisu samo pogodjeni tankovi. Rezultat je tocan po definiciji i usput
 * ispravlja svaki raniji drift.
 *
 * CIJENA: dva citanja cijele knjige i svih radnji (527 + 279 redaka,
 * 09.09.2026). To je jeftino i ostat ce jeftino jos godinama — knjiga raste
 * nekoliko stotina redaka po sezoni. Kad prestane biti jeftino, zamjena je
 * snimka izvora uz pretok, ne pola-pola.
 */
export async function preracunajVinoRadnje(
  tx: Tx,
  tankIds: string[]
): Promise<void> {
  const jedinstveni = Array.from(new Set(tankIds));
  if (jedinstveni.length === 0) return;

  const kretanja = await tx.berbaKretanje.findMany({
    select: {
      id: true,
      izTankId: true,
      uTankId: true,
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

  const radnje = await tx.radnja.findMany({
    select: {
      id: true,
      tankId: true,
      createdAt: true,
      vrsta: true,
      opis: true,
      napomena: true,
      kolicina: true,
      preparatId: true,
      preparat: { select: { naziv: true, jeKvasac: true } },
      jedinica: { select: { naziv: true } },
      korisnik: { select: { ime: true } },
    },
  });

  const poRadnji = new Map(radnje.map((r) => [r.id, r]));

  const brojevi = new Map(
    (
      await tx.tank.findMany({ select: { id: true, broj: true } })
    ).map((t) => [t.id, t.broj])
  );

  const { stanje } = odigrajLanac(
    kretanja,
    radnje.map((r) => ({ id: r.id, tankId: r.tankId, createdAt: r.createdAt }))
  );

  for (const tankId of jedinstveni) {
    await tx.vinoRadnja.deleteMany({ where: { tankId } });

    const udjeli = stanje.get(tankId)?.udjeli ?? [];
    if (udjeli.length === 0) continue;

    const data = [];

    for (const u of udjeli) {
      const r = poRadnji.get(u.radnjaId);
      if (!r) continue;

      data.push({
        tankId,
        izvornaRadnjaId: r.id,
        izvorniTankId: u.izvorniTankId,
        izvorniBrojTanka: brojevi.get(u.izvorniTankId) ?? null,
        preparatId: r.preparatId,
        preparatNaziv: r.preparat?.naziv ?? null,
        jedinicaNaziv: r.jedinica?.naziv ?? null,
        korisnikIme: r.korisnik?.ime ?? null,
        vrsta: r.vrsta,
        opis: r.opis,
        napomena: r.napomena,
        kolicina: r.kolicina,
        jeKvasac: r.preparat?.jeKvasac ?? false,
        udio: u.udio,
        dogodenoAt: r.createdAt,
      });
    }

    if (data.length > 0) {
      await tx.vinoRadnja.createMany({ data });
    }
  }
}
