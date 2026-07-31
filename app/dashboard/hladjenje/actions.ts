"use server";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import { revalidatePath } from "next/cache";
import {
  type KomandaTip,
  validiraj,
  smijeUpravljati,
  poljeTanka,
} from "@/lib/tank-komanda";

export type KomandaRezultat = { ok: boolean; error?: string };

// Kreira TankKomanda (NA_CEKANJU) i odmah upise zeljenu vrijednost na Tank
// (da UI prikaze novo stanje). Gateway na Pi-ju preuzima komande sa statusom
// NA_CEKANJU i salje ih kontroleru (Faza B) - vidi gateway/gateway.py.
// Provjera prava je OVDJE (server), ne samo skrivanjem gumba u UI.
export async function posaljiKomandu(input: {
  tankId: string;
  tip: KomandaTip;
  vrijednost: number | null;
}): Promise<KomandaRezultat> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Niste prijavljeni." };
  if (!smijeUpravljati(user.role)) {
    return { ok: false, error: "Nemate pravo mijenjati postavke hlađenja." };
  }

  const { tankId, tip } = input;
  const vrijednost = input.vrijednost ?? null;

  const greskaVal = validiraj(tip, vrijednost);
  if (greskaVal) return { ok: false, error: greskaVal };

  const tank = await prisma.tank.findUnique({
    where: { id: tankId },
    select: { id: true },
  });
  if (!tank) return { ok: false, error: "Tank ne postoji." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tankKomanda.create({
        data: {
          tankId,
          tip,
          vrijednost,
          status: "NA_CEKANJU",
          trazioUserId: user.id,
        },
      });

      const polje = poljeTanka(tip);
      if (polje && vrijednost != null) {
        await tx.tank.update({
          where: { id: tankId },
          data: { [polje]: vrijednost },
        });
      }
    });
  } catch (e) {
    console.error("posaljiKomandu greška:", e);
    return { ok: false, error: "Greška kod spremanja komande." };
  }

  revalidatePath("/dashboard/hladjenje");
  revalidatePath(`/tankovi/${tankId}`); // Hy se mijenja i s kartice Hladjenje na monitoru
  return { ok: true };
}
