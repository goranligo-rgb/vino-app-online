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

export async function GET(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
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

    const [ulazi, radnje] = await Promise.all([
      prisma.preparationStockEntry.findMany({
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
        },
        orderBy: {
          datum: "desc",
        },
        take: 100,
      }),

      prisma.radnja.findMany({
        where: {
          preparatId: preparationId,
          kolicina: {
            not: null,
          },
        },
        include: {
          jedinica: {
            select: {
              id: true,
              naziv: true,
            },
          },
          tank: {
            select: {
              id: true,
              broj: true,
              nazivVina: true,
              sorta: true,
            },
          },
          preparat: {
            select: {
              id: true,
              naziv: true,
              unit: {
                select: {
                  id: true,
                  naziv: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      }),
    ]);

    const promet = [
      ...ulazi.map((u) => ({
        id: `ULAZ_${u.id}`,
        tip: "ULAZ" as const,
        datum: u.datum.toISOString(),
        kolicina: u.kolicina ?? null,
        jedinicaNaziv:
          u.unit?.naziv ??
          preparat.skladisnaJedinica?.naziv ??
          preparat.unit?.naziv ??
          null,
        tankBroj: null as number | null,
        nazivVina: null as string | null,
        sorta: null as string | null,
        dobavljac: u.dobavljac ?? null,
        brojDokumenta: u.brojDokumenta ?? null,
        napomena: u.napomena ?? null,
        opis: u.dobavljac
          ? `Ulaz od dobavljača ${u.dobavljac}`
          : "Ulaz na skladište",
      })),

      ...radnje.map((r) => ({
        id: `IZLAZ_${r.id}`,
        tip: "IZLAZ" as const,
        datum: r.createdAt.toISOString(),
        kolicina: r.kolicina ?? null,
        jedinicaNaziv:
          r.jedinica?.naziv ?? r.preparat?.unit?.naziv ?? null,
        tankBroj: r.tank?.broj ?? null,
        nazivVina: r.tank?.nazivVina ?? null,
        sorta: r.tank?.sorta ?? null,
        dobavljac: null as string | null,
        brojDokumenta: null as string | null,
        napomena: r.napomena ?? null,
        opis: r.tank
          ? `Tank ${r.tank.broj} — ${r.tank.nazivVina ?? r.tank.sorta ?? ""}`
          : r.opis ?? null,
      })),
    ].sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime());

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