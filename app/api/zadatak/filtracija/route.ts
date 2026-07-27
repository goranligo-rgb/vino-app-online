export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";

/**
 * Zadatak vrste FILTRACIJA — samo dohvat.
 *
 * KREIRANJE ovdje NE postoji, namjerno. Filtracija se zadaje kao i svaki drugi
 * zadatak, na /zadaci kroz POST /api/zadatak/create — bez litara i bez ciljnih
 * tankova, jer se pri zadavanju jos ne znaju. To je plan.
 * Stvarne brojke upisuje tek izvrsenje (izvrsi/), kroz ekran
 * /zadaci/filtracija/[id]. Time postoji samo JEDAN put kreiranja filtracije.
 *
 * Izvrsenje je zasebna ruta jer trazi transakciju sa zakljucavanjem tankova i
 * primjenom pretoka vina.
 */

// GET - otvorene filtracije, opcionalno samo za jedan tank (izvorni ili ciljni).
export async function GET(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    const url = new URL(req.url);
    const tankId = String(url.searchParams.get("tankId") ?? "").trim();

    const filtracije = await prisma.zadatak.findMany({
      where: {
        vrsta: "FILTRACIJA",
        ...(tankId
          ? {
              OR: [
                { tankId },
                { tankStavke: { some: { ciljTankId: tankId } } },
              ],
            }
          : {}),
      },
      include: {
        tank: { select: { id: true, broj: true, nazivVina: true, sorta: true } },
        zadaoKorisnik: { select: { id: true, ime: true } },
        izvrsioKorisnik: { select: { id: true, ime: true } },
        tankStavke: {
          orderBy: { redoslijed: "asc" },
          include: {
            ciljTank: {
              select: { id: true, broj: true, nazivVina: true, sorta: true },
            },
          },
        },
      },
      orderBy: { zadanoAt: "desc" },
      take: 200,
    });

    return NextResponse.json(filtracije);
  } catch (error) {
    console.error("GET /api/zadatak/filtracija error:", error);
    return NextResponse.json(
      { error: "Greska kod dohvacanja filtracija." },
      { status: 500 }
    );
  }
}
