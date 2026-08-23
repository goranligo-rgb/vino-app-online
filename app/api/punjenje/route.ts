export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";

// Tko smije UPISATI punjenje. Isti popis koji proxy.ts pusta na stranicu
// /punjenje — proxy stiti samo stranice, pa svaka ruta mora sama provjeriti
// rolu. GET se namjerno NE zakljucava: cita ga i /berba.
const ROLE_UPIS_PUNJENJA = ["ADMIN", "PODRUM"] as const;

function ocistiString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function brojIliNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Samo PRAVI boolean prolazi; sve ostalo (undefined, null, "", 0, "false")
 * postaje null.
 *
 * Zasto tako strogo: NULL znaci "nije se pitalo" i razlikuje se od false
 * ("izricito nije bilo"). Da se ovdje radio Boolean(v), nedirnuta kvacica bi
 * stigla kao false i 11 zatecenih stavki bi tiho dobilo tvrdnju koju nitko
 * nije izgovorio. Vidi prisma/schema.prisma i migraciju
 * 20260823_maceracija_na_punjenju.
 */
function booleanIliNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function datumIliNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  try {
    const punjenjaRaw = await prisma.punjenjeTanka.findMany({
      orderBy: {
        datumPunjenja: "desc",
      },
      include: {
        tank: {
          select: {
            id: true,
            broj: true,
            tip: true,
          },
        },
        stavke: {
          where: {
            obrisano: false,
          },
          orderBy: {
            createdAt: "asc",
          },
          include: {
            sorta: true,
          },
        },
        pocetnoMjerenje: true,
      },
    });

    const punjenja = punjenjaRaw.map((p) => {
      const ukupnoLitara = p.stavke.reduce(
        (sum, s) => sum + Number(s.kolicinaLitara || 0),
        0
      );

      const ukupnoKgGrozdja = p.stavke.reduce(
        (sum, s) => sum + Number(s.kolicinaKgGrozdja || 0),
        0
      );

      return {
        ...p,
        ukupnoLitara,
        ukupnoKgGrozdja,
      };
    });

    return NextResponse.json(punjenja);
  } catch (error) {
    console.error("Greška kod dohvaćanja punjenja:", error);
    return NextResponse.json(
      { error: "Dogodila se greška kod dohvaćanja punjenja." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    // Korisnik se cita SA SERVERA, ne iz body-ja. Kolacic je potpisan i
    // httpOnly pa ga klijent ne vidi, a `korisnikId` poslan s klijenta bio bi
    // krivotvorljiv. Isti obrazac kao app/api/izlaz-vina/route.ts:290.
    //
    // Prije ovoga ruta nije trazila prijavu uopce, pa `korisnikId` nikad nije
    // stigao — zbog cega punjenje NIJE ostavljalo `Radnja` (vidi :436).
    const user = await citajSesiju();

    if (!user?.id) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    if (!ROLE_UPIS_PUNJENJA.includes(user.role as (typeof ROLE_UPIS_PUNJENJA)[number])) {
      return NextResponse.json(
        { error: "Nemate pravo upisa punjenja." },
        { status: 403 }
      );
    }

    const korisnikId = user.id;

    const body = await req.json();

    const tankId = ocistiString(body.tankId);
    const nazivVina = ocistiString(body.nazivVina);
    const napomena = ocistiString(body.napomena);
    const opis = ocistiString(body.opis);

    const datumPunjenja = datumIliNull(body.datumPunjenja) ?? new Date();
    const stavke = Array.isArray(body.stavke) ? body.stavke : [];
    const pocetnoMjerenje =
      body.pocetnoMjerenje && typeof body.pocetnoMjerenje === "object"
        ? body.pocetnoMjerenje
        : null;

    if (!tankId) {
      return NextResponse.json(
        { error: "Tank je obavezan." },
        { status: 400 }
      );
    }

    if (stavke.length === 0) {
      return NextResponse.json(
        { error: "Mora postojati barem jedna stavka punjenja." },
        { status: 400 }
      );
    }

    const tank = await prisma.tank.findUnique({
      where: { id: tankId },
      include: {
        udjeliSorti: true,
      },
    });

    if (!tank) {
      return NextResponse.json(
        { error: "Odabrani tank ne postoji." },
        { status: 404 }
      );
    }

    const cisteStavke: Array<{
      sortaId: string | null;
      nazivSorte: string;
      opis: string | null;
      kolicinaKgGrozdja: number | null;
      kolicinaLitara: number;
      datumBerbe: Date | null;
      godinaBerbe: number | null;
      polozaj: string | null;
      parcela: string | null;
      vinograd: string | null;
      oznakaBerbe: string | null;
      secer: number | null;
      kiseline: number | null;
      ph: number | null;
      napomenaBerbe: string | null;
      maceracija: boolean | null;
      maceracijaSati: number | null;
    }> = [];

    for (const s of stavke) {
      const sortaId = ocistiString(s.sortaId);
      const polozaj = ocistiString(s.polozaj);
      const parcela = ocistiString(s.parcela);
      const vinograd = ocistiString(s.vinograd);
      const oznakaBerbe = ocistiString(s.oznakaBerbe);
      const opisStavke = ocistiString(s.opis);
      const napomenaBerbe = ocistiString(s.napomenaBerbe);

      const datumBerbe = datumIliNull(s.datumBerbe);
      const godinaBerbe = brojIliNull(s.godinaBerbe);
      const kg = brojIliNull(s.kolicinaKgGrozdja);
      const litara = Number(s.kolicinaLitara);
      const secer = brojIliNull(s.secer);
      const kiseline = brojIliNull(s.kiseline);
      const ph = brojIliNull(s.ph);

      const maceracija = booleanIliNull(s.maceracija);
      // Sati bez potvrdjene maceracije nisu podatak nego smece: broj bez
      // tvrdnje uz koju pripada. Forma ih vec ne salje, ovo je drugi pojas.
      const maceracijaSati =
        maceracija === true ? brojIliNull(s.maceracijaSati) : null;

      let nazivSorte = ocistiString(s.nazivSorte) ?? "";

      if (sortaId) {
        const sorta = await prisma.sorta.findUnique({
          where: { id: sortaId },
        });

        if (!sorta) {
          return NextResponse.json(
            { error: "Odabrana sorta ne postoji." },
            { status: 400 }
          );
        }

        nazivSorte = sorta.naziv;
      }

      if (!nazivSorte) {
        return NextResponse.json(
          { error: "Svaka stavka mora imati sortu." },
          { status: 400 }
        );
      }

      cisteStavke.push({
        sortaId,
        nazivSorte,
        opis: opisStavke,
        kolicinaKgGrozdja: kg,
        kolicinaLitara: litara,
        datumBerbe,
        godinaBerbe,
        polozaj,
        parcela,
        vinograd,
        oznakaBerbe,
        secer,
        kiseline,
        ph,
        napomenaBerbe,
        maceracija,
        maceracijaSati,
      });
    }

    const neispravne = cisteStavke.some(
      (s) =>
        !s.nazivSorte ||
        !Number.isFinite(s.kolicinaLitara) ||
        s.kolicinaLitara <= 0 ||
        (s.kolicinaKgGrozdja !== null &&
          (!Number.isFinite(s.kolicinaKgGrozdja) || s.kolicinaKgGrozdja < 0))
    );

    if (neispravne) {
      return NextResponse.json(
        { error: "Neispravne stavke punjenja." },
        { status: 400 }
      );
    }

    const ukupnoLitara = cisteStavke.reduce(
      (sum, s) => sum + s.kolicinaLitara,
      0
    );

    const ukupnoKgGrozdja = cisteStavke.reduce(
      (sum, s) => sum + (s.kolicinaKgGrozdja ?? 0),
      0
    );

    const trenutnoUTanku = Number(tank.kolicinaVinaUTanku ?? 0);
    const slobodnoMjesto = Number(tank.kapacitet) - trenutnoUTanku;

    if (ukupnoLitara > slobodnoMjesto) {
      return NextResponse.json(
        {
          error: `U tanku je trenutno ${trenutnoUTanku} L, slobodno je još ${slobodnoMjesto} L, a pokušavaš upisati ${ukupnoLitara} L.`,
        },
        { status: 400 }
      );
    }

    const imaPocetnoMjerenje =
      !!pocetnoMjerenje &&
      [
        pocetnoMjerenje.alkohol,
        pocetnoMjerenje.ukupneKiseline,
        pocetnoMjerenje.hlapiveKiseline,
        pocetnoMjerenje.slobodniSO2,
        pocetnoMjerenje.ukupniSO2,
        pocetnoMjerenje.secer,
        pocetnoMjerenje.ph,
        pocetnoMjerenje.temperatura,
        pocetnoMjerenje.bentotestStatus,
        pocetnoMjerenje.napomena,
      ].some((v) => v !== null && v !== undefined && v !== "");

    const punjenje = await prisma.$transaction(async (tx) => {
      let createdMjerenjeId: string | null = null;

      if (imaPocetnoMjerenje) {
        const createdMjerenje = await tx.mjerenje.create({
          data: {
            tankId,
            korisnikId: ocistiString(
              pocetnoMjerenje.korisnikId ?? korisnikId
            ),
            alkohol: brojIliNull(pocetnoMjerenje.alkohol),
            ukupneKiseline: brojIliNull(pocetnoMjerenje.ukupneKiseline),
            hlapiveKiseline: brojIliNull(pocetnoMjerenje.hlapiveKiseline),
            slobodniSO2: brojIliNull(pocetnoMjerenje.slobodniSO2),
            ukupniSO2: brojIliNull(pocetnoMjerenje.ukupniSO2),
            secer: brojIliNull(pocetnoMjerenje.secer),
            ph: brojIliNull(pocetnoMjerenje.ph),
            temperatura: brojIliNull(pocetnoMjerenje.temperatura),
            bentotestDatum: datumIliNull(pocetnoMjerenje.bentotestDatum),
            bentotestStatus: ocistiString(pocetnoMjerenje.bentotestStatus),
            napomena: ocistiString(pocetnoMjerenje.napomena),
            izmjerenoAt:
              datumIliNull(pocetnoMjerenje.izmjerenoAt) ?? datumPunjenja,
          },
        });

        createdMjerenjeId = createdMjerenje.id;
      }

      const prethodniSastavJson =
        tank.udjeliSorti && tank.udjeliSorti.length > 0
          ? tank.udjeliSorti.map((u) => ({
              nazivSorte: u.nazivSorte,
              postotak: u.postotak,
            }))
          : [];

      const created = await tx.punjenjeTanka.create({
        data: {
          tankId,
          // Tko je punio. Ruta vec cita sesiju; dosad je korisnik zavrsavao samo
          // na pripadnoj Radnja, pa se iz samog punjenja nije znalo tko ga je
          // napravio.
          korisnikId,
          nazivVina,
          datumPunjenja,
          napomena,
          opis,
          ukupnoLitara,
          ukupnoKgGrozdja,
          pocetnoMjerenjeId: createdMjerenjeId,

          prethodnaKolicinaUTanku: trenutnoUTanku,
          prethodnaSorta: tank.sorta ?? null,
          prethodniNazivVina: tank.nazivVina ?? null,
          prethodnoGodiste: tank.godiste ?? null,
          prethodniSastavJson: prethodniSastavJson,

          stavke: {
            create: cisteStavke.map((s) => ({
              sortaId: s.sortaId,
              nazivSorte: s.nazivSorte,
              opis: s.opis,
              kolicinaKgGrozdja: s.kolicinaKgGrozdja,
              kolicinaLitara: s.kolicinaLitara,
              datumBerbe: s.datumBerbe,
              godinaBerbe: s.godinaBerbe,
              polozaj: s.polozaj,
              parcela: s.parcela,
              vinograd: s.vinograd,
              oznakaBerbe: s.oznakaBerbe,
              secer: s.secer,
              kiseline: s.kiseline,
              ph: s.ph,
              napomenaBerbe: s.napomenaBerbe,
              maceracija: s.maceracija,
              maceracijaSati: s.maceracijaSati,
            })),
          },
        },
        include: {
          tank: {
            select: {
              id: true,
              broj: true,
              tip: true,
            },
          },
          stavke: {
            where: {
              obrisano: false,
            },
            include: {
              sorta: true,
            },
          },
          pocetnoMjerenje: true,
        },
      });

      const glavnaSorta =
        cisteStavke.length === 1
          ? cisteStavke[0].nazivSorte
          : nazivVina || "Cuvée";

      const godinaZaTank =
        cisteStavke.length === 1 ? cisteStavke[0].godinaBerbe ?? null : null;

      const novaKolicinaUTanku = trenutnoUTanku + ukupnoLitara;

      await tx.tank.update({
        where: { id: tankId },
        data: {
          kolicinaVinaUTanku: novaKolicinaUTanku,
          nazivVina: nazivVina,
          sorta: glavnaSorta,
          godiste: godinaZaTank,
        },
      });

      await tx.tankContent.upsert({
        where: { tankId },
        update: {
          sorta:
            cisteStavke.length === 1
              ? cisteStavke[0].nazivSorte
              : nazivVina || "Mješavina",
          kolicina: novaKolicinaUTanku,
          datumUlaza: datumPunjenja,
        },
        create: {
          tankId,
          sorta:
            cisteStavke.length === 1
              ? cisteStavke[0].nazivSorte
              : nazivVina || "Mješavina",
          kolicina: novaKolicinaUTanku,
          datumUlaza: datumPunjenja,
        },
      });

      const litaraPoSortiPunjenje = new Map<string, number>();

      for (const stavka of cisteStavke) {
        const naziv = stavka.nazivSorte.trim();
        const stara = litaraPoSortiPunjenje.get(naziv) ?? 0;
        litaraPoSortiPunjenje.set(naziv, stara + stavka.kolicinaLitara);
      }

      const litaraPoSortiUkupno = new Map<string, number>();

      if (trenutnoUTanku > 0 && tank.udjeliSorti.length > 0) {
        for (const u of tank.udjeliSorti) {
          const litaraPostojece = (trenutnoUTanku * Number(u.postotak)) / 100;
          const stara = litaraPoSortiUkupno.get(u.nazivSorte) ?? 0;
          litaraPoSortiUkupno.set(u.nazivSorte, stara + litaraPostojece);
        }
      }

      for (const [nazivSorte, litara] of litaraPoSortiPunjenje.entries()) {
        const stara = litaraPoSortiUkupno.get(nazivSorte) ?? 0;
        litaraPoSortiUkupno.set(nazivSorte, stara + litara);
      }

      const noviUdjeli = Array.from(litaraPoSortiUkupno.entries())
        .map(([nazivSorte, litara]) => ({
          nazivSorte,
          postotak: novaKolicinaUTanku > 0 ? (litara / novaKolicinaUTanku) * 100 : 0,
        }))
        .filter((u) => u.postotak > 0);

      await tx.tankSortaUdio.deleteMany({
        where: { tankId },
      });

      if (noviUdjeli.length > 0) {
        await tx.tankSortaUdio.createMany({
          data: noviUdjeli.map((u) => ({
            tankId,
            nazivSorte: u.nazivSorte,
            postotak: u.postotak,
          })),
        });
      }

      // Punjenje MORA ostaviti trag u radnjama. Uvjet `if (korisnikId)` koji
      // je ovdje stajao nikad nije bio ispunjen — forma korisnika nije slala,
      // pa nijedno punjenje nije imalo svoju radnju. Sad je korisnik zajamcen
      // (401 gore), pa uvjet vise ne postoji.
      await tx.radnja.create({
        data: {
          tankId,
          korisnikId,
          vrsta: "PUNJENJE",
          opis: nazivVina
            ? `Punjenje tanka - ${nazivVina}`
            : "Punjenje tanka",
          napomena: napomena ?? opis ?? null,
          // Trag bez litara je slab trag; zapisnik radova (faza 1) ovo cita.
          kolicina: ukupnoLitara,
        },
      });

      return created;
    });

    return NextResponse.json({
      success: true,
      punjenje,
    });
  } catch (error) {
    console.error("Greška kod spremanja punjenja:", error);
    return NextResponse.json(
      { error: "Dogodila se greška kod spremanja punjenja." },
      { status: 500 }
    );
  }
}