import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const tankovi = await prisma.tank.findMany({
      include: {
        zadaci: {
          where: {
            status: "OTVOREN",
          },
        },
      },
      orderBy: {
        broj: "asc",
      },
    });

    const rezultat = tankovi.map((t) => ({
      id: t.id,
      broj: t.broj,
      kapacitet: t.kapacitet,
      tip: t.tip,
      kolicinaVinaUTanku: t.kolicinaVinaUTanku ?? 0,
      sorta: t.sorta ?? null,
      brojZadataka: t.zadaci.length,
    }));

    return NextResponse.json(rezultat);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja tankova" },
      { status: 500 }
    );
  }
}