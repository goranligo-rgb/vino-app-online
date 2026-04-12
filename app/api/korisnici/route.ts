import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("auth_user")?.value;

    if (!raw) {
      return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });
    }

    let user: AuthUser | null = null;

    try {
      user = JSON.parse(decodeURIComponent(raw));
    } catch {
      return NextResponse.json({ error: "Nevažeća prijava." }, { status: 401 });
    }

    if (!user || user.role !== "ADMIN") {
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

    let role: "ADMIN" | "PODRUM";

    if (level === "1") {
      role = "ADMIN";
    } else if (level === "2") {
      role = "PODRUM";
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