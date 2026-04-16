export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const pretoci = await prisma.pretok.findMany({
      orderBy: [{ createdAt: "desc" }, { datum: "desc" }],
      take: 12,
      include: {
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