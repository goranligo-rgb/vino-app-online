/**
 * PROVJERA VEZE MJERENJE → BERBA nad pravom bazom — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run mjerenja:provjeri
 *
 * SIGURNOST: iskljucivo SELECT. Nema transakcije, nema upisa, nema brisanja.
 * Sigurno je pokrenuti bilo kad, i tijekom berbe. Isti obrazac kao
 * scripts/provjeri-berbu.ts.
 *
 * STO OVO JEST: mjera koliko se mjerenja uopce dade vezati na vino, i popis
 * onih koja se ne dadu — POIMENCE, da se vidi o cemu je rijec umjesto da
 * nestanu u postotku.
 *
 * STO OVO NIJE: provjera da je veza TOCNA. Da je mjerenje od 26.08. stvarno
 * bilo na tom vinu ne moze potvrditi nijedan zapis — to zna samo covjek koji
 * je mjerio. Provjerava se ono sto se provjeriti moze: da je racun sam sa
 * sobom u skladu, da unija ne broji dvaput, i da se raspodjela ne mijenja
 * ispod ruke.
 *
 * Izlazni kod je 1 ako ijedna invarijanta padne.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { mjerenjaSBerbom, dvojnika } from "../lib/mjerenja-berba";

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

function popis(redci: string[], najvise = 40): string {
  const prikaz = redci.slice(0, najvise);
  const ostatak = redci.length - prikaz.length;
  return prikaz.join("\n         ") + (ostatak > 0 ? `\n         … jos ${ostatak}` : "");
}

function dat(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

async function main() {
  console.log("Provjera veze mjerenje → berba (samo citanje).\n");

  const kretanja = await prisma.berbaKretanje.count();
  if (kretanja === 0) {
    console.log("Knjiga kretanja je prazna — nema se na sto vezati. Nista za provjeriti.\n");
    return;
  }

  // Broj tanka uz id, da ispis bude citljiv.
  const tankovi = new Map(
    (await prisma.tank.findMany({ select: { id: true, broj: true } })).map((t) => [
      t.id,
      t.broj,
    ])
  );
  const tank = (id: string | null) => (id ? `T${tankovi.get(id) ?? "?"}` : "(bez tanka)");

  const svi = await mjerenjaSBerbom(prisma);

  const zivih = svi.filter((m) => m.mjerenje.izvor === "ZIVO").length;
  const arhiviranih = svi.length - zivih;

  console.log(`Mjerenja: ${svi.length} ukupno — ${zivih} zivih, ${arhiviranih} arhiviranih.`);
  console.log(`Knjiga: ${kretanja} kretanja.\n`);

  // -------------------------------------------------------------------------
  // 1) Raspodjela — na koliko berbi pogadja jedno mjerenje.
  // -------------------------------------------------------------------------
  console.log("Raspodjela (na koliko berbi pogadja jedno mjerenje):");

  const poBroju = new Map<number, { zivo: number; arhiva: number }>();
  for (const m of svi) {
    const n = m.berbe.length;
    const red = poBroju.get(n) ?? { zivo: 0, arhiva: 0 };
    if (m.mjerenje.izvor === "ZIVO") red.zivo++;
    else red.arhiva++;
    poBroju.set(n, red);
  }

  console.log("  berbi   zivo   arhiva   ukupno");
  for (const n of [...poBroju.keys()].sort((a, b) => a - b)) {
    const r = poBroju.get(n)!;
    const oznaka = n === 0 ? "  ← ne veze se" : n > 1 ? "  ← mjesavina" : "";
    console.log(
      `  ${String(n).padStart(5)}   ${String(r.zivo).padStart(4)}   ${String(
        r.arhiva
      ).padStart(6)}   ${String(r.zivo + r.arhiva).padStart(6)}${oznaka}`
    );
  }

  const bezBerbe = svi.filter((m) => m.berbe.length === 0);
  const jedna = svi.filter((m) => m.berbe.length === 1);
  const mjesavine = svi.filter((m) => m.berbe.length > 1);

  console.log(
    `\n  jedna berba: ${jedna.length}   mjesavina: ${mjesavine.length}   bez berbe: ${bezBerbe.length}`
  );

  // -------------------------------------------------------------------------
  // 2) Sto se NE veze — poimence.
  //
  // Ovo nije greska koja se popravlja. To je vino koje je u podrumu bilo prije
  // nego ga knjiga pokriva. Ispisuje se da se vidi RASPON i da se ne pomijesa
  // s pravim propustom: mjerenje iz kolovoza koje se ne veze bilo bi sumnjivo,
  // ono iz svibnja nije.
  // -------------------------------------------------------------------------
  console.log("\nMjerenja bez berbe (poimence):");

  if (bezBerbe.length === 0) {
    console.log("  nema — svako mjerenje veze se na barem jednu berbu.");
  } else {
    const redci = bezBerbe
      .slice()
      .sort((a, b) => a.mjerenje.izmjerenoAt.getTime() - b.mjerenje.izmjerenoAt.getTime())
      .map((m) => {
        const v = m.mjerenje.vrijednosti;
        const ima = Object.entries(v)
          .filter(([, x]) => x != null)
          .map(([k, x]) => `${k}=${x}`)
          .join(" ");
        const izvor = m.mjerenje.izvor === "ARHIVA" ? "arhiva" : "zivo  ";
        return `${dat(m.mjerenje.izmjerenoAt)}  ${izvor}  ${tank(
          m.mjerenje.tankId
        ).padEnd(5)} ${ima || "(bez vrijednosti)"}`;
      });
    console.log("         " + popis(redci));

    const mjeseci = new Map<string, number>();
    for (const m of bezBerbe) {
      const k = m.mjerenje.izmjerenoAt.toISOString().slice(0, 7);
      mjeseci.set(k, (mjeseci.get(k) ?? 0) + 1);
    }
    console.log(
      "\n  po mjesecu: " +
        [...mjeseci.entries()]
          .sort()
          .map(([k, n]) => `${k}=${n}`)
          .join("  ")
    );
  }

  // -------------------------------------------------------------------------
  // 3) Invarijante.
  // -------------------------------------------------------------------------
  console.log("\nInvarijante:");

  const dvojnih = await dvojnika(prisma);
  ok(
    dvojnih === 0,
    "unija ne broji isto mjerenje dvaput (arhivirano bez zivog izvora)",
    dvojnih > 0
      ? `${dvojnih} arhiviranih mjerenja ima izvor koji je JOS ZIV u Mjerenje — ` +
          "citajMjerenja() ih vraca dvaput. Vidi app/api/arhiva/route.ts:123, " +
          "jedini kopirac bez brisanja."
      : ""
  );

  const negativan = svi.filter((m) => m.berbe.some((b) => b.ml <= 0));
  ok(
    negativan.length === 0,
    "nijedna pogodjena berba nema stanje <= 0",
    negativan.length > 0
      ? popis(negativan.map((m) => `${dat(m.mjerenje.izmjerenoAt)} ${tank(m.mjerenje.tankId)}`))
      : ""
  );

  const losUdio = svi.filter((m) => {
    if (m.berbe.length === 0) return false;
    const zbroj = m.berbe.reduce((s, b) => s + b.udio, 0);
    return Math.abs(zbroj - 100) > 0.5;
  });
  ok(
    losUdio.length === 0,
    "udjeli po mjerenju zbrajaju se na 100 % (± 0,5)",
    losUdio.length > 0
      ? popis(
          losUdio.map(
            (m) =>
              `${dat(m.mjerenje.izmjerenoAt)} ${tank(m.mjerenje.tankId)} zbroj=${m.berbe
                .reduce((s, b) => s + b.udio, 0)
                .toFixed(2)}`
          )
        )
      : ""
  );

  const bezTanka = svi.filter((m) => !m.mjerenje.tankId);
  ok(
    bezTanka.length === 0,
    "svako mjerenje ima tank",
    bezTanka.length > 0
      ? `${bezTanka.length} redaka bez tankId — svi iz arhive (ArhivaVinaMjerenje.tankId je nullable)`
      : ""
  );

  // Zapis berbe je meko obrisan, a vino po knjizi jos stoji u tanku.
  // Ne obara provjeru — isto pravilo koje provjeri-berbu.ts vec primjenjuje —
  // ali se mora vidjeti.
  const naObrisanoj = svi.filter((m) => m.berbe.some((b) => b.obrisano));
  if (naObrisanoj.length > 0) {
    console.log(
      `\n  napomena: ${naObrisanoj.length} mjerenja veze se na MEKO OBRISAN zapis berbe.\n` +
        "            Zapis je maknut kao pogresan unos, a vino je po knjizi ostalo."
    );
  }

  // -------------------------------------------------------------------------
  // 4) Sto ispis fermentacije dobiva — secer po berbi.
  // -------------------------------------------------------------------------
  const saSecerom = svi.filter((m) => m.mjerenje.vrijednosti.secer != null);
  const secerVezan = saSecerom.filter((m) => m.berbe.length > 0);

  console.log("\nSecer (ono zbog cega je ovo krenulo):");
  console.log(`  mjerenja sa secerom: ${saSecerom.length}`);
  console.log(
    `  od toga vezano na barem jednu berbu: ${secerVezan.length}` +
      (saSecerom.length > 0
        ? `  (${Math.round((secerVezan.length / saSecerom.length) * 100)} %)`
        : "")
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
