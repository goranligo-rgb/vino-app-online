/**
 * PROVJERA KNJIGE BERBE nad pravom bazom — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run berba:provjeri
 *
 * SIGURNOST: iskljucivo SELECT. Nema transakcije, nema upisa, nema brisanja.
 * Sigurno je pokrenuti bilo kad, i tijekom berbe. Isti obrazac kao
 * scripts/provjeri-invarijante.ts, koji provjerava blend i sastav.
 *
 * Izlazni kod je 1 ako ijedna invarijanta padne, pa se moze staviti u lanac.
 *
 * KAD SE POKRECE
 *   - odmah nakon `npm run berba:backfill -- --upisi`,
 *   - i poslije svakog pretoka izvedenog kad korak 3 spoji knjigu na redovan
 *     rad. Zamjena za zastavicu koja bi drzala dva puta pisanja zivima: umjesto
 *     dvije grane koje pisu razlicite brojke, jedna grana i provjera koja
 *     odmah kaze je li nesto krivo.
 *
 * STO SE OVDJE NE PROVJERAVA, i zasto
 *   Da knjiga ima BAS SVAKI dogadjaj iz povijesti — to se ne moze provjeriti
 *   jer je povijest nepotpuna po sebi (obrisani izlazi, obrisana punjenja;
 *   vidi zaglavlje scripts/backfill-berba.ts). Umjesto toga se provjerava ono
 *   sto se PROVJERITI MOZE: da je knjiga sama sa sobom u skladu i da se slaze
 *   sa stanjem tankova. Broj ZATECENO zapisa je mjera koliko je povijest
 *   cjelovita i ispisuje se, ali ne obara provjeru.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { uLitre, uMl } from "../lib/filtracija";
import { stanjeSvihTankova } from "../lib/berba-model";

/** Ispod mililitra je zaokruzivanje, ne greska. */
const PRAG_ML = 1;

let pao = 0;
let proslo = 0;

function ok(uvjet: boolean, poruka: string, detalj = "") {
  if (uvjet) {
    proslo++;
    console.log(`  ok   ${poruka}`);
    return;
  }
  pao++;
  console.log(`  PALO ${poruka}${detalj ? "\n         " + detalj : ""}`);
}

function popis(redci: string[], najvise = 12): string {
  const prikaz = redci.slice(0, najvise);
  const ostatak = redci.length - prikaz.length;
  return prikaz.join("\n         ") + (ostatak > 0 ? `\n         … jos ${ostatak}` : "");
}

async function main() {
  console.log("Provjera knjige berbe (samo citanje).\n");

  const berbi = await prisma.berba.count();
  const kretanja = await prisma.berbaKretanje.count();

  if (berbi === 0 && kretanja === 0) {
    console.log("Knjiga je prazna — backfill jos nije pokrenut. Nema sto provjeriti.\n");
    return;
  }

  console.log(`Knjiga: ${berbi} zapisa berbe, ${kretanja} kretanja.\n`);

  // -------------------------------------------------------------------------
  // 1) Nijedna berba ne smije biti u minusu ni u jednom tanku.
  //
  //    Negativno stanje znaci da je iz tanka izasla berba koje u njemu nije
  //    bilo. Knjiga to ne moze proizvesti (zabiljeziPrijenos prije razdiobe
  //    provjerava stanje), pa bi minus znacio da je netko pisao mimo nje.
  const svaStanja = await stanjeSvihTankova(prisma, { svi: true });

  const minusi: string[] = [];

  for (const [tankId, stavke] of svaStanja) {
    for (const s of stavke) {
      if (s.ml < -PRAG_ML) minusi.push(`tank ${tankId} / berba ${s.berbaId}: ${s.litre} L`);
    }
  }

  ok(minusi.length === 0, "nijedna berba nije u minusu ni u jednom tanku", popis(minusi));

  // -------------------------------------------------------------------------
  // 2) Zbroj knjige po tanku = Tank.kolicinaVinaUTanku.
  //
  //    Ovo je glavna invarijanta cijelog modula. Ako padne, knjiga i tank
  //    govore razlicite brojke i podrijetlo se ne smije prikazivati.
  const tankovi = await prisma.tank.findMany({
    select: { id: true, broj: true, kolicinaVinaUTanku: true },
    orderBy: { broj: "asc" },
  });

  const neslaganja: string[] = [];

  for (const t of tankovi) {
    const uKnjiziMl = (svaStanja.get(t.id) ?? [])
      .filter((s) => !s.obrisano)
      .reduce((z, s) => z + s.ml, 0);

    const uTankuMl = uMl(Number(t.kolicinaVinaUTanku ?? 0));

    if (Math.abs(uTankuMl - uKnjiziMl) >= PRAG_ML) {
      neslaganja.push(
        `T${t.broj}: u tanku ${uLitre(uTankuMl)} L, u knjizi ${uLitre(uKnjiziMl)} L, razlika ${uLitre(uTankuMl - uKnjiziMl)} L`
      );
    }
  }

  ok(
    neslaganja.length === 0,
    `knjiga se slaze sa svim tankovima (provjereno ${tankovi.length})`,
    popis(neslaganja)
  );

  // -------------------------------------------------------------------------
  // 3) Svaka berba mora imati barem jedan ULAZ.
  //
  //    Berba bez ULAZ retka je zapis o vinu koje nikad nigdje nije uslo.
  const bezUlaza = await prisma.$queryRaw<Array<{ id: string; nazivSorte: string }>>`
    SELECT b.id, b."nazivSorte"
    FROM "Berba" b
    WHERE NOT EXISTS (
      SELECT 1 FROM "BerbaKretanje" k WHERE k."berbaId" = b.id AND k.vrsta = 'ULAZ'
    )
    ORDER BY b."createdAt" ASC
  `;

  ok(
    bezUlaza.length === 0,
    "svaka berba ima barem jedan ULAZ",
    popis(bezUlaza.map((b) => `${b.id} (${b.nazivSorte})`))
  );

  // -------------------------------------------------------------------------
  // 4) Zbroj ULAZ litara mora biti jednak Berba.kolicinaLitara.
  //
  //    Dvije tvrdnje koje se moraju poklopiti: "toliko je ubrano" i "toliko je
  //    uslo u tank". Kasnija kretanja mijenjaju samo drugu, ULAZ ne diraju.
  const kriviUlaz = await prisma.$queryRaw<
    Array<{ id: string; nazivSorte: string; upisano: number; ulaz: number }>
  >`
    SELECT b.id,
           b."nazivSorte",
           ROUND(b."kolicinaLitara"::numeric * 1000)::float8 AS upisano,
           COALESCE(SUM(ROUND(k.litre::numeric * 1000)), 0)::float8 AS ulaz
    FROM "Berba" b
    LEFT JOIN "BerbaKretanje" k ON k."berbaId" = b.id AND k.vrsta = 'ULAZ'
    GROUP BY b.id, b."nazivSorte", b."kolicinaLitara"
    HAVING ABS(
      ROUND(b."kolicinaLitara"::numeric * 1000)
      - COALESCE(SUM(ROUND(k.litre::numeric * 1000)), 0)
    ) >= ${PRAG_ML}
  `;

  ok(
    kriviUlaz.length === 0,
    "zbroj ULAZ litara odgovara upisanoj kolicini berbe",
    popis(
      kriviUlaz.map(
        (b) => `${b.nazivSorte} (${b.id}): upisano ${uLitre(Number(b.upisano))} L, ULAZ ${uLitre(Number(b.ulaz))} L`
      )
    )
  );

  // -------------------------------------------------------------------------
  // 5) Nijedan redak ne smije imati oba tanka prazna, ni oba ista.
  //
  //    Oba prazna = kretanje koje nista ne pomice. Oba ista = tank koji toci
  //    sam u sebe; zbroj bi ostao isti, ali bi svaki citac tog retka morao
  //    posebno paziti da ga ne broji dvaput.
  const losiRedci = await prisma.$queryRaw<Array<{ id: string; vrsta: string }>>`
    SELECT id, vrsta::text AS vrsta
    FROM "BerbaKretanje"
    WHERE ("izTankId" IS NULL AND "uTankId" IS NULL)
       OR ("izTankId" IS NOT NULL AND "izTankId" = "uTankId")
  `;

  ok(
    losiRedci.length === 0,
    "nijedan redak nema oba tanka prazna ni oba ista",
    popis(losiRedci.map((k) => `${k.id} (${k.vrsta})`))
  );

  // -------------------------------------------------------------------------
  // 6) Kolicina na svakom retku mora biti pozitivna.
  //
  //    Smjer nosi par izTank/uTank, ne predznak. Negativna kolicina bi bila
  //    drugi nacin da se kaze isto, a dva nacina znace da svaki citac mora
  //    poznavati oba.
  const nepozitivni = await prisma.$queryRaw<Array<{ id: string; litre: number }>>`
    SELECT id, litre::float8 AS litre
    FROM "BerbaKretanje"
    WHERE litre <= 0
  `;

  ok(
    nepozitivni.length === 0,
    "svaki redak ima kolicinu vecu od nule",
    popis(nepozitivni.map((k) => `${k.id}: ${k.litre} L`))
  );

  // -------------------------------------------------------------------------
  // 7) Sve kolicine moraju biti cijeli mililitri.
  //
  //    Knjiga pise iskljucivo `uLitre(ml)`, dakle najvise tri decimale. Redak s
  //    cetvrtom decimalom znaci da je netko pisao mimo knjige — i da citanje,
  //    koje zbraja preko ROUND(litre * 1000), tiho gubi ostatak.
  const necijeli = await prisma.$queryRaw<Array<{ id: string; litre: number }>>`
    SELECT id, litre::float8 AS litre
    FROM "BerbaKretanje"
    WHERE ABS(litre::numeric * 1000 - ROUND(litre::numeric * 1000)) > 0.000001
  `;

  ok(
    necijeli.length === 0,
    "sve kolicine su cijeli mililitri",
    popis(necijeli.map((k) => `${k.id}: ${k.litre} L`))
  );

  // -------------------------------------------------------------------------
  // 8) Nijedan redak ne smije imati vise od jedne veze na cin.
  //
  //    Dvije veze znace da bi ga `zabiljeziPonistenje` nasao dvaput i dvaput
  //    ponistio, cime bi u tank vratio dvostruko.
  const viseVeza = await prisma.$queryRaw<Array<{ id: string; koliko: number }>>`
    SELECT id,
           ((CASE WHEN "pretokId"    IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN "zadatakId"   IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN "izlazVinaId" IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN "punjenjeId"  IS NULL THEN 0 ELSE 1 END))::int AS koliko
    FROM "BerbaKretanje"
    WHERE ((CASE WHEN "pretokId"    IS NULL THEN 0 ELSE 1 END)
         + (CASE WHEN "zadatakId"   IS NULL THEN 0 ELSE 1 END)
         + (CASE WHEN "izlazVinaId" IS NULL THEN 0 ELSE 1 END)
         + (CASE WHEN "punjenjeId"  IS NULL THEN 0 ELSE 1 END)) > 1
  `;

  ok(
    viseVeza.length === 0,
    "nijedan redak nema vise od jedne veze na cin",
    popis(viseVeza.map((k) => `${k.id}: ${k.koliko} veza`))
  );

  // -------------------------------------------------------------------------
  // 9) Meko obrisana berba ne smije nigdje imati pozitivno stanje.
  //
  //    `obrisano` je za POGRESAN UNOS. Ako je zapis maknut a vino po knjizi
  //    ostalo u tanku, litre su ispale iz svakog zbroja koji filtrira obrisane
  //    — nestale su tiho, a upravo je tiho nestajanje razlog zbog kojeg ovaj
  //    modul postoji.
  const obrisaneSVinom: string[] = [];

  for (const [tankId, stavke] of svaStanja) {
    for (const s of stavke) {
      if (s.obrisano && s.ml > PRAG_ML) {
        obrisaneSVinom.push(`tank ${tankId} / berba ${s.berbaId}: ${s.litre} L`);
      }
    }
  }

  ok(
    obrisaneSVinom.length === 0,
    "nijedna obrisana berba nema vino u tanku",
    popis(obrisaneSVinom)
  );

  // -------------------------------------------------------------------------
  // 10) Ponisten cin ne smije imati preostali ucinak.
  //
  //     Za svaki cin s protustavkama zbroj svih njegovih redaka mora biti nula,
  //     po svakoj berbi i svakom tanku. Ako nije, ponistenje je bilo djelomicno.
  //
  //     PAZI NA REDOSLIJED: prebijanje ide PRIJE apsolutne vrijednosti.
  //
  //     Prva izvedba grupirala je "u tank" i "iz tanka" stranu odvojeno pa nad
  //     svakom uzela ABS — a upravo te dvije strane se moraju prebiti. Kod
  //     ispravno ponistenog pretoka original stoji na "iz" strani, a protustavka
  //     na "u" strani ISTOG tanka; odvojeno grupiranje ih nikad ne sretne, pa je
  //     rezultat bio dvostruki promet umjesto nule (T9→T16 200 L ponisten:
  //     javljalo je 800 L ostatka). Greska se nije vidjela sve do prvog stvarnog
  //     ponistenja 26.08.2026 — dotad protustavki nije bilo, pa je CTE
  //     `ponisteni` bio prazan i provjera je prolazila prazna.
  const ostatakPonistenja = await prisma.$queryRaw<
    Array<{ kljuc: string; ostatak: number }>
  >`
    WITH ponisteni AS (
      SELECT DISTINCT COALESCE("pretokId", "zadatakId", "izlazVinaId", "punjenjeId") AS kljuc
      FROM "BerbaKretanje"
      WHERE vrsta = 'PONISTENJE'
    ),
    ucinak AS (
      SELECT COALESCE(k."pretokId", k."zadatakId", k."izlazVinaId", k."punjenjeId") AS kljuc,
             k."berbaId",
             k."uTankId",
             k."izTankId",
             ROUND(k.litre::numeric * 1000) AS ml
      FROM "BerbaKretanje" k
    )
    SELECT u.kljuc, SUM(ABS(u.ml))::float8 AS ostatak
    FROM (
      SELECT kljuc, "berbaId", tank, SUM(ml) AS ml
      FROM (
        SELECT kljuc, "berbaId", "uTankId" AS tank, ml
        FROM ucinak WHERE "uTankId" IS NOT NULL
        UNION ALL
        SELECT kljuc, "berbaId", "izTankId" AS tank, -ml
        FROM ucinak WHERE "izTankId" IS NOT NULL
      ) strane
      GROUP BY kljuc, "berbaId", tank
    ) u
    JOIN ponisteni p ON p.kljuc = u.kljuc
    GROUP BY u.kljuc
    HAVING SUM(ABS(u.ml)) >= ${PRAG_ML}
  `;

  ok(
    ostatakPonistenja.length === 0,
    "svaki ponisten cin ima ucinak tocno nula",
    popis(ostatakPonistenja.map((r) => `cin ${r.kljuc}: ostalo ${uLitre(Number(r.ostatak))} L`))
  );

  // -------------------------------------------------------------------------
  // Mjera cjelovitosti — ne obara provjeru, ali se mora vidjeti.
  const zateceno = await prisma.berba.count({ where: { vrstaUnosa: "ZATECENO" } });
  const prava = await prisma.berba.count({ where: { vrstaUnosa: "BERBA" } });

  const zateceneLitre = await prisma.$queryRaw<Array<{ litre: number }>>`
    SELECT COALESCE(SUM("kolicinaLitara"), 0)::float8 AS litre
    FROM "Berba" WHERE "vrstaUnosa" = 'ZATECENO'
  `;

  const pravaLitre = await prisma.$queryRaw<Array<{ litre: number }>>`
    SELECT COALESCE(SUM("kolicinaLitara"), 0)::float8 AS litre
    FROM "Berba" WHERE "vrstaUnosa" = 'BERBA'
  `;

  console.log("\nCjelovitost povijesti (nije invarijanta, samo mjera):");
  console.log(`  BERBA     ${String(prava).padStart(4)} zapisa, ${Number(pravaLitre[0]?.litre ?? 0).toFixed(0)} L`);
  console.log(`  ZATECENO  ${String(zateceno).padStart(4)} zapisa, ${Number(zateceneLitre[0]?.litre ?? 0).toFixed(0)} L`);
  console.log("  Sto je vise ZATECENO zapisa, to je manje povijesti bilo sacuvano.");

  console.log(`\nproslo: ${proslo}, palo: ${pao}`);

  if (pao > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
