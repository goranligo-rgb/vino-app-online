// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { citajGranicuArhive, odGranice } from "@/lib/granica-arhive";

function brojIliNull(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isNaN(x) ? null : x;
}

function datumIliNull(v: unknown): Date | null {
  if (v === "" || v === null || v === undefined) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ima li zapis ista izmjereno.
 *
 * Do 28.08.2026. je ruta trazila samo `tankId`, pa je prazna forma stvarala
 * mjerenje bez ijedne brojke. Takav redak se u popisu prikaze kao red crtica,
 * ulazi u "zadnje mjerenje" i nista ne kaze.
 *
 * NAPOMENA NIJE VRIJEDNOST. Biljeska bez ijedne brojke nije mjerenje — nema
 * je gdje procitati (`imaKlasicneParametre` u app/mjerenje/page.tsx trazi
 * upravo ove stupce), a za biljesku uz tank vec postoji zadatak.
 *
 * Bentotest JEST dovoljan sam za sebe: to je zaseban postupak s vlastitim
 * datumom i statusom, i forma ga vec zna prikazati sama (`jeSamoBentotest`).
 *
 * Guard stoji SAMO na ovoj ruti. Automatske retke nakon pretoka i filtracije
 * pisu `tx.mjerenje.create` izravno (app/api/pretok/route.ts, lib/filtracija.ts)
 * i oni namjerno smiju biti bez vrijednosti — nose samo napomenu o podrijetlu.
 */
function imaIkakvuVrijednost(v: {
  brojevi: Array<number | null>;
  bentotestDatum: Date | null;
  bentotestStatus: string | null;
}): boolean {
  if (v.brojevi.some((x) => x !== null)) return true;
  return v.bentotestDatum !== null || v.bentotestStatus !== null;
}

export async function GET(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const tankId = searchParams.get("tankId");

    const mjerenja = await prisma.mjerenje.findMany({
      where: tankId ? { tankId } : {},
      orderBy: {
        izmjerenoAt: "desc",
      },
      take: 15,
      include: {
        tank: true,
        korisnik: true,
      },
    });

    return NextResponse.json(mjerenja);
  } catch (error) {
    console.error("Greška kod dohvaćanja mjerenja:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod dohvaćanja mjerenja.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const body = await req.json();

    const {
      tankId,
      alkohol,
      ukupneKiseline,
      hlapiveKiseline,
      slobodniSO2,
      ukupniSO2,
      secer,
      ph,
      temperatura,
      bentotestDatum,
      bentotestStatus,
      izmjerenoAt,
      napomena,
    } = body;

    if (!tankId) {
      return NextResponse.json(
        { error: "Tank je obavezan." },
        { status: 400 }
      );
    }

    const datumMjerenja = datumIliNull(izmjerenoAt) ?? new Date();

    const bentoDatum = datumIliNull(bentotestDatum);
    const bentoStatus =
      bentotestStatus === "" || bentotestStatus == null
        ? null
        : String(bentotestStatus);

    const vrijednosti = {
      alkohol: brojIliNull(alkohol),
      ukupneKiseline: brojIliNull(ukupneKiseline),
      hlapiveKiseline: brojIliNull(hlapiveKiseline),
      slobodniSO2: brojIliNull(slobodniSO2),
      ukupniSO2: brojIliNull(ukupniSO2),
      secer: brojIliNull(secer),
      ph: brojIliNull(ph),
      temperatura: brojIliNull(temperatura),
    };

    if (
      !imaIkakvuVrijednost({
        brojevi: Object.values(vrijednosti),
        bentotestDatum: bentoDatum,
        bentotestStatus: bentoStatus,
      })
    ) {
      return NextResponse.json(
        { error: "Mjerenje mora imati barem jednu vrijednost." },
        { status: 400 }
      );
    }

    const mjerenje = await prisma.$transaction(async (tx) => {
      const createdMjerenje = await tx.mjerenje.create({
        data: {
          tankId: String(tankId),

          // Tko je mjerio cita se IZ SESIJE, ne iz tijela zahtjeva. Do
          // 28.08.2026. je stajalo `korisnikId: korisnikId || null`, a
          // forma ga nije slala - pa je svih 88 zatecenih mjerenja ostalo
          // bez imena. Uz to je svatko mogao potpisati mjerenje bilo kime.
          // Zatecenih 88 OSTAJE NULL: ime se ne nagadja unatrag.
          korisnikId: user.id,

          ...vrijednosti,

          bentotestDatum: bentoDatum,
          bentotestStatus: bentoStatus,

          izmjerenoAt: datumMjerenja,
          napomena:
            napomena === "" || napomena == null ? null : String(napomena),
        },
        include: {
          tank: true,
          korisnik: true,
        },
      });

      // Mjerenje se smije zakaciti samo na punjenje iz TRENUTNOG punjenja
      // tanka. Bez granice bi — nakon faze 3 — zavrsilo na drevnom punjenju
      // koje pripada prethodnom vinu, i tom bi se punjenju podmetnulo pocetno
      // mjerenje koje s njim nema veze.
      const granica = await citajGranicuArhive(tx, String(tankId));

      const zadnjePunjenjeBezPocetnogMjerenja = await tx.punjenjeTanka.findFirst({
        where: {
          tankId: String(tankId),
          createdAt: odGranice(granica),
          pocetnoMjerenjeId: null,
          datumPunjenja: {
            lte: datumMjerenja,
          },
        },
        orderBy: {
          datumPunjenja: "desc",
        },
        select: {
          id: true,
        },
      });

      if (zadnjePunjenjeBezPocetnogMjerenja) {
        await tx.punjenjeTanka.update({
          where: {
            id: zadnjePunjenjeBezPocetnogMjerenja.id,
          },
          data: {
            pocetnoMjerenjeId: createdMjerenje.id,
          },
        });
      }

      return createdMjerenje;
    });

    return NextResponse.json({
      success: true,
      message: "Mjerenje je uspješno spremljeno.",
      mjerenje,
    });
  } catch (error) {
    console.error("Greška kod spremanja mjerenja:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod spremanja mjerenja.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const body = await req.json();

    const {
      id,
      tankId,
      alkohol,
      ukupneKiseline,
      hlapiveKiseline,
      slobodniSO2,
      ukupniSO2,
      secer,
      ph,
      temperatura,
      bentotestDatum,
      bentotestStatus,
      izmjerenoAt,
      napomena,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID mjerenja je obavezan." },
        { status: 400 }
      );
    }

    const mjerenje = await prisma.mjerenje.update({
      where: { id: String(id) },
      data: {
        tankId: tankId || undefined,

        // `korisnikId` se pri uredjivanju NE dira. Tko je mjerio ostaje tko
        // je mjerio - ispravak brojke ne prepisuje autora na onoga tko je
        // ispravljao. Prije je stizao iz tijela zahtjeva, dakle bilo tko.

        alkohol: alkohol !== undefined ? brojIliNull(alkohol) : undefined,
        ukupneKiseline:
          ukupneKiseline !== undefined
            ? brojIliNull(ukupneKiseline)
            : undefined,
        hlapiveKiseline:
          hlapiveKiseline !== undefined
            ? brojIliNull(hlapiveKiseline)
            : undefined,
        slobodniSO2:
          slobodniSO2 !== undefined ? brojIliNull(slobodniSO2) : undefined,
        ukupniSO2:
          ukupniSO2 !== undefined ? brojIliNull(ukupniSO2) : undefined,
        secer: secer !== undefined ? brojIliNull(secer) : undefined,
        ph: ph !== undefined ? brojIliNull(ph) : undefined,
        temperatura:
          temperatura !== undefined ? brojIliNull(temperatura) : undefined,

        bentotestDatum:
          bentotestDatum === ""
            ? null
            : bentotestDatum !== undefined
            ? datumIliNull(bentotestDatum)
            : undefined,

        bentotestStatus:
          bentotestStatus === ""
            ? null
            : bentotestStatus !== undefined
            ? bentotestStatus
            : undefined,

        izmjerenoAt:
          izmjerenoAt !== undefined
            ? datumIliNull(izmjerenoAt) ?? undefined
            : undefined,

        napomena:
          napomena === ""
            ? null
            : napomena !== undefined
            ? napomena
            : undefined,
      },
      include: {
        tank: true,
        korisnik: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Mjerenje je uspješno ažurirano.",
      mjerenje,
    });
  } catch (error) {
    console.error("Greška kod ažuriranja mjerenja:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod ažuriranja mjerenja.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID mjerenja je obavezan." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const postojece = await tx.mjerenje.findUnique({
        where: { id: String(id) },
        select: {
          id: true,
        },
      });

      if (!postojece) {
        throw new Error("Mjerenje nije pronađeno.");
      }

      await tx.punjenjeTanka.updateMany({
        where: {
          pocetnoMjerenjeId: String(id),
        },
        data: {
          pocetnoMjerenjeId: null,
        },
      });

      await tx.mjerenje.delete({
        where: { id: String(id) },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Mjerenje je obrisano.",
    });
  } catch (error) {
    console.error("Greška kod brisanja mjerenja:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod brisanja mjerenja.",
      },
      { status: 500 }
    );
  }
}