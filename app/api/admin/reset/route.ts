import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

type AuthUser = {
  id: string;
  ime: string;
  username?: string | null;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

type ResetOptions = {
  obrisiTankove?: boolean;
  obrisiPreparat?: boolean;
  nulirajKolicinePreparata?: boolean;
  obrisiMjerenja?: boolean;
  obrisiZadatke?: boolean;
  obrisiRadnje?: boolean;
  obrisiPretokeIMijesanja?: boolean;
  obrisiPunjenjaIArhivu?: boolean;
  obrisiKorisnikeOsimAdmina?: boolean;
};

async function getCurrentUserFromCookie(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("auth_user")?.value;

  if (!raw) return null;

  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUserFromCookie();

    if (!currentUser) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    if (currentUser.role !== "ADMIN" || currentUser.username !== "goran") {
      return NextResponse.json(
        { error: "Samo ovlašteni korisnik može pokrenuti reset." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const confirmText = body?.confirmText;
    const options: ResetOptions = body?.options ?? {};

    if (confirmText !== "OBRISI") {
      return NextResponse.json(
        { error: "Za potvrdu morate upisati OBRISI." },
        { status: 400 }
      );
    }

    if (!Object.values(options).some(Boolean)) {
      return NextResponse.json(
        { error: "Morate označiti barem jednu stavku za brisanje." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      if (options.obrisiPunjenjaIArhivu) {
        await tx.arhivaPunjenjeStavka.deleteMany();
        await tx.arhivaPunjenjeTanka.deleteMany();

        await tx.arhivaVinaZadatakStavka.deleteMany();
        await tx.arhivaVinaZadatak.deleteMany();
        await tx.arhivaVinaMjerenje.deleteMany();
        await tx.arhivaVinaUdioSorte.deleteMany();
        await tx.arhivaVinaDokument.deleteMany();

        await tx.blendIzvor.deleteMany();
        await tx.arhivaVina.deleteMany();

        await tx.punjenjeStavka.deleteMany();
        await tx.punjenjeTanka.deleteMany();

        await tx.izlazVina.deleteMany();
      }

      if (options.obrisiPretokeIMijesanja) {
        await tx.pretokMjerenje.deleteMany();
        await tx.pretokSnapshotSorta.deleteMany();
        await tx.pretokSnapshotBlend.deleteMany();
        await tx.pretokSnapshot.deleteMany();
        await tx.pretokIzvor.deleteMany();
        await tx.pretok.deleteMany();

        await tx.mixingSource.deleteMany();
        await tx.mixing.deleteMany();
        await tx.transfer.deleteMany();

        await tx.blendIzvor.deleteMany();
      }

      if (options.obrisiMjerenja) {
        await tx.measurement.deleteMany();
        await tx.mjerenje.deleteMany();
      }

      if (options.obrisiZadatke) {
        await tx.zadatakStavka.deleteMany();
        await tx.zadatak.deleteMany();
      }

      if (options.obrisiRadnje) {
        await tx.radnja.deleteMany();
        await tx.addition.deleteMany();
        await tx.activityLog.deleteMany();
      }

      if (options.obrisiTankove) {
        await tx.document.deleteMany();
        await tx.tankSortaUdio.deleteMany();
        await tx.tankContent.deleteMany();

        await tx.izlazVina.deleteMany();
        await tx.punjenjeStavka.deleteMany();
        await tx.punjenjeTanka.deleteMany();

        await tx.pretokMjerenje.deleteMany();
        await tx.pretokSnapshotSorta.deleteMany();
        await tx.pretokSnapshotBlend.deleteMany();
        await tx.pretokSnapshot.deleteMany();
        await tx.pretokIzvor.deleteMany();
        await tx.pretok.deleteMany();

        await tx.mixingSource.deleteMany();
        await tx.mixing.deleteMany();
        await tx.transfer.deleteMany();

        await tx.blendIzvor.deleteMany();

        await tx.measurement.deleteMany();
        await tx.mjerenje.deleteMany();

        await tx.zadatakStavka.deleteMany();
        await tx.zadatak.deleteMany();

        await tx.radnja.deleteMany();
        await tx.addition.deleteMany();

        await tx.tank.deleteMany();
      }

      if (options.obrisiPreparat) {
        await tx.zadatakStavka.deleteMany();
        await tx.zadatak.deleteMany();
        await tx.radnja.deleteMany();
        await tx.addition.deleteMany();
        await tx.preparationStockEntry.deleteMany();

        await tx.preparation.deleteMany();
        await tx.preparat.deleteMany();
      }

      if (options.nulirajKolicinePreparata) {
        await tx.preparation.updateMany({
          data: {
            stanjeNaSkladistu: 0,
          },
        });
      }

      if (options.obrisiKorisnikeOsimAdmina) {
        await tx.activityLog.deleteMany();
        await tx.addition.deleteMany();
        await tx.measurement.deleteMany();
        await tx.mjerenje.deleteMany();
        await tx.radnja.deleteMany();
        await tx.transfer.deleteMany();
        await tx.mixing.deleteMany();
        await tx.zadatakStavka.deleteMany();
        await tx.zadatak.deleteMany();

        await tx.user.deleteMany({
          where: {
            role: {
              not: "ADMIN",
            },
          },
        });
      }

      const trebaResetiratiStanjeTankova =
        !options.obrisiTankove &&
        (
          options.obrisiPunjenjaIArhivu ||
          options.obrisiPretokeIMijesanja ||
          options.obrisiMjerenja ||
          options.obrisiZadatke ||
          options.obrisiRadnje
        );

      if (trebaResetiratiStanjeTankova) {
        await tx.document.deleteMany();
        await tx.tankSortaUdio.deleteMany();
        await tx.tankContent.deleteMany();

        await tx.tank.updateMany({
          data: {
            kolicinaVinaUTanku: 0,
            sorta: null,
            nazivVina: null,
            godiste: null,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      message: "Reset je uspješno izvršen.",
    });
  } catch (error) {
    console.error("ADMIN RESET ERROR:", error);
    return NextResponse.json(
      { error: "Došlo je do greške prilikom reseta." },
      { status: 500 }
    );
  }
}