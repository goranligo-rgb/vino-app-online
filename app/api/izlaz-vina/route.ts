export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

type AuthUser = {
  id: string;
  ime?: string;
  username?: string;
  email?: string;
  role?: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

const PRAZNO_PRAG = 0.0001;

async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("auth_user")?.value;
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function broj(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDatum(value: unknown): Date {
  if (!value) return new Date();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatBrojTekst(v: number | null | undefined, decimals = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "0";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function prikaziImeKorisnika(
  korisnik:
    | {
        ime?: string | null;
        username?: string | null;
        email?: string | null;
      }
    | null
    | undefined
) {
  if (!korisnik) return null;
  return korisnik.ime ?? korisnik.username ?? korisnik.email ?? null;
}

async function arhivirajPrazanTank(
  tx: any,
  tankId: string,
  napomenaArhive: string,
  kolicinaPrijePrazenja: number
) {
  const tank = await tx.tank.findUnique({
    where: { id: tankId },
    include: {
      udjeliSorti: true,
      documents: true,
      blendIzvori: true,
      currentContent: true,
      punjenja: {
        orderBy: { datumPunjenja: "desc" },
        include: {
          stavke: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
      mjerenja: {
        orderBy: { izmjerenoAt: "desc" },
      },
      zadaci: {
        orderBy: { zadanoAt: "desc" },
        include: {
          stavke: {
            orderBy: { redoslijed: "asc" },
            include: {
              preparat: true,
              jedinica: true,
              izlaznaJedinica: true,
            },
          },
          zadaoKorisnik: true,
          izvrsioKorisnik: true,
          preparat: true,
          jedinica: true,
          izlaznaJedinica: true,
        },
      },
    },
  });

  if (!tank) return null;

  const arhiva = await tx.arhivaVina.create({
    data: {
      tankId: tank.id,
      brojTanka: tank.broj,
      sorta: tank.sorta,
      nazivVina: tank.nazivVina,
      godiste: tank.godiste,
      kolicinaVina: kolicinaPrijePrazenja,
      kapacitetTanka: tank.kapacitet,
      tipTanka: tank.tip,
      tipArhive: "IZLAZ_VINA",
      arhiviranoAt: new Date(),
      napomena: napomenaArhive,
    },
  });

  if (tank.punjenja.length > 0) {
    for (const p of tank.punjenja) {
      await tx.arhivaPunjenjeTanka.create({
        data: {
          arhivaVinaId: arhiva.id,
          izvornoPunjenjeId: p.id,
          nazivVina: p.nazivVina,
          datumPunjenja: p.datumPunjenja,
          napomena: p.napomena,
          opis: p.opis,
          ukupnoLitara: p.ukupnoLitara,
          ukupnoKgGrozdja: p.ukupnoKgGrozdja,
          pocetnoMjerenjeId: p.pocetnoMjerenjeId,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          stavke: {
            create: p.stavke.map((s: any) => ({
              izvornaPunjenjeStavkaId: s.id,
              nazivSorte: s.nazivSorte,
              sortaId: s.sortaId,
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
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
            })),
          },
        },
      });
    }
  }

  if (tank.mjerenja.length > 0) {
    await tx.arhivaVinaMjerenje.createMany({
      data: tank.mjerenja.map((m: any) => ({
        arhivaVinaId: arhiva.id,
        izvornoMjerenjeId: m.id,
        tankId: tank.id,
        korisnikId: m.korisnikId,
        alkohol: m.alkohol,
        ukupneKiseline: m.ukupneKiseline,
        hlapiveKiseline: m.hlapiveKiseline,
        slobodniSO2: m.slobodniSO2,
        ukupniSO2: m.ukupniSO2,
        secer: m.secer,
        ph: m.ph,
        temperatura: m.temperatura,
        bentotestDatum: m.bentotestDatum,
        bentotestStatus: m.bentotestStatus,
        napomena: m.napomena,
        izmjerenoAt: m.izmjerenoAt,
      })),
    });
  }

  for (const z of tank.zadaci) {
    await tx.arhivaVinaZadatak.create({
      data: {
        arhivaVinaId: arhiva.id,
        izvorniZadatakId: z.id,
        tankId: tank.id,
        vrsta: z.vrsta,
        status: z.status,
        naslov: z.naslov,
        napomena: z.napomena,
        doza: z.doza,
        volumenUTanku: z.volumenUTanku,
        izracunataKolicina: z.izracunataKolicina,
        preparatId: z.preparatId,
        preparatNaziv: z.preparat?.naziv ?? null,
        jedinicaId: z.jedinicaId,
        jedinicaNaziv: z.jedinica?.naziv ?? null,
        izlaznaJedinicaId: z.izlaznaJedinicaId,
        izlaznaJedinicaNaziv: z.izlaznaJedinica?.naziv ?? null,
        zadaoKorisnikId: z.zadaoKorisnikId,
        zadaoKorisnikIme: prikaziImeKorisnika(z.zadaoKorisnik),
        izvrsioKorisnikId: z.izvrsioKorisnikId,
        izvrsioKorisnikIme: prikaziImeKorisnika(z.izvrsioKorisnik),
        zadanoAt: z.zadanoAt,
        izvrsenoAt: z.izvrsenoAt,
        stavke: {
          create: z.stavke.map((s: any) => ({
            preparatId: s.preparatId,
            preparatNaziv: s.preparat?.naziv ?? null,
            doza: s.doza,
            volumenUTanku: s.volumenUTanku,
            izracunataKolicina: s.izracunataKolicina,
            jedinicaId: s.jedinicaId,
            jedinicaNaziv: s.jedinica?.naziv ?? null,
            izlaznaJedinicaId: s.izlaznaJedinicaId,
            izlaznaJedinicaNaziv: s.izlaznaJedinica?.naziv ?? null,
            redoslijed: s.redoslijed ?? 0,
          })),
        },
      },
    });
  }

  if (tank.udjeliSorti.length > 0) {
    await tx.arhivaVinaUdioSorte.createMany({
      data: tank.udjeliSorti.map((u: any) => ({
        arhivaVinaId: arhiva.id,
        izvorniUdioSorteId: u.id,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });
  }

  if (tank.documents.length > 0) {
    await tx.arhivaVinaDokument.createMany({
      data: tank.documents.map((d: any) => ({
        arhivaVinaId: arhiva.id,
        vrsta: d.vrsta,
        naziv: d.naziv,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        datumDokumenta: d.datumDokumenta,
        napomena: d.napomena,
        uploadedByUserId: d.uploadedByUserId,
        uploadedByIme: d.uploadedByIme,
        createdAt: d.createdAt,
      })),
    });
  }

  await tx.document.deleteMany({ where: { tankId } });
  await tx.tankSortaUdio.deleteMany({ where: { tankId } });
  await tx.mjerenje.deleteMany({ where: { tankId } });
  await tx.zadatak.deleteMany({ where: { tankId } });
  await tx.blendIzvor.deleteMany({ where: { ciljTankId: tankId } });
  await tx.tankContent.deleteMany({ where: { tankId } });

  await tx.punjenjeStavka.deleteMany({
    where: {
      punjenje: {
        tankId,
      },
    },
  });

  await tx.punjenjeTanka.deleteMany({ where: { tankId } });

  await tx.tank.update({
    where: { id: tankId },
    data: {
      kolicinaVinaUTanku: 0,
      sorta: null,
      nazivVina: null,
      godiste: null,
      opis: null,
    },
  });

  return arhiva;
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const tankId = String(body?.tankId || "").trim();
    const tip = String(body?.tip || "").trim().toUpperCase();
    const datum = parseDatum(body?.datum);
    const kolicinaLitara = broj(body?.kolicinaLitara);
    const brojBocaRaw = broj(body?.brojBoca);
    const volumenBoce = broj(body?.volumenBoce);
    const korisnickaNapomena =
      body?.napomena && String(body.napomena).trim()
        ? String(body.napomena).trim()
        : null;

    if (!tankId) {
      return NextResponse.json(
        { error: "Tank je obavezan." },
        { status: 400 }
      );
    }

    if (tip !== "PRODAJA" && tip !== "PUNJENJE") {
      return NextResponse.json(
        { error: "Tip mora biti PRODAJA ili PUNJENJE." },
        { status: 400 }
      );
    }

    if (kolicinaLitara === null || kolicinaLitara <= 0) {
      return NextResponse.json(
        { error: "Količina litara mora biti veća od 0." },
        { status: 400 }
      );
    }

    if (tip === "PUNJENJE" && (volumenBoce === null || volumenBoce <= 0)) {
      return NextResponse.json(
        { error: "Volumen boce mora biti veći od 0." },
        { status: 400 }
      );
    }

    const tank = await prisma.tank.findUnique({
      where: { id: tankId },
      select: {
        id: true,
        broj: true,
        sorta: true,
        nazivVina: true,
        godiste: true,
        kolicinaVinaUTanku: true,
      },
    });

    if (!tank) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    const trenutnoLitara = Number(tank.kolicinaVinaUTanku ?? 0);

    if (kolicinaLitara > trenutnoLitara) {
      return NextResponse.json(
        {
          error: `Nema dovoljno vina u tanku. Trenutno stanje je ${trenutnoLitara} L.`,
        },
        { status: 400 }
      );
    }

    let brojBoca: number | null = null;

    if (tip === "PUNJENJE") {
      if (brojBocaRaw !== null && brojBocaRaw >= 0) {
        brojBoca = Math.round(brojBocaRaw);
      } else if (volumenBoce && volumenBoce > 0) {
        brojBoca = Math.floor(kolicinaLitara / volumenBoce);
      }
    }

    const novoStanje = Math.max(
      0,
      Number((trenutnoLitara - kolicinaLitara).toFixed(3))
    );

    const autoNapomena =
      tip === "PUNJENJE"
        ? `Napunjeno ${brojBoca ?? 0} boca od ${formatBrojTekst(volumenBoce)} L`
        : `Prodano rinfuza ${formatBrojTekst(kolicinaLitara)} L`;

    const opisRadnje =
      tip === "PUNJENJE"
        ? `Napunjeno ${brojBoca ?? 0} boca od ${formatBrojTekst(volumenBoce)} L iz tanka ${tank.broj}`
        : `Prodano rinfuza ${formatBrojTekst(kolicinaLitara)} L iz tanka ${tank.broj}`;

    const izlazNapomena = korisnickaNapomena ?? autoNapomena;

    const rezultat = await prisma.$transaction(async (tx) => {
      const izlaz = await tx.izlazVina.create({
        data: {
          tankId,
          tip,
          datum,
          kolicinaLitara,
          brojBoca,
          volumenBoce,
          napomena:
            novoStanje <= PRAZNO_PRAG
              ? `${izlazNapomena} • završni izlaz • tank ispražnjen • arhivirano`
              : izlazNapomena,
        },
      });

      await tx.tank.update({
        where: { id: tankId },
        data: {
          kolicinaVinaUTanku: novoStanje,
        },
      });

      await tx.radnja.create({
        data: {
          tankId,
          korisnikId: user.id,
          vrsta: tip === "PRODAJA" ? "OSTALO" : "PUNJENJE",
          opis: opisRadnje,
          napomena: `${izlazNapomena} • ostalo u tanku ${formatBrojTekst(novoStanje)} L`,
          kolicina: kolicinaLitara,
        },
      });

      let arhivaId: string | null = null;

      if (novoStanje <= PRAZNO_PRAG) {
        const arhiva = await arhivirajPrazanTank(
          tx,
          tankId,
          `${izlazNapomena} • tank ispražnjen do kraja automatskom arhivom nakon izlaza vina`,
          trenutnoLitara
        );
        arhivaId = arhiva?.id ?? null;
      }

      return { izlaz, arhivaId };
    });

    return NextResponse.json({
      ok: true,
      message:
        tip === "PUNJENJE"
          ? "Punjenje je evidentirano."
          : "Prodaja je evidentirana.",
      izlaz: rezultat.izlaz,
      arhivaId: rezultat.arhivaId,
      tank: {
        id: tank.id,
        broj: tank.broj,
        staroStanje: trenutnoLitara,
        novoStanje,
      },
    });
  } catch (error: any) {
    console.error("POST /api/izlaz-vina error:", error);

    if (error?.code === "P2021") {
      return NextResponse.json(
        {
          error:
            "Tablica za izlaz vina ili arhivu punjenja još nije kreirana u bazi. Prvo napravi Prisma update.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod spremanja izlaza vina." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const tankId = searchParams.get("tankId")?.trim() || undefined;
    const tipRaw = searchParams.get("tip")?.trim().toUpperCase();
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limitRaw = Number(searchParams.get("limit") || "100");

    const tip =
      tipRaw === "PRODAJA" || tipRaw === "PUNJENJE" ? tipRaw : undefined;

    const where: {
      tankId?: string;
      tip?: "PRODAJA" | "PUNJENJE";
      datum?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    if (tankId) where.tankId = tankId;
    if (tip) where.tip = tip;

    if (dateFrom || dateTo) {
      where.datum = {};
      if (dateFrom) {
        const d1 = new Date(dateFrom);
        if (!Number.isNaN(d1.getTime())) where.datum.gte = d1;
      }
      if (dateTo) {
        const d2 = new Date(dateTo);
        if (!Number.isNaN(d2.getTime())) where.datum.lte = d2;
      }
    }

    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;

    const izlazi = await prisma.izlazVina.findMany({
      where,
      orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        tank: {
          select: {
            id: true,
            broj: true,
            sorta: true,
            nazivVina: true,
            godiste: true,
          },
        },
      },
    });

    const ukupnoLitara = izlazi.reduce(
      (sum, row) => sum + Number(row.kolicinaLitara || 0),
      0
    );

    return NextResponse.json({
      ok: true,
      count: izlazi.length,
      ukupnoLitara,
      izlazi,
    });
  } catch (error: any) {
    console.error("GET /api/izlaz-vina error:", error);

    if (error?.code === "P2021") {
      return NextResponse.json({
        ok: true,
        count: 0,
        ukupnoLitara: 0,
        izlazi: [],
        warning: "Tablica IzlazVina još nije kreirana u bazi.",
      });
    }

    return NextResponse.json(
      { error: "Greška kod dohvaćanja izlaza vina." },
      { status: 500 }
    );
  }
}