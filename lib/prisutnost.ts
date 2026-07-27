/**
 * Evidencija radnog vremena — zajednički pomoćnici (bez baze, lako testabilno).
 *
 * KLJUČNO: server radi u UTC-u (Vercel), a "dan" evidencije je hrvatski dan.
 * Zato se datum NIKAD ne računa iz `new Date().toISOString()`, nego kroz
 * Intl s timeZone "Europe/Zagreb" — inače bi prijava u 23:30 ljeti pala u
 * sutrašnji dan (isti razlog zbog kojeg postoji lib/datum.ts za prikaz).
 */

const ZONA = "Europe/Zagreb";

/** Današnji dan u hrvatskoj zoni, "YYYY-MM-DD". */
export function danasHr(sad: Date = new Date()): string {
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(sad);
  return d; // en-CA daje točno "YYYY-MM-DD"
}

/** "HH:MM" u hrvatskoj zoni (za ploču prisutnosti i tablice). */
export function satMinutaHr(value?: Date | string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * "YYYY-MM-DD" → Date za Prisma `@db.Date`.
 * Postgres DATE nema zonu; Prisma očekuje Date pa uzima UTC dio — zato ponoć u UTC-u.
 */
export function danUBazu(dan: string): Date {
  return new Date(`${dan}T00:00:00.000Z`);
}

/** Date iz baze (@db.Date) → "YYYY-MM-DD" (bez pomaka zone). */
export function danIzBaze(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** Trajanje zapisa u minutama; otvoren zapis (bez odlaska) = 0. */
export function minutaZapisa(dolazakU: Date | string, odlazakU?: Date | string | null): number {
  if (!odlazakU) return 0;
  const a = new Date(dolazakU).getTime();
  const b = new Date(odlazakU).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60000);
}

/** 465 → "7:45" (za tablicu). */
export function satiHHMM(minuta: number): string {
  if (!minuta) return "0:00";
  const h = Math.floor(minuta / 60);
  const m = minuta % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** 465 → "7,75" (decimalni sati — knjigovodstvo tako računa). */
export function satiDecimalno(minuta: number): string {
  return (minuta / 60).toFixed(2).replace(".", ",");
}

/** Tekući mjesec u hrvatskoj zoni, "YYYY-MM". */
export function mjesecHr(sad: Date = new Date()): string {
  return danasHr(sad).slice(0, 7);
}

/** "YYYY-MM" → granice za upit nad @db.Date poljem (od uključivo, do isključivo). */
export function rasponMjeseca(mjesec: string): { od: Date; do: Date; dani: string[] } {
  const [g, m] = mjesec.split("-").map(Number);
  const od = new Date(Date.UTC(g, m - 1, 1));
  const doD = new Date(Date.UTC(m === 12 ? g + 1 : g, m === 12 ? 0 : m, 1));
  const dani: string[] = [];
  for (let d = new Date(od); d < doD; d.setUTCDate(d.getUTCDate() + 1)) {
    dani.push(d.toISOString().slice(0, 10));
  }
  return { od, do: doD, dani };
}

/** "2026-07-28" → "28.07.2026." (prikaz u tablici). */
export function formatDan(dan: string): string {
  const [g, m, d] = dan.split("-");
  return `${d}.${m}.${g}.`;
}

/** Subota/nedjelja — u tablici se sivi zajedno s praznicima. */
export function jeVikend(dan: string): boolean {
  const dow = new Date(`${dan}T00:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Jedno polje CSV-a: navodnici i točka-zarez kao separator (Excel HR). */
export function csvPolje(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}
