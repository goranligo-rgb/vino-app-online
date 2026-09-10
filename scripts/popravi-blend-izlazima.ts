/**
 * JEDNOKRATNI POPRAVAK BLENDA KOJI JE VECI OD TANKA.
 *
 * Pokretanje:
 *   npm run blend:popravi            -> DRY-RUN, nista se ne pise
 *   npm run blend:popravi -- --upisi -> upisuje
 *
 * SIGURNOST
 * ---------
 * Zadano je dry-run. Upis dira ISKLJUCIVO `BlendIzvor.kolicina` i `postotak`;
 * nijedan `Tank`, `BerbaKretanje`, `IzlazVina` ni `PunjenjeTanka` redak se ne
 * mijenja. Kolicine u tankovima ostaju netaknute — dokazuje `npm run otisak`
 * prije i poslije.
 *
 * STO POPRAVLJA, I STO NAMJERNO NE
 * --------------------------------
 * Do 10.09.2026. izlaz vina (prodaja, punjenje u boce) umanjivao je tank a
 * `BlendIzvor` ostavljao netaknutim. Tank 43 je tako dosao do 1.120 L u blendu
 * na 605 L u tanku. Od danas izlaz blend skalira zajedno s tankom, ali
 * zatecena razlika ostaje dok je se ne makne — svaki sljedeci pretok bi je
 * inace prepisao dalje, jer cilj koji vec ima blend kopira zatecene retke u
 * njihovim zapisanim litrama.
 *
 * POPRAVLJA SE SAMO BLEND KOJI JE VECI OD TANKA, i samo na tanku koji NIJE
 * imao nijedno punjenje. Blend MANJI od tanka je legitiman: punjenje grozdjem
 * dodaje vino bez izvornog tanka i namjerno mu se ne dopisuje redak porijekla
 * (izmisljalo bi ga). T2 i T28 su takvi i NE DIRAJU SE — njihova se razlika od
 * danas prikazuje kao pokrivenost na kartici "Porijeklo vina".
 *
 * Skalira se PROPORCIONALNO: prodaja uzima presjek cijelog tanka, ne jednu
 * sastavnicu, pa se omjeri porijekla ne mijenjaju — mijenja se samo mjerilo.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { podijeliMl, uLitre, uMl } from "../lib/filtracija";

const UPISI = process.argv.includes("--upisi");

const pad = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);

async function main() {
  const tankovi = await prisma.tank.findMany({
    select: {
      id: true,
      broj: true,
      kolicinaVinaUTanku: true,
      blendIzvori: {
        select: { id: true, kolicina: true, postotak: true, nazivVina: true, sorta: true },
        orderBy: { id: "asc" },
      },
      _count: { select: { punjenja: true } },
    },
    orderBy: { broj: "asc" },
  });

  console.log("");
  console.log("POPRAVAK BLENDA — " + (UPISI ? "UPIS" : "DRY-RUN"));
  console.log("");
  console.log(
    pad("TANK", 6) + pad("u tanku", 11) + pad("blend", 11) + pad("razlika", 11) +
      pad("punjenja", 10) + "odluka"
  );
  console.log("-".repeat(90));

  const zaPopravak: Array<{
    id: string;
    broj: number;
    uTanku: number;
    blendL: number;
    redci: Array<{ id: string; kolicina: number }>;
  }> = [];

  for (const t of tankovi) {
    if (t.blendIzvori.length === 0) continue;

    const uTanku = Number(t.kolicinaVinaUTanku ?? 0);
    const blendL = t.blendIzvori.reduce((z, b) => z + Number(b.kolicina ?? 0), 0);
    const razlika = blendL - uTanku;

    if (Math.abs(razlika) <= 0.5) continue;

    let odluka: string;

    if (razlika < 0) {
      odluka = "NE DIRA SE — blend manji od tanka, to je pokrivenost";
    } else if (t._count.punjenja > 0) {
      // Blend veci od tanka NA TANKU S PUNJENJIMA: dvije suprotne sile su se
      // pomijesale i ne moze se razdvojiti koliko je od cega. Radije nista
      // nego pogodjen broj.
      odluka = "NE DIRA SE — ima punjenja, uzrok se ne moze razdvojiti";
    } else if (uTanku <= 0) {
      odluka = "NE DIRA SE — tank je prazan";
    } else {
      odluka = `SKALIRA na ${uTanku.toFixed(0)} L`;
      zaPopravak.push({
        id: t.id,
        broj: t.broj,
        uTanku,
        blendL,
        redci: t.blendIzvori.map((b) => ({ id: b.id, kolicina: Number(b.kolicina ?? 0) })),
      });
    }

    console.log(
      pad(`T${t.broj}`, 6) + pad(uTanku.toFixed(0), 11) + pad(blendL.toFixed(0), 11) +
        pad(razlika.toFixed(0), 11) + pad(String(t._count.punjenja), 10) + odluka
    );
  }

  console.log("");

  if (zaPopravak.length === 0) {
    console.log("Nema sto popraviti.");
    console.log("");
    return;
  }

  console.log("PLAN, redak po redak:");
  console.log("");

  for (const t of zaPopravak) {
    const dijelovi = podijeliMl(
      t.redci.map((r) => uMl(r.kolicina)),
      uMl(t.uTanku)
    );

    console.log(`  T${t.broj}: ${t.blendL.toFixed(0)} L -> ${t.uTanku.toFixed(0)} L`);
    t.redci.forEach((r, i) => {
      const novo = uLitre(dijelovi[i]);
      const postotak = t.uTanku > 0 ? (novo / t.uTanku) * 100 : 0;
      console.log(
        `     ${pad(r.kolicina.toFixed(3) + " L", 14)} -> ${pad(novo.toFixed(3) + " L", 14)} (${postotak.toFixed(2)} %)`
      );
    });
    console.log(
      `     zbroj poslije: ${dijelovi.reduce((z, x) => z + x, 0) / 1000} L`
    );
    console.log("");
  }

  if (!UPISI) {
    console.log("DRY-RUN — nista nije upisano. Za upis: -- --upisi");
    console.log("");
    return;
  }

  let promijenjeno = 0;

  await prisma.$transaction(async (tx) => {
    for (const t of zaPopravak) {
      const dijelovi = podijeliMl(
        t.redci.map((r) => uMl(r.kolicina)),
        uMl(t.uTanku)
      );

      for (let i = 0; i < t.redci.length; i++) {
        const novo = uLitre(dijelovi[i]);

        await tx.blendIzvor.update({
          where: { id: t.redci[i].id },
          // `postotak` se prepisuje jer se mjerilo promijenilo; omjeri su isti,
          // ali zaokruzivanje bi inace ostavilo stare brojke uz nove litre.
          data: {
            kolicina: novo,
            postotak: t.uTanku > 0 ? Number(((novo / t.uTanku) * 100).toFixed(2)) : 0,
          },
        });

        promijenjeno++;
      }
    }
  });

  console.log(`UPISANO: ${promijenjeno} redaka na ${zaPopravak.length} tanku/tankova.`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
