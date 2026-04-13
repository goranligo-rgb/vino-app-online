require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Spajam se na bazu...");

  const users = await prisma.user.findMany();

  console.log("✅ Spojeno!");
  console.log(users);
}

main()
  .catch((e) => {
    console.error("❌ Greška:");
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });