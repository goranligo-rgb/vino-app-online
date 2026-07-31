/**
 * Potpisani sesijski token (JWT, HS256).
 *
 * Zasto: prije je auth_user bio goli JSON u kolacicu — svatko ga je mogao
 * prepisati u {"role":"ADMIN"} i dobiti L1 prava. Sada kolacic nosi token koji
 * je potpisan tajnom iz AUTH_SECRET; bez te tajne potpis se ne moze izraditi,
 * pa je svaka izmjena sadrzaja odmah vidljiva kod provjere.
 *
 * Namjerno bez vanjske biblioteke i bez node:crypto — koristi se Web Crypto
 * (globalThis.crypto.subtle), koji radi i u Node runtimeu (rute, stranice) i u
 * Edge runtimeu. Zato ovaj modul NE smije uvoziti nista iz "next/headers":
 * uvozi ga i proxy.ts. Citanje kolacica je u lib/auth-sesija.ts.
 */

export type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export const AUTH_COOKIE = "auth_user";

/** Koliko token vrijedi. Kolacic je sesijski, ovo je gornja granica. */
const TRAJANJE_SEKUNDI = 60 * 60 * 24 * 30; // 30 dana

const ROLE = new Set<AuthUser["role"]>([
  "ADMIN",
  "ENOLOG",
  "PODRUM",
  "PREGLED",
]);

const enc = new TextEncoder();
const dec = new TextDecoder();

function tajna(): string {
  const s = process.env.AUTH_SECRET;

  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SECRET nije postavljen (ili je kraci od 32 znaka). Bez njega se sesija ne moze potpisati."
    );
  }

  return s;
}

/** Je li tajna uopce dostupna — za jasnu poruku na loginu umjesto 500. */
export function imaTajnu(): boolean {
  const s = process.env.AUTH_SECRET;
  return typeof s === "string" && s.length >= 32;
}

function b64urlIzBajtova(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bajtoviIzB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlIzObjekta(o: unknown): string {
  return b64urlIzBajtova(enc.encode(JSON.stringify(o)));
}

async function kljuc(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(tajna()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Izradi potpisani token za prijavljenog korisnika. */
export async function potpisiToken(user: AuthUser): Promise<string> {
  const sada = Math.floor(Date.now() / 1000);

  const glava = b64urlIzObjekta({ alg: "HS256", typ: "JWT" });
  const tijelo = b64urlIzObjekta({
    sub: user.id,
    ime: user.ime,
    role: user.role,
    iat: sada,
    exp: sada + TRAJANJE_SEKUNDI,
  });

  const potpis = await crypto.subtle.sign(
    "HMAC",
    await kljuc(),
    enc.encode(`${glava}.${tijelo}`)
  );

  return `${glava}.${tijelo}.${b64urlIzBajtova(new Uint8Array(potpis))}`;
}

/**
 * Provjeri token i vrati korisnika. Vraca null za sve sto nije uredno:
 * nema tokena, krivi oblik, neispravan potpis, istekao, nepoznata rola —
 * ukljucujuci i stare nepotpisane JSON kolacice (oni ce pasti na obliku).
 */
export async function provjeriToken(
  token: string | undefined | null
): Promise<AuthUser | null> {
  if (!token) return null;

  try {
    const dijelovi = token.split(".");
    if (dijelovi.length !== 3) return null;

    const [glava, tijelo, potpis] = dijelovi;

    const valjan = await crypto.subtle.verify(
      "HMAC",
      await kljuc(),
      bajtoviIzB64url(potpis) as unknown as ArrayBuffer,
      enc.encode(`${glava}.${tijelo}`)
    );
    if (!valjan) return null;

    // Tek nakon provjere potpisa gledamo sadrzaj — nikad obrnuto.
    const zaglavlje = JSON.parse(dec.decode(bajtoviIzB64url(glava)));
    if (zaglavlje?.alg !== "HS256") return null;

    const podaci = JSON.parse(dec.decode(bajtoviIzB64url(tijelo)));

    if (typeof podaci?.exp !== "number") return null;
    if (podaci.exp <= Math.floor(Date.now() / 1000)) return null;

    if (typeof podaci?.sub !== "string" || !podaci.sub) return null;
    if (!ROLE.has(podaci?.role)) return null;

    return {
      id: podaci.sub,
      ime: typeof podaci.ime === "string" ? podaci.ime : "",
      role: podaci.role,
    };
  } catch {
    return null;
  }
}

/** Postavke kolacica — na jednom mjestu da login i logout ne odu u razmak. */
export function opcijeKolacica() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}
