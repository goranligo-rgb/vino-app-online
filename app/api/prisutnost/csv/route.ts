import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import { formatHrDateTime } from "@/lib/datum";
import {
  rasponMjeseca,
  mjesecHr,
  danIzBaze,
  satMinutaHr,
  minutaZapisa,
  satiHHMM,
  satiDecimalno,
  formatDan,
  csvPolje,
} from "@/lib/prisutnost";

/** Poslodavac u zaglavlju izvoza (knjigovodstvo traži da stoji na listi). */
const POSLODAVAC = "Ligo grupa";

/**
 * Izvoz evidencije radnog vremena za knjigovodstvo (jedan mjesec).
 * SAMO Level 1 (ADMIN) — provjera je serverska, link u UI-ju nije zaštita.
 * Separator je ";" (Excel na hrvatskim postavkama), s BOM-om zbog dijakritike.
 */
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nemate pravo na izvoz evidencije." }, { status: 403 });
  }

  const url = new URL(request.url);
  const trazeni = url.searchParams.get("mjesec") ?? "";
  const mjesec = /^\d{4}-\d{2}$/.test(trazeni) ? trazeni : mjesecHr();
  const korisnikId = (url.searchParams.get("korisnik") ?? "").trim();
  const { od, do: doD } = rasponMjeseca(mjesec);

  const [zapisi, praznici] = await Promise.all([
    prisma.radnaPrijava.findMany({
      where: {
        datum: { gte: od, lt: doD },
        ...(korisnikId ? { userId: korisnikId } : {}),
      },
      select: {
        datum: true,
        dolazakU: true,
        odlazakU: true,
        napomena: true,
        user: { select: { ime: true } },
        uredio: { select: { ime: true } },
      },
      orderBy: [{ user: { ime: "asc" } }, { datum: "asc" }, { dolazakU: "asc" }],
    }),
    prisma.praznik.findMany({
      where: { datum: { gte: od, lt: doD } },
      select: { datum: true, naziv: true },
    }),
  ]);

  const praznikPoDanu = new Map(praznici.map((p) => [danIzBaze(p.datum), p.naziv]));

  // Zaglavlje za knjigovodstvo: poslodavac, razdoblje i trenutak izvoza.
  const redci: string[] = [
    [POSLODAVAC, "Evidencija radnog vremena"].map(csvPolje).join(";"),
    ["Mjesec", mjesec].map(csvPolje).join(";"),
    ["Izvezeno", formatHrDateTime(new Date())].map(csvPolje).join(";"),
    ["Izvezao", user.ime].map(csvPolje).join(";"),
    "",
    ["Korisnik", "Datum", "Dolazak", "Odlazak", "Sati (h:mm)", "Sati (decimalno)", "Praznik", "Napomena", "Ispravio"]
      .map(csvPolje)
      .join(";"),
  ];

  const ukupnoPoKorisniku = new Map<string, number>();

  for (const z of zapisi) {
    const dan = danIzBaze(z.datum);
    const minuta = minutaZapisa(z.dolazakU, z.odlazakU);
    ukupnoPoKorisniku.set(z.user.ime, (ukupnoPoKorisniku.get(z.user.ime) ?? 0) + minuta);
    redci.push(
      [
        z.user.ime,
        formatDan(dan),
        satMinutaHr(z.dolazakU),
        z.odlazakU ? satMinutaHr(z.odlazakU) : "NEMA ODJAVE",
        minuta ? satiHHMM(minuta) : "",
        minuta ? satiDecimalno(minuta) : "",
        praznikPoDanu.get(dan) ?? "",
        z.napomena ?? "",
        z.uredio?.ime ?? "",
      ]
        .map(csvPolje)
        .join(";")
    );
  }

  // Zbroj po korisniku na kraju — knjigovodstvu je to jedini redak koji prepisuje.
  redci.push("");
  redci.push(["UKUPNO", "", "", "", "Sati (h:mm)", "Sati (decimalno)", "", "", ""].map(csvPolje).join(";"));
  for (const [ime, minuta] of [...ukupnoPoKorisniku.entries()].sort((a, b) => a[0].localeCompare(b[0], "hr"))) {
    redci.push([ime, "", "", "", satiHHMM(minuta), satiDecimalno(minuta), "", "", ""].map(csvPolje).join(";"));
  }

  const csv = "﻿" + redci.join("\r\n") + "\r\n";
  const naziv = `ligo-grupa-prisutnost-${mjesec}${korisnikId ? "-filtrirano" : ""}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${naziv}"`,
      "Cache-Control": "no-store",
    },
  });
}
