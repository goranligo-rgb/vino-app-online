// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";

export async function POST(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nemaš pravo pristupa." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const tankId = String(body.tankId ?? "").trim();

    if (!tankId) {
      return NextResponse.json(
        { error: "Nedostaje tankId." },
        { status: 400 }
      );
    }

    await prisma.tankSortaUdio.deleteMany({
      where: { tankId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Greška kod brisanja svih sastava:", error);
    return NextResponse.json(
      { error: "Greška kod brisanja svih sastava." },
      { status: 500 }
    );
  }
}