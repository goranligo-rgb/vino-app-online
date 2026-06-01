import type { Prisma } from "@prisma/client";

// Tip transakcijskog Prisma klijenta. Helper se zove iz $transaction blokova
// kako bi se provjera i izvršenje dogodili u istoj transakciji.
type TxClient = Prisma.TransactionClient;

// Minimalni oblik zadatka kojeg helper treba — samo polja za usporedbu
// redoslijeda i identifikaciju ranijeg zapisa.
type ZadatakZaProvjeru = {
  id: string;
  tankId: string;
  zadanoAt: Date;
  createdAt: Date;
};

// Format DD.MM.YYYY HH:mm — koristi se u poruci greške koja ide korisniku.
function formatirajDatumHr(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Osigurava da se na istom tanku zadaci izvršavaju redom unosa (zadanoAt).
 *
 * Pravilo: zadatak smije ići u izvršenje samo ako na istom tankId NEMA
 * ranijeg OTVOREN zadatka koji je spreman za izvršenje. Odgođeni zadaci
 * (zakljucanDo u budućnosti) se preskaču — ne blokiraju.
 *
 * Totalni redoslijed dva otvorena zadatka definira se kao:
 *   (zadanoAt, createdAt, id), leksikografski.
 * Tie-break na createdAt i id potreban je jer SQLite/Postgres mogu imati
 * dva @default(now()) polja u istoj milisekundi pa zadanoAt sam nije
 * jedinstven; uuid je deterministički diskriminator.
 *
 * Race condition svjesno prihvaćamo (mali broj istovremenih korisnika,
 * bez FOR UPDATE / serializable izolacije).
 *
 * Baca Error čija se poruka u rutama mapira na HTTP 400 i pokazuje
 * korisniku kao tekst (frontend već prikazuje data.error iz odgovora).
 */
export async function osigurajRedoslijed(
  tx: TxClient,
  zadatak: ZadatakZaProvjeru
) {
  const sada = new Date();

  // Prisma zamka: dva ključa OR ne smiju biti u istom where objektu —
  // drugi tiho prepisuje prvi. Zato dva uvjeta idu kao zasebne stavke
  // unutar AND:
  //   1) "spreman za izvršenje" (nije odgođen u budućnost)
  //   2) "raniji od ovog zadatka" po totalnom redoslijedu
  const raniji = await tx.zadatak.findFirst({
    where: {
      tankId: zadatak.tankId,
      id: { not: zadatak.id },
      status: "OTVOREN",
      AND: [
        {
          OR: [
            { zakljucanDo: null },
            { zakljucanDo: { lte: sada } },
          ],
        },
        {
          OR: [
            { zadanoAt: { lt: zadatak.zadanoAt } },
            {
              zadanoAt: zadatak.zadanoAt,
              createdAt: { lt: zadatak.createdAt },
            },
            {
              zadanoAt: zadatak.zadanoAt,
              createdAt: zadatak.createdAt,
              id: { lt: zadatak.id },
            },
          ],
        },
      ],
    },
    orderBy: [
      { zadanoAt: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      naslov: true,
      zadanoAt: true,
    },
  });

  if (raniji) {
    const naslov = raniji.naslov?.trim() || "bez naslova";
    const datum = formatirajDatumHr(new Date(raniji.zadanoAt));
    throw new Error(
      `Na ovom tanku postoji raniji neizvršeni zadatak: "${naslov}" (zadano ${datum}). Najprije izvrši taj zadatak.`
    );
  }
}
