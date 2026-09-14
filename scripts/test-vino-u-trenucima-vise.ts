/**
 * SKUPNI CITAC TRENUTAKA NAPRAMA POJEDINACNOM.
 * ===========================================================================
 *
 * `vinoUTrenucimaVise` postoji da bi stranice s vise tankova prestale slati dva
 * upita PO TANKU. Cim isti racun moze dati dva puta, mora se dokazati da daje
 * ISTO — inace je to sesta kopija istog racuna koja tiho odluta.
 *
 * MJERILO JE POJEDINACNA VARIJANTA, ne unutarnja dosljednost: `vinoUTrenucima`
 * je dokazani citac (`test:knjiga:vrijeme` ga usporeduje sa `stanjeTanka` u 68
 * trenutaka). Skupna se usporeduje s njim na SVIM trenucima podruma — svakom
 * trenutku u kojem identitet vina pita "koliko je bilo prije ovog ulaza".
 *
 * MUTACIJE nisu izmisljene: sve tri su kvarovi koji su se u ovom repozitoriju
 * vec dogodili ili su im najblizi susjedi.
 *   1. strogi rez (`<` umjesto `<=`) — granica MORA biti ukljuciva, inace
 *      punjenje i njegovo pocetno mjerenje padnu na dvije strane;
 *   2. sat bez donje brane — unatrag datirano punjenje tada vrati vino koje je
 *      iz tanka vec otislo (popravak od 14.09.2026);
 *   3. redci se ne razvrstavaju po posudi — tank dobije tudje litre.
 * Svaka se mora razici s mjerilom barem jednom.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { vinoUTrenucima, vinoUTrenucimaVise, type ZahtjevTrenutaka, type VinoUTrenutku } from "../lib/berba-model";
import { praznjenjaPosuda, satKretanja } from "../lib/sat-knjige";
import { citajUlazneCine } from "../lib/identitet-vina";
import { uValovima } from "../lib/paralelno";

let proslo = 0;
let palo = 0;

function tvrdi(uvjet: boolean, opis: string, detalj?: string) {
  if (uvjet) {
    proslo++;
    console.log(`  ok   ${opis}`);
  } else {
    palo++;
    console.log(`  PALO ${opis}${detalj ? `\n       ${detalj}` : ""}`);
  }
}

/** Redak knjige, onoliko koliko ovaj racun treba. */
type Redak = {
  id: string;
  berbaId: string;
  uTankId: string | null;
  izTankId: string | null;
  litre: number;
  /** Nije nullable — `satKretanja` ga cita bez provjere (vidi `RedakSata`). */
  dogodenoAt: Date;
  createdAt: Date;
  punjenjeId: string | null;
};

type Skupni = (
  zahtjevi: ZahtjevTrenutaka[]
) => Promise<Map<string, VinoUTrenutku[]>> | Map<string, VinoUTrenutku[]>;

/**
 * Mutirana skupna varijanta: isti oblik, pokvaren jedan detalj.
 *
 * Racuna samo `ukupnoL`, jer se tvrdnja o litrama prva razilazi — a mutacija
 * koja prodje tvrdnju o litrama prosla bi i tvrdnju o stavkama.
 */
function mutant(
  redci: Redak[],
  kvar: "strogi-rez" | "sat-bez-brane" | "bez-razvrstavanja"
): Skupni {
  return (zahtjevi) => {
    const praznjenja = praznjenjaPosuda(redci);
    const out = new Map<string, VinoUTrenutku[]>();

    for (const z of zahtjevi) {
      const moji = redci.filter(
        (k) =>
          kvar === "bez-razvrstavanja" ||
          k.uTankId === z.tankId ||
          k.izTankId === z.tankId
      );

      const sKlokom = moji.map((k) => ({
        berbaId: k.berbaId,
        // Mutacija "bez-razvrstavanja" mora STVARNO pripisati tudje litre.
        // Prva izvedba ovog mutanta pustala je tudje retke kroz filtar, ali im
        // je `ml` racunala usporedbom s `z.tankId` — pa su ulazili kao nule i
        // mutant je bio bezub. Sada svaki redak koji je igdje uslo broji kao
        // ulaz u ovu posudu.
        ml:
          kvar === "bez-razvrstavanja"
            ? k.uTankId
              ? Math.round(Number(k.litre) * 1000)
              : -Math.round(Number(k.litre) * 1000)
            : (k.uTankId === z.tankId ? Math.round(Number(k.litre) * 1000) : 0) -
              (k.izTankId === z.tankId ? Math.round(Number(k.litre) * 1000) : 0),
        sat:
          kvar === "sat-bez-brane"
            ? Math.min(k.dogodenoAt.getTime(), k.createdAt.getTime())
            : satKretanja(k, praznjenja),
      }));

      out.set(
        z.tankId,
        z.trenuci.map((trenutak) => {
          const ms = trenutak.getTime();
          const poBerbi = new Map<string, number>();

          for (const k of sKlokom) {
            const unutra = kvar === "strogi-rez" ? k.sat < ms : k.sat <= ms;
            if (!unutra) continue;
            poBerbi.set(k.berbaId, (poBerbi.get(k.berbaId) ?? 0) + k.ml);
          }

          const ml = [...poBerbi.values()]
            .filter((x) => x > 0)
            .reduce((a, b) => a + b, 0);

          return { trenutak, ukupnoL: ml / 1000, stavke: [] };
        })
      );
    }

    return out;
  };
}

/** Koliko se `skupni` razilazi s mjerilom, i gdje prvi put. */
function razlike(
  zahtjevi: ZahtjevTrenutaka[],
  mjerilo: Map<string, VinoUTrenutku[]>,
  skupni: Map<string, VinoUTrenutku[]>,
  brojevi: Map<string, number>
): { koliko: number; prvi: string } {
  let koliko = 0;
  let prvi = "";

  for (const z of zahtjevi) {
    const a = mjerilo.get(z.tankId) ?? [];
    const b = skupni.get(z.tankId) ?? [];

    z.trenuci.forEach((_, j) => {
      const x = a[j]?.ukupnoL ?? 0;
      const y = b[j]?.ukupnoL ?? 0;
      if (Math.abs(x - y) > 0.001) {
        koliko++;
        if (!prvi) {
          prvi = `T${brojevi.get(z.tankId) ?? "?"} trenutak ${j}: mjerilo ${x} L, dobiveno ${y} L`;
        }
      }
    });
  }

  return { koliko, prvi };
}

async function main() {
  console.log("\nSKUPNI CITAC TRENUTAKA (samo citanje)");

  const tankovi = await prisma.tank.findMany({
    select: { id: true, broj: true },
    orderBy: { broj: "asc" },
  });
  const brojevi = new Map(tankovi.map((t) => [t.id, t.broj]));

  // TRENUCI KOJE STVARNI POZIVATELJ TRAZI: po jedan prije svakog ulaznog cina,
  // za cijeli podrum. Ne izmisljeni datumi — oni koje identitet vina stvarno
  // pita.
  const { cini } = await citajUlazneCine(
    prisma,
    tankovi.map((t) => t.id)
  );

  // DVA TRENUTKA PO CINU, i drugi nije ukras.
  //
  // Stvarni pozivatelj pita za `kada - 1`, pa nijedan trenutak ne pada TOCNO
  // na sat nekog retka — a ondje je razlika izmedju ukljucive i stroge granice
  // nevidljiva. Mutacija "strogi rez" je zato prvi put prosla neprimijeceno.
  // Uz `kada` u popisu granica se mjeri ondje gdje se jedino i moze mjeriti.
  const zahtjevi: ZahtjevTrenutaka[] = [...cini.entries()]
    .map(([tankId, ulazi]) => ({
      tankId,
      trenuci: ulazi.flatMap((u) => [
        new Date(u.kada.getTime() - 1),
        new Date(u.kada.getTime()),
      ]),
    }))
    .filter((z) => z.trenuci.length > 0);

  const ukupnoTrenutaka = zahtjevi.reduce((z, x) => z + x.trenuci.length, 0);
  console.log(`  (${zahtjevi.length} tankova, ${ukupnoTrenutaka} trenutaka)`);

  tvrdi(ukupnoTrenutaka > 100, "podrum daje dovoljno trenutaka za usporedbu", `${ukupnoTrenutaka}`);

  // --- MJERILO: pojedinacna varijanta, tank po tank ---
  const poTanku = (await uValovima(
    zahtjevi.map((z) => async () => vinoUTrenucima(prisma, z.tankId, z.trenuci)),
    4
  )) as VinoUTrenutku[][];

  const mjerilo = new Map<string, VinoUTrenutku[]>(
    zahtjevi.map((z, i) => [z.tankId, poTanku[i]])
  );

  // --- SKUPNA ---
  const skupno = await vinoUTrenucimaVise(prisma, zahtjevi);

  const r = razlike(zahtjevi, mjerilo, skupno, brojevi);
  tvrdi(r.koliko === 0, `skupna i pojedinacna daju iste litre u svih ${ukupnoTrenutaka} trenutaka`, r.prvi);

  // Ne samo zbroj: i same stavke (koja berba, koliko, koliki udio).
  let razlikaStavki = 0;
  let prvaStavka = "";
  for (const z of zahtjevi) {
    const a = mjerilo.get(z.tankId) ?? [];
    const b = skupno.get(z.tankId) ?? [];
    z.trenuci.forEach((_, j) => {
      const sa = a[j]?.stavke ?? [];
      const sb = b[j]?.stavke ?? [];
      const kljuc = (s: (typeof sa)[number]) =>
        `${s.berbaId}:${s.litre}:${s.postotak}:${s.nazivSorte}`;
      if (sa.map(kljuc).join("|") !== sb.map(kljuc).join("|")) {
        razlikaStavki++;
        if (!prvaStavka) {
          prvaStavka = `T${brojevi.get(z.tankId) ?? "?"} trenutak ${j}: ${sa.length} naprama ${sb.length} stavki`;
        }
      }
    });
  }
  tvrdi(razlikaStavki === 0, "skupna i pojedinacna daju iste stavke", prvaStavka);

  // --- Rubovi ---
  const prazno = await vinoUTrenucimaVise(prisma, []);
  tvrdi(prazno.size === 0, "prazan popis zahtjeva ne salje upit i vraca praznu mapu");

  const bezTrenutaka = await vinoUTrenucimaVise(prisma, [
    { tankId: tankovi[0].id, trenuci: [] },
  ]);
  tvrdi(bezTrenutaka.size === 0, "zahtjev bez trenutaka se preskace");

  const izmisljen = await vinoUTrenucimaVise(prisma, [
    { tankId: "ne-postoji", trenuci: [new Date()] },
  ]);
  tvrdi(
    izmisljen.get("ne-postoji")?.length === 1 &&
      izmisljen.get("ne-postoji")?.[0].ukupnoL === 0,
    "posuda koju knjiga ne poznaje daje nulu, ne prazan popis"
  );

  const jedan = zahtjevi[0];
  const omotac = await vinoUTrenucima(prisma, jedan.tankId, jedan.trenuci);
  tvrdi(
    omotac.length === jedan.trenuci.length &&
      omotac.every(
        (x, i) => Math.abs(x.ukupnoL - (skupno.get(jedan.tankId)?.[i].ukupnoL ?? -1)) < 0.001
      ),
    "omotac vraca tocno ono sto i skupna varijanta"
  );

  // --- MUTACIJE ---
  console.log("\nMUTACIJE (svaka se mora razici s mjerilom)");

  const redci = (await prisma.berbaKretanje.findMany({
    select: {
      id: true,
      berbaId: true,
      uTankId: true,
      izTankId: true,
      litre: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  })) as unknown as Redak[];

  const mutacije: Array<{ opis: string; kvar: Parameters<typeof mutant>[1] }> = [
    { opis: "granica je stroga umjesto ukljuciva", kvar: "strogi-rez" },
    { opis: "sat nema donju branu praznjenja", kvar: "sat-bez-brane" },
    { opis: "redci se ne razvrstavaju po posudi", kvar: "bez-razvrstavanja" },
  ];

  for (const m of mutacije) {
    const rezultat = await mutant(redci, m.kvar)(zahtjevi);
    const d = razlike(zahtjevi, mjerilo, rezultat, brojevi);
    tvrdi(d.koliko > 0, `uhvacena: ${m.opis}`, d.koliko === 0 ? "nije se razisla nigdje" : undefined);
  }

  console.log("");
  console.log(`proslo: ${proslo}, palo: ${palo}`);
  if (palo > 0) process.exitCode = 1;
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
