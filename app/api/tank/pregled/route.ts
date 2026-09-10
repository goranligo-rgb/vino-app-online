import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { NextResponse } from "next/server";

function spojiZadnjeMjerenje(
  mjerenja: Array<{
    alkohol: number | null;
    ukupneKiseline: number | null;
    hlapiveKiseline: number | null;
    slobodniSO2: number | null;
    ukupniSO2: number | null;
    secer: number | null;
    ph: number | null;
    temperatura: number | null;
    bentotestDatum: Date | string | null;
    bentotestStatus: string | null;
    izmjerenoAt: Date | string;
    napomena: string | null;
  }>
) {
  if (!mjerenja.length) return null;

  function prvoNeNull<K extends keyof (typeof mjerenja)[number]>(key: K) {
    const zapis = mjerenja.find(
      (m) => m[key] !== null && m[key] !== undefined && m[key] !== ""
    );
    return zapis ? zapis[key] : null;
  }

  return {
    alkohol: prvoNeNull("alkohol"),
    ukupneKiseline: prvoNeNull("ukupneKiseline"),
    hlapiveKiseline: prvoNeNull("hlapiveKiseline"),
    slobodniSO2: prvoNeNull("slobodniSO2"),
    ukupniSO2: prvoNeNull("ukupniSO2"),
    secer: prvoNeNull("secer"),
    ph: prvoNeNull("ph"),
    temperatura: prvoNeNull("temperatura"),
    bentotestDatum: prvoNeNull("bentotestDatum"),
    bentotestStatus: prvoNeNull("bentotestStatus"),

    // datum gore prikazujemo kao datum zadnjeg unosa bilo kakvog mjerenja
    izmjerenoAt: mjerenja[0]?.izmjerenoAt ?? null,

    // napomena od zadnjeg unosa
    napomena: mjerenja[0]?.napomena ?? null,
  };
}

export async function GET(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tankId = searchParams.get("id");

  if (!tankId) {
    return NextResponse.json({ error: "Nedostaje tankId" }, { status: 400 });
  }

  const tank = await prisma.tank.findUnique({
    where: { id: tankId },
  });

  const mjerenjaZaTop = await prisma.mjerenje.findMany({
    where: { tankId },
    orderBy: { izmjerenoAt: "desc" },
    take: 100,
  });

  const zadnjeMjerenje = spojiZadnjeMjerenje(mjerenjaZaTop);

  // ZADNJE RADNJE — iz `VinoRadnja`, ne iz `Radnja`.
  //
  // Pitanje na koje ovaj pregled odgovara je "sto je ovo vino dobilo", a
  // `Radnja` odgovara na "sto se radilo kraj ovog tanka". To dvoje se razilazi
  // cim vino jednom pretoci: tank 5 danas nosi pet kvasaca iz cetiri druga
  // tanka, a nijedna od tih radnji nije izvedena u njemu.
  //
  // Oblik se drzi starog (`preparat.naziv`, `jedinica.naziv`, `korisnik.ime`,
  // `createdAt`) da app/sadrzaj-tanka/page.tsx ostane nedirnut — imena su na
  // `VinoRadnja` vec prepisana, pa se slazu bez ijednog joina.
  const vinoRadnje = await prisma.vinoRadnja.findMany({
    where: { tankId },
    orderBy: { dogodenoAt: "desc" },
    take: 20,
  });

  const radnje = vinoRadnje.map((v) => ({
    id: v.id,
    tankId: v.tankId,
    vrsta: v.vrsta,
    opis: v.opis,
    napomena: v.napomena,
    kolicina: v.kolicina,
    createdAt: v.dogodenoAt,
    korisnik: v.korisnikIme ? { ime: v.korisnikIme } : null,
    preparat: v.preparatNaziv ? { naziv: v.preparatNaziv } : null,
    jedinica: v.jedinicaNaziv ? { naziv: v.jedinicaNaziv } : null,
    // Novo, za ekrane koji to znaju prikazati: gdje je cin izveden i koliki
    // dio danasnjeg vina nosi.
    izvorniBrojTanka: v.izvorniBrojTanka,
    udio: v.udio,
  }));

  const otvoreniZadaci = await prisma.zadatak.findMany({
    where: {
      tankId,
      status: "OTVOREN",
    },
    include: {
      preparat: {
        include: {
          unit: true,
        },
      },
      jedinica: true,
      izlaznaJedinica: true,
      zadaoKorisnik: true,
      izvrsioKorisnik: true,
      stavke: {
        include: {
          preparat: {
            include: {
              unit: true,
            },
          },
          jedinica: true,
          izlaznaJedinica: true,
        },
        orderBy: {
          redoslijed: "asc",
        },
      },
    },
    orderBy: { zadanoAt: "desc" },
  });

  const izvrseniZadaci = await prisma.zadatak.findMany({
    where: {
      tankId,
      status: {
        in: ["IZVRSEN", "OTKAZAN"],
      },
    },
    include: {
      preparat: {
        include: {
          unit: true,
        },
      },
      jedinica: true,
      izlaznaJedinica: true,
      zadaoKorisnik: true,
      izvrsioKorisnik: true,
      stavke: {
        include: {
          preparat: {
            include: {
              unit: true,
            },
          },
          jedinica: true,
          izlaznaJedinica: true,
        },
        orderBy: {
          redoslijed: "asc",
        },
      },
    },
    orderBy: [{ izvrsenoAt: "desc" }, { zadanoAt: "desc" }],
    take: 30,
  });

  return NextResponse.json({
    tank,
    zadnjeMjerenje,
    radnje,
    otvoreniZadaci,
    izvrseniZadaci,
  });
}