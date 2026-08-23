// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

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
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

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