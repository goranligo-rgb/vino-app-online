export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tankId } = await params;

  try {
    const mjerenja = await prisma.mjerenje.findMany({
      where: { tankId },
      orderBy: { izmjerenoAt: "desc" },
    });

    // Uz zadatke ovog tanka idu i filtracije iz DRUGIH tankova koje su vino
    // dovele U ovaj tank — inače bi dolazak vina bio nevidljiv u povijesti
    // ciljnog tanka (zadatak stoji na izvornom tanku).
    const radnje = await prisma.zadatak.findMany({
      where: {
        status: "IZVRSEN",
        OR: [
          { tankId },
          { tankStavke: { some: { ciljTankId: tankId } } },
        ],
      },
      include: {
        preparat: true,
        jedinica: true,
        izlaznaJedinica: true,
        izvrsioKorisnik: true,
        zadaoKorisnik: true,
        tank: {
          select: { id: true, broj: true },
        },
        tankStavke: {
          orderBy: { redoslijed: "asc" },
          include: {
            ciljTank: { select: { id: true, broj: true } },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json({
      mjerenja,
      radnje,
    });
  } catch (error) {
    console.error("Greška kod dohvaćanja povijesti tanka:", error);

    return NextResponse.json(
      { error: "Greška kod dohvaćanja povijesti" },
      { status: 500 }
    );
  }
}