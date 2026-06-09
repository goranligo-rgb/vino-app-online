"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireLevel12User, requirePutnikUser } from "@/lib/putnik-auth";

function text(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || null;
}

function intVal(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const parsed = parseInt(raw.replace(",", "."), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// --- KATALOG (samo L1/L2) ---
export async function dodajArtikl(formData: FormData) {
  await requireLevel12User();

  const naziv = text(formData, "naziv");
  if (!naziv) return;

  // naziv je unique; ako postoji, samo ga (re)aktiviraj
  await prisma.putnikPromoArtikl.upsert({
    where: { naziv },
    update: { aktivan: true },
    create: { naziv },
  });

  revalidatePath("/putnik/promo");
}

export async function toggleArtikl(formData: FormData) {
  await requireLevel12User();

  const id = String(formData.get("id") || "").trim();
  const aktivan = String(formData.get("aktivan") || "") === "true";
  if (!id) return;

  await prisma.putnikPromoArtikl.update({
    where: { id },
    data: { aktivan },
  });

  revalidatePath("/putnik/promo");
}

// --- KATALOG VINA (samo L1/L2) ---
export async function dodajVino(formData: FormData) {
  await requireLevel12User();

  const naziv = text(formData, "naziv");
  if (!naziv) return;

  await prisma.putnikVinoArtikl.upsert({
    where: { naziv },
    update: { aktivan: true },
    create: { naziv },
  });

  revalidatePath("/putnik/promo");
}

export async function toggleVino(formData: FormData) {
  await requireLevel12User();

  const id = String(formData.get("id") || "").trim();
  const aktivan = String(formData.get("aktivan") || "") === "true";
  if (!id) return;

  await prisma.putnikVinoArtikl.update({
    where: { id },
    data: { aktivan },
  });

  revalidatePath("/putnik/promo");
}

// --- ULAZNA ZALIHA (samo L1/L2) ---
export async function ulazZalihe(formData: FormData) {
  const user = await requireLevel12User();

  const artiklId = String(formData.get("artiklId") || "").trim();
  const kolicina = intVal(formData, "kolicina");
  if (!artiklId || kolicina == null) return;

  await prisma.putnikPromoUlaz.create({
    data: {
      artiklId,
      kolicina,
      datum: dateValue(formData, "datum") ?? new Date(),
      unioKorisnikIme: user.ime || null,
      napomena: text(formData, "napomena"),
    },
  });

  revalidatePath("/putnik/promo");
}

// --- OTPIS PO LOKALU (sve razine) ---
export async function otpisiPromo(formData: FormData) {
  const user = await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  const artiklId = String(formData.get("artiklId") || "").trim();
  const kolicina = intVal(formData, "kolicina");
  if (!kupacId || !artiklId || kolicina == null) return;

  const artikl = await prisma.putnikPromoArtikl.findUnique({
    where: { id: artiklId },
    select: { naziv: true },
  });

  await prisma.putnikPromoKupca.create({
    data: {
      kupacId,
      artiklId,
      tip: "OTPIS",
      naziv: artikl?.naziv ?? null,
      kolicina,
      datumPredaje: dateValue(formData, "datum") ?? new Date(),
      predao: user.ime || null,
      otpisaoKorisnikIme: user.ime || null,
      napomena: text(formData, "napomena"),
    },
  });

  revalidatePath("/putnik/promo");
  revalidatePath(`/putnik/kupci/${kupacId}`);
}
