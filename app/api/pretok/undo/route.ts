export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const pretokId = String(body?.pretokId ?? "").trim();

    if (!pretokId) {
      return NextResponse.json(
        { error: "Nedostaje pretokId." },
        { status: 400 }
      );
    }

    const pretok = await prisma.pretok.findUnique({
      where: { id: pretokId },
      include: {
        izvori: true,
        snapshoti: {
          include: {
            sorte: true,
            blendovi: true,
          },
        },
        mjerenja: true,
      },
    });

    if (!pretok) {
      return NextResponse.json(
        { error: "Pretok nije pronađen." },
        { status: 404 }
      );
    }

    if (!pretok.snapshoti || pretok.snapshoti.length === 0) {
      return NextResponse.json(
        {
          error:
            "Za ovaj pretok ne postoji spremljeni snapshot pa ga nije moguće sigurno vratiti.",
        },
        { status: 400 }
      );
    }

    const sviTankoviIds = uniqueStrings([
      pretok.ciljTankId,
      ...pretok.izvori.map((i) => i.tankId),
    ]);

    const autoMjerenjeIds = pretok.mjerenja.map((m) => m.mjerenjeId);

    // Provjera kasnijih pretoka
    const kasnijiPretok = await prisma.pretok.findFirst({
      where: {
        id: { not: pretok.id },
        createdAt: { gt: pretok.createdAt },
        OR: [
          { ciljTankId: { in: sviTankoviIds } },
          {
            izvori: {
              some: {
                tankId: { in: sviTankoviIds },
              },
            },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
      },
    });

    if (kasnijiPretok) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasniji pretoci na uključenim tankovima. Najprije treba vratiti sve kasnije promjene na polaznu točku.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih mjerenja (osim auto-mjerenja od ovog pretoka)
    const kasnijeMjerenje = await prisma.mjerenje.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        izmjerenoAt: { gt: pretok.createdAt },
        id: autoMjerenjeIds.length > 0 ? { notIn: autoMjerenjeIds } : undefined,
      },
      orderBy: { izmjerenoAt: "asc" },
      select: {
        id: true,
        tankId: true,
        izmjerenoAt: true,
      },
    });

    if (kasnijeMjerenje) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasnija mjerenja na uključenim tankovima. Najprije treba obrisati kasnije promjene i vratiti stanje na trenutak prije pretoka.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih izlaza vina
    const kasnijiIzlaz = await prisma.izlazVina.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        createdAt: { gt: pretok.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
      },
    });

    if (kasnijiIzlaz) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasniji izlazi vina na uključenim tankovima. Najprije treba vratiti sve kasnije promjene.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih punjenja
    const kasnijePunjenje = await prisma.punjenjeTanka.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        createdAt: { gt: pretok.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
      },
    });

    if (kasnijePunjenje) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasnija punjenja na uključenim tankovima. Najprije treba vratiti sve kasnije promjene.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih zadataka
    const kasnijiZadatak = await prisma.zadatak.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        createdAt: { gt: pretok.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
      },
    });

    if (kasnijiZadatak) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasniji zadaci na uključenim tankovima. Najprije treba vratiti sve kasnije promjene.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih radnji
    const kasnijaRadnja = await prisma.radnja.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        createdAt: { gt: pretok.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
      },
    });

    if (kasnijaRadnja) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasnije radnje na uključenim tankovima. Najprije treba vratiti sve kasnije promjene.",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1) obriši auto-mjerenja vezana uz pretok
      if (pretok.mjerenja.length > 0) {
        await tx.mjerenje.deleteMany({
          where: {
            id: {
              in: pretok.mjerenja.map((m) => m.mjerenjeId),
            },
          },
        });
      }

      // 2) vrati tankove po snapshotovima
      for (const snapshot of pretok.snapshoti) {
        await tx.tank.update({
          where: { id: snapshot.tankId },
          data: {
            kolicinaVinaUTanku: snapshot.kolicinaPrije ?? 0,
            sorta: snapshot.sortaPrije,
            nazivVina: snapshot.nazivVinaPrije,
            godiste: snapshot.godistePrije,
            tip: snapshot.tipTankaPrije,
            opis: snapshot.opisPrije,
          },
        });

        // vrati sastav sorti
        await tx.tankSortaUdio.deleteMany({
          where: { tankId: snapshot.tankId },
        });

        if (snapshot.sorte.length > 0) {
          await tx.tankSortaUdio.createMany({
            data: snapshot.sorte.map((s) => ({
              tankId: snapshot.tankId,
              nazivSorte: s.nazivSorte,
              postotak: s.postotak,
            })),
          });
        }

        // vrati blend izvore samo za cilj tog snapshot tank-a
        await tx.blendIzvor.deleteMany({
          where: { ciljTankId: snapshot.tankId },
        });

        if (snapshot.blendovi.length > 0) {
          await tx.blendIzvor.createMany({
            data: snapshot.blendovi.map((b) => ({
              ciljTankId: snapshot.tankId,
              izvorTankId: b.izvorTankId,
              izvorArhivaVinaId: b.izvorArhivaVinaId,
              nazivVina: b.nazivVina,
              sorta: b.sorta,
              kolicina: b.kolicina,
              postotak: b.postotak,
            })),
          });
        }
      }

      // 3) obriši vezu pretok-mjerenje
      await tx.pretokMjerenje.deleteMany({
        where: { pretokId: pretok.id },
      });

      // 4) obriši pretok (cascade briše izvore i snapshot relacije)
      await tx.pretok.delete({
        where: { id: pretok.id },
      });
    });

    return NextResponse.json({
      ok: true,
      message: "Pretok je uspješno vraćen.",
    });
  } catch (error) {
    console.error("POST /api/pretok/undo error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod vraćanja pretoka.",
      },
      { status: 500 }
    );
  }
}