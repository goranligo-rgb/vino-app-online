export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const jedinice = [
  { naziv: "g/hL" },
  { naziv: "kg/hL" },
  { naziv: "dkg/hL" },
  { naziv: "g/L" },
  { naziv: "mL/L" },
  { naziv: "L/L" },
  { naziv: "mL/hL" },
  { naziv: "L/hL" },
  { naziv: "dcl/hL" },
];

async function ubaciJedinice() {
  for (const j of jedinice) {
    const postoji = await prisma.unit.findFirst({
      where: { naziv: j.naziv },
    });

    if (!postoji) {
      await prisma.unit.create({
        data: {
          naziv: j.naziv,
        },
      });
    }
  }
}

export async function GET() {
  try {
    await ubaciJedinice();

    const sve = await prisma.unit.findMany({
      orderBy: {
        naziv: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Jedinice su upisane.",
      units: sve,
    });
  } catch (error) {
    console.error("GET /api/unit/seed error:", error);

    return NextResponse.json(
      { error: "Greška kod upisa jedinica." },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    await ubaciJedinice();

    const sve = await prisma.unit.findMany({
      orderBy: {
        naziv: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Jedinice su upisane.",
      units: sve,
    });
  } catch (error) {
    console.error("POST /api/unit/seed error:", error);

    return NextResponse.json(
      { error: "Greška kod upisa jedinica." },
      { status: 500 }
    );
  }
}