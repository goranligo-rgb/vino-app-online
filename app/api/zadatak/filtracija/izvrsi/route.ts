export const dynamic = "force-dynamic";

// Vercel prekida funkciju bez obzira na to sto Prisma radi. Ako platforma
// istekne prva, korisnik dobije grubi 504 FUNCTION_INVOCATION_TIMEOUT umjesto
// nase poruke, i ne zna je li sto ostalo napola. Zato gornja granica funkcije
// mora biti OSJETNO veca od Prisminog budzeta:
//   Prisma najgori slucaj = maxWait 5 s + timeout 20 s = 25 s
//   maxDuration           = 60 s
// Prisma tako uvijek istekne prva, s dvostrukom rezervom. 60 s je i najveca
// vrijednost koju dopusta najnizi Vercel plan, pa vrijedi na svakom.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser, smijeRaditiUPodrumu } from "@/lib/zadatak-auth";
import { FiltracijaGreska, izvrsiFiltraciju } from "@/lib/filtracija";

/**
 * Izvrsenje filtracije.
 *
 * Cijeli posao ide u JEDNOJ transakciji: zakljucavanje tankova, sve provjere,
 * izlaz iz izvornog tanka i svi ulazi u ciljne. Ako bilo sto padne, ne ostaje
 * nista — nema stanja u kojem je vino izaslo, a nije nikamo uslo.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    if (!smijeRaditiUPodrumu(user)) {
      return NextResponse.json(
        { error: "Nemate pravo izvrsiti filtraciju." },
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

    // Novi naziv vina po ciljnom tanku — salje se samo za tankove u kojima je
    // zateceno drugo vino. Za ostale se ignorira.
    const naziviVina: Record<string, string> = {};

    if (body?.naziviVina && typeof body.naziviVina === "object") {
      for (const [ciljTankId, naziv] of Object.entries(body.naziviVina)) {
        const ociscen = String(naziv ?? "").trim();
        if (ociscen) naziviVina[String(ciljTankId)] = ociscen;
      }
    }

    // Stvarno izmjerene kolicine. Ako ih forma posalje, one su mjerodavne i
    // upisuju se natrag u zadatak (izvrsiFiltraciju to radi u istoj transakciji);
    // ako ih nema, vrijede planirane iz zadatka.
    const kolicinaIzlaz =
      body?.kolicinaIzlaz === undefined ||
      body?.kolicinaIzlaz === null ||
      String(body.kolicinaIzlaz).trim() === ""
        ? null
        : Number(String(body.kolicinaIzlaz).replace(",", "."));

    const stavke = Array.isArray(body?.stavke)
      ? body.stavke.map((s: { ciljTankId?: unknown; kolicina?: unknown }) => ({
          ciljTankId: String(s?.ciljTankId ?? "").trim(),
          kolicina: Number(String(s?.kolicina ?? "").replace(",", ".")),
        }))
      : null;

    // Zadani Prisma timeout od 5 s je premalen: transakcija zakljucava retke
    // svih ukljucenih tankova (jedan upit po tanku), cita njihov sastav, pise
    // izlaz i sve ulaze, pa jos jednom cita stanje za snapshot. Na udaljenoj
    // bazi (Supabase pooler) to je i preko 40 upita s mreznom latencijom.
    //   timeout 20 s — s rezervom za filtraciju u vise ciljnih tankova,
    //                  a dovoljno kratko da se brave ne drze predugo.
    //   maxWait  5 s — koliko se ceka na slobodnu vezu iz poola prije nego
    //                  transakcija uopce pocne. NIJE dio timeouta, ali JEST
    //                  dio trajanja funkcije, pa se drzi nisko (cekanje na
    //                  vezu je inace ispod sekunde) da ukupno stane u
    //                  maxDuration s rezervom.
    const rezultat = await prisma.$transaction(
      async (tx) => {
        const zadatak = await tx.zadatak.findUnique({
          where: { id: zadatakId },
          select: { id: true, vrsta: true },
        });

        if (!zadatak) {
          throw new FiltracijaGreska("Zadatak nije pronaden.");
        }

        if (zadatak.vrsta !== "FILTRACIJA") {
          throw new FiltracijaGreska(
            "Ovaj zadatak nije filtracija — izvrsi ga kroz obicno izvrsenje zadatka."
          );
        }

        // Redoslijed zadataka provjerava izvrsiFiltraciju, i to za SVE
        // ukljucene tankove (izvorni + ciljni), pod vec uzetim bravama.
        return izvrsiFiltraciju(tx, {
          zadatakId: zadatak.id,
          izvrsioKorisnikId: user.id,
          naziviVina,
          kolicinaIzlaz,
          stavke,
        });
      },
      { timeout: 20_000, maxWait: 5_000 }
    );

    return NextResponse.json({
      ok: true,
      message: "Filtracija je izvrsena.",
      ...rezultat,
    });
  } catch (error) {
    if (error instanceof FiltracijaGreska) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // P2028 = transakcija je istekla ili je zatvorena prije kraja. Postgres je
    // tada sve vratio unatrag: vino nije izaslo ni uslo, zadatak je i dalje
    // otvoren. Korisniku to treba i reci, da ne pomisli da je pola proslo.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2028"
    ) {
      return NextResponse.json(
        {
          error:
            "Filtracija je predugo trajala pa je prekinuta. Nista nije promijenjeno — zadatak je i dalje otvoren, pokusaj ponovno.",
        },
        { status: 503 }
      );
    }

    console.error("POST /api/zadatak/filtracija/izvrsi error:", error);

    return NextResponse.json(
      { error: "Greska kod izvrsenja filtracije." },
      { status: 500 }
    );
  }
}
