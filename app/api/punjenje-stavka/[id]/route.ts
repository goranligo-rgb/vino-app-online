export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Nedostaje ID stavke." },
        { status: 400 }
      );
    }

    const stavka = await prisma.punjenjeStavka.findUnique({
      where: { id },
      select: {
        id: true,
        punjenjeId: true,
        obrisano: true,
        nazivSorte: true,
        kolicinaLitara: true,
        kolicinaKgGrozdja: true,
        godinaBerbe: true,
        punjenje: {
          select: {
            id: true,
            tankId: true,
            nazivVina: true,
            datumPunjenja: true,
            pocetnoMjerenjeId: true,
            prethodnaKolicinaUTanku: true,
            prethodnaSorta: true,
            prethodniNazivVina: true,
            prethodnoGodiste: true,
            prethodniSastavJson: true,
            tank: {
              select: {
                broj: true,
                tip: true,
              },
            },
          },
        },
      },
    });

    if (!stavka) {
      return NextResponse.json(
        { error: "Stavka ne postoji." },
        { status: 404 }
      );
    }

    if (stavka.obrisano) {
      return NextResponse.json(
        { error: "Stavka je već obrisana." },
        { status: 400 }
      );
    }

    if (!stavka.punjenje?.tankId) {
      return NextResponse.json(
        { error: "Punjenje nije povezano s tankom." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const tankId = stavka.punjenje!.tankId;
      const datumPunjenja = stavka.punjenje?.datumPunjenja ?? null;

      if (!datumPunjenja) {
        throw new Error("Punjenje nema datum.");
      }

      /**
       * 1. Provjeri koliko aktivnih stavki ima to punjenje prije brisanja
       */
      const brojAktivnihStavkiPrije = await tx.punjenjeStavka.count({
        where: {
          punjenjeId: stavka.punjenjeId,
          obrisano: false,
        },
      });

      const briseZadnjuAktivnuStavku = brojAktivnihStavkiPrije === 1;

      /**
       * 2. Ako nakon ovog punjenja postoje novija aktivna punjenja,
       * ne dopuštamo brisanje zadnje stavke tog punjenja
       */
      if (briseZadnjuAktivnuStavku) {
        const postojiKasnijeAktivnoPunjenje = await tx.punjenjeTanka.count({
          where: {
            tankId,
            datumPunjenja: {
              gt: datumPunjenja,
            },
            stavke: {
              some: {
                obrisano: false,
              },
            },
          },
        });

        if (postojiKasnijeAktivnoPunjenje > 0) {
          throw new Error(
            "Ovo punjenje se ne može obrisati jer nakon njega postoje novija aktivna punjenja u istom tanku."
          );
        }
      }

      /**
       * 3. Izvršeni zadaci od ovog punjenja nadalje = nema brisanja
       */
      const brojIzvrsenihZadataka = await tx.zadatak.count({
        where: {
          tankId,
          status: "IZVRSEN",
          OR: [
            {
              izvrsenoAt: {
                gte: datumPunjenja,
              },
            },
            {
              AND: [
                { izvrsenoAt: null },
                {
                  zadanoAt: {
                    gte: datumPunjenja,
                  },
                },
              ],
            },
          ],
        },
      });

      if (brojIzvrsenihZadataka > 0) {
        throw new Error(
          "Ova berba se više ne može obrisati jer su na njoj već izvršeni zadaci. Brisanje je moguće samo dok nema izvršenih radnji."
        );
      }

      /**
       * 4. OTVOREN i OTKAZAN zadatak od ovog punjenja nadalje brišemo automatski
       */
      await tx.zadatakStavka.deleteMany({
        where: {
          zadatak: {
            tankId,
            status: {
              in: ["OTVOREN", "OTKAZAN"],
            },
            zadanoAt: {
              gte: datumPunjenja,
            },
          },
        },
      });

      await tx.radnja.deleteMany({
        where: {
          zadatak: {
            tankId,
            status: {
              in: ["OTVOREN", "OTKAZAN"],
            },
            zadanoAt: {
              gte: datumPunjenja,
            },
          },
        },
      });

      await tx.zadatak.deleteMany({
        where: {
          tankId,
          status: {
            in: ["OTVOREN", "OTKAZAN"],
          },
          zadanoAt: {
            gte: datumPunjenja,
          },
        },
      });

      /**
       * 5. Soft delete stavke
       */
      await tx.punjenjeStavka.update({
        where: { id },
        data: {
          obrisano: true,
          obrisanoAt: new Date(),
        },
      });

      /**
       * 6. Aktivne stavke tog punjenja nakon brisanja
       */
      const aktivneStavkePunjenja = await tx.punjenjeStavka.findMany({
        where: {
          punjenjeId: stavka.punjenjeId,
          obrisano: false,
        },
        select: {
          id: true,
          nazivSorte: true,
          kolicinaLitara: true,
          kolicinaKgGrozdja: true,
          godinaBerbe: true,
        },
      });

      const ukupnoLitaraPunjenje = aktivneStavkePunjenja.reduce(
        (sum, s) => sum + Number(s.kolicinaLitara || 0),
        0
      );

      const ukupnoKgGrozdjaPunjenje = aktivneStavkePunjenja.reduce(
        (sum, s) => sum + Number(s.kolicinaKgGrozdja || 0),
        0
      );

      await tx.punjenjeTanka.update({
        where: { id: stavka.punjenjeId },
        data: {
          ukupnoLitara: ukupnoLitaraPunjenje,
          ukupnoKgGrozdja: ukupnoKgGrozdjaPunjenje,
        },
      });

      /**
       * 7. Ako su još ostale stavke u ISTOM punjenju,
       * samo preračunamo tank iz svih aktivnih punjenja
       */
      if (aktivneStavkePunjenja.length > 0) {
        const aktivnaPunjenjaTanka = await tx.punjenjeTanka.findMany({
          where: {
            tankId,
            stavke: {
              some: {
                obrisano: false,
              },
            },
          },
          orderBy: {
            datumPunjenja: "desc",
          },
          select: {
            id: true,
            nazivVina: true,
            datumPunjenja: true,
            stavke: {
              where: {
                obrisano: false,
              },
              select: {
                nazivSorte: true,
                kolicinaLitara: true,
                godinaBerbe: true,
              },
            },
          },
        });

        const sveAktivneStavkeTanka = aktivnaPunjenjaTanka.flatMap((p) => p.stavke);

        const novaKolicinaUTanku = sveAktivneStavkeTanka.reduce(
          (sum, s) => sum + Number(s.kolicinaLitara || 0),
          0
        );

        if (aktivnaPunjenjaTanka.length === 0 || novaKolicinaUTanku <= 0) {
          await tx.tank.update({
            where: { id: tankId },
            data: {
              kolicinaVinaUTanku: 0,
              sorta: null,
              nazivVina: null,
              godiste: null,
            },
          });

          await tx.tankContent.deleteMany({
            where: { tankId },
          });

          await tx.tankSortaUdio.deleteMany({
            where: { tankId },
          });

          return;
        }

        const litaraPoSorti = new Map<string, number>();

        for (const s of sveAktivneStavkeTanka) {
          const naziv = String(s.nazivSorte || "").trim();
          if (!naziv) continue;
          litaraPoSorti.set(
            naziv,
            (litaraPoSorti.get(naziv) ?? 0) + Number(s.kolicinaLitara || 0)
          );
        }

        const noviUdjeli = Array.from(litaraPoSorti.entries())
          .map(([nazivSorte, litara]) => ({
            nazivSorte,
            postotak:
              novaKolicinaUTanku > 0 ? (litara / novaKolicinaUTanku) * 100 : 0,
          }))
          .filter((u) => u.postotak > 0);

        await tx.tankSortaUdio.deleteMany({
          where: { tankId },
        });

        if (noviUdjeli.length > 0) {
          await tx.tankSortaUdio.createMany({
            data: noviUdjeli.map((u) => ({
              tankId,
              nazivSorte: u.nazivSorte,
              postotak: u.postotak,
            })),
          });
        }

        const jedinstveneSorte = Array.from(
          new Set(
            sveAktivneStavkeTanka
              .map((s) => String(s.nazivSorte || "").trim())
              .filter(Boolean)
          )
        );

        const jedinstenaGodista = Array.from(
          new Set(
            sveAktivneStavkeTanka
              .map((s) => s.godinaBerbe)
              .filter((g): g is number => g !== null && g !== undefined)
          )
        );

        const zadnjeAktivnoPunjenje = aktivnaPunjenjaTanka[0] ?? null;

        const novaSorta =
          jedinstveneSorte.length === 1
            ? jedinstveneSorte[0]
            : zadnjeAktivnoPunjenje?.nazivVina || "Cuvée";

        const novoGodiste =
          jedinstveneSorte.length === 1 && jedinstenaGodista.length === 1
            ? jedinstenaGodista[0]
            : null;

        const noviNazivVina =
          zadnjeAktivnoPunjenje?.nazivVina ??
          (jedinstveneSorte.length === 1 ? jedinstveneSorte[0] : null);

        await tx.tank.update({
          where: { id: tankId },
          data: {
            kolicinaVinaUTanku: novaKolicinaUTanku,
            sorta: novaSorta,
            nazivVina: noviNazivVina,
            godiste: novoGodiste,
          },
        });

        await tx.tankContent.upsert({
          where: { tankId },
          update: {
            sorta:
              jedinstveneSorte.length === 1
                ? jedinstveneSorte[0]
                : noviNazivVina || "Mješavina",
            kolicina: novaKolicinaUTanku,
            datumUlaza: zadnjeAktivnoPunjenje?.datumPunjenja ?? new Date(),
          },
          create: {
            tankId,
            sorta:
              jedinstveneSorte.length === 1
                ? jedinstveneSorte[0]
                : noviNazivVina || "Mješavina",
            kolicina: novaKolicinaUTanku,
            datumUlaza: zadnjeAktivnoPunjenje?.datumPunjenja ?? new Date(),
          },
        });

        return;
      }

      /**
       * 8. Ako je to punjenje ostalo bez ijedne stavke:
       * - briši početno mjerenje
       * - vrati tank na snapshot PRIJE tog punjenja
       */
      await tx.punjenjeTanka.update({
        where: { id: stavka.punjenjeId },
        data: {
          pocetnoMjerenjeId: null,
        },
      });

      if (stavka.punjenje?.pocetnoMjerenjeId) {
        await tx.mjerenje.deleteMany({
          where: {
            id: stavka.punjenje.pocetnoMjerenjeId,
          },
        });
      }

      const prethodnaKolicina = Number(
        stavka.punjenje.prethodnaKolicinaUTanku ?? 0
      );
      const prethodnaSorta = stavka.punjenje.prethodnaSorta ?? null;
      const prethodniNazivVina = stavka.punjenje.prethodniNazivVina ?? null;
      const prethodnoGodiste = stavka.punjenje.prethodnoGodiste ?? null;

      const prethodniSastavJson = Array.isArray(
        stavka.punjenje.prethodniSastavJson
      )
        ? stavka.punjenje.prethodniSastavJson
        : [];

      await tx.tank.update({
        where: { id: tankId },
        data: {
          kolicinaVinaUTanku: prethodnaKolicina,
          sorta: prethodnaSorta,
          nazivVina: prethodniNazivVina,
          godiste: prethodnoGodiste,
        },
      });

      if (prethodnaKolicina > 0) {
        await tx.tankContent.upsert({
          where: { tankId },
          update: {
            sorta: prethodnaSorta || prethodniNazivVina || "Mješavina",
            kolicina: prethodnaKolicina,
            datumUlaza: datumPunjenja,
          },
          create: {
            tankId,
            sorta: prethodnaSorta || prethodniNazivVina || "Mješavina",
            kolicina: prethodnaKolicina,
            datumUlaza: datumPunjenja,
          },
        });
      } else {
        await tx.tankContent.deleteMany({
          where: { tankId },
        });
      }

      await tx.tankSortaUdio.deleteMany({
        where: { tankId },
      });

      if (prethodnaKolicina > 0 && prethodniSastavJson.length > 0) {
        await tx.tankSortaUdio.createMany({
          data: prethodniSastavJson
            .filter(
              (u: any) =>
                u &&
                typeof u.nazivSorte === "string" &&
                typeof u.postotak === "number"
            )
            .map((u: any) => ({
              tankId,
              nazivSorte: u.nazivSorte,
              postotak: u.postotak,
            })),
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Greška kod brisanja stavke:", error);

    return NextResponse.json(
      {
        error: error?.message || "Greška kod brisanja stavke.",
      },
      { status: 500 }
    );
  }
}