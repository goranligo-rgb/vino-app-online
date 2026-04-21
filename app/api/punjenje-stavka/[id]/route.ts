export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function faktorJedinice(naziv?: string | null) {
  const key = String(naziv || "").trim().toLowerCase();

  if (key === "mg") return { grupa: "masa", faktor: 0.001 };
  if (key === "g") return { grupa: "masa", faktor: 1 };
  if (key === "dkg") return { grupa: "masa", faktor: 10 };
  if (key === "kg") return { grupa: "masa", faktor: 1000 };

  if (key === "ml") return { grupa: "volumen", faktor: 1 };
  if (key === "dl" || key === "dcl") return { grupa: "volumen", faktor: 100 };
  if (key === "l") return { grupa: "volumen", faktor: 1000 };

  return null;
}

function pretvoriKolicinu(
  vrijednost: number,
  izNaziva?: string | null,
  uNaziv?: string | null
) {
  const from = faktorJedinice(izNaziva);
  const to = faktorJedinice(uNaziv);

  if (!from || !to) {
    throw new Error(
      `Nedostaje ili je nepoznata jedinica (${izNaziva ?? "?"} -> ${uNaziv ?? "?"}).`
    );
  }

  if (from.grupa !== to.grupa) {
    throw new Error(
      `Nije moguće pretvoriti jedinicu ${izNaziva ?? "?"} u ${uNaziv ?? "?"}.`
    );
  }

  const bazno = vrijednost * from.faktor;
  return bazno / to.faktor;
}

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
            tank: {
              select: {
                broj: true,
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
      const brojTanka = stavka.punjenje?.tank?.broj ?? null;

      if (!datumPunjenja) {
        throw new Error("Punjenje nema datum, rollback nije moguće sigurno napraviti.");
      }

      /**
       * 1. Dohvati sve zadatke za ovo punjenje i nakon njega
       * - otvorene i otkazane ćemo samo obrisati
       * - izvršene ćemo prvo vratiti na skladište pa obrisati
       */
      const zadaciZaRollback = await tx.zadatak.findMany({
        where: {
          tankId,
          OR: [
            {
              zadanoAt: {
                gte: datumPunjenja,
              },
            },
            {
              izvrsenoAt: {
                gte: datumPunjenja,
              },
            },
          ],
        },
        include: {
          preparat: {
            select: {
              id: true,
              naziv: true,
              stanjeNaSkladistu: true,
              skladisnaJedinicaId: true,
              skladisnaJedinica: {
                select: {
                  id: true,
                  naziv: true,
                },
              },
            },
          },
          izlaznaJedinica: {
            select: {
              id: true,
              naziv: true,
            },
          },
          stavke: {
            include: {
              preparat: {
                select: {
                  id: true,
                  naziv: true,
                  stanjeNaSkladistu: true,
                  skladisnaJedinicaId: true,
                  skladisnaJedinica: {
                    select: {
                      id: true,
                      naziv: true,
                    },
                  },
                },
              },
              izlaznaJedinica: {
                select: {
                  id: true,
                  naziv: true,
                },
              },
            },
          },
        },
      });

      const izvrseniZadaci = zadaciZaRollback.filter((z) => z.status === "IZVRSEN");
      const ostaliZadaci = zadaciZaRollback.filter(
        (z) => z.status === "OTVOREN" || z.status === "OTKAZAN"
      );

      /**
       * 2. Vrati preparate na skladište za izvršene zadatke
       */
      for (const z of izvrseniZadaci) {
        if (z.stavke && z.stavke.length > 0) {
          for (const s of z.stavke) {
            if (!s.preparatId || s.izracunataKolicina == null || !s.preparat) continue;

            const izlaznaJedinicaNaziv = s.izlaznaJedinica?.naziv ?? null;
            const skladisnaJedinicaNaziv = s.preparat.skladisnaJedinica?.naziv ?? null;

            const kolicinaZaVratiti = pretvoriKolicinu(
              Number(s.izracunataKolicina),
              izlaznaJedinicaNaziv,
              skladisnaJedinicaNaziv
            );

            await tx.preparation.update({
              where: { id: s.preparatId },
              data: {
                stanjeNaSkladistu: {
                  increment: kolicinaZaVratiti,
                },
              },
            });

            if (!s.preparat.skladisnaJedinicaId) {
              throw new Error(
                `Preparat "${s.preparat.naziv}" nema skladišnu jedinicu pa rollback nije moguće evidentirati.`
              );
            }

            await tx.preparationStockEntry.create({
              data: {
                preparationId: s.preparatId,
                kolicina: kolicinaZaVratiti,
                unitId: s.preparat.skladisnaJedinicaId,
                datum: new Date(),
                napomena: `Povrat na skladište zbog brisanja berbe / rollbacka za tank ${brojTanka ?? tankId}`,
                brojDokumenta: `ROLLBACK-${stavka.punjenjeId}`,
                dobavljac: "Automatski rollback",
              },
            });
          }
        } else if (z.preparatId && z.izracunataKolicina != null && z.preparat) {
          const izlaznaJedinicaNaziv = z.izlaznaJedinica?.naziv ?? null;
          const skladisnaJedinicaNaziv = z.preparat.skladisnaJedinica?.naziv ?? null;

          const kolicinaZaVratiti = pretvoriKolicinu(
            Number(z.izracunataKolicina),
            izlaznaJedinicaNaziv,
            skladisnaJedinicaNaziv
          );

          await tx.preparation.update({
            where: { id: z.preparatId },
            data: {
              stanjeNaSkladistu: {
                increment: kolicinaZaVratiti,
              },
            },
          });

          if (!z.preparat.skladisnaJedinicaId) {
            throw new Error(
              `Preparat "${z.preparat.naziv}" nema skladišnu jedinicu pa rollback nije moguće evidentirati.`
            );
          }

          await tx.preparationStockEntry.create({
            data: {
              preparationId: z.preparatId,
              kolicina: kolicinaZaVratiti,
              unitId: z.preparat.skladisnaJedinicaId,
              datum: new Date(),
              napomena: `Povrat na skladište zbog brisanja berbe / rollbacka za tank ${brojTanka ?? tankId}`,
              brojDokumenta: `ROLLBACK-${stavka.punjenjeId}`,
              dobavljac: "Automatski rollback",
            },
          });
        }
      }

      /**
       * 3. Obriši radnje vezane uz zadatke od tog punjenja nadalje
       */
      const zadatakIdsZaBrisanje = zadaciZaRollback.map((z) => z.id);

      if (zadatakIdsZaBrisanje.length > 0) {
        await tx.radnja.deleteMany({
          where: {
            zadatakId: {
              in: zadatakIdsZaBrisanje,
            },
          },
        });

        await tx.zadatakStavka.deleteMany({
          where: {
            zadatakId: {
              in: zadatakIdsZaBrisanje,
            },
          },
        });

        await tx.zadatak.deleteMany({
          where: {
            id: {
              in: zadatakIdsZaBrisanje,
            },
          },
        });
      }

      /**
       * 4. Soft delete stavke berbe
       */
      await tx.punjenjeStavka.update({
        where: { id },
        data: {
          obrisano: true,
          obrisanoAt: new Date(),
        },
      });

      /**
       * 5. Aktivne stavke tog punjenja
       */
      const aktivneStavkePunjenja = await tx.punjenjeStavka.findMany({
        where: {
          punjenjeId: stavka.punjenjeId,
          obrisano: false,
        },
        select: {
          id: true,
          kolicinaLitara: true,
          kolicinaKgGrozdja: true,
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
       * 6. Ako punjenje ostane bez aktivnih stavki -> obriši početno mjerenje
       */
      if (aktivneStavkePunjenja.length === 0) {
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
      }

      /**
       * 7. Sva aktivna punjenja za taj tank koja još imaju aktivne stavke
       */
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

      /**
       * 8. Ako je tank ostao prazan -> očisti ga
       */
      if (novaKolicinaUTanku <= 0) {
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

      /**
       * 9. Preračun udjela sorti
       */
      const litaraPoSorti = new Map<string, number>();

      for (const s of sveAktivneStavkeTanka) {
        const nazivSorte = String(s.nazivSorte || "").trim();
        if (!nazivSorte) continue;

        litaraPoSorti.set(
          nazivSorte,
          (litaraPoSorti.get(nazivSorte) ?? 0) + Number(s.kolicinaLitara || 0)
        );
      }

      const noviUdjeli = Array.from(litaraPoSorti.entries())
        .map(([nazivSorte, litara]) => ({
          nazivSorte,
          postotak: novaKolicinaUTanku > 0 ? (litara / novaKolicinaUTanku) * 100 : 0,
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

      /**
       * 10. Sorta / naziv / godište za tank
       */
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

      /**
       * 11. Ažuriraj tank
       */
      await tx.tank.update({
        where: { id: tankId },
        data: {
          kolicinaVinaUTanku: novaKolicinaUTanku,
          sorta: novaSorta,
          nazivVina: noviNazivVina,
          godiste: novoGodiste,
        },
      });

      /**
       * 12. Ažuriraj tankContent
       */
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