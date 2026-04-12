import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { zadatakId } = body;

    if (!zadatakId) {
      return NextResponse.json(
        { error: "Nedostaje zadatakId." },
        { status: 400 }
      );
    }

    const postojeciZadatak = await prisma.zadatak.findUnique({
      where: { id: zadatakId },
    });

    if (!postojeciZadatak) {
      return NextResponse.json(
        { error: "Zadatak nije pronađen." },
        { status: 404 }
      );
    }

    const azuriraniZadatak = await prisma.zadatak.update({
      where: { id: zadatakId },
      data: {
        status: "IZVRSEN",
        izvrsenoAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Zadatak je uspješno izvršen.",
      zadatak: azuriraniZadatak,
    });
  } catch (error) {
    console.error("Greška kod izvršenja zadatka:", error);

    return NextResponse.json(
      { error: "Greška kod izvršenja zadatka." },
      { status: 500 }
    );
  }
}