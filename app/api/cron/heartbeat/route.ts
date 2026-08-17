export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { gsmTekst, posaljiSms, razlogIskljucenja, sadaHHMM, smsUkljucen } from "@/lib/sms";
import { HEARTBEAT_PRAG_MIN, gatewayNeJavlja } from "@/lib/temperatura";

/**
 * HEARTBEAT WATCHDOG - "gateway ne javlja".
 *
 * Zasto je ovdje, a ne na Pi-ju: gateway koji je mrtav (servis pukao, Pi bez
 * struje, podrum bez interneta) ne moze poslati poruku sam za sebe. Zato ga
 * promatra netko izvana - ova ruta gleda SAMO bazu: koliko je star zadnji red u
 * OcitanjeTemperature. Ako je stariji od praga, gateway ocito ne pise.
 *
 * Poziva se s cron rasporeda (vidi vercel.json; radi i s bilo kojim vanjskim
 * cronom koji zna poslati Authorization zaglavlje).
 *
 * Ponavljanje: SMS ide JEDNOM po ispadu. Stanje se ne cuva u memoriji (svaki
 * poziv je nova instanca) nego u tablici SmsObavijest: ako je zadnja poruka tipa
 * HEARTBEAT, ispad je vec javljen; HEARTBEAT_OK (ili nista) znaci mirno stanje.
 */

/**
 * Vercel cron salje "Authorization: Bearer $CRON_SECRET". Bez postavljenog
 * CRON_SECRET-a ruta ne radi - inace bi je svatko mogao okidati i trositi SMS.
 */
function ovlasten(req: NextRequest): boolean {
  const tajna = process.env.CRON_SECRET;
  if (!tajna) return false;
  const zaglavlje = req.headers.get("authorization") ?? "";
  if (zaglavlje === `Bearer ${tajna}`) return true;
  // Vanjski cron servisi cesto ne znaju slati zaglavlje - dopusten je i kljuc u
  // upitu (URL je tajna kao i zaglavlje, samo zavrsi u logovima posluzitelja).
  return req.nextUrl.searchParams.get("kljuc") === tajna;
}

export async function GET(req: NextRequest) {
  if (!ovlasten(req)) {
    return NextResponse.json({ greska: "Nije ovlasteno." }, { status: 401 });
  }

  const zadnje = await prisma.ocitanjeTemperature.findFirst({
    orderBy: { mjerenoU: "desc" },
    select: { mjerenoU: true },
  });

  // Isti prag i ista funkcija kao crveno upozorenje na /dashboard/hladjenje -
  // ekran i SMS ne smiju tvrditi razlicite stvari.
  const sada = new Date();
  const starostMin = zadnje
    ? (sada.getTime() - zadnje.mjerenoU.getTime()) / 60000
    : Number.POSITIVE_INFINITY;
  const mrtav = gatewayNeJavlja(zadnje?.mjerenoU ?? null, sada);

  // Zadnja heartbeat poruka odreduje jesmo li ispad vec javili.
  const zadnjaPoruka = await prisma.smsObavijest.findFirst({
    where: { tip: { in: ["HEARTBEAT", "HEARTBEAT_OK"] }, uspjeh: true },
    orderBy: { poslanoU: "desc" },
    select: { tip: true, poslanoU: true },
  });
  const vecJavljeno = zadnjaPoruka?.tip === "HEARTBEAT";

  const osnova = {
    provjereno: sada.toISOString(),
    zadnjeOcitanje: zadnje?.mjerenoU.toISOString() ?? null,
    starostMin: Number.isFinite(starostMin) ? Math.round(starostMin) : null,
    pragMin: HEARTBEAT_PRAG_MIN,
    mrtav,
    smsUkljucen: smsUkljucen(),
  };

  if (mrtav && !vecJavljeno) {
    const koliko = Number.isFinite(starostMin)
      ? `${Math.round(starostMin)} min`
      : "od pocetka mjerenja";
    const { uspjeh, greska } = await posaljiSms({
      tip: "HEARTBEAT",
      tekst: gsmTekst(
        `ALARM ${process.env.SMS_NAZIV || "Vinarija"}: gateway ne javlja vec ` +
          `${koliko} - provjeri sustav! ${sadaHHMM()}`
      ),
    });
    return NextResponse.json({ ...osnova, radnja: "SMS_ISPAD", uspjeh, greska });
  }

  if (!mrtav && vecJavljeno) {
    const { uspjeh, greska } = await posaljiSms({
      tip: "HEARTBEAT_OK",
      tekst: gsmTekst(
        `OK ${process.env.SMS_NAZIV || "Vinarija"}: gateway ponovno javlja ocitanja. ${sadaHHMM()}`
      ),
    });
    return NextResponse.json({ ...osnova, radnja: "SMS_OPORAVAK", uspjeh, greska });
  }

  return NextResponse.json({
    ...osnova,
    radnja: "NISTA",
    napomena: mrtav ? "ispad je vec javljen" : "sve radi",
    razlogBezSms: smsUkljucen() ? null : razlogIskljucenja(),
  });
}
