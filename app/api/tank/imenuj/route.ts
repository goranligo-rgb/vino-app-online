export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { jeL12 } from "@/lib/auth-role";
import { ImenovanjeGreska, imenujVinoRucno } from "@/lib/imenovanje-rucno";

/**
 * POST — rucno imenovanje vina u tanku (faza 5).
 *
 * Tijelo: { tankId, naziv, deklariranaSorta, razlog }. Sva pravila (obavezan
 * razlog, prazan tank, „nista se nije promijenilo") stoje u
 * lib/imenovanje-rucno.ts, da ih test nad bazom provjerava bez HTTP-a.
 *
 * L1/L2 — ADMIN i PODRUM, isto kao `PUT /api/tank`. ENOLOG namjerno izvan.
 * Brava je ovdje, ne na gumbu: `proxy.ts` ne pokriva `/api/*`.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  if (!jeL12(user.role)) {
    return NextResponse.json(
      { error: "Nemate pravo imenovati vino." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan zahtjev." }, { status: 400 });
  }

  const tekst = (v: unknown) => (typeof v === "string" ? v : null);
  const tankId = tekst(body.tankId);

  if (!tankId) {
    return NextResponse.json({ error: "Tank nije zadan." }, { status: 400 });
  }

  try {
    const rezultat = await prisma.$transaction((tx) =>
      imenujVinoRucno(tx, {
        tankId,
        naziv: tekst(body.naziv),
        deklariranaSorta: tekst(body.deklariranaSorta),
        razlog: tekst(body.razlog),
        korisnikId: user.id,
      })
    );

    return NextResponse.json({
      naziv: rezultat.poslije.naziv,
      deklariranaSorta: rezultat.poslije.deklariranaSorta,
    });
  } catch (error) {
    if (error instanceof ImenovanjeGreska) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Greška kod imenovanja vina:", error);
    return NextResponse.json(
      { error: "Imenovanje nije uspjelo." },
      { status: 500 }
    );
  }
}
