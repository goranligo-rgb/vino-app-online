import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

// GET - dohvat svih tankova
export async function GET() {
  try {
    const tankovi = await prisma.tank.findMany({
      orderBy: { broj: "asc" },
    });

    return NextResponse.json(tankovi);
  } catch (error) {
    console.error("Greška kod dohvaćanja tankova:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja tankova." },
      { status: 500 }
    );
  }
}

// POST - dodavanje novog tanka
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { broj, kapacitet, kolicinaVinaUTanku, tip, sorta } = body;

    if (broj === undefined || broj === null || String(broj).trim() === "") {
      return NextResponse.json(
        { error: "Broj tanka je obavezan." },
        { status: 400 }
      );
    }

    if (
      kapacitet === undefined ||
      kapacitet === null ||
      String(kapacitet).trim() === ""
    ) {
      return NextResponse.json(
        { error: "Kapacitet tanka je obavezan." },
        { status: 400 }
      );
    }

    const noviTank = await prisma.tank.create({
      data: {
        broj: Number(broj),
        kapacitet: Number(kapacitet),
        kolicinaVinaUTanku:
          kolicinaVinaUTanku !== undefined &&
          kolicinaVinaUTanku !== null &&
          String(kolicinaVinaUTanku).trim() !== ""
            ? Number(kolicinaVinaUTanku)
            : 0,
        tip: tip?.trim() ? String(tip).trim() : null,
        sorta: sorta?.trim() ? String(sorta).trim() : null,
      },
    });

    return NextResponse.json(noviTank);
  } catch (error) {
    console.error("Greška kod kreiranja tanka:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Tank s tim brojem već postoji." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod kreiranja tanka." },
      { status: 500 }
    );
  }
}

// PUT - update cijelog tanka
export async function PUT(req: Request) {
  try {
    const body = await req.json();

    const { id, broj, kapacitet, kolicinaVinaUTanku, tip, sorta } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID je obavezan." },
        { status: 400 }
      );
    }

    const updatedTank = await prisma.tank.update({
      where: { id: String(id) },
      data: {
        broj:
          broj !== undefined && broj !== null && String(broj).trim() !== ""
            ? Number(broj)
            : undefined,
        kapacitet:
          kapacitet !== undefined &&
          kapacitet !== null &&
          String(kapacitet).trim() !== ""
            ? Number(kapacitet)
            : undefined,
        kolicinaVinaUTanku:
          kolicinaVinaUTanku !== undefined &&
          kolicinaVinaUTanku !== null &&
          String(kolicinaVinaUTanku).trim() !== ""
            ? Number(kolicinaVinaUTanku)
            : 0,
        tip: tip !== undefined ? (String(tip).trim() || null) : undefined,
        sorta:
          sorta !== undefined ? (String(sorta).trim() || null) : undefined,
      },
    });

    return NextResponse.json(updatedTank);
  } catch (error) {
    console.error("Greška kod update tanka:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Već postoji drugi tank s tim brojem." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod ažuriranja tanka." },
      { status: 500 }
    );
  }
}

// DELETE - brisanje tanka
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID je obavezan." },
        { status: 400 }
      );
    }

    const tankId = String(id);

    const postojeciTank = await prisma.tank.findUnique({
      where: { id: tankId },
    });

    if (!postojeciTank) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    const [
      additionsCount,
      documentsCount,
      measurementsCount,
      mixingSourcesCount,
      mjerenjaCount,
      radnjeCount,
      tankContentCount,
      targetTransfersCount,
      sourceTransfersCount,
      zadaciCount,
      udjeliSortiCount,
      pretociKaoCiljCount,
      pretociKaoIzvorCount,
      targetMixingsCount,
    ] = await Promise.all([
      prisma.addition.count({ where: { tankId } }),
      prisma.document.count({ where: { tankId } }),
      prisma.measurement.count({ where: { tankId } }),
      prisma.mixingSource.count({ where: { sourceTankId: tankId } }),
      prisma.mjerenje.count({ where: { tankId } }),
      prisma.radnja.count({ where: { tankId } }),
      prisma.tankContent.count({ where: { tankId } }),
      prisma.transfer.count({ where: { targetTankId: tankId } }),
      prisma.transfer.count({ where: { sourceTankId: tankId } }),
      prisma.zadatak.count({ where: { tankId } }),
      prisma.tankSortaUdio.count({ where: { tankId } }),
      prisma.pretok.count({ where: { ciljTankId: tankId } }),
      prisma.pretokIzvor.count({ where: { tankId } }),
      prisma.mixing.count({ where: { targetTankId: tankId } }),
    ]);

    const tvrdiBlokatori = [
      { naziv: "dodavanja", count: additionsCount },
      { naziv: "dokumenti", count: documentsCount },
      { naziv: "stara mjerenja (Measurement)", count: measurementsCount },
      { naziv: "mixing source zapisi", count: mixingSourcesCount },
      { naziv: "mjerenja", count: mjerenjaCount },
      { naziv: "sadržaj tanka", count: tankContentCount },
      { naziv: "transferi kao ciljni tank", count: targetTransfersCount },
      { naziv: "transferi kao izvorni tank", count: sourceTransfersCount },
      { naziv: "zadaci", count: zadaciCount },
      { naziv: "udjeli sorti", count: udjeliSortiCount },
      { naziv: "mixings kao ciljni tank", count: targetMixingsCount },
    ].filter((x) => x.count > 0);

    if (tvrdiBlokatori.length > 0) {
      return NextResponse.json(
        {
          error:
            "Tank se ne može obrisati jer još ima povezane zapise: " +
            tvrdiBlokatori.map((x) => `${x.naziv} (${x.count})`).join(", "),
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.radnja.deleteMany({
        where: { tankId },
      });

      const pretociKaoCilj = await tx.pretok.findMany({
        where: { ciljTankId: tankId },
        select: { id: true },
      });

      if (pretociKaoCilj.length > 0) {
        await tx.pretok.deleteMany({
          where: { ciljTankId: tankId },
        });
      }

      await tx.pretokIzvor.deleteMany({
        where: { tankId },
      });

      await tx.tank.delete({
        where: { id: tankId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Greška kod brisanja tanka:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        {
          error:
            "Tank se ne može obrisati jer još ima povezane zapise u drugim tablicama.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod brisanja tanka." },
      { status: 500 }
    );
  }
}