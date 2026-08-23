"use client";

/**
 * Tko je prijavljen — NA KLIJENTU.
 *
 * Prije se citalo iz document.cookie, ali auth_user je sada potpisani token i
 * httpOnly, pa ga JS uopce ne vidi (i ne bi ga trebao — u tome je i poanta).
 * Umjesto toga pitamo server preko GET /api/me.
 *
 * VAZNO: ovo je i dalje SAMO za prikaz (skrivanje linkova/kontrola). Pravu
 * zastitu rade proxy.ts i provjere u rutama/server akcijama.
 */

import { jeL12 } from "@/lib/auth-role";

export type AuthUserKlijent = {
  id?: string;
  ime?: string;
  email?: string;
  role?: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export async function dohvatiAuthUserKlijent(): Promise<AuthUserKlijent | null> {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return null;

    const data = await res.json();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

// Level 1 (ADMIN) ili Level 2 (PODRUM). Pravilo zivi u lib/auth-role.ts —
// ovdje je samo omotac koji iz korisnika izvadi rolu, da isti uvjet ne postoji
// u dvije verzije.
export function jeL12Klijent(user: AuthUserKlijent | null): boolean {
  return jeL12(user?.role);
}
