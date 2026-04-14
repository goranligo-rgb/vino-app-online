export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export async function GET() {
  try {
    const [tankovi, izlazi] = await Promise.all([
      prisma.tank.findMany({
        orderBy: { broj: "asc" },
        select: {
          id: true,
          broj: true,
          kapacitet: true,
          kolicinaVinaUTanku: true,
          tip: true,
          opis: true,
          sorta: true,
          nazivVina: true,
          godiste: true,
          udjeliSorti: {
            select: {
              nazivSorte: true,
              postotak: true,
            },
          },
        },
      }),
      prisma.izlazVina
        .findMany({
          orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            tip: true,
            datum: true,
            kolicinaLitara: true,
            brojBoca: true,
            volumenBoce: true,
            napomena: true,
            tankId: true,
            tank: {
              select: {
                id: true,
                broj: true,
                sorta: true,
                nazivVina: true,
                godiste: true,
                udjeliSorti: {
                  select: {
                    nazivSorte: true,
                    postotak: true,
                  },
                },
              },
            },
          },
        })
        .catch((error: any) => {
          if (error?.code === "P2021") {
            return [];
          }
          throw error;
        }),
    ]);

    const ukupnoLitara = round(
      tankovi.reduce((sum, t) => sum + Number(t.kolicinaVinaUTanku ?? 0), 0)
    );

    const poSortamaMap = new Map<string, number>();
    const poGodistimaMap = new Map<string, number>();
    const poNazivuVinaMap = new Map<string, number>();

    const punjenoPoSortamaMap = new Map<string, number>();
    const prodanoPoSortamaMap = new Map<string, number>();

    const poTankovima = tankovi.map((tank) => {
      const litara = Number(tank.kolicinaVinaUTanku ?? 0);

      if (litara > 0) {
        const nazivGodista =
          tank.godiste !== null && tank.godiste !== undefined
            ? String(tank.godiste)
            : "Bez godišta";

        poGodistimaMap.set(
          nazivGodista,
          round((poGodistimaMap.get(nazivGodista) ?? 0) + litara)
        );

        const nazivVina =
          tank.nazivVina?.trim() || tank.sorta?.trim() || "Bez naziva";
        poNazivuVinaMap.set(
          nazivVina,
          round((poNazivuVinaMap.get(nazivVina) ?? 0) + litara)
        );

        if (tank.udjeliSorti.length > 0) {
          for (const udio of tank.udjeliSorti) {
            const naziv = udio.nazivSorte?.trim() || "Nepoznato";
            const dioLitara = litara * (Number(udio.postotak || 0) / 100);
            poSortamaMap.set(
              naziv,
              round((poSortamaMap.get(naziv) ?? 0) + dioLitara)
            );
          }
        } else {
          const naziv = tank.sorta?.trim() || "Nepoznato";
          poSortamaMap.set(
            naziv,
            round((poSortamaMap.get(naziv) ?? 0) + litara)
          );
        }
      }

      return {
        tankId: tank.id,
        brojTanka: tank.broj,
        kapacitet: round(Number(tank.kapacitet ?? 0)),
        litara: round(litara),
        popunjenostPosto:
          Number(tank.kapacitet ?? 0) > 0
            ? round((litara / Number(tank.kapacitet)) * 100)
            : 0,
        tip: tank.tip,
        opis: tank.opis,
        sorta: tank.sorta,
        nazivVina: tank.nazivVina,
        godiste: tank.godiste,
        udjeliSorti: tank.udjeliSorti.map((u) => ({
          nazivSorte: u.nazivSorte,
          postotak: round(Number(u.postotak ?? 0)),
          litara: round(litara * (Number(u.postotak ?? 0) / 100)),
        })),
      };
    });

    for (const izlaz of izlazi ?? []) {
      const izlazLitara = Number(izlaz.kolicinaLitara ?? 0);
      const tank = izlaz.tank;

      if (!tank || izlazLitara <= 0) continue;

      if (tank.udjeliSorti && tank.udjeliSorti.length > 0) {
        for (const udio of tank.udjeliSorti) {
          const naziv = udio.nazivSorte?.trim() || "Nepoznato";
          const dioLitara = izlazLitara * (Number(udio.postotak || 0) / 100);

          if (izlaz.tip === "PUNJENJE") {
            punjenoPoSortamaMap.set(
              naziv,
              round((punjenoPoSortamaMap.get(naziv) ?? 0) + dioLitara)
            );
          }

          if (izlaz.tip === "PRODAJA") {
            prodanoPoSortamaMap.set(
              naziv,
              round((prodanoPoSortamaMap.get(naziv) ?? 0) + dioLitara)
            );
          }
        }
      } else {
        const naziv = tank.sorta?.trim() || "Nepoznato";

        if (izlaz.tip === "PUNJENJE") {
          punjenoPoSortamaMap.set(
            naziv,
            round((punjenoPoSortamaMap.get(naziv) ?? 0) + izlazLitara)
          );
        }

        if (izlaz.tip === "PRODAJA") {
          prodanoPoSortamaMap.set(
            naziv,
            round((prodanoPoSortamaMap.get(naziv) ?? 0) + izlazLitara)
          );
        }
      }
    }

    const poSortama = Array.from(poSortamaMap.entries())
      .map(([sorta, litara]) => ({
        sorta,
        litara: round(litara),
      }))
      .sort((a, b) => b.litara - a.litara);

    const poGodistima = Array.from(poGodistimaMap.entries())
      .map(([godiste, litara]) => ({
        godiste,
        litara: round(litara),
      }))
      .sort((a, b) => {
        if (a.godiste === "Bez godišta") return 1;
        if (b.godiste === "Bez godišta") return -1;
        return Number(b.godiste) - Number(a.godiste);
      });

    const poNazivimaVina = Array.from(poNazivuVinaMap.entries())
      .map(([nazivVina, litara]) => ({
        nazivVina,
        litara: round(litara),
      }))
      .sort((a, b) => b.litara - a.litara);

    const punjenoPoSortama = Array.from(punjenoPoSortamaMap.entries())
      .map(([sorta, litara]) => ({
        sorta,
        litara: round(litara),
      }))
      .sort((a, b) => b.litara - a.litara);

    const prodanoPoSortama = Array.from(prodanoPoSortamaMap.entries())
      .map(([sorta, litara]) => ({
        sorta,
        litara: round(litara),
      }))
      .sort((a, b) => b.litara - a.litara);

    const ukupnoProdanoLitara = round(
      (izlazi ?? [])
        .filter((x) => x.tip === "PRODAJA")
        .reduce((sum, x) => sum + Number(x.kolicinaLitara ?? 0), 0)
    );

    const ukupnoPunjenjeLitara = round(
      (izlazi ?? [])
        .filter((x) => x.tip === "PUNJENJE")
        .reduce((sum, x) => sum + Number(x.kolicinaLitara ?? 0), 0)
    );

    const ukupnoPunjenihBoca = (izlazi ?? [])
      .filter((x) => x.tip === "PUNJENJE")
      .reduce((sum, x) => sum + Number(x.brojBoca ?? 0), 0);

    return NextResponse.json({
      ok: true,
      sazetak: {
        ukupnoTankova: tankovi.length,
        ukupnoLitara,
        ukupnoProdanoLitara,
        ukupnoPunjenjeLitara,
        ukupnoPunjenihBoca,
      },
      poSortama,
      poGodistima,
      poNazivimaVina,
      poTankovima,
      punjenoPoSortama,
      prodanoPoSortama,
    });
  } catch (error) {
    console.error("GET /api/statistika-vina error:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja statistike vina." },
      { status: 500 }
    );
  }
}