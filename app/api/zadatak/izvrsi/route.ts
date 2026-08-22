export const dynamic = "force-dynamic";

// Ista granica kao u PUT /api/zadatak: Prisma (maxWait 5 s + timeout 20 s =
// 25 s) mora uvijek isteci prije nego Vercel prekine funkciju, da korisnik
// dobije nasu poruku umjesto 504 FUNCTION_INVOCATION_TIMEOUT.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { osigurajRedoslijed } from "@/lib/zadatak-redoslijed";
import {
  jePrijenosVina,
  porukaVlastitiEkran,
  PORUKE_VLASTITI_EKRAN,
} from "@/lib/vrste-prijenosa";

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
    // Zadani Prisma timeout od 5 s je premalen na udaljenoj bazi (Supabase
    // pooler): svaki upit u transakciji nosi mreznu latenciju. Iste granice
    // kao u PUT /api/zadatak, gdje je zadatak s 5 stavki pao na P2028.
    const rezultat = await prisma.$transaction(async (tx) => {
      const zadatak = await tx.zadatak.findUnique({
        where: { id: String(zadatakId) },
        select: {
          id: true,
          tankId: true,
          vrsta: true,
          status: true,
          zakljucanDo: true,
          zadanoAt: true,
          createdAt: true,
        },
      });

      if (!zadatak) {
        throw new Error("Zadatak nije pronađen.");
      }

      // Zadatak KOJI PRENOSI VINO (filtracija, flotacija ili taloženje) ne smije
      // se izvršiti ovim putem — ovdje bi se promijenio samo status, a količine
      // bi ostale krive. Cijeli posao (zaključavanje tankova, izlaz + svi
      // ulazi) radi /api/zadatak/filtracija/izvrsi.
      //
      // Uvjet je ČISTA VRSTA. Ranije je tražio i upisan izlaz ili ciljne
      // tankove, kako bi stara "gola" filtracija — puka bilješka da je posao
      // odrađen — i dalje prolazila golim klikom. To je namjerno maknuto:
      // prijenosni zadatak bez brojki nije završen posao nego neispunjen
      // obrazac, i mora proći kroz formu koja te brojke traži. Prije promjene
      // provjereno u bazi: 5 filtracija ukupno, nijedna OTVORENA, pa nijedan
      // zadatak nije ostao zaglavljen.
      //
      // OVO JE NAJOPASNIJI GUARD U APLIKACIJI. Da propusti prijenosnu vrstu,
      // zadatak bi otišao u IZVRSEN bez ijedne greške, a vino bi ostalo u
      // izvornom tanku — tiho, bez traga i bez mogućnosti poništavanja
      // (snapshotJson ne bi ni postojao).
      if (jePrijenosVina(zadatak.vrsta)) {
        throw new Error(porukaVlastitiEkran(zadatak.vrsta));
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
    }, { timeout: 20_000, maxWait: 5_000 });

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
        // Iz istog izvora kao i sama poruka — inače bi promjena teksta tiho
        // pretvorila jasan HTTP 400 u generički 500.
        ...PORUKE_VLASTITI_EKRAN,
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

    // P2028 = transakcija je istekla; Postgres je sve vratio unatrag pa je
    // zadatak i dalje otvoren. Isti obrazac: PUT /api/zadatak, filtracija/izvrsi.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2028"
    ) {
      return NextResponse.json(
        {
          error:
            "Spremanje je predugo trajalo pa je prekinuto. Ništa nije promijenjeno — zadatak je i dalje otvoren, pokušaj ponovno.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod izvršenja zadatka." },
      { status: 500 }
    );
  }
}
