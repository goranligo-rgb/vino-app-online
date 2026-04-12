import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const units = await prisma.unit.findMany({
      orderBy: {
        naziv: "asc",
      },
    });

    return NextResponse.json(units);
  } catch (error) {
    console.error("GET /api/unit error:", error);

    return NextResponse.json(
      { error: "Greška kod dohvaćanja mjernih jedinica." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { naziv, tip, faktor } = body;

    if (!naziv || !String(naziv).trim()) {
      return NextResponse.json(
        { error: "Naziv jedinice je obavezan." },
        { status: 400 }
      );
    }

    const postoji = await prisma.unit.findFirst({
      where: {
        naziv: String(naziv).trim(),
      },
    });

    if (postoji) {
      return NextResponse.json(
        { error: "Ta mjerna jedinica već postoji." },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.create({
      data: {
        naziv: String(naziv).trim(),
        tip: tip ? String(tip).trim() : null,
        faktor:
          faktor !== undefined && faktor !== null && faktor !== ""
            ? Number(faktor)
            : null,
      },
    });

    return NextResponse.json(unit);
  } catch (error) {
    console.error("POST /api/unit error:", error);

    return NextResponse.json(
      { error: "Greška kod spremanja mjerne jedinice." },
      { status: 500 }
    );
  }
}