"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireLevel12User } from "@/lib/putnik-auth";

const DOZVOLJENI = ["PRIPREMITI", "PRIPREMLJENO", "ISPORUCENO"];

// Pomicanje statusa pripreme smije samo vinarija (Level 1/2). Status NE dira zalihu.
export async function oznaciPripremu(formData: FormData) {
  await requireLevel12User();

  const id = String(formData.get("id") || "").trim();
  const tip = String(formData.get("tip") || "").trim();
  const status = String(formData.get("status") || "").trim();

  if (!id || !DOZVOLJENI.includes(status)) return;

  if (tip === "stavka") {
    await prisma.putnikPosjetStavka.update({
      where: { id },
      data: { statusPripreme: status },
    });
  } else if (tip === "promo") {
    await prisma.putnikPromoKupca.update({
      where: { id },
      data: { statusPripreme: status },
    });
  }

  revalidatePath("/putnik/priprema");
}
