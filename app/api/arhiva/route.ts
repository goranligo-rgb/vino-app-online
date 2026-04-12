export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const arhiva = await prisma.arhivaVina.findMany({
      orderBy: {
        arhiviranoAt: "desc",
      },
    });

    return NextResponse.json(arhiva);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Greška kod učitavanja arhive." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tankId = String(body?.tankId ?? "").trim();

    if (!tankId) {
      return NextResponse.json(
        { error: "tankId je obavezan." },
        { status: 400 }
      );
    }

    const rezultat = await prisma.$transaction(async (tx) => {
      const tank = await tx.tank.findUnique({
        where: { id: tankId },
        include: {
          udjeliSorti: {
            orderBy: { postotak: "desc" },
          },
          documents: {
            orderBy: [{ datumDokumenta: "desc" }, { createdAt: "desc" }],
          },
        },
      });

      if (!tank) {
        throw new Error("Tank nije pronađen.");
      }

      const mjerenja = await tx.mjerenje.findMany({
        where: { tankId },
        orderBy: { izmjerenoAt: "desc" },
      });

      const zadaci = await tx.zadatak.findMany({
        where: {
          tankId,
          status: "IZVRSEN",
        },
        include: {
          preparat: true,
          jedinica: true,
          izlaznaJedinica: true,
          zadaoKorisnik: true,
          izvrsioKorisnik: true,
          stavke: {
            include: {
              preparat: true,
              jedinica: true,
              izlaznaJedinica: true,
            },
          },
        },
        orderBy: { zadanoAt: "desc" },
      });

      console.log(
        "STAVKE TEST:",
        zadaci.map((z) => ({
          id: z.id,
          naslov: z.naslov,
          status: z.status,
          stavke: z.stavke?.length ?? 0,
        }))
      );

      const arhiva = await tx.arhivaVina.create({
        data: {
          tankId: tank.id,
          brojTanka: tank.broj,
          sorta: tank.sorta,
          nazivVina: tank.nazivVina,
          godiste: tank.godiste,
          kolicinaVina: tank.kolicinaVinaUTanku ?? 0,
          kapacitetTanka: tank.kapacitet,
          tipTanka: tank.tip,
          tipArhive: "RUČNO_ARHIVIRANJE",
          napomena: null,
        },
      });

      if (mjerenja.length > 0) {
        for (const m of mjerenja) {
          await tx.arhivaVinaMjerenje.create({
            data: {
              arhivaVinaId: arhiva.id,
              izvornoMjerenjeId: m.id,
              tankId: m.tankId,
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
            },
          });
        }
      }

      for (const z of zadaci) {
        const arhivaZadatak = await tx.arhivaVinaZadatak.create({
          data: {
            arhivaVinaId: arhiva.id,
            izvorniZadatakId: z.id,
            tankId: z.tankId,
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
            zadaoKorisnikIme: z.zadaoKorisnik?.ime ?? null,
            izvrsioKorisnikId: z.izvrsioKorisnikId,
            izvrsioKorisnikIme: z.izvrsioKorisnik?.ime ?? null,
            zadanoAt: z.zadanoAt,
            izvrsenoAt: z.izvrsenoAt,
          },
        });

        if (z.stavke && z.stavke.length > 0) {
          for (const s of z.stavke) {
            await tx.arhivaVinaZadatakStavka.create({
              data: {
                arhivaZadatakId: arhivaZadatak.id,
                preparatId: s.preparatId ?? null,
                preparatNaziv: s.preparat?.naziv ?? null,
                doza: s.doza,
                volumenUTanku: s.volumenUTanku,
                izracunataKolicina: s.izracunataKolicina,
                jedinicaId: s.jedinicaId ?? null,
                jedinicaNaziv: s.jedinica?.naziv ?? null,
                izlaznaJedinicaId: s.izlaznaJedinicaId ?? null,
                izlaznaJedinicaNaziv: s.izlaznaJedinica?.naziv ?? null,
                redoslijed: s.redoslijed ?? 0,
              },
            });
          }
        }
      }

      for (const u of tank.udjeliSorti) {
        await tx.arhivaVinaUdioSorte.create({
          data: {
            arhivaVinaId: arhiva.id,
            izvorniUdioSorteId: u.id,
            nazivSorte: u.nazivSorte,
            postotak: u.postotak,
          },
        });
      }

      for (const d of tank.documents) {
        await tx.arhivaVinaDokument.create({
          data: {
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
          },
        });
      }

      const provjera = await tx.arhivaVina.findUnique({
        where: { id: arhiva.id },
        include: {
          zadaci: {
            include: {
              stavke: {
                orderBy: {
                  redoslijed: "asc",
                },
              },
            },
            orderBy: {
              zadanoAt: "desc",
            },
          },
        },
      });

      return {
        arhivaId: arhiva.id,
        provjera,
      };
    });

    return NextResponse.json({
      success: true,
      arhivaId: rezultat.arhivaId,
      spremljeniZadaci: rezultat.provjera?.zadaci.map((z) => ({
        id: z.id,
        naslov: z.naslov,
        brojStavki: z.stavke.length,
        stavke: z.stavke.map((s) => ({
          preparatNaziv: s.preparatNaziv,
          doza: s.doza,
          izracunataKolicina: s.izracunataKolicina,
        })),
      })),
    });
  } catch (error) {
    console.error("POST /api/arhiva error:", error);

    if (error instanceof Error && error.message === "Tank nije pronađen.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Greška kod arhiviranja vina." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const id = String(body?.id ?? "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "ID zapisa je obavezan." },
        { status: 400 }
      );
    }

    await prisma.arhivaVina.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Brisanje arhivskog zapisa nije uspjelo." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const tankId = String(body?.tankId ?? "").trim();

    if (!tankId) {
      return NextResponse.json(
        { error: "tankId je obavezan." },
        { status: 400 }
      );
    }

    const rezultat = await prisma.arhivaVina.deleteMany({
      where: { tankId },
    });

    return NextResponse.json({
      success: true,
      obrisano: rezultat.count,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Brisanje arhive za tank nije uspjelo." },
      { status: 500 }
    );
  }
}