export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";

export async function GET() {
  try {
    // Citanje, ali i dalje podaci podruma — bez prijave je vracalo 200 svakome.
    // Bez uvjeta na rolu: tko je prijavljen, smije vidjeti popis pretoka.
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    const pretoci = await prisma.pretok.findMany({
      orderBy: [{ createdAt: "desc" }, { datum: "desc" }],
      take: 12,
      include: {
        // `ciljevi` je pravi popis; `ciljTank` ostaje dok se glavni cilj jos pise.
        ciljevi: {
          orderBy: { redoslijed: "asc" },
          include: {
            tank: {
              select: {
                id: true,
                broj: true,
                sorta: true,
                nazivVina: true,
                tip: true,
              },
            },
          },
        },
        ciljTank: {
          select: {
            id: true,
            broj: true,
            sorta: true,
            nazivVina: true,
            tip: true,
          },
        },
        izvori: {
          orderBy: { id: "asc" },
          include: {
            tank: {
              select: {
                id: true,
                broj: true,
                sorta: true,
                nazivVina: true,
                tip: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      pretoci,
    });
  } catch (error) {
    console.error("GET /api/pretok/list error:", error);

    return NextResponse.json(
      { error: "Greška kod dohvaćanja pretoka." },
      { status: 500 }
    );
  }
}