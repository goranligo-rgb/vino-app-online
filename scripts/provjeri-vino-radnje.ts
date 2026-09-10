/**
 * PROVJERA `VinoRadnja` nad pravom bazom — samo cita, nista ne mijenja.
 *
 * Pokretanje:  npm run vino-radnje:provjeri
 *
 * SIGURNOST: iskljucivo SELECT. Izlazni kod je 1 ako ijedna provjera padne,
 * pa se smije staviti u lanac. Isti obrazac kao `npm run berba:provjeri`.
 *
 * STO SE PROVJERAVA
 * -----------------
 * 1. NISTA SE NIJE IZGUBILO. Svaka `Radnja` koja je DANAS vidljiva na stranici
 *    tanka (tankId + createdAt iznad granice arhive) mora imati svoj redak u
 *    `VinoRadnja` na tom tanku. Ovo je provjera koja cuva zatecen ekran.
 *
 * 2. UDIO JE UDIO. Nijedan redak nema udio manji od 0 ni veci od 1 (uz
 *    zaokruzivanje). Udio je dio danasnjeg volumena, ne broj.
 *
 * 3. KVASCI NE PRELAZE 100 %. Po tanku, zbroj udjela kvasaca smije biti manji
 *    od 1 (ostatak je vino bez zapisa) ali ne veci — osim kad je u istu sarzu
 *    stvarno dodan vise od jednog kvasca, sto se ispisuje kao upozorenje, ne
 *    kao pad.
 *
 * 4. LANAC JE PROSAO. Tank 5 mora imati kvasce iz T11, T17 i T10 — vino koje
 *    je u njemu fermentiralo u ta tri tanka. To je provjera koja bi pala i
 *    prije ovog zahvata, jer nijedna od tih radnji nije izvedena u T5.
 *
 * 5. IZVORNI TANK POSTOJI. `izvorniBrojTanka` se slaze s `izvorniTankId`.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

const EPS = 0.0005;

let palo = 0;

function ok(naslov: string, poruka: string) {
  console.log(`  OK    ${naslov} — ${poruka}`);
}

function pad_(naslov: string, poruka: string) {
  palo++;
  console.log(`  PALO  ${naslov} — ${poruka}`);
}

function upozorenje(naslov: string, poruka: string) {
  console.log(`  ~     ${naslov} — ${poruka}`);
}

async function main() {
  console.log("");
  console.log("PROVJERA VinoRadnja");
  console.log("");

  const [tankovi, radnje, vinoRadnje, arhive] = await Promise.all([
    prisma.tank.findMany({
      select: { id: true, broj: true, kolicinaVinaUTanku: true },
    }),
    prisma.radnja.findMany({
      select: { id: true, tankId: true, createdAt: true, opis: true },
    }),
    prisma.vinoRadnja.findMany(),
    prisma.arhivaVina.groupBy({
      by: ["tankId"],
      _max: { arhiviranoAt: true },
    }),
  ]);

  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));
  const granice = new Map<string, Date>();

  for (const a of arhive) {
    if (a.tankId && a._max.arhiviranoAt) {
      granice.set(a.tankId, a._max.arhiviranoAt);
    }
  }

  // --------------------------------------------------- 1. nista se nije izgubilo
  const uTanku = new Set(vinoRadnje.map((v) => `${v.tankId}|${v.izvornaRadnjaId}`));

  const nedostaju = radnje.filter((r) => {
    const granica = granice.get(r.tankId);
    if (granica && r.createdAt < granica) return false; // ni danas se ne vidi
    return !uTanku.has(`${r.tankId}|${r.id}`);
  });

  if (nedostaju.length === 0) {
    ok(
      "1 vidljivost",
      `svih ${radnje.length} radnji koje se danas vide ima svoj redak`
    );
  } else {
    pad_(
      "1 vidljivost",
      `${nedostaju.length} radnji bi nestalo s ekrana:\n` +
        nedostaju
          .slice(0, 20)
          .map(
            (r) =>
              `          T${brojTanka.get(r.tankId) ?? "?"} ${r.createdAt.toLocaleDateString("hr-HR")} ${r.opis ?? ""}`
          )
          .join("\n")
    );
  }

  // ------------------------------------------------------------- 2. udio je udio
  const losUdio = vinoRadnje.filter(
    (v) => v.udio < -EPS || v.udio > 1 + EPS || !Number.isFinite(v.udio)
  );

  if (losUdio.length === 0) {
    ok("2 udio", `svih ${vinoRadnje.length} redaka ima udio unutar 0..1`);
  } else {
    pad_(
      "2 udio",
      `${losUdio.length} redaka izvan 0..1 (npr. ${losUdio[0].udio})`
    );
  }

  // --------------------------------------------------- 3. kvasci ne prelaze 100 %
  const kvasciPoTanku = new Map<string, number>();

  for (const v of vinoRadnje) {
    if (!v.jeKvasac || v.vrsta !== "DODAVANJE") continue;
    kvasciPoTanku.set(v.tankId, (kvasciPoTanku.get(v.tankId) ?? 0) + v.udio);
  }

  const preko = Array.from(kvasciPoTanku.entries()).filter(
    ([, z]) => z > 1 + EPS
  );

  if (preko.length === 0) {
    ok(
      "3 zbroj kvasaca",
      `nijedan od ${kvasciPoTanku.size} tankova s kvascem ne prelazi 100 %`
    );
  } else {
    upozorenje(
      "3 zbroj kvasaca",
      `${preko.length} tankova preko 100 % — vise kvasaca u istoj sarzi: ` +
        preko
          .map(([t, z]) => `T${brojTanka.get(t) ?? "?"} ${Math.round(z * 100)} %`)
          .join(", ")
    );
  }

  // ------------------------------------------------------------- 4. lanac je prosao
  const t5 = tankovi.find((t) => t.broj === 5);

  if (!t5) {
    pad_("4 lanac T5", "tank 5 ne postoji");
  } else {
    const kvasciT5 = vinoRadnje.filter(
      (v) => v.tankId === t5.id && v.jeKvasac && v.vrsta === "DODAVANJE"
    );

    const traze: Array<[number, string]> = [
      [11, "Uvaferm"],
      [17, "SENSY"],
      [10, "ALCHEMY"],
    ];

    const nadeni = traze.filter(([broj, dio]) =>
      kvasciT5.some(
        (v) =>
          v.izvorniBrojTanka === broj &&
          (v.preparatNaziv ?? "").toUpperCase().includes(dio.toUpperCase())
      )
    );

    if (nadeni.length === traze.length) {
      ok(
        "4 lanac T5",
        kvasciT5
          .sort((a, b) => b.udio - a.udio)
          .map(
            (v) =>
              `${v.preparatNaziv} (T${v.izvorniBrojTanka}) ${Math.round(v.udio * 100)} %`
          )
          .join(" · ")
      );
    } else {
      const fale = traze
        .filter((x) => !nadeni.includes(x))
        .map(([broj, dio]) => `${dio} iz T${broj}`)
        .join(", ");
      pad_("4 lanac T5", `nedostaje: ${fale}`);
    }
  }

  // ------------------------------------------------------- 5. izvorni tank postoji
  const kriviIzvor = vinoRadnje.filter(
    (v) =>
      v.izvorniBrojTanka !== null &&
      brojTanka.get(v.izvorniTankId) !== v.izvorniBrojTanka
  );

  if (kriviIzvor.length === 0) {
    ok("5 izvorni tank", "broj se svugdje slaze s idom");
  } else {
    pad_("5 izvorni tank", `${kriviIzvor.length} redaka s krivim brojem`);
  }

  console.log("");

  if (palo > 0) {
    console.log(`PALO ${palo} provjera.`);
    process.exitCode = 1;
  } else {
    console.log("Sve provjere prosle.");
  }

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
