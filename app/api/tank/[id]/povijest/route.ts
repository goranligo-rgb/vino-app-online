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

    const radnje = await prisma.zadatak.findMany({
      where: {
        tankId,
        status: "IZVRSEN",
      },
      include: {
        preparat: true,
        jedinica: true,
        izlaznaJedinica: true,
        izvrsioKorisnik: true,
        zadaoKorisnik: true,
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