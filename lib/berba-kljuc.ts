/**
 * KLJUC GRUPE BERBE — koji zapisi `Berba` su ista berba.
 * ======================================================================
 *
 * Jedna berba zna uci u vise punjenja, a svako punjenje stvara SVOJ zapis
 * `Berba` (Sauvignon s parcele 13 od 27.08.2026. stoji u tri retka). Grupa je
 * (datum, sorta, parcela): po njoj bocna traka na /punjenje zbraja litre, a ne
 * zbraja kilograme ni sate branja — i po njoj ispravak berbe mijenja sve
 * zapise odjednom.
 *
 * DATUM je `datumBerbe`, a kad ga nema, datum ulaska u podrum (prvi ULAZ u
 * knjizi). Uzima se kalendarski dan u UTC-u, isto kao `iso.slice(0, 10)` nad
 * JSON-om — bez toga bi bocna traka i ruta za isti zapis mogle dati dva dana.
 *
 * Sorta i parcela usporedjuju se bez obzira na velika slova i rubne razmake.
 *
 * Modul je namjerno BEZ OVISNOSTI: uvozi ga i klijentska bocna traka i
 * obrazac za ispravak, i ruta. Jedno pravilo, tri citatelja.
 */

export type ZapisZaKljuc = {
  datumBerbe: Date | string | null;
  datumUlaska: Date | string | null;
  nazivSorte: string;
  parcela: string | null;
};

export const BEZ_DATUMA = "bez-datuma";

/** Kalendarski dan grupe: "YYYY-MM-DD" ili `BEZ_DATUMA`. */
export function danGrupe(z: Pick<ZapisZaKljuc, "datumBerbe" | "datumUlaska">): string {
  const d = z.datumBerbe ?? z.datumUlaska;
  if (d == null) return BEZ_DATUMA;
  const iso = typeof d === "string" ? d : d.toISOString();
  return iso.slice(0, 10);
}

function normaliziraj(v: string | null | undefined): string {
  return (v ?? "").trim().toLocaleLowerCase("hr");
}

export function kljucGrupeBerbe(z: ZapisZaKljuc): string {
  return [danGrupe(z), normaliziraj(z.nazivSorte), normaliziraj(z.parcela)].join("|");
}
