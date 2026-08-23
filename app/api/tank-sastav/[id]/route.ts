// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const { id } = await params;

    const postojeci = await prisma.tankSortaUdio.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!postojeci) {
      return NextResponse.json(
        { error: "Stavka sastava nije pronađena." },
        { status: 404 }
      );
    }

    await prisma.tankSortaUdio.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Greška kod brisanja sastava:", error);
    return NextResponse.json(
      { error: "Greška kod brisanja sastava." },
      { status: 500 }
    );
  }
}