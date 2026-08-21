export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { citajSesiju } from "@/lib/auth-sesija";
import type { AuthUser } from "@/lib/auth-token";

async function getAuthUser(): Promise<AuthUser | null> {
  return citajSesiju();
}

// Promet preparata je citanje: ADMIN, ENOLOG i PODRUM. PREGLED (L4) ne.
function smijeGledati(user: AuthUser | null) {
  return (
    user?.role === "ADMIN" ||
    user?.role === "ENOLOG" ||
    user?.role === "PODRUM"
  );
}

export async function GET(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    if (!smijeGledati(user)) {
      return NextResponse.json(
        { error: "Nemate pravo pregleda prometa preparata." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const preparationId = String(searchParams.get("preparationId") ?? "").trim();

    if (!preparationId) {
      return NextResponse.json(
        { error: "preparationId je obavezan." },
        { status: 400 }
      );
    }

    const preparat = await prisma.preparation.findUnique({
      where: { id: preparationId },
      select: {
        id: true,
        naziv: true,
        unit: {
          select: {
            id: true,
            naziv: true,
          },
        },
        skladisnaJedinica: {
          select: {
            id: true,
            naziv: true,
          },
        },
      },
    });

    if (!preparat) {
      return NextResponse.json(
        { error: "Preparat nije pronađen." },
        { status: 404 }
      );
    }

    // JEDAN izvor istine. Izlazi se vise NE citaju iz tablice Radnja: od
    // uvodenja dnevnika svaki izlaz ima svoj redak ovdje, pa bi citanje iz
    // oba izvora svaki izlaz prikazalo dvaput.
    const zapisi = await prisma.preparationStockEntry.findMany({
      where: {
        preparationId,
      },
      include: {
        unit: {
          select: {
            id: true,
            naziv: true,
          },
        },
        korisnik: {
          select: {
            id: true,
            ime: true,
          },
        },
        radnja: {
          select: {
            id: true,
            opis: true,
            tank: {
              select: {
                id: true,
                broj: true,
                nazivVina: true,
                sorta: true,
              },
            },
          },
        },
      },
      orderBy: {
        datum: "desc",
      },
      take: 200,
    });

    const promet = zapisi
      .map((z) => ({
        id: z.id,
        tip: z.tip,
        // false = zapis od prije uvodenja knjige; vidi se, ne ulazi u zbroj.
        uKnjizi: z.uKnjizi,
        datum: (z.datum ?? z.createdAt ?? new Date()).toISOString(),
        kolicina: z.kolicina ?? null,
        promjenaSkladisna: z.promjenaSkladisna,
        jedinicaNaziv:
          z.unit?.naziv ??
          preparat.skladisnaJedinica?.naziv ??
          preparat.unit?.naziv ??
          null,
        tankBroj: z.radnja?.tank?.broj ?? null,
        nazivVina: z.radnja?.tank?.nazivVina ?? null,
        sorta: z.radnja?.tank?.sorta ?? null,
        dobavljac: z.dobavljac ?? null,
        brojDokumenta: z.brojDokumenta ?? null,
        napomena: z.napomena ?? null,
        korisnik: z.korisnik?.ime ?? null,
        opis: z.radnja?.tank
          ? `Tank ${z.radnja.tank.broj} — ${
              z.radnja.tank.nazivVina ?? z.radnja.tank.sorta ?? ""
            }`
          : z.tip === "ULAZ"
          ? z.dobavljac
            ? `Ulaz od dobavljača ${z.dobavljac}`
            : "Ulaz na skladište"
          : z.radnja?.opis ?? z.napomena ?? null,
      }))
      .sort(
        (a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime()
      );

    return NextResponse.json({
      preparat,
      promet,
    });
  } catch (error) {
    console.error("GET /api/preparat/promet error:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja prometa preparata." },
      { status: 500 }
    );
  }
}