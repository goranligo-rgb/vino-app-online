import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
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

    const authUser = {
      id: user.id,
      ime: user.ime,
      role: user.role,
    };

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

    response.cookies.set("auth_user", encodeURIComponent(JSON.stringify(authUser)), {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
    });

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