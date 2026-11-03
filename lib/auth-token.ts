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

/** Koliko vrijede token i kolacic od zadnje obnove. */
export const TRAJANJE_SEKUNDI = 60 * 60 * 24 * 90; // 90 dana

/** Proxy obnavlja token tek kad je stariji od ovoga, ne na svakom zahtjevu. */
const PRAG_OBNOVE_SEKUNDI = 60 * 60 * 24 * 7; // 7 dana

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

function sadaSekunde(): number {
  return Math.floor(Date.now() / 1000);
}

async function potpisiSadrzaj(sadrzaj: Record<string, unknown>): Promise<string> {
  const glava = b64urlIzObjekta({ alg: "HS256", typ: "JWT" });
  const tijelo = b64urlIzObjekta(sadrzaj);

  const potpis = await crypto.subtle.sign(
    "HMAC",
    await kljuc(),
    enc.encode(`${glava}.${tijelo}`)
  );

  return `${glava}.${tijelo}.${b64urlIzBajtova(new Uint8Array(potpis))}`;
}

/** Izradi potpisani token za prijavljenog korisnika. */
export async function potpisiToken(user: AuthUser): Promise<string> {
  const sada = sadaSekunde();

  return potpisiSadrzaj({
    sub: user.id,
    ime: user.ime,
    role: user.role,
    iat: sada,
    exp: sada + TRAJANJE_SEKUNDI,
  });
}

/**
 * Sadrzaj tokena ako je token uredan, inace null: nema tokena, krivi oblik,
 * neispravan potpis, istekao, nepoznata rola — ukljucujuci i stare nepotpisane
 * JSON kolacice (oni ce pasti na obliku).
 */
async function ispravanSadrzaj(
  token: string | undefined | null
): Promise<Record<string, unknown> | null> {
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
    if (podaci.exp <= sadaSekunde()) return null;

    if (typeof podaci?.sub !== "string" || !podaci.sub) return null;
    if (!ROLE.has(podaci?.role)) return null;

    return podaci;
  } catch {
    return null;
  }
}

/** Provjeri token i vrati korisnika; za sve sto nije uredno vraca null. */
export async function provjeriToken(
  token: string | undefined | null
): Promise<AuthUser | null> {
  const podaci = await ispravanSadrzaj(token);
  if (!podaci) return null;

  return {
    id: podaci.sub as string,
    ime: typeof podaci.ime === "string" ? podaci.ime : "",
    role: podaci.role as AuthUser["role"],
  };
}

/**
 * Produzuje sesiju: 90 dana od zadnjeg koristenja. Novi token ima isti sadrzaj
 * osim iat/exp, pa obnova ne moze promijeniti ni korisnika ni ulogu. Vraca null
 * ako obnova nije potrebna ili token nije valjan.
 *
 * Deaktiviranom korisniku obnova ne pomaze: citajSesiju ga odbija uz redak iz baze.
 */
export async function obnoviTokenAkoTreba(
  token: string | undefined | null
): Promise<string | null> {
  const podaci = await ispravanSadrzaj(token);
  if (!podaci || typeof podaci.iat !== "number") return null;

  const sada = sadaSekunde();
  if (sada - podaci.iat <= PRAG_OBNOVE_SEKUNDI) return null;

  return potpisiSadrzaj({
    ...podaci,
    iat: sada,
    exp: sada + TRAJANJE_SEKUNDI,
  });
}

/**
 * Sesija uz redak iz baze. Neaktivan ili obrisan korisnik nema sesiju.
 *
 * Razlika u ulozi takodjer znaci novu prijavu, a ne tiho citanje nove uloge:
 * proxy dopusta rute prema ulozi IZ TOKENA, a obnova je ne mijenja. Bez ovoga bi
 * aktivan korisnik staru ulogu u proxyju zadrzao zauvijek. Nova prijava daje nov
 * token, pa se proxy i stranice opet slazu.
 */
export function sesijaIzBaze(
  izTokena: AuthUser,
  redak: { active: boolean; role: string; ime: string } | null
): AuthUser | null {
  if (!redak || !redak.active) return null;
  if (redak.role !== izTokena.role) return null;

  return { id: izTokena.id, ime: redak.ime, role: izTokena.role };
}

/**
 * Postavke kolacica — na jednom mjestu da login i logout ne odu u razmak.
 *
 * NAMJERNO bez maxAge: odjava koristi ove iste opcije uz expires u proslosti, a
 * maxAge ima prednost pred expires, pa se kolacic ne bi obrisao. Vidi
 * opcijeTrajnogKolacica.
 */
export function opcijeKolacica() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

/** Za prijavu i obnovu: kolacic prezivi zatvaranje preglednika na mobitelu. */
export function opcijeTrajnogKolacica() {
  return { ...opcijeKolacica(), maxAge: TRAJANJE_SEKUNDI };
}
