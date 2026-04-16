export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function brojIliNull(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isNaN(x) ? null : x;
}

function datumIliNull(v: unknown): Date | null {
  if (v === "" || v === null || v === undefined) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tankId = searchParams.get("tankId");

    const mjerenja = await prisma.mjerenje.findMany({
      where: tankId ? { tankId } : {},
      orderBy: {
        izmjerenoAt: "desc",
      },
      take: 15,
      include: {
        tank: true,
        korisnik: true,
      },
    });

    return NextResponse.json(mjerenja);
  } catch (error) {
    console.error("Greška kod dohvaćanja mjerenja:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod dohvaćanja mjerenja.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      tankId,
      korisnikId,
      alkohol,
      ukupneKiseline,
      hlapiveKiseline,
      slobodniSO2,
      ukupniSO2,
      secer,
      ph,
      temperatura,
      bentotestDatum,
      bentotestStatus,
      izmjerenoAt,
      napomena,
    } = body;

    if (!tankId) {
      return NextResponse.json(
        { error: "Tank je obavezan." },
        { status: 400 }
      );
    }

    const datumMjerenja = datumIliNull(izmjerenoAt) ?? new Date();

    const mjerenje = await prisma.$transaction(async (tx) => {
      const createdMjerenje = await tx.mjerenje.create({
        data: {
          tankId: String(tankId),
          korisnikId: korisnikId || null,

          alkohol: brojIliNull(alkohol),
          ukupneKiseline: brojIliNull(ukupneKiseline),
          hlapiveKiseline: brojIliNull(hlapiveKiseline),
          slobodniSO2: brojIliNull(slobodniSO2),
          ukupniSO2: brojIliNull(ukupniSO2),
          secer: brojIliNull(secer),
          ph: brojIliNull(ph),
          temperatura: brojIliNull(temperatura),

          bentotestDatum: datumIliNull(bentotestDatum),
          bentotestStatus:
            bentotestStatus === "" || bentotestStatus == null
              ? null
              : String(bentotestStatus),

          izmjerenoAt: datumMjerenja,
          napomena:
            napomena === "" || napomena == null ? null : String(napomena),
        },
        include: {
          tank: true,
          korisnik: true,
        },
      });

      const zadnjePunjenjeBezPocetnogMjerenja = await tx.punjenjeTanka.findFirst({
        where: {
          tankId: String(tankId),
          pocetnoMjerenjeId: null,
          datumPunjenja: {
            lte: datumMjerenja,
          },
        },
        orderBy: {
          datumPunjenja: "desc",
        },
        select: {
          id: true,
        },
      });

      if (zadnjePunjenjeBezPocetnogMjerenja) {
        await tx.punjenjeTanka.update({
          where: {
            id: zadnjePunjenjeBezPocetnogMjerenja.id,
          },
          data: {
            pocetnoMjerenjeId: createdMjerenje.id,
          },
        });
      }

      return createdMjerenje;
    });

    return NextResponse.json({
      success: true,
      message: "Mjerenje je uspješno spremljeno.",
      mjerenje,
    });
  } catch (error) {
    console.error("Greška kod spremanja mjerenja:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod spremanja mjerenja.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();

    const {
      id,
      tankId,
      korisnikId,
      alkohol,
      ukupneKiseline,
      hlapiveKiseline,
      slobodniSO2,
      ukupniSO2,
      secer,
      ph,
      temperatura,
      bentotestDatum,
      bentotestStatus,
      izmjerenoAt,
      napomena,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID mjerenja je obavezan." },
        { status: 400 }
      );
    }

    const mjerenje = await prisma.mjerenje.update({
      where: { id: String(id) },
      data: {
        tankId: tankId || undefined,
        korisnikId: korisnikId === "" ? null : korisnikId ?? undefined,

        alkohol: alkohol !== undefined ? brojIliNull(alkohol) : undefined,
        ukupneKiseline:
          ukupneKiseline !== undefined
            ? brojIliNull(ukupneKiseline)
            : undefined,
        hlapiveKiseline:
          hlapiveKiseline !== undefined
            ? brojIliNull(hlapiveKiseline)
            : undefined,
        slobodniSO2:
          slobodniSO2 !== undefined ? brojIliNull(slobodniSO2) : undefined,
        ukupniSO2:
          ukupniSO2 !== undefined ? brojIliNull(ukupniSO2) : undefined,
        secer: secer !== undefined ? brojIliNull(secer) : undefined,
        ph: ph !== undefined ? brojIliNull(ph) : undefined,
        temperatura:
          temperatura !== undefined ? brojIliNull(temperatura) : undefined,

        bentotestDatum:
          bentotestDatum === ""
            ? null
            : bentotestDatum !== undefined
            ? datumIliNull(bentotestDatum)
            : undefined,

        bentotestStatus:
          bentotestStatus === ""
            ? null
            : bentotestStatus !== undefined
            ? bentotestStatus
            : undefined,

        izmjerenoAt:
          izmjerenoAt !== undefined
            ? datumIliNull(izmjerenoAt) ?? undefined
            : undefined,

        napomena:
          napomena === ""
            ? null
            : napomena !== undefined
            ? napomena
            : undefined,
      },
      include: {
        tank: true,
        korisnik: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Mjerenje je uspješno ažurirano.",
      mjerenje,
    });
  } catch (error) {
    console.error("Greška kod ažuriranja mjerenja:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod ažuriranja mjerenja.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID mjerenja je obavezan." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const postojece = await tx.mjerenje.findUnique({
        where: { id: String(id) },
        select: {
          id: true,
        },
      });

      if (!postojece) {
        throw new Error("Mjerenje nije pronađeno.");
      }

      await tx.punjenjeTanka.updateMany({
        where: {
          pocetnoMjerenjeId: String(id),
        },
        data: {
          pocetnoMjerenjeId: null,
        },
      });

      await tx.mjerenje.delete({
        where: { id: String(id) },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Mjerenje je obrisano.",
    });
  } catch (error) {
    console.error("Greška kod brisanja mjerenja:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod brisanja mjerenja.",
      },
      { status: 500 }
    );
  }
}