/**
 * BACKFILL `VinoRadnja` iz zatecenih `Radnja` zapisa.
 *
 * Pokretanje:
 *   npm run vino-radnje:backfill            -> DRY-RUN, nista se ne pise
 *   npm run vino-radnje:backfill -- --upisi -> upisuje
 *
 * SIGURNOST
 * ---------
 * Zadano je dry-run. Upis ide u jednoj transakciji i pise ISKLJUCIVO u
 * `VinoRadnja`: nijedan `Radnja`, `Tank`, `BerbaKretanje` ni `BlendIzvor`
 * redak se ne cita radi izmjene, ne mijenja i ne brise. Ponovno pokretanje je
 * idempotentno — tablica se prije upisa isprazni pa napuni iz istog racuna.
 *
 * KAKO SE PRIPISUJE
 * -----------------
 * Povijest se odigrava nad knjigom kretanja (lib/vino-lanac.ts): svaka radnja
 * krene s udjelom 1 u svom tanku i putuje s vinom, razrjedujuci se pri svakom
 * ulazu. Ono sto na kraju stoji u tanku je ono sto se ovdje upisuje.
 *
 * RADNJA KOJA NIJE PRIPISIVA je ona izvedena nad tankom za koji knjiga u tom
 * trenutku nije znala nijednu litru. Nema vina kojem bi se pripisala, pa ne
 * moze ni putovati. Takva radnja svejedno dobiva redak NA SVOM TANKU (inace bi
 * nestala s ekrana cim citaci predju na novu tablicu), ali bez lanca — i
 * ispisuje se poimence, jer je to rupa u zapisima, a ne racun.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  odigrajLanac,
  type Kretanje,
  type RadnjaULancu,
} from "../lib/vino-lanac";

const UPISI = process.argv.includes("--upisi");

function datum(d: Date): string {
  return d.toLocaleDateString("hr-HR");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

async function main() {
  const [tankovi, kretanjaRedci, radnjeRedci, vecUpisano, arhive] =
    await Promise.all([
      prisma.tank.findMany({ select: { id: true, broj: true } }),
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
      prisma.radnja.findMany({
        select: {
          id: true,
          tankId: true,
          createdAt: true,
          vrsta: true,
          opis: true,
          napomena: true,
          kolicina: true,
          preparatId: true,
          preparat: { select: { naziv: true, jeKvasac: true } },
          jedinica: { select: { naziv: true } },
          korisnik: { select: { ime: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.vinoRadnja.count(),
      // Granica arhive po tanku — ista crta koju stranica tanka koristi da
      // radnje prethodnog vina ne curе u prikaz.
      prisma.arhivaVina.groupBy({
        by: ["tankId"],
        _max: { arhiviranoAt: true },
      }),
    ]);

  const granice = new Map<string, Date>();

  for (const a of arhive) {
    if (a.tankId && a._max.arhiviranoAt) {
      granice.set(a.tankId, a._max.arhiviranoAt);
    }
  }

  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));
  const poRadnji = new Map(radnjeRedci.map((r) => [r.id, r]));

  const kretanja: Kretanje[] = kretanjaRedci;
  const radnje: RadnjaULancu[] = radnjeRedci.map((r) => ({
    id: r.id,
    tankId: r.tankId,
    createdAt: r.createdAt,
  }));

  const { stanje, biljeske } = odigrajLanac(kretanja, radnje);

  const nepripisive = biljeske.filter((b) => !b.pripisiva);

  // ------------------------------------------------------------------ PRIJE
  console.log("");
  console.log("BACKFILL VinoRadnja — " + (UPISI ? "UPIS" : "DRY-RUN"));
  console.log("");
  console.log("PRIJE");
  console.log(`  Radnja redaka:      ${radnjeRedci.length}`);
  console.log(`  VinoRadnja redaka:  ${vecUpisano}`);
  console.log(`  BerbaKretanje:      ${kretanjaRedci.length}`);
  console.log("");
  console.log(
    `  pripisivih radnji:  ${radnjeRedci.length - nepripisive.length}`,
  );
  console.log(`  nepripisivih:       ${nepripisive.length}`);
  console.log("");

  if (nepripisive.length > 0) {
    console.log(
      "NEPRIPISIVE RADNJE — knjiga za taj tank tada nije znala nista.",
    );
    console.log("Dobivaju redak na svom tanku, bez lanca.");
    console.log("");
    console.log(
      "  " +
        pad("TANK", 6) +
        pad("DATUM", 12) +
        pad("VRSTA", 12) +
        pad("OPIS", 42),
    );

    for (const b of nepripisive) {
      const r = poRadnji.get(b.radnjaId)!;
      console.log(
        "  " +
          pad(`T${brojTanka.get(b.tankId) ?? "?"}`, 6) +
          pad(datum(r.createdAt), 12) +
          pad(r.vrsta, 12) +
          pad(r.opis ?? "—", 42),
      );
    }

    console.log("");
  }

  // ----------------------------------------------------------------- PLAN
  type Redak = {
    tankId: string;
    izvornaRadnjaId: string;
    izvorniTankId: string;
    izvorniBrojTanka: number | null;
    preparatId: string | null;
    preparatNaziv: string | null;
    jedinicaNaziv: string | null;
    korisnikIme: string | null;
    vrsta: (typeof radnjeRedci)[number]["vrsta"];
    opis: string | null;
    napomena: string | null;
    kolicina: number | null;
    jeKvasac: boolean;
    udio: number;
    dogodenoAt: Date;
  };

  const redci: Redak[] = [];
  const vidljive = new Set<string>();

  const napravi = (
    tankId: string,
    radnjaId: string,
    izvorniTankId: string,
    udio: number,
  ): Redak | null => {
    const r = poRadnji.get(radnjaId);
    if (!r) return null;

    return {
      tankId,
      izvornaRadnjaId: r.id,
      izvorniTankId,
      izvorniBrojTanka: brojTanka.get(izvorniTankId) ?? null,
      preparatId: r.preparatId,
      preparatNaziv: r.preparat?.naziv ?? null,
      jedinicaNaziv: r.jedinica?.naziv ?? null,
      korisnikIme: r.korisnik?.ime ?? null,
      vrsta: r.vrsta,
      opis: r.opis,
      napomena: r.napomena,
      kolicina: r.kolicina,
      jeKvasac: r.preparat?.jeKvasac ?? false,
      udio,
      dogodenoAt: r.createdAt,
    };
  };

  for (const s of stanje.values()) {
    for (const u of s.udjeli) {
      const redak = napravi(s.tankId, u.radnjaId, u.izvorniTankId, u.udio);
      if (!redak) continue;
      redci.push(redak);
      vidljive.add(u.radnjaId);
    }
  }

  // ZADRZANI REDCI, udio 0.
  //
  // Lanac nekim radnjama ne ostavi trag ni u jednom tanku: vino koje su
  // opisivale je otislo iz podruma (prodano, natoceno u boce) ili je bilo
  // pogresno upisano pa ispravljeno. Takva radnja je danas i dalje VIDLJIVA na
  // svom tanku — stranica tanka je cita po `Radnja.tankId`, odrezano granicom
  // arhive — pa bi prelaskom citaca na novu tablicu nestala s ekrana.
  //
  // Zato dobiva redak na SVOM tanku s udjelom 0: "ovdje se to dogodilo, ali
  // nista od danasnjeg vina to ne nosi". Prikaz ga smije nabrojati u povijesti,
  // a iz postotaka kvasaca ispada sam od sebe.
  //
  // Granica arhive je ista crta koju stranica tanka vec koristi: ispred nje je
  // u tanku bilo drugo vino i ondje se ne prikazuje ni danas.
  const zadrzani: string[] = [];

  for (const r of radnjeRedci) {
    if (vidljive.has(r.id)) continue;

    const granica = granice.get(r.tankId) ?? null;
    if (granica && r.createdAt < granica) continue; // ni danas se ne vidi

    const redak = napravi(r.tankId, r.id, r.tankId, 0);
    if (!redak) continue;
    redci.push(redak);
    vidljive.add(r.id);
    zadrzani.push(r.id);
  }

  const izgubljene = radnjeRedci.filter((r) => !vidljive.has(r.id));

  // ---------------------------------------------------------------- POSLIJE
  const poTanku = new Map<string, number>();
  for (const r of redci) {
    poTanku.set(r.tankId, (poTanku.get(r.tankId) ?? 0) + 1);
  }

  console.log("POSLIJE (izracunato)");
  console.log(`  VinoRadnja redaka:  ${redci.length}`);
  console.log(`  tankova s redcima:  ${poTanku.size}`);
  console.log(`  radnji vidljivih:   ${vidljive.size} / ${radnjeRedci.length}`);
  console.log(`  radnji cije je vino otislo iz podruma: ${izgubljene.length}`);
  console.log("");

  if (izgubljene.length > 0) {
    console.log(
      "RADNJE BEZ REDKA — vino koje su opisivale vise nije ni u jednom tanku.",
    );
    console.log(
      "Provjera 'sto je danas vidljivo mora ostati vidljivo' gleda TANKOVE S VINOM:",
    );
    console.log("prazan tank nema sto pokazati ni danas.");
    console.log("");

    for (const r of izgubljene) {
      const uTanku = stanje.get(r.tankId);
      console.log(
        "  " +
          pad(`T${brojTanka.get(r.tankId) ?? "?"}`, 6) +
          pad(datum(r.createdAt), 12) +
          pad(r.vrsta, 12) +
          pad(r.opis ?? "—", 34) +
          (uTanku && uTanku.litre > 0
            ? `TANK IMA ${uTanku.litre.toFixed(0)} L — PROVJERI`
            : "tank prazan"),
      );
    }

    console.log("");
  }

  console.log("REDAKA PO TANKU");
  const poredani = Array.from(poTanku.entries()).sort(
    (a, b) => (brojTanka.get(a[0]) ?? 0) - (brojTanka.get(b[0]) ?? 0),
  );

  for (const [tankId, n] of poredani) {
    const s = stanje.get(tankId);
    console.log(
      `  ${pad(`T${brojTanka.get(tankId) ?? "?"}`, 6)}${pad(String(n), 5)} redaka` +
        (s ? `   ${s.litre.toFixed(0)} L po knjizi` : ""),
    );
  }

  console.log("");

  if (!UPISI) {
    console.log("DRY-RUN — nista nije upisano. Za upis: -- --upisi");
    console.log("");
    return;
  }

  // ------------------------------------------------------------------ UPIS
  const upisano = await prisma.$transaction(async (tx) => {
    // Idempotentno: tablica je izvedena, pa se smije prepisati u cijelosti.
    await tx.vinoRadnja.deleteMany({});

    const rez = await tx.vinoRadnja.createMany({ data: redci });
    return rez.count;
  });

  const nakon = await prisma.vinoRadnja.count();

  console.log(`UPISANO: ${upisano} redaka, u tablici ih je ${nakon}.`);

  if (nakon !== redci.length) {
    console.error(`PUKLO: izracunato ${redci.length}, u tablici ${nakon}.`);
    process.exitCode = 1;
  }

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
