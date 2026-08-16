/**
 * SEED TESTNIH PODATAKA za nadzor temperature (Faza A - hardver jos nije spojen).
 *
 * Ne kreira nove tankove. Postojecima popunjava modbusAdresa/grana/zadanaTemp
 * (grana A = broj 1-20, B = 21-44; modbusAdresa = broj). Postojeca polja
 * (sorta, tip, kapacitet, ...) se NE diraju.
 *
 * Generira testna ocitanja za zadnjih 30 dana:
 *   - zadnja 24 h: gusto, svakih 10 min (~145 tocaka)
 *   - 24 h - 30 dana: rijetko, svakih 60 min (da seed ne traje predugo)
 * Temperatura oscilira +-0,4 C oko zadane. Posebni scenariji (unutar zadnjih 24 h):
 *   - Tank 27: ALARM - zadnja 2 h temp iznad (zadana + alarmPlus) + aktivan alarm PREVISOKA_TEMP
 *   - Tank 39: NEMA_VEZE - zadnje ocitanje prije 6 h + aktivan alarm NEMA_VEZE
 *
 * Idempotentno: u --apply prvo obrise SVA ocitanja i alarme (Faza A: sve su test),
 * pa ih ponovno generira. Tankove NE brise.
 *
 * Pokretanje:
 *   DRY-RUN (nista se ne pise, samo brojke):   npx tsx scripts/seed-temperature.ts
 *   STVARNI UPIS:                              npx tsx scripts/seed-temperature.ts --apply
 */
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");

const MIN = 60 * 1000;
const H = 60 * MIN;

const FINO_SATI = 24; // zadnja 24 h
const FINO_KORAK_MIN = 10; // svakih 10 min
const GRUBO_DANA = 30; // do 30 dana unatrag
const GRUBO_KORAK_MIN = 60; // svakih 60 min

const ALARM_TANK = 27;
const ALARM_SATI = 2; // zadnja 2 h iznad praga
const OFFLINE_TANK = 39;
const OFFLINE_SATI = 6; // zadnje ocitanje prije 6 h

// Zadana temp hladjenja po tanku: razne vrijednosti u rasponu 10-17 C.
function zadanaZa(broj: number): number {
  const base = Math.min(17, 10 + (broj % 8)); // 10..17
  return broj % 2 === 0 ? base : Math.max(10, base - 0.5);
}

function grana(broj: number): "A" | "B" {
  // Fizicka podjela u podrumu: A = 1-20, B = 21-44 (vidi migraciju 20260816_tankovi_i_grane).
  return broj <= 20 ? "A" : "B";
}

function r1(x: number): number {
  return Math.round(x * 10) / 10;
}

type OcitanjeInput = {
  tankId: string;
  temperatura: number;
  zadanaTemperatura: number;
  hladjenjeAktivno: boolean;
  status: string;
  mjerenoU: Date;
};

async function main() {
  const now = new Date();
  const tankovi = await prisma.tank.findMany({
    orderBy: { broj: "asc" },
    select: { id: true, broj: true },
  });

  console.log(`Tankova u bazi: ${tankovi.length}`);
  console.log(APPLY ? ">>> STVARNI UPIS (--apply)\n" : ">>> DRY-RUN (bez upisa; koristi --apply)\n");

  if (APPLY) {
    const delA = await prisma.tankAlarm.deleteMany({});
    const delO = await prisma.ocitanjeTemperature.deleteMany({});
    console.log(`Obrisano starih alarma: ${delA.count}, ocitanja: ${delO.count}\n`);
  }

  // Vremenske tocke (protekli sati unatrag od "now"), silazno gusto pa rijetko.
  const protekliSati: number[] = [];
  for (let m = 0; m <= FINO_SATI * 60; m += FINO_KORAK_MIN) protekliSati.push(m / 60);
  for (let m = FINO_SATI * 60 + GRUBO_KORAK_MIN; m <= GRUBO_DANA * 24 * 60; m += GRUBO_KORAK_MIN) {
    protekliSati.push(m / 60);
  }

  const ocitanja: OcitanjeInput[] = [];
  const alarmi: { tankId: string; tip: string; poruka: string; nastaoU: Date }[] = [];

  for (const t of tankovi) {
    const zadana = zadanaZa(t.broj);
    const g = grana(t.broj);

    if (APPLY) {
      // Samo nova nullable polja; ostalo se ne dira.
      await prisma.tank.update({
        where: { id: t.id },
        data: { modbusAdresa: t.broj, grana: g, zadanaTemp: zadana },
      });
    }

    const jeOffline = t.broj === OFFLINE_TANK;
    const jeAlarm = t.broj === ALARM_TANK;

    for (const sati of protekliSati) {
      // Offline tank: nema ocitanja u zadnjih OFFLINE_SATI.
      if (jeOffline && sati < OFFLINE_SATI) continue;

      const mjerenoU = new Date(now.getTime() - sati * H);
      let temperatura: number;
      let status = "OK";

      if (jeAlarm && sati <= ALARM_SATI) {
        // 4-5 C iznad zadane (jasno iznad zadana + alarmPlus=2.0)
        temperatura = r1(zadana + 4 + Math.random());
        status = "ALARM";
      } else {
        temperatura = r1(zadana + (Math.random() * 0.8 - 0.4));
      }

      ocitanja.push({
        tankId: t.id,
        temperatura,
        zadanaTemperatura: zadana,
        hladjenjeAktivno: temperatura > zadana,
        status,
        mjerenoU,
      });
    }

    if (jeAlarm) {
      alarmi.push({
        tankId: t.id,
        tip: "PREVISOKA_TEMP",
        poruka: `Temperatura iznad dozvoljenog praga (zadana ${zadana} C + 2.0 C).`,
        nastaoU: new Date(now.getTime() - ALARM_SATI * H),
      });
    }
    if (jeOffline) {
      alarmi.push({
        tankId: t.id,
        tip: "NEMA_VEZE",
        poruka: `Nema ocitanja vise od ${OFFLINE_SATI} h - provjeri sondu/vezu.`,
        nastaoU: new Date(now.getTime() - OFFLINE_SATI * H),
      });
    }
  }

  console.log(`Tocaka po tanku (osim offline): ${protekliSati.length}`);
  console.log(`Pripremljeno ocitanja: ${ocitanja.length}`);
  console.log(`Pripremljeno alarma:   ${alarmi.length} (Tank ${ALARM_TANK} PREVISOKA_TEMP, Tank ${OFFLINE_TANK} NEMA_VEZE)`);

  if (!APPLY) {
    console.log("\nDRY-RUN gotov. Nista nije zapisano. Pokreni s --apply za stvarni upis.");
    await prisma.$disconnect();
    return;
  }

  const CHUNK = 1000;
  let upisano = 0;
  for (let i = 0; i < ocitanja.length; i += CHUNK) {
    const res = await prisma.ocitanjeTemperature.createMany({ data: ocitanja.slice(i, i + CHUNK) });
    upisano += res.count;
  }
  const resA = await prisma.tankAlarm.createMany({ data: alarmi });

  console.log(`\nUpisano ocitanja: ${upisano}`);
  console.log(`Upisano alarma:   ${resA.count}`);
  console.log("SEED TEMPERATURE GOTOV.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("SEED GRESKA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
