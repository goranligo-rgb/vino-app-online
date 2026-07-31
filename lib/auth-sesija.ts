import { cookies } from "next/headers";
import { AUTH_COOKIE, provjeriToken, type AuthUser } from "@/lib/auth-token";

/**
 * Jedina tocka citanja prijavljenog korisnika na serveru (stranice, server
 * akcije, API rute). Uvijek prolazi kroz provjeru potpisa — nepotpisan ili
 * krivotvoren kolacic daje null, tj. "nije prijavljen".
 *
 * Proxy (proxy.ts) ne moze koristiti next/headers, pa on zove provjeriToken
 * izravno nad req.cookies.
 */
export async function citajSesiju(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  return provjeriToken(cookieStore.get(AUTH_COOKIE)?.value);
}

export type { AuthUser };
