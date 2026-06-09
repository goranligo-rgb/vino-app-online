"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";

function text(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || null;
}

function num(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Iz FormData izvlači stavke narudžbe. Inputi se ponavljaju pod istim imenom
 * (stavkaNaziv / stavkaKolicina / stavkaJedinica), getAll čuva redoslijed.
 * Preskaču se redovi bez naziva proizvoda.
 */
function citajStavke(formData: FormData) {
  const nazivi = formData.getAll("stavkaNaziv").map((v) => String(v).trim());
  const kolicine = formData.getAll("stavkaKolicina").map((v) => String(v).trim());
  const jedinice = formData.getAll("stavkaJedinica").map((v) => String(v).trim());

  const stavke: { nazivProizvoda: string; kolicina: number | null; jedinica: string }[] = [];

  for (let i = 0; i < nazivi.length; i++) {
    const naziv = nazivi[i];
    if (!naziv) continue;

    const kolRaw = (kolicine[i] || "").replace(",", ".");
    const kol = kolRaw ? Number(kolRaw) : null;

    stavke.push({
      nazivProizvoda: naziv,
      kolicina: kol != null && Number.isFinite(kol) ? kol : null,
      jedinica: jedinice[i] || "kom",
    });
  }

  return stavke;
}

export async function spremiPosjet(formData: FormData) {
  const user = await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  if (!kupacId) return;

  const stavke = citajStavke(formData);

  await prisma.putnikPosjet.create({
    data: {
      kupacId,
      putnikIme: user.ime || null,
      datum: dateValue(formData, "datum") ?? new Date(),

      reklamniMaterijal: text(formData, "reklamniMaterijal"),
      biljeska: text(formData, "biljeska"),
      ukupanDug: num(formData, "ukupanDug"),
      dospjeliDug: num(formData, "dospjeliDug"),

      stavke: stavke.length
        ? {
            create: stavke,
          }
        : undefined,
    },
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(`/putnik/kupci/${kupacId}`);
}
