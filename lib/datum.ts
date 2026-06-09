// Prikaz datuma/vremena u hrvatskoj zoni (Europe/Zagreb), neovisno o tome što
// se stranice renderiraju na Vercel serveru u UTC-u. Zato EKSPLICITNO zadajemo
// timeZone — inače bi createdAt bio prikazan u UTC-u.

const ZONA = "Europe/Zagreb";

// "dd.mm.yyyy HH:MM" — koristi se za createdAt ("Upisano u"), kontrolni podatak
// koji putnik ne može lažirati (pravo vrijeme spremanja u bazu).
export function formatHrDateTime(value?: Date | string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  const dijelovi = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (tip: string) =>
    dijelovi.find((x) => x.type === tip)?.value ?? "";

  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

// "dd.mm.yyyy" — za datume koje putnik sam upisuje (npr. datum posjeta).
export function formatHrDate(value?: Date | string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  const dijelovi = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);

  const get = (tip: string) =>
    dijelovi.find((x) => x.type === tip)?.value ?? "";

  return `${get("day")}.${get("month")}.${get("year")}`;
}
