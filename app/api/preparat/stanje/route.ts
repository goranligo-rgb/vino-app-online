export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { citajSesiju } from "@/lib/auth-sesija";
import {
  citajFiltere,
  dohvatiStanjeSkladista,
  smijeGledatiStanje,
} from "@/lib/preparat-stanje";

// Pregled stanja skladista preparata. Samo citanje.
export async function GET(req: Request) {
  try {
    const user = await citajSesiju();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    // Provjera prava je OVDJE, ne samo u sucelju.
    if (!smijeGledatiStanje(user)) {
      return NextResponse.json(
        { error: "Nemate pravo pregleda stanja skladišta." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const podaci = await dohvatiStanjeSkladista(citajFiltere(searchParams));

    return NextResponse.json({ ok: true, ...podaci });
  } catch (error) {
    console.error("GET /api/preparat/stanje error:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja stanja skladišta." },
      { status: 500 }
    );
  }
}
