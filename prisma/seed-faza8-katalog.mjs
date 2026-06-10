// Faza 8 korak 3 — punjenje kataloga (sifrarnik). NE dira zalihu ni logiku.
// Upsert po nazivu (unique): postojece (re)aktivira, nepostojece kreira s cuid.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// 18 vina: 5l/1l -> "L", 0,75l/0,2l -> "kom"
const VINA = [
  { naziv: "Cabernet Sauvignon Premium 2023. 0,75l", jed: "kom" },
  { naziv: "Cuvee bijeli 2025. 1l", jed: "L" },
  { naziv: "Cuvee bijeli 5l", jed: "L" },
  { naziv: "Cuvee Premium 2023. 0,75l", jed: "kom" },
  { naziv: "Cuvee rouge 2024. 1l", jed: "L" },
  { naziv: "Cuvee rouge 5l", jed: "L" },
  { naziv: "Graševina 2024. 0,75l", jed: "kom" },
  { naziv: "Graševina 2025. 0,75l", jed: "kom" },
  { naziv: "Graševina premium 2024. 0,75l", jed: "kom" },
  { naziv: "Pjenušac Brut Nature Kostanjevec 2020. 0,75l", jed: "kom" },
  { naziv: "Pjenušac Brut Nature Rose 2017. 0,75l", jed: "kom" },
  { naziv: "Rajnski rizling 2025. 0,75l", jed: "kom" },
  { naziv: "Riesling Premium 2024. 0,75l", jed: "kom" },
  { naziv: "Rose 2024. 0,75l", jed: "kom" },
  { naziv: "Sauvignon blanc 2024. 0,75l", jed: "kom" },
  { naziv: "Sauvignon blanc 2025. 0,75l", jed: "kom" },
  { naziv: "Zeleni veltlinac 2025. 0,75l", jed: "kom" },
  { naziv: "Žuti muškat 2024. 0,75l", jed: "kom" },
];

// 5 reklamnih (promo)
const PROMO = [
  "Čaša reklamna mala 0,2l",
  "Kibla mala crna Kostanjevec",
  "Kibla mala transparent Kostanjevec",
  "Kibla velika crna Kostanjevec",
  "Otvarač crni Kostanjevec",
];

for (const v of VINA) {
  await prisma.putnikVinoArtikl.upsert({
    where: { naziv: v.naziv },
    update: { aktivan: true, zadanaJedinica: v.jed },
    create: { naziv: v.naziv, zadanaJedinica: v.jed },
  });
}
for (const naziv of PROMO) {
  await prisma.putnikPromoArtikl.upsert({
    where: { naziv },
    update: { aktivan: true },
    create: { naziv },
  });
}

const vina = await prisma.putnikVinoArtikl.count();
const promo = await prisma.putnikPromoArtikl.count();
console.log(`Gotovo. Vino katalog: ${vina}, Promo katalog: ${promo}`);
await prisma.$disconnect();
