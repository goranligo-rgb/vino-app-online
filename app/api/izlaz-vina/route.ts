export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";
import { imenaPodruma } from "@/lib/ime-vina";
import { jeL12 } from "@/lib/auth-role";
import {
  IzlazGreska,
  izvrsiIzlaz,
  pripremiIzlaz,
  type PripremljenIzlaz,
} from "@/lib/izlaz-vina";

type AuthUser = {
  id: string;
  ime?: string;
  username?: string;
  email?: string;
  role?: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};


async function getAuthUser(): Promise<AuthUser | null> {
  return citajSesiju();
}

function broj(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDatum(value: unknown): Date {
  if (!value) return new Date();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// Izvoz zadrzan zbog scripts/test-arhiviranje-baza.ts, koji ga uvozi odavde:
// funkcija je od koraka 5b u lib/izlaz-vina.ts, a test ostaje nepromijenjen
// kao dokaz da je izdvajanje doslovno.
export { arhivirajPrazanTank } from "@/lib/izlaz-vina";


export async function POST(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    // ROLA. Do 29.09.2026. ruta je provjeravala samo prijavu, pa je izlaz
    // (punjenje u boce, prodaju — i arhiviranje tanka koje ga prati) mogao
    // upisati i PREGLED. Ista rupa kao PATCH /api/arhiva. Izlaz upisuju ADMIN
    // i PODRUM; ENOLOG stranicu /izlaz-vina vidi, ali samo popis i poveznice
    // (obrazac je skriven istim pravilom). Provjera ide PRIJE citanja tijela.
    if (!jeL12(user.role)) {
      return NextResponse.json({ error: "Nemaš pravo pristupa." }, { status: 403 });
    }

    const body = await req.json();

    const tankId = String(body?.tankId || "").trim();
    const tip = String(body?.tip || "").trim().toUpperCase();
    const datum = parseDatum(body?.datum);
    const kolicinaLitara = broj(body?.kolicinaLitara);
    const brojBocaRaw = broj(body?.brojBoca);
    const volumenBoce = broj(body?.volumenBoce);
    const korisnickaNapomena =
      body?.napomena && String(body.napomena).trim()
        ? String(body.napomena).trim()
        : null;

    if (!tankId) {
      return NextResponse.json(
        { error: "Tank je obavezan." },
        { status: 400 }
      );
    }

    if (tip !== "PRODAJA" && tip !== "PUNJENJE") {
      return NextResponse.json(
        { error: "Tip mora biti PRODAJA ili PUNJENJE." },
        { status: 400 }
      );
    }

    if (kolicinaLitara === null || kolicinaLitara <= 0) {
      return NextResponse.json(
        { error: "Količina litara mora biti veća od 0." },
        { status: 400 }
      );
    }

    if (tip === "PUNJENJE" && (volumenBoce === null || volumenBoce <= 0)) {
      return NextResponse.json(
        { error: "Volumen boce mora biti veći od 0." },
        { status: 400 }
      );
    }

    // Tank, provjera stanja i izracun — lib/izlaz-vina.ts. Greska nosi isti
    // status i istu poruku kao dosadasnji odgovori ove rute.
    let pripremljen: PripremljenIzlaz;
    try {
      pripremljen = await pripremiIzlaz(prisma, {
        tankId,
        tip,
        datum,
        kolicinaLitara,
        brojBocaRaw,
        volumenBoce,
        korisnickaNapomena,
      });
    } catch (e) {
      if (e instanceof IzlazGreska) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const { tank, trenutnoLitara, novoStanje } = pripremljen;

    const rezultat = await prisma.$transaction((tx) =>
      izvrsiIzlaz(tx, pripremljen, { id: user.id, ime: user.ime ?? null })
    );


    return NextResponse.json({
      ok: true,
      message:
        tip === "PUNJENJE"
          ? "Punjenje je evidentirano."
          : "Prodaja je evidentirana.",
      izlaz: rezultat.izlaz,
      arhivaId: rezultat.arhivaId,
      tank: {
        id: tank.id,
        broj: tank.broj,
        staroStanje: trenutnoLitara,
        novoStanje,
      },
    });
  } catch (error: any) {
    console.error("POST /api/izlaz-vina error:", error);

    if (error?.code === "P2021") {
      return NextResponse.json(
        {
          error:
            "Tablica za izlaz vina ili arhivu punjenja još nije kreirana u bazi. Prvo napravi Prisma update.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod spremanja izlaza vina." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const tankId = searchParams.get("tankId")?.trim() || undefined;
    const tipRaw = searchParams.get("tip")?.trim().toUpperCase();
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limitRaw = Number(searchParams.get("limit") || "100");

    const tip =
      tipRaw === "PRODAJA" || tipRaw === "PUNJENJE" ? tipRaw : undefined;

    const where: {
      tankId?: string;
      tip?: "PRODAJA" | "PUNJENJE";
      datum?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    if (tankId) where.tankId = tankId;
    if (tip) where.tip = tip;

    if (dateFrom || dateTo) {
      where.datum = {};
      if (dateFrom) {
        const d1 = new Date(dateFrom);
        if (!Number.isNaN(d1.getTime())) where.datum.gte = d1;
      }
      if (dateTo) {
        const d2 = new Date(dateTo);
        if (!Number.isNaN(d2.getTime())) where.datum.lte = d2;
      }
    }

    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;

    const sirovi = await prisma.izlazVina.findMany({
      where,
      orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        tank: {
          select: {
            id: true,
            broj: true,
            sorta: true,
            godiste: true,
          },
        },
      },
    });

    // IME TANKA JE IZVEDENO (faza 5) — `Tank.nazivVina` se vise ne pise. Pod
    // istim imenom polja kao do sada, da ekran ne treba mijenjati.
    const imena = await imenaPodruma(prisma);
    const izlazi = sirovi.map((row) => ({
      ...row,
      tank: row.tank
        ? { ...row.tank, nazivVina: imena.get(row.tank.id)?.naziv ?? null }
        : row.tank,
    }));

    const ukupnoLitara = izlazi.reduce(
      (sum, row) => sum + Number(row.kolicinaLitara || 0),
      0
    );

    return NextResponse.json({
      ok: true,
      count: izlazi.length,
      ukupnoLitara,
      izlazi,
    });
  } catch (error: any) {
    console.error("GET /api/izlaz-vina error:", error);

    if (error?.code === "P2021") {
      return NextResponse.json({
        ok: true,
        count: 0,
        ukupnoLitara: 0,
        izlazi: [],
        warning: "Tablica IzlazVina još nije kreirana u bazi.",
      });
    }

    return NextResponse.json(
      { error: "Greška kod dohvaćanja izlaza vina." },
      { status: 500 }
    );
  }
}