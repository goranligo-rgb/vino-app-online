import { cookies } from "next/headers";

/**
 * Citanje prijavljenog korisnika i provjera role UNUTAR same server akcije.
 *
 * Proxy (proxy.ts) stiti samo navigaciju po stranicama — /api rute nisu u
 * njegovom matcheru, pa bi bez ove provjere svaki POST na /api/... prosao.
 * Zato svaka ruta koja mijenja stanje mora sama provjeriti rolu.
 */

export type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("auth_user")?.value;

    if (!raw) return null;

    const user = JSON.parse(decodeURIComponent(raw));

    if (!user?.id || !user?.role) return null;

    return user as AuthUser;
  } catch {
    return null;
  }
}

/** ADMIN i ENOLOG — smiju i ono sto se tesko vraca (npr. ponistavanje). */
export function smijeUpravljati(user: AuthUser | null): boolean {
  return user?.role === "ADMIN" || user?.role === "ENOLOG";
}

/**
 * ADMIN, ENOLOG i PODRUM — smiju raditi u podrumu (kreirati i izvrsavati).
 * PREGLED je namjerno izostavljen: to je razina samo za citanje (proxy.ts mu
 * dopusta samo /dashboard i /putnik).
 */
export function smijeRaditiUPodrumu(user: AuthUser | null): boolean {
  return (
    user?.role === "ADMIN" ||
    user?.role === "ENOLOG" ||
    user?.role === "PODRUM"
  );
}
