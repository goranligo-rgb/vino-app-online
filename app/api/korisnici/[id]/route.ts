export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

type AuthUser = {
  id: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

async function getAdminUser() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("auth_user")?.value;

  if (!raw) {
    return { error: "Nisi prijavljen.", status: 401 as const, user: null };
  }

  try {
    const user = JSON.parse(decodeURIComponent(raw)) as AuthUser;

    if (!user || user.role !== "ADMIN") {
      return { error: "Nemaš pravo.", status: 403 as const, user: null };
    }

    return { error: null, status: 200 as const, user };
  } catch {
    return { error: "Nevažeća prijava.", status: 401 as const, user: null };
  }
}

function levelToRole(level: string) {
  if (level === "1") return "ADMIN";
  if (level === "2") return "PODRUM";
  if (level === "3") return "ENOLOG";
  if (level === "4") return "PREGLED";
  return null;
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAdminUser();

    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Nema ID-a." }, { status: 400 });
    }

    if (id === auth.user.id) {
      return NextResponse.json(
        { error: "Ne možeš obrisati sam sebe." },
        { status: 400 }
      );
    }

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE USER ERROR:", error);

    const poruka = String(error?.message ?? "");

    if (
      poruka.includes("Foreign key") ||
      poruka.includes("constraint") ||
      poruka.includes("relation")
    ) {
      return NextResponse.json(
        {
          error:
            "Korisnik je vezan uz zadatke, radnje ili mjerenja i ne može se obrisati. Postavi ga na neaktivan.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod brisanja." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAdminUser();

    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Nema ID-a." }, { status: 400 });
    }

    const body = await req.json();

    const ime = body.ime !== undefined ? String(body.ime).trim() : undefined;
    const username =
      body.username !== undefined
        ? String(body.username).trim().toLowerCase()
        : undefined;
    const email =
      body.email !== undefined
        ? String(body.email).trim().toLowerCase()
        : undefined;
    const password =
      body.password !== undefined ? String(body.password).trim() : undefined;
    const level = body.level !== undefined ? String(body.level).trim() : undefined;
    const active =
      body.active !== undefined ? Boolean(body.active) : undefined;

    const postojeci = await prisma.user.findUnique({
      where: { id },
    });

    if (!postojeci) {
      return NextResponse.json(
        { error: "Korisnik nije pronađen." },
        { status: 404 }
      );
    }

    if (username && username !== postojeci.username) {
      const postojiUsername = await prisma.user.findFirst({
        where: {
          username,
          NOT: { id },
        },
        select: { id: true },
      });

      if (postojiUsername) {
        return NextResponse.json(
          { error: "Username već postoji." },
          { status: 400 }
        );
      }
    }

    if (email && email !== postojeci.email) {
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
    }

    let role: string | undefined = undefined;

    if (level !== undefined) {
      const parsedRole = levelToRole(level);

      if (!parsedRole) {
        return NextResponse.json(
          { error: "Neispravan level." },
          { status: 400 }
        );
      }

      role = parsedRole;
    }

    if (id === auth.user.id && role && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Ne možeš sebi maknuti admin prava." },
        { status: 400 }
      );
    }

    if (id === auth.user.id && active === false) {
      return NextResponse.json(
        { error: "Ne možeš sam sebe deaktivirati." },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ime: ime !== undefined ? ime : undefined,
        username: username !== undefined ? username : undefined,
        email: email !== undefined ? email : undefined,
        password:
          password !== undefined && password !== "" ? password : undefined,
        role: role !== undefined ? (role as any) : undefined,
        active: active !== undefined ? active : undefined,
      },
      select: {
        id: true,
        ime: true,
        username: true,
        email: true,
        role: true,
        active: true,
      },
    });

    return NextResponse.json({
      ok: true,
      user: updated,
    });
  } catch (error) {
    console.error("PATCH USER ERROR:", error);
    return NextResponse.json(
      { error: "Greška kod uređivanja korisnika." },
      { status: 500 }
    );
  }
}