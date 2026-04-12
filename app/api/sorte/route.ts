export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sorte = await prisma.sorta.findMany({
      where: { aktivna: true },
      orderBy: { naziv: "asc" },
    });

    return NextResponse.json(sorte);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja sorti" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const naziv = String(body?.naziv || "").trim();

    if (!naziv) {
      return NextResponse.json(
        { error: "Naziv sorte je obavezan" },
        { status: 400 }
      );
    }

    const postoji = await prisma.sorta.findUnique({
      where: { naziv },
    });

    if (postoji) {
      return NextResponse.json(postoji);
    }

    const nova = await prisma.sorta.create({
      data: { naziv },
    });

    return NextResponse.json(nova);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Greška kod spremanja sorte" },
      { status: 500 }
    );
  }
}