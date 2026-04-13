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
  const jedinice = [
    { naziv: "mg", tip: "MASA", faktor: 0.001 },
    { naziv: "g", tip: "MASA", faktor: 1 },
    { naziv: "dkg", tip: "MASA", faktor: 10 },
    { naziv: "kg", tip: "MASA", faktor: 1000 },

    { naziv: "ml", tip: "VOLUMEN", faktor: 0.001 },
    { naziv: "dl", tip: "VOLUMEN", faktor: 0.1 },
    { naziv: "l", tip: "VOLUMEN", faktor: 1 },
    { naziv: "hl", tip: "VOLUMEN", faktor: 100 },

    { naziv: "g/hl", tip: "MASA_PO_VOLUMENU", faktor: 1 },
    { naziv: "kg/hl", tip: "MASA_PO_VOLUMENU", faktor: 1000 },
    { naziv: "ml/hl", tip: "VOLUMEN_PO_VOLUMENU", faktor: 1 },
    { naziv: "l/hl", tip: "VOLUMEN_PO_VOLUMENU", faktor: 1000 },

    { naziv: "mg/l", tip: "MASA_PO_VOLUMENU", faktor: 0.001 },
    { naziv: "g/l", tip: "MASA_PO_VOLUMENU", faktor: 1 },
    { naziv: "ml/l", tip: "VOLUMEN_PO_VOLUMENU", faktor: 0.001 },
    { naziv: "l/l", tip: "VOLUMEN_PO_VOLUMENU", faktor: 1 },
  ];

  for (const unit of jedinice) {
    const postoji = await prisma.unit.findFirst({
      where: { naziv: unit.naziv },
    });

    if (!postoji) {
      await prisma.unit.create({
        data: unit,
      });
    } else {
      await prisma.unit.update({
        where: { id: postoji.id },
        data: {
          tip: unit.tip,
          faktor: unit.faktor,
        },
      });
    }
  }

  console.log("Jedinice OK");

  // ===== DOHVAT JEDINICA =====
  const unitG = await prisma.unit.findFirst({ where: { naziv: "g" } });
  const unitMl = await prisma.unit.findFirst({ where: { naziv: "ml" } });
  const unitDl = await prisma.unit.findFirst({ where: { naziv: "dl" } });

  if (!unitG || !unitMl || !unitDl) {
    throw new Error("Jedinice nisu ispravno seedane!");
  }

  // ===== PREPARATI =====
  const sviPreparati = [
    { naziv: "Bentonit", dozaOd: 200, dozaDo: 200, unitId: unitG.id },
    { naziv: "Klarol", dozaOd: 10, dozaDo: 40, unitId: unitMl.id },
    { naziv: "Aktivni ugljen", dozaOd: 100, dozaDo: 100, unitId: unitG.id },
    { naziv: "Gelatina", dozaOd: 5, dozaDo: 15, unitId: unitMl.id },
    { naziv: "PVPP", dozaOd: 10, dozaDo: 50, unitId: unitG.id },

    { naziv: "UVAFERM 228", dozaOd: 20, dozaDo: 20, unitId: unitG.id },
    { naziv: "LALVIN EC-1118", dozaOd: 20, dozaDo: 20, unitId: unitG.id },

    { naziv: "FERMAID E", dozaOd: 10, dozaDo: 10, unitId: unitG.id },
    { naziv: "GO FERM", dozaOd: 30, dozaDo: 30, unitId: unitG.id },

    { naziv: "SIHA KALIJ METABISULFIT PRAH", dozaOd: 10, dozaDo: 20, unitId: unitG.id },
    { naziv: "VINSKA KISELINA", dozaOd: 50, dozaDo: 250, unitId: unitG.id },

    { naziv: "ŽELATINA ZA FLOTACIJU", dozaOd: 20, dozaDo: 20, unitId: unitMl.id },

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
  const postojeci = await prisma.preparation.findFirst({
    where: { naziv: "Sumpovin" },
  });

  if (postojeci) {
    await prisma.preparation.update({
      where: { id: postojeci.id },
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

  console.log("SEED GOTOV");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("SEED GREŠKA:");
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });