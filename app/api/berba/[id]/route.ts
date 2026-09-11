export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { jeL12 } from "@/lib/auth-role";
import { IspravakBerbeGreska, ispraviBerbu } from "@/lib/berba-ispravak";

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * PUT — ispravak greske pri unosu berbe, na cijeloj grupi (datum + sorta +
 * parcela). Pravila su u lib/berba-ispravak.ts: obavezan razlog, zakljucane
 * litre, potvrda za promjenu sorte, stavke punjenja u istoj transakciji,
 * dnevnik po polju.
 *
 * L1/L2 — ADMIN i PODRUM. Brava je ovdje: `proxy.ts` ne pokriva `/api/*`.
 */
export async function PUT(req: Request, { params }: Params) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  if (!jeL12(user.role)) {
    return NextResponse.json(
      { error: "Nemate pravo ispravljati berbu." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let tijelo: Record<string, unknown>;
  try {
    const procitano = await req.json();
    if (!procitano || typeof procitano !== "object" || Array.isArray(procitano)) {
      throw new Error("tijelo");
    }
    tijelo = procitano as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Neispravan zahtjev." }, { status: 400 });
  }

  try {
    const rezultat = await prisma.$transaction(
      (tx) => ispraviBerbu(tx, { berbaId: id, tijelo, korisnikId: user.id }),
      { timeout: 20_000, maxWait: 10_000 }
    );

    return NextResponse.json(rezultat);
  } catch (error) {
    if (error instanceof IspravakBerbeGreska) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Greška kod ispravka berbe:", error);
    return NextResponse.json(
      { error: "Ispravak berbe nije uspio." },
      { status: 500 }
    );
  }
}
