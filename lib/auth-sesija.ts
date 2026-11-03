import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  AUTH_COOKIE,
  provjeriToken,
  sesijaIzBaze,
  type AuthUser,
} from "@/lib/auth-token";
import { putanjaPrijave, ZAGLAVLJE_PUTANJE } from "@/lib/sigurna-putanja";

/**
 * Jedina tocka citanja prijavljenog korisnika na serveru (stranice, server
 * akcije, API rute). Uvijek prolazi kroz provjeru potpisa — nepotpisan ili
 * krivotvoren kolacic daje null, tj. "nije prijavljen".
 *
 * Token vrijedi 90 dana od zadnjeg koristenja, pa se uz njega gleda i redak iz
 * baze: deaktiviran korisnik ili promijenjena uloga daju null (lib/auth-token,
 * sesijaIzBaze). cache(): jedan render radi jedan upit, ma koliko komponenti pitalo.
 *
 * Greska baze se NAMJERNO baca, a ne pretvara u null: kratki prekid baze ne smije
 * odjaviti korisnika.
 *
 * Proxy (proxy.ts) ne moze koristiti next/headers, pa on zove provjeriToken
 * izravno nad req.cookies. Zato proxy ne vidi deaktivaciju i svaka stranica s
 * podacima mora sama zvati citajSesiju.
 */
export const citajSesiju = cache(async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const izTokena = await provjeriToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!izTokena) return null;

  const redak = await prisma.user.findUnique({
    where: { id: izTokena.id },
    select: { active: true, role: true, ime: true },
  });

  return sesijaIzBaze(izTokena, redak);
});

/**
 * Kamo stranica salje korisnika bez sesije: na prijavu, s povratkom na putanju koju
 * je proxy predao. Tako i nakon deaktivacije, promjene uloge ili isteka sesije
 * skeniranje naljepnice nakon prijave vodi na tank.
 */
export async function adresaPrijave(): Promise<string> {
  const zaglavlja = await headers();
  return putanjaPrijave(zaglavlja.get(ZAGLAVLJE_PUTANJE));
}

export type { AuthUser };
