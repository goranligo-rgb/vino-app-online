export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import { stvarnaZadana, uBroj } from "@/lib/temperatura";
import { NextResponse } from "next/server";

// Raspon -> koliko unatrag + velicina bucketa (sekunde; 0 = sirova ocitanja).
const RASPONI = {
  "24h": { odMs: 24 * 60 * 60 * 1000, bucketSec: 0 },
  "7d": { odMs: 7 * 24 * 60 * 60 * 1000, bucketSec: 3600 }, // po satu
  "30d": { odMs: 30 * 24 * 60 * 60 * 1000, bucketSec: 10800 }, // po 3 h
} as const;

type Raspon = keyof typeof RASPONI;

type BucketRed = {
  bucket: Date;
  avg: number;
  min: number;
  max: number;
  hladi: boolean;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  const { id: tankId } = await params;
  const url = new URL(req.url);
  const raspKey = url.searchParams.get("raspon") ?? "24h";
  const raspon: Raspon = raspKey in RASPONI ? (raspKey as Raspon) : "24h";
  const { odMs, bucketSec } = RASPONI[raspon];

  try {
    const tank = await prisma.tank.findUnique({
      where: { id: tankId },
      select: { zadanaTemp: true },
    });
    if (!tank) {
      return NextResponse.json({ error: "Tank ne postoji." }, { status: 404 });
    }

    // Crta zadane na grafu ide po STVARNOM set pointu s kontrolera (zadnje
    // očitanje), ne po želji iz baze - vidi stvarnaZadana().
    const zadnjeOcitanje = await prisma.ocitanjeTemperature.findFirst({
      where: { tankId },
      orderBy: { mjerenoU: "desc" },
      select: { zadanaTemperatura: true },
    });

    const od = new Date(Date.now() - odMs);

    let tocke: Array<{
      t: string;
      avg: number;
      min: number;
      max: number;
      hladi: boolean;
    }>;

    if (bucketSec === 0) {
      // 24 h: sirova ocitanja (10-min razmak), bez agregacije.
      const redovi = await prisma.ocitanjeTemperature.findMany({
        where: { tankId, mjerenoU: { gte: od } },
        orderBy: { mjerenoU: "asc" },
        select: { mjerenoU: true, temperatura: true, hladjenjeAktivno: true },
      });
      tocke = redovi.map((r) => {
        const temp = uBroj(r.temperatura) ?? 0;
        return {
          t: r.mjerenoU.toISOString(),
          avg: temp,
          min: temp,
          max: temp,
          hladi: r.hladjenjeAktivno,
        };
      });
    } else {
      // 7d / 30d: agregacija na serveru (bucket po epoch/bucketSec).
      const redovi = await prisma.$queryRaw<BucketRed[]>`
        SELECT
          to_timestamp(floor(extract(epoch from "mjerenoU") / ${bucketSec}) * ${bucketSec}) AS bucket,
          avg("temperatura")::float8 AS avg,
          min("temperatura")::float8 AS min,
          max("temperatura")::float8 AS max,
          bool_or("hladjenjeAktivno")  AS hladi
        FROM "OcitanjeTemperature"
        WHERE "tankId" = ${tankId} AND "mjerenoU" >= ${od}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
      tocke = redovi.map((r) => ({
        t: new Date(r.bucket).toISOString(),
        avg: Math.round(r.avg * 10) / 10,
        min: Math.round(r.min * 10) / 10,
        max: Math.round(r.max * 10) / 10,
        hladi: r.hladi,
      }));
    }

    return NextResponse.json({
      raspon,
      zadana: stvarnaZadana(zadnjeOcitanje?.zadanaTemperatura, tank.zadanaTemp),
      bucketSec,
      tocke,
    });
  } catch (error) {
    console.error("Greška kod dohvaćanja temperature:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja temperature" },
      { status: 500 }
    );
  }
}
