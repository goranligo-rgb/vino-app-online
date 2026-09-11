// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sastavSvihTankova } from "@/lib/berba-model";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { imenaPodruma } from "@/lib/ime-vina";

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    // SASTAV IZ KNJIGE (faza E) — dva upita za cijeli podrum, ne po tanku.
    // `TankSortaUdio` se vise ne cita; spremljeni udjeli ostaju u bazi, ali
    // statistika ih ne gleda.
    const sastavPoTanku = await sastavSvihTankova(prisma);

    /**
     * Udjeli sorti jednog tanka, u obliku koji ovaj izracun ocekuje.
     *
     * Kad knjiga za tank ne zna nista, pada na skalarni `Tank.sorta` — isto
     * kao i prije, jer je to i dalje jedino sto o takvom tanku postoji.
     */
    const udjeliZa = (tankId: string, sorta: string | null) => {
      const iz = sastavPoTanku.get(tankId) ?? [];
      if (iz.length > 0) {
        return iz.map((x) => ({
          nazivSorte: x.nazivSorte,
          postotak: x.postotak,
        }));
      }
      const naziv = sorta?.trim();
      return naziv ? [{ nazivSorte: naziv, postotak: 100 }] : [];
    };

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

    // IME VINA JE IZVEDENO (faza 5) — `Tank.nazivVina` se vise ne pise. Cetiri
    // upita za cijeli podrum, poslije vala iznad, ne u njemu.
    const imena = await imenaPodruma(prisma);
    const nazivVinaZa = (tankId: string) => imena.get(tankId)?.naziv ?? null;

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
          nazivVinaZa(tank.id)?.trim() || tank.sorta?.trim() || "Bez naziva";
        poNazivuVinaMap.set(
          nazivVina,
          round((poNazivuVinaMap.get(nazivVina) ?? 0) + litara)
        );

        const udjeli = udjeliZa(tank.id, tank.sorta);

        if (udjeli.length > 0) {
          for (const udio of udjeli) {
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
        nazivVina: nazivVinaZa(tank.id),
        godiste: tank.godiste,
        udjeliSorti: udjeliZa(tank.id, tank.sorta).map((u) => ({
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

      // Izlaz se dijeli po sastavu tanka KAKAV JE DANAS — zateceno ogranicenje
      // koje faza E ne mijenja: prodaja od prije mjesec dana time dobiva
      // danasnji omjer sorti. Jedina je razlika odakle taj omjer dolazi.
      const udjeliIzlaza = udjeliZa(tank.id, tank.sorta);

      if (udjeliIzlaza.length > 0) {
        for (const udio of udjeliIzlaza) {
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