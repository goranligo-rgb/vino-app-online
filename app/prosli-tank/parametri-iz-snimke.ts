import type { ParametarPrikaz } from "@/app/tankovi/[id]/parametri-po-polju";
import { POLJA_MONITORA } from "@/lib/monitor-vina";
import type { SnimkaSRetcima } from "@/lib/snimka-vina";

/**
 * PARAMETRI IZ SNIMKE — svih osam polja monitora, redom kao na stranici
 * tanka, s podrijetlom kakvo je monitor pokazivao u trenutku izlaska.
 *
 * Zajednicko za obje razine arhive na /prosli-tank: kucicu sa snimkom
 * (razina 2) i vino koje je izaslo kroz izlaz (razina 1). Snimka ne nosi
 * racun blenda ni posude iz knjige, pa ih ploca ne tvrdi (`blend`/`izKnjige`
 * bez detalja). Graf (`niz`) daje pozivatelj — iz knjige, jer je snimka jedan
 * trenutak, a ne niz.
 */
export function parametriIzSnimke(
  snimka: Pick<SnimkaSRetcima, "polja">,
  nizZaGraf: (kljuc: string) => ParametarPrikaz["niz"]
): ParametarPrikaz[] {
  const polja = new Map(snimka.polja.map((p) => [p.kljuc, p]));
  return POLJA_MONITORA.map((o): ParametarPrikaz => {
    const p = polja.get(o.kljuc);
    const podrijetlo = (p?.podrijetlo.toLowerCase() ?? "nema") as ParametarPrikaz["podrijetlo"];
    const datum = p?.izmjerenoAt ? p.izmjerenoAt.toISOString() : null;
    return {
      kljuc: o.kljuc,
      naziv: o.naziv,
      jedinica: o.jedinica,
      vrijednost: p?.vrijednost ?? null,
      podrijetlo,
      datum: podrijetlo === "mjereno" || podrijetlo === "preneseno" ? datum : null,
      // NEMA u snimci ne znaci "nije mjereno": monitor je vrijednost iz knjige
      // mogao i sakriti jer je vino fermentiralo. Razlog snimka ne nosi, pa se
      // kaze samo ono sto se zna.
      neprikazano:
        p?.vrijednost == null ? "monitor je u trenutku izlaska nije pokazivao" : null,
      // `postotak` ploca ne prikazuje (tip ga trazi); posude snimka ne nosi.
      izKnjige: podrijetlo === "knjiga" ? { mjerenoAt: datum, posude: [], postotak: 100 } : null,
      niz: nizZaGraf(o.kljuc),
      blend: null,
    };
  });
}
