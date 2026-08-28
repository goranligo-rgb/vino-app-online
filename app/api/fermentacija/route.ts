/**
 * GRANICA FERMENTACIJE — otvaranje i zatvaranje.
 *
 * POST   otvara fermentaciju na tanku (pocetakAt)
 * PATCH  zatvara postojecu (krajAt)
 *
 * Ovo je JEDINO mjesto koje pise u `Fermentacija`. Sve ostalo — koje vino, kroz
 * koje tankove, s kojim preparatima i na kojoj temperaturi — racuna se pri
 * prikazu iz knjige kretanja (lib/fermentacija-prozor.ts) i nikad se ne prepisuje
 * ovamo. Zato ovdje nema `berbaId` ni popisa tankova.
 *
 * ZASTITA: ruta provjerava rolu SAMA. `proxy.ts` svojim matcherom pokriva
 * stranice, ali ne i `/api/*` — bez ove provjere ruta bi odgovarala svakome tko
 * zna URL. Smiju ADMIN, ENOLOG i PODRUM (`smijeRaditiUPodrumu`); PREGLED je
 * razina samo za citanje.
 *
 * KORISNIK IZ SESIJE, NE IZ TIJELA ZAHTJEVA. Isto pravilo koje je 28.08.2026.
 * popravljeno na /api/mjerenje: tijelo zahtjeva ne smije odredivati tko je nesto
 * napravio, inace svatko moze potpisati tudim imenom. `korisnikId` je onaj tko
 * otvara, `zatvorioKorisnikId` onaj tko zatvara — u smjeni to nisu iste osobe.
 *
 * GUARD NA KRAJU: baza vec brani kraj prije pocetka (`Fermentacija_kraj_chk`),
 * ali CHECK koji pukne dolazi do korisnika kao 500 i nerazumljiva poruka. Zato
 * se isto pravilo provjerava i ovdje, prije upisa, i vraca kao 400 s recenicom
 * koju covjek razumije. CHECK ostaje kao zadnja brana — provjera u kodu je
 * uljudnost, ne zamjena za nju.
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, smijeRaditiUPodrumu } from "@/lib/zadatak-auth";

function datumIliNull(v: unknown): Date | null {
  if (v === "" || v === null || v === undefined) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sitni pomak u buducnost je sat na uredaju, ne greska; dan nije. */
const DOPUSTENO_UNAPRIJED_MS = 24 * 60 * 60 * 1000;

function ocistiString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function POST(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }
  if (!smijeRaditiUPodrumu(user)) {
    return NextResponse.json(
      { error: "Nemate prava za ovu radnju." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { tankId, pocetakAt, kvasacZadatakId, kvasacPreparatId, napomena } = body;

    if (!tankId) {
      return NextResponse.json({ error: "Tank je obavezan." }, { status: 400 });
    }

    const pocetak = datumIliNull(pocetakAt);
    if (!pocetak) {
      return NextResponse.json(
        { error: "Datum početka fermentacije je obavezan." },
        { status: 400 }
      );
    }

    if (pocetak.getTime() > Date.now() + DOPUSTENO_UNAPRIJED_MS) {
      return NextResponse.json(
        { error: "Datum početka ne može biti u budućnosti." },
        { status: 400 }
      );
    }

    const tank = await prisma.tank.findUnique({
      where: { id: String(tankId) },
      select: { id: true, broj: true },
    });
    if (!tank) {
      return NextResponse.json({ error: "Tank ne postoji." }, { status: 404 });
    }

    // Jedna otvorena po tanku — provjera je OVDJE, ne u bazi. Jedinstveni
    // indeks bi bio kriv: vino koje ode iz T11 u T26 ostavlja T11 slobodnim za
    // novi most dok mu je fermentacija jos otvorena s tankId = T11 (vidi
    // obrazlozenje u migration.sql). Ovdje se brani samo dvostruki klik i
    // zaboravljeno zatvaranje, a pravilo se smije olabaviti bez migracije.
    const vecOtvorena = await prisma.fermentacija.findFirst({
      where: { tankId: tank.id, krajAt: null, obrisano: false },
      orderBy: { pocetakAt: "desc" },
      select: { id: true, pocetakAt: true },
    });

    if (vecOtvorena) {
      return NextResponse.json(
        {
          error:
            `Tank ${tank.broj} već ima otvorenu fermentaciju ` +
            `(od ${vecOtvorena.pocetakAt.toLocaleDateString("hr-HR")}). ` +
            "Prvo ju zatvorite.",
        },
        { status: 409 }
      );
    }

    // Kvasac se ne pogadja: ako klijent posalje zadatak, naziv se PREPISUJE sa
    // stavke tog zadatka. Prepisuje, a ne cita kroz relaciju — preimenovanje
    // ili gasenje preparata ne smije promijeniti ono sto na zapisu vec pise.
    // Isto pravilo kao Berba.nazivSorte.
    let kvasacNaziv: string | null = null;
    const preparatId = ocistiString(kvasacPreparatId);
    const zadatakId = ocistiString(kvasacZadatakId);

    if (preparatId) {
      const p = await prisma.preparation.findUnique({
        where: { id: preparatId },
        select: { naziv: true },
      });
      if (!p) {
        return NextResponse.json(
          { error: "Odabrani preparat ne postoji." },
          { status: 400 }
        );
      }
      kvasacNaziv = p.naziv;
    }

    const fermentacija = await prisma.fermentacija.create({
      data: {
        tankId: tank.id,
        pocetakAt: pocetak,
        // RUCNO = covjek je upisao datum. IZ_ZADATKA = potvrdio je ponudeni
        // datum dodavanja kvasca. Ispis smije reci koje je od toga; pogadjati
        // se ne smije.
        pocetakIzvor: zadatakId ? "IZ_ZADATKA" : "RUCNO",
        kvasacZadatakId: zadatakId,
        kvasacPreparatId: preparatId,
        kvasacNaziv,
        napomena: ocistiString(napomena),
        korisnikId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Fermentacija je otvorena.",
      fermentacija,
    });
  } catch (error) {
    console.error("Greška kod otvaranja fermentacije:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod otvaranja fermentacije.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }
  if (!smijeRaditiUPodrumu(user)) {
    return NextResponse.json(
      { error: "Nemate prava za ovu radnju." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { id, krajAt, napomena } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID fermentacije je obavezan." },
        { status: 400 }
      );
    }

    const kraj = datumIliNull(krajAt);
    if (!kraj) {
      return NextResponse.json(
        { error: "Datum kraja fermentacije je obavezan." },
        { status: 400 }
      );
    }

    if (kraj.getTime() > Date.now() + DOPUSTENO_UNAPRIJED_MS) {
      return NextResponse.json(
        { error: "Datum kraja ne može biti u budućnosti." },
        { status: 400 }
      );
    }

    const postojeca = await prisma.fermentacija.findUnique({
      where: { id: String(id) },
      select: { id: true, pocetakAt: true, krajAt: true, obrisano: true },
    });

    if (!postojeca || postojeca.obrisano) {
      return NextResponse.json(
        { error: "Fermentacija ne postoji." },
        { status: 404 }
      );
    }

    if (postojeca.krajAt) {
      return NextResponse.json(
        {
          error:
            "Ova fermentacija je već zatvorena " +
            `(${postojeca.krajAt.toLocaleDateString("hr-HR")}).`,
        },
        { status: 409 }
      );
    }

    // Isto pravilo koje brani `Fermentacija_kraj_chk` u bazi, samo receno
    // ljudski i PRIJE upisa. CHECK ostaje zadnja brana.
    if (kraj.getTime() < postojeca.pocetakAt.getTime()) {
      return NextResponse.json(
        {
          error:
            "Kraj fermentacije ne može biti prije početka " +
            `(${postojeca.pocetakAt.toLocaleDateString("hr-HR")}).`,
        },
        { status: 400 }
      );
    }

    const fermentacija = await prisma.fermentacija.update({
      where: { id: postojeca.id },
      data: {
        krajAt: kraj,
        // Tko je zatvorio — iz sesije. `korisnikId` (tko je otvorio) se NE dira.
        zatvorioKorisnikId: user.id,
        ...(ocistiString(napomena) ? { napomena: ocistiString(napomena) } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Fermentacija je zatvorena.",
      fermentacija,
    });
  } catch (error) {
    console.error("Greška kod zatvaranja fermentacije:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod zatvaranja fermentacije.",
      },
      { status: 500 }
    );
  }
}
