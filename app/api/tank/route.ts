// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

// GET - dohvat svih tankova
export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const tankovi = await prisma.tank.findMany({
      orderBy: { broj: "asc" },
    });

    return NextResponse.json(tankovi);
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
 * PUT - izmjena tanka: broj, kapacitet, tip, sorta.
 *
 * KOLICINU VINA NE DIRA. Ovdje su do 26.08.2026. stajala dva kvara:
 *
 *   A) polje koje nije poslano zavrsavalo je kao `0`, ne `undefined`. Susjedna
 *      polja (broj, kapacitet, tip, sorta) sva daju `undefined` — dakle "ne
 *      diraj" — pa je nula bila omaska u pisanju, ne odluka. Posljedica: poziv
 *      `{ id, tip: "inox" }` ispraznio bi tank. Rutu smije zvati svatko tko je
 *      prijavljen, ukljucujuci rolu PREGLED.
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

  try {
    const body = await req.json();

    // `kolicinaVinaUTanku` se NAMJERNO ne cita iz tijela — vidi nize.
    const { id, broj, kapacitet, tip, sorta } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID je obavezan." },
        { status: 400 }
      );
    }

    const updatedTank = await prisma.tank.update({
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
        // KOLICINA SE OVDJE VISE NE PISE. Nije izostavljena nego maknuta, i to
        // je cijela poanta — vidi biljesku iznad funkcije.
        tip: tip !== undefined ? (String(tip).trim() || null) : undefined,
        sorta:
          sorta !== undefined ? (String(sorta).trim() || null) : undefined,
      },
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