export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { osigurajRedoslijed } from "@/lib/zadatak-redoslijed";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { zadatakId } = body;

    if (!zadatakId) {
      return NextResponse.json(
        { error: "Nedostaje zadatakId." },
        { status: 400 }
      );
    }

    // Sve provjere (postojanje, status, zaključanost, redoslijed) i sam
    // update statusa moraju biti u istoj transakciji kako bi guard imao
    // smisla — inače bi između čitanja i pisanja mogao proći paralelan poziv.
    const rezultat = await prisma.$transaction(async (tx) => {
      const zadatak = await tx.zadatak.findUnique({
        where: { id: String(zadatakId) },
        select: {
          id: true,
          tankId: true,
          status: true,
          zakljucanDo: true,
          zadanoAt: true,
          createdAt: true,
        },
      });

      if (!zadatak) {
        throw new Error("Zadatak nije pronađen.");
      }

      if (zadatak.status === "IZVRSEN") {
        throw new Error("Zadatak je već izvršen.");
      }

      // Odgođeni vezani zadatak — još nije postao dostupan za izvršenje.
      if (zadatak.zakljucanDo && new Date() < new Date(zadatak.zakljucanDo)) {
        throw new Error("Vezani zadatak još nije dostupan za izvršenje.");
      }

      // Redoslijed izvršenja na istom tanku.
      await osigurajRedoslijed(tx, {
        id: zadatak.id,
        tankId: zadatak.tankId,
        zadanoAt: zadatak.zadanoAt,
        createdAt: zadatak.createdAt,
      });

      return tx.zadatak.update({
        where: { id: String(zadatakId) },
        data: {
          status: "IZVRSEN",
          izvrsenoAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Zadatak je uspješno izvršen.",
      zadatak: rezultat,
    });
  } catch (error) {
    console.error("Greška kod izvršenja zadatka:", error);

    if (
      error instanceof Error &&
      [
        "Zadatak nije pronađen.",
        "Zadatak je već izvršen.",
        "Vezani zadatak još nije dostupan za izvršenje.",
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      error.message.startsWith(
        "Na ovom tanku postoji raniji neizvršeni zadatak:"
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Greška kod izvršenja zadatka." },
      { status: 500 }
    );
  }
}
