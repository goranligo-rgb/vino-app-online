export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("auth_user")?.value;
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function isLevel1(user: AuthUser | null) {
  return user?.role === "ADMIN" || user?.role === "ENOLOG";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function normalizeUnit(v?: string | null) {
  return String(v ?? "").trim().toLowerCase();
}

function convertValue(value: number, from?: string | null, to?: string | null) {
  const f = normalizeUnit(from);
  const t = normalizeUnit(to);

  if (!f || !t || f === t) return Number(value);

  const mass: Record<string, number> = {
    mg: 0.001,
    g: 1,
    dkg: 10,
    kg: 1000,
  };

  const volume: Record<string, number> = {
    ml: 1,
    dl: 100,
    dcl: 100,
    l: 1000,
    hl: 100000,
  };

  if (mass[f] && mass[t]) {
    const grams = value * mass[f];
    return Number((grams / mass[t]).toFixed(4));
  }

  if (volume[f] && volume[t]) {
    const ml = value * volume[f];
    return Number((ml / volume[t]).toFixed(4));
  }

  return Number(value);
}

export async function GET() {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    const ulazi = await prisma.preparationStockEntry.findMany({
      include: {
        unit: true,
        preparation: {
          select: {
            id: true,
            naziv: true,
          },
        },
      },
      orderBy: {
        datum: "desc",
      },
      take: 20,
    });

    return NextResponse.json(ulazi);
  } catch (error) {
    console.error("GET /api/preparat/ulaz error:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja ulaza preparata." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    if (!isLevel1(user)) {
      return NextResponse.json(
        { error: "Nemate pravo za unos preparata u skladište." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const preparationId = String(body?.preparationId ?? "").trim();
    const unitId = String(body?.unitId ?? "").trim();
    const kolicinaNum = toNumber(body?.kolicina);
    const dobavljac = String(body?.dobavljac ?? "").trim() || null;
    const brojDokumenta = String(body?.brojDokumenta ?? "").trim() || null;
    const napomena = String(body?.napomena ?? "").trim() || null;

    if (!preparationId) {
      return NextResponse.json(
        { error: "Preparat je obavezan." },
        { status: 400 }
      );
    }

    if (kolicinaNum == null || kolicinaNum <= 0) {
      return NextResponse.json(
        { error: "Količina mora biti veća od 0." },
        { status: 400 }
      );
    }

    if (!unitId) {
      return NextResponse.json(
        { error: "Jedinica je obavezna." },
        { status: 400 }
      );
    }

    const rezultat = await prisma.$transaction(async (tx) => {
      const preparat = await tx.preparation.findUnique({
        where: { id: preparationId },
        include: {
          unit: true,
          skladisnaJedinica: true,
        },
      });

      if (!preparat) {
        throw new Error("Preparat nije pronađen.");
      }

      const ulaznaJedinica = await tx.unit.findUnique({
        where: { id: unitId },
      });

      if (!ulaznaJedinica) {
        throw new Error("Jedinica nije pronađena.");
      }

      const stockUnit =
        preparat.skladisnaJedinica?.naziv ?? preparat.unit?.naziv ?? null;

      const potrebnoZaStanje = convertValue(
        Number(kolicinaNum),
        ulaznaJedinica.naziv,
        stockUnit
      );

      const entry = await tx.preparationStockEntry.create({
        data: {
          preparationId: preparat.id,
          kolicina: kolicinaNum,
          unitId,
          dobavljac,
          brojDokumenta,
          napomena,
        },
        include: {
          unit: true,
          preparation: {
            select: {
              id: true,
              naziv: true,
            },
          },
        },
      });

      const novoStanje =
        Number(preparat.stanjeNaSkladistu ?? 0) + Number(potrebnoZaStanje);

      const updated = await tx.preparation.update({
        where: { id: preparat.id },
        data: {
          stanjeNaSkladistu: novoStanje,
        },
        include: {
          unit: true,
          skladisnaJedinica: true,
        },
      });

      return {
        entry,
        updated,
        preracunataKolicinaZaSkladiste: potrebnoZaStanje,
        skladisnaJedinicaNaziv: stockUnit,
      };
    });

    return NextResponse.json({
      success: true,
      message: "Ulaz preparata evidentiran.",
      data: rezultat,
    });
  } catch (error) {
    console.error("POST /api/preparat/ulaz error:", error);

    if (
      error instanceof Error &&
      ["Preparat nije pronađen.", "Jedinica nije pronađena."].includes(
        error.message
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Greška kod unosa u skladište." },
      { status: 500 }
    );
  }
}