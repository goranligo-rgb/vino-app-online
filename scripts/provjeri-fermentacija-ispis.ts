/**
 * PROVJERA DNEVNIKA FERMENTACIJE nad pravom bazom — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run fermentacija:ispis
 *
 * SIGURNOST: iskljucivo SELECT. Nema transakcije, nema upisa, nema brisanja.
 * Isti obrazac kao scripts/provjeri-berbu.ts i ostale provjere.
 *
 * CEMU SLUZI: stranica /fermentacija/[id] sastavlja pet dijelova iz cetiri
 * izvora. Ova skripta iste dijelove slozi u terminalu, pa se sadrzaj papira
 * moze provjeriti bez pregledavanja HTML-a — i, sto je vaznije, i onda kad u
 * tablici `Fermentacija` jos nema nijednog retka: prozor se tada SASTAVI iz
 * datuma dodavanja kvasca, isto kao u scripts/provjeri-fermentacija-prozor.ts.
 *
 * PREPARATI SE NE FILTRIRAJU PO `jeKvasac`, ovdje kao ni na papiru. Dnevnik
 * pokazuje SVE sto je islo u most — kvasac, hranu, enzime, zastitne pripravke.
 * `jeKvasac` odgovara samo na "sto forma smije ponuditi kao pocetak". Jedna od
 * invarijanti nize upravo to i cuva: broji koliko preparata na ispisu NIJE
 * kvasac i pada ako ih nema nijedan ondje gdje ih mora biti.
 *
 * Izlazni kod je 1 ako ijedna invarijanta padne.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { uValovima } from "../lib/paralelno";
import { prozorFermentacije, type RezultatProzora } from "../lib/fermentacija-prozor";
import { citajMjerenja } from "../lib/mjerenja-berba";

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

function dat(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function lit(n: number): string {
  return n.toLocaleString("hr-HR", { maximumFractionDigits: 1 });
}

const ZONA = "Europe/Zagreb";
const OCITANJA_PUN_DAN = 720;

function danKljuc(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function main() {
  console.log("Provjera dnevnika fermentacije (samo citanje).\n");

  const sada = new Date();

  const tankovi = new Map(
    (await prisma.tank.findMany({ select: { id: true, broj: true } })).map((t) => [
      t.id,
      t.broj,
    ])
  );
  const T = (id: string) => `T${tankovi.get(id) ?? "?"}`;

  const berbe = new Map(
    (await prisma.berba.findMany({
      select: { id: true, nazivSorte: true, kolicinaLitara: true, kolicinaKgGrozdja: true },
    })).map((b) => [b.id, b])
  );

  // --- Koje fermentacije gledamo ------------------------------------------
  const prave = await prisma.fermentacija.findMany({
    where: { obrisano: false },
    orderBy: { pocetakAt: "asc" },
  });

  type Slucaj = { naslov: string; tankId: string; pocetakAt: Date; krajAt: Date | null };
  let slucajevi: Slucaj[];

  if (prave.length > 0) {
    console.log(`Tablica Fermentacija: ${prave.length} redaka — citaju se PRAVI zapisi.\n`);
    slucajevi = prave.map((f) => ({
      naslov: `${T(f.tankId)} (zapis ${f.id.slice(0, 8)})`,
      tankId: f.tankId,
      pocetakAt: f.pocetakAt,
      krajAt: f.krajAt,
    }));
  } else {
    console.log(
      "Tablica Fermentacija je PRAZNA — prozori se SASTAVLJAJU iz datuma\n" +
        "dodavanja kvasca, da se ispis moze provjeriti prije prvog unosa.\n"
    );
    const zadaci = await prisma.zadatak.findMany({
      where: { vrsta: "DODAVANJE", status: "IZVRSEN", izvrsenoAt: { not: null } },
      select: { tankId: true, izvrsenoAt: true },
      orderBy: { izvrsenoAt: "asc" },
    });
    const prvi = new Map<string, Date>();
    for (const z of zadaci) {
      if (z.izvrsenoAt && !prvi.has(z.tankId)) prvi.set(z.tankId, z.izvrsenoAt);
    }
    slucajevi = [...prvi.entries()].map(([tankId, pocetakAt]) => ({
      naslov: `${T(tankId)} (sastavljeno, kvasac ${dat(pocetakAt)})`,
      tankId,
      pocetakAt,
      krajAt: null,
    }));
  }

  if (slucajevi.length === 0) {
    console.log("Nema nijednog slucaja za provjeru.\n");
    return;
  }

  // Vise prozora ide kroz uValovima, ne kroz goli Promise.all.
  const prozori = await uValovima(
    slucajevi.map(
      (s) => () =>
        prozorFermentacije(
          prisma,
          { tankId: s.tankId, pocetakAt: s.pocetakAt, krajAt: s.krajAt },
          sada
        )
    ),
    2
  );

  let ukupnoPreparata = 0;
  let preparataNijeKvasac = 0;
  let ukupnoDana = 0;
  let danaBezOcitanja = 0;

  for (let i = 0; i < slucajevi.length; i++) {
    const s = slucajevi[i];
    const prozor: RezultatProzora = prozori[i];
    const prozorDo = prozor.prozorDo;

    console.log(`\n══ ${s.naslov}`);
    console.log(`   prozor: ${dat(s.pocetakAt)} → ${dat(prozorDo)}`);

    if (prozor.berbaIds.length === 0) {
      console.log("   knjiga u tom trenutku ne zna nista o ovom tanku — papir bi bio prazan.");
      continue;
    }

    // --- VINO (kg se NE zbrajaju, litre se zbrajaju) ---------------------
    console.log("   vino:");
    let zbrojLitara = 0;
    for (const bId of prozor.berbaIds) {
      const b = berbe.get(bId);
      const uFerm = prozor.pocetneLitre.get(bId) ?? 0;
      zbrojLitara += uFerm;
      console.log(
        `     ${(b?.nazivSorte ?? "?").padEnd(24)} ubrano ${lit(
          b?.kolicinaLitara ?? 0
        )} L / ${lit(b?.kolicinaKgGrozdja ?? 0)} kg   u fermentaciji ${lit(uFerm)} L`
      );
    }
    if (prozor.berbaIds.length > 1) {
      console.log(`     ${"UKUPNO".padEnd(24)} ${lit(zbrojLitara)} L  (kilogrami se NE zbrajaju)`);
    }

    // --- GDJE JE VINO BILO ------------------------------------------------
    const rasponPoTanku = new Map<string, { od: Date; do: Date }>();
    for (const b of prozor.boravci) {
      const st = rasponPoTanku.get(b.tankId);
      if (!st) rasponPoTanku.set(b.tankId, { od: b.od, do: b.do });
      else {
        if (b.od < st.od) st.od = b.od;
        if (b.do > st.do) st.do = b.do;
      }
    }
    const tankIds = [...rasponPoTanku.keys()];
    console.log(`   prosao kroz: ${tankIds.map(T).join(" → ")}  (${prozor.boravci.length} boravaka)`);

    // --- PREPARATI (bez filtra po jeKvasac) -------------------------------
    const zadaci = await prisma.zadatak.findMany({
      where: {
        tankId: { in: tankIds },
        status: "IZVRSEN",
        izvrsenoAt: { gte: s.pocetakAt, lt: prozorDo },
      },
      orderBy: { izvrsenoAt: "asc" },
      include: {
        preparat: { select: { naziv: true, jeKvasac: true } },
        stavke: {
          orderBy: { redoslijed: "asc" },
          include: { preparat: { select: { naziv: true, jeKvasac: true } } },
        },
      },
    });

    const preparati: Array<{ naziv: string; jeKvasac: boolean; kad: Date; tank: string }> = [];
    for (const z of zadaci) {
      const izvori =
        z.stavke.length > 0 ? z.stavke.map((x) => x.preparat) : [z.preparat];
      for (const pr of izvori) {
        if (!pr) continue;
        preparati.push({
          naziv: pr.naziv,
          jeKvasac: pr.jeKvasac,
          kad: z.izvrsenoAt as Date,
          tank: T(z.tankId),
        });
      }
    }

    ukupnoPreparata += preparati.length;
    preparataNijeKvasac += preparati.filter((x) => !x.jeKvasac).length;

    console.log(`   preparati (${preparati.length}):`);
    if (preparati.length === 0) {
      console.log("     (nijedan izvrsen zadatak u prozoru)");
    } else {
      for (const pr of preparati) {
        console.log(
          `     ${dat(pr.kad)}  ${pr.tank.padEnd(5)} ${pr.naziv.padEnd(28)} ${
            pr.jeKvasac ? "[kvasac]" : ""
          }`
        );
      }
    }

    // --- SECER (ziva tablica UNIJA arhiva) --------------------------------
    const mjerenja = await citajMjerenja(prisma, {
      tankIds,
      od: s.pocetakAt,
      do: prozorDo,
    });
    const secer = mjerenja
      .filter((m) => m.vrijednosti.secer != null)
      .sort((a, b) => a.izmjerenoAt.getTime() - b.izmjerenoAt.getTime());

    console.log(`   secer (${secer.length} tocaka, ziva+arhiva):`);
    for (const m of secer) {
      console.log(
        `     ${dat(m.izmjerenoAt)}  ${(m.tankId ? T(m.tankId) : "—").padEnd(5)} ${String(
          m.vrijednosti.secer
        ).padStart(8)}   ${m.izvor === "ARHIVA" ? "arhiva" : m.jeRucno === false ? "pretok" : "rucno"}`
      );
    }

    // --- TEMPERATURA po danu, s rupama ------------------------------------
    console.log("   temperatura po danu:");
    for (const tankId of tankIds) {
      const raspon = rasponPoTanku.get(tankId)!;
      const redci = await prisma.$queryRaw<
        Array<{ dan: string; ocitanja: bigint | number; min: number; prosjek: number; max: number }>
      >`
        SELECT to_char("mjerenoU" AT TIME ZONE ${ZONA}, 'YYYY-MM-DD') AS dan,
               count(*) AS ocitanja,
               min("temperatura")::float8 AS min,
               avg("temperatura")::float8 AS prosjek,
               max("temperatura")::float8 AS max
        FROM "OcitanjeTemperature"
        WHERE "tankId" = ${tankId}
          AND "mjerenoU" >= ${raspon.od}
          AND "mjerenoU" <  ${raspon.do}
        GROUP BY 1 ORDER BY 1
      `;
      const poDanu = new Map(redci.map((r) => [r.dan, r]));

      const kraj = danKljuc(raspon.do);
      const hod = new Date(raspon.od);
      const linije: string[] = [];
      for (let k = 0; k < 400; k++) {
        const dan = danKljuc(hod);
        const r = poDanu.get(dan);
        ukupnoDana++;
        if (!r) {
          danaBezOcitanja++;
          linije.push(`       ${dan}  — BEZ OCITANJA —`);
        } else {
          const n = Number(r.ocitanja);
          linije.push(
            `       ${dan}  ${String(n).padStart(4)}${
              n < OCITANJA_PUN_DAN ? " !" : "  "
            } min ${r.min.toFixed(1)}  prosj ${r.prosjek.toFixed(1)}  max ${r.max.toFixed(1)}`
          );
        }
        if (dan >= kraj) break;
        hod.setDate(hod.getDate() + 1);
      }
      console.log(`     ${T(tankId)}:`);
      console.log(linije.join("\n"));
    }
  }

  // -------------------------------------------------------------------------
  console.log("\nInvarijante:");

  ok(
    prozori.some((p) => p.berbaIds.length > 0),
    "barem jedan prozor ima vino — inace bi svaki papir bio prazan"
  );

  // Ovo je brana protiv filtra po jeKvasac. Kad bi ga netko dodao na ispis,
  // ovaj broj bi pao na nulu i provjera bi pukla.
  ok(
    ukupnoPreparata === 0 || preparataNijeKvasac > 0,
    "ispis preparata sadrzi i one koji NISU kvasci (nema filtra po jeKvasac)",
    `ukupno ${ukupnoPreparata}, od toga ne-kvasaca ${preparataNijeKvasac}`
  );

  ok(
    ukupnoDana > 0,
    "temperatura je nabrojana po danima",
    `dana ${ukupnoDana}, bez ocitanja ${danaBezOcitanja}`
  );

  console.log(
    `\nDani temperature: ${ukupnoDana} ukupno, ${danaBezOcitanja} bez ijednog ocitanja ` +
      "(prikazuju se kao rupe, ne kao ravna crta)."
  );
  console.log(
    `Preparati na ispisu: ${ukupnoPreparata}, od toga ${preparataNijeKvasac} nisu kvasci ` +
      "— i svi idu na papir."
  );

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
