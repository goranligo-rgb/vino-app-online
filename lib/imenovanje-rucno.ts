import type { Prisma } from "@prisma/client";
import { granicaVina } from "@/lib/granica-vina";
import {
  imeVina,
  ocisti,
  vrijediUpisati,
  zabiljeziImenovanje,
  type ImeVina,
} from "@/lib/ime-vina";
import { razlikaPolja, zabiljeziIzmjene } from "@/lib/dnevnik-izmjena";
import { zakljucajTankove } from "@/lib/filtracija";

/**
 * RUCNO IMENOVANJE VINA — jedini put kojim covjek daje vinu ime (faza 5).
 * ======================================================================
 *
 * Zove ga `POST /api/tank/imenuj` iz obrasca na stranici tanka. Upis ide kroz
 * CIN IMENOVANJA (`ImeVina`, izvor RUCNO), s razlogom i s time tko je imenovao
 * — ne kao izmjena svojstva posude.
 *
 * STO JE „PRIJE": izvedeno ime, ne stupac. Usporedba „je li se sto
 * promijenilo" gleda ono sto covjek vidi na ekranu (zadnji cin u prozoru
 * danasnjeg vina), jer je to ime koje obrazac nudi na izmjenu.
 *
 * `Tank.nazivVina` SE NE PISE (faza 5, korak 2). Motor pretoka i filtracija
 * ime citaju izvedeno (`ucitajTank`), pa preimenovanje putuje s vinom samo od
 * sebe. `Tank.sorta` se i dalje zrcali deklariranom sortom — ne gasi se u
 * fazi 5 i motor je treba za blend iste sorte (memorija ime-vina-faza5-otvoreno).
 *
 * SVE U JEDNOJ TRANSAKCIJI, s tankom zakljucanim kao kod pretoka: izmedju
 * citanja imena i upisa ne smije uletjeti pretok koji mijenja vino u posudi.
 */

type Tx = Prisma.TransactionClient;

/** Greska koju treba pokazati covjeku — ruta je vraca kao 400. */
export class ImenovanjeGreska extends Error {
  constructor(poruka: string) {
    super(poruka);
    this.name = "ImenovanjeGreska";
  }
}

export type UlazImenovanja = {
  tankId: string;
  naziv: string | null | undefined;
  deklariranaSorta: string | null | undefined;
  razlog: string | null | undefined;
  korisnikId: string;
  /** Trenutak cina. Zadaje ga samo test; ruta uzima sada. */
  sada?: Date;
};

export type RezultatImenovanja = {
  prije: ImeVina;
  poslije: ImeVina;
};

export async function imenujVinoRucno(
  tx: Tx,
  ulaz: UlazImenovanja
): Promise<RezultatImenovanja> {
  const naziv = ocisti(ulaz.naziv);
  const sorta = ocisti(ulaz.deklariranaSorta);
  const razlog = ocisti(ulaz.razlog);

  // Razlog je obavezan ovdje, a ne u bazi: strojni zapisi ga nemaju jer im je
  // razlog sam cin (pretok, punjenje). Covjekova izmjena bez razloga je upravo
  // ono zbog cega se danas ne zna tko je T26 nazvao Chardonnayem.
  if (!razlog) {
    throw new ImenovanjeGreska("Upiši razlog promjene imena.");
  }

  // Bezimeno vino nema zapis, a ne zapis s praznim imenom (vidi `vrijediUpisati`).
  if (!vrijediUpisati(naziv, sorta)) {
    throw new ImenovanjeGreska("Upiši naziv vina ili deklariranu sortu.");
  }

  // Postojanje se provjerava PRIJE brave samo radi poruke — `zakljucajTankove`
  // za nepostojeci tank baca gresku sročenu za filtraciju. Stanje stupaca se
  // cita tek POD bravom.
  const postoji = await tx.tank.count({ where: { id: ulaz.tankId } });
  if (postoji === 0) {
    throw new ImenovanjeGreska("Tank ne postoji.");
  }

  await zakljucajTankove(tx, [ulaz.tankId]);

  const tank = await tx.tank.findUniqueOrThrow({
    where: { id: ulaz.tankId },
    select: { id: true, broj: true, sorta: true },
  });

  const granica = await granicaVina(tx, tank.id);

  // Prazna posuda nema vino. Zapis bi ionako ispao iz prozora cim vino udje,
  // a covjek bi mislio da je nesto imenovao.
  if (!granica.odAt) {
    throw new ImenovanjeGreska(
      `Tank ${tank.broj} je prazan — nema vina koje bi se imenovalo.`
    );
  }

  const prije = await imeVina(tx, tank.id, granica);
  const sada = ulaz.sada ?? new Date();

  const upisano = await zabiljeziImenovanje(tx, {
    tankId: tank.id,
    odAt: sada,
    naziv,
    deklariranaSorta: sorta,
    izvor: "RUCNO",
    prijeNaziv: prije.naziv,
    prijeSorta: prije.deklariranaSorta,
    korisnikId: ulaz.korisnikId,
    razlog,
  });

  if (!upisano) {
    throw new ImenovanjeGreska(
      "Naziv i deklarirana sorta su isti kao sada — nema se što upisati."
    );
  }

  // ZRCALO SAMO NA `Tank.sorta` — vidi biljesku gore.
  const poslijeTank = await tx.tank.update({
    where: { id: tank.id },
    data: { sorta },
    select: { sorta: true },
  });

  // Dnevnik izmjena tanka biljezi STUPCE, kao i `PUT /api/tank`; tko je vino
  // imenovao, kad i zasto stoji na samom zapisu `ImeVina`.
  await zabiljeziIzmjene(tx, {
    entityType: "Tank",
    entityId: tank.id,
    opisEntiteta: `Tank ${tank.broj}`,
    userId: ulaz.korisnikId,
    izmjene: razlikaPolja(tank, poslijeTank, ["sorta"]),
  });

  const poslije = await imeVina(tx, tank.id, granica);

  return { prije, poslije };
}
