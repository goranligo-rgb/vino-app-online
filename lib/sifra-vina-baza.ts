import type { Prisma } from "@prisma/client";
import { imenaPodruma } from "@/lib/ime-vina";
import { sljedeciBroj } from "@/lib/sifra-vina";

/**
 * STANJE SIFRE — sto obrazac treba znati prije nego covjek upise sifru.
 * ======================================================================
 *
 * Dva pitanja, oba samo za UPOZORENJE (sifra nije jedinstvena, vidi
 * lib/sifra-vina.ts):
 *
 *   1. koji je sljedeci slobodan broj za prefiks+MMGG;
 *   2. tko jos nosi ovu sifru — SADA (zivo vino u posudi) i RANIJE
 *      (povijest imenovanja i snimke vina koje je otislo).
 *
 * Brojac gleda OBJE tablice: sifra komponente koja je otisla u cuvée zivi jos
 * samo u `SnimkaVina`, a njezin broj je potrosen jednako kao i zivi.
 *
 * Upiti idu redom, ne kroz Promise.all (lib/paralelno.ts, pooler drzi 15
 * veza za cijelu aplikaciju).
 */

type Db = Prisma.TransactionClient;

export type StanjeSifre = {
  korijen: string;
  sljedeciBroj: number;
  /** Tankovi u kojima je vino s ovom sifrom SADA (bez tanka koji se uredjuje). */
  sada: number[];
  /** Posude u kojima je sifra bila, a vise nije. */
  ranije: number[];
};

export async function stanjeSifre(
  db: Db,
  arg: {
    /** prefiks-MMGG, npr. "11-0926". */
    korijen: string;
    /** Puna sifra koju obrazac trenutno nudi — za provjeru duplikata. */
    sifra: string | null;
    /** Tank koji se imenuje: njegovo danasnje vino nije „duplikat". */
    tankId: string | null;
  }
): Promise<StanjeSifre> {
  const prefiksBroja = `${arg.korijen}-`;

  const imena = await db.imeVina.findMany({
    where: { obrisano: false, sifra: { startsWith: prefiksBroja } },
    select: { sifra: true, tankId: true },
  });

  const snimke = await db.snimkaVina.findMany({
    where: { sifra: { startsWith: prefiksBroja } },
    select: { sifra: true, tankId: true, brojTanka: true },
  });

  const broj = sljedeciBroj(arg.korijen, [
    ...imena.map((z) => z.sifra),
    ...snimke.map((z) => z.sifra),
  ]);

  if (!arg.sifra || !arg.sifra.startsWith(prefiksBroja)) {
    return { korijen: arg.korijen, sljedeciBroj: broj, sada: [], ranije: [] };
  }

  const nosiliIkad = new Set<string>();
  const brojIzSnimke = new Map<string, number>();
  for (const z of imena) if (z.sifra === arg.sifra) nosiliIkad.add(z.tankId);
  for (const z of snimke) {
    if (z.sifra !== arg.sifra) continue;
    nosiliIkad.add(z.tankId);
    if (z.brojTanka != null) brojIzSnimke.set(z.tankId, z.brojTanka);
  }

  if (nosiliIkad.size === 0) {
    return { korijen: arg.korijen, sljedeciBroj: broj, sada: [], ranije: [] };
  }

  // SADA se racuna kao i svugdje: granica + zadnji cin u prozoru. Zapis koji
  // je ispao iz prozora (vino otislo) pripada u RANIJE.
  const podrum = await imenaPodruma(db);
  const tankovi = await db.tank.findMany({
    where: { id: { in: [...nosiliIkad] } },
    select: { id: true, broj: true },
  });
  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));

  const sada: number[] = [];
  const ranije: number[] = [];

  for (const id of nosiliIkad) {
    // Posuda obrisana nakon cina: broj ostaje zapisan samo u snimci.
    const b = brojTanka.get(id) ?? brojIzSnimke.get(id);
    if (b == null) continue;

    if (podrum.get(id)?.sifra === arg.sifra) {
      if (id !== arg.tankId) sada.push(b);
    } else {
      ranije.push(b);
    }
  }

  sada.sort((a, b) => a - b);
  ranije.sort((a, b) => a - b);

  return { korijen: arg.korijen, sljedeciBroj: broj, sada, ranije };
}
