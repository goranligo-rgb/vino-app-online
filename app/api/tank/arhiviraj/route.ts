export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, napomena } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID tanka je obavezan." },
        { status: 400 }
      );
    }

    const tankId = String(id);

    const tank = await prisma.tank.findUnique({
      where: { id: tankId },
      include: {
        udjeliSorti: true,
        documents: true,
      },
    });

    if (!tank) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    const kolicina = Number(tank.kolicinaVinaUTanku ?? 0);

    if (kolicina <= 0) {
      return NextResponse.json(
        { error: "Tank je već prazan." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const mjerenja = await tx.mjerenje.findMany({
        where: { tankId },
        orderBy: { izmjerenoAt: "asc" },
      });

      const zadaci = await tx.zadatak.findMany({
        where: { tankId },
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
            orderBy: {
              redoslijed: "asc",
            },
          },
        },
        orderBy: { zadanoAt: "asc" },
      });

      const arhiva = await tx.arhivaVina.create({
        data: {
          tankId: tank.id,
          brojTanka: tank.broj,
          sorta: tank.sorta,
          nazivVina: tank.nazivVina,
          godiste: tank.godiste,
          kolicinaVina: kolicina,
          kapacitetTanka: tank.kapacitet,
          tipTanka: tank.tip,
          tipArhive: "RUČNO_ARHIVIRANJE",
          napomena: typeof napomena === "string" ? napomena.trim() || null : null,
        },
      });

      if (tank.udjeliSorti.length > 0) {
        await tx.arhivaVinaUdioSorte.createMany({
          data: tank.udjeliSorti.map((u) => ({
            arhivaVinaId: arhiva.id,
            izvorniUdioSorteId: u.id,
            nazivSorte: u.nazivSorte,
            postotak: u.postotak,
          })),
        });
      }

      if (mjerenja.length > 0) {
        await tx.arhivaVinaMjerenje.createMany({
          data: mjerenja.map((m) => ({
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
          })),
        });
      }

      if (zadaci.length > 0) {
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
            await tx.arhivaVinaZadatakStavka.createMany({
              data: z.stavke.map((s) => ({
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
              })),
            });
          }
        }
      }

      if (tank.documents.length > 0) {
        await tx.arhivaVinaDokument.createMany({
          data: tank.documents.map((d) => ({
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
          })),
        });
      }

      // 1. makni aktivna mjerenja, zadatke, sastav i dokumente
      await tx.mjerenje.deleteMany({ where: { tankId } });
      await tx.zadatak.deleteMany({ where: { tankId } });
      await tx.tankSortaUdio.deleteMany({ where: { tankId } });
      await tx.document.deleteMany({ where: { tankId } });

      // 2. makni punjenje / berbu iz aktivnog tanka
      await tx.punjenjeStavka.deleteMany({
        where: {
          punjenje: {
            tankId,
          },
        },
      });

      await tx.punjenjeTanka.deleteMany({
        where: { tankId },
      });

      // 3. makni samo blend porijeklo gdje je ovaj tank CILJ
      // ne diraj zapise gdje je bio IZVOR za druge tankove
      await tx.blendIzvor.deleteMany({
        where: { ciljTankId: tankId },
      });

      // 4. očisti sam tank
      await tx.tank.update({
        where: { id: tankId },
        data: {
          kolicinaVinaUTanku: 0,
          sorta: null,
          nazivVina: null,
          godiste: null,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Greška kod arhiviranja:", error);

    return NextResponse.json(
      { error: "Greška kod arhiviranja tanka." },
      { status: 500 }
    );
  }
}