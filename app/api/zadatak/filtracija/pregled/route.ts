export const dynamic = "force-dynamic";

// Samo citanje, ali vrijedi isto pravilo — Prisma prva istekne.
//   Prisma najgori slucaj = maxWait 3 s + timeout 15 s = 18 s
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { FiltracijaGreska, pregledCiljeva } from "@/lib/filtracija";

/**
 * Podaci koje forma treba prije nego se filtracija spremi:
 * stanje ciljnih tankova, slobodan prostor i podatak je li u njima zateceno
 * DRUGO vino (uz gotov tekst upozorenja).
 *
 * Razlicito vino NE blokira filtraciju — forma na temelju ovoga samo upozori i
 * ponudi unos novog naziva vina za taj tank.
 *
 * Ruta nista ne mijenja, pa je dovoljna prijava (bez provjere role).
 *
 * GET /api/zadatak/filtracija/pregled?izvorTankId=...&ciljTankIds=id1,id2
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    const url = new URL(req.url);
    const izvorTankId = String(url.searchParams.get("izvorTankId") ?? "").trim();

    if (!izvorTankId) {
      return NextResponse.json(
        { error: "Nedostaje izvorTankId." },
        { status: 400 }
      );
    }

    const ciljTankIds = String(url.searchParams.get("ciljTankIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Samo citanje, ali jedan upit po tanku — kod vise ciljnih tankova zadanih
    // 5 s zna biti tijesno. Ne zakljucava nista, pa duzi okvir nikoga ne blokira.
    const rezultat = await prisma.$transaction(
      (tx) => pregledCiljeva(tx, { izvorTankId, ciljTankIds }),
      { timeout: 15_000, maxWait: 3_000 }
    );

    return NextResponse.json(rezultat);
  } catch (error) {
    if (error instanceof FiltracijaGreska) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("GET /api/zadatak/filtracija/pregled error:", error);

    return NextResponse.json(
      { error: "Greska kod dohvacanja pregleda filtracije." },
      { status: 500 }
    );
  }
}
