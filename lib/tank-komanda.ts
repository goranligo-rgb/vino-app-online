// Dijeljena pravila za komande upravljanja temperaturom.
// Framework-agnostic: koristi ga i server action i klijentska komponenta.

export type KomandaTip =
  | "ZADANA_TEMP"
  | "ALARM_MINUS"
  | "ALARM_PLUS"
  | "HY"
  | "HLADJENJE_ON"
  | "HLADJENJE_OFF";

export type VrijednosnaKomanda = "ZADANA_TEMP" | "ALARM_MINUS" | "ALARM_PLUS" | "HY";

export const KORAK = 0.5; // °C po kliku +/- (zadano)

// Hy (diferencijal hladjenja) se na Dixellu podesava u desetinkama, pa ima svoj korak.
export const KORAK_ZA: Record<VrijednosnaKomanda, number> = {
  ZADANA_TEMP: 0.5,
  ALARM_MINUS: 0.5,
  ALARM_PLUS: 0.5,
  HY: 0.1,
};

// Dozvoljeni rasponi za vrijednosne komande.
export const LIMITI: Record<VrijednosnaKomanda, { min: number; max: number }> = {
  ZADANA_TEMP: { min: 4, max: 20 },
  ALARM_MINUS: { min: 0.5, max: 10 },
  ALARM_PLUS: { min: 0.5, max: 10 },
  HY: { min: 0.3, max: 3.0 },
};

// Role koje smiju upravljati (PREGLED je iskljucen - samo gleda).
export const ROLE_UPRAVLJANJE = ["ADMIN", "ENOLOG", "PODRUM"] as const;

export function smijeUpravljati(role: string | undefined | null): boolean {
  return !!role && (ROLE_UPRAVLJANJE as readonly string[]).includes(role);
}

export function jeVrijednosnaKomanda(tip: KomandaTip): tip is VrijednosnaKomanda {
  return (
    tip === "ZADANA_TEMP" ||
    tip === "ALARM_MINUS" ||
    tip === "ALARM_PLUS" ||
    tip === "HY"
  );
}

export function korakZa(tip: VrijednosnaKomanda): number {
  return KORAK_ZA[tip];
}

/**
 * Zaokruzi na zadani korak. Racuna se preko cijelih desetinki jer 0.1 nema
 * tocan binarni zapis (2.9 / 0.1 = 28.999...), pa bi dijeljenje promasilo korak.
 */
export function zaokruziNaKorak(v: number, korak: number = KORAK): number {
  const k = Math.round(korak * 10);
  return (Math.round((v * 10) / k) * k) / 10;
}

export function stegni(tip: VrijednosnaKomanda, v: number): number {
  const { min, max } = LIMITI[tip];
  return Math.min(max, Math.max(min, zaokruziNaKorak(v, KORAK_ZA[tip])));
}

// Vraca poruku greske ili null ako je ulaz valjan.
export function validiraj(tip: KomandaTip, vrijednost: number | null): string | null {
  if (tip === "HLADJENJE_ON" || tip === "HLADJENJE_OFF") {
    return vrijednost == null ? null : "ON/OFF komanda ne smije imati vrijednost.";
  }
  if (!jeVrijednosnaKomanda(tip)) return "Nepoznata komanda.";
  if (vrijednost == null || !Number.isFinite(vrijednost)) return "Nedostaje vrijednost.";

  const { min, max } = LIMITI[tip];
  const jedinica = JEDINICA_TIPA[tip];
  if (vrijednost < min || vrijednost > max) {
    return `Vrijednost mora biti između ${min} i ${max} ${jedinica}.`;
  }

  const korak = KORAK_ZA[tip];
  const udesetinkama = vrijednost * 10;
  const cijele = Math.round(udesetinkama);
  if (
    Math.abs(udesetinkama - cijele) > 1e-6 ||
    cijele % Math.round(korak * 10) !== 0
  ) {
    return `Vrijednost mora biti u koraku ${korak} ${jedinica}.`;
  }
  return null;
}

// Polje na Tank-u koje komanda azurira (null za ON/OFF - nema trajnog polja).
export function poljeTanka(
  tip: KomandaTip
): "zadanaTemp" | "alarmMinus" | "alarmPlus" | "hy" | null {
  if (tip === "ZADANA_TEMP") return "zadanaTemp";
  if (tip === "ALARM_MINUS") return "alarmMinus";
  if (tip === "ALARM_PLUS") return "alarmPlus";
  if (tip === "HY") return "hy";
  return null;
}

export const OPIS_TIPA: Record<KomandaTip, string> = {
  ZADANA_TEMP: "zadana temp.",
  ALARM_MINUS: "alarm −",
  ALARM_PLUS: "alarm +",
  HY: "diferencijal (Hy)",
  HLADJENJE_ON: "hlađenje ON",
  HLADJENJE_OFF: "hlađenje OFF",
};

// Jedinica uz vrijednost u prikazu. Hy je razlika temperatura, ne apsolutna
// vrijednost, pa ide u kelvinima (K) - brojcano isto, ali znaci "za koliko".
export const JEDINICA_TIPA: Record<KomandaTip, string> = {
  ZADANA_TEMP: "°C",
  ALARM_MINUS: "°C",
  ALARM_PLUS: "°C",
  HY: "K",
  HLADJENJE_ON: "",
  HLADJENJE_OFF: "",
};
