export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { imenaPodruma } from "@/lib/ime-vina";

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
                tip: true,
              },
            },
          },
        },
      },
    });

    // IME TANKA JE IZVEDENO (faza 5) — `Tank.nazivVina` se vise ne pise. Ide
    // pod istim imenom polja, pa ekran pretoka ne treba mijenjati.
    const imena = await imenaPodruma(prisma);
    const sImenom = <T extends { id: string }>(t: T) => ({
      ...t,
      nazivVina: imena.get(t.id)?.naziv ?? null,
    });

    return NextResponse.json({
      ok: true,
      pretoci: pretoci.map((p) => ({
        ...p,
        ciljTank: p.ciljTank ? sImenom(p.ciljTank) : p.ciljTank,
        ciljevi: p.ciljevi.map((c) => ({ ...c, tank: sImenom(c.tank) })),
        izvori: p.izvori.map((i) => ({ ...i, tank: sImenom(i.tank) })),
      })),
    });
  } catch (error) {
    console.error("GET /api/pretok/list error:", error);

    return NextResponse.json(
      { error: "Greška kod dohvaćanja pretoka." },
      { status: 500 }
    );
  }
}