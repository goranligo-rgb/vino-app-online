require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@vino.local" },
    update: {},
    create: {
      ime: "Admin",
      email: "admin@vino.local",
      password: "123456",
      role: "ADMIN",
      active: true,
    },
  });

  console.log("User dodan!");
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