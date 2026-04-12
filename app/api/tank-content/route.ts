export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const broj = Number(searchParams.get("broj"));

    if (!Number.isInteger(broj) || broj <= 0) {
      return NextResponse.json(
        { error: "Broj tanka mora biti ispravan." },
        { status: 400 }
      );
    }

    const tank = await prisma.tank.findUnique({
      where: { broj },
      include: {
        currentContent: true,
      },
    });

    if (!tank) {
      return NextResponse.json(
        { error: "Tank ne postoji." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      tank: {
        id: tank.id,
        broj: tank.broj,
        kapacitet: tank.kapacitet,
        tip: tank.tip,
      },
      currentContent: tank.currentContent,
    });
  } catch (error) {
    console.error("GET /api/tank-content error:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja sadržaja tanka." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const broj = Number(body.broj);
    const sorta = String(body.sorta ?? "").trim();
    const kolicina = Number(body.kolicina);
    const datumUlazaRaw = String(body.datumUlaza ?? "").trim();

    if (!Number.isInteger(broj) || broj <= 0) {
      return NextResponse.json(
        { error: "Broj tanka mora biti cijeli broj veći od 0." },
        { status: 400 }
      );
    }

    if (!sorta) {
      return NextResponse.json(
        { error: "Sorta je obavezna." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(kolicina) || kolicina <= 0) {
      return NextResponse.json(
        { error: "Količina mora biti broj veći od 0." },
        { status: 400 }
      );
    }

    if (!datumUlazaRaw) {
      return NextResponse.json(
        { error: "Datum ulaza je obavezan." },
        { status: 400 }
      );
    }

    const datumUlaza = new Date(datumUlazaRaw);

    if (Number.isNaN(datumUlaza.getTime())) {
      return NextResponse.json(
        { error: "Datum ulaza nije ispravan." },
        { status: 400 }
      );
    }

    const tank = await prisma.tank.findUnique({
      where: { broj },
    });

    if (!tank) {
      return NextResponse.json(
        { error: "Tank ne postoji." },
        { status: 404 }
      );
    }

    if (kolicina > tank.kapacitet) {
      return NextResponse.json(
        { error: "Količina vina ne može biti veća od kapaciteta tanka." },
        { status: 400 }
      );
    }

    const content = await prisma.tankContent.upsert({
      where: {
        tankId: tank.id,
      },
      update: {
        sorta,
        kolicina,
        datumUlaza,
      },
      create: {
        tankId: tank.id,
        sorta,
        kolicina,
        datumUlaza,
      },
    });

    return NextResponse.json(content, { status: 201 });
  } catch (error) {
    console.error("POST /api/tank-content error:", error);
    return NextResponse.json(
      { error: "Greška kod spremanja sadržaja tanka." },
      { status: 500 }
    );
  }
}