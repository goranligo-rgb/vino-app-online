"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";

// Ponedjeljak tjedna u kojem je dani datum (podne, da izbjegnemo TZ rubove).
function ponedjeljak(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = ponedjeljak
  x.setDate(x.getDate() - day);
  x.setHours(12, 0, 0, 0);
  return x;
}

// Kadenca po kategoriji unutar prozora od 3 mjeseca:
// A = svaki mjesec, B = svaka 2 mjeseca, C = svaka 3 mjeseca, D = povremeno (jednom).
function offsetiMjeseci(kat: string): number[] {
  switch (kat) {
    case "A":
      return [0, 1, 2];
    case "B":
      return [0, 2];
    case "C":
      return [0];
    case "D":
      return [0];
    default:
      return [];
  }
}

export async function generirajPlan(formData: FormData) {
  await requirePutnikUser();

  const raw = String(formData.get("pocetniDatum") || "").trim();
  const start = raw ? new Date(`${raw}T12:00:00`) : new Date();
  start.setHours(12, 0, 0, 0);
  const ponStart = ponedjeljak(start);

  const kupci = await prisma.putnikKupac.findMany({
    where: { aktivan: true },
    select: { id: true, kategorija: true },
    orderBy: { nazivLokala: "asc" },
  });

  const data: {
    kupacId: string;
    datum: Date;
    tjedan: number;
    kategorija: string;
    status: string;
  }[] = [];

  kupci.forEach((k, index) => {
    const kat = String(k.kategorija);
    const offsets = offsetiMjeseci(kat);

    offsets.forEach((m) => {
      const base = new Date(start);
      base.setMonth(base.getMonth() + m);

      const pon = ponedjeljak(base);
      const dow = index % 5; // raspored kupaca po radnim danima (pon-pet)
      const datum = new Date(pon);
      datum.setDate(pon.getDate() + dow);

      const tjedan =
        Math.floor(
          (ponedjeljak(datum).getTime() - ponStart.getTime()) /
            (7 * 86400000)
        ) + 1;

      data.push({
        kupacId: k.id,
        datum,
        tjedan,
        kategorija: kat,
        status: "PLANIRANO",
      });
    });
  });

  // Regeneriranje zamjenjuje postojeći NEOBAVLJENI plan; obavljeni/preskočeni ostaju.
  await prisma.putnikPlanObilaska.deleteMany({ where: { status: "PLANIRANO" } });

  if (data.length) {
    await prisma.putnikPlanObilaska.createMany({ data });
  }

  revalidatePath("/putnik/ruta");
}

export async function oznaciStatus(formData: FormData) {
  await requirePutnikUser();

  const id = String(formData.get("id") || "").trim();
  const status = String(formData.get("status") || "").trim();

  if (!id || !["PLANIRANO", "OBAVLJENO", "PRESKOCENO"].includes(status)) {
    return;
  }

  await prisma.putnikPlanObilaska.update({
    where: { id },
    data: { status },
  });

  revalidatePath("/putnik/ruta");
}
