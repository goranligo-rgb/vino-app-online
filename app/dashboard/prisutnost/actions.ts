"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import { danasHr, danUBazu, danIzBaze } from "@/lib/prisutnost";

export type Rezultat = { ok: boolean; poruka?: string; upozorenje?: string };

/**
 * PRIJAVA — otvara zapis za današnji dan.
 *
 * userId se NIKAD ne uzima iz forme, nego iz sesije (server action je dostupna i
 * izravnim POST-om, pa je provjera ovdje jedina prava zaštita).
 */
export async function prijaviSe(): Promise<Rezultat> {
  const user = await getAuthUser();
  if (!user) return { ok: false, poruka: "Niste prijavljeni." };

  const otvoren = await prisma.radnaPrijava.findFirst({
    where: { userId: user.id, odlazakU: null },
    orderBy: { dolazakU: "desc" },
  });

  const danas = danasHr();

  if (otvoren) {
    const danOtvorenog = danIzBaze(otvoren.datum);
    // Isti dan: već je prijavljen — druga prijava bi napravila duplu evidenciju.
    if (danOtvorenog === danas) {
      return { ok: false, poruka: "Već ste prijavljeni. Prvo se odjavite." };
    }
    // Raniji dan: zaboravljena odjava. Ne diramo je (admin je ispravlja u
    // evidenciji), ali korisnika upozoravamo i novu prijavu dopuštamo.
    await prisma.radnaPrijava.create({
      data: { userId: user.id, datum: danUBazu(danas), dolazakU: new Date() },
    });
    revalidatePath("/dashboard/prisutnost");
    revalidatePath("/dashboard");   // gumb prisutnosti na vrhu dashboarda
    return {
      ok: true,
      upozorenje: `Prijava zabilježena, ali zapis od ${danOtvorenog} nema odjavu — javite administratoru da ga ispravi.`,
    };
  }

  await prisma.radnaPrijava.create({
    data: { userId: user.id, datum: danUBazu(danas), dolazakU: new Date() },
  });
  revalidatePath("/dashboard/prisutnost");
  revalidatePath("/dashboard");   // gumb prisutnosti na vrhu dashboarda
  return { ok: true, poruka: "Prijava zabilježena." };
}

/** ODJAVA — zatvara zadnji otvoreni zapis prijavljenog korisnika. */
export async function odjaviSe(): Promise<Rezultat> {
  const user = await getAuthUser();
  if (!user) return { ok: false, poruka: "Niste prijavljeni." };

  const otvoren = await prisma.radnaPrijava.findFirst({
    where: { userId: user.id, odlazakU: null },
    orderBy: { dolazakU: "desc" },
  });

  if (!otvoren) {
    return { ok: false, poruka: "Nemate otvorenu prijavu — prvo se prijavite." };
  }

  const sad = new Date();
  if (sad.getTime() < otvoren.dolazakU.getTime()) {
    return { ok: false, poruka: "Vrijeme odjave je prije prijave — javite administratoru." };
  }

  await prisma.radnaPrijava.update({
    where: { id: otvoren.id },
    data: { odlazakU: sad },
  });
  revalidatePath("/dashboard/prisutnost");
  revalidatePath("/dashboard");   // gumb prisutnosti na vrhu dashboarda

  const danOtvorenog = danIzBaze(otvoren.datum);
  return {
    ok: true,
    poruka: "Odjava zabilježena.",
    upozorenje:
      danOtvorenog !== danasHr()
        ? `Zatvoren je zapis od ${danOtvorenog} (prijava je ostala otvorena od tada).`
        : undefined,
  };
}

/**
 * ADMIN ispravak zapisa (npr. zaboravljena odjava). Samo Level 1 (ADMIN).
 * Napomena je OBAVEZNA i pamti se tko je i kad ispravio.
 */
export async function urediZapis(input: {
  id: string;
  dolazakU: string; // "YYYY-MM-DDTHH:MM" iz datetime-local
  odlazakU: string; // prazno = i dalje otvoren
  napomena: string;
}): Promise<Rezultat> {
  const user = await getAuthUser();
  if (!user) return { ok: false, poruka: "Niste prijavljeni." };
  if (user.role !== "ADMIN") return { ok: false, poruka: "Samo administrator smije ispravljati evidenciju." };

  const napomena = (input.napomena || "").trim();
  if (!napomena) return { ok: false, poruka: "Napomena je obavezna kod ispravka." };

  const zapis = await prisma.radnaPrijava.findUnique({ where: { id: input.id } });
  if (!zapis) return { ok: false, poruka: "Zapis ne postoji." };

  const dolazak = new Date(input.dolazakU);
  if (Number.isNaN(dolazak.getTime())) return { ok: false, poruka: "Neispravno vrijeme dolaska." };

  let odlazak: Date | null = null;
  if (input.odlazakU) {
    odlazak = new Date(input.odlazakU);
    if (Number.isNaN(odlazak.getTime())) return { ok: false, poruka: "Neispravno vrijeme odlaska." };
    if (odlazak.getTime() <= dolazak.getTime()) {
      return { ok: false, poruka: "Odlazak mora biti nakon dolaska." };
    }
  }

  await prisma.radnaPrijava.update({
    where: { id: zapis.id },
    data: {
      dolazakU: dolazak,
      odlazakU: odlazak,
      napomena,
      uredioId: user.id,
      uredenoU: new Date(),
    },
  });

  revalidatePath("/dashboard/prisutnost/evidencija");
  revalidatePath("/dashboard/prisutnost");
  revalidatePath("/dashboard");   // gumb prisutnosti na vrhu dashboarda
  return { ok: true, poruka: "Zapis ispravljen." };
}

/** ADMIN dopuna: ručni unos cijelog zapisa za dan (npr. netko se uopće nije prijavio). */
export async function dodajZapis(input: {
  userId: string;
  dolazakU: string;
  odlazakU: string;
  napomena: string;
}): Promise<Rezultat> {
  const user = await getAuthUser();
  if (!user) return { ok: false, poruka: "Niste prijavljeni." };
  if (user.role !== "ADMIN") return { ok: false, poruka: "Samo administrator smije dopunjavati evidenciju." };

  const napomena = (input.napomena || "").trim();
  if (!napomena) return { ok: false, poruka: "Napomena je obavezna kod ručnog unosa." };

  const dolazak = new Date(input.dolazakU);
  if (Number.isNaN(dolazak.getTime())) return { ok: false, poruka: "Neispravno vrijeme dolaska." };

  let odlazak: Date | null = null;
  if (input.odlazakU) {
    odlazak = new Date(input.odlazakU);
    if (Number.isNaN(odlazak.getTime())) return { ok: false, poruka: "Neispravno vrijeme odlaska." };
    if (odlazak.getTime() <= dolazak.getTime()) {
      return { ok: false, poruka: "Odlazak mora biti nakon dolaska." };
    }
  }

  const cilj = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!cilj) return { ok: false, poruka: "Korisnik ne postoji." };

  // Dan se uzima iz vremena dolaska, u hrvatskoj zoni.
  await prisma.radnaPrijava.create({
    data: {
      userId: cilj.id,
      datum: danUBazu(danasHr(dolazak)),
      dolazakU: dolazak,
      odlazakU: odlazak,
      napomena,
      uredioId: user.id,
      uredenoU: new Date(),
    },
  });

  revalidatePath("/dashboard/prisutnost/evidencija");
  revalidatePath("/dashboard/prisutnost");
  return { ok: true, poruka: "Zapis dodan." };
}
