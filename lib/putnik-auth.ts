import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

// Sve razine (1-4) smiju u putnik modul, isto kao canSeePutnik na dashboardu.
const PUTNIK_ROLES = new Set<AuthUser["role"]>([
  "ADMIN",
  "ENOLOG",
  "PODRUM",
  "PREGLED",
]);

export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("auth_user")?.value;
  if (!raw) return null;

  try {
    const user = JSON.parse(decodeURIComponent(raw));
    if (!user || typeof user.role !== "string") return null;
    return user as AuthUser;
  } catch {
    return null;
  }
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
