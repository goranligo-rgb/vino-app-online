export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type UdioInput = {
  nazivSorte: string;
  postotak: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tankId = String(body.tankId ?? "").trim();

    if (!tankId) {
      return NextResponse.json(
        { error: "Nedostaje tankId." },
        { status: 400 }
      );
    }

    const tank = await prisma.tank.findUnique({
      where: { id: tankId },
      select: { id: true },
    });

    if (!tank) {
      return NextResponse.json(
        { error: "Tank ne postoji." },
        { status: 404 }
      );
    }

    const saljePojedinacnuStavku =
      typeof body.nazivSorte !== "undefined" ||
      typeof body.postotak !== "undefined";

    if (saljePojedinacnuStavku) {
      const nazivSorte = String(body.nazivSorte ?? "").trim();
      const postotak = Number(body.postotak ?? 0);

      if (!nazivSorte) {
        return NextResponse.json(
          { error: "Naziv sorte je obavezan." },
          { status: 400 }
        );
      }

      if (!Number.isFinite(postotak) || postotak <= 0) {
        return NextResponse.json(
          { error: "Postotak mora biti veći od 0." },
          { status: 400 }
        );
      }

      const postojeci = await prisma.tankSortaUdio.findFirst({
        where: {
          tankId,
          nazivSorte,
        },
      });

      if (postojeci) {
        await prisma.tankSortaUdio.update({
          where: { id: postojeci.id },
          data: { postotak },
        });
      } else {
        await prisma.tankSortaUdio.create({
          data: {
            tankId,
            nazivSorte,
            postotak,
          },
        });
      }

      const spremljeni = await prisma.tankSortaUdio.findMany({
        where: { tankId },
        orderBy: {
          postotak: "desc",
        },
      });

      return NextResponse.json({
        success: true,
        udjeli: spremljeni,
      });
    }

    const rawUdjeli = Array.isArray(body.udjeli) ? body.udjeli : [];

    const ocisceniUdjeli: UdioInput[] = rawUdjeli
      .map((u: any) => ({
        nazivSorte: String(u?.nazivSorte ?? "").trim(),
        postotak: Number(u?.postotak ?? 0),
      }))
      .filter(
        (u: UdioInput) =>
          u.nazivSorte !== "" &&
          Number.isFinite(u.postotak) &&
          u.postotak > 0
      );

    if (ocisceniUdjeli.length === 0) {
      await prisma.tankSortaUdio.deleteMany({
        where: { tankId },
      });

      return NextResponse.json({
        success: true,
        message: "Sastav je obrisan jer nema valjanih stavki.",
      });
    }

    const ukupno = ocisceniUdjeli.reduce((sum, u) => sum + u.postotak, 0);

    if (ukupno <= 0) {
      return NextResponse.json(
        { error: "Ukupni zbroj udjela mora biti veći od 0." },
        { status: 400 }
      );
    }

    const normaliziraniUdjeli = ocisceniUdjeli.map((u) => ({
      nazivSorte: u.nazivSorte,
      postotak: (u.postotak / ukupno) * 100,
    }));

    await prisma.tankSortaUdio.deleteMany({
      where: { tankId },
    });

    await prisma.tankSortaUdio.createMany({
      data: normaliziraniUdjeli.map((u) => ({
        tankId,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });

    const spremljeni = await prisma.tankSortaUdio.findMany({
      where: { tankId },
      orderBy: {
        postotak: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      udjeli: spremljeni,
    });
  } catch (error) {
    console.error("Greška kod spremanja sastava:", error);
    return NextResponse.json(
      { error: "Greška kod spremanja sastava." },
      { status: 500 }
    );
  }
}