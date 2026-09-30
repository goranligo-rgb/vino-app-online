export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, smijeRaditiUPodrumu } from "@/lib/zadatak-auth";
import { stanjeSifre } from "@/lib/sifra-vina-baza";
import { greskaSifre } from "@/lib/sifra-vina";

/**
 * GET ?korijen=11-0926&sifra=11-0926-3&tankId=...
 *
 * Sljedeci slobodan broj za prefiks+MMGG i tko jos nosi ponudjenu sifru.
 * Sluzi SAMO upozorenju u obrascima (imenovanje, pretok, filtracija) — sifra
 * nije jedinstvena i ova ruta nista ne brani.
 *
 * ADMIN, ENOLOG, PODRUM — isti krug koji smije raditi pretok i filtraciju.
 * Brava je ovdje jer `proxy.ts` ne pokriva `/api/*`.
 */
export async function GET(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  if (!smijeRaditiUPodrumu(user)) {
    return NextResponse.json({ error: "Nemate pravo." }, { status: 403 });
  }

  const url = new URL(req.url);
  const korijen = (url.searchParams.get("korijen") ?? "").trim();
  const sifra = (url.searchParams.get("sifra") ?? "").trim() || null;
  const tankId = (url.searchParams.get("tankId") ?? "").trim() || null;

  // Korijen se provjerava kao sifra s brojem 1 — isto pravilo, jedno mjesto.
  if (!/^\d{2}-\d{4}$/.test(korijen) || greskaSifre(`${korijen}-1`)) {
    return NextResponse.json({ error: "Neispravan prefiks ili mjesec." }, { status: 400 });
  }

  if (sifra && greskaSifre(sifra)) {
    return NextResponse.json({ error: greskaSifre(sifra) }, { status: 400 });
  }

  try {
    return NextResponse.json(await stanjeSifre(prisma, { korijen, sifra, tankId }));
  } catch (error) {
    console.error("Greška kod provjere šifre vina:", error);
    return NextResponse.json({ error: "Provjera šifre nije uspjela." }, { status: 500 });
  }
}
