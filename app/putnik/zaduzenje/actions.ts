"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireLevel12User } from "@/lib/putnik-auth";
import { sPotvrdom, sigurniPovratak } from "../spremljeno";

// Zajednicki parser: putnik + datum + napomena su jednom po unosu (batch),
// a artikl/kolicina/(jedinica) dolaze kao paralelni nizovi (jedan par po redu).
// Prazni redovi (bez artikla ili kolicina <= 0) se preskacu. Vraca [] ako nema putnika.
function parsirajBatch(formData: FormData, opts: { float: boolean }) {
  const putnikIme = String(formData.get("putnikIme") || "").trim();
  const napomena = String(formData.get("napomena") || "").trim() || null;
  const datumRaw = String(formData.get("datum") || "").trim();
  const d = datumRaw ? new Date(`${datumRaw}T12:00:00`) : new Date();
  const datum = Number.isNaN(d.getTime()) ? new Date() : d;

  if (!putnikIme) return { putnikIme, napomena, datum, redovi: [] as { artiklId: string; kolicina: number; jedinica: string }[] };

  const artiklIds = formData.getAll("artiklId").map((v) => String(v).trim());
  const kolicine = formData.getAll("kolicina").map((v) => String(v).trim().replace(",", "."));
  const jedinice = formData.getAll("jedinica").map((v) => String(v).trim());

  const redovi: { artiklId: string; kolicina: number; jedinica: string }[] = [];
  for (let i = 0; i < artiklIds.length; i++) {
    const artiklId = artiklIds[i];
    const kolicina = opts.float ? Number(kolicine[i]) : parseInt(kolicine[i], 10);
    if (!artiklId || !Number.isFinite(kolicina) || kolicina <= 0) continue; // preskoci prazne redove
    redovi.push({ artiklId, kolicina, jedinica: jedinice[i] || "kom" });
  }
  return { putnikIme, napomena, datum, redovi };
}

// Faza 7 - zaduzenje vina putniku (ULAZ u zalihu vozila). Smiju samo L1/2.
// Faza 10 - vise redova odjednom: jedan putnik/datum, N artikala.
export async function zaduziVino(formData: FormData) {
  const user = await requireLevel12User();
  const { putnikIme, napomena, datum, redovi } = parsirajBatch(formData, { float: true });
  if (!putnikIme || redovi.length === 0) return;

  await prisma.putnikVinoZaduzenje.createMany({
    data: redovi.map((r) => ({
      artiklId: r.artiklId,
      putnikIme,
      kolicina: r.kolicina,
      jedinica: r.jedinica,
      datum,
      unioKorisnikIme: user.ime || null,
      napomena,
    })),
  });

  revalidatePath("/putnik/zaduzenje");
  redirect(sPotvrdom(sigurniPovratak(formData.get("povratak"), "/putnik/zaduzenje")));
}

// Faza 8 - zaduzenje promo materijala putniku (ULAZ), analogno zaduziVino. Kolicina Int, bez jedinice.
export async function zaduziPromo(formData: FormData) {
  const user = await requireLevel12User();
  const { putnikIme, napomena, datum, redovi } = parsirajBatch(formData, { float: false });
  if (!putnikIme || redovi.length === 0) return;

  await prisma.putnikPromoUlaz.createMany({
    data: redovi.map((r) => ({
      artiklId: r.artiklId,
      putnikIme,
      kolicina: r.kolicina,
      datum,
      unioKorisnikIme: user.ime || null,
      napomena,
    })),
  });

  revalidatePath("/putnik/zaduzenje");
  revalidatePath("/putnik/promo");
  redirect(sPotvrdom(sigurniPovratak(formData.get("povratak"), "/putnik/zaduzenje")));
}

// Faza 9 - POVRAT vina iz vozila u skladiste (IZLAZ iz zalihe putnika). Smiju samo L1/2.
// Zrcali zaduziVino, ali suprotan smjer; smanjuje "ostalo u autu" kroz agregaciju.
export async function vratiVino(formData: FormData) {
  const user = await requireLevel12User();
  const { putnikIme, napomena, datum, redovi } = parsirajBatch(formData, { float: true });
  if (!putnikIme || redovi.length === 0) return;

  await prisma.putnikVinoPovrat.createMany({
    data: redovi.map((r) => ({
      artiklId: r.artiklId,
      putnikIme,
      kolicina: r.kolicina,
      jedinica: r.jedinica,
      datum,
      primioKorisnikIme: user.ime || null,
      napomena,
    })),
  });

  revalidatePath("/putnik/zaduzenje");
  revalidatePath("/putnik/vozilo");
  redirect(sPotvrdom(sigurniPovratak(formData.get("povratak"), "/putnik/zaduzenje")));
}

// Faza 9 - POVRAT promo materijala iz vozila u skladiste, analogno vratiVino (kolicina Int).
export async function vratiPromo(formData: FormData) {
  const user = await requireLevel12User();
  const { putnikIme, napomena, datum, redovi } = parsirajBatch(formData, { float: false });
  if (!putnikIme || redovi.length === 0) return;

  await prisma.putnikPromoPovrat.createMany({
    data: redovi.map((r) => ({
      artiklId: r.artiklId,
      putnikIme,
      kolicina: r.kolicina,
      datum,
      primioKorisnikIme: user.ime || null,
      napomena,
    })),
  });

  revalidatePath("/putnik/zaduzenje");
  revalidatePath("/putnik/vozilo");
  revalidatePath("/putnik/promo");
  redirect(sPotvrdom(sigurniPovratak(formData.get("povratak"), "/putnik/zaduzenje")));
}
