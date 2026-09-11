/**
 * PROVJERA FAZE 4 — mijenja li se ijedan ekran, i gdje tocno.
 *
 * Pokretanje:  npm run ime:provjeri        (samo cita, nista ne mijenja)
 *
 * Faza 4 prebacuje ekrane s `Tank.nazivVina` / `Tank.sorta` na IZVEDENO ime iz
 * cinova imenovanja. Ovo usporeduje jedno s drugim, tank po tank, i ispisuje
 * tocno ono sto ce korisnik vidjeti drukcije. Cilj nije "nula razlika" nego
 * "svaka razlika je objasnjiva".
 *
 * TRI STVARI KOJE SE MJERE
 * ------------------------
 *  1. IME. Izvedeno naprama stupcu. Razlika znaci da ce se ekran promijeniti.
 *  2. BEZIMENI. Tankovi u kojima vino JEST, a nitko ga nije imenovao. Oni se od
 *     faze 4 vide kao „bez imena" umjesto kao prazno polje — to je trazena
 *     promjena, ne kvar.
 *  3. NESKLAD DEKLARIRANE SORTE I KNJIGE. Novi redak na stranici tanka, u
 *     izvjestaju i na kartici podruma. Ispisuje se poimence da se zna koliko ih
 *     je i koji su.
 */

import { prisma } from "../lib/prisma";
import { sastavIzPodrijetla, podrijetloTanka } from "../lib/berba-model";
import { granicaSvihTankova } from "../lib/granica-vina";
import {
  BEZ_IMENA_TEKST,
  imeZaPrikaz,
  imenaSvihTankova,
  jeBezImena,
  ocisti,
  usporediSaSastavom,
} from "../lib/ime-vina";
import { uValovima } from "../lib/paralelno";

async function main() {
  const tankovi = await prisma.tank.findMany({
    orderBy: { broj: "asc" },
    select: {
      id: true,
      broj: true,
      nazivVina: true,
      sorta: true,
      kolicinaVinaUTanku: true,
    },
  });

  const granice = await granicaSvihTankova(prisma);
  const imena = await imenaSvihTankova(prisma, granice);

  /** Ekran pise isto, samo s dodanom oznakom „bez imena ·" — trazena promjena. */
  const samoOznaka: string[] = [];
  /** Ekran pise nesto drugo. Svaka takva mora imati objasnjenje. */
  const drugiSadrzaj: string[] = [];
  /** Ime se razlikuje od `Tank.nazivVina` — ovo je jedino sto smije srusiti provjeru. */
  const razlikaImena: string[] = [];
  const bezimeni: number[] = [];
  const neskladi: string[] = [];
  let puni = 0;
  let isto = 0;

  // Sastav se cita po tanku (podrijetloTanka je tri upita), pa ide u valovima —
  // 48 odjednom je tocno ono sto lib/paralelno.ts zabranjuje.
  const sastavi = await uValovima(
    tankovi.map((t) => async () => ({
      id: t.id,
      sastav: sastavIzPodrijetla(await podrijetloTanka(prisma, t.id)),
    })),
    4
  );
  const sastavPo = new Map(sastavi.map((s) => [s.id, s.sastav]));

  for (const t of tankovi) {
    const ime = imena.get(t.id);
    if (!ime || ime.razlog === "PRAZAN") continue;
    puni++;

    // USPOREDUJE SE ONO STO EKRAN ISPISUJE, ne samo `naziv`.
    //
    // Stari lanac na gotovo svim ekranima je bio `nazivVina || sorta`, pa je
    // tank bez imena, a sa sortom, pokazivao SORTU. Usporedba samo po `naziv`
    // bi takav tank proglasila nepromijenjenim (oba `null`) i previdjela da se
    // ispis ipak mijenja — bas se to i dogodilo pri prvom pokretanju: cetiri
    // tanka su imala drukciju deklariranu sortu od `Tank.sorta`.
    const staro = ocisti(t.nazivVina) ?? ocisti(t.sorta);
    const novo = imeZaPrikaz(ime).tekst;
    const redak = `  T${String(t.broj).padStart(2)}  bilo ${JSON.stringify(staro)} → sada ${JSON.stringify(novo)}`;

    if (staro === novo) isto++;
    else if (novo.replace(`${BEZ_IMENA_TEKST} · `, "") === staro)
      samoOznaka.push(redak);
    else drugiSadrzaj.push(redak);

    // IME je jedino na cemu provjera pada. Deklarirana sorta se smije
    // razlikovati od `Tank.sorta` — to je i bila poanta faze: stupac je bio
    // jedna tvrdnja bez izvora, a zapis o imenovanju zna i tko i kad.
    if (ime.naziv !== ocisti(t.nazivVina))
      razlikaImena.push(
        `  T${String(t.broj).padStart(2)}  Tank.nazivVina ${JSON.stringify(ocisti(t.nazivVina))}, zapis ${JSON.stringify(ime.naziv)}`
      );

    if (jeBezImena(ime)) bezimeni.push(t.broj);

    const u = usporediSaSastavom(ime.deklariranaSorta, sastavPo.get(t.id) ?? []);
    if (u.razilazi && u.deklarirana && u.glavna)
      neskladi.push(
        `  T${String(t.broj).padStart(2)}  deklarirano „${u.deklarirana}”, knjiga kaže ${u.glavna} ${u.glavniPostotak?.toFixed(1)} %`
      );
  }

  console.log("FAZA 4 — sto ce se na ekranima promijeniti\n");
  console.log(`punih tankova: ${puni}`);
  console.log(`  ispis nepromijenjen:            ${isto}`);
  console.log(`  dodana samo oznaka bezimenosti: ${samoOznaka.length}`);
  console.log(`  ispis je drukciji:              ${drugiSadrzaj.length}`);

  if (samoOznaka.length) {
    console.log("\nSAMO OZNAKA (trazena promjena — vino nema ime i to se sada vidi):");
    for (const r of samoOznaka) console.log(r);
  }
  if (drugiSadrzaj.length) {
    console.log("\nISPIS JE DRUKCIJI (svaka ovakva mora imati objasnjenje):");
    for (const r of drugiSadrzaj) console.log(r);
  }

  console.log(`\nbezimenih ukupno: ${bezimeni.length}`);
  if (bezimeni.length) console.log(`  T${bezimeni.join(", T")}`);

  console.log(`\nnovi redak „sorta se ne slaže": ${neskladi.length}`);
  for (const n of neskladi) console.log(n);

  console.log(
    `\nIME naprama Tank.nazivVina — razilazenja: ${razlikaImena.length}`
  );
  for (const r of razlikaImena) console.log(r);

  console.log(
    `\n${razlikaImena.length === 0 ? "OK — nijedno IME se ne razilazi sa stupcem." : `PALO — ${razlikaImena.length} tankova ima drukcije ime nego stupac.`}`
  );

  await prisma.$disconnect();
  if (razlikaImena.length > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
