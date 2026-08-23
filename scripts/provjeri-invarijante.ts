/**
 * PROVJERA INVARIJANTI nad pravom bazom — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run provjeri
 *
 * Namijenjeno pokretanju NAKON svakog od prvih nekoliko pretoka izvedenih novim
 * motorom (faza 5c). Zamjenjuje zastavicu koja bi drzala staru granu zivom:
 * umjesto dva koda koji pisu razlicite brojke, jedan kod i provjera koja odmah
 * kaze je li nesto krivo.
 *
 * SIGURNOST: iskljucivo SELECT. Nema transakcije, nema upisa, nema brisanja.
 * Sigurno je pokrenuti bilo kad, i tijekom berbe.
 *
 * Izlazni kod je 1 ako ijedna invarijanta padne, pa se moze staviti u lanac.
 */

import { prisma } from "../lib/prisma";

const PRAG_L = 0.001; // ispod mililitra je zaokruzivanje, ne greska

let pao = 0;
let proslo = 0;

function ok(uvjet: boolean, poruka: string, detalj = "") {
  if (uvjet) {
    proslo++;
    return;
  }
  pao++;
  console.log(`  PALO: ${poruka}${detalj ? "\n        " + detalj : ""}`);
}

async function main() {
  console.log("Provjera invarijanti (samo citanje).\n");

  // -------------------------------------------------------------------------
  // 1) Blend svakog tanka mora zbrajati tocno onoliko koliko je u tanku.
  //
  //    Tank bez blend zapisa je u redu — znaci da vino nije nastalo mijesanjem.
  //    Tank S blendom koji se ne poklapa s kolicinom znaci da je negdje izgubljen
  //    ili izmisljen litar; upravo to je faza 1 nasla na tankovima 15, 32 i 43.
  const blendovi = await prisma.$queryRaw<Array<{ broj: number; u_tanku: number; blend: number; redaka: number }>>`
    SELECT t.broj,
           COALESCE(t."kolicinaVinaUTanku", 0)::float8 AS u_tanku,
           COALESCE(SUM(bi.kolicina), 0)::float8       AS blend,
           COUNT(bi.id)::int                           AS redaka
    FROM "Tank" t
    LEFT JOIN "BlendIzvor" bi ON bi."ciljTankId" = t.id
    GROUP BY t.id, t.broj, t."kolicinaVinaUTanku"
    HAVING COUNT(bi.id) > 0
    ORDER BY t.broj
  `;

  const loseBlend = blendovi.filter((b) => Math.abs(b.blend - b.u_tanku) > PRAG_L);

  ok(
    loseBlend.length === 0,
    `blend svakog tanka odgovara kolicini (provjereno ${blendovi.length} tankova s blendom)`,
    loseBlend
      .map((b) => `T${b.broj}: u tanku ${b.u_tanku} L, blend ${b.blend.toFixed(3)} L u ${b.redaka} redaka`)
      .join("\n        ")
  );

  // -------------------------------------------------------------------------
  // 2) Postotci blenda moraju zbrajati 100,00.
  const postotci = await prisma.$queryRaw<Array<{ broj: number; zbroj: number }>>`
    SELECT t.broj, SUM(bi.postotak)::float8 AS zbroj
    FROM "Tank" t
    JOIN "BlendIzvor" bi ON bi."ciljTankId" = t.id
    GROUP BY t.id, t.broj
    HAVING ABS(SUM(bi.postotak) - 100) > 0.005
    ORDER BY t.broj
  `;

  ok(
    postotci.length === 0,
    "postotci blenda zbrajaju 100,00",
    postotci.map((p) => `T${p.broj}: ${p.zbroj.toFixed(2)} %`).join("\n        ")
  );

  // -------------------------------------------------------------------------
  // 3) Sastav po sortama mora zbrajati 100,00.
  const sastav = await prisma.$queryRaw<Array<{ broj: number; zbroj: number }>>`
    SELECT t.broj, SUM(u.postotak)::float8 AS zbroj
    FROM "Tank" t
    JOIN "TankSortaUdio" u ON u."tankId" = t.id
    GROUP BY t.id, t.broj
    HAVING ABS(SUM(u.postotak) - 100) > 0.005
    ORDER BY t.broj
  `;

  ok(
    sastav.length === 0,
    "sastav po sortama zbraja 100,00",
    sastav.map((s) => `T${s.broj}: ${s.zbroj.toFixed(2)} %`).join("\n        ")
  );

  // -------------------------------------------------------------------------
  // 4) Nijedan blend pokazivac ne smije voditi na tank koji je u meduvremenu
  //    arhiviran — takav pokazivac vodi na TUDJE vino, jer je tank slobodan za
  //    novo. Ovo je nalaz iz faze 1; tada ih je bilo sest.
  const pokazivaci = await prisma.$queryRaw<
    Array<{ cilj: number; izvor: number; naziv: string | null; kolicina: number; kreirano: Date }>
  >`
    SELECT ct.broj AS cilj, it.broj AS izvor, bi."nazivVina" AS naziv,
           bi.kolicina::float8 AS kolicina, bi."createdAt" AS kreirano
    FROM "BlendIzvor" bi
    JOIN "Tank" ct ON ct.id = bi."ciljTankId"
    JOIN "Tank" it ON it.id = bi."izvorTankId"
    WHERE bi."izvorTankId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "ArhivaVina" a
        WHERE a."tankId" = bi."izvorTankId"
          AND a."arhiviranoAt" >= bi."createdAt" - interval '30 seconds'
      )
    ORDER BY bi."createdAt"
  `;

  ok(
    pokazivaci.length === 0,
    "nijedan blend pokazivac ne vodi na arhivirani tank",
    pokazivaci
      .map(
        (p) =>
          `T${p.cilj} → T${p.izvor} "${p.naziv}" ${p.kolicina} L (redak od ${p.kreirano
            .toISOString()
            .slice(0, 10)})`
      )
      .join("\n        ")
  );

  // -------------------------------------------------------------------------
  // 5) Svaki pretok mora imati barem jedan cilj u PretokCilj.
  const bezCilja = await prisma.pretok.count({ where: { ciljevi: { none: {} } } });
  ok(bezCilja === 0, "svaki pretok ima barem jedan PretokCilj", `bez cilja: ${bezCilja}`);

  // -------------------------------------------------------------------------
  // 6) Kalo ne smije biti negativan — u ciljeve ne moze uci vise nego sto je
  //    iz izvora izaslo.
  const negativanKalo = await prisma.pretok.findMany({
    where: { gubitakLitara: { lt: 0 } },
    select: { id: true, datum: true, gubitakLitara: true },
  });

  ok(
    negativanKalo.length === 0,
    "nijedan pretok nema negativan kalo",
    negativanKalo.map((p) => `${p.id.slice(0, 8)} ${p.gubitakLitara} L`).join("\n        ")
  );

  // -------------------------------------------------------------------------
  // 7) Gdje su upisani, kolicinaIzlaz i gubitak moraju se slagati sa zbrojevima
  //    izvora i ciljeva. Pretoci od prije faze 5 imaju NULL i preskacu se.
  const brojke = await prisma.$queryRaw<
    Array<{ id: string; izlaz: number; zbroj_izvora: number; gubitak: number; zbroj_ciljeva: number }>
  >`
    SELECT p.id,
           p."kolicinaIzlaz"::float8                        AS izlaz,
           COALESCE((SELECT SUM(i.kolicina) FROM "PretokIzvor" i WHERE i."pretokId" = p.id), 0)::float8 AS zbroj_izvora,
           COALESCE(p."gubitakLitara", 0)::float8           AS gubitak,
           COALESCE((SELECT SUM(c.kolicina) FROM "PretokCilj" c WHERE c."pretokId" = p.id), 0)::float8  AS zbroj_ciljeva
    FROM "Pretok" p
    WHERE p."kolicinaIzlaz" IS NOT NULL
  `;

  const loseBrojke = brojke.filter(
    (b) =>
      Math.abs(b.izlaz - b.zbroj_izvora) > PRAG_L ||
      Math.abs(b.izlaz - (b.zbroj_ciljeva + b.gubitak)) > PRAG_L
  );

  ok(
    loseBrojke.length === 0,
    `izlaz = zbroj izvora = zbroj ciljeva + kalo (provjereno ${brojke.length} pretoka s upisanim brojkama)`,
    loseBrojke
      .map(
        (b) =>
          `${b.id.slice(0, 8)}: izlaz ${b.izlaz}, izvori ${b.zbroj_izvora}, ciljevi ${b.zbroj_ciljeva}, kalo ${b.gubitak}`
      )
      .join("\n        ")
  );

  // -------------------------------------------------------------------------
  const tankova = await prisma.tank.count();
  const pretoka = await prisma.pretok.count();

  console.log("");
  console.log(`Provjereno: ${tankova} tankova, ${pretoka} pretoka.`);
  console.log(`Invarijanti proslo: ${proslo}, palo: ${pao}`);
  console.log(pao === 0 ? "SVE DRZI." : "IMA ODSTUPANJA — vidi gore.");

  await prisma.$disconnect();
  if (pao > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
