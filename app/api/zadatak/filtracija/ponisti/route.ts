export const dynamic = "force-dynamic";

// Isti razlog kao kod izvrsenja: Prisma mora isteci prije Vercela, inace
// korisnik dobije 504 platforme umjesto jasne poruke.
//   Prisma najgori slucaj = maxWait 5 s + timeout 20 s = 25 s
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser, smijeUpravljati } from "@/lib/zadatak-auth";
import { FiltracijaGreska, ponistiFiltraciju } from "@/lib/filtracija";

/**
 * Ponistavanje izvrsene filtracije — vraca sve ukljucene tankove na stanje
 * prije izvrsenja i zadatak natrag u OTVOREN.
 *
 * Samo ADMIN i ENOLOG: radnja vraca kolicine i identitet vina na vise tankova
 * odjednom, pa je namjerno uza od samog izvrsenja.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    if (!smijeUpravljati(user)) {
      return NextResponse.json(
        { error: "Nemate pravo ponistiti filtraciju." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const zadatakId = String(body?.zadatakId ?? "").trim();

    if (!zadatakId) {
      return NextResponse.json(
        { error: "Nedostaje zadatakId." },
        { status: 400 }
      );
    }

    // Ponistavanje radi jos vise upita od izvrsenja: uz zakljucavanje i vracanje
    // stanja ide i sest provjera "ima li kasnijih promjena" te ponovno citanje
    // svakog tanka za usporedbu otiska. Zato isti, prosireni okvir kao kod
    // izvrsenja (zadanih 5 s je premalo).
    const rezultat = await prisma.$transaction(
      (tx) => ponistiFiltraciju(tx, { zadatakId }),
      { timeout: 20_000, maxWait: 5_000 }
    );

    return NextResponse.json({
      ok: true,
      message: "Filtracija je ponistena, zadatak je ponovno otvoren.",
      ...rezultat,
    });
  } catch (error) {
    if (error instanceof FiltracijaGreska) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2028"
    ) {
      return NextResponse.json(
        {
          error:
            "Ponistavanje je predugo trajalo pa je prekinuto. Nista nije vraceno — filtracija je i dalje izvrsena, pokusaj ponovno.",
        },
        { status: 503 }
      );
    }

    console.error("POST /api/zadatak/filtracija/ponisti error:", error);

    return NextResponse.json(
      { error: "Greska kod ponistavanja filtracije." },
      { status: 500 }
    );
  }
}
