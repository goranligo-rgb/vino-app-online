/**
 * Kamo smije voditi povratak nakon prijave (?next=).
 *
 * Vrijednost dolazi iz URL-a, pa je svatko moze sloziti i poslati nekome kao
 * poveznicu. Zato prolazi samo relativna putanja unutar aplikacije; sve ostalo
 * ide na /dashboard, kao da next nije ni poslan.
 *
 * Bez ovisnosti o next/* — uvoze ga i proxy.ts i klijentska stranica prijave.
 */

const ZADANO = "/dashboard";
const INTERNI_IZVOR = "http://interno.invalid";

/**
 * Proxy ovdje predaje putanju zahtjeva stranici, jer je server komponenta sama
 * ne zna. Proxy ga prepisuje na svakom zahtjevu koji pusti dalje, a i da ga netko
 * podmetne, vrijednost i dalje prolazi kroz sigurnaPutanja().
 */
export const ZAGLAVLJE_PUTANJE = "x-vino-putanja";

export function sigurnaPutanja(sirovo: string | null | undefined): string {
  if (!sirovo || !sirovo.startsWith("/")) return ZADANO;

  // "//evil.com" i "/\evil.com" preglednik cita kao drugu domenu. Kontrolne znakove
  // URL parser izbacuje, pa bi "/<TAB>/evil.com" tek nakon toga postao "//evil.com".
  if (sirovo.startsWith("//") || sirovo.includes("\\")) return ZADANO;
  if (/[\u0000-\u001f\u007f]/.test(sirovo)) return ZADANO;

  let url: URL;
  try {
    url = new URL(sirovo, INTERNI_IZVOR);
  } catch {
    return ZADANO;
  }

  if (url.origin !== INTERNI_IZVOR) return ZADANO;

  // Provjera NAKON normalizacije: "/.//evil.com" tek ovdje postane "//evil.com".
  if (url.pathname.startsWith("//")) return ZADANO;

  // Povratak na prijavu bio bi krug, a /api/* nije stranica.
  const putanja = url.pathname.toLowerCase();
  if (putanja === "/login" || putanja.startsWith("/login/")) return ZADANO;
  if (putanja === "/api" || putanja.startsWith("/api/")) return ZADANO;

  return url.pathname + url.search + url.hash;
}

/** Adresa prijave koja nakon uspjeha vraca na zadanu putanju. */
export function putanjaPrijave(povratak: string | null | undefined): string {
  const putanja = sigurnaPutanja(povratak);
  return putanja === ZADANO
    ? "/login"
    : `/login?next=${encodeURIComponent(putanja)}`;
}
