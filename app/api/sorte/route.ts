// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

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
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

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