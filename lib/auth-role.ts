/**
 * Smije li rola PISATI po tanku (uredjivati sastav, prilagati dokumente,
 * arhivirati)?
 *
 * Razine su: ADMIN=L1, PODRUM=L2, ENOLOG=L3, PREGLED=L4. Pisanje po tanku je
 * L1 i L2 — isto mapiranje koje vec koriste `jeL12Klijent` (lib/auth-klijent)
 * i `requireLevel12User` (lib/putnik-auth).
 *
 * ZASTO ZASEBNA DATOTEKA: pravilo je do sada bilo prepisano na pet mjesta, i to
 * u NEGATIVNOM obliku (`role === "ENOLOG" || role === "PREGLED"`), pa je svaka
 * nova rola tiho dobivala prava pisanja. Ovdje stoji jednom, u potvrdnom
 * obliku. Modul je namjerno bez ijedne ovisnosti — ni "use client", ni
 * next/headers, ni Prisma — da se smije uvesti i na posluzitelju i u
 * klijentskoj komponenti bez povlacenja icega u paket preglednika.
 *
 * OVO JE SAMO ZA PRIKAZ. Pravu zastitu rade proxy.ts i provjere u rutama;
 * skrivanje gumba je uljudnost prema korisniku, ne brava.
 */

export type Rola = "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";

export function jeL12(rola: Rola | string | null | undefined): boolean {
  return rola === "ADMIN" || rola === "PODRUM";
}
