/**
 * CLEANUP testnih podataka nadzora temperature.
 *
 * Brise SAMO testna ocitanja (OcitanjeTemperature) i alarme (TankAlarm).
 * Tankove NE dira - modbusAdresa/grana/zadanaTemp na Tank ostaju netaknuti,
 * kao ni bilo koje drugo produkcijsko polje.
 *
 * Pokretanje:
 *   DRY-RUN (samo brojke, bez brisanja):   npx tsx scripts/cleanup-temperature.ts
 *   STVARNO BRISANJE:                      npx tsx scripts/cleanup-temperature.ts --apply
 */
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const brojOcitanja = await prisma.ocitanjeTemperature.count();
  const brojAlarma = await prisma.tankAlarm.count();

  console.log(`Ocitanja u bazi: ${brojOcitanja}`);
  console.log(`Alarma u bazi:   ${brojAlarma}`);

  if (!APPLY) {
    console.log("\nDRY-RUN: nista nije obrisano. Pokreni s --apply za stvarno brisanje.");
    await prisma.$disconnect();
    return;
  }

  const delO = await prisma.ocitanjeTemperature.deleteMany({});
  const delA = await prisma.tankAlarm.deleteMany({});

  console.log(`\nObrisano ocitanja: ${delO.count}`);
  console.log(`Obrisano alarma:   ${delA.count}`);
  console.log("Tankovi NISU dirani.");
  console.log("CLEANUP GOTOV.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("CLEANUP GRESKA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
