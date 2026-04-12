import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL nije postavljen u .env");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ===== USER =====
  await prisma.user.upsert({
  where: { email: "admin@vino.local" },
  update: {
    username: "admin",
    password: "123456",
    active: true,
  },
  create: {
    ime: "Admin",
    username: "admin",
    email: "admin@vino.local",
    password: "123456",
    role: Role.ADMIN,
    active: true,
  },
});

  console.log("User OK");

  // ===== JEDINICE =====
  const jedinice = ["mg", "g", "dkg", "kg", "ml", "dl", "l", "hl"];

  for (const naziv of jedinice) {
    const postoji = await prisma.unit.findFirst({
      where: { naziv },
    });

    if (!postoji) {
      await prisma.unit.create({
        data: { naziv },
      });
    }
  }

  console.log("Jedinice OK");

  const unitMl = await prisma.unit.findFirst({ where: { naziv: "ml" } });
  const unitDl = await prisma.unit.findFirst({ where: { naziv: "dl" } });
  const unitG = await prisma.unit.findFirst({ where: { naziv: "g" } });

  if (!unitMl || !unitDl || !unitG) {
    throw new Error("Nisu pronađene osnovne jedinice ml/dl/g nakon seeda.");
  }

  // ===== PREPARATI =====
  const sviPreparati = [
    { naziv: "Bentonit", dozaOd: 200, dozaDo: 200, unitId: unitG.id },
    { naziv: "Klarol", dozaOd: 10, dozaDo: 40, unitId: unitMl.id },
    { naziv: "Aktivni ugljen", dozaOd: 100, dozaDo: 100, unitId: unitG.id },
    { naziv: "Gelatina", dozaOd: 5, dozaDo: 15, unitId: unitMl.id },
    { naziv: "PVPP", dozaOd: 10, dozaDo: 50, unitId: unitG.id },

    { naziv: "UVAFERM 228", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "UVAFERM CEG", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "AFFINITY", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "ALCHEMY II", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "LALVIN CY3079", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "LALVIN EC-1118", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "ANCHOR OENOLOGY LEGACY", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "LALVIN V1116", dozaOd: 20, dozaDo: 20, unitId: unitG.id },

    { naziv: "FERMAID E", dozaOd: 10, dozaDo: 10, unitId: unitG.id },
    { naziv: "OPTI-MUM WHITE", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "OPTI-MUM RED", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "GO FERM", dozaOd: 30, dozaDo: 30, unitId: unitG.id },

    { naziv: "SIHAFERM ELEMENT", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "SIHA PROFERM FIT", dozaOd: 30, dozaDo: 30, unitId: unitG.id },
    { naziv: "SIHA PROFERM H+2", dozaOd: 30, dozaDo: 30, unitId: unitG.id },
    { naziv: "SIHA FERMENTACIJSKA SOL PLUS", dozaOd: 30, dozaDo: 30, unitId: unitG.id },
    { naziv: "SIHA SPEEDFERM", dozaOd: 30, dozaDo: 30, unitId: unitG.id },

    { naziv: "SIHA KALIJ METABISULFIT PRAH", dozaOd: 10, dozaDo: 20, unitId: unitG.id },
    { naziv: "STIMULA SAUVIGNON BLANC", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "POLYMUST BLANC", dozaOd: 15, dozaDo: 15, unitId: unitG.id },
    { naziv: "OPERA MEDIUM T", dozaOd: 1, dozaDo: 20, unitId: unitG.id },
    { naziv: "OPERA FRUITY-TANINI", dozaOd: 1, dozaDo: 20, unitId: unitG.id },
    { naziv: "GLUTASTAR", dozaOd: 30, dozaDo: 30, unitId: unitG.id },

    { naziv: "SIHA KALIJ SORBAT", dozaOd: 10, dozaDo: 20, unitId: unitG.id },
    { naziv: "KALIJ SORBAT PAVIN", dozaOd: 10, dozaDo: 20, unitId: unitG.id },
    { naziv: "AROMAX", dozaOd: 8, dozaDo: 10, unitId: unitG.id },
    { naziv: "PYROVIN", dozaOd: 10, dozaDo: 20, unitId: unitG.id },
    { naziv: "PYROVIN S TANINOM", dozaOd: 10, dozaDo: 20, unitId: unitG.id },
    { naziv: "KALIJ METABISULFIT S TANINOM", dozaOd: 10, dozaDo: 20, unitId: unitG.id },
    { naziv: "KALIJ BIKARBONAT", dozaOd: 110, dozaDo: 110, unitId: unitG.id },

    { naziv: "LALLZYME C-MAX", dozaOd: 2, dozaDo: 2, unitId: unitG.id },
    { naziv: "LALLZYME HC", dozaOd: 2, dozaDo: 2, unitId: unitG.id },
    { naziv: "LALLZYME-CUVEE BLANC", dozaOd: 2, dozaDo: 2, unitId: unitG.id },
    { naziv: "LALLZYME- EX-V", dozaOd: 2, dozaDo: 2, unitId: unitG.id },
    { naziv: "LALLZYME- OE", dozaOd: 2, dozaDo: 2, unitId: unitG.id },

    { naziv: "ŽELATINA ZA FLOTACIJU", dozaOd: 20, dozaDo: 20, unitId: unitMl.id },
    { naziv: "GERBINOL", dozaOd: 10, dozaDo: 10, unitId: unitG.id },

    { naziv: "LIMUNSKA KISELINA", dozaOd: 1, dozaDo: 2, unitId: unitG.id },
    { naziv: "ASKORBINSKA KISELINA", dozaOd: 15, dozaDo: 25, unitId: unitG.id },
    { naziv: "VINSKA KISELINA", dozaOd: 50, dozaDo: 250, unitId: unitG.id },
    { naziv: "JABUČNA KISELINA", dozaOd: 3, dozaDo: 3, unitId: unitG.id },

    { naziv: "CMC", dozaOd: 200, dozaDo: 200, unitId: unitMl.id },
    { naziv: "UGUŠĆENI MOŠT", dozaOd: 1.5, dozaDo: 1.5, unitId: unitMl.id },
    { naziv: "GLICEROL", dozaOd: 1, dozaDo: 1, unitId: unitDl.id },
  ];

  for (const p of sviPreparati) {
    const postojeci = await prisma.preparation.findFirst({
      where: { naziv: p.naziv },
    });

    if (postojeci) {
      await prisma.preparation.update({
        where: { id: postojeci.id },
        data: {
          dozaOd: p.dozaOd,
          dozaDo: p.dozaDo,
          unitId: p.unitId,
          isKorekcijski: false,
          korekcijaTip: null,
          korekcijaJedinica: null,
          ucinakPoJedinici: null,
          povecanjeParametra: null,
          referentnaKolicina: null,
          referentnaKolicinaJedinica: null,
          referentniVolumen: null,
          referentniVolumenJedinica: null,
        },
      });
    } else {
      await prisma.preparation.create({
        data: {
          naziv: p.naziv,
          dozaOd: p.dozaOd,
          dozaDo: p.dozaDo,
          unitId: p.unitId,
          isKorekcijski: false,
        },
      });
    }
  }

  console.log("Preparati OK");

  // ===== KOREKCIJSKI PREPARAT =====
  const postojeciSumpovin = await prisma.preparation.findFirst({
    where: { naziv: "Sumpovin" },
  });

  if (postojeciSumpovin) {
    await prisma.preparation.update({
      where: { id: postojeciSumpovin.id },
      data: {
        isKorekcijski: true,
        korekcijaTip: "SLOBODNI_SO2",
        korekcijaJedinica: "mg/L",
        referentnaKolicina: 20,
        referentnaKolicinaJedinica: "ml",
        referentniVolumen: 100,
        referentniVolumenJedinica: "l",
        povecanjeParametra: 10,
        unitId: unitMl.id,
      },
    });
  } else {
    await prisma.preparation.create({
      data: {
        naziv: "Sumpovin",
        isKorekcijski: true,
        korekcijaTip: "SLOBODNI_SO2",
        korekcijaJedinica: "mg/L",
        referentnaKolicina: 20,
        referentnaKolicinaJedinica: "ml",
        referentniVolumen: 100,
        referentniVolumenJedinica: "l",
        povecanjeParametra: 10,
        unitId: unitMl.id,
      },
    });
  }

  console.log("Korekcijski preparat OK");

  // ===== SORTE =====
  const sorte = [
    "Graševina",
    "Sauvignon",
    "Rajnski rizling",
    "Chardonnay",
    "Pinot sivi",
    "Pinot bijeli",
    "Muškat žuti",
    "Traminac",
    "Zeleni Veltlinac",
    "Cabernet Sauvignon",
    "Merlot",
    "Frankovka",
    "Pinot crni",
    "Rose",
    "Cuvee",
  ];

  for (const naziv of sorte) {
    await prisma.sorta.upsert({
      where: { naziv },
      update: {},
      create: { naziv },
    });
  }

  console.log("Sorte OK");

  // ===== TANKOVI =====
  const tankoviZaUnos = [
    { broj: 7, kapacitet: 10500, tip: "zatvoreni tank", opis: "TANK 7" },
    { broj: 8, kapacitet: 10500, tip: "zatvoreni tank", opis: "TANK 8" },
    { broj: 9, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 9" },
    { broj: 10, kapacitet: 5000, tip: "zatvoreni tank", opis: "TANK 10" },
    { broj: 11, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 11" },
    { broj: 12, kapacitet: 5000, tip: "zatvoreni tank", opis: "TANK 12" },
    { broj: 13, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 13" },
    { broj: 14, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 14" },
    { broj: 15, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 15" },
    { broj: 16, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 16" },
    { broj: 17, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 17" },
    { broj: 18, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 18" },
    { broj: 20, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 20" },
    { broj: 21, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 21" },
    { broj: 22, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 22" },
    { broj: 25, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 25" },
    { broj: 26, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 26" },
    { broj: 27, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 27" },
    { broj: 28, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 28" },
    { broj: 29, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 29" },
    { broj: 30, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 30" },
    { broj: 31, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 31" },
    { broj: 32, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 32" },
    { broj: 33, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 33" },
    { broj: 34, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 34" },
    { broj: 36, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 36" },
    { broj: 37, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 37" },
    { broj: 38, kapacitet: 3900, tip: "zatvoreni tank", opis: "TANK 38" },
    { broj: 39, kapacitet: 2500, tip: "drvena bačva", opis: "DRV.BAČVA 39" },
    { broj: 40, kapacitet: 2500, tip: "drvena bačva", opis: "DRV.BAČVA 40" },
    { broj: 41, kapacitet: 2500, tip: "drvena bačva", opis: "DRV.BAČVA 41" },
    { broj: 42, kapacitet: 80000, tip: "vanjski tank", opis: "VANJSKI TANK 42" },
  ];

  for (const tank of tankoviZaUnos) {
    await prisma.tank.upsert({
      where: { broj: tank.broj },
      update: {
        kapacitet: tank.kapacitet,
        tip: tank.tip,
        opis: tank.opis,
      },
      create: {
        broj: tank.broj,
        kapacitet: tank.kapacitet,
        tip: tank.tip,
        opis: tank.opis,
      },
    });
  }

  console.log("Tankovi OK");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });