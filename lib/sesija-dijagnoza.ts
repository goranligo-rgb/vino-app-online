/**
 * PRIVREMENO, brise se zajedno sa /sesija-dijagnoza kad se rijesi prijava na iOS-u.
 *
 * provjeriToken namjerno sve neuspjehe svodi na null. Ovdje treba RAZLOG, pa je
 * ista provjera ponovljena korak po korak, istim redom. Da se dvije provjere ne
 * raziđu, scripts/test-sesija-dijagnoza.ts usporedjuje rezultat s provjeriToken.
 *
 * sub i role sluze samo za usporedbu s bazom i ne smiju na ekran.
 */

export type RazlogTokena =
  | "nema"
  | "tajna"
  | "oblik"
  | "potpis"
  | "istekao"
  | "ispravan";

export type RazlogSesije = Exclude<RazlogTokena, "ispravan"> | "neaktivan" | "uloga" | "ok";

export const PORUKA_RAZLOGA: Record<RazlogSesije | "baza", string> = {
  nema: "Nema kolačića",
  tajna: "Poslužitelj nema AUTH_SECRET",
  oblik: "Krivi oblik",
  potpis: "Loš potpis",
  istekao: "Istekao",
  neaktivan: "Neaktivan ili obrisan korisnik",
  uloga: "Druga uloga",
  ok: "OK",
  baza: "Baza nije odgovorila",
};

export type ProcitaniToken = {
  razlog: RazlogTokena;
  iat: number | null;
  exp: number | null;
  sub: string | null;
  role: string | null;
};

const ROLE = new Set(["ADMIN", "ENOLOG", "PODRUM", "PREGLED"]);
const enc = new TextEncoder();
const dec = new TextDecoder();

function bajtovi(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function broj(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

/** Koliko auth_user kolacica je stvarno stiglo. cookies() ih sazme u jedan. */
export function brojKolacica(zaglavlje: string | null): number {
  if (!zaglavlje) return 0;
  return zaglavlje.split(";").filter((d) => d.trim().startsWith("auth_user=")).length;
}

export async function procitajToken(
  token: string | null | undefined
): Promise<ProcitaniToken> {
  const nista = { iat: null, exp: null, sub: null, role: null };

  if (!token) return { razlog: "nema", ...nista };

  const tajna = process.env.AUTH_SECRET;
  if (!tajna || tajna.length < 32) return { razlog: "tajna", ...nista };

  const dijelovi = token.split(".");
  if (dijelovi.length !== 3) return { razlog: "oblik", ...nista };
  const [glava, tijelo, potpis] = dijelovi;

  let podaci: Record<string, unknown>;
  let valjan: boolean;
  try {
    podaci = JSON.parse(dec.decode(bajtovi(tijelo)));
    const kljuc = await crypto.subtle.importKey(
      "raw",
      enc.encode(tajna),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    valjan = await crypto.subtle.verify(
      "HMAC",
      kljuc,
      bajtovi(potpis) as unknown as ArrayBuffer,
      enc.encode(`${glava}.${tijelo}`)
    );
  } catch {
    return { razlog: "oblik", ...nista };
  }

  // Datumi se pokazuju i uz los potpis: promijenjena tajna tako postane vidljiva.
  const datumi = { iat: broj(podaci?.iat), exp: broj(podaci?.exp) };
  const bezKorisnika = { ...datumi, sub: null, role: null };

  if (!valjan) return { razlog: "potpis", ...bezKorisnika };

  let zaglavlje: { alg?: unknown } | null;
  try {
    zaglavlje = JSON.parse(dec.decode(bajtovi(glava)));
  } catch {
    return { razlog: "oblik", ...bezKorisnika };
  }
  if (zaglavlje?.alg !== "HS256") return { razlog: "oblik", ...bezKorisnika };

  if (datumi.exp === null) return { razlog: "oblik", ...bezKorisnika };
  if (datumi.exp <= Math.floor(Date.now() / 1000)) {
    return { razlog: "istekao", ...bezKorisnika };
  }

  if (typeof podaci.sub !== "string" || !podaci.sub) {
    return { razlog: "oblik", ...bezKorisnika };
  }
  if (typeof podaci.role !== "string" || !ROLE.has(podaci.role)) {
    return { razlog: "oblik", ...bezKorisnika };
  }

  return { razlog: "ispravan", ...datumi, sub: podaci.sub, role: podaci.role };
}

/** Isti zakljucak kao sesijaIzBaze u lib/auth-token.ts. */
export function razlogSUBazom(
  roleIzTokena: string | null,
  redak: { active: boolean; role: string } | null
): RazlogSesije {
  if (!redak || !redak.active) return "neaktivan";
  return redak.role === roleIzTokena ? "ok" : "uloga";
}
