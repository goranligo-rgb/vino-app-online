import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    await prisma.tankSortaUdio.deleteMany({
      where: { tankId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Greška kod brisanja svih sastava:", error);
    return NextResponse.json(
      { error: "Greška kod brisanja svih sastava." },
      { status: 500 }
    );
  }
}