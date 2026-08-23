/**
 * Brane na ponistavanju pretoka.
 *
 * Izdvojeno iz app/api/pretok/undo/route.ts da se moze testirati unutar
 * transakcije s rollbackom — ruta se ne da pozvati iz testa, a ovo je odluka
 * koja mora biti pokrivena.
 */

import { uLitre, uMl, type Tx } from "@/lib/filtracija";

/** Koliko unatrag od pretoka jos smatramo da je arhiva nastala u istoj transakciji. */
const PRAG_MS = 30_000;

export type PretokZaProvjeru = {
  id: string;
  createdAt: Date;
  izvori: Array<{ tankId: string; kolicina: number }>;
  ciljevi: Array<{ tankId: string }>;
};

/**
 * Vraca razlog zbog kojeg se pretok NE smije ponistiti, ili null ako smije.
 *
 * ZASTO POSTOJI. Ponistavanje vraca tankove po snapshotima i brise pretok, ali
 * `ArhivaVina` ne dira — nikad je nije ni diralo. Ako je pretok ispraznio
 * izvorni tank, taj je tank pri arhiviranju ostao bez mjerenja, zadataka,
 * dokumenata i punjenja; sve to sada zivi samo u arhivi. Ponistavanje bi mu
 * vratilo litre i identitet, a povijest bi ostala drugdje — nastao bi tank koji
 * tvrdi da ima vino, a ne zna odakle je doslo.
 *
 * Do sada nije bilo ni brane ni ispravnog vracanja, sto je najgora kombinacija:
 * ponistavanje je prolazilo i tiho ostavljalo takav tank. Ovo je brana; ispravno
 * vracanje (arhiva se vraca na tank) je zaseban zahvat i uvjet je za to da
 * arhiviranje uopce pocne BRISATI originale.
 *
 * KAKO SE PREPOZNAJE. Nema veze iz `Pretok` prema `ArhivaVina`, pa se gleda
 * vrijeme: arhiva izvornog tanka nastala u trenutku pretoka ili poslije njega.
 * To je pouzdano jer se do ove tocke dolazi tek nakon sto su prosle provjere
 * kasnijih pretoka, zadataka, radnji i mjerenja — dakle nista se na tim
 * tankovima u meduvremenu nije dogodilo, pa arhiva moze biti samo od ovog
 * pretoka. Prag od 30 s pokriva razliku satova baze i aplikacije.
 */
export async function razlogZabranePonistavanja(
  tx: Tx,
  pretok: PretokZaProvjeru
): Promise<string | null> {
  const izvorniIds = pretok.izvori.map((i) => i.tankId);

  if (izvorniIds.length === 0) return null;

  const granica = new Date(pretok.createdAt.getTime() - PRAG_MS);

  const arhiva = await tx.arhivaVina.findFirst({
    where: { tankId: { in: izvorniIds }, arhiviranoAt: { gte: granica } },
    orderBy: { arhiviranoAt: "asc" },
    select: { id: true, tankId: true, brojTanka: true, nazivVina: true, kolicinaVina: true },
  });

  if (!arhiva) return null;

  const izvor = pretok.izvori.find((i) => i.tankId === arhiva.tankId);
  const litara = izvor ? uLitre(uMl(izvor.kolicina)) : arhiva.kolicinaVina;

  const ciljBrojevi = await tx.tank.findMany({
    where: { id: { in: pretok.ciljevi.map((c) => c.tankId) } },
    select: { broj: true },
    orderBy: { broj: "asc" },
  });

  const kamo =
    ciljBrojevi.length === 1
      ? `tanka ${ciljBrojevi[0].broj}`
      : ciljBrojevi.length > 1
      ? `tankova ${ciljBrojevi.map((t) => t.broj).join(", ")}`
      : "ciljnog tanka";

  return (
    `Ovaj se pretok ne može poništiti jer je izvorni tank ${arhiva.brojTanka ?? "?"} ` +
    `pri njemu arhiviran („${arhiva.nazivVina ?? "bez naziva"}”). ` +
    `Poništavanje bi vratilo litre, ali mjerenja, zadaci i punjenja tog vina ostali bi u arhivi — ` +
    `tank bi tvrdio da ima vino, a povijest bi mu bila drugdje. ` +
    `Ako vino treba vratiti, napravi novi pretok iz ${kamo} natrag u tank ${arhiva.brojTanka ?? "?"} ` +
    `(${litara} L), pa arhivu otvori s monitora tog tanka.`
  );
}
