import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { citajSesiju } from "@/lib/auth-sesija";
import type { AuthUser } from "@/lib/auth-token";

export type { AuthUser };

// Sve razine (1-4) smiju u putnik modul, isto kao canSeePutnik na dashboardu.
const PUTNIK_ROLES = new Set<AuthUser["role"]>([
  "ADMIN",
  "ENOLOG",
  "PODRUM",
  "PREGLED",
]);

// Sesija dolazi iz potpisanog tokena (lib/auth-token); krivotvoren ili
// nepotpisan kolacic = nije prijavljen.
export async function getAuthUser(): Promise<AuthUser | null> {
  return citajSesiju();
}

/**
 * Provjera prava pristupa za /api/putnik/* rute.
 * Vraća prijavljenog korisnika ili NextResponse s 401/403 greškom.
 *
 * Korištenje:
 *   const auth = await requirePutnikAccess();
 *   if (auth instanceof NextResponse) return auth;
 *   // auth je sada AuthUser
 */
export async function requirePutnikAccess(): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json(
      { error: "Niste prijavljeni." },
      { status: 401 }
    );
  }

  if (!PUTNIK_ROLES.has(user.role)) {
    return NextResponse.json(
      { error: "Nemate pravo pristupa putnik modulu." },
      { status: 403 }
    );
  }

  return user;
}

/**
 * Provjera prava za Server Actions (forme). Ako korisnik nije prijavljen ili
 * nema pravo na putnik modul, preusmjerava na /login (redirect baca pa funkcija
 * dalje ne nastavlja). Inače vraća prijavljenog korisnika.
 *
 * Dokumentacija Next.js izričito traži auth provjeru UNUTAR svake server akcije,
 * ne samo na razini stranice/middlewarea.
 */
export async function requirePutnikUser(): Promise<AuthUser> {
  const user = await getAuthUser();

  if (!user || !PUTNIK_ROLES.has(user.role)) {
    redirect("/login");
  }

  return user;
}

/**
 * Samo Level 1 (ADMIN) i Level 2 (PODRUM) — za upravljanje ulaznom zalihom i
 * katalogom promo artikala. Mapiranje razina: ADMIN=L1, PODRUM=L2, ENOLOG=L3,
 * PREGLED=L4 (potvrđeno u app/dashboard/page.tsx). L3/L4 se preusmjeravaju —
 * tako fizički ne mogu kreirati ulaz ni ručnim pozivom server akcije.
 */
export async function requireLevel12User(): Promise<AuthUser> {
  const user = await getAuthUser();

  if (!user || (user.role !== "ADMIN" && user.role !== "PODRUM")) {
    redirect("/putnik");
  }

  return user;
}

/**
 * Samo Level 1 (ADMIN) — npr. lista primatelja dnevnog maila (5C).
 */
export async function requireAdminUser(): Promise<AuthUser> {
  const user = await getAuthUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/putnik");
  }

  return user;
}
