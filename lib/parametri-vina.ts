import type { Prisma } from "@prisma/client";
import {
  praznjenjaPosuda,
  satKretanja,
  type Praznjenja,
} from "@/lib/sat-knjige";
import { izracunajGranicuVina, type RedakZaGranicu } from "@/lib/granica-vina";
import { stanjeTanka } from "@/lib/berba-model";
import { POLJA_MJERENJA } from "@/lib/mjerenja";

/**
 * PARAMETRI VINA IZ KNJIGE — zadnja mjerena vrijednost koja pripada vinu
 * koje je u tanku SADA, ma u kojoj posudi bila izmjerena.
 * ======================================================================
 *
 * ZASTO POSTOJI. Tank 15 i tank 32 nisu imali ni alkohol ni kiseline, a
 * vlasnik tvrdi da su ta vina mjerena — i jest: `ArhivaVinaMjerenje` tanka 8
 * od 18.06.2026. nosi alkohol 11,3 i kiseline 6,3. Nijedan dosadasnji citac
 * do toga nije mogao doci:
 *
 *   - `vrijednostiTankaPoPolju` gleda SAMO ovaj tank, od granice vina nadalje;
 *   - `parametriBlenda` ide po `BlendIzvor` pokazivacima, a oni na T15 vode na
 *     tank 5, ne na arhivu tanka 8.
 *
 * Knjiga zna ono sto ni jedno ni drugo: da je bas to vino bilo u tanku 8 do
 * 18.08., kad je preslo ovamo.
 *
 * PRAVILO KOJE SE OVDJE PROVODI (vlasnikova odluka, 11.09.2026):
 * mjerenje POSUDE u kojoj je partija bila vrijedi za tu partiju — i kad je
 * posuda uz nju drzala jos vina. Prozor je zato PUNJENJE posude, ne samo
 * vrijeme u kojem je bas ta partija bila unutra: tank 8 je mjeren 18.06., a
 * partija koja danas stoji u tanku 15 pridruzila mu se kasnije, unutar istog
 * punjenja. Uze pravilo to mjerenje ne bi naslo, a ono opisuje tijelo vina u
 * koje se partija ulila.
 *
 * GORNJA GRANICA JE ODLAZAK. Mjerenja tanka 8 od 03.09. i 08.09. NE ulaze:
 * partija je otisla 18.08., pa je to vec vino koje je u tank 8 doslo poslije.
 *
 * SAMO STVARNI LANAC (vlasnikova odluka, 11.09.2026). Posuda ulazi samo ako je
 * vino iz nje doslo ovamo — izravno ili preko drugih posuda. SESTRINSKA posuda
 * ispada: partija 018/2026 je iz punjenja razdijeljena u T20, T36 i T2, a u
 * tank 11 je dosla samo iz T36. Bez ove brane T11 je pokazivao alkohol 11,3 i
 * SO2 40/86 izmjerene u T2 16.06. — na vinu koje je flasirano 25.06., gotovo
 * tri mjeseca prije nego je partija 018 ubrana. Prozor punjenja (pravilo iznad)
 * vrijedi i dalje, ali samo za posude iz stvarnog lanca.
 *
 * PONDER JE LITRA. Kad dvije partije daju razlicitu vrijednost istog polja,
 * racuna se prosjek ponderiran litrama koje SU U OVOM TANKU — nikad obican
 * prosjek. Pokrivenost kaze koliko je litara uopce pokriveno.
 *
 * STO OVO NIJE: nije mjerenje ovog tanka i ne predstavlja se kao takvo.
 * Prikaz uz svaku vrijednost nosi datum i posudu u kojoj je mjerena.
 */

// Cijeli transakcijski klijent: `stanjeTanka` trazi `$queryRaw`, a ovdje se
// citaju cetiri tablice. `PrismaClient` mu je pridruziv, pa stranica salje
// obicni `prisma`.
type Klijent = Prisma.TransactionClient;

type Polje = (typeof POLJA_MJERENJA)[number];

/** Odakle jedna vrijednost dolazi — posuda i trenutak. */
export type IzvorVrijednosti = {
  tankId: string;
  brojTanka: number | null;
  izmjerenoAt: Date;
  vrijednost: number;
  /** Je li nadjena u arhivi ili u zivoj tablici mjerenja. */
  izArhive: boolean;
  /** Litre partije kojoj ta vrijednost pripada, u OVOM tanku. */
  litre: number;
};

export type PoljeVina = {
  /** Prosjek ponderiran litrama u ovom tanku. */
  vrijednost: number;
  pokrivenoL: number;
  ukupnoL: number;
  postotak: number;
  /** Najnoviji trenutak medju doprinosima. */
  najnovijeAt: Date;
  izvori: IzvorVrijednosti[];
};

/** Jedna tocka na grafu — mjerenje ovog vina, bilo u kojoj posudi. */
export type TockaVina = {
  izmjerenoAt: Date;
  vrijednost: number;
  brojTanka: number | null;
  /** Je li mjereno u OVOM tanku ili u nekoj ranijoj posudi. */
  vlastito: boolean;
  /**
   * Koliko litara danasnjeg vina ta tocka opisuje, i koliki je to udio.
   *
   * Treba jer vino u tanku obicno nije jedna partija nego desetak, a svaka je
   * prosla kroz svoju posudu. Bez ove mjere graf tanka 5 dobiva 91 tocku iz
   * 16 posuda — to nisu koraci istog vina nego paralelne posude u kojima su
   * mu partije usput boravile, svaka sa svojom krivuljom.
   */
  litre: number;
  postotak: number;
};

export type ParametriVina = {
  poPolju: Partial<Record<Polje, PoljeVina>>;
  /**
   * SVA mjerenja ovog vina kroz SVE posude, po polju, poredana po vremenu.
   *
   * Graf je dosad crtao samo mjerenja s ovog tanka — isti rascjep koji je faza
   * D zatvorila za granicu i za berbu. Vino koje je pola zivota provelo u
   * drugoj posudi ondje je i mjereno, pa mu krivulja bez tih tocaka pocinje
   * usred price.
   *
   * Tocke nose broj posude, da se vidi gdje je koja izmjerena.
   */
  niz: Partial<Record<Polje, TockaVina[]>>;
  ukupnoL: number;
};

/** Jedan boravak partije u jednoj posudi. */
type Boravak = { tankId: string; odMs: number; doMs: number };

/**
 * Gdje je sve partija bila i kad — iz knjige, bez ijednog pokazivaca.
 *
 * Prati se stanje po posudama: kad u posudi prvi put ima nesto, boravak
 * pocinje; kad padne na nulu, zavrsava. Partija koja je jos u posudi ima
 * otvoren boravak do sada.
 */
function boravciPartije(
  redci: RedakZaGranicu[],
  praznjenja: Praznjenja
): Boravak[] {
  const poredani = redci
    .map((r) => ({ ...r, sat: satKretanja(r, praznjenja) }))
    .sort((a, b) => a.sat - b.sat);

  const ml = new Map<string, number>();
  const otvoreni = new Map<string, number>();
  const out: Boravak[] = [];
  const uMl = (l: number) => Math.round(Number(l) * 1000);

  for (const r of poredani) {
    if (r.uTankId) {
      const prije = ml.get(r.uTankId) ?? 0;
      ml.set(r.uTankId, prije + uMl(r.litre));
      if (prije <= 0) otvoreni.set(r.uTankId, r.sat);
    }
    if (r.izTankId) {
      const prije = ml.get(r.izTankId) ?? 0;
      const sad = prije - uMl(r.litre);
      ml.set(r.izTankId, sad);
      if (sad <= 0 && otvoreni.has(r.izTankId)) {
        out.push({ tankId: r.izTankId, odMs: otvoreni.get(r.izTankId)!, doMs: r.sat });
        otvoreni.delete(r.izTankId);
      }
    }
  }

  for (const [tankId, odMs] of otvoreni) {
    out.push({ tankId, odMs, doMs: Date.now() });
  }

  return out;
}

/**
 * Posude iz kojih je partija STVARNO dosla u tank — izravno ili preko drugih.
 *
 * Hod unatrag po prijenosima iste partije: iz tanka do posuda koje su mu je
 * dale, pa do posuda koje su dale njima, i tako dalje. Svaka posuda nosi
 * trenutak u kojem je vino iz nje otislo prema tanku, pa se prijenos U nju
 * poslije tog trenutka ne broji — to vino ovamo nije stiglo.
 *
 * Posuda u koju je partija samo usput razdijeljena, a iz nje nista nije doslo
 * ovamo, ne ulazi.
 */
function stvarniLanac(
  tankId: string,
  redci: RedakZaGranicu[],
  praznjenja: Praznjenja
): Set<string> {
  const prijenosi = redci
    .filter((r) => r.izTankId && r.uTankId)
    .map((r) => ({ iz: r.izTankId!, u: r.uTankId!, sat: satKretanja(r, praznjenja) }));

  // Najkasniji trenutak u kojem je vino iz posude jos moglo krenuti prema
  // tanku. Posuda se ponovno obilazi samo kad joj taj trenutak naraste, pa
  // hod staje i kad knjiga ima kruzni pretok (A -> B -> A).
  const doKada = new Map<string, number>([[tankId, Infinity]]);
  const red = [tankId];

  while (red.length > 0) {
    const posuda = red.shift()!;
    const granica = doKada.get(posuda)!;

    for (const p of prijenosi) {
      if (p.u !== posuda || p.sat > granica) continue;
      if ((doKada.get(p.iz) ?? -Infinity) >= p.sat) continue;
      doKada.set(p.iz, p.sat);
      red.push(p.iz);
    }
  }

  return new Set(doKada.keys());
}

export async function parametriVinaIzKnjige(
  db: Klijent,
  tankId: string
): Promise<ParametriVina | null> {
  const stanje = await stanjeTanka(db, tankId);
  if (stanje.length === 0) return null;

  const ukupnoL = Number(stanje.reduce((z, s) => z + s.litre, 0).toFixed(3));
  const berbaIds = stanje.map((s) => s.berbaId);

  // Kretanja SVIH partija koje su danas ovdje — jedan upit.
  const kretanjaPartija = await db.berbaKretanje.findMany({
    where: { berbaId: { in: berbaIds } },
    select: {
      id: true,
      berbaId: true,
      uTankId: true,
      izTankId: true,
      litre: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });

  const poPartiji = new Map<string, RedakZaGranicu[]>();
  for (const k of kretanjaPartija) {
    const popis = poPartiji.get(k.berbaId) ?? [];
    popis.push(k);
    poPartiji.set(k.berbaId, popis);
  }

  // KRETANJA POSUDA SE CITAJU PRIJE RACUNA, a ne poslije njega.
  //
  // Donja brana sata (lib/sat-knjige.ts) trazi kad je posuda bila prazna, a to
  // se ne moze znati iz redaka JEDNE partije — treba cijeli promet te posude.
  // Zato se upit koji je dosad sluzio samo za pocetak punjenja radi ranije i
  // sirim filtrom (sve posude koje se pojavljuju u kretanjima partija, a ne
  // samo one koje prezive stvarni lanac). Broj upita je isti.
  const kandidati = new Set<string>();
  for (const k of kretanjaPartija) {
    if (k.uTankId) kandidati.add(k.uTankId);
    if (k.izTankId) kandidati.add(k.izTankId);
  }
  kandidati.add(tankId);

  const kretanjaPosuda = await db.berbaKretanje.findMany({
    where: {
      OR: [
        { uTankId: { in: [...kandidati] } },
        { izTankId: { in: [...kandidati] } },
      ],
    },
    select: {
      id: true,
      uTankId: true,
      izTankId: true,
      litre: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });

  const praznjenja = praznjenjaPosuda(kretanjaPosuda);

  const boravci = new Map<string, Boravak[]>();
  const posude = new Set<string>();
  for (const [berbaId, redci] of poPartiji) {
    // Samo boravci u posudama iz stvarnog lanca — sestrinske posude se ne
    // citaju ni za mjerenja ni za graf.
    const izvorne = stvarniLanac(tankId, redci, praznjenja);
    const b = boravciPartije(redci, praznjenja).filter((x) =>
      izvorne.has(x.tankId)
    );
    boravci.set(berbaId, b);
    for (const x of b) posude.add(x.tankId);
  }

  if (posude.size === 0) return null;

  const punjenjaIds = [
    ...new Set(kretanjaPosuda.map((k) => k.punjenjeId).filter(Boolean)),
  ] as string[];
  const datumiPunjenja = new Map<string, Date>(
    punjenjaIds.length > 0
      ? (
          await db.punjenjeTanka.findMany({
            where: { id: { in: punjenjaIds } },
            select: { id: true, datumPunjenja: true },
          })
        ).map((p) => [p.id, p.datumPunjenja])
      : []
  );

  // Mjerenja svih posuda odjednom — dva upita, ne dva po boravku.
  const imaPolje = POLJA_MJERENJA.map((p) => ({ [p]: { not: null } }));
  const [ziva, arhivska] = await Promise.all([
    db.mjerenje.findMany({
      where: { tankId: { in: [...posude] }, OR: imaPolje as never },
      select: {
        id: true,
        tankId: true,
        izmjerenoAt: true,
        alkohol: true,
        ukupneKiseline: true,
        hlapiveKiseline: true,
        slobodniSO2: true,
        ukupniSO2: true,
        secer: true,
        ph: true,
        temperatura: true,
      },
    }),
    db.arhivaVinaMjerenje.findMany({
      where: { tankId: { in: [...posude] }, OR: imaPolje as never },
      select: {
        id: true,
        tankId: true,
        izmjerenoAt: true,
        alkohol: true,
        ukupneKiseline: true,
        hlapiveKiseline: true,
        slobodniSO2: true,
        ukupniSO2: true,
        secer: true,
        ph: true,
        temperatura: true,
      },
    }),
  ]);

  const svaMjerenja = [
    ...ziva.map((m) => ({ ...m, izArhive: false })),
    ...arhivska.map((m) => ({ ...m, izArhive: true })),
  ];

  // Brojevi posuda — prikaz uz vrijednost kaze GDJE je mjereno.
  const brojPoTanku = new Map<string, number | null>(
    (
      await db.tank.findMany({
        where: { id: { in: [...posude] } },
        select: { id: true, broj: true },
      })
    ).map((t) => [t.id, t.broj])
  );

  // Pocetak punjenja posude u trenutku kad je partija bila u njoj.
  const pocetakPunjenja = (tankIdPosude: string, uTrenutku: number) => {
    const redci = kretanjaPosuda.filter(
      (k) => k.uTankId === tankIdPosude || k.izTankId === tankIdPosude
    );
    const g = izracunajGranicuVina(
      tankIdPosude,
      redci,
      datumiPunjenja,
      new Date(uTrenutku),
      true
    );
    return g.odAt ? g.odAt.getTime() : null;
  };

  const skupljeno = new Map<Polje, IzvorVrijednosti[]>();

  // Sve tocke za graf. Kljuc je (mjerenje, polje) jer isto mjerenje pokriva
  // vise partija koje su dijelile posudu — bez toga bi tocka bila nacrtana
  // onoliko puta koliko partija je tada bilo unutra.
  const tocke = new Map<Polje, Map<string, TockaVina>>();

  for (const s of stanje) {
    // Po partiji: NAJNOVIJA vrijednost svakog polja kroz sve njezine posude.
    const najnovije = new Map<Polje, IzvorVrijednosti>();

    // SAMO ONO STO JE BILO PRIJE DOLASKA OVAMO.
    //
    // Ista partija (jedan zapis berbe) danas stoji u vise tankova i JOS SE
    // SELI: dio onoga sto je bilo u tanku 8 otisao je 18.08. u tank 15, a
    // drugi dio je 03.09. i 08.09. putovao dalje. Zato se ne moze gledati
    // "je li boravak zatvoren" — boravak u tanku 8 je i danas otvoren.
    //
    // Rez je VRIJEME DOLASKA OVAMO: sve izmjereno poslije toga opisuje vino
    // koje je u toj posudi ostalo ili u nju doslo kasnije, a ne ovo ovdje.
    const sviBoravci = boravci.get(s.berbaId) ?? [];
    const ovdje = sviBoravci.filter((b) => b.tankId === tankId).slice(-1)[0];
    if (!ovdje) continue;

    // Dopustenje od sekunde: izlazak iz prethodne posude i ulazak ovamo dva su
    // retka istog cina i znaju se razlikovati u milisekundama.
    const dolazak = ovdje.odMs + 1000;

    const lanac = sviBoravci
      .filter((b) => b.odMs <= dolazak)
      .map((b) =>
        b.tankId === tankId && b.odMs === ovdje.odMs
          ? b
          : { ...b, doMs: Math.min(b.doMs, dolazak) }
      );

    for (const b of lanac) {
     // Donja granica: pocetak PUNJENJA te posude (vlasnikovo pravilo), a ne
      // tek trenutak kad je bas ova partija usla.
      const odMs = pocetakPunjenja(b.tankId, b.odMs) ?? b.odMs;
      // Gornja granica: kad je partija otisla. Kasnija mjerenja te posude vec
      // opisuju vino koje je u nju doslo poslije.
      const doMs = b.doMs;

      for (const m of svaMjerenja) {
        if (m.tankId !== b.tankId) continue;
        const kad = m.izmjerenoAt.getTime();
        if (kad < odMs || kad > doMs) continue;

        for (const polje of POLJA_MJERENJA) {
          const v = (m as Record<string, unknown>)[polje];
          if (v == null) continue;

          // Ista tocka pokriva sve partije koje su tada dijelile posudu —
          // litre im se ZBRAJAJU, kao i svugdje drugdje.
          const zaGraf = tocke.get(polje) ?? new Map<string, TockaVina>();
          const stara = zaGraf.get(m.id);
          zaGraf.set(m.id, {
            izmjerenoAt: m.izmjerenoAt,
            vrijednost: Number(v),
            brojTanka: brojPoTanku.get(b.tankId) ?? null,
            vlastito: b.tankId === tankId,
            litre: (stara?.litre ?? 0) + s.litre,
            postotak: 0,
          });
          tocke.set(polje, zaGraf);

          const prije = najnovije.get(polje);
          if (prije && prije.izmjerenoAt >= m.izmjerenoAt) continue;

          najnovije.set(polje, {
            tankId: b.tankId,
            brojTanka: brojPoTanku.get(b.tankId) ?? null,
            izmjerenoAt: m.izmjerenoAt,
            vrijednost: Number(v),
            izArhive: m.izArhive,
            litre: s.litre,
          });
        }
      }
    }

    for (const [polje, x] of najnovije) {
      const popis = skupljeno.get(polje) ?? [];
      popis.push(x);
      skupljeno.set(polje, popis);
    }
  }

  if (skupljeno.size === 0 && tocke.size === 0) return null;

  const poPolju: Partial<Record<Polje, PoljeVina>> = {};

  for (const [polje, izvori] of skupljeno) {
    const pokrivenoL = izvori.reduce((z, x) => z + x.litre, 0);
    if (pokrivenoL <= 0) continue;

    const vrijednost =
      izvori.reduce((z, x) => z + x.vrijednost * x.litre, 0) / pokrivenoL;

    const najnovijeAt = izvori
      .map((x) => x.izmjerenoAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    poPolju[polje] = {
      vrijednost: Number(vrijednost.toFixed(3)),
      pokrivenoL: Number(pokrivenoL.toFixed(3)),
      ukupnoL,
      postotak:
        ukupnoL > 0 ? Number(((pokrivenoL / ukupnoL) * 100).toFixed(2)) : 0,
      najnovijeAt,
      izvori: izvori.sort((a, b) => b.litre - a.litre),
    };
  }

  const niz: Partial<Record<Polje, TockaVina[]>> = {};
  for (const [polje, mapa] of tocke) {
    niz[polje] = [...mapa.values()]
      .map((x) => ({
        ...x,
        litre: Number(x.litre.toFixed(3)),
        postotak:
          ukupnoL > 0 ? Number(((x.litre / ukupnoL) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => a.izmjerenoAt.getTime() - b.izmjerenoAt.getTime());
  }

  return { poPolju, niz, ukupnoL };
}
