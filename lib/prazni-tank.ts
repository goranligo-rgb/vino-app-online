import type { Prisma } from "@prisma/client";
import { ocistiVinoRadnje } from "./vino-radnja";

/**
 * PRAZNJENJE TANKA BEZ ARHIVIRANJA.
 * ======================================================================
 *
 * Faza D. Do sada je tank koji se pretokom ispraznio bio ARHIVIRAN: sve
 * njegovo prepisalo bi se u `ArhivaVina*`, a originali se obrisali. To je
 * dolazilo iz krivog pitanja — arhiviranje je trebalo znaciti „ovo je vino
 * gotovo", a okidalo se na „posuda je prazna".
 *
 * Vlasnikovo pravilo: vino se arhivira SAMO kad se napuni u boce ili proda u
 * rinfuzi. Pretok nije kraj vina — vino putuje dalje, sa svime svojim.
 *
 * STO SE OVDJE BRISE, A STO NE
 * ----------------------------
 * BRISE SE ono sto opisuje vino U TOJ POSUDI i bilo bi lazno za sljedece:
 *   - `TankSortaUdio` — sastav vina kojeg vise nema;
 *   - `BlendIzvor` (gdje je ovaj tank CILJ) — porijeklo tog istog vina;
 *   - `VinoRadnja` — udjeli kvasaca i dodataka u vinu koje je otislo; da
 *     ostanu, zalijepili bi se na sljedece vino koje u ovaj tank udje;
 *   - `Tank.sorta`, `godiste` i kolicina — identitet posude.
 *
 * `Tank.nazivVina` se od faze 5 NE brise: stupac se vise ne pise ni ne cita.
 * Ime prazne posude nestaje samo od sebe — knjiga pomakne granicu vina i zapis
 * o imenu ispadne iz prozora (lib/ime-vina.ts).
 *
 * NE BRISE SE NISTA OD POVIJESTI: mjerenja, zadaci, dokumenti, punjenja,
 * radnje i izlazi OSTAJU na tanku. Prije ih je arhiviranje prepisivalo pa
 * brisalo; sada ostaju gdje jesu, a ekran ih rezuje granicom vina
 * (`lib/granica-vina.ts`) — crtom koja kaze otkad je u tanku ovo sto je sada
 * u njemu. To je jedina razlika koja se vidi, i ide u korist: dosad je
 * ponistavanje pretoka bilo ZABRANJENO upravo zato sto su originali nestali
 * (vidi lib/pretok-ponistavanje.ts).
 *
 * Sto je s pokazivacima ciljeva koji su pokazivali na ovaj tank: ostaju na
 * njemu i to je sada tocno. `parametriBlenda` ih cita NA DATUM kad je vino
 * doslo (faza D2a), pa citaju vino kakvo je bilo kad je otislo — a ne ono sto
 * u toj posudi bude sljedece. Preusmjeravanje na arhivu vise nije potrebno
 * jer arhive vise ni nema.
 */

type Tx = Prisma.TransactionClient;

export type IspraznjenTank = {
  tankId: string;
  /** Koliko je litara bilo u tanku prije nego je ispraznjen. */
  prijeL: number;
  obrisano: {
    sastav: number;
    blend: number;
  };
};

/**
 * Oslobodi posudu za sljedece vino. NE arhivira i NE brise povijest.
 *
 * Zove se iz iste transakcije kao i sam pretok — ili prode sve ili nista.
 */
export async function isprazniTank(
  tx: Tx,
  tankId: string,
  prijeL: number
): Promise<IspraznjenTank> {
  const sastav = await tx.tankSortaUdio.deleteMany({ where: { tankId } });
  const blend = await tx.blendIzvor.deleteMany({ where: { ciljTankId: tankId } });

  // Radnje koje su putovale s vinom odlaze s njim. Ciljevi su ih vec preuzeli
  // — motor snima retke izvora PRIJE nego dodje ovamo (korak 6b) — pa ovo ne
  // moze odnijeti ono sto tek treba prijeci. Povijest ostaje u `Radnja`.
  await ocistiVinoRadnje(tx, tankId);

  await tx.tank.update({
    where: { id: tankId },
    data: {
      kolicinaVinaUTanku: 0,
      sorta: null,
      godiste: null,
    },
  });

  return {
    tankId,
    prijeL,
    obrisano: { sastav: sastav.count, blend: blend.count },
  };
}
