// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { stvarnaZadana, uBroj } from "@/lib/temperatura";
import { imeZaPrikaz, imenaPodruma, jeBezImena } from "@/lib/ime-vina";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

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

    // IME VINA SE IZVODI (faza 4), ne cita se s `Tank.sorta`.
    //
    // Monitor je pokazivao „Sorta: {tank.sorta}" — stupac koji se s knjigom
    // razilazio na 14 od 36 punih tankova (T26 je stajao „Zeleni veltlinac" uz
    // knjigu koja kaze Chardonnay 100 %). Ovdje ide DEKLARIRANA sorta iz cina
    // imenovanja; stvarni sastav se izvodi iz knjige i pokazuje na stranici
    // tanka, gdje ima mjesta za oboje.
    const imena = await imenaPodruma(prisma);

    const rezultat = tankovi.map((t) => {
      const o = zadnjaMap.get(t.id);
      const ime = imena.get(t.id);
      return {
        id: t.id,
        broj: t.broj,
        kapacitet: t.kapacitet,
        tip: t.tip,
        kolicinaVinaUTanku: t.kolicinaVinaUTanku ?? 0,
        sorta: ime?.deklariranaSorta ?? null,
        nazivVina: ime?.naziv ?? null,
        /** Vino je u posudi, a nitko ga nije imenovao — nije isto sto i prazna posuda. */
        bezimeno: jeBezImena(ime),
        /** Gotov jednoredni opis — vidi lib/ime-vina.ts `imeZaPrikaz`. */
        opisVina: imeZaPrikaz(ime).tekst,
        brojZadataka: t.zadaci.length,
        // Nadzor temperature
        zadnjaTemp: o ? uBroj(o.temperatura) : null,
        // Stvarna zadana s kontrolera (zadnje očitanje), a ne želja iz baze.
        zadanaTemp: stvarnaZadana(o?.zadanaTemperatura, t.zadanaTemp),
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
