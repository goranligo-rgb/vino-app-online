import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const postojeci = await prisma.tankSortaUdio.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!postojeci) {
      return NextResponse.json(
        { error: "Stavka sastava nije pronađena." },
        { status: 404 }
      );
    }

    await prisma.tankSortaUdio.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Greška kod brisanja sastava:", error);
    return NextResponse.json(
      { error: "Greška kod brisanja sastava." },
      { status: 500 }
    );
  }
}