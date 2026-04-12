import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Nedostaje ID stavke." },
        { status: 400 }
      );
    }

    const stavka = await prisma.punjenjeStavka.findUnique({
      where: { id },
      select: {
        id: true,
        punjenjeId: true,
        obrisano: true,
      },
    });

    if (!stavka) {
      return NextResponse.json(
        { error: "Stavka ne postoji." },
        { status: 404 }
      );
    }

    if (stavka.obrisano) {
      return NextResponse.json(
        { error: "Stavka je već obrisana." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.punjenjeStavka.update({
        where: { id },
        data: {
          obrisano: true,
          obrisanoAt: new Date(),
        },
      });

      const aktivneStavke = await tx.punjenjeStavka.findMany({
        where: {
          punjenjeId: stavka.punjenjeId,
          obrisano: false,
        },
        select: {
          kolicinaLitara: true,
          kolicinaKgGrozdja: true,
        },
      });

      const ukupnoLitara = aktivneStavke.reduce(
        (sum, s) => sum + Number(s.kolicinaLitara || 0),
        0
      );

      const ukupnoKgGrozdja = aktivneStavke.reduce(
        (sum, s) => sum + Number(s.kolicinaKgGrozdja || 0),
        0
      );

      await tx.punjenjeTanka.update({
        where: { id: stavka.punjenjeId },
        data: {
          ukupnoLitara,
          ukupnoKgGrozdja,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Greška kod brisanja stavke:", error);

    return NextResponse.json(
      { error: "Greška kod brisanja stavke." },
      { status: 500 }
    );
  }
}