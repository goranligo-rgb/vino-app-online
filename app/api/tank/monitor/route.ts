export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { uBroj } from "@/lib/temperatura";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const tankovi = await prisma.tank.findMany({
      include: {
        zadaci: {
          where: {
            status: "OTVOREN",
          },
        },
      },
      orderBy: {
        broj: "asc",
      },
    });

    const ids = tankovi.map((t) => t.id);

    // Zadnje ocitanje po tanku (max mjerenoU) + aktivni alarmi.
    const maxevi = await prisma.ocitanjeTemperature.groupBy({
      by: ["tankId"],
      where: { tankId: { in: ids } },
      _max: { mjerenoU: true },
    });
    const parovi = maxevi
      .filter((m) => m._max.mjerenoU)
      .map((m) => ({ tankId: m.tankId, mjerenoU: m._max.mjerenoU as Date }));
    const zadnja = parovi.length
      ? await prisma.ocitanjeTemperature.findMany({ where: { OR: parovi } })
      : [];
    const zadnjaMap = new Map(zadnja.map((o) => [o.tankId, o]));

    const alarmi = await prisma.tankAlarm.findMany({
      where: { tankId: { in: ids }, aktivan: true },
      select: { tankId: true },
    });
    const alarmSet = new Set(alarmi.map((a) => a.tankId));

    const rezultat = tankovi.map((t) => {
      const o = zadnjaMap.get(t.id);
      return {
        id: t.id,
        broj: t.broj,
        kapacitet: t.kapacitet,
        tip: t.tip,
        kolicinaVinaUTanku: t.kolicinaVinaUTanku ?? 0,
        sorta: t.sorta ?? null,
        brojZadataka: t.zadaci.length,
        // Nadzor temperature
        zadnjaTemp: o ? uBroj(o.temperatura) : null,
        zadanaTemp: uBroj(t.zadanaTemp),
        hladjenjeAktivno: o ? o.hladjenjeAktivno : null,
        mjerenoU: o ? o.mjerenoU.toISOString() : null,
        imaAktivanAlarm: alarmSet.has(t.id),
      };
    });

    return NextResponse.json(rezultat);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja tankova" },
      { status: 500 }
    );
  }
}
