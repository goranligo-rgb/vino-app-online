export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";

export async function POST(req: Request) {
  try {
    // Sesija iz potpisanog tokena — neispravan potpis vraca null, tj. 401.
    const user = await citajSesiju();

    if (!user) {
      return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Nemaš pravo pristupa." }, { status: 403 });
    }

    const body = await req.json();

    const ime = String(body.ime ?? "").trim();
    const username = String(body.username ?? "").trim().toLowerCase();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();
    const level = String(body.level ?? "").trim();

    if (!ime || !username || !email || !password || !level) {
      return NextResponse.json(
        { error: "Sva polja su obavezna." },
        { status: 400 }
      );
    }

    let role: "ADMIN" | "PODRUM" | "ENOLOG" | "PREGLED";

    if (level === "1") {
      role = "ADMIN";
    } else if (level === "2") {
      role = "PODRUM";
    } else if (level === "3") {
      role = "ENOLOG";
    } else if (level === "4") {
      role = "PREGLED";
    } else {
      return NextResponse.json(
        { error: "Neispravan level." },
        { status: 400 }
      );
    }

    const postojiUsername = await prisma.user.findFirst({
      where: { username },
      select: { id: true },
    });

    if (postojiUsername) {
      return NextResponse.json(
        { error: "Username već postoji." },
        { status: 400 }
      );
    }

    const postojiEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (postojiEmail) {
      return NextResponse.json(
        { error: "Email već postoji." },
        { status: 400 }
      );
    }

    const novi = await prisma.user.create({
      data: {
        ime,
        username,
        email,
        password,
        role,
        active: true,
      },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: novi.id,
        ime: novi.ime,
        username: novi.username,
        email: novi.email,
        role: novi.role,
        active: novi.active,
      },
    });
  } catch (error) {
    console.error("DODAJ KORISNIKA ERROR:", error);
    return NextResponse.json(
      { error: "Greška kod dodavanja korisnika." },
      { status: 500 }
    );
  }
}