/**
 * Potvrda spremanja za putnicki modul.
 *
 * Sva spremanja u /putnik su server akcije. Nakon uspjesnog spremanja akcija
 * preusmjeri na `...?spremljeno=<token>`, a klijentski <SpremljenoToast /> u
 * app/putnik/layout.tsx to procita i pokaze zelenu poruku "Spremljeno ✓".
 * Token je vrijeme spremanja pa je URL svaki put drugaciji — poruka se ponovno
 * pokaze i kad putnik dva puta zaredom spremi istu stvar.
 */

export function sPotvrdom(url: string) {
  const [putanja, upit] = url.split("?");
  const params = new URLSearchParams(upit || "");
  params.set("spremljeno", String(Date.now()));
  return `${putanja}?${params.toString()}`;
}

/**
 * Povratna putanja iz forme (hidden `povratak`) — koristi se na stranicama koje
 * imaju filtere u URL-u (ruta ?datum, priprema ?putnik&datum, promo ?kupac) da
 * se nakon spremanja putnik vrati na ISTI pogled, a ne na zadani.
 * Prihvacaju se samo interne /putnik/ putanje (bez otvorenog redirecta).
 */
export function sigurniPovratak(raw: FormDataEntryValue | null, zadano: string) {
  const s = String(raw || "").trim();
  if (!s.startsWith("/putnik/") || s.startsWith("//")) return zadano;
  return s;
}
