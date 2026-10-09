import type { Prisma } from "@prisma/client";
import { granicaVina } from "@/lib/granica-vina";
import { imeVina, type ImeVina } from "@/lib/ime-vina";
import { ocisti } from "@/lib/ime-vina-cisto";
import type { Sastavnica } from "@/lib/identitet-vina";
import { imeIzSnimke, snimkaKucice } from "@/lib/snimka-vina";

/**
 * IME KUCICE — kako se zvalo vino kucice u trenutku kad je uslo u roditelja.
 * ======================================================================
 *
 * Odluka vlasnika 09.10.2026.: kucica nosi IME VINA i SIFRU, ne broj posude.
 * Sest kucica "Cuvee 2026" bez sifre izgleda kao sest puta isto vino; broj
 * tanka stoji sitno u sivom retku, jer posuda nije ono sto se prati.
 *
 * Isti izvor kao naslov /prosli-tank, da kucica i stranica koju otvara ne
 * kazu dvije razlicite stvari:
 *   - kucica sa snimkom (vino je izaslo kroz cin koji je snimljen) — ime i
 *     sifra iz snimke;
 *   - inace `ImeVina` izvorne posude, procitan milisekundu PRIJE cina
 *     (granica je ukljuciva, pa je na sam trenutak ispraznjen izvor vec
 *     prazan), sa `zadnjeVino` da se dobije vino koje je otislo.
 *
 * CIJENA: snimka 1 upit, granica 2, ime 1 — po kucici. Zato se trazi SAMO za
 * kucice prve razine (vlasnik, 09.10.2026.); dublje razine nose naziv iz
 * sastava (`nazivStavke`, bez upita). Pozivatelj vrti kroz `uValovima`.
 *
 * BEZIMENO NE POSTAJE "bez imena" na kucici: naziv je tada `null`, a
 * pozivatelj pada na sortu i partiju iz sastava. Isto za sifru — staro vino
 * je nema (sifre postoje od 01.10.2026.), pa "bez sifre" na svakoj staroj
 * kucici ne bi govorio nista.
 */
export type ImeKucice = {
  naziv: string | null;
  sifra: string | null;
};

type Klijent = Pick<
  Prisma.TransactionClient,
  "snimkaVina" | "berbaKretanje" | "punjenjeTanka" | "imeVina"
>;

export async function imeKucice(
  db: Klijent,
  s: Sastavnica,
  roditeljTankId: string
): Promise<ImeKucice | null> {
  if (s.vino.vrsta === "partija") return null;
  const izTankId = s.vino.tankId;

  const snimka = await snimkaKucice(db, { kljucCina: s.kljucCina, izTankId, roditeljTankId });
  if (snimka) return izImena(imeIzSnimke(snimka));

  const trenutak = new Date(s.usloAt.getTime() - 1);
  const granica = await granicaVina(db, izTankId, { doTrenutka: trenutak, zadnjeVino: true });
  return izImena(await imeVina(db, izTankId, granica, { doTrenutka: trenutak }));
}

export function izImena(ime: ImeVina): ImeKucice {
  return {
    naziv: ime.razlog === "PRAZAN" ? null : ocisti(ime.naziv),
    sifra: ime.razlog === "PRAZAN" ? null : ocisti(ime.sifra),
  };
}
