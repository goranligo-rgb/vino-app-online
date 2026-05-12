import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

export async function GET() {
  try {
    const kupci = await prisma.putnikKupac.findMany({
      orderBy: [
        { aktivan: "desc" },
        { nazivLokala: "asc" },
      ],
    });

    return NextResponse.json(kupci);
  } catch (error) {
    console.error("Greška GET /api/putnik/kupci:", error);

    return NextResponse.json(
      { error: "Greška kod učitavanja kupaca." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const nazivLokala = clean(body.nazivLokala);

    if (!nazivLokala) {
      return NextResponse.json(
        { error: "Naziv lokala je obavezan." },
        { status: 400 }
      );
    }

    const kupac = await prisma.putnikKupac.create({
      data: {
        nazivLokala,
        nazivFirme: clean(body.nazivFirme),
        vlasnik: clean(body.vlasnik),
        kontaktOsoba: clean(body.kontaktOsoba),
        telefon: clean(body.telefon),
        email: clean(body.email),
        oib: clean(body.oib),
        adresa: clean(body.adresa),
        grad: clean(body.grad),
        regija: clean(body.regija),
        napomena: clean(body.napomena),

        tip: body.tip || "OSTALO",
        status: body.status || "POTENCIJALNI",
        kategorija: body.kategorija || "C",
        aktivan: true,
      },
    });

    return NextResponse.json(kupac);
  } catch (error) {
    console.error("Greška POST /api/putnik/kupci:", error);

    return NextResponse.json(
      { error: "Greška kod spremanja kupca." },
      { status: 500 }
    );
  }
}