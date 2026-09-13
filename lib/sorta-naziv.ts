/**
 * JE LI TO IME SORTE ILI OZNAKA DA VINO NIJE SORTNO.
 * ======================================================================
 *
 * U `nazivSorte` (knjiga, berba, udjeli) ne stoje samo sorte. Ondje zive i
 * oznake koje kazu da se vino po sastavu NE moze imenovati:
 *
 *   "Mješavina", "Cuvée"        — vise sorti, nijedna nije nositelj
 *   "Nepoznato podrijetlo"      — zateceno vino iz rekonstrukcije; knjiga zna
 *                                 kolicinu, ali ne i sto je unutra
 *
 * Te oznake NISU sorte i ne smiju proci kao takve. Vlasnikovo pravilo
 * (12.09.2026): vino kojemu je najveci udio "Nepoznato podrijetlo" nije ni
 * cuvée ni sortno — ostaje bez tvrdnje, a ime mu daje covjek kroz obrazac
 * imenovanja.
 *
 * Zato prag udjela nikad ne stoji sam: uz "vise od 80 %" ide i "i to je PRAVA
 * SORTA". Bez toga bi kartica tanka 8 zamijenila koristan popis sastavnica
 * blokom berbe od sest crtica (izmjereno 12.09.2026: T8, T29, T43).
 *
 * POPIS JE ZATVOREN i drzi se kratkim namjerno. Sve sto nije na njemu smatra
 * se sortom — bolje pustiti nepoznato ime kao sortu nego tiho progutati pravu
 * sortu koja se nekome nije svidjela.
 */

/** Bez dijakritike, malim slovima, bez viska razmaka. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Oznake koje nisu sorta. Pisu se BEZ dijakritike jer se usporeduju
 * normalizirano — "Mješavina", "Mjesavina" i "MJEŠAVINA" su isto.
 */
const NISU_SORTE = new Set([
  "mjesavina",
  "cuvee",
  "cuvee bijeli",
  "cuvee crni",
  "nepoznato podrijetlo",
  "nepoznato",
  "bez podrijetla",
]);

/**
 * Je li `naziv` ime prave sorte.
 *
 * Prazno i `null` nisu sorta: nema se sto tvrditi.
 */
export function jePravaSorta(naziv: string | null | undefined): boolean {
  if (!naziv) return false;
  const n = norm(naziv);
  if (n.length === 0) return false;
  return !NISU_SORTE.has(n);
}
