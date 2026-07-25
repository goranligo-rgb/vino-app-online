"use client";

/**
 * Citanje prijavljenog korisnika iz auth_user cookieja NA KLIJENTU.
 *
 * Zasto postoji: login (app/api/login/route.ts) sam radi encodeURIComponent nad
 * JSON-om, a NextResponse.cookies.set vrijednost kodira JOS JEDNOM. Server to ne
 * primjecuje jer cookies().get() automatski dekodira jednom, pa getAuthUser
 * ukupno dekodira dvaput i dobije ispravan JSON. Klijent kroz document.cookie
 * dobije sirovu, dvostruko kodiranu vrijednost — jedan decodeURIComponent nije
 * dovoljan i JSON.parse pukne.
 *
 * Zato dekodiramo u petlji dok se ne dobije valjan JSON. Tako radi i ako se
 * dvostruko kodiranje jednom popravi na loginu (tada uspije iz prvog pokusaja).
 *
 * VAZNO: ovo je SAMO za prikaz (skrivanje linkova/kontrola). Pravu zastitu rade
 * proxy.ts i requireLevel12User / requirePutnikUser na serveru.
 */

export type AuthUserKlijent = {
  id?: string;
  ime?: string;
  email?: string;
  role?: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export function citajAuthUserKlijent(): AuthUserKlijent | null {
  if (typeof document === "undefined") return null;

  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith("auth_user="))
    ?.slice("auth_user=".length);

  if (!raw) return null;

  let vrijednost = raw;
  // Najvise 4 prolaza — dosta za jednostruko i dvostruko kodiranje, bez rizika
  // od beskonacne petlje na neocekivanom ulazu.
  for (let i = 0; i < 4; i++) {
    try {
      const parsed = JSON.parse(vrijednost);
      if (parsed && typeof parsed === "object") return parsed as AuthUserKlijent;
    } catch {
      // jos nije JSON — probaj dekodirati jos jednom
    }

    let dekodirano: string;
    try {
      dekodirano = decodeURIComponent(vrijednost);
    } catch {
      return null; // neispravan postotak-zapis
    }

    if (dekodirano === vrijednost) return null; // vise se nema sto dekodirati
    vrijednost = dekodirano;
  }

  return null;
}

// Level 1 (ADMIN) ili Level 2 (PODRUM) — isto mapiranje kao requireLevel12User.
export function jeL12Klijent(user: AuthUserKlijent | null): boolean {
  return user?.role === "ADMIN" || user?.role === "PODRUM";
}
