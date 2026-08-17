// Samokontrola hladjenja: usporedi kolicinu vina u tanku sa stanjem hladjenja i
// javi nelogicnost. Cisto aplikacijski - oboje je vec u bazi, gateway ne sudjeluje.
//
// Ovo NIJE alarm nego podsjetnik: nista nije u kvaru, netko je samo zaboravio
// ukljuciti ili iskljuciti hladjenje. Zato je u prikazu zuto/narancasto, a ne
// crveno (alarm) ni sivo (istekla komanda).

/**
 * Ispod ovoliko litara tank se racuna praznim. Nije 0 jer nakon pretakanja u
 * bazi zna ostati koja desetinka litre (zaokruzivanja, ostatak na dnu), a zbog
 * 0,4 L nema smisla javljati "pun tank bez hladjenja".
 */
export const PRAG_PUN_L = 1;

export type SamokontrolaVrsta = "PUN_BEZ_HLADJENJA" | "PRAZAN_HLADI";

export type SamokontrolaNalaz = {
  vrsta: SamokontrolaVrsta;
  poruka: string;
} | null;

export type SamokontrolaUlaz = {
  /** Tank.kolicinaVinaUTanku */
  litre: number | null | undefined;
  /** Hladjenje je soft-OFF (zadana = SOFT_OFF_TEMP) - racunato iz stvarnog stanja kontrolera. */
  hladjenjeIskljuceno: boolean;
  /** Radi li hladjenje bas sad (zadnje ocitanje). Utjece samo na tekst poruke. */
  hladiSad?: boolean | null;
  /** Tank.samokontrolaAktivna - false znaci "ne provjeravaj ovaj tank". */
  samokontrolaAktivna: boolean;
  /**
   * Znamo li uopce zadanu temperaturu (s kontrolera ili iz baze)? Kad ne znamo,
   * ne znamo ni je li hladjenje ukljuceno, pa se ne prosuduje - tank koji jos
   * nije podesen ne smije svaki dan javljati "prazan tank hladi".
   */
  zadanaPoznata?: boolean;
};

function formatLitre(l: number): string {
  return Math.round(l).toLocaleString("hr-HR");
}

/**
 * Vraca nalaz ili null ako je sve u redu (ili je tank izuzet).
 *
 * Dva slucaja:
 *   pun tank + iskljuceno hladjenje  -> vino se grije, a nitko ga ne hladi
 *   prazan tank + ukljuceno hladjenje -> hladi se prazna posuda
 *
 * Za prazan tank se gleda je li hladjenje UKLJUCENO (nije soft-OFF), a ne vrti
 * li kompresor bas u ovoj sekundi: kompresor se pali i gasi po diferencijalu, pa
 * bi upozorenje inace treptalo iz ciklusa u ciklus. Tekst poruke svejedno kaze
 * hladi li bas sad.
 */
export function provjeriSamokontrolu(ulaz: SamokontrolaUlaz): SamokontrolaNalaz {
  if (!ulaz.samokontrolaAktivna) return null;
  if (ulaz.zadanaPoznata === false) return null;

  const litre = typeof ulaz.litre === "number" && Number.isFinite(ulaz.litre) ? ulaz.litre : 0;
  const pun = litre >= PRAG_PUN_L;

  if (pun && ulaz.hladjenjeIskljuceno) {
    return {
      vrsta: "PUN_BEZ_HLADJENJA",
      poruka: `Pun tank (${formatLitre(litre)} L) bez hlađenja`,
    };
  }

  if (!pun && !ulaz.hladjenjeIskljuceno) {
    return {
      vrsta: "PRAZAN_HLADI",
      poruka: ulaz.hladiSad
        ? "Prazan tank hladi — nepotrebna potrošnja"
        : "Prazan tank, hlađenje uključeno — nepotrebna potrošnja",
    };
  }

  return null;
}

// Boje "provjeri" stanja - namjerno razlicite od crvene (alarm) i sive (istekla).
export const SAMOKONTROLA_STIL = {
  bg: "#fff4e5",
  border: "#e8a33d",
  text: "#8a5200",
} as const;
