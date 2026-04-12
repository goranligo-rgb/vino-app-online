export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    let jedinica = await prisma.unit.findFirst({
      where: { naziv: "g/hL" },
    });

    if (!jedinica) {
      jedinica = await prisma.unit.create({
        data: {
          naziv: "g/hL",
          tip: "doza",
          faktor: 1,
        },
      });
    }

    const preparat = await prisma.preparation.create({
      data: {
        naziv: "Sumpor",
        opis: "Testni preparat",
        dozaOd: 10,
        dozaDo: 10,
        unitId: jedinica.id,
        strucnoIme: "Kalijev metabisulfit",
      },
    });

    return NextResponse.json(preparat);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Greška kod kreiranja testnog preparata." },
      { status: 500 }
    );
  }
}