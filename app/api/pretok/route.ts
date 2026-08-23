export const dynamic = "force-dynamic";

// Vercel prekida funkciju bez obzira na to sto Prisma radi. Ako platforma
// istekne prva, korisnik dobije grubi 504 FUNCTION_INVOCATION_TIMEOUT umjesto
// nase poruke, i ne zna je li pretok prosao ili je ostao napola. Zato gornja
// granica funkcije mora biti OSJETNO veca od Prisminog budzeta:
//   Prisma najgori slucaj = maxWait 5 s + timeout 30 s = 35 s
//   maxDuration           = 60 s
// Prisma tako uvijek istekne prva, s rezervom. 60 s je i najveca vrijednost
// koju dopusta najnizi Vercel plan, pa vrijedi na svakom.
//
// Isti obrazac kao app/api/zadatak/filtracija/izvrsi/route.ts, samo je ovdje
// Prismin budzet veci (30 s umjesto 20 s): pretok koji isprazni izvorni tank
// jos i arhivira cijelu njegovu sezonu — mjerenja, zadatke sa stavkama,
// dokumente i punjenja — pa dosegne nekoliko stotina upita.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { izracunajNoviSastavPretoka } from "@/lib/pretok-sastav";
import {
  blendKojiOstaje,
  jeMjerenjePrazno,
  uLitre,
  uMl,
  NAPOMENA_BEZ_PARAMETARA,
} from "@/lib/filtracija";
import {
  vrijednostiTankaPoPolju,
  rasponDatumaIzvora,
  type IzvorPolja,
} from "@/lib/mjerenja";
import { Prisma, TipPretokaDb } from "@prisma/client";

type UlazPretoka = {
  tankId: string;
  kolicina: number;
};

type MjerenjeWeighted = {
  kolicina: number;
  alkohol: number | null;
  ukupneKiseline: number | null;
  hlapiveKiseline: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  secer: number | null;
  ph: number | null;
  temperatura: number | null;
};

type TankZaSnapshot = {
  id: string;
  broj: number;
  kapacitet: number;
  kolicinaVinaUTanku: number | null;
  tip: string | null;
  opis: string | null;
  sorta: string | null;
  nazivVina: string | null;
  godiste: number | null;
  udjeliSorti: {
    nazivSorte: string;
    postotak: number;
  }[];
  blendIzvori: {
    izvorTankId: string | null;
    izvorArhivaVinaId: string | null;
    nazivVina: string | null;
    sorta: string | null;
    kolicina: number;
    postotak: number;
  }[];
};

type BlendStavkaCalc = {
  izvorTankId: string | null;
  izvorArhivaVinaId: string | null;
  nazivVina: string | null;
  sorta: string | null;
  kolicina: number;
  postotak: number;
};

function weightedAverage(
  stavke: { kolicina: number; value: number | null | undefined }[]
): number | null {
  const valjane = stavke.filter(
    (s) => s.value !== null && s.value !== undefined && s.kolicina > 0
  );

  if (valjane.length === 0) return null;

  const ukupno = valjane.reduce((sum, s) => sum + s.kolicina, 0);
  if (ukupno <= 0) return null;

  const ponderirano = valjane.reduce(
    (sum, s) => sum + s.kolicina * Number(s.value),
    0
  );

  return Number((ponderirano / ukupno).toFixed(3));
}

function round6(n: number) {
  return Number(n.toFixed(6));
}

/**
 * Vrijednosti tanka PO POLJU, ne "zadnji redak mjerenja".
 *
 * Prije je ovdje stajao `findFirst` s `orderBy: izmjerenoAt desc`, pa je pretok
 * uzimao samo ono sto je bilo u zadnjem retku. Kako se SO2 mjeri tjedno, a
 * alkohol/kiseline/secer rijetko, taj je redak gotovo uvijek imao samo SO2 —
 * i pretok bi u ciljni tank upisao mjerenje bez alkohola, iako alkohol na
 * izvoru postoji, samo je stariji. Vidi lib/mjerenja.ts.
 */
async function dohvatiVrijednostiZaTank(tankId: string) {
  return vrijednostiTankaPoPolju(prisma, tankId);
}

function nazivTanka(
  tank: {
    broj: number;
    nazivVina: string | null;
    sorta: string | null;
  }
) {
  return tank.nazivVina ?? tank.sorta ?? `Tank ${tank.broj}`;
}

function normalizirajBlendStavke(
  stavke: Array<{
    izvorTankId: string | null;
    izvorArhivaVinaId: string | null;
    nazivVina: string | null;
    sorta: string | null;
    kolicina: number;
  }>
): BlendStavkaCalc[] {
  const mapa = new Map<string, BlendStavkaCalc>();

  for (const s of stavke) {
    const key = [
      s.izvorTankId ?? "",
      s.izvorArhivaVinaId ?? "",
      s.nazivVina ?? "",
      s.sorta ?? "",
    ].join("||");

    const postojeci = mapa.get(key);

    if (postojeci) {
      postojeci.kolicina = round6(postojeci.kolicina + Number(s.kolicina || 0));
    } else {
      mapa.set(key, {
        izvorTankId: s.izvorTankId ?? null,
        izvorArhivaVinaId: s.izvorArhivaVinaId ?? null,
        nazivVina: s.nazivVina ?? null,
        sorta: s.sorta ?? null,
        kolicina: round6(Number(s.kolicina || 0)),
        postotak: 0,
      });
    }
  }

  const rezultat = Array.from(mapa.values()).filter((s) => s.kolicina > 0);
  const ukupno = rezultat.reduce((sum, s) => sum + s.kolicina, 0);

  return rezultat.map((s) => ({
    ...s,
    postotak: ukupno > 0 ? Number(((s.kolicina / ukupno) * 100).toFixed(2)) : 0,
  }));
}

/**
 * Preusmjeri pokazivace s tanka na arhivu.
 *
 * Kad pretok isprazni izvorni tank, taj se tank arhivira i ODMAH je slobodan za
 * novo vino. Pokazivac `izvorTankId` tada vise ne vodi do vina od kojeg je
 * blend nastao nego do onoga sto u tom tanku bude sljedece — "Porijeklo vina"
 * na ciljnom tanku pokazuje tude vino. Zato pokazivac mora prijeci na arhivu,
 * koja je od tog trenutka jedino stabilno mjesto te povijesti.
 *
 * Cuvée grana to radi otpocetka (vidi `izvorArhivaVinaId = arhiva.id` nize);
 * obicni pretok nije, pa je ovo izjednacavanje.
 *
 * Prolazi kroz SVE stavke, ne samo kroz onu koja se sad prenosi: u ciljnom
 * blendu moze vec stajati stariji redak koji pokazuje na isti tank. I on je od
 * ovog trenutka kriv, a nakon preusmjeravanja se s novim spoji u jedan redak
 * (isti kljuc u `normalizirajBlendStavke`).
 */
function preusmjeriNaArhivu<
  T extends { izvorTankId: string | null; izvorArhivaVinaId: string | null }
>(stavke: T[], izvorTankId: string, arhivaId: string | null): T[] {
  if (!arhivaId) return stavke;

  return stavke.map((s) =>
    s.izvorTankId === izvorTankId
      ? { ...s, izvorTankId: null, izvorArhivaVinaId: arhivaId }
      : s
  );
}

function proporcionalniBlendIzvori(
  sourceTank: {
    id: string;
    broj: number;
    sorta: string | null;
    nazivVina: string | null;
    blendIzvori: Array<{
      izvorTankId: string | null;
      izvorArhivaVinaId: string | null;
      nazivVina: string | null;
      sorta: string | null;
      kolicina: number;
      postotak: number;
    }>;
  },
  kolicinaKojaSePrenosi: number,
  ukupnoPrije: number
): BlendStavkaCalc[] {
  if (kolicinaKojaSePrenosi <= 0 || ukupnoPrije <= 0) return [];

  if (sourceTank.blendIzvori.length > 0) {
    return normalizirajBlendStavke(
      sourceTank.blendIzvori.map((b) => ({
        izvorTankId: b.izvorTankId ?? null,
        izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
        nazivVina: b.nazivVina ?? null,
        sorta: b.sorta ?? null,
        kolicina: round6((Number(b.kolicina || 0) / ukupnoPrije) * kolicinaKojaSePrenosi),
      }))
    );
  }

  return [
    {
      izvorTankId: sourceTank.id,
      izvorArhivaVinaId: null,
      nazivVina: nazivTanka(sourceTank),
      sorta: sourceTank.sorta ?? null,
      kolicina: round6(kolicinaKojaSePrenosi),
      postotak: 100,
    },
  ];
}

async function spremiSnapshotTanka(
  tx: Prisma.TransactionClient,
  pretokId: string,
  tank: TankZaSnapshot,
  uloga: "CILJ" | "IZVOR"
) {
  const snapshot = await tx.pretokSnapshot.create({
    data: {
      pretokId,
      tankId: tank.id,
      uloga,
      brojTanka: tank.broj,
      kolicinaPrije: Number(tank.kolicinaVinaUTanku ?? 0),
      sortaPrije: tank.sorta,
      nazivVinaPrije: tank.nazivVina,
      godistePrije: tank.godiste,
      kapacitetPrije: tank.kapacitet,
      tipTankaPrije: tank.tip,
      opisPrije: tank.opis,
    },
  });

  if (tank.udjeliSorti.length > 0) {
    await tx.pretokSnapshotSorta.createMany({
      data: tank.udjeliSorti.map((u) => ({
        snapshotId: snapshot.id,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });
  }

  if (tank.blendIzvori.length > 0) {
    await tx.pretokSnapshotBlend.createMany({
      data: tank.blendIzvori.map((b) => ({
        snapshotId: snapshot.id,
        izvorTankId: b.izvorTankId ?? null,
        izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
        nazivVina: b.nazivVina ?? null,
        sorta: b.sorta ?? null,
        kolicina: Number(b.kolicina),
        postotak: Number(b.postotak),
      })),
    });
  }

  return snapshot;
}

// Izvezeno zbog scripts/test-arhiviranje-baza.ts. Next dopusta i izvoze koji
// nisu HTTP metode (`dynamic` i `maxDuration` su vec takvi) — provjera rute
// trazi da su GET/POST/... odgovarajuceg oblika, a ne da drugih izvoza nema.
export async function arhivirajPotroseniTank(
  tx: Prisma.TransactionClient,
  tank: {
    id: string;
    broj: number;
    sorta: string | null;
    nazivVina: string | null;
    godiste: number | null;
    kapacitet: number;
    tip: string | null;
  },
  kolicinaZaArhivu: number,
  napomena?: string | null
) {
  const [mjerenja, zadaci, udjeliSorti, documents, punjenja] =
    await Promise.all([
      tx.mjerenje.findMany({
        where: { tankId: tank.id },
        orderBy: { izmjerenoAt: "asc" },
      }),
      tx.zadatak.findMany({
        where: { tankId: tank.id },
        include: {
          preparat: true,
          jedinica: true,
          izlaznaJedinica: true,
          zadaoKorisnik: true,
          izvrsioKorisnik: true,
          stavke: {
            include: {
              preparat: true,
              jedinica: true,
              izlaznaJedinica: true,
            },
            orderBy: {
              redoslijed: "asc",
            },
          },
        },
        orderBy: { zadanoAt: "asc" },
      }),
      tx.tankSortaUdio.findMany({
        where: { tankId: tank.id },
        orderBy: { postotak: "desc" },
      }),
      tx.document.findMany({
        where: { tankId: tank.id },
        orderBy: [{ datumDokumenta: "desc" }, { createdAt: "desc" }],
      }),
      tx.punjenjeTanka.findMany({
        where: { tankId: tank.id },
        include: {
          stavke: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { datumPunjenja: "asc" },
      }),
    ]);

  // Radnje i izlazi se dohvaćaju REDOM, ne u gornji Promise.all.
  //
  // Gornji `Promise.all` šalje pet upita istovremeno preko jedne veze
  // transakcije. `pg` to prijavljuje kao DeprecationWarning ("Calling
  // client.query() when the client is already executing a query") i najavljuje
  // da u pg@9 prestaje raditi. To je zatečeno ponašanje i ne dira se ovdje —
  // ali se NE širi: dva nova upita idu redom, pa izmjena ne dodaje ništa
  // onome što će se ionako morati prepisati.
  const radnje = await tx.radnja.findMany({
    where: { tankId: tank.id },
    include: {
      korisnik: { select: { ime: true, email: true } },
      preparat: { select: { naziv: true } },
      jedinica: { select: { naziv: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const izlazi = await tx.izlazVina.findMany({
    where: { tankId: tank.id },
    orderBy: { datum: "asc" },
  });

  const arhiva = await tx.arhivaVina.create({
    data: {
      tankId: tank.id,
      brojTanka: tank.broj,
      sorta: tank.sorta,
      nazivVina: tank.nazivVina,
      godiste: tank.godiste,
      kolicinaVina: kolicinaZaArhivu,
      kapacitetTanka: tank.kapacitet,
      tipTanka: tank.tip,
      tipArhive: "PRIVREMENA",
      napomena:
        napomena?.trim() || "Automatski arhivirano nakon pretoka/cuvéea.",
    },
  });

  if (udjeliSorti.length > 0) {
    await tx.arhivaVinaUdioSorte.createMany({
      data: udjeliSorti.map((u) => ({
        arhivaVinaId: arhiva.id,
        izvorniUdioSorteId: u.id,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });
  }

  if (mjerenja.length > 0) {
    await tx.arhivaVinaMjerenje.createMany({
      data: mjerenja.map((m) => ({
        arhivaVinaId: arhiva.id,
        izvornoMjerenjeId: m.id,
        tankId: m.tankId,
        korisnikId: m.korisnikId,
        alkohol: m.alkohol,
        ukupneKiseline: m.ukupneKiseline,
        hlapiveKiseline: m.hlapiveKiseline,
        slobodniSO2: m.slobodniSO2,
        ukupniSO2: m.ukupniSO2,
        secer: m.secer,
        ph: m.ph,
        temperatura: m.temperatura,
        bentotestDatum: m.bentotestDatum,
        bentotestStatus: m.bentotestStatus,
        napomena: m.napomena,
        izmjerenoAt: m.izmjerenoAt,
      })),
    });
  }

  if (zadaci.length > 0) {
    for (const z of zadaci) {
      const arhivaZadatak = await tx.arhivaVinaZadatak.create({
        data: {
          arhivaVinaId: arhiva.id,
          izvorniZadatakId: z.id,
          tankId: z.tankId,
          vrsta: z.vrsta,
          status: z.status,
          naslov: z.naslov,
          napomena: z.napomena,
          doza: z.doza,
          volumenUTanku: z.volumenUTanku,
          izracunataKolicina: z.izracunataKolicina,
          preparatId: z.preparatId,
          preparatNaziv: z.preparat?.naziv ?? null,
          jedinicaId: z.jedinicaId,
          jedinicaNaziv: z.jedinica?.naziv ?? null,
          izlaznaJedinicaId: z.izlaznaJedinicaId,
          izlaznaJedinicaNaziv: z.izlaznaJedinica?.naziv ?? null,
          zadaoKorisnikId: z.zadaoKorisnikId,
          zadaoKorisnikIme: z.zadaoKorisnik?.ime ?? null,
          izvrsioKorisnikId: z.izvrsioKorisnikId,
          izvrsioKorisnikIme: z.izvrsioKorisnik?.ime ?? null,
          zadanoAt: z.zadanoAt,
          izvrsenoAt: z.izvrsenoAt,
        },
      });

      if (z.stavke && z.stavke.length > 0) {
        await tx.arhivaVinaZadatakStavka.createMany({
          data: z.stavke.map((s) => ({
            arhivaZadatakId: arhivaZadatak.id,
            preparatId: s.preparatId ?? null,
            preparatNaziv: s.preparat?.naziv ?? null,
            doza: s.doza,
            volumenUTanku: s.volumenUTanku,
            izracunataKolicina: s.izracunataKolicina,
            jedinicaId: s.jedinicaId ?? null,
            jedinicaNaziv: s.jedinica?.naziv ?? null,
            izlaznaJedinicaId: s.izlaznaJedinicaId ?? null,
            izlaznaJedinicaNaziv: s.izlaznaJedinica?.naziv ?? null,
            redoslijed: s.redoslijed ?? 0,
          })),
        });
      }
    }
  }

  if (documents.length > 0) {
    await tx.arhivaVinaDokument.createMany({
      data: documents.map((d) => ({
        arhivaVinaId: arhiva.id,
        vrsta: d.vrsta,
        naziv: d.naziv,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        datumDokumenta: d.datumDokumenta,
        napomena: d.napomena,
        uploadedByUserId: d.uploadedByUserId,
        uploadedByIme: d.uploadedByIme,
      })),
    });
  }

  // PUNJENJA U ARHIVU.
  //
  // Ovo je bio zatecen gubitak podataka, ne propust u prikazu: punjenja su se
  // dohvacala gore (`punjenja` u istom Promise.all) i nikad upisivala, a
  // originali su se nize brisali. Svaki pretok koji je ispraznio tank trajno je
  // unistio zapis berbe — parcelu, vinograd, oznaku berbe, kilograme grozdja i
  // secer/kiseline/pH berbe. Isti blok vec radi u izlaz-vina putu
  // (`arhivirajPrazanTank`), samo ovdje nikad nije napisan.
  //
  // Petlja po punjenju, ne createMany: stavke se pisu ugnijezdjeno, pa je jedan
  // create po punjenju. Tank ih u praksi ima jedno do dva.
  for (const p of punjenja) {
    await tx.arhivaPunjenjeTanka.create({
      data: {
        arhivaVinaId: arhiva.id,
        izvornoPunjenjeId: p.id,
        nazivVina: p.nazivVina,
        datumPunjenja: p.datumPunjenja,
        napomena: p.napomena,
        opis: p.opis,
        ukupnoLitara: p.ukupnoLitara,
        ukupnoKgGrozdja: p.ukupnoKgGrozdja,
        pocetnoMjerenjeId: p.pocetnoMjerenjeId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        stavke: {
          create: p.stavke.map((s) => ({
            izvornaPunjenjeStavkaId: s.id,
            nazivSorte: s.nazivSorte,
            sortaId: s.sortaId,
            opis: s.opis,
            kolicinaKgGrozdja: s.kolicinaKgGrozdja,
            kolicinaLitara: s.kolicinaLitara,
            datumBerbe: s.datumBerbe,
            godinaBerbe: s.godinaBerbe,
            polozaj: s.polozaj,
            parcela: s.parcela,
            vinograd: s.vinograd,
            oznakaBerbe: s.oznakaBerbe,
            secer: s.secer,
            kiseline: s.kiseline,
            ph: s.ph,
            napomenaBerbe: s.napomenaBerbe,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
        },
      },
    });
  }

  // RADNJE I IZLAZI U ARHIVU — SAMO KOPIJA, ORIGINALI OSTAJU.
  //
  // Namjerno se NE brišu. `POST /api/pretok/undo` vraća tankove po
  // snapshotovima i briše pretok, ali `ArhivaVina` ne dira — dakle poništavanje
  // ne vraća ništa što je otišlo u arhivu. Dok je tako, brisanje originala je
  // tihi gubitak. Monitor tanka od granice arhive ionako ne prikazuje starije
  // radnje i izlaze, pa se na ekranu ništa ne dvostruči.
  //
  // `izvorniZadatakId` se sprema OVDJE, a ne u snapshot pretoka: veza
  // radnja→zadatak pripada vinu, ne pretoku, pa mora preživjeti i brisanje
  // pretoka. Bez nje se gubi zauvijek — `Radnja.zadatak` je opcijska relacija
  // bez `onDelete`, pa Prisma na brisanju zadatka postavi `zadatakId` na NULL.
  if (radnje.length > 0) {
    await tx.arhivaVinaRadnja.createMany({
      data: radnje.map((r) => ({
        arhivaVinaId: arhiva.id,
        izvornaRadnjaId: r.id,
        izvorniZadatakId: r.zadatakId,
        tankId: tank.id,
        vrsta: r.vrsta,
        opis: r.opis,
        napomena: r.napomena,
        preparatId: r.preparatId,
        preparatNaziv: r.preparat?.naziv ?? null,
        jedinicaId: r.jedinicaId,
        jedinicaNaziv: r.jedinica?.naziv ?? null,
        kolicina: r.kolicina,
        korisnikId: r.korisnikId,
        korisnikIme: r.korisnik?.ime ?? r.korisnik?.email ?? null,
        createdAt: r.createdAt,
      })),
    });
  }

  if (izlazi.length > 0) {
    await tx.arhivaVinaIzlaz.createMany({
      data: izlazi.map((i) => ({
        arhivaVinaId: arhiva.id,
        izvorniIzlazId: i.id,
        tankId: tank.id,
        tip: i.tip,
        datum: i.datum,
        kolicinaLitara: i.kolicinaLitara,
        brojBoca: i.brojBoca,
        volumenBoce: i.volumenBoce,
        napomena: i.napomena,
        createdAt: i.createdAt,
      })),
    });
  }

  await tx.mjerenje.deleteMany({ where: { tankId: tank.id } });
  await tx.zadatak.deleteMany({ where: { tankId: tank.id } });
  await tx.tankSortaUdio.deleteMany({ where: { tankId: tank.id } });
  await tx.document.deleteMany({ where: { tankId: tank.id } });
  // `izlazVina.deleteMany` je maknut. Prije je brisao izlaze bez ikakve kopije,
  // pa je na tanku ostajala samo `Radnja` o prodaji, a zapisa o izlazu vina
  // nije bilo — zatečeno na tanku 16 ("Prodano rinfuza 1.000 L", nula izlaza).
  // Sada izlaz i njegova radnja idu u arhivu zajedno, a originali ostaju.

  await tx.punjenjeStavka.deleteMany({
    where: {
      punjenje: {
        tankId: tank.id,
      },
    },
  });

  await tx.punjenjeTanka.deleteMany({
    where: { tankId: tank.id },
  });

  await tx.blendIzvor.deleteMany({
    where: { ciljTankId: tank.id },
  });

  await tx.tank.update({
    where: { id: tank.id },
    data: {
      kolicinaVinaUTanku: 0,
      sorta: null,
      nazivVina: null,
      godiste: null,
    },
  });

  return arhiva;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tipPretoka: TipPretokaDb =
      body?.tipPretoka === "CUVEE"
        ? TipPretokaDb.CUVEE
        : body?.tipPretoka === "BLEND_ISTE_SORTE"
        ? TipPretokaDb.BLEND_ISTE_SORTE
        : TipPretokaDb.OBICNI;

    const ciljTankId = String(body?.ciljTankId ?? "").trim();
    const napomena =
      typeof body?.napomena === "string" ? body.napomena : null;

    const nazivNovogVina =
      typeof body?.nazivNovogVina === "string"
        ? body.nazivNovogVina.trim()
        : "";

    const sortaNovogVina =
      typeof body?.sortaNovogVina === "string"
        ? body.sortaNovogVina.trim()
        : "";

    const godisteNovo =
      body?.godiste !== undefined &&
      body?.godiste !== null &&
      String(body.godiste).trim() !== ""
        ? Number(body.godiste)
        : null;

    if (!ciljTankId || !Array.isArray(body?.izvori) || body.izvori.length === 0) {
      return NextResponse.json(
        { error: "Neispravni podaci." },
        { status: 400 }
      );
    }

    const agregiraniIzvoriMap = new Map<string, number>();

    for (const raw of body.izvori as any[]) {
      const tankId = String(raw?.tankId ?? "").trim();
      const kolicina = Number(raw?.kolicina ?? 0);

      if (!tankId || !Number.isFinite(kolicina) || kolicina <= 0) continue;

      agregiraniIzvoriMap.set(
        tankId,
        Number((agregiraniIzvoriMap.get(tankId) ?? 0) + kolicina)
      );
    }

    const izvori: UlazPretoka[] = Array.from(agregiraniIzvoriMap.entries()).map(
      ([tankId, kolicina]) => ({
        tankId,
        kolicina,
      })
    );

    if (izvori.length === 0) {
      return NextResponse.json(
        { error: "Nema valjanih izvora za pretok." },
        { status: 400 }
      );
    }

    if (izvori.some((i) => i.tankId === ciljTankId)) {
      return NextResponse.json(
        { error: "Ciljni tank ne može istovremeno biti i izvor." },
        { status: 400 }
      );
    }

    const trebaNovoVino =
      tipPretoka === TipPretokaDb.CUVEE ||
      tipPretoka === TipPretokaDb.BLEND_ISTE_SORTE;

    if (trebaNovoVino && !nazivNovogVina) {
      return NextResponse.json(
        { error: "Naziv novog vina je obavezan." },
        { status: 400 }
      );
    }

    if (trebaNovoVino && !sortaNovogVina) {
      return NextResponse.json(
        { error: "Sorta novog vina je obavezna." },
        { status: 400 }
      );
    }

    if (tipPretoka === TipPretokaDb.OBICNI && izvori.length !== 1) {
      return NextResponse.json(
        {
          error:
            "Obični pretok trenutno podržava samo jedan izvorni tank. Za spajanje više izvora koristi cuvée ili blend iste sorte.",
        },
        { status: 400 }
      );
    }

    const ciljTank = await prisma.tank.findUnique({
      where: { id: ciljTankId },
      include: {
        udjeliSorti: {
          orderBy: { postotak: "desc" },
        },
        blendIzvori: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ciljTank) {
      return NextResponse.json(
        { error: "Ciljni tank nije pronađen." },
        { status: 404 }
      );
    }

    const sourceTankIds = izvori.map((i) => i.tankId);

    const sourceTankovi = await prisma.tank.findMany({
      where: { id: { in: sourceTankIds } },
      include: {
        udjeliSorti: {
          orderBy: { postotak: "desc" },
        },
        blendIzvori: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (sourceTankovi.length !== sourceTankIds.length) {
      return NextResponse.json(
        { error: "Jedan ili više izvornih tankova nisu pronađeni." },
        { status: 404 }
      );
    }

    const tankById = new Map(sourceTankovi.map((t) => [t.id, t]));

    for (const i of izvori) {
      const tank = tankById.get(i.tankId);

      if (!tank) {
        return NextResponse.json(
          { error: "Izvorni tank nije pronađen." },
          { status: 404 }
        );
      }

      const dostupno = Number(tank.kolicinaVinaUTanku ?? 0);

      if (i.kolicina > dostupno) {
        return NextResponse.json(
          {
            error: `Tank ${tank.broj} nema dovoljno vina. Dostupno: ${dostupno} L.`,
          },
          { status: 400 }
        );
      }
    }

    if (tipPretoka === TipPretokaDb.OBICNI) {
      const sourceTank = sourceTankovi[0];
      const ciljImaVino = Number(ciljTank.kolicinaVinaUTanku ?? 0) > 0;

      if (ciljImaVino) {
        const istaSorta =
          (ciljTank.sorta ?? "").trim() === (sourceTank.sorta ?? "").trim();

        const istiNaziv =
          (ciljTank.nazivVina ?? "").trim() ===
          (sourceTank.nazivVina ?? "").trim();

        if (!istaSorta || !istiNaziv) {
          return NextResponse.json(
            {
              error:
                "Ciljni tank već sadrži drugo vino. Za ovakvo spajanje koristi 'Novo vino – cuvée' ili 'Novo vino – ista sorta'.",
            },
            { status: 400 }
          );
        }
      }
    }

    const noviSastav = await izracunajNoviSastavPretoka({
      izvori,
      ciljTankId,
    });

    const vrijednostiCilja = await dohvatiVrijednostiZaTank(ciljTankId);
    const vrijednostiIzvora = await Promise.all(
      izvori.map((i) => dohvatiVrijednostiZaTank(i.tankId))
    );

    const trenutnoUCilju = Number(ciljTank.kolicinaVinaUTanku ?? 0);
    const ukupnoDodano = izvori.reduce((sum, i) => sum + Number(i.kolicina), 0);
    const finalnaKolicina = Number((trenutnoUCilju + ukupnoDodano).toFixed(3));

    const weightedInputs: MjerenjeWeighted[] = [];

    // Podrijetlo svakog polja koje je stvarno uslo u prosjek — sluzi napomeni
    // da rezultat ne izgleda kao jedno mjerenje uzeto u jednom trenutku.
    const koristenaPodrijetla: IzvorPolja[] = [];

    if (trenutnoUCilju > 0 && !jeMjerenjePrazno(vrijednostiCilja.vrijednosti)) {
      weightedInputs.push({
        kolicina: trenutnoUCilju,
        ...vrijednostiCilja.vrijednosti,
      });
      koristenaPodrijetla.push(vrijednostiCilja.izvorPolja);
    }

    izvori.forEach((izvor, index) => {
      const v = vrijednostiIzvora[index];
      if (jeMjerenjePrazno(v.vrijednosti)) return;

      weightedInputs.push({
        kolicina: Number(izvor.kolicina),
        ...v.vrijednosti,
      });
      koristenaPodrijetla.push(v.izvorPolja);
    });

    const novoMjerenje = {
      alkohol: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.alkohol }))
      ),
      ukupneKiseline: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.ukupneKiseline,
        }))
      ),
      hlapiveKiseline: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.hlapiveKiseline,
        }))
      ),
      slobodniSO2: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.slobodniSO2,
        }))
      ),
      ukupniSO2: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.ukupniSO2,
        }))
      ),
      secer: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.secer }))
      ),
      ph: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.ph }))
      ),
      temperatura: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.temperatura,
        }))
      ),
    };

    // Prenosi li ovaj pretok ijedan parametar? Ako izvori (i zateceni sadrzaj
    // cilja) nemaju nijednu upisanu vrijednost, ponderiranje vrati osam nulla i
    // upis bi bio lazan zapis "izmjereno" bez ijednog izmjerenog podatka. Takav
    // redak k tome postaje NAJNOVIJE mjerenje ciljnog tanka, pa ga svaki iduci
    // pretok uzme kao polaznu vrijednost i praznina se siri dalje.
    //
    // Isti guard filtracija ima od faze 3A (lib/filtracija.ts:1057 i :1252);
    // pretok ga nije imao, pa je u bazi ostavio 2 posve prazna mjerenja.
    // `jeMjerenjePrazno` se UVOZI iz lib/filtracija.ts — nema druge kopije.
    const parametriPreneseni = !jeMjerenjePrazno(novoMjerenje);

    // Rezultat je prosjek preko vise tankova i moguce vise datuma. Bez ovoga bi
    // izgledao kao jedno mjerenje uzeto u jednom trenutku.
    const rasponIzvora = rasponDatumaIzvora(koristenaPodrijetla);
    const dodatakONastanku = rasponIzvora
      ? ` Vrijednosti su složene iz mjerenja od ${rasponIzvora.od.toLocaleDateString(
          "hr-HR"
        )} do ${rasponIzvora.do.toLocaleDateString("hr-HR")}.`
      : "";

    const rezultat = await prisma.$transaction(async (tx) => {
      const pretok = await tx.pretok.create({
        data: {
          ciljTankId,
          tip: tipPretoka,
          // Pretok, za razliku od filtracije, ne stvara `Radnja` — pa se podatak
          // o neprenesenim parametrima dopisuje ovdje. Korisnikov tekst ostaje
          // netaknut ispred, isti spoj " • " kao u filtraciji.
          napomena: parametriPreneseni
            ? napomena
            : [napomena?.trim() || null, NAPOMENA_BEZ_PARAMETARA]
                .filter(Boolean)
                .join(" • "),
          izvori: {
            create: izvori.map((i) => ({
              tankId: i.tankId,
              kolicina: Number(i.kolicina),
            })),
          },
        },
        include: {
          izvori: true,
        },
      });

      await spremiSnapshotTanka(
        tx,
        pretok.id,
        {
          id: ciljTank.id,
          broj: ciljTank.broj,
          kapacitet: ciljTank.kapacitet,
          kolicinaVinaUTanku: ciljTank.kolicinaVinaUTanku,
          tip: ciljTank.tip,
          opis: ciljTank.opis,
          sorta: ciljTank.sorta,
          nazivVina: ciljTank.nazivVina,
          godiste: ciljTank.godiste,
          udjeliSorti: ciljTank.udjeliSorti.map((u) => ({
            nazivSorte: u.nazivSorte,
            postotak: u.postotak,
          })),
          blendIzvori: ciljTank.blendIzvori.map((b) => ({
            izvorTankId: b.izvorTankId ?? null,
            izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
            nazivVina: b.nazivVina ?? null,
            sorta: b.sorta ?? null,
            kolicina: Number(b.kolicina),
            postotak: Number(b.postotak),
          })),
        },
        "CILJ"
      );

      for (const sourceTank of sourceTankovi) {
        await spremiSnapshotTanka(
          tx,
          pretok.id,
          {
            id: sourceTank.id,
            broj: sourceTank.broj,
            kapacitet: sourceTank.kapacitet,
            kolicinaVinaUTanku: sourceTank.kolicinaVinaUTanku,
            tip: sourceTank.tip,
            opis: sourceTank.opis,
            sorta: sourceTank.sorta,
            nazivVina: sourceTank.nazivVina,
            godiste: sourceTank.godiste,
            udjeliSorti: sourceTank.udjeliSorti.map((u) => ({
              nazivSorte: u.nazivSorte,
              postotak: u.postotak,
            })),
            blendIzvori: sourceTank.blendIzvori.map((b) => ({
              izvorTankId: b.izvorTankId ?? null,
              izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
              nazivVina: b.nazivVina ?? null,
              sorta: b.sorta ?? null,
              kolicina: Number(b.kolicina),
              postotak: Number(b.postotak),
            })),
          },
          "IZVOR"
        );
      }

      if (tipPretoka === TipPretokaDb.OBICNI) {
        const izvor = izvori[0];
        const sourceTank = tankById.get(izvor.tankId)!;
        const kolicinaIzvora = Number(izvor.kolicina);
        const stanjeIzvoraPrije = Number(sourceTank.kolicinaVinaUTanku ?? 0);
        const preostalo = Number((stanjeIzvoraPrije - kolicinaIzvora).toFixed(6));
        const ciljJeBioPrazan = Number(ciljTank.kolicinaVinaUTanku ?? 0) <= 0;
        const trenutnoUCiljuPrije = Number(ciljTank.kolicinaVinaUTanku ?? 0);

        const preneseniBlend = proporcionalniBlendIzvori(
          sourceTank,
          kolicinaIzvora,
          stanjeIzvoraPrije
        );

        let postojeciCiljniBlend: BlendStavkaCalc[] = [];

        if (trenutnoUCiljuPrije > 0) {
          if (ciljTank.blendIzvori.length > 0) {
            postojeciCiljniBlend = normalizirajBlendStavke(
              ciljTank.blendIzvori.map((b) => ({
                izvorTankId: b.izvorTankId ?? null,
                izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
                nazivVina: b.nazivVina ?? null,
                sorta: b.sorta ?? null,
                kolicina: Number(b.kolicina || 0),
              }))
            );
          } else {
            postojeciCiljniBlend = [
              {
                izvorTankId: ciljTank.id,
                izvorArhivaVinaId: null,
                nazivVina: nazivTanka(ciljTank),
                sorta: ciljTank.sorta ?? null,
                kolicina: round6(trenutnoUCiljuPrije),
                postotak: 100,
              },
            ];
          }
        }

        await tx.tank.update({
          where: { id: sourceTank.id },
          data: {
            kolicinaVinaUTanku: {
              decrement: kolicinaIzvora,
            },
          },
        });

        await tx.tank.update({
          where: { id: ciljTankId },
          data: {
            kolicinaVinaUTanku: {
              increment: kolicinaIzvora,
            },
            nazivVina:
              ciljJeBioPrazan && !ciljTank.nazivVina
                ? sourceTank.nazivVina
                : undefined,
            sorta:
              ciljJeBioPrazan && !ciljTank.sorta ? sourceTank.sorta : undefined,
            godiste:
              ciljJeBioPrazan && ciljTank.godiste == null
                ? sourceTank.godiste
                : undefined,
          },
        });

        await tx.tankSortaUdio.deleteMany({
          where: { tankId: ciljTankId },
        });

        if (noviSastav.length > 0) {
          await tx.tankSortaUdio.createMany({
            data: noviSastav.map((s) => ({
              tankId: ciljTankId,
              nazivSorte: s.nazivSorte,
              postotak: s.postotak,
            })),
          });
        }

        if (sourceTank.blendIzvori.length > 0) {
          await tx.blendIzvor.deleteMany({
            where: { ciljTankId: sourceTank.id },
          });

          if (preostalo > 0) {
            const preostaliBlend = proporcionalniBlendIzvori(
              sourceTank,
              preostalo,
              stanjeIzvoraPrije
            );

            if (preostaliBlend.length > 0) {
              await tx.blendIzvor.createMany({
                data: preostaliBlend.map((b) => ({
                  ciljTankId: sourceTank.id,
                  izvorTankId: b.izvorTankId,
                  izvorArhivaVinaId: b.izvorArhivaVinaId,
                  nazivVina: b.nazivVina,
                  sorta: b.sorta,
                  kolicina: b.kolicina,
                  postotak: b.postotak,
                })),
              });
            }
          }
        }

        // Arhiviranje ide PRIJE upisa ciljnog blenda, jer tek tada postoji
        // arhiva na koju se pokazivaci mogu preusmjeriti. Redoslijed je bio
        // obrnut, pa je blend ostajao vezan na tank koji je vec bio slobodan za
        // novo vino.
        const arhivaIzvora =
          preostalo <= 0
            ? await arhivirajPotroseniTank(
                tx,
                {
                  id: sourceTank.id,
                  broj: sourceTank.broj,
                  sorta: sourceTank.sorta ?? null,
                  nazivVina: sourceTank.nazivVina ?? null,
                  godiste: sourceTank.godiste ?? null,
                  kapacitet: sourceTank.kapacitet,
                  tip: sourceTank.tip ?? null,
                },
                stanjeIzvoraPrije,
                `Automatski arhivirano nakon običnog pretoka u tank ${ciljTank.broj}.`
              )
            : null;

        // Preusmjeravanje ide PRIJE normalizacije da se stari i novi redak
        // istog porijekla spoje u jedan umjesto da ostanu dva ista.
        const noviCiljniBlend = normalizirajBlendStavke(
          preusmjeriNaArhivu(
            [
              ...postojeciCiljniBlend.map((b) => ({
                izvorTankId: b.izvorTankId,
                izvorArhivaVinaId: b.izvorArhivaVinaId,
                nazivVina: b.nazivVina,
                sorta: b.sorta,
                kolicina: b.kolicina,
              })),
              ...preneseniBlend.map((b) => ({
                izvorTankId: b.izvorTankId,
                izvorArhivaVinaId: b.izvorArhivaVinaId,
                nazivVina: b.nazivVina,
                sorta: b.sorta,
                kolicina: b.kolicina,
              })),
            ],
            sourceTank.id,
            arhivaIzvora?.id ?? null
          )
        );

        await tx.blendIzvor.deleteMany({
          where: { ciljTankId },
        });

        if (noviCiljniBlend.length > 0) {
          await tx.blendIzvor.createMany({
            data: noviCiljniBlend.map((b) => ({
              ciljTankId,
              izvorTankId: b.izvorTankId,
              izvorArhivaVinaId: b.izvorArhivaVinaId,
              nazivVina: b.nazivVina,
              sorta: b.sorta,
              kolicina: b.kolicina,
              postotak: b.postotak,
            })),
          });
        }

        // Prazno mjerenje se NE upisuje. `pretokMjerenje.create` mora biti pod
        // istim uvjetom — inace bi veza pokazivala na mjerenje koje ne postoji.
        // Prazan popis auto-mjerenja pretok/undo vec podnosi (uvjet `notIn` se
        // tada ne dodaje), pa ondje nema sto mijenjati.
        if (parametriPreneseni) {
          const createdMjerenje = await tx.mjerenje.create({
            data: {
              tankId: ciljTankId,
              korisnikId: null,
              alkohol: novoMjerenje.alkohol,
              ukupneKiseline: novoMjerenje.ukupneKiseline,
              hlapiveKiseline: novoMjerenje.hlapiveKiseline,
              slobodniSO2: novoMjerenje.slobodniSO2,
              ukupniSO2: novoMjerenje.ukupniSO2,
              secer: novoMjerenje.secer,
              ph: novoMjerenje.ph,
              temperatura: novoMjerenje.temperatura,
              napomena:
                "Automatski izračunato novo mjerenje nakon običnog pretoka." +
                dodatakONastanku,
              jeRucno: false,
            },
          });

          await tx.pretokMjerenje.create({
            data: {
              pretokId: pretok.id,
              mjerenjeId: createdMjerenje.id,
              tankId: ciljTankId,
            },
          });
        }

        return {
          pretok,
          noviBlendIzvori: noviCiljniBlend,
        };
      }

      const noviBlendIzvori: {
        ciljTankId: string;
        izvorTankId: string | null;
        izvorArhivaVinaId: string | null;
        nazivVina: string | null;
        sorta: string | null;
        kolicina: number;
        postotak: number;
      }[] = [];

      if (trenutnoUCilju > 0) {
        if (ciljTank.blendIzvori.length > 0) {
          for (const postojeci of ciljTank.blendIzvori) {
            const postotak = Number(
              ((Number(postojeci.kolicina) / finalnaKolicina) * 100).toFixed(2)
            );

            noviBlendIzvori.push({
              ciljTankId,
              izvorTankId: postojeci.izvorTankId ?? null,
              izvorArhivaVinaId: postojeci.izvorArhivaVinaId ?? null,
              nazivVina: postojeci.nazivVina ?? null,
              sorta: postojeci.sorta ?? null,
              kolicina: Number(postojeci.kolicina),
              postotak,
            });
          }
        } else {
          noviBlendIzvori.push({
            ciljTankId,
            izvorTankId: ciljTank.id,
            izvorArhivaVinaId: null,
            nazivVina: nazivTanka(ciljTank),
            sorta: ciljTank.sorta ?? null,
            kolicina: trenutnoUCilju,
            postotak: Number(((trenutnoUCilju / finalnaKolicina) * 100).toFixed(2)),
          });
        }
      }

      for (const i of izvori) {
        const sourceTank = tankById.get(i.tankId)!;
        const kolicinaIzvora = Number(i.kolicina);
        const stanjePrije = Number(sourceTank.kolicinaVinaUTanku ?? 0);
        const preostalo = Number((stanjePrije - kolicinaIzvora).toFixed(6));

        let izvorTankId: string | null = sourceTank.id;
        let izvorArhivaVinaId: string | null = null;

        await tx.tank.update({
          where: { id: sourceTank.id },
          data: {
            kolicinaVinaUTanku: {
              decrement: kolicinaIzvora,
            },
          },
        });

        // Izvorni tank je predao dio vina, pa mu se i blend mora proporcionalno
        // smanjiti. Obicna grana to radi od pocetka, cuvée nije — pa je u
        // izvorima ostajalo vise litara blenda nego vina u tanku. Zateceno na
        // tankovima 15, 32 i 43.
        //
        // Racun dolazi iz lib/filtracija.ts, ne iz lokalnog
        // proporcionalniBlendIzvori: razdioba po mililitrima jamci da je zbroj
        // ostatka tocno jednak onome sto je u tanku ostalo, dok dijeljenje
        // decimala po stavci ostavlja drift (upravo takav drift i jesu zateceni
        // 4369,879518 L na tankovima 15 i 32).
        if (preostalo > 0 && sourceTank.blendIzvori.length > 0) {
          const ostatakBlenda = blendKojiOstaje(
            sourceTank,
            uMl(preostalo),
            uMl(stanjePrije)
          );

          await tx.blendIzvor.deleteMany({
            where: { ciljTankId: sourceTank.id },
          });

          if (ostatakBlenda.length > 0) {
            await tx.blendIzvor.createMany({
              data: ostatakBlenda.map((b) => ({
                ciljTankId: sourceTank.id,
                izvorTankId: b.izvorTankId,
                izvorArhivaVinaId: b.izvorArhivaVinaId,
                nazivVina: b.nazivVina,
                sorta: b.sorta,
                kolicina: uLitre(b.kolicinaMl),
                postotak: b.postotak,
              })),
            });
          }
        }

        if (preostalo <= 0) {
          const arhiva = await arhivirajPotroseniTank(
            tx,
            {
              id: sourceTank.id,
              broj: sourceTank.broj,
              sorta: sourceTank.sorta ?? null,
              nazivVina: sourceTank.nazivVina ?? null,
              godiste: sourceTank.godiste ?? null,
              kapacitet: sourceTank.kapacitet,
              tip: sourceTank.tip ?? null,
            },
            stanjePrije,
            `Automatski arhivirano jer je vino ušlo u ${
              tipPretoka === TipPretokaDb.CUVEE ? "cuvée" : "blend iste sorte"
            } u tank ${ciljTank.broj}.`
          );

          izvorTankId = null;
          izvorArhivaVinaId = arhiva.id;
        }

        noviBlendIzvori.push({
          ciljTankId,
          izvorTankId,
          izvorArhivaVinaId,
          nazivVina: nazivTanka(sourceTank),
          sorta: sourceTank.sorta ?? null,
          kolicina: kolicinaIzvora,
          postotak: Number(((kolicinaIzvora / finalnaKolicina) * 100).toFixed(2)),
        });
      }

      await tx.tank.update({
        where: { id: ciljTankId },
        data: {
          kolicinaVinaUTanku: {
            increment: ukupnoDodano,
          },
          nazivVina: nazivNovogVina,
          sorta: sortaNovogVina,
          godiste: godisteNovo,
        },
      });

      await tx.tankSortaUdio.deleteMany({
        where: { tankId: ciljTankId },
      });

      if (noviSastav.length > 0) {
        await tx.tankSortaUdio.createMany({
          data: noviSastav.map((s) => ({
            tankId: ciljTankId,
            nazivSorte: s.nazivSorte,
            postotak: s.postotak,
          })),
        });
      }

      await tx.blendIzvor.deleteMany({
        where: { ciljTankId },
      });

      if (noviBlendIzvori.length > 0) {
        await tx.blendIzvor.createMany({
          data: noviBlendIzvori,
        });
      }

      // Isti guard kao na obicnom pretoku gore — cuvée i blend iste sorte
      // jednako lako proizvedu prazan redak kad izvori nemaju mjerenja.
      if (parametriPreneseni) {
        const createdMjerenje = await tx.mjerenje.create({
          data: {
            tankId: ciljTankId,
            korisnikId: null,
            alkohol: novoMjerenje.alkohol,
            ukupneKiseline: novoMjerenje.ukupneKiseline,
            hlapiveKiseline: novoMjerenje.hlapiveKiseline,
            slobodniSO2: novoMjerenje.slobodniSO2,
            ukupniSO2: novoMjerenje.ukupniSO2,
            secer: novoMjerenje.secer,
            ph: novoMjerenje.ph,
            temperatura: novoMjerenje.temperatura,
            napomena:
              (tipPretoka === TipPretokaDb.CUVEE
                ? "Automatski izračunato novo mjerenje nakon cuvéea."
                : "Automatski izračunato novo mjerenje nakon blenda iste sorte.") +
              dodatakONastanku,
            jeRucno: false,
          },
        });

        await tx.pretokMjerenje.create({
          data: {
            pretokId: pretok.id,
            mjerenjeId: createdMjerenje.id,
            tankId: ciljTankId,
          },
        });
      }

      return {
        pretok,
        noviBlendIzvori,
      };
      // Zadani Prismin timeout je 5 s. Pretok koji arhivira potroseni izvorni
      // tank to redovito probije, i to TIHO — transakcija se povuce natrag, a
      // korisnik vidi samo "Greska kod pretoka". Arhivski dio je preko 40 upita
      // s mreznom latencijom Supabase poolera.
      //   timeout 30 s — s rezervom za arhiviranje tanka s cijelom sezonom.
      //   maxWait  5 s — cekanje na slobodnu vezu iz poola PRIJE nego
      //                  transakcija pocne. Nije dio timeouta, ali JEST dio
      //                  trajanja funkcije, pa se drzi nisko.
    }, { timeout: 30_000, maxWait: 5_000 });

    return NextResponse.json({
      success: true,
      tipPretoka,
      noviSastav,
      blendIzvori: rezultat.noviBlendIzvori,
      novoMjerenje,
      pretok: rezultat.pretok,
    });
  } catch (error) {
    console.error("Greška pretok:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Greška kod pretoka.",
      },
      { status: 500 }
    );
  }
}