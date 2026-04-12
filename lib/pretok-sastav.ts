import { prisma } from "@/lib/prisma";

type IzvorUnos = {
  tankId: string;
  kolicina: number;
};

type SortaLitara = Record<string, number>;

function normalizeSorta(naziv: string | null | undefined) {
  return String(naziv ?? "").trim();
}

export async function izracunajNoviSastavPretoka({
  izvori,
  ciljTankId,
}: {
  izvori: IzvorUnos[];
  ciljTankId: string;
}) {
  const rezultatLitara: SortaLitara = {};

  function dodajSortu(nazivSorte: string, litara: number) {
    const key = normalizeSorta(nazivSorte);
    if (!key || litara <= 0) return;
    rezultatLitara[key] = (rezultatLitara[key] ?? 0) + litara;
  }

  async function ucitajSastavTanka(tankId: string) {
    const tank = await prisma.tank.findUnique({
      where: { id: tankId },
      include: {
        udjeliSorti: true,
      },
    });

    if (!tank) {
      throw new Error(`Tank nije pronađen: ${tankId}`);
    }

    const ukupnoUTanku = Number(tank.kolicinaVinaUTanku ?? 0);

    if (tank.udjeliSorti.length > 0 && ukupnoUTanku > 0) {
      return tank.udjeliSorti.map((u) => ({
        nazivSorte: u.nazivSorte,
        postotak: Number(u.postotak),
        ukupnoUTanku,
      }));
    }

    const fallbackSorta = normalizeSorta(tank.sorta);

    if (fallbackSorta && ukupnoUTanku > 0) {
      return [
        {
          nazivSorte: fallbackSorta,
          postotak: 100,
          ukupnoUTanku,
        },
      ];
    }

    return [];
  }

  for (const izvor of izvori) {
    const kolicinaZaPretok = Number(izvor.kolicina ?? 0);
    if (kolicinaZaPretok <= 0) continue;

    const sastav = await ucitajSastavTanka(izvor.tankId);

    for (const stavka of sastav) {
      const litaraTeSorte = (stavka.postotak / 100) * kolicinaZaPretok;
      dodajSortu(stavka.nazivSorte, litaraTeSorte);
    }
  }

  const ciljniTank = await prisma.tank.findUnique({
    where: { id: ciljTankId },
    include: {
      udjeliSorti: true,
    },
  });

  if (!ciljniTank) {
    throw new Error("Ciljni tank nije pronađen.");
  }

  const postojecaKolicinaUCilju = Number(ciljniTank.kolicinaVinaUTanku ?? 0);

  if (postojecaKolicinaUCilju > 0) {
    if (ciljniTank.udjeliSorti.length > 0) {
      for (const u of ciljniTank.udjeliSorti) {
        const litaraTeSorte =
          (Number(u.postotak) / 100) * postojecaKolicinaUCilju;
        dodajSortu(u.nazivSorte, litaraTeSorte);
      }
    } else {
      const fallbackSorta = normalizeSorta(ciljniTank.sorta);
      if (fallbackSorta) {
        dodajSortu(fallbackSorta, postojecaKolicinaUCilju);
      }
    }
  }

  const ukupnoLitara = Object.values(rezultatLitara).reduce(
    (sum, value) => sum + value,
    0
  );

  if (ukupnoLitara <= 0) {
    return [];
  }

  return Object.entries(rezultatLitara)
    .map(([nazivSorte, litara]) => ({
      nazivSorte,
      postotak: Number(((litara / ukupnoLitara) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.postotak - a.postotak);
}