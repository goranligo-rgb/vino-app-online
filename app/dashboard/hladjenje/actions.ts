"use server";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import { revalidatePath } from "next/cache";
import { uBroj } from "@/lib/temperatura";
import {
  type KomandaTip,
  validiraj,
  smijeUpravljati,
  poljeTanka,
  SOFT_OFF_TEMP,
  jeHladjenjeIskljuceno,
} from "@/lib/tank-komanda";

export type KomandaRezultat = { ok: boolean; error?: string };

// Kreira TankKomanda (NA_CEKANJU) i odmah upise zeljenu vrijednost na Tank
// (da UI prikaze novo stanje). Gateway na Pi-ju preuzima komande sa statusom
// NA_CEKANJU i salje ih kontroleru (Faza B) - vidi gateway/gateway.py.
// Provjera prava je OVDJE (server), ne samo skrivanjem gumba u UI.
//
// Soft-OFF (HLADJENJE_ON / HLADJENJE_OFF): kontroler nema Modbus registar za
// ON/OFF, pa se hladjenje gasi podizanjem zadane temperature na SOFT_OFF_TEMP.
// Pamcenje stare zadane radi se OVDJE, u istoj transakciji u kojoj nastaje
// komanda, a ne u gatewayu - tako ponovni pokusaj upisa na kontroler ne moze
// pregaziti zapamcenu vrijednost, a UI odmah pokazuje novo stanje.
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
    select: { id: true, zadanaTemp: true, zadnjaZadanaTemp: true },
  });
  if (!tank) return { ok: false, error: "Tank ne postoji." };

  const zadanaSad = uBroj(tank.zadanaTemp);
  const zapamcena = uBroj(tank.zadnjaZadanaTemp);
  const iskljuceno = jeHladjenjeIskljuceno(zadanaSad);

  // Sto se uz komandu mijenja na Tanku. Ponovno slanje iste komande (npr. kad
  // prvi pokusaj nije prosao do kontrolera) namjerno NE mijenja nista - samo
  // nastane nova komanda koju gateway pokusa izvrsiti.
  let promjenaTanka: Record<string, unknown> | null = null;

  if (tip === "HLADJENJE_OFF") {
    if (!iskljuceno) {
      if (zadanaSad == null) {
        return {
          ok: false,
          error: "Tank nema zadanu temperaturu - prvo je postavi, pa isključi hlađenje.",
        };
      }
      promjenaTanka = { zadnjaZadanaTemp: zadanaSad, zadanaTemp: SOFT_OFF_TEMP };
    }
  } else if (tip === "HLADJENJE_ON") {
    if (iskljuceno) {
      if (zapamcena == null || jeHladjenjeIskljuceno(zapamcena)) {
        return {
          ok: false,
          error:
            "Nema zapamćene zadane temperature. Upiši željenu zadanu temperaturu - " +
            "hlađenje se uključuje s njom.",
        };
      }
      promjenaTanka = { zadanaTemp: zapamcena, zadnjaZadanaTemp: null };
    }
  } else {
    const polje = poljeTanka(tip);
    if (polje && vrijednost != null) {
      promjenaTanka =
        tip === "ZADANA_TEMP"
          ? // Rucno postavljena zadana ponistava soft-OFF pamcenje: od sada
            // vrijedi ova vrijednost, a ne ono sto je zapamceno prije gasenja.
            { [polje]: vrijednost, zadnjaZadanaTemp: null }
          : { [polje]: vrijednost };
    }
  }

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

      if (promjenaTanka) {
        await tx.tank.update({
          where: { id: tankId },
          data: promjenaTanka,
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

/**
 * Prekidac "SMS obavijesti" za jedan tank (Tank.smsAktivan).
 *
 * NIJE komanda: ne ide preko gatewaya, ne stvara TankKomanda i ne dira kontroler
 * - to je postavka u bazi koja vrijedi odmah. Gateway je samo cita kad odlucuje
 * hoce li poslati SMS.
 *
 * Alarm se time NE gasi: TankAlarm se i dalje otvara, crveni badge i brojaci na
 * dashboardu ostaju isti. Utisava se samo poruka.
 *
 * Prava su ista kao za komande (ADMIN/ENOLOG/PODRUM) i provjeravaju se OVDJE,
 * ne skrivanjem prekidaca u UI-ju.
 */
export async function postaviSmsObavijesti(input: {
  tankId: string;
  aktivan: boolean;
}): Promise<KomandaRezultat> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Niste prijavljeni." };
  if (!smijeUpravljati(user.role)) {
    return { ok: false, error: "Nemate pravo mijenjati postavke hlađenja." };
  }

  const { tankId, aktivan } = input;
  if (typeof aktivan !== "boolean") return { ok: false, error: "Neispravna vrijednost." };

  try {
    const tank = await prisma.tank.update({
      where: { id: tankId },
      data: { smsAktivan: aktivan },
      select: { broj: true },
    });
    console.log(
      `[sms] Tank ${tank.broj}: SMS obavijesti ${aktivan ? "UKLJUČENE" : "ISKLJUČENE"} ` +
        `(${user.ime})`
    );
  } catch (e) {
    console.error("postaviSmsObavijesti greška:", e);
    return { ok: false, error: "Greška kod spremanja postavke." };
  }

  revalidatePath("/dashboard/hladjenje");
  revalidatePath(`/tankovi/${tankId}`);
  return { ok: true };
}

/**
 * Prekidac "izuzmi iz samokontrole" za jedan tank (Tank.samokontrolaAktivna).
 *
 * Kao i SMS prekidac: obicna postavka u bazi, ne komanda - ne stvara
 * TankKomanda, ne ide kroz gateway i vrijedi odmah. Samokontrola je ionako samo
 * usporedba litraze i stanja hladjenja u aplikaciji.
 *
 * Izuzimanje ne dira ni alarme ni SMS - gasi samo zuti podsjetnik na kartici.
 */
export async function postaviSamokontrolu(input: {
  tankId: string;
  aktivna: boolean;
}): Promise<KomandaRezultat> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Niste prijavljeni." };
  if (!smijeUpravljati(user.role)) {
    return { ok: false, error: "Nemate pravo mijenjati postavke hlađenja." };
  }

  const { tankId, aktivna } = input;
  if (typeof aktivna !== "boolean") return { ok: false, error: "Neispravna vrijednost." };

  try {
    const tank = await prisma.tank.update({
      where: { id: tankId },
      data: { samokontrolaAktivna: aktivna },
      select: { broj: true },
    });
    console.log(
      `[samokontrola] Tank ${tank.broj}: ${aktivna ? "UKLJUČEN u provjeru" : "IZUZET iz provjere"} ` +
        `(${user.ime})`
    );
  } catch (e) {
    console.error("postaviSamokontrolu greška:", e);
    return { ok: false, error: "Greška kod spremanja postavke." };
  }

  revalidatePath("/dashboard/hladjenje");
  revalidatePath(`/tankovi/${tankId}`);
  return { ok: true };
}
