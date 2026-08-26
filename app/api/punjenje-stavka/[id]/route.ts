// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { citajGranicuArhive, odGranice } from "@/lib/granica-arhive";
import { uLitre, uMl, type Tx } from "@/lib/filtracija";
import { zabiljeziIzlaz, zabiljeziUlaz } from "@/lib/berba-knjiga";

/** Kolicina u tanku, u cijelim mililitrima — kako knjiga i racuna. */
async function kolicinaTankaMl(tx: Tx, tankId: string): Promise<number> {
  const t = await tx.tank.findUnique({
    where: { id: tankId },
    select: { kolicinaVinaUTanku: true },
  });

  return uMl(Number(t?.kolicinaVinaUTanku ?? 0));
}

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

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

      // KNJIGA BERBE, 1/2: koliko je vina u tanku PRIJE zahvata.
      //
      // Knjiga ne racuna koliko oduzeti iz same stavke — brisanje stavke ne
      // umanjuje tank za njezine litre nego tank PRERACUNA (iz svih aktivnih
      // punjenja, ili iz snapshota prije punjenja). Ta dva broja se ne moraju
      // poklapati. Zato se mjeri ono sto je zahvat STVARNO ucinio tanku:
      // stanje prije i stanje poslije, u istoj transakciji.
      const prijeMl = await kolicinaTankaMl(tx, tankId);

      // Tijelo zahvata je nepromijenjeno; omotano je u unutarnju funkciju samo
      // zato sto na tri mjesta izlazi ranije (`return`), a mjerenje poslije
      // mora proci u svakom od tih slucajeva. Provjeri s `git diff -w`.
      await (async () => {
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
          // Zbroj SVIH aktivnih punjenja tanka postavlja `kolicinaVinaUTanku`
          // (nize, :300 i :386). Bez granice arhive to bi — cim faza 3 makne
          // brisanje punjenja pri arhiviranju — zbrojilo i vino koje je iz tanka
          // odavno otislo pretokom, pa bi tank tiho dobio litre kojih nema.
          // Vidi lib/granica-arhive.ts za obrazlozenje polja `createdAt`.
          const granica = await citajGranicuArhive(tx, tankId);

          const aktivnaPunjenjaTanka = await tx.punjenjeTanka.findMany({
            where: {
              tankId,
              createdAt: odGranice(granica),
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
      })();

      // KNJIGA BERBE, 2/2: razlika je ono sto se upisuje.
      //
      // Razdioba ide razmjerno po berbama koje su u tanku, kao i kod izlaza.
      // Ne skida se sve s berbe koja je nastala iz obrisane stavke: to vino je
      // u tanku vec izmijesano s ostalim, pa bi biranje jedne berbe bilo
      // izmisljanje. Sam zapis `Berba` se NE brise ni ne oznacava obrisanim —
      // meko brisanje ondje znaci "unos je bio pogresan", a ovdje je rijec o
      // tome sto se s vinom dogodilo. To je odluka za korak 4, kad se zna kako
      // se knjiga cita.
      const poslijeMl = await kolicinaTankaMl(tx, tankId);
      const razlikaMl = prijeMl - poslijeMl;

      if (razlikaMl > 0) {
        await zabiljeziIzlaz(tx, {
          tankId,
          litre: uLitre(razlikaMl),
          // ISPRAVAK, ne IZLAZ: vino nije otislo iz podruma, nego ga ondje
          // nikad nije ni bilo. Vrsta je jedina razlika — racun je isti.
          vrsta: "ISPRAVAK",
          veza: { punjenjeId: stavka.punjenjeId },
          korisnikId: user.id,
          napomena: `Obrisana stavka punjenja: ${stavka.nazivSorte} ${Number(
            stavka.kolicinaLitara ?? 0
          )} L.`,
          naManjak: "ZATECENO",
          opisManjka:
            "Vino zateceno u tanku pri brisanju stavke punjenja: tank ga je imao, a knjiga ne zna odakle je doslo.",
        });
      } else if (razlikaMl < 0) {
        // Brisanje zadnje stavke vraca tank na snapshot PRIJE punjenja, a taj
        // je mogao biti VECI od trenutnog stanja. Tada u tank vino ULAZI, i to
        // vino kojem knjiga ne zna podrijetlo — pa se upisuje kao ZATECENO,
        // vidljivo i prebrojivo, umjesto da se pripise nekoj postojecoj berbi.
        await zabiljeziUlaz(tx, {
          tankId,
          litre: uLitre(-razlikaMl),
          vrstaUnosa: "ZATECENO",
          nazivSorte: "Nepoznato podrijetlo",
          napomena:
            "Vino vraceno u tank pri brisanju punjenja, iz stanja zapamcenog prije tog punjenja.",
          korisnikId: user.id,
          veza: { punjenjeId: stavka.punjenjeId },
          napomenaKretanja:
            "Vraceno stanje prije punjenja — knjiga ne zna cije je to vino.",
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