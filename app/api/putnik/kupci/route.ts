import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePutnikAccess } from "@/lib/putnik-auth";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function num(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const auth = await requirePutnikAccess();
  if (auth instanceof NextResponse) return auth;

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
  const auth = await requirePutnikAccess();
  if (auth instanceof NextResponse) return auth;

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

        sifraKupca: clean(body.sifraKupca),
        narudzbaOsoba: clean(body.narudzbaOsoba),
        narudzbaTelefon: clean(body.narudzbaTelefon),
        narudzbaEmail: clean(body.narudzbaEmail),
        naplataOsoba: clean(body.naplataOsoba),
        naplataTelefon: clean(body.naplataTelefon),
        naplataEmail: clean(body.naplataEmail),
        nacinPlacanja: clean(body.nacinPlacanja),
        garancijaPlacanja: clean(body.garancijaPlacanja),
        kreditniLimit: num(body.kreditniLimit),

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