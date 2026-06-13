"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/putnik-auth";

/**
 * Soft (de)aktivacija lokala/kupca. SAMO Level 1 (ADMIN).
 *
 * Mijenja iskljucivo `aktivan` flag — NE brise nista. Povijest (posjeti,
 * dogovori, ankete, aktivnosti, promo) i obracun zalihe ostaju netaknuti.
 * Neaktivan lokal se samo skriva s glavnog popisa (uz filtar "Prikazi i neaktivne").
 *
 * Provjera prava je UNUTAR akcije (requireAdminUser preusmjerava ne-ADMIN-a),
 * pa skrivanje gumba u UI-u nije jedina zastita.
 */
export async function postaviAktivanKupca(formData: FormData) {
  await requireAdminUser();

  const id = String(formData.get("id") || "").trim();
  const aktivan = formData.get("aktivan") === "true";
  if (!id) return;

  await prisma.putnikKupac.update({
    where: { id },
    data: { aktivan },
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${id}`);
  redirect(`/putnik/kupci/${id}`);
}
