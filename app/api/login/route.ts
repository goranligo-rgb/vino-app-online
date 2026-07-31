export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AUTH_COOKIE,
  imaTajnu,
  opcijeKolacica,
  potpisiToken,
} from "@/lib/auth-token";

export async function POST(req: Request) {
  try {
    // Bez tajne se sesija ne moze potpisati — bolje jasna poruka nego 500.
    if (!imaTajnu()) {
      console.error("LOGIN: AUTH_SECRET nije postavljen.");
      return NextResponse.json(
        { error: "Prijava privremeno nije moguća (konfiguracija poslužitelja)." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    console.log("LOGIN ROUTE HIT");
    console.log("USERNAME RAW:", username);

    if (!username || !password) {
      return NextResponse.json(
        { error: "Unesite username i lozinku" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        username,
      },
    });

    console.log(
      "USER FOUND:",
      user
        ? {
            id: user.id,
            ime: user.ime,
            username: user.username,
            active: user.active,
            role: user.role,
          }
        : null
    );

    if (!user) {
      return NextResponse.json(
        { error: "Pogrešan username ili lozinka" },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { error: "Korisnik nije aktivan" },
        { status: 403 }
      );
    }

    if (String(user.password) !== password) {
      return NextResponse.json(
        { error: "Pogrešan username ili lozinka" },
        { status: 401 }
      );
    }

    const token = await potpisiToken({
      id: user.id,
      ime: user.ime,
      role: user.role as "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED",
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        ime: user.ime,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });

    // Sesijski kolacic (bez maxAge) — kao i dosad. Token je httpOnly, pa ga
    // klijentski JS vise ne cita; za prikaz sluzi GET /api/me.
    response.cookies.set(AUTH_COOKIE, token, opcijeKolacica());

    return response;
  } catch (error) {
    console.error("LOGIN ERROR FULL:", error);

    return NextResponse.json(
      {
        error: "Greška kod prijave",
        details: String(error),
      },
      { status: 500 }
    );
  }
}