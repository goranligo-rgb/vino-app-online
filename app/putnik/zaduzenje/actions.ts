"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireLevel12User } from "@/lib/putnik-auth";

// Faza 7 - zaduženje vina putniku (ULAZ u zalihu vozila).
// Kao promo ulaz, ali vezano na konkretnog putnika. Smiju samo L1/2.
// Ovo je JEDINI način da vino uđe u zalihu putnika; izlazi kroz ODMAH prodaju/gratis na posjetu.
export async function zaduziVino(formData: FormData) {
  const user = await requireLevel12User();

  const artiklId = String(formData.get("artiklId") || "").trim();
  const putnikIme = String(formData.get("putnikIme") || "").trim();
  const kolRaw = String(formData.get("kolicina") || "").trim().replace(",", ".");
  const kolicina = Number(kolRaw);
  const jedinica = String(formData.get("jedinica") || "kom").trim() || "kom";
  const napomena = String(formData.get("napomena") || "").trim() || null;
  const datumRaw = String(formData.get("datum") || "").trim();

  // Bez vina, putnika ili pozitivne količine ne radimo ništa.
  if (!artiklId || !putnikIme || !Number.isFinite(kolicina) || kolicina <= 0) return;

  const datum = datumRaw ? new Date(`${datumRaw}T12:00:00`) : new Date();

  await prisma.putnikVinoZaduzenje.create({
    data: {
      artiklId,
      putnikIme,
      kolicina,
      jedinica,
      datum: Number.isNaN(datum.getTime()) ? new Date() : datum,
      unioKorisnikIme: user.ime || null,
      napomena,
    },
  });

  revalidatePath("/putnik/zaduzenje");
}

// Faza 8 - zaduženje promo materijala putniku (ULAZ u zalihu vozila), analogno zaduziVino.
// Promo količina je Int (kom). Smiju samo L1/2. Otpis se skida na terenu po lokalu.
export async function zaduziPromo(formData: FormData) {
  const user = await requireLevel12User();

  const artiklId = String(formData.get("artiklId") || "").trim();
  const putnikIme = String(formData.get("putnikIme") || "").trim();
  const kolRaw = String(formData.get("kolicina") || "").trim().replace(",", ".");
  const kolicina = parseInt(kolRaw, 10);
  const napomena = String(formData.get("napomena") || "").trim() || null;
  const datumRaw = String(formData.get("datum") || "").trim();

  if (!artiklId || !putnikIme || !Number.isFinite(kolicina) || kolicina <= 0) return;

  const datum = datumRaw ? new Date(`${datumRaw}T12:00:00`) : new Date();

  await prisma.putnikPromoUlaz.create({
    data: {
      artiklId,
      putnikIme,
      kolicina,
      datum: Number.isNaN(datum.getTime()) ? new Date() : datum,
      unioKorisnikIme: user.ime || null,
      napomena,
    },
  });

  revalidatePath("/putnik/zaduzenje");
  revalidatePath("/putnik/promo");
}
