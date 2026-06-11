"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";

function text(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || null;
}

function intVal(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Zajednička polja forme aktivnosti (i kreiranje i izmjena pišu iste podatke).
function poljaIzForme(formData: FormData) {
  return {
    datum: dateValue(formData, "datum") ?? new Date(),
    opis: text(formData, "opis"),
    tko: text(formData, "tko"),
    stoNastaviti: text(formData, "stoNastaviti"),
    sljedecaAktivnost: text(formData, "sljedecaAktivnost"),
    datumSljedece: dateValue(formData, "datumSljedece"),
    vjerojatnostZakljucenja: intVal(formData, "vjerojatnostZakljucenja"),
    zabiljeska: text(formData, "zabiljeska"),
  };
}

export async function spremiAktivnost(formData: FormData) {
  const user = await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  if (!kupacId) return;

  await prisma.putnikAktivnost.create({
    data: {
      kupacId,
      putnikIme: user.ime || null,
      ...poljaIzForme(formData),
    },
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(`/putnik/kupci/${kupacId}`);
}

// Izmjena postojeće aktivnosti — prepiše stari zapis (bez povijesti).
// putnikIme se NE dira (ostaje izvorni autor). Ne dira zalihu.
export async function azurirajAktivnost(formData: FormData) {
  await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  const aktivnostId = String(formData.get("aktivnostId") || "").trim();
  if (!kupacId || !aktivnostId) return;

  await prisma.putnikAktivnost.update({
    where: { id: aktivnostId },
    data: poljaIzForme(formData),
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(`/putnik/kupci/${kupacId}`);
}
