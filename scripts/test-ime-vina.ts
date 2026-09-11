/**
 * PROVJERA IMENA VINA (faza 1) — cist racun, bez baze.
 *
 * Pokretanje:  npm run test:ime:vina
 *
 * Ovdje se ne dira baza: `izracunajImeVina` je namjerno odvojen od citanja da
 * bi se pravila mogla dokazati nad izmisljenim, a ne nad zatecenim podacima.
 * Zatecene podatke provjerava faza 2 (backfill) svojom provjerom.
 *
 * STO SE DOKAZUJE
 * ---------------
 *  1-2.  Zadnji cin pobjedjuje, i to po `odAt`, ne po redoslijedu upisa.
 *  3.    Zapis stariji od granice vina NE VRIJEDI — vino koje je uslo poslije
 *        praznjenja ne nasljedjuje ime prethodnika samo zato sto je usao u
 *        istu posudu. Ovo je cijela poanta modela.
 *  4.    Prazan tank ne uzima ime od vina koje je otislo, i to se razlikuje
 *        od „vino ima, ali nije imenovano".
 *  5.    `doTrenutka` cita ime kakvo je bilo tada, ne danasnje.
 *  6.    Meko obrisan zapis ne sudjeluje u racunu.
 *  7.    Neodluceno (isti `odAt`) razrjesava `createdAt`.
 *  8.    Deklarirana sorta se vraca odvojeno od imena i smije stajati sama.
 *  9.    Prazan string iz obrasca nije ime.
 */

import {
  izracunajImeVina,
  vrijediUpisati,
  ocisti,
  type ZapisImena,
} from "../lib/ime-vina";

let proslo = 0;
let palo = 0;

function tvrdi(uvjet: boolean, opis: string, dokaz?: unknown) {
  if (uvjet) {
    proslo++;
    console.log(`  OK   ${opis}`);
  } else {
    palo++;
    console.log(`  PALO ${opis}`);
    if (dokaz !== undefined) console.log(`       ${JSON.stringify(dokaz)}`);
  }
}

const D = (s: string) => new Date(s);

function zapis(p: Partial<ZapisImena> & { odAt: Date }): ZapisImena {
  return {
    id: p.id ?? `z-${p.odAt.getTime()}`,
    tankId: p.tankId ?? "T",
    odAt: p.odAt,
    naziv: p.naziv ?? null,
    deklariranaSorta: p.deklariranaSorta ?? null,
    izvor: p.izvor ?? "RUCNO",
    obrisano: p.obrisano ?? false,
    createdAt: p.createdAt ?? p.odAt,
  };
}

const PUNO = { odAt: D("2026-06-01T00:00:00Z"), razlog: "PUNJENJE" as const };
const PRAZNO = { odAt: null, razlog: "PRAZAN" as const };

console.log("IME VINA — cist racun\n");

// 1-2. zadnji cin pobjedjuje, po odAt a ne po redoslijedu upisa
{
  const r = izracunajImeVina(PUNO, [
    zapis({ odAt: D("2026-06-05T10:00:00Z"), naziv: "Graševina" }),
    zapis({ odAt: D("2026-08-01T10:00:00Z"), naziv: "Cuvée bijeli" }),
  ]);
  tvrdi(r.naziv === "Cuvée bijeli" && r.razlog === "IMENOVANO", "1. zadnji cin imenovanja pobjedjuje", r);

  // upisan kasnije, ali vrijedi od ranije — ne smije pobijediti
  const r2 = izracunajImeVina(PUNO, [
    zapis({ odAt: D("2026-08-01T10:00:00Z"), naziv: "Cuvée bijeli", createdAt: D("2026-08-01T10:00:00Z") }),
    zapis({ odAt: D("2026-06-05T10:00:00Z"), naziv: "Graševina", createdAt: D("2026-09-01T10:00:00Z") }),
  ]);
  tvrdi(r2.naziv === "Cuvée bijeli", "2. poredak ide po odAt, ne po trenutku upisa", r2);
}

// 3. zapis stariji od granice vina ne vrijedi
{
  const r = izracunajImeVina(PUNO, [
    zapis({ odAt: D("2026-03-01T10:00:00Z"), naziv: "Rajnski rizling" }),
  ]);
  tvrdi(
    r.naziv === null && r.razlog === "BEZIMENO",
    "3. ime prethodnog vina ne prelazi granicu — novo vino krece bezimeno",
    r
  );
}

// 4. prazan tank
{
  const r = izracunajImeVina(PRAZNO, [
    zapis({ odAt: D("2026-06-05T10:00:00Z"), naziv: "Graševina" }),
  ]);
  tvrdi(
    r.naziv === null && r.razlog === "PRAZAN",
    "4. prazan tank nema ime, i to nije isto sto i bezimeno vino",
    r
  );
}

// 5. doTrenutka
{
  const zapisi = [
    zapis({ odAt: D("2026-06-05T10:00:00Z"), naziv: "Graševina" }),
    zapis({ odAt: D("2026-08-01T10:00:00Z"), naziv: "Cuvée bijeli" }),
  ];
  const r = izracunajImeVina(PUNO, zapisi, D("2026-07-01T00:00:00Z"));
  tvrdi(r.naziv === "Graševina", "5. doTrenutka vraca ime kakvo je tada bilo", r);

  const rub = izracunajImeVina(PUNO, zapisi, D("2026-08-01T10:00:00Z"));
  tvrdi(rub.naziv === "Cuvée bijeli", "5b. rub je ukljuciv — isti trenutak se vec broji", rub);
}

// 6. meko brisanje
{
  const r = izracunajImeVina(PUNO, [
    zapis({ odAt: D("2026-06-05T10:00:00Z"), naziv: "Graševina" }),
    zapis({ odAt: D("2026-08-01T10:00:00Z"), naziv: "Greskom upisano", obrisano: true }),
  ]);
  tvrdi(r.naziv === "Graševina", "6. obrisan zapis ne sudjeluje u racunu", r);
}

// 7. neodluceno razrjesava createdAt
{
  const t = D("2026-08-01T10:00:00Z");
  const r = izracunajImeVina(PUNO, [
    zapis({ id: "a", odAt: t, naziv: "Prvi", createdAt: D("2026-08-01T10:00:00Z") }),
    zapis({ id: "b", odAt: t, naziv: "Drugi", createdAt: D("2026-08-01T10:00:05Z") }),
  ]);
  tvrdi(r.naziv === "Drugi" && r.zapisId === "b", "7. isti odAt razrjesava createdAt", r);
}

// 8. deklarirana sorta smije stajati sama
{
  const r = izracunajImeVina(PUNO, [
    zapis({ odAt: D("2026-07-01T10:00:00Z"), deklariranaSorta: "Graševina" }),
  ]);
  tvrdi(
    r.naziv === null && r.deklariranaSorta === "Graševina" && r.razlog === "IMENOVANO",
    "8. sorta bez imena je i dalje cin imenovanja",
    r
  );
}

// 9. prazan string nije ime
{
  tvrdi(ocisti("   ") === null, "9. prazan string je isto sto i neupisano");
  tvrdi(!vrijediUpisati("  ", null), "9b. zapis bez imena i bez sorte se ne pise");
  tvrdi(vrijediUpisati(null, "Graševina"), "9c. sama sorta je dovoljan razlog za zapis");
}

console.log(`\nproslo: ${proslo}, palo: ${palo}`);
if (palo > 0) process.exit(1);
