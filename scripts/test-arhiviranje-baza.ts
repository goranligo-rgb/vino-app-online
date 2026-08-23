/**
 * Provjera ARHIVIRANJA TANKA nad pravom bazom — obje funkcije.
 *
 * Pokretanje:  npm run test:arhiviranje:baza
 *
 * SIGURNOST — procitaj prije pokretanja:
 *   - svaki scenarij radi u vlastitoj transakciji koja NA KRAJU NAMJERNO PUKNE,
 *     pa se sve vraca unatrag; u bazi ne ostaje nijedan redak;
 *   - radi ISKLJUCIVO nad tankovima koje sam stvori, s brojevima iznad
 *     najveceg postojeceg. Nijedan pravi tank se ne cita ni ne mijenja —
 *     obje funkcije arhiviranja pogadjaju samo `tankId` koji im predamo;
 *   - korisnik, preparat i jedinica su sintetski, korisnik s @example.invalid.
 * Zato ga je sigurno pokrenuti i tijekom berbe. Ipak nije dio nijednog build
 * koraka — pokrece se rucno i svjesno, jer ipak otvara transakciju nad
 * produkcijskom bazom.
 *
 * STO SE DOKAZUJE. Arhiviranje je dosad `Radnja` ostavljalo netaknutom, a
 * `IzlazVina` brisalo bez kopije — tank 16 je imao radnju "Prodano rinfuza
 * 1.000 L" i nula izlaza. Sada oboje ide u arhivu, a originali OSTAJU.
 * Ovaj test bi inace bio prvo pravo arhiviranje nakon izmjene, pa se radije
 * odigrava ovdje nego na pravom vinu.
 *
 * Posebno se dokazuje `izvorniZadatakId`: `Radnja.zadatak` je opcijska relacija
 * bez `onDelete`, pa Prisma na brisanju zadatka postavi `Radnja.zadatakId` na
 * NULL. Veza radnja→zadatak zato mora biti PROCITANA I SPREMLJENA prije nego
 * arhiviranje obrise zadatke. Scenariji 1 i 2 provjeravaju oboje: da je
 * `izvorniZadatakId` u arhivi ispravan I da je original u medjuvremenu ostao
 * bez veze.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { arhivirajPotroseniTank } from "../app/api/pretok/route";
import { arhivirajPrazanTank } from "../app/api/izlaz-vina/route";

type Tx = Prisma.TransactionClient;

let pao = 0;
let proslo = 0;

function jednako(dobiveno: unknown, ocekivano: unknown, poruka: string) {
  if (dobiveno === ocekivano) {
    proslo++;
    return;
  }
  pao++;
  console.log(`  PAO: ${poruka}`);
  console.log(`       ocekivano: ${JSON.stringify(ocekivano)}`);
  console.log(`       dobiveno:  ${JSON.stringify(dobiveno)}`);
}

function tvrdi(uvjet: boolean, poruka: string) {
  jednako(uvjet, true, poruka);
}

/** Baca se na kraju svakog scenarija da transakcija padne i sve se vrati. */
class Rollback extends Error {}

let sljedeciBroj = 0;
let redniBroj = 0;

async function scenarij(naziv: string, fn: (tx: Tx) => Promise<void>) {
  console.log(naziv);
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
  } catch (e) {
    if (!(e instanceof Rollback)) {
      pao++;
      console.log(`  PAO: scenarij je pukao: ${(e as Error).message}`);
    }
  }
}

const DATUM_BERBE = new Date("2025-09-14T06:00:00.000Z");
const DATUM_PUNJENJA = new Date("2025-09-14T18:30:00.000Z");
const DATUM_IZLAZA = new Date("2026-03-02T09:15:00.000Z");
const DATUM_RADNJE = new Date("2026-01-20T11:05:00.000Z");

/**
 * Sintetski tank sa SVIME sto arhiviranje dira: punjenje sa stavkom berbe,
 * mjerenje, zadatak (s preparatom i jedinicom), dvije radnje i dva izlaza.
 */
async function napraviPunTank(tx: Tx, oznaka: string) {
  const korisnik = await tx.user.create({
    data: {
      ime: `TEST arhiviranje ${oznaka}`,
      email: `test-arhiviranje-${redniBroj++}-${Date.now()}@example.invalid`,
      password: "nije-u-upotrebi",
      role: "PODRUM",
    },
  });

  const jedinica = await tx.unit.create({
    data: { naziv: `TEST-g-${oznaka}`, tip: "MASA", faktor: 1 },
  });

  const preparat = await tx.preparation.create({
    data: { naziv: `TEST preparat ${oznaka}`, unitId: jedinica.id },
  });

  const tank = await tx.tank.create({
    data: {
      broj: sljedeciBroj++,
      kapacitet: 5000,
      kolicinaVinaUTanku: 3000,
      nazivVina: `TEST vino ${oznaka}`,
      sorta: "Grasevina",
      godiste: 2025,
      tip: "INOX",
      nadzorHladjenja: false,
      smsAktivan: false,
      samokontrolaAktivna: false,
    },
  });

  const punjenje = await tx.punjenjeTanka.create({
    data: {
      tankId: tank.id,
      nazivVina: `TEST vino ${oznaka}`,
      datumPunjenja: DATUM_PUNJENJA,
      napomena: "TEST napomena punjenja",
      opis: "TEST opis punjenja",
      ukupnoLitara: 3000,
      ukupnoKgGrozdja: 4200,
      stavke: {
        create: [
          {
            nazivSorte: "Grasevina",
            opis: "zdravo grozdje",
            kolicinaLitara: 3000,
            kolicinaKgGrozdja: 4200,
            datumBerbe: DATUM_BERBE,
            godinaBerbe: 2025,
            polozaj: "TEST polozaj",
            parcela: "TEST parcela 12/3",
            vinograd: "TEST vinograd",
            oznakaBerbe: "TEST-B-2025-01",
            secer: 84.5,
            kiseline: 7.2,
            ph: 3.21,
            napomenaBerbe: "TEST napomena berbe",
          },
        ],
      },
    },
    include: { stavke: true },
  });

  await tx.mjerenje.create({
    data: { tankId: tank.id, alkohol: 12.4, ph: 3.3 },
  });

  const zadatak = await tx.zadatak.create({
    data: {
      tankId: tank.id,
      zadaoKorisnikId: korisnik.id,
      vrsta: "DODAVANJE",
      status: "IZVRSEN",
      naslov: "TEST zadatak",
      preparatId: preparat.id,
      jedinicaId: jedinica.id,
      doza: 5,
      izvrsenoAt: DATUM_RADNJE,
    },
  });

  // Radnja S vezom na zadatak — ona zbog koje `izvorniZadatakId` uopce postoji.
  const radnjaSaZadatkom = await tx.radnja.create({
    data: {
      tankId: tank.id,
      korisnikId: korisnik.id,
      zadatakId: zadatak.id,
      vrsta: "DODAVANJE",
      opis: "TEST dodavanje preparata",
      napomena: "TEST napomena radnje",
      preparatId: preparat.id,
      jedinicaId: jedinica.id,
      kolicina: 12.5,
      createdAt: DATUM_RADNJE,
    },
  });

  // Radnja BEZ zadatka i bez preparata — kakva nastaje kod prodaje rinfuze.
  const radnjaBezZadatka = await tx.radnja.create({
    data: {
      tankId: tank.id,
      korisnikId: korisnik.id,
      vrsta: "OSTALO",
      opis: "TEST prodano rinfuza 1.000 L",
      kolicina: 1000,
      createdAt: DATUM_IZLAZA,
    },
  });

  const izlazProdaja = await tx.izlazVina.create({
    data: {
      tankId: tank.id,
      tip: "PRODAJA",
      datum: DATUM_IZLAZA,
      kolicinaLitara: 1000,
      napomena: "TEST prodaja rinfuze",
    },
  });

  const izlazPunjenje = await tx.izlazVina.create({
    data: {
      tankId: tank.id,
      tip: "PUNJENJE",
      datum: DATUM_IZLAZA,
      kolicinaLitara: 999.75,
      brojBoca: 1333,
      volumenBoce: 0.75,
    },
  });

  return {
    korisnik,
    jedinica,
    preparat,
    tank,
    punjenje,
    zadatak,
    radnjaSaZadatkom,
    radnjaBezZadatka,
    izlazProdaja,
    izlazPunjenje,
  };
}

/** Zajednicke tvrdnje nad onim sto je arhiviranje upisalo. */
async function provjeriArhivu(
  tx: Tx,
  arhivaId: string,
  s: Awaited<ReturnType<typeof napraviPunTank>>,
  imeFunkcije: string
) {
  // --- RADNJE ---
  const radnje = await tx.arhivaVinaRadnja.findMany({
    where: { arhivaVinaId: arhivaId },
    orderBy: { createdAt: "asc" },
  });

  jednako(radnje.length, 2, `${imeFunkcije}: obje radnje su u arhivi`);

  const sZadatkom = radnje.find(
    (r) => r.izvornaRadnjaId === s.radnjaSaZadatkom.id
  );
  const bezZadatka = radnje.find(
    (r) => r.izvornaRadnjaId === s.radnjaBezZadatka.id
  );

  tvrdi(!!sZadatkom, `${imeFunkcije}: radnja sa zadatkom je nadjena po izvornom id-u`);
  tvrdi(!!bezZadatka, `${imeFunkcije}: radnja bez zadatka je nadjena po izvornom id-u`);

  if (sZadatkom) {
    // OVO JE POANTA: veza na zadatak je spremljena prije nego su zadaci obrisani.
    jednako(
      sZadatkom.izvorniZadatakId,
      s.zadatak.id,
      `${imeFunkcije}: izvorniZadatakId NIJE NULL i pokazuje na pravi zadatak`
    );
    jednako(sZadatkom.vrsta, "DODAVANJE", `${imeFunkcije}: vrsta radnje`);
    jednako(sZadatkom.opis, "TEST dodavanje preparata", `${imeFunkcije}: opis radnje`);
    jednako(sZadatkom.napomena, "TEST napomena radnje", `${imeFunkcije}: napomena radnje`);
    jednako(sZadatkom.kolicina, 12.5, `${imeFunkcije}: kolicina radnje`);
    jednako(sZadatkom.tankId, s.tank.id, `${imeFunkcije}: tankId radnje`);
    jednako(
      sZadatkom.createdAt.getTime(),
      DATUM_RADNJE.getTime(),
      `${imeFunkcije}: izvorni createdAt radnje je sacuvan, ne prepisan`
    );

    // Denormalizirana polja — zbog njih arhiva ostaje citljiva i ako se
    // preparat, jedinica ili korisnik poslije preimenuju ili obrisu.
    jednako(
      sZadatkom.preparatNaziv,
      s.preparat.naziv,
      `${imeFunkcije}: preparatNaziv je denormaliziran`
    );
    jednako(
      sZadatkom.jedinicaNaziv,
      s.jedinica.naziv,
      `${imeFunkcije}: jedinicaNaziv je denormaliziran`
    );
    jednako(
      sZadatkom.korisnikIme,
      s.korisnik.ime,
      `${imeFunkcije}: korisnikIme je denormaliziran`
    );
    jednako(sZadatkom.preparatId, s.preparat.id, `${imeFunkcije}: preparatId radnje`);
    jednako(sZadatkom.jedinicaId, s.jedinica.id, `${imeFunkcije}: jedinicaId radnje`);
    jednako(sZadatkom.korisnikId, s.korisnik.id, `${imeFunkcije}: korisnikId radnje`);
  }

  if (bezZadatka) {
    jednako(
      bezZadatka.izvorniZadatakId,
      null,
      `${imeFunkcije}: radnja bez zadatka ima izvorniZadatakId NULL`
    );
    jednako(bezZadatka.vrsta, "OSTALO", `${imeFunkcije}: vrsta radnje bez zadatka`);
    jednako(bezZadatka.kolicina, 1000, `${imeFunkcije}: kolicina radnje bez zadatka`);
    jednako(
      bezZadatka.preparatNaziv,
      null,
      `${imeFunkcije}: radnja bez preparata nema preparatNaziv`
    );
    jednako(
      bezZadatka.korisnikIme,
      s.korisnik.ime,
      `${imeFunkcije}: i radnja bez zadatka nosi ime korisnika`
    );
  }

  // --- IZLAZI ---
  const izlazi = await tx.arhivaVinaIzlaz.findMany({
    where: { arhivaVinaId: arhivaId },
    orderBy: { kolicinaLitara: "desc" },
  });

  jednako(izlazi.length, 2, `${imeFunkcije}: oba izlaza su u arhivi`);

  const prodaja = izlazi.find((i) => i.izvorniIzlazId === s.izlazProdaja.id);
  const punjenjeBoca = izlazi.find((i) => i.izvorniIzlazId === s.izlazPunjenje.id);

  tvrdi(!!prodaja, `${imeFunkcije}: izlaz PRODAJA je nadjen po izvornom id-u`);
  tvrdi(!!punjenjeBoca, `${imeFunkcije}: izlaz PUNJENJE je nadjen po izvornom id-u`);

  if (prodaja) {
    jednako(prodaja.tip, "PRODAJA", `${imeFunkcije}: tip izlaza PRODAJA`);
    jednako(prodaja.kolicinaLitara, 1000, `${imeFunkcije}: litre izlaza PRODAJA`);
    jednako(prodaja.napomena, "TEST prodaja rinfuze", `${imeFunkcije}: napomena izlaza`);
    jednako(prodaja.brojBoca, null, `${imeFunkcije}: prodaja rinfuze nema broj boca`);
    jednako(
      prodaja.datum.getTime(),
      DATUM_IZLAZA.getTime(),
      `${imeFunkcije}: datum izlaza je sacuvan`
    );
    jednako(prodaja.tankId, s.tank.id, `${imeFunkcije}: tankId izlaza`);
  }

  if (punjenjeBoca) {
    jednako(punjenjeBoca.tip, "PUNJENJE", `${imeFunkcije}: tip izlaza PUNJENJE`);
    jednako(punjenjeBoca.brojBoca, 1333, `${imeFunkcije}: broj boca`);
    jednako(punjenjeBoca.volumenBoce, 0.75, `${imeFunkcije}: volumen boce`);
    jednako(punjenjeBoca.kolicinaLitara, 999.75, `${imeFunkcije}: litre izlaza PUNJENJE`);
  }

  // --- PUNJENJA I BERBA (#2) ---
  const arhPunjenja = await tx.arhivaPunjenjeTanka.findMany({
    where: { arhivaVinaId: arhivaId },
    include: { stavke: true },
  });

  jednako(arhPunjenja.length, 1, `${imeFunkcije}: punjenje je u arhivi`);

  if (arhPunjenja[0]) {
    const p = arhPunjenja[0];
    jednako(p.izvornoPunjenjeId, s.punjenje.id, `${imeFunkcije}: izvornoPunjenjeId`);
    jednako(p.ukupnoLitara, 3000, `${imeFunkcije}: ukupno litara punjenja`);
    jednako(p.ukupnoKgGrozdja, 4200, `${imeFunkcije}: ukupno kg grozdja`);
    jednako(p.stavke.length, 1, `${imeFunkcije}: stavka berbe je u arhivi`);

    const st = p.stavke[0];
    if (st) {
      jednako(st.nazivSorte, "Grasevina", `${imeFunkcije}: sorta berbe`);
      jednako(st.parcela, "TEST parcela 12/3", `${imeFunkcije}: parcela berbe`);
      jednako(st.vinograd, "TEST vinograd", `${imeFunkcije}: vinograd berbe`);
      jednako(st.oznakaBerbe, "TEST-B-2025-01", `${imeFunkcije}: oznaka berbe`);
      jednako(st.kolicinaKgGrozdja, 4200, `${imeFunkcije}: kg grozdja stavke`);
      jednako(st.secer, 84.5, `${imeFunkcije}: secer berbe`);
      jednako(st.kiseline, 7.2, `${imeFunkcije}: kiseline berbe`);
      jednako(st.ph, 3.21, `${imeFunkcije}: ph berbe`);
      jednako(st.napomenaBerbe, "TEST napomena berbe", `${imeFunkcije}: napomena berbe`);
      jednako(
        st.datumBerbe?.getTime(),
        DATUM_BERBE.getTime(),
        `${imeFunkcije}: datum berbe je sacuvan`
      );
    }
  }

  // --- ORIGINALI OSTAJU (dogovoreno: SAMO KOPIRANJE) ---
  const radnjeOriginali = await tx.radnja.findMany({
    where: { tankId: s.tank.id },
    orderBy: { createdAt: "asc" },
  });
  jednako(
    radnjeOriginali.length,
    2,
    `${imeFunkcije}: originalne radnje NISU obrisane`
  );

  const izlaziOriginali = await tx.izlazVina.count({ where: { tankId: s.tank.id } });
  jednako(izlaziOriginali, 2, `${imeFunkcije}: originalni izlazi NISU obrisani`);

  // A veza radnja→zadatak JEST otisla na NULL, jer su zadaci obrisani. Zato se
  // par i sprema u arhivu — da se ova rupa moze zakrpati pri ponistavanju.
  const originalSaZadatkom = radnjeOriginali.find(
    (r) => r.id === s.radnjaSaZadatkom.id
  );
  jednako(
    originalSaZadatkom?.zadatakId,
    null,
    `${imeFunkcije}: originalu je zadatakId otisao na NULL (zato par ide u arhivu)`
  );
  jednako(
    await tx.zadatak.count({ where: { tankId: s.tank.id } }),
    0,
    `${imeFunkcije}: zadaci su obrisani (postoje samo u arhivi)`
  );
}

async function main() {
  // Brojevi tankova krecu IZNAD najveceg postojeceg, da se ni slucajno ne
  // sudare s pravim tankom. (Sve se ionako vraca unatrag.)
  const najveci = await prisma.tank.aggregate({ _max: { broj: true } });
  sljedeciBroj = (najveci._max.broj ?? 0) + 1000;
  console.log(`Sintetski tankovi krecu od broja ${sljedeciBroj}.`);

  const prijeRadnje = await prisma.arhivaVinaRadnja.count();
  const prijeIzlazi = await prisma.arhivaVinaIzlaz.count();
  const prijeArhive = await prisma.arhivaVina.count();
  console.log(
    `Zateceno u bazi: ArhivaVinaRadnja ${prijeRadnje}, ArhivaVinaIzlaz ${prijeIzlazi}, ArhivaVina ${prijeArhive}.`
  );
  console.log("");

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 1: arhivirajPotroseniTank (pretok) pise radnje, izlaze i punjenja",
    async (tx) => {
      const s = await napraviPunTank(tx, "pretok");

      const arhiva = await arhivirajPotroseniTank(
        tx,
        {
          id: s.tank.id,
          broj: s.tank.broj,
          sorta: s.tank.sorta,
          nazivVina: s.tank.nazivVina,
          godiste: s.tank.godiste,
          kapacitet: s.tank.kapacitet,
          tip: s.tank.tip,
        },
        3000,
        "TEST arhiviranje kroz pretok"
      );

      jednako(arhiva.brojTanka, s.tank.broj, "arhiva nosi broj tanka");
      jednako(arhiva.kolicinaVina, 3000, "arhiva nosi kolicinu prije praznjenja");
      jednako(arhiva.tipArhive, "PRIVREMENA", "tip arhive iz pretoka");

      await provjeriArhivu(tx, arhiva.id, s, "pretok");

      const tankPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: s.tank.id },
      });
      jednako(tankPoslije.kolicinaVinaUTanku, 0, "pretok: tank je ispraznjen");
      jednako(tankPoslije.nazivVina, null, "pretok: identitet vina je ocisten");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 2: arhivirajPrazanTank (izlaz-vina) pise isto",
    async (tx) => {
      const s = await napraviPunTank(tx, "izlaz");

      const arhiva = await arhivirajPrazanTank(
        tx,
        s.tank.id,
        "TEST arhiviranje kroz izlaz vina",
        3000
      );

      tvrdi(!!arhiva, "izlaz-vina: arhiva je nastala");
      if (!arhiva) return;

      jednako(arhiva.brojTanka, s.tank.broj, "arhiva nosi broj tanka");
      jednako(arhiva.tipArhive, "IZLAZ_VINA", "tip arhive iz izlaza vina");

      await provjeriArhivu(tx, arhiva.id, s, "izlaz-vina");

      const tankPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: s.tank.id },
      });
      jednako(tankPoslije.kolicinaVinaUTanku, 0, "izlaz-vina: tank je ispraznjen");
      jednako(tankPoslije.nazivVina, null, "izlaz-vina: identitet vina je ocisten");
    }
  );

  // -------------------------------------------------------------------------
  await scenarij(
    "DOKAZ 3: tank bez radnji i izlaza se arhivira bez praznih redaka",
    async (tx) => {
      const tank = await tx.tank.create({
        data: {
          broj: sljedeciBroj++,
          kapacitet: 1000,
          kolicinaVinaUTanku: 500,
          nazivVina: "TEST prazno",
          nadzorHladjenja: false,
          smsAktivan: false,
          samokontrolaAktivna: false,
        },
      });

      const arhiva = await arhivirajPotroseniTank(
        tx,
        {
          id: tank.id,
          broj: tank.broj,
          sorta: null,
          nazivVina: tank.nazivVina,
          godiste: null,
          kapacitet: tank.kapacitet,
          tip: null,
        },
        500,
        "TEST arhiviranje praznog"
      );

      jednako(
        await tx.arhivaVinaRadnja.count({ where: { arhivaVinaId: arhiva.id } }),
        0,
        "bez radnji: nijedan redak u ArhivaVinaRadnja"
      );
      jednako(
        await tx.arhivaVinaIzlaz.count({ where: { arhivaVinaId: arhiva.id } }),
        0,
        "bez izlaza: nijedan redak u ArhivaVinaIzlaz"
      );
    }
  );

  // -------------------------------------------------------------------------
  // Nista od gornjeg ne smije prezivjeti rollback.
  const poslijeRadnje = await prisma.arhivaVinaRadnja.count();
  const poslijeIzlazi = await prisma.arhivaVinaIzlaz.count();
  const poslijeArhive = await prisma.arhivaVina.count();

  console.log("");
  jednako(poslijeRadnje, prijeRadnje, "ArhivaVinaRadnja: broj redaka nepromijenjen");
  jednako(poslijeIzlazi, prijeIzlazi, "ArhivaVinaIzlaz: broj redaka nepromijenjen");
  jednako(poslijeArhive, prijeArhive, "ArhivaVina: broj redaka nepromijenjen");

  const zaostaliTankovi = await prisma.tank.count({
    where: { broj: { gte: (najveci._max.broj ?? 0) + 1000 } },
  });
  jednako(zaostaliTankovi, 0, "nijedan sintetski tank nije ostao u bazi");

  const zaostaliKorisnici = await prisma.user.count({
    where: { email: { endsWith: "@example.invalid" } },
  });
  jednako(zaostaliKorisnici, 0, "nijedan sintetski korisnik nije ostao u bazi");

  console.log("");
  console.log(`proslo: ${proslo}, palo: ${pao}`);
  console.log(
    "Sve transakcije su namjerno vracene unatrag — u bazi nije ostao nijedan redak."
  );
}

main()
  .catch((e) => {
    console.error(e);
    pao++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (pao > 0) process.exit(1);
  });
