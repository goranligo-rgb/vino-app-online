// Dijeljeni helperi za nadzor temperature tankova (Faza A - samo prikaz).
// Framework-agnostic: koristi se i u server komponentama i na klijentu.

export const OFFLINE_PRAG_MIN = 15; // ocitanje starije od ovoga = "bez veze"

export type TankTempStatus = "OK" | "ALARM" | "OFFLINE" | "NEMA_OCITANJA";

// Vrati true ako je zadnje ocitanje starije od praga (ili ga nema).
export function jeZastarjelo(mjerenoU: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!mjerenoU) return true;
  const t = new Date(mjerenoU).getTime();
  if (Number.isNaN(t)) return true;
  return (now.getTime() - t) / 60000 > OFFLINE_PRAG_MIN;
}

// Status tanka iz zadnjeg ocitanja i aktivnog alarma.
// Redoslijed: nema ocitanja -> zastarjelo (offline) -> aktivan alarm -> OK.
export function izracunajStatus(params: {
  mjerenoU: string | Date | null | undefined;
  imaAktivanAlarm: boolean;
  now?: Date;
}): TankTempStatus {
  const now = params.now ?? new Date();
  if (!params.mjerenoU) return "NEMA_OCITANJA";
  if (jeZastarjelo(params.mjerenoU, now)) return "OFFLINE";
  if (params.imaAktivanAlarm) return "ALARM";
  return "OK";
}

export type StatusStil = {
  label: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
};

// Boje pločica/badgeva za svijetlu temu. Vrijednosti preuzete iz /monitor
// (getStatus + legenda) da modul izgleda kao dio iste aplikacije:
//   OK/zeleno = #eef7f0 / #8db79a, sivo/prazan = #f5f5f5 / #cfcfcf.
const STILOVI: Record<TankTempStatus, StatusStil> = {
  OK: { label: "OK", bg: "#eef7f0", border: "#8db79a", text: "#2f6b43", dot: "#6fa980" },
  ALARM: { label: "ALARM", bg: "#fdecec", border: "#e0776f", text: "#a11d1d", dot: "#d9534f" },
  OFFLINE: { label: "BEZ VEZE", bg: "#f5f5f5", border: "#cfcfcf", text: "#555555", dot: "#b0b0b0" },
  NEMA_OCITANJA: { label: "NEMA OČITANJA", bg: "#f5f5f5", border: "#cfcfcf", text: "#777777", dot: "#c4c4c4" },
};

export function stilZaStatus(status: TankTempStatus): StatusStil {
  return STILOVI[status];
}

// Sigurno u broj (Prisma Decimal, string ili number). null ako nema vrijednosti.
export function uBroj(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

// Prikaz temperature s jednom decimalom (hr-HR), npr. "12,4".
export function formatTemp(x: unknown): string {
  const n = uBroj(x);
  if (n == null) return "—";
  return n.toLocaleString("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// "prije 3 min", "prije 2 h", "prije 6 h 10 min" ... za vrijeme zadnjeg očitanja.
export function prijeKoliko(mjerenoU: string | Date | null | undefined, now: Date = new Date()): string {
  if (!mjerenoU) return "—";
  const t = new Date(mjerenoU).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.max(0, Math.round((now.getTime() - t) / 60000));
  if (min < 1) return "upravo sad";
  if (min < 60) return `prije ${min} min`;
  const h = Math.floor(min / 60);
  const ost = min % 60;
  if (h < 24) return ost ? `prije ${h} h ${ost} min` : `prije ${h} h`;
  const d = Math.floor(h / 24);
  return `prije ${d} d`;
}
