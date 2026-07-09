// Dijeljena pravila za komande upravljanja temperaturom (Faza A).
// Framework-agnostic: koristi ga i server action i klijentska komponenta.

export type KomandaTip =
  | "ZADANA_TEMP"
  | "ALARM_MINUS"
  | "ALARM_PLUS"
  | "HLADJENJE_ON"
  | "HLADJENJE_OFF";

export const KORAK = 0.5; // °C po kliku +/-

// Dozvoljeni rasponi za vrijednosne komande.
export const LIMITI: Record<"ZADANA_TEMP" | "ALARM_MINUS" | "ALARM_PLUS", { min: number; max: number }> = {
  ZADANA_TEMP: { min: 4, max: 20 },
  ALARM_MINUS: { min: 0.5, max: 10 },
  ALARM_PLUS: { min: 0.5, max: 10 },
};

// Role koje smiju upravljati (PREGLED je iskljucen - samo gleda).
export const ROLE_UPRAVLJANJE = ["ADMIN", "ENOLOG", "PODRUM"] as const;

export function smijeUpravljati(role: string | undefined | null): boolean {
  return !!role && (ROLE_UPRAVLJANJE as readonly string[]).includes(role);
}

export function jeVrijednosnaKomanda(tip: KomandaTip): tip is "ZADANA_TEMP" | "ALARM_MINUS" | "ALARM_PLUS" {
  return tip === "ZADANA_TEMP" || tip === "ALARM_MINUS" || tip === "ALARM_PLUS";
}

export function zaokruziNaKorak(v: number): number {
  return Math.round(v / KORAK) * KORAK;
}

export function stegni(tip: "ZADANA_TEMP" | "ALARM_MINUS" | "ALARM_PLUS", v: number): number {
  const { min, max } = LIMITI[tip];
  return Math.min(max, Math.max(min, zaokruziNaKorak(v)));
}

// Vraca poruku greske ili null ako je ulaz valjan.
export function validiraj(tip: KomandaTip, vrijednost: number | null): string | null {
  if (tip === "HLADJENJE_ON" || tip === "HLADJENJE_OFF") {
    return vrijednost == null ? null : "ON/OFF komanda ne smije imati vrijednost.";
  }
  if (!jeVrijednosnaKomanda(tip)) return "Nepoznata komanda.";
  if (vrijednost == null || !Number.isFinite(vrijednost)) return "Nedostaje vrijednost.";
  const { min, max } = LIMITI[tip];
  if (vrijednost < min || vrijednost > max) return `Vrijednost mora biti između ${min} i ${max} °C.`;
  if (Math.abs(vrijednost / KORAK - Math.round(vrijednost / KORAK)) > 1e-9) {
    return `Vrijednost mora biti u koraku ${KORAK} °C.`;
  }
  return null;
}

// Polje na Tank-u koje komanda azurira (null za ON/OFF - nema trajnog polja).
export function poljeTanka(tip: KomandaTip): "zadanaTemp" | "alarmMinus" | "alarmPlus" | null {
  if (tip === "ZADANA_TEMP") return "zadanaTemp";
  if (tip === "ALARM_MINUS") return "alarmMinus";
  if (tip === "ALARM_PLUS") return "alarmPlus";
  return null;
}

export const OPIS_TIPA: Record<KomandaTip, string> = {
  ZADANA_TEMP: "zadana temp.",
  ALARM_MINUS: "alarm −",
  ALARM_PLUS: "alarm +",
  HLADJENJE_ON: "hlađenje ON",
  HLADJENJE_OFF: "hlađenje OFF",
};
