import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { izracunajNoviSastavPretoka } from "@/lib/pretok-sastav";
import { Prisma } from "@prisma/client";

type UlazPretoka = {
  tankId: string;
  kolicina: number;
};

type TipPretoka = "OBICNI" | "CUVEE" | "BLEND_ISTE_SORTE";

type MjerenjeWeighted = {
  kolicina: number;
  alkohol: number | null;
  ukupneKiseline: number | null;
  hlapiveKiseline: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  secer: number | null;
  ph: number | null;
  temperatura: number | null;
};

function weightedAverage(
  stavke: { kolicina: number; value: number | null | undefined }[]
): number | null {
  const valjane = stavke.filter(
    (s) => s.value !== null && s.value !== undefined && s.kolicina > 0
  );

  if (valjane.length === 0) return null;

  const ukupno = valjane.reduce((sum, s) => sum + s.kolicina, 0);
  if (ukupno <= 0) return null;

  const ponderirano = valjane.reduce(
    (sum, s) => sum + s.kolicina * Number(s.value),
    0
  );

  return Number((ponderirano / ukupno).toFixed(3));
}

async function dohvatiZadnjeMjerenjeZaTank(tankId: string) {
  return prisma.mjerenje.findFirst({
    where: { tankId },
    orderBy: { izmjerenoAt: "desc" },
  });
}

function nazivTanka(
  tank: {
    broj: number;
    nazivVina: string | null;
    sorta: string | null;
  }
) {
  return tank.nazivVina ?? tank.sorta ?? `Tank ${tank.broj}`;
}

async function arhivirajPotroseniTank(
  tx: Prisma.TransactionClient,
  tank: {
    id: string;
    broj: number;
    sorta: string | null;
    nazivVina: string | null;
    godiste: number | null;
    kapacitet: number;
    tip: string | null;
  },
  kolicinaZaArhivu: number,
  napomena?: string | null
) {
  const [mjerenja, zadaci, udjeliSorti, documents, punjenja] = await Promise.all([
    tx.mjerenje.findMany({
      where: { tankId: tank.id },
      orderBy: { izmjerenoAt: "asc" },
    }),
    tx.zadatak.findMany({
      where: { tankId: tank.id },
      include: {
        preparat: true,
        jedinica: true,
        izlaznaJedinica: true,
        zadaoKorisnik: true,
        izvrsioKorisnik: true,
        stavke: {
          include: {
            preparat: true,
            jedinica: true,
            izlaznaJedinica: true,
          },
          orderBy: {
            redoslijed: "asc",
          },
        },
      },
      orderBy: { zadanoAt: "asc" },
    }),
    tx.tankSortaUdio.findMany({
      where: { tankId: tank.id },
      orderBy: { postotak: "desc" },
    }),
    tx.document.findMany({
      where: { tankId: tank.id },
      orderBy: [{ datumDokumenta: "desc" }, { createdAt: "desc" }],
    }),
    tx.punjenjeTanka.findMany({
      where: { tankId: tank.id },
      include: {
        stavke: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { datumPunjenja: "asc" },
    }),
  ]);

  const arhiva = await tx.arhivaVina.create({
    data: {
      tankId: tank.id,
      brojTanka: tank.broj,
      sorta: tank.sorta,
      nazivVina: tank.nazivVina,
      godiste: tank.godiste,
      kolicinaVina: kolicinaZaArhivu,
      kapacitetTanka: tank.kapacitet,
      tipTanka: tank.tip,
      tipArhive: "PRIVREMENA",
      napomena: napomena?.trim() || "Automatski arhivirano nakon pretoka/cuvéea.",
    },
  });

  if (udjeliSorti.length > 0) {
    await tx.arhivaVinaUdioSorte.createMany({
      data: udjeliSorti.map((u) => ({
        arhivaVinaId: arhiva.id,
        izvorniUdioSorteId: u.id,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });
  }

  if (mjerenja.length > 0) {
    await tx.arhivaVinaMjerenje.createMany({
      data: mjerenja.map((m) => ({
        arhivaVinaId: arhiva.id,
        izvornoMjerenjeId: m.id,
        tankId: m.tankId,
        korisnikId: m.korisnikId,
        alkohol: m.alkohol,
        ukupneKiseline: m.ukupneKiseline,
        hlapiveKiseline: m.hlapiveKiseline,
        slobodniSO2: m.slobodniSO2,
        ukupniSO2: m.ukupniSO2,
        secer: m.secer,
        ph: m.ph,
        temperatura: m.temperatura,
        bentotestDatum: m.bentotestDatum,
        bentotestStatus: m.bentotestStatus,
        napomena: m.napomena,
        izmjerenoAt: m.izmjerenoAt,
      })),
    });
  }

  if (zadaci.length > 0) {
    for (const z of zadaci) {
      const arhivaZadatak = await tx.arhivaVinaZadatak.create({
        data: {
          arhivaVinaId: arhiva.id,
          izvorniZadatakId: z.id,
          tankId: z.tankId,
          vrsta: z.vrsta,
          status: z.status,
          naslov: z.naslov,
          napomena: z.napomena,
          doza: z.doza,
          volumenUTanku: z.volumenUTanku,
          izracunataKolicina: z.izracunataKolicina,
          preparatId: z.preparatId,
          preparatNaziv: z.preparat?.naziv ?? null,
          jedinicaId: z.jedinicaId,
          jedinicaNaziv: z.jedinica?.naziv ?? null,
          izlaznaJedinicaId: z.izlaznaJedinicaId,
          izlaznaJedinicaNaziv: z.izlaznaJedinica?.naziv ?? null,
          zadaoKorisnikId: z.zadaoKorisnikId,
          zadaoKorisnikIme: z.zadaoKorisnik?.ime ?? null,
          izvrsioKorisnikId: z.izvrsioKorisnikId,
          izvrsioKorisnikIme: z.izvrsioKorisnik?.ime ?? null,
          zadanoAt: z.zadanoAt,
          izvrsenoAt: z.izvrsenoAt,
        },
      });

      if (z.stavke && z.stavke.length > 0) {
        await tx.arhivaVinaZadatakStavka.createMany({
          data: z.stavke.map((s) => ({
            arhivaZadatakId: arhivaZadatak.id,
            preparatId: s.preparatId ?? null,
            preparatNaziv: s.preparat?.naziv ?? null,
            doza: s.doza,
            volumenUTanku: s.volumenUTanku,
            izracunataKolicina: s.izracunataKolicina,
            jedinicaId: s.jedinicaId ?? null,
            jedinicaNaziv: s.jedinica?.naziv ?? null,
            izlaznaJedinicaId: s.izlaznaJedinicaId ?? null,
            izlaznaJedinicaNaziv: s.izlaznaJedinica?.naziv ?? null,
            redoslijed: s.redoslijed ?? 0,
          })),
        });
      }
    }
  }

  if (documents.length > 0) {
    await tx.arhivaVinaDokument.createMany({
      data: documents.map((d) => ({
        arhivaVinaId: arhiva.id,
        vrsta: d.vrsta,
        naziv: d.naziv,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        datumDokumenta: d.datumDokumenta,
        napomena: d.napomena,
        uploadedByUserId: d.uploadedByUserId,
        uploadedByIme: d.uploadedByIme,
      })),
    });
  }

  // aktivni tank mora ostati potpuno prazan
  await tx.mjerenje.deleteMany({ where: { tankId: tank.id } });
  await tx.zadatak.deleteMany({ where: { tankId: tank.id } });
  await tx.tankSortaUdio.deleteMany({ where: { tankId: tank.id } });
  await tx.document.deleteMany({ where: { tankId: tank.id } });

  await tx.punjenjeStavka.deleteMany({
    where: {
      punjenje: {
        tankId: tank.id,
      },
    },
  });

  await tx.punjenjeTanka.deleteMany({
    where: { tankId: tank.id },
  });

  // brišemo samo blendove gdje je ovaj tank CILJ
  // ne diramo one gdje je bio IZVOR, da drugi tankovi zadrže porijeklo
  await tx.blendIzvor.deleteMany({
    where: { ciljTankId: tank.id },
  });

  await tx.tank.update({
    where: { id: tank.id },
    data: {
      kolicinaVinaUTanku: 0,
      sorta: null,
      nazivVina: null,
      godiste: null,
    },
  });

  return arhiva;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tipPretoka: TipPretoka =
      body?.tipPretoka === "CUVEE" ||
      body?.tipPretoka === "BLEND_ISTE_SORTE"
        ? body.tipPretoka
        : "OBICNI";

    const ciljTankId = String(body?.ciljTankId ?? "").trim();
    const napomena =
      typeof body?.napomena === "string" ? body.napomena : null;

    const nazivNovogVina =
      typeof body?.nazivNovogVina === "string"
        ? body.nazivNovogVina.trim()
        : "";

    const sortaNovogVina =
      typeof body?.sortaNovogVina === "string"
        ? body.sortaNovogVina.trim()
        : "";

    const godisteNovo =
      body?.godiste !== undefined &&
      body?.godiste !== null &&
      String(body.godiste).trim() !== ""
        ? Number(body.godiste)
        : null;

    if (!ciljTankId || !Array.isArray(body?.izvori) || body.izvori.length === 0) {
      return NextResponse.json(
        { error: "Neispravni podaci." },
        { status: 400 }
      );
    }

    const agregiraniIzvoriMap = new Map<string, number>();

    for (const raw of body.izvori as any[]) {
      const tankId = String(raw?.tankId ?? "").trim();
      const kolicina = Number(raw?.kolicina ?? 0);

      if (!tankId || !Number.isFinite(kolicina) || kolicina <= 0) continue;

      agregiraniIzvoriMap.set(
        tankId,
        Number((agregiraniIzvoriMap.get(tankId) ?? 0) + kolicina)
      );
    }

    const izvori: UlazPretoka[] = Array.from(agregiraniIzvoriMap.entries()).map(
      ([tankId, kolicina]) => ({
        tankId,
        kolicina,
      })
    );

    if (izvori.length === 0) {
      return NextResponse.json(
        { error: "Nema valjanih izvora za pretok." },
        { status: 400 }
      );
    }

    if (izvori.some((i) => i.tankId === ciljTankId)) {
      return NextResponse.json(
        { error: "Ciljni tank ne može istovremeno biti i izvor." },
        { status: 400 }
      );
    }

    const trebaNovoVino =
      tipPretoka === "CUVEE" || tipPretoka === "BLEND_ISTE_SORTE";

    if (trebaNovoVino && !nazivNovogVina) {
      return NextResponse.json(
        { error: "Naziv novog vina je obavezan." },
        { status: 400 }
      );
    }

    if (trebaNovoVino && !sortaNovogVina) {
      return NextResponse.json(
        { error: "Sorta novog vina je obavezna." },
        { status: 400 }
      );
    }

    if (tipPretoka === "OBICNI" && izvori.length !== 1) {
      return NextResponse.json(
        {
          error:
            "Obični pretok trenutno podržava samo jedan izvorni tank. Za spajanje više izvora koristi cuvée ili blend iste sorte.",
        },
        { status: 400 }
      );
    }

    const ciljTank = await prisma.tank.findUnique({
      where: { id: ciljTankId },
      include: {
        blendIzvori: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ciljTank) {
      return NextResponse.json(
        { error: "Ciljni tank nije pronađen." },
        { status: 404 }
      );
    }

    const sourceTankIds = izvori.map((i) => i.tankId);

    const sourceTankovi = await prisma.tank.findMany({
      where: { id: { in: sourceTankIds } },
      include: {
        udjeliSorti: {
          orderBy: { postotak: "desc" },
        },
        blendIzvori: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (sourceTankovi.length !== sourceTankIds.length) {
      return NextResponse.json(
        { error: "Jedan ili više izvornih tankova nisu pronađeni." },
        { status: 404 }
      );
    }

    const tankById = new Map(sourceTankovi.map((t) => [t.id, t]));

    for (const i of izvori) {
      const tank = tankById.get(i.tankId);

      if (!tank) {
        return NextResponse.json(
          { error: "Izvorni tank nije pronađen." },
          { status: 404 }
        );
      }

      const dostupno = Number(tank.kolicinaVinaUTanku ?? 0);

      if (i.kolicina > dostupno) {
        return NextResponse.json(
          {
            error: `Tank ${tank.broj} nema dovoljno vina. Dostupno: ${dostupno} L.`,
          },
          { status: 400 }
        );
      }
    }

    if (tipPretoka === "OBICNI") {
      const sourceTank = sourceTankovi[0];
      const ciljImaVino = Number(ciljTank.kolicinaVinaUTanku ?? 0) > 0;

      if (ciljImaVino) {
        const istaSorta =
          (ciljTank.sorta ?? "").trim() === (sourceTank.sorta ?? "").trim();

        const istiNaziv =
          (ciljTank.nazivVina ?? "").trim() ===
          (sourceTank.nazivVina ?? "").trim();

        if (!istaSorta || !istiNaziv) {
          return NextResponse.json(
            {
              error:
                "Ciljni tank već sadrži drugo vino. Za ovakvo spajanje koristi 'Novo vino – cuvée' ili 'Novo vino – ista sorta'.",
            },
            { status: 400 }
          );
        }
      }
    }

    const noviSastav = await izracunajNoviSastavPretoka({
      izvori,
      ciljTankId,
    });

    const zadnjeMjerenjeCilja = await dohvatiZadnjeMjerenjeZaTank(ciljTankId);
    const zadnjaMjerenjaIzvora = await Promise.all(
      izvori.map((i) => dohvatiZadnjeMjerenjeZaTank(i.tankId))
    );

    const trenutnoUCilju = Number(ciljTank.kolicinaVinaUTanku ?? 0);
    const ukupnoDodano = izvori.reduce((sum, i) => sum + Number(i.kolicina), 0);
    const finalnaKolicina = Number((trenutnoUCilju + ukupnoDodano).toFixed(3));

    const weightedInputs: MjerenjeWeighted[] = [];

    if (trenutnoUCilju > 0 && zadnjeMjerenjeCilja) {
      weightedInputs.push({
        kolicina: trenutnoUCilju,
        alkohol: zadnjeMjerenjeCilja.alkohol,
        ukupneKiseline: zadnjeMjerenjeCilja.ukupneKiseline,
        hlapiveKiseline: zadnjeMjerenjeCilja.hlapiveKiseline,
        slobodniSO2: zadnjeMjerenjeCilja.slobodniSO2,
        ukupniSO2: zadnjeMjerenjeCilja.ukupniSO2,
        secer: zadnjeMjerenjeCilja.secer,
        ph: zadnjeMjerenjeCilja.ph,
        temperatura: zadnjeMjerenjeCilja.temperatura,
      });
    }

    izvori.forEach((izvor, index) => {
      const m = zadnjaMjerenjaIzvora[index];
      if (!m) return;

      weightedInputs.push({
        kolicina: Number(izvor.kolicina),
        alkohol: m.alkohol,
        ukupneKiseline: m.ukupneKiseline,
        hlapiveKiseline: m.hlapiveKiseline,
        slobodniSO2: m.slobodniSO2,
        ukupniSO2: m.ukupniSO2,
        secer: m.secer,
        ph: m.ph,
        temperatura: m.temperatura,
      });
    });

    const novoMjerenje = {
      alkohol: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.alkohol }))
      ),
      ukupneKiseline: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.ukupneKiseline,
        }))
      ),
      hlapiveKiseline: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.hlapiveKiseline,
        }))
      ),
      slobodniSO2: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.slobodniSO2,
        }))
      ),
      ukupniSO2: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.ukupniSO2,
        }))
      ),
      secer: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.secer }))
      ),
      ph: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.ph }))
      ),
      temperatura: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.temperatura,
        }))
      ),
    };

    const rezultat = await prisma.$transaction(async (tx) => {
      const pretok = await tx.pretok.create({
        data: {
          ciljTankId,
          napomena,
          izvori: {
            create: izvori.map((i) => ({
              tankId: i.tankId,
              kolicina: Number(i.kolicina),
            })),
          },
        },
        include: {
          izvori: true,
        },
      });

      if (tipPretoka === "OBICNI") {
        const izvor = izvori[0];
        const sourceTank = tankById.get(izvor.tankId)!;
        const kolicinaIzvora = Number(izvor.kolicina);
        const stanjeIzvoraPrije = Number(sourceTank.kolicinaVinaUTanku ?? 0);
        const preostalo = Number((stanjeIzvoraPrije - kolicinaIzvora).toFixed(6));
        const ciljJeBioPrazan = Number(ciljTank.kolicinaVinaUTanku ?? 0) <= 0;

        await tx.tank.update({
          where: { id: sourceTank.id },
          data: {
            kolicinaVinaUTanku: {
              decrement: kolicinaIzvora,
            },
          },
        });

        await tx.tank.update({
          where: { id: ciljTankId },
          data: {
            kolicinaVinaUTanku: {
              increment: kolicinaIzvora,
            },
            nazivVina:
              ciljJeBioPrazan && !ciljTank.nazivVina
                ? sourceTank.nazivVina
                : undefined,
            sorta:
              ciljJeBioPrazan && !ciljTank.sorta ? sourceTank.sorta : undefined,
            godiste:
              ciljJeBioPrazan && ciljTank.godiste == null
                ? sourceTank.godiste
                : undefined,
          },
        });

        await tx.tankSortaUdio.deleteMany({
          where: { tankId: ciljTankId },
        });

        if (noviSastav.length > 0) {
          await tx.tankSortaUdio.createMany({
            data: noviSastav.map((s) => ({
              tankId: ciljTankId,
              nazivSorte: s.nazivSorte,
              postotak: s.postotak,
            })),
          });
        }

        if (preostalo <= 0) {
          if (sourceTank.blendIzvori.length > 0 && ciljJeBioPrazan) {
            await tx.blendIzvor.deleteMany({
              where: { ciljTankId },
            });

            await tx.blendIzvor.createMany({
              data: sourceTank.blendIzvori.map((b) => ({
                ciljTankId,
                izvorTankId: b.izvorTankId ?? null,
                izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
                nazivVina: b.nazivVina ?? null,
                sorta: b.sorta ?? null,
                kolicina: b.kolicina,
                postotak: b.postotak,
              })),
            });
          } else {
            const arhiva = await arhivirajPotroseniTank(
              tx,
              {
                id: sourceTank.id,
                broj: sourceTank.broj,
                sorta: sourceTank.sorta ?? null,
                nazivVina: sourceTank.nazivVina ?? null,
                godiste: sourceTank.godiste ?? null,
                kapacitet: sourceTank.kapacitet,
                tip: sourceTank.tip ?? null,
              },
              stanjeIzvoraPrije,
              `Automatski arhivirano nakon običnog pretoka u tank ${ciljTank.broj}.`
            );

            await tx.blendIzvor.deleteMany({
              where: { ciljTankId },
            });

            await tx.blendIzvor.create({
              data: {
                ciljTankId,
                izvorTankId: null,
                izvorArhivaVinaId: arhiva.id,
                nazivVina: nazivTanka(sourceTank),
                sorta: sourceTank.sorta ?? null,
                kolicina: kolicinaIzvora,
                postotak: 100,
              },
            });
          }
        }

        await tx.mjerenje.create({
          data: {
            tankId: ciljTankId,
            korisnikId: null,
            alkohol: novoMjerenje.alkohol,
            ukupneKiseline: novoMjerenje.ukupneKiseline,
            hlapiveKiseline: novoMjerenje.hlapiveKiseline,
            slobodniSO2: novoMjerenje.slobodniSO2,
            ukupniSO2: novoMjerenje.ukupniSO2,
            secer: novoMjerenje.secer,
            ph: novoMjerenje.ph,
            temperatura: novoMjerenje.temperatura,
            napomena: "Automatski izračunato novo mjerenje nakon običnog pretoka.",
            jeRucno: false,
          },
        });

        return {
          pretok,
          noviBlendIzvori: [],
        };
      }

      const noviBlendIzvori: {
        ciljTankId: string;
        izvorTankId: string | null;
        izvorArhivaVinaId: string | null;
        nazivVina: string | null;
        sorta: string | null;
        kolicina: number;
        postotak: number;
      }[] = [];

      if (trenutnoUCilju > 0) {
        if (ciljTank.blendIzvori.length > 0) {
          for (const postojeci of ciljTank.blendIzvori) {
            const postotak = Number(
              ((Number(postojeci.kolicina) / finalnaKolicina) * 100).toFixed(2)
            );

            noviBlendIzvori.push({
              ciljTankId,
              izvorTankId: postojeci.izvorTankId ?? null,
              izvorArhivaVinaId: postojeci.izvorArhivaVinaId ?? null,
              nazivVina: postojeci.nazivVina ?? null,
              sorta: postojeci.sorta ?? null,
              kolicina: Number(postojeci.kolicina),
              postotak,
            });
          }
        } else {
          noviBlendIzvori.push({
            ciljTankId,
            izvorTankId: ciljTank.id,
            izvorArhivaVinaId: null,
            nazivVina: nazivTanka(ciljTank),
            sorta: ciljTank.sorta ?? null,
            kolicina: trenutnoUCilju,
            postotak: Number(((trenutnoUCilju / finalnaKolicina) * 100).toFixed(2)),
          });
        }
      }

      for (const i of izvori) {
        const sourceTank = tankById.get(i.tankId)!;
        const kolicinaIzvora = Number(i.kolicina);
        const stanjePrije = Number(sourceTank.kolicinaVinaUTanku ?? 0);
        const preostalo = Number((stanjePrije - kolicinaIzvora).toFixed(6));

        let izvorTankId: string | null = sourceTank.id;
        let izvorArhivaVinaId: string | null = null;

        await tx.tank.update({
          where: { id: sourceTank.id },
          data: {
            kolicinaVinaUTanku: {
              decrement: kolicinaIzvora,
            },
          },
        });

        if (preostalo <= 0) {
          const arhiva = await arhivirajPotroseniTank(
            tx,
            {
              id: sourceTank.id,
              broj: sourceTank.broj,
              sorta: sourceTank.sorta ?? null,
              nazivVina: sourceTank.nazivVina ?? null,
              godiste: sourceTank.godiste ?? null,
              kapacitet: sourceTank.kapacitet,
              tip: sourceTank.tip ?? null,
            },
            stanjePrije,
            `Automatski arhivirano jer je vino ušlo u ${
              tipPretoka === "CUVEE" ? "cuvée" : "blend iste sorte"
            } u tank ${ciljTank.broj}.`
          );

          izvorTankId = null;
          izvorArhivaVinaId = arhiva.id;
        }

        noviBlendIzvori.push({
          ciljTankId,
          izvorTankId,
          izvorArhivaVinaId,
          nazivVina: nazivTanka(sourceTank),
          sorta: sourceTank.sorta ?? null,
          kolicina: kolicinaIzvora,
          postotak: Number(((kolicinaIzvora / finalnaKolicina) * 100).toFixed(2)),
        });
      }

      await tx.tank.update({
        where: { id: ciljTankId },
        data: {
          kolicinaVinaUTanku: {
            increment: ukupnoDodano,
          },
          nazivVina: nazivNovogVina,
          sorta: sortaNovogVina,
          godiste: godisteNovo,
        },
      });

      await tx.tankSortaUdio.deleteMany({
        where: { tankId: ciljTankId },
      });

      if (noviSastav.length > 0) {
        await tx.tankSortaUdio.createMany({
          data: noviSastav.map((s) => ({
            tankId: ciljTankId,
            nazivSorte: s.nazivSorte,
            postotak: s.postotak,
          })),
        });
      }

      await tx.blendIzvor.deleteMany({
        where: { ciljTankId },
      });

      if (noviBlendIzvori.length > 0) {
        await tx.blendIzvor.createMany({
          data: noviBlendIzvori,
        });
      }

      await tx.mjerenje.create({
        data: {
          tankId: ciljTankId,
          korisnikId: null,
          alkohol: novoMjerenje.alkohol,
          ukupneKiseline: novoMjerenje.ukupneKiseline,
          hlapiveKiseline: novoMjerenje.hlapiveKiseline,
          slobodniSO2: novoMjerenje.slobodniSO2,
          ukupniSO2: novoMjerenje.ukupniSO2,
          secer: novoMjerenje.secer,
          ph: novoMjerenje.ph,
          temperatura: novoMjerenje.temperatura,
          napomena:
            tipPretoka === "CUVEE"
              ? "Automatski izračunato novo mjerenje nakon cuvéea."
              : "Automatski izračunato novo mjerenje nakon blenda iste sorte.",
          jeRucno: false,
        },
      });

      return {
        pretok,
        noviBlendIzvori,
      };
    });

    return NextResponse.json({
      success: true,
      tipPretoka,
      noviSastav,
      blendIzvori: rezultat.noviBlendIzvori,
      novoMjerenje,
      pretok: rezultat.pretok,
    });
  } catch (error) {
    console.error("Greška pretok:", error);

    return NextResponse.json(
      { error: "Greška kod pretoka." },
      { status: 500 }
    );
  }
}