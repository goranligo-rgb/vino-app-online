/**
 * KVASAC KROZ LANAC PORIJEKLA — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run kvasac:lanac
 *
 * SIGURNOST: iskljucivo SELECT. Nema transakcije, nema upisa, nema brisanja.
 * Sigurno je pokrenuti bilo kad, i tijekom berbe.
 *
 * STO ODGOVARA: "kojim je kvascem fermentiralo vino koje je DANAS u tanku",
 * a ne "koji je kvasac netko dodao u ovaj tank". To dvoje se razilazi cim
 * vino jednom pretoci: `Radnja` ostaje na izvornom tanku, vino ode dalje.
 * Odgovor se racuna iz knjige kretanja, kroz `lib/vino-lanac.ts`.
 *
 * Zasto knjiga, a ne `BlendIzvor`: pokazivaci blenda su u zatecenoj bazi
 * mjestimicno krivi i normalizirani na postotke, dok knjiga nosi litre i samo
 * se dopisuje.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  odigrajLanac,
  bezZapisa,
  upostotcima,
  type Kretanje,
  type RadnjaULancu,
} from "../lib/vino-lanac";

function datum(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function padL(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

async function main() {
  const [tankovi, kretanjaRedci, radnjeRedci] = await Promise.all([
    prisma.tank.findMany({
      select: {
        id: true,
        broj: true,
        nazivVina: true,
        sorta: true,
        kolicinaVinaUTanku: true,
      },
      orderBy: { broj: "asc" },
    }),
    prisma.berbaKretanje.findMany({
      select: {
        id: true,
        izTankId: true,
        uTankId: true,
        litre: true,
        vrsta: true,
        dogodenoAt: true,
        createdAt: true,
        pretokId: true,
        zadatakId: true,
        izlazVinaId: true,
        punjenjeId: true,
      },
      orderBy: { dogodenoAt: "asc" },
    }),
    // Sve radnje ulaze u lanac, ne samo kvasci: isti racun sluzi backfillu i
    // prikazu dodataka. Filtar po kvascu ide tek na ispisu.
    prisma.radnja.findMany({
      select: {
        id: true,
        tankId: true,
        createdAt: true,
        vrsta: true,
        opis: true,
        preparat: { select: { naziv: true, jeKvasac: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const kretanja: Kretanje[] = kretanjaRedci;
  const radnje: RadnjaULancu[] = radnjeRedci.map((r) => ({
    id: r.id,
    tankId: r.tankId,
    createdAt: r.createdAt,
  }));

  const poRadnji = new Map(radnjeRedci.map((r) => [r.id, r]));
  const poTankId = new Map(tankovi.map((t) => [t.id, t]));

  const { stanje } = odigrajLanac(kretanja, radnje);

  const puni = tankovi.filter((t) => (t.kolicinaVinaUTanku ?? 0) > 0);

  console.log("");
  console.log(
    "KVASAC KROZ LANAC PORIJEKLA — " +
      `${puni.length} punih tankova, ${new Date().toLocaleDateString("hr-HR")}`
  );
  console.log(
    "Udio = koliki dio danasnjeg volumena tanka je fermentirao s tim kvascem."
  );
  console.log("");
  console.log(
    pad("TANK", 6) +
      pad("VINO", 26) +
      pad("KVASAC", 26) +
      pad("IZ TANKA", 10) +
      pad("DATUM", 12) +
      padL("UDIO", 6)
  );
  console.log("-".repeat(86));

  let bezIjednog = 0;

  for (const t of puni) {
    const s = stanje.get(t.id);

    const kvasci = (s?.udjeli ?? [])
      .map((u) => ({ u, r: poRadnji.get(u.radnjaId)! }))
      .filter(
        (x) =>
          x.r && x.r.vrsta === "DODAVANJE" && x.r.preparat?.jeKvasac === true
      )
      .sort((a, b) => b.u.udio - a.u.udio);

    const oznakaTanka = `T${t.broj}`;
    const vino = t.nazivVina ?? t.sorta ?? "—";

    if (kvasci.length === 0) {
      bezIjednog++;
      console.log(
        pad(oznakaTanka, 6) +
          pad(vino, 26) +
          pad("— bez zapisa o kvascu —", 26) +
          pad("—", 10) +
          pad("—", 12) +
          padL("100 %", 6)
      );
      continue;
    }

    kvasci.forEach((x, i) => {
      const izvorni = poTankId.get(x.u.izvorniTankId);
      console.log(
        pad(i === 0 ? oznakaTanka : "", 6) +
          pad(i === 0 ? vino : "", 26) +
          pad(x.r.preparat?.naziv ?? x.r.opis ?? "—", 26) +
          pad(izvorni ? `T${izvorni.broj}` : "?", 10) +
          pad(datum(x.r.createdAt), 12) +
          padL(`${upostotcima(x.u.udio)} %`, 6)
      );
    });

    const rupa = bezZapisa(kvasci.map((x) => x.u));

    if (Math.round(rupa) > 0) {
      console.log(
        pad("", 6) +
          pad("", 26) +
          pad("bez zapisa", 26) +
          pad("—", 10) +
          pad("—", 12) +
          padL(`${Math.round(rupa)} %`, 6)
      );
    }

    console.log("");
  }

  console.log("-".repeat(86));
  console.log(
    `Tankova bez ijednog zapisa o kvascu: ${bezIjednog} / ${puni.length}`
  );

  const ukupnoKvasaca = radnjeRedci.filter(
    (r) => r.vrsta === "DODAVANJE" && r.preparat?.jeKvasac === true
  ).length;

  console.log(`Radnji s kvascem u bazi: ${ukupnoKvasaca}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
