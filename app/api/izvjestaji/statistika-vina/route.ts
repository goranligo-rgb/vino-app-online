// PREGLED VINA — samo citanje. `proxy.ts` ne stiti /api/*, pa ruta sama provjerava
// prijavu i rolu: iste role kao izvjestaj podruma (ADMIN, PODRUM, ENOLOG).
export const dynamic = "force-dynamic";
// Upiti po tanku, valovima po cetiri; vidi lib/statistika-vina-baza.ts.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { procitajPregledVina } from "@/lib/statistika-vina-baza";
import { getAuthUser, smijeRaditiUPodrumu } from "@/lib/zadatak-auth";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  if (!smijeRaditiUPodrumu(user)) {
    return NextResponse.json({ error: "Nemate pristup." }, { status: 403 });
  }

  try {
    return NextResponse.json(await procitajPregledVina(prisma));
  } catch (error) {
    console.error("GET /api/izvjestaji/statistika-vina error:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja pregleda vina." },
      { status: 500 }
    );
  }
}
