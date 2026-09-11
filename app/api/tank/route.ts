// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { jeL12 } from "@/lib/auth-role";
import { razlikaPolja, zabiljeziIzmjene } from "@/lib/dnevnik-izmjena";
import { imeZaPrikaz, imenaPodruma, jeBezImena, zabiljeziImenovanje } from "@/lib/ime-vina";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Polja koja `PUT` smije mijenjati i koja zato ulaze u dnevnik izmjena.
 *
 * JEDAN popis za citanje starog stanja i za usporedbu — da se ne razidju.
 * `kolicinaVinaUTanku` NIJE ovdje jer ga ova ruta i ne pise (vidi biljesku uz
 * `PUT`); mijenja ga samo cin koji ga i knjizi.
 */
const POLJA_DNEVNIKA_TANKA = {
  id: true,
  broj: true,
  kapacitet: true,
  tip: true,
  sorta: true,
  nazivVina: true,
} as const;

/**
 * GET - dohvat svih tankova.
 *
 * `nazivVina` I `sorta` SE OD FAZE 4 IZVODE, NE CITAJU SE SA STUPCA.
 * ======================================================================
 *
 * Ime vina je cin (`ImeVina`), a ne svojstvo posude. Ovdje se za svaki tank
 * uzme zadnji cin imenovanja koji pada u prozor danasnjeg vina — dakle iza
 * `granicaVina` — i njegov naziv i deklarirana sorta idu van pod istim
 * imenima polja pod kojima su dosad isli stupci.
 *
 * ZASTO POD ISTIM IMENIMA, a ne kao nova polja: ovu rutu cita devet stranica
 * (dodavanje, izlaz-vina, mjerenje, pretok, punjenje, tankovi, tank-switcher,
 * zadaci) i svaka od njih vec zna sto je `t.nazivVina`. Novo polje znacilo bi
 * devet odvojenih izmjena i devet prilika da se ekrani razidju; ovako se sve
 * prebacuju odjednom, a znacenje polja ostaje isto — „kako se zove vino koje
 * je sada u ovoj posudi".
 *
 * MJERENO PRIJE PREBACIVANJA: od 38 punih tankova izvedeno ime se slaze s
 * `Tank.nazivVina` na svih 38. Nijedan ekran se danas ne mijenja — mijenja se
 * samo odakle podatak dolazi, i to je i bila svrha.
 *
 * STUPCI IDU UZ, POD `tankNazivVina` i `tankSorta`. Faza 4 ih jos pise (gasi
 * ih faza 5), pa tko ih treba — a to je za sada samo obrazac na /tankovi —
 * ima ih. Kad se ugase, ostaje samo izvedeno.
 *
 * PRAZAN TANK NEMA IME. Ne nasljedjuje ga od vina koje je otislo: granica se
 * pomakne i stariji zapisi ispadnu iz prozora sami od sebe.
 */
export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const tankovi = await prisma.tank.findMany({
      orderBy: { broj: "asc" },
    });

    const imena = await imenaPodruma(prisma);

    const sIzvedenimImenom = tankovi.map((t) => {
      const ime = imena.get(t.id);
      return {
        ...t,
        nazivVina: ime?.naziv ?? null,
        sorta: ime?.deklariranaSorta ?? null,
        /** Zatecene vrijednosti sa stupaca — vidi biljesku iznad. */
        tankNazivVina: t.nazivVina ?? null,
        tankSorta: t.sorta ?? null,
        /**
         * „Vino je u posudi, ali ga nitko nije imenovao" — razlicito od
         * „posuda je prazna". Ekran to mora moci razlikovati, pa ne ide kroz
         * `nazivVina === null`.
         */
        bezimeno: jeBezImena(ime),
        /** Gotov jednoredni opis — „Graševina" ili „bez imena · Muškat žuti". */
        opisVina: imeZaPrikaz(ime).tekst,
        imenovanoAt: ime?.odAt ?? null,
      };
    });

    return NextResponse.json(sIzvedenimImenom);
  } catch (error) {
    console.error("Greška kod dohvaćanja tankova:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja tankova." },
      { status: 500 }
    );
  }
}

// POST - dodavanje novog tanka
export async function POST(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const body = await req.json();

    const { broj, kapacitet, kolicinaVinaUTanku, tip, sorta } = body;

    // Novi tank je PRAZAN. Vino u njega ulazi punjenjem, pretokom ili
    // filtracijom — svaki od tih putova upisuje i kretanje u knjigu berbe.
    // Tank stvoren s vinom bio bi vino niotkuda: bez berbe, bez podrijetla i
    // bez ijednog retka u knjizi. Odbija se glasno, ne nulira se tiho: forma na
    // /tankovi salje tvrdu nulu, pa se ovo u redovnom radu ne moze okinuti, a
    // tko god posalje nesto drugo treba znati zasto ne prolazi.
    if (
      kolicinaVinaUTanku !== undefined &&
      kolicinaVinaUTanku !== null &&
      String(kolicinaVinaUTanku).trim() !== "" &&
      Number(kolicinaVinaUTanku) !== 0
    ) {
      return NextResponse.json(
        {
          error:
            "Novi tank se ne može stvoriti s vinom u sebi. Vino se unosi punjenjem tanka.",
        },
        { status: 400 }
      );
    }

    if (broj === undefined || broj === null || String(broj).trim() === "") {
      return NextResponse.json(
        { error: "Broj tanka je obavezan." },
        { status: 400 }
      );
    }

    if (
      kapacitet === undefined ||
      kapacitet === null ||
      String(kapacitet).trim() === ""
    ) {
      return NextResponse.json(
        { error: "Kapacitet tanka je obavezan." },
        { status: 400 }
      );
    }

    const noviTank = await prisma.tank.create({
      data: {
        broj: Number(broj),
        kapacitet: Number(kapacitet),
        kolicinaVinaUTanku: 0,
        tip: tip?.trim() ? String(tip).trim() : null,
        sorta: sorta?.trim() ? String(sorta).trim() : null,
      },
    });

    return NextResponse.json(noviTank);
  } catch (error) {
    console.error("Greška kod kreiranja tanka:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Tank s tim brojem već postoji." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod kreiranja tanka." },
      { status: 500 }
    );
  }
}

/**
 * PUT - izmjena tanka: broj, kapacitet, tip, sorta, nazivVina.
 *
 * `nazivVina` je DODAN 10.09.2026. Do tada je ruta pisala `sorta` a `nazivVina`
 * uopce nije dirala, pa se ta dva polja nisu mogla dovesti u sklad ni kad su se
 * razisla: tank 26 je stajao sa `sorta` "Zeleni veltlinac" i `nazivVina`
 * "Chardonnay", dok je po `TankSortaUdio` i po knjizi bio 100 % Chardonnay.
 * Monitor cita `sorta`, stranica tanka `nazivVina` — isti tank, dva imena, i
 * nijedan ekran nije mogao popraviti drugo polje.
 *
 * Oba polja idu ISTIM pravilom, i to je bitno:
 *   nije poslano (`undefined`) -> `undefined`, dakle "ne diraj"
 *   poslano prazno ("", "  ")  -> `null`, dakle "obrisi"
 * Bez toga bi "obrisi ime" bilo neizvedivo, a izostavljeno polje bi brisalo.
 *
 * KOLICINU VINA NE DIRA. Ovdje su do 26.08.2026. stajala dva kvara:
 *
 *   A) polje koje nije poslano zavrsavalo je kao `0`, ne `undefined`. Susjedna
 *      polja (broj, kapacitet, tip, sorta) sva daju `undefined` — dakle "ne
 *      diraj" — pa je nula bila omaska u pisanju, ne odluka. Posljedica: poziv
 *      `{ id, tip: "inox" }` ispraznio bi tank.
 *
 *   B) gori, jer se dogadjao sam od sebe: forma na /tankovi UVIJEK salje
 *      kolicinu, i to iz kopije ucitane pri otvaranju stranice (u tablici je
 *      polje read-only, uredjuju se samo broj, kapacitet i tip). Otvoris
 *      /tankovi, netko u podrumu pretoci 2.000 L, ti popravis tipfeler u tipu
 *      tanka — i kolicina se tiho vrati na jutarnju vrijednost. Izgubljeni
 *      upis bez greske, bez traga i bez zapisa igdje.
 *
 * Zato polje nije popravljeno na `undefined` nego MAKNUTO. Da je ostalo
 * zapisivo, kvar B bi prezivio: klijent i dalje salje ustajalu vrijednost.
 * Kolicina se od sada mijenja iskljucivo cinom koji je i zapisuje — punjenje,
 * pretok, filtracija, izlaz vina — a svi oni upisuju i kretanje u knjigu berbe.
 *
 * Kolicina poslana u tijelu se TIHO IGNORIRA, ne odbija: /tankovi je salje pri
 * svakoj izmjeni, pa bi 400 srusio uredjivanje tanka. Stranica nakon spremanja
 * ionako ponovno cita s posluzitelja, pa vidi istinitu vrijednost.
 */
export async function PUT(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  // UREDJIVANJE TANKA JE L1/L2 — ADMIN i PODRUM. Do sada je rutu smio zvati
  // svatko tko je prijavljen, ukljucujuci PREGLED, iako je ista provjera vec
  // stajala na svakom gumbu koji je zove (`jeL12Klijent`). Skrivanje gumba je
  // uljudnost, ne brava; brava je ovdje.
  //
  // ENOLOG je NAMJERNO izostavljen, isto kao u `jeL12`: on odredjuje kad
  // fermentacija pocinje i zavrsava, ali ne preimenuje vino u tanku.
  if (!jeL12(user.role)) {
    return NextResponse.json(
      { error: "Nemate pravo uređivati tank." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    // `kolicinaVinaUTanku` se NAMJERNO ne cita iz tijela — vidi nize.
    const { id, broj, kapacitet, tip, sorta, nazivVina } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID je obavezan." },
        { status: 400 }
      );
    }

    // JEDNA TRANSAKCIJA: procitaj staro stanje, izmijeni, upisi dnevnik.
    //
    // Dnevnik je UNUTAR iste transakcije namjerno — ako upis u `ActivityLog`
    // padne, padne i izmjena. Bolje odbijena izmjena nego tiha promjena bez
    // traga. Jedini realan uzrok pada je da korisnik iz tokena vise ne postoji
    // u bazi (`userId` je pravi strani kljuc), a to je samo po sebi vrijedno
    // da se sazna.
    const updatedTank = await prisma.$transaction(async (tx) => {
      // Staro stanje se cita PRIJE izmjene — poslije ga vise nema odakle uzeti.
      // `Tank` nema povijest; upravo je to i razlog zbog kojeg ovaj dnevnik
      // postoji.
      const prije = await tx.tank.findUnique({
        where: { id: String(id) },
        select: POLJA_DNEVNIKA_TANKA,
      });

      const poslije = await tx.tank.update({
        where: { id: String(id) },
        data: {
          broj:
            broj !== undefined && broj !== null && String(broj).trim() !== ""
              ? Number(broj)
              : undefined,
          kapacitet:
            kapacitet !== undefined &&
            kapacitet !== null &&
            String(kapacitet).trim() !== ""
              ? Number(kapacitet)
              : undefined,
          // KOLICINA SE OVDJE VISE NE PISE. Nije izostavljena nego maknuta, i
          // to je cijela poanta — vidi biljesku iznad funkcije.
          tip: tip !== undefined ? String(tip).trim() || null : undefined,
          sorta:
            sorta !== undefined ? String(sorta).trim() || null : undefined,
          // Isto pravilo kao `sorta`: nije poslano -> ne diraj, poslano prazno
          // -> obrisi. Dva polja koja opisuju isto vino moraju se moci
          // mijenjati zajedno; dok je ovdje bila samo `sorta`, razlika se nije
          // dala zatvoriti.
          nazivVina:
            nazivVina !== undefined
              ? String(nazivVina).trim() || null
              : undefined,
        },
      });

      // CIN IMENOVANJA (faza 3). Jedini put kojim COVJEK imenuje vino; sve
      // ostale zapise pisu pretok, punjenje i filtracija.
      //
      // Pise se samo kad je ime ili sorta stvarno poslana i stvarno drukcija —
      // izmjena kapaciteta ili tipa tanka nije imenovanje vina.
      //
      // `razlog` je zasad opcijski: obrazac s poljem za njega dolazi u fazi 5,
      // a do tada bi obavezan razlog zatvorio jedini put kojim se tipfeler
      // („Cvee bijeli", „Rajnski riesling") uopce moze popraviti.
      if (prije && (nazivVina !== undefined || sorta !== undefined)) {
        await zabiljeziImenovanje(tx, {
          tankId: poslije.id,
          odAt: new Date(),
          naziv: poslije.nazivVina,
          deklariranaSorta: poslije.sorta,
          izvor: "RUCNO",
          prijeNaziv: prije.nazivVina,
          prijeSorta: prije.sorta,
          korisnikId: user.id,
          razlog: typeof body.razlog === "string" ? body.razlog : null,
        });
      }

      // `prije` je null samo ako tanka nema — a tada bi `update` iznad vec
      // bacio P2025 i ovamo se ne bi ni doslo. Provjera je zbog tipa.
      if (prije) {
        await zabiljeziIzmjene(tx, {
          entityType: "Tank",
          entityId: poslije.id,
          // Broj PRIJE izmjene: tako je tank bio poznat u trenutku zahvata.
          opisEntiteta: `Tank ${prije.broj}`,
          userId: user.id,
          izmjene: razlikaPolja(prije, poslije, [
            "broj",
            "kapacitet",
            "tip",
            "sorta",
            "nazivVina",
          ]),
        });
      }

      return poslije;
    });

    return NextResponse.json(updatedTank);
  } catch (error) {
    console.error("Greška kod update tanka:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Već postoji drugi tank s tim brojem." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod ažuriranja tanka." },
      { status: 500 }
    );
  }
}

// DELETE - brisanje tanka
export async function DELETE(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nemaš pravo pristupa." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID je obavezan." },
        { status: 400 }
      );
    }

    const tankId = String(id);

    const postojeciTank = await prisma.tank.findUnique({
      where: { id: tankId },
    });

    if (!postojeciTank) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    const [
      additionsCount,
      documentsCount,
      measurementsCount,
      mixingSourcesCount,
      mjerenjaCount,
      radnjeCount,
      tankContentCount,
      targetTransfersCount,
      sourceTransfersCount,
      zadaciCount,
      udjeliSortiCount,
      pretociKaoCiljCount,
      pretociKaoIzvorCount,
      targetMixingsCount,
      filtracijeUTankCount,
    ] = await Promise.all([
      prisma.addition.count({ where: { tankId } }),
      prisma.document.count({ where: { tankId } }),
      prisma.measurement.count({ where: { tankId } }),
      prisma.mixingSource.count({ where: { sourceTankId: tankId } }),
      prisma.mjerenje.count({ where: { tankId } }),
      prisma.radnja.count({ where: { tankId } }),
      prisma.tankContent.count({ where: { tankId } }),
      prisma.transfer.count({ where: { targetTankId: tankId } }),
      prisma.transfer.count({ where: { sourceTankId: tankId } }),
      prisma.zadatak.count({ where: { tankId } }),
      prisma.tankSortaUdio.count({ where: { tankId } }),
      // Kroz `ciljevi`: broji i pretoke kojima je ovaj tank jedan od vise
      // ciljeva, ne samo one kojima je glavni.
      prisma.pretok.count({ where: { ciljevi: { some: { tankId } } } }),
      prisma.pretokIzvor.count({ where: { tankId } }),
      prisma.mixing.count({ where: { targetTankId: tankId } }),
      // Filtracije koje u ovaj tank dovode vino. ZadatakTankStavka_ciljTankId_fkey
      // je ON DELETE RESTRICT, pa bi brisanje inače puklo na P2003 i korisnik bi
      // dobio generičku poruku. Ovako dobije konkretan broj.
      prisma.zadatakTankStavka.count({ where: { ciljTankId: tankId } }),
    ]);

    const tvrdiBlokatori = [
      { naziv: "dodavanja", count: additionsCount },
      { naziv: "dokumenti", count: documentsCount },
      { naziv: "stara mjerenja (Measurement)", count: measurementsCount },
      { naziv: "mixing source zapisi", count: mixingSourcesCount },
      { naziv: "mjerenja", count: mjerenjaCount },
      { naziv: "sadržaj tanka", count: tankContentCount },
      { naziv: "transferi kao ciljni tank", count: targetTransfersCount },
      { naziv: "transferi kao izvorni tank", count: sourceTransfersCount },
      { naziv: "zadaci", count: zadaciCount },
      { naziv: "udjeli sorti", count: udjeliSortiCount },
      { naziv: "mixings kao ciljni tank", count: targetMixingsCount },
      { naziv: "filtracije u ovaj tank", count: filtracijeUTankCount },
    ].filter((x) => x.count > 0);

    if (tvrdiBlokatori.length > 0) {
      return NextResponse.json(
        {
          error:
            "Tank se ne može obrisati jer još ima povezane zapise: " +
            tvrdiBlokatori.map((x) => `${x.naziv} (${x.count})`).join(", "),
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.radnja.deleteMany({
        where: { tankId },
      });

      const pretociKaoCilj = await tx.pretok.findMany({
        where: { ciljTankId: tankId },
        select: { id: true },
      });

      if (pretociKaoCilj.length > 0) {
        await tx.pretok.deleteMany({
          where: { ciljTankId: tankId },
        });
      }

      await tx.pretokIzvor.deleteMany({
        where: { tankId },
      });

      await tx.tank.delete({
        where: { id: tankId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Greška kod brisanja tanka:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        {
          error:
            "Tank se ne može obrisati jer još ima povezane zapise u drugim tablicama.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod brisanja tanka." },
      { status: 500 }
    );
  }
}