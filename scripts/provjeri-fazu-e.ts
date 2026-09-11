/**
 * FAZA E — USPOREDBA SPREMLJENOG I IZVEDENOG. Samo cita.
 *
 * Pokretanje:  npm run e:provjeri
 *
 * Prije nego se pisanje ugasi, mora se znati gdje se spremljeno stanje
 * (`TankSortaUdio`, `BlendIzvor`, `Tank.kolicinaVinaUTanku`) razilazi od
 * knjige — i zasto. Ova skripta ispisuje SVAKU razliku, po tanku.
 *
 * Izlazni kod je 1 samo ako se KNJIGA ne slaze s `Tank.kolicinaVinaUTanku`:
 * to je jedina tvrdnja koja mora drzati bezuvjetno. Razlike u sastavu i blendu
 * se ISPISUJU, ne rusе — one su i razlog zbog kojeg faza E postoji.
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  sastavSvihTankova,
  stanjeSvihTankova,
  SORTA_NEPOZNATA,
  razlikaSastava,
} from "../lib/berba-model";

const f = (n: number, d = 2) => n.toFixed(d);

async function main() {
  console.log("Faza E — spremljeno naprama izvedenom (samo citanje).\n");

  const tankovi = await prisma.tank.findMany({
    select: {
      id: true,
      broj: true,
      kolicinaVinaUTanku: true,
      sorta: true,
      udjeliSorti: { select: { nazivSorte: true, postotak: true } },
      blendIzvori: { select: { kolicina: true, postotak: true } },
    },
    orderBy: { broj: "asc" },
  });

  const sastav = await sastavSvihTankova(prisma);
  const stanje = await stanjeSvihTankova(prisma);

  let kolicinaKriva = 0;
  let sastavRazlika = 0;
  let blendRazlika = 0;
  let bezKnjige = 0;

  for (const t of tankovi) {
    const uTanku = Number(t.kolicinaVinaUTanku ?? 0);
    const knjigaMl = (stanje.get(t.id) ?? []).reduce((z, s) => z + s.ml, 0);
    const knjigaL = Math.round(knjigaMl) / 1000;
    const izvedeni = sastav.get(t.id) ?? [];
    const blendL = t.blendIzvori.reduce((z, b) => z + Number(b.kolicina ?? 0), 0);

    const poruke: string[] = [];

    // 1. KOLICINA — jedina tvrdnja koja mora drzati.
    if (Math.abs(knjigaL - uTanku) > 0.5) {
      kolicinaKriva++;
      poruke.push(
        `KOLICINA: tank ${f(uTanku, 1)} L, knjiga ${f(knjigaL, 1)} L, razlika ${f(uTanku - knjigaL, 3)} L`
      );
    }

    // 2. SASTAV — usporedba samo nad poznatim dijelom.
    const razlike = razlikaSastava(t.udjeliSorti, izvedeni);
    if (razlike.length > 0) {
      sastavRazlika++;
      poruke.push(
        `SASTAV: ${razlike
          .map(
            (r) =>
              `${r.nazivSorte} upisano ${r.spremljeno == null ? "—" : f(r.spremljeno)} % / knjiga ${r.izKnjige == null ? "—" : f(r.izKnjige)} %`
          )
          .join(" · ")}`
      );
    }

    // 3. BLEND — koliko litara tvrdi naprama tanku.
    if (t.blendIzvori.length > 0 && Math.abs(blendL - uTanku) > 0.5) {
      blendRazlika++;
      poruke.push(
        `BLEND: tvrdi ${f(blendL, 1)} L, u tanku ${f(uTanku, 1)} L, razlika ${f(blendL - uTanku, 1)} L`
      );
    }

    if (uTanku > 0 && izvedeni.length === 0) {
      bezKnjige++;
      poruke.push(`KNJIGA NE ZNA NISTA, a u tanku je ${f(uTanku, 1)} L`);
    }

    if (poruke.length > 0) {
      const nepoznato = izvedeni.find((x) => x.nazivSorte === SORTA_NEPOZNATA);
      console.log(
        `T${String(t.broj).padStart(2)} (${f(uTanku, 0)} L${nepoznato ? `, od toga ${f(nepoznato.litre, 0)} L nepoznate sorte` : ""}):`
      );
      for (const p of poruke) console.log(`     ${p}`);
    }
  }

  console.log(`\nTankova: ${tankovi.length}`);
  console.log(`  kolicina se ne slaze s knjigom: ${kolicinaKriva}`);
  console.log(`  sastav se razilazi (poznati dio): ${sastavRazlika}`);
  console.log(`  blend tvrdi druge litre od tanka: ${blendRazlika}`);
  console.log(`  ima vina, a knjiga ne zna nista: ${bezKnjige}`);

  await prisma.$disconnect();
  if (kolicinaKriva > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
