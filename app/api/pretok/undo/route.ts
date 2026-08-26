export const dynamic = "force-dynamic";

// Ista granica kao u POST /api/pretok — ponistavanje vraca isti opseg zapisa
// koji je pretok napravio, pa mu treba isti budzet:
//   Prisma najgori slucaj = maxWait 5 s + timeout 30 s = 35 s
//   maxDuration           = 60 s
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, smijeUpravljati } from "@/lib/zadatak-auth";
import { razlogZabranePonistavanja } from "@/lib/pretok-ponistavanje";
import { zabiljeziPonistenje } from "@/lib/berba-knjiga";

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

export async function POST(req: Request) {
  try {
    // Ista rupa kao na POST /api/pretok — vidi tamosnji komentar.
    //
    // Ovdje je granica STROZA: `smijeUpravljati` (ADMIN, ENOLOG), ne
    // `smijeRaditiUPodrumu`. Ponistavanje vraca tankove na staro stanje i brise
    // pretok; to se tesko vraca, pa ide uz isto pravilo kao ponistavanje
    // filtracije (app/api/zadatak/filtracija/ponisti/route.ts).
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    if (!smijeUpravljati(user)) {
      return NextResponse.json(
        { error: "Nemate pravo poništiti pretok." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const pretokId = String(body?.pretokId ?? "").trim();

    if (!pretokId) {
      return NextResponse.json(
        { error: "Nedostaje pretokId." },
        { status: 400 }
      );
    }

    const pretok = await prisma.pretok.findUnique({
      where: { id: pretokId },
      include: {
        izvori: true,
        ciljevi: true,
        snapshoti: {
          include: {
            sorte: true,
            blendovi: true,
          },
        },
        mjerenja: true,
      },
    });

    if (!pretok) {
      return NextResponse.json(
        { error: "Pretok nije pronađen." },
        { status: 404 }
      );
    }

    if (!pretok.snapshoti || pretok.snapshoti.length === 0) {
      return NextResponse.json(
        {
          error:
            "Za ovaj pretok ne postoji spremljeni snapshot pa ga nije moguće sigurno vratiti.",
        },
        { status: 400 }
      );
    }

    // Ciljevi dolaze iz `ciljevi`; `ciljTankId` ostaje u popisu jer je i dalje
    // upisan kao glavni cilj i na starim pretocima je jedini izvor te veze.
    const sviTankoviIds = uniqueStrings([
      pretok.ciljTankId,
      ...pretok.ciljevi.map((c) => c.tankId),
      ...pretok.izvori.map((i) => i.tankId),
    ]);

    const autoMjerenjeIds = pretok.mjerenja.map((m) => m.mjerenjeId);

    // Provjera kasnijih pretoka
    const kasnijiPretok = await prisma.pretok.findFirst({
      where: {
        id: { not: pretok.id },
        createdAt: { gt: pretok.createdAt },
        OR: [
          { ciljevi: { some: { tankId: { in: sviTankoviIds } } } },
          {
            izvori: {
              some: {
                tankId: { in: sviTankoviIds },
              },
            },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
      },
    });

    if (kasnijiPretok) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasniji pretoci na uključenim tankovima. Najprije treba vratiti sve kasnije promjene na polaznu točku.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih mjerenja (osim auto-mjerenja od ovog pretoka)
    const kasnijeMjerenje = await prisma.mjerenje.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        izmjerenoAt: { gt: pretok.createdAt },
        id: autoMjerenjeIds.length > 0 ? { notIn: autoMjerenjeIds } : undefined,
      },
      orderBy: { izmjerenoAt: "asc" },
      select: {
        id: true,
        tankId: true,
        izmjerenoAt: true,
      },
    });

    if (kasnijeMjerenje) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasnija mjerenja na uključenim tankovima. Najprije treba obrisati kasnije promjene i vratiti stanje na trenutak prije pretoka.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih izlaza vina
    const kasnijiIzlaz = await prisma.izlazVina.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        createdAt: { gt: pretok.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
      },
    });

    if (kasnijiIzlaz) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasniji izlazi vina na uključenim tankovima. Najprije treba vratiti sve kasnije promjene.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih punjenja
    const kasnijePunjenje = await prisma.punjenjeTanka.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        createdAt: { gt: pretok.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
      },
    });

    if (kasnijePunjenje) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasnija punjenja na uključenim tankovima. Najprije treba vratiti sve kasnije promjene.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih zadataka
    const kasnijiZadatak = await prisma.zadatak.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        createdAt: { gt: pretok.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
      },
    });

    if (kasnijiZadatak) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasniji zadaci na uključenim tankovima. Najprije treba vratiti sve kasnije promjene.",
        },
        { status: 400 }
      );
    }

    // Provjera kasnijih radnji
    const kasnijaRadnja = await prisma.radnja.findFirst({
      where: {
        tankId: { in: sviTankoviIds },
        createdAt: { gt: pretok.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
      },
    });

    if (kasnijaRadnja) {
      return NextResponse.json(
        {
          error:
            "Pretok nije moguće vratiti jer postoje kasnije radnje na uključenim tankovima. Najprije treba vratiti sve kasnije promjene.",
        },
        { status: 400 }
      );
    }

    // BRANA: pretok koji je arhivirao izvorni tank se ne smije ponistiti.
    // Ide POSLIJE svih provjera kasnijih promjena — tek tada je sigurno da
    // arhiva na izvornom tanku moze biti samo od ovog pretoka.
    const zabrana = await razlogZabranePonistavanja(prisma, pretok);

    if (zabrana) {
      return NextResponse.json({ error: zabrana }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 0) KNJIGA BERBE — protustavka, PRIJE nego pretok nestane.
      //
      // NE BRIŠE SE NIŠTA. Za svaki redak knjige upisuje se njegovo zrcalo, pa
      // se zbrojevi po tanku vraćaju točno na staro, a knjiga i dalje zna i što
      // se dogodilo i da je poništeno. Zapis `Pretok` se dolje briše, ali
      // `BerbaKretanje.pretokId` je goli stupac bez stranog ključa — upravo zato
      // što zapis o vinu ne smije nestati kad nestane pretok.
      //
      // Mora ići prije brisanja samo zbog čitljivosti; funkcija traži retke po
      // `pretokId`, a njih brisanje pretoka ne dira.
      //
      // Pretoci upisani prije koraka 3 imaju retke u knjizi iz backfilla (i oni
      // nose `pretokId`). Ako ih ipak nema — stari pretok koji backfill nije
      // uspio rekonstruirati — poništavanje se ne smije zaustaviti zbog knjige,
      // pa se preskače. Razlika će se vidjeti u `npm run berba:provjeri`.
      const kretanjaUKnjizi = await tx.berbaKretanje.count({
        where: { pretokId: pretok.id },
      });

      if (kretanjaUKnjizi > 0) {
        await zabiljeziPonistenje(
          tx,
          { pretokId: pretok.id },
          {
            korisnikId: user.id,
            napomena: "Poništen pretok — vino je vraćeno u izvorne tankove.",
          }
        );
      }

      // 1) obriši auto-mjerenja vezana uz pretok
      if (pretok.mjerenja.length > 0) {
        await tx.mjerenje.deleteMany({
          where: {
            id: {
              in: pretok.mjerenja.map((m) => m.mjerenjeId),
            },
          },
        });
      }

      // 2) vrati tankove po snapshotovima
      for (const snapshot of pretok.snapshoti) {
        await tx.tank.update({
          where: { id: snapshot.tankId },
          data: {
            kolicinaVinaUTanku: snapshot.kolicinaPrije ?? 0,
            sorta: snapshot.sortaPrije,
            nazivVina: snapshot.nazivVinaPrije,
            godiste: snapshot.godistePrije,
            tip: snapshot.tipTankaPrije,
            opis: snapshot.opisPrije,
          },
        });

        // vrati sastav sorti
        await tx.tankSortaUdio.deleteMany({
          where: { tankId: snapshot.tankId },
        });

        if (snapshot.sorte.length > 0) {
          await tx.tankSortaUdio.createMany({
            data: snapshot.sorte.map((s) => ({
              tankId: snapshot.tankId,
              nazivSorte: s.nazivSorte,
              postotak: s.postotak,
            })),
          });
        }

        // vrati blend izvore samo za cilj tog snapshot tank-a
        await tx.blendIzvor.deleteMany({
          where: { ciljTankId: snapshot.tankId },
        });

        if (snapshot.blendovi.length > 0) {
          await tx.blendIzvor.createMany({
            data: snapshot.blendovi.map((b) => ({
              ciljTankId: snapshot.tankId,
              izvorTankId: b.izvorTankId,
              izvorArhivaVinaId: b.izvorArhivaVinaId,
              nazivVina: b.nazivVina,
              sorta: b.sorta,
              kolicina: b.kolicina,
              postotak: b.postotak,
            })),
          });
        }
      }

      // 3) obriši vezu pretok-mjerenje
      await tx.pretokMjerenje.deleteMany({
        where: { pretokId: pretok.id },
      });

      // 4) obriši pretok (cascade briše izvore i snapshot relacije)
      await tx.pretok.delete({
        where: { id: pretok.id },
      });
    }, { timeout: 30_000, maxWait: 5_000 });

    return NextResponse.json({
      ok: true,
      message: "Pretok je uspješno vraćen.",
    });
  } catch (error) {
    console.error("POST /api/pretok/undo error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška kod vraćanja pretoka.",
      },
      { status: 500 }
    );
  }
}