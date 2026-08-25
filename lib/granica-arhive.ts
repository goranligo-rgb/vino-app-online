import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * GRANICA ARHIVE — trenutak zadnjeg arhiviranja tanka.
 *
 * Ispred te crte u tanku je bilo DRUGO vino. Punjenja nastala prije nje ne
 * govore nista o tome sto je u tanku danas; govore o vinu koje je otislo.
 *
 * ZASTO POSTOJI, iako danas ne rezuje nista:
 * arhiviranje punjenja jos i BRISE (lib/pretok-arhiviranje.ts,
 * app/api/tank/arhiviraj/route.ts, app/api/izlaz-vina/route.ts), pa zaostalih
 * redaka nema — provjereno nad bazom, 0 pogodjenih punjenja. Ovo je mreza koja
 * se razapinje PRIJE nego faza 3 makne to brisanje i stari redci ostanu
 * zauvijek. Redoslijed je obavezan: bez ovoga bi `punjenje-stavka` zbrojio i
 * vino koje je iz tanka odavno otislo.
 *
 * ZASTO `ArhivaVina`, a ne `ArhivaPunjenjeTanka`:
 * pitanje je "kad je tank zadnji put ispraznjen" — svojstvo cina arhiviranja,
 * ne pojedinog punjenja. `ArhivaPunjenjeTanka` uz to nema `tankId` (veze se
 * samo na `arhivaVinaId`), a tank arhiviran PRAZAN nema nijedno dijete, dok
 * `ArhivaVina` svejedno postoji. Oslanjanje na dijete izgubilo bi granicu.
 *
 * ZASTO `createdAt`, a NE `datumPunjenja` (kako radi lib/berba-lanac.ts:524):
 * `datumPunjenja` je korisnicki unos i moze biti datiran unatrag. Naknadni
 * unos punjenja s datumom ispred zadnjeg arhiviranja ispao bi ispod granice i
 * tank bi ostao bez litara koje stvarno ima. `createdAt` je trenutak upisa i
 * na pitanje "je li ovo vino fizicki u tanku sada" ne moze lagati.
 * Odstupanje je namjerno; `berba-lanac` odgovara na drugo pitanje ("kad je
 * grozdje uslo") i ondje je `datumPunjenja` ispravan.
 *
 * POZNATO OGRANICENJE — filtracija ne arhivira:
 * lib/filtracija.ts:1101 izricito ostavlja izvorni tank prazan BEZ
 * `ArhivaVina` ("CEKA SE KRAJ BERBE"). Za takav tank granica je null i filtar
 * ne rezuje. Danas je to bezopasno (nijedan prazan tank nije bez arhive), ali
 * je uvjet koji faza 3 mora rijesiti prije nego makne brisanje.
 */

type KlijentArhive = Prisma.TransactionClient | PrismaClient;

/** Trenutak zadnjeg arhiviranja tanka, ili null ako tank nikad nije arhiviran. */
export async function citajGranicuArhive(
  db: KlijentArhive,
  tankId: string
): Promise<Date | null> {
  const zadnja = await db.arhivaVina.findFirst({
    where: { tankId },
    orderBy: { arhiviranoAt: "desc" },
    select: { arhiviranoAt: true },
  });

  return zadnja?.arhiviranoAt ?? null;
}

/**
 * Prevedi granicu u Prisma `where` fragment nad DateTime poljem.
 *
 * Tank BEZ ijednog arhiviranja daje `undefined`, sto Prisma tretira kao "nema
 * uvjeta" — ponasanje je tada znak za znak jednako onome prije ove izmjene.
 * Isti idiom vec stoji u app/tankovi/[id]/page.tsx:889.
 */
export function odGranice(granica: Date | null) {
  return granica ? { gte: granica } : undefined;
}
