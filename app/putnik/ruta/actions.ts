"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";
import { sPotvrdom, sigurniPovratak } from "../spremljeno";

// NAPOMENA: auto-generiranje plana po ABC kadenci je uklonjeno (nije se
// koristilo, samo je zbunjivalo). Ruta se sada vodi ISKLJUČIVO ručno preko
// dodajRucnuRutu (odaberi datum → lokali). Tablica PutnikPlanObilaska je
// zadržana jer je ručna ruta koristi (ručni redci: tjedan = null, po putniku).

export async function oznaciStatus(formData: FormData) {
  await requirePutnikUser();

  const id = String(formData.get("id") || "").trim();
  const status = String(formData.get("status") || "").trim();

  if (!id || !["PLANIRANO", "OBAVLJENO", "PRESKOCENO"].includes(status)) {
    return;
  }

  await prisma.putnikPlanObilaska.update({
    where: { id },
    data: { status },
  });

  revalidatePath("/putnik/ruta");
  redirect(sPotvrdom(sigurniPovratak(formData.get("povratak"), "/putnik/ruta")));
}

// Ručni unos rute: putnik za odabrani datum označi koje lokale obilazi.
// Redci se vode PO PUTNIKU (putnikIme = user.ime) i s tjedan = null (= ručno),
// pa ih auto-generiranje ne dira. Dedup po (kupacId, datum, putnikIme).
export async function dodajRucnuRutu(formData: FormData) {
  const user = await requirePutnikUser();

  const datumRaw = String(formData.get("datum") || "").trim();
  if (!datumRaw) return;
  const datum = new Date(`${datumRaw}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return;

  const kupacIds = [
    ...new Set(formData.getAll("kupacId").map((v) => String(v).trim()).filter(Boolean)),
  ];
  if (kupacIds.length === 0) {
    redirect(`/putnik/ruta?datum=${datumRaw}`);
  }

  // Kategorija iz kupca (za badge); samo aktivni i stvarno postojeći kupci.
  const kupci = await prisma.putnikKupac.findMany({
    where: { id: { in: kupacIds }, aktivan: true },
    select: { id: true, kategorija: true },
  });

  // Dedup: što već postoji u mojoj ručnoj ruti za taj dan se preskače.
  const postojeci = await prisma.putnikPlanObilaska.findMany({
    where: {
      putnikIme: user.ime,
      tjedan: null,
      kupacId: { in: kupci.map((k) => k.id) },
      datum: {
        gte: new Date(`${datumRaw}T00:00:00`),
        lte: new Date(`${datumRaw}T23:59:59.999`),
      },
    },
    select: { kupacId: true },
  });
  const vecImam = new Set(postojeci.map((p) => p.kupacId));

  const data = kupci
    .filter((k) => !vecImam.has(k.id))
    .map((k) => ({
      kupacId: k.id,
      datum,
      tjedan: null,
      kategorija: String(k.kategorija),
      status: "PLANIRANO",
      putnikIme: user.ime,
    }));

  if (data.length) {
    await prisma.putnikPlanObilaska.createMany({ data });
  }

  revalidatePath("/putnik/ruta");
  redirect(sPotvrdom(`/putnik/ruta?datum=${datumRaw}`));
}

// Micanje retka iz MOJE ručne rute (samo vlastiti ručni redak: putnikIme + tjedan null).
export async function obrisiStavku(formData: FormData) {
  const user = await requirePutnikUser();

  const id = String(formData.get("id") || "").trim();
  if (!id) return;

  await prisma.putnikPlanObilaska.deleteMany({
    where: { id, putnikIme: user.ime, tjedan: null },
  });

  revalidatePath("/putnik/ruta");
}
