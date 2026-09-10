import type { Prisma } from "@prisma/client";

/**
 * DNEVNIK RUCNIH IZMJENA — tko, kad, iz cega u sto.
 * ======================================================================
 *
 * `Tank.sorta` i `Tank.nazivVina` mijenjale su se bez ikakvog traga. Kad se
 * tank 26 nasao sa `sorta` "Zeleni veltlinac" i `nazivVina` "Chardonnay", a po
 * `TankSortaUdio` i po knjizi je 100 % Chardonnay, nije se moglo utvrditi ni
 * tko je to postavio ni kada — `Tank` nema povijest, a `ActivityLog` je stajao
 * prazan (0 redaka) i nitko ga nije ni pisao ni citao.
 *
 * ZASTO `ActivityLog`, A NE NOVA TABLICA: tri od cetiri trazena podatka vec su
 * prvorazredni stupci — `userId` (pravi FK na User), `datum`, i par
 * `entityType`/`entityId`. Za cetvrti ("iz cega u sto") postoji `payload jsonb`,
 * koji Postgres pretrazuje (`payload->>'polje'`). Preimenovanje tanka je
 * nekoliko puta po sezoni; namjenska tablica bi za desetak redaka godisnje
 * trazila migraciju na produkcijskoj bazi.
 *
 * OBLIK `payload` STOJI SAMO OVDJE. To je cijela svrha ovog modula: `payload`
 * je netipiziran `jsonb`, pa bi se bez jednog mjesta razisao vec kod drugog
 * pozivatelja. Tko treba zabiljeziti izmjenu, zove `zabiljeziIzmjene` — ne
 * slaze `activityLog.create` sam.
 *
 * `opis` je CITLJIV BEZ PARSIRANJA JSON-a: 'Tank 26: sorta "Zeleni veltlinac"
 * -> "Chardonnay"'. Ekran koji ispisuje povijest ne mora dirati `payload`.
 *
 * NEMA INDEKSA na `entityType`/`entityId` — svjesno. Tablica ima nula redaka i
 * raste nekoliko redaka po sezoni, pa je "povijest ovog tanka" pun scan nad
 * nicim. Kad naraste, `@@index([entityType, entityId])` je aditivna migracija
 * koja se doda tada, ne sada.
 */

type Tx = Prisma.TransactionClient;

/** Vrsta cina. Zrcali `ActivityLog.tip`, koji je slobodan tekst. */
export const TIP_IZMJENA_TANKA = "IZMJENA_TANKA";

/**
 * Jedna promjena jednog polja.
 *
 * `staro` i `novo` su UVIJEK tekst ili `null`, i kad je polje broj: jedan oblik
 * u `payload` znaci da ga citatelj ne mora pogadjati po polju. `null` znaci da
 * vrijednosti nije bilo, ne da je nepoznata.
 */
export type IzmjenaPolja = {
  polje: string;
  staro: string | null;
  novo: string | null;
};

/** Kako vrijednost ulazi u `payload` i u `opis`. */
function uTekst(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** '"Chardonnay"' ili '(prazno)' — za citljiv `opis`. */
function zaOpis(v: string | null): string {
  return v === null ? "(prazno)" : `"${v}"`;
}

/**
 * Usporedi staro i novo stanje i vrati SAMO polja koja su se stvarno
 * promijenila.
 *
 * Usporedjuje se nad `uTekst`, pa "" i null vrijede isto — inace bi ciscenje
 * polja koje je vec bilo prazno upisalo laznu izmjenu.
 */
export function razlikaPolja(
  prije: Record<string, unknown>,
  poslije: Record<string, unknown>,
  polja: string[]
): IzmjenaPolja[] {
  const izmjene: IzmjenaPolja[] = [];

  for (const polje of polja) {
    const staro = uTekst(prije[polje]);
    const novo = uTekst(poslije[polje]);

    if (staro === novo) continue;

    izmjene.push({ polje, staro, novo });
  }

  return izmjene;
}

export type ZapisIzmjene = {
  /** "Tank", "Preparat" … — sto se mijenjalo. */
  entityType: string;
  entityId: string;
  /** Kako se entitet zove u recenici: "Tank 26". */
  opisEntiteta: string;
  /** Tko. Obavezan — `ActivityLog.userId` je pravi strani kljuc. */
  userId: string;
  tip?: string;
  izmjene: IzmjenaPolja[];
};

/**
 * Upisi po JEDAN redak za svako promijenjeno polje.
 *
 * Redak po polju, a ne jedan redak sa svime: pitanje je uvijek "tko je dirao
 * OVO polje", pa se tako i cita, i tako se filtrira po `payload->>'polje'`.
 *
 * ZOVE SE UNUTAR ISTE TRANSAKCIJE kao i sama izmjena. Posljedica je namjerna:
 * ako upis u dnevnik padne, padne i izmjena. Bolje odbijena izmjena nego tiha
 * promjena bez traga — a jedini realan uzrok pada je da korisnik iz tokena vise
 * ne postoji u bazi, sto je samo po sebi vrijedno da se sazna.
 *
 * `datum` se postavlja IZRICITO: `ActivityLog.datum` nema default u bazi, pa bi
 * bez ovoga upis pukao.
 */
export async function zabiljeziIzmjene(
  tx: Tx,
  z: ZapisIzmjene
): Promise<number> {
  if (z.izmjene.length === 0) return 0;

  const sada = new Date();

  await tx.activityLog.createMany({
    data: z.izmjene.map((i) => ({
      datum: sada,
      userId: z.userId,
      tip: z.tip ?? TIP_IZMJENA_TANKA,
      entityType: z.entityType,
      entityId: z.entityId,
      opis: `${z.opisEntiteta}: ${i.polje} ${zaOpis(i.staro)} -> ${zaOpis(i.novo)}`,
      payload: { polje: i.polje, staro: i.staro, novo: i.novo },
    })),
  });

  return z.izmjene.length;
}
