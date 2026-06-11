"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";

// Ponedjeljak tjedna u kojem je dani datum (podne, da izbjegnemo TZ rubove).
function ponedjeljak(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = ponedjeljak
  x.setDate(x.getDate() - day);
  x.setHours(12, 0, 0, 0);
  return x;
}

// Kadenca po kategoriji unutar prozora od 3 mjeseca:
// A = svaki mjesec, B = svaka 2 mjeseca, C = svaka 3 mjeseca, D = povremeno (jednom).
function offsetiMjeseci(kat: string): number[] {
  switch (kat) {
    case "A":
      return [0, 1, 2];
    case "B":
      return [0, 2];
    case "C":
      return [0];
    case "D":
      return [0];
    default:
      return [];
  }
}

export async function generirajPlan(formData: FormData) {
  await requirePutnikUser();

  const raw = String(formData.get("pocetniDatum") || "").trim();
  const start = raw ? new Date(`${raw}T12:00:00`) : new Date();
  start.setHours(12, 0, 0, 0);
  const ponStart = ponedjeljak(start);

  const kupci = await prisma.putnikKupac.findMany({
    where: { aktivan: true },
    select: { id: true, kategorija: true },
    orderBy: { nazivLokala: "asc" },
  });

  const data: {
    kupacId: string;
    datum: Date;
    tjedan: number;
    kategorija: string;
    status: string;
  }[] = [];

  kupci.forEach((k, index) => {
    const kat = String(k.kategorija);
    const offsets = offsetiMjeseci(kat);

    offsets.forEach((m) => {
      const base = new Date(start);
      base.setMonth(base.getMonth() + m);

      const pon = ponedjeljak(base);
      const dow = index % 5; // raspored kupaca po radnim danima (pon-pet)
      const datum = new Date(pon);
      datum.setDate(pon.getDate() + dow);

      const tjedan =
        Math.floor(
          (ponedjeljak(datum).getTime() - ponStart.getTime()) /
            (7 * 86400000)
        ) + 1;

      data.push({
        kupacId: k.id,
        datum,
        tjedan,
        kategorija: kat,
        status: "PLANIRANO",
      });
    });
  });

  // Regeneriranje zamjenjuje samo AUTO neobavljeni plan (auto redovi UVIJEK imaju
  // tjedan). Ručni unosi (tjedan = null, po putniku) i obavljeni/preskočeni ostaju.
  await prisma.putnikPlanObilaska.deleteMany({
    where: { status: "PLANIRANO", tjedan: { not: null } },
  });

  if (data.length) {
    await prisma.putnikPlanObilaska.createMany({ data });
  }

  const kupciCount = new Set(data.map((d) => d.kupacId)).size;

  revalidatePath("/putnik/ruta");
  redirect(`/putnik/ruta?gen=1&plan=${data.length}&kupci=${kupciCount}`);
}

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
  redirect(`/putnik/ruta?datum=${datumRaw}`);
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
