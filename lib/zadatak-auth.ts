import { citajSesiju } from "@/lib/auth-sesija";
import type { AuthUser } from "@/lib/auth-token";

/**
 * Citanje prijavljenog korisnika i provjera role UNUTAR same server akcije.
 *
 * Proxy (proxy.ts) stiti samo navigaciju po stranicama — /api rute nisu u
 * njegovom matcheru, pa bi bez ove provjere svaki POST na /api/... prosao.
 * Zato svaka ruta koja mijenja stanje mora sama provjeriti rolu.
 *
 * Sesija se cita iz potpisanog tokena (lib/auth-token) — nepotpisan ili
 * izmijenjen kolacic vraca null.
 */

export type { AuthUser };

export async function getAuthUser(): Promise<AuthUser | null> {
  return citajSesiju();
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
