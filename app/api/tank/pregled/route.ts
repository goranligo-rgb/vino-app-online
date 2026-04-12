import { prisma } from "@/lib/prisma";
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

  const radnje = await prisma.radnja.findMany({
    where: { tankId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      korisnik: true,
      preparat: true,
      jedinica: true,
    },
  });

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