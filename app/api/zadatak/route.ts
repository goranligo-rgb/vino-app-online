export const dynamic = "force-dynamic";

// Izvrsenje zadatka ide u jednoj interaktivnoj transakciji. Vercel prekida
// funkciju bez obzira na to sto Prisma radi, pa gornja granica funkcije mora
// biti OSJETNO veca od Prisminog budzeta:
//   Prisma najgori slucaj = maxWait 5 s + timeout 20 s = 25 s
//   maxDuration           = 60 s
// Prisma tako uvijek istekne prva i korisnik dobije nasu poruku umjesto grubog
// 504 FUNCTION_INVOCATION_TIMEOUT. 60 s je i najveca vrijednost koju dopusta
// najnizi Vercel plan, pa vrijedi na svakom. Isti obrazac: filtracija/izvrsi.
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { citajSesiju } from "@/lib/auth-sesija";
import type { AuthUser } from "@/lib/auth-token";
import { osigurajRedoslijed } from "@/lib/zadatak-redoslijed";

async function getAuthUser(): Promise<AuthUser | null> {
  return citajSesiju();
}

function isLevel1(user: AuthUser | null) {
  return user?.role === "ADMIN" || user?.role === "ENOLOG";
}

function canExecute(user: AuthUser | null) {
  return (
    user?.role === "ADMIN" ||
    user?.role === "ENOLOG" ||
    user?.role === "PODRUM" ||
    user?.role === "PREGLED"
  );
}

function normalizeUnit(v?: string | null) {
  return String(v ?? "").trim().toLowerCase();
}

function convertValue(value: number, from?: string | null, to?: string | null) {
  const f = normalizeUnit(from);
  const t = normalizeUnit(to);

  if (!f || !t || f === t) return Number(value);

  const mass: Record<string, number> = {
    mg: 0.001,
    g: 1,
    dkg: 10,
    kg: 1000,
  };

  const volume: Record<string, number> = {
    ml: 1,
    dl: 100,
    dcl: 100,
    l: 1000,
    hl: 100000,
  };

  if (mass[f] && mass[t]) {
    const grams = value * mass[f];
    return Number((grams / mass[t]).toFixed(4));
  }

  if (volume[f] && volume[t]) {
    const ml = value * volume[f];
    return Number((ml / volume[t]).toFixed(4));
  }

  return Number(value);
}

export async function GET() {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    const zadaci = await prisma.zadatak.findMany({
      where: {
        status: "OTVOREN",
      },
      include: {
        tank: true,
        preparat: {
          include: {
            unit: true,
            skladisnaJedinica: true,
          },
        },
        jedinica: true,
        izlaznaJedinica: true,
        zadaoKorisnik: true,
        izvrsioKorisnik: true,
        stavke: {
          include: {
            preparat: {
              include: {
                unit: true,
                skladisnaJedinica: true,
              },
            },
            jedinica: true,
            izlaznaJedinica: true,
          },
          orderBy: {
            redoslijed: "asc",
          },
        },
      },
      orderBy: [{ zakljucanDo: "asc" }, { zadanoAt: "desc" }],
    });

    return NextResponse.json(zadaci);
  } catch (error) {
    console.error("GET /api/zadatak error:", error);
    return NextResponse.json(
      { error: "Greška kod dohvaćanja zadataka." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, status, izvrsioKorisnikId, naslov, napomena } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID zadatka je obavezan." },
        { status: 400 }
      );
    }

    if (status === "IZVRSEN") {
      if (!canExecute(user)) {
        return NextResponse.json(
          { error: "Nemate pravo za izvršenje zadatka." },
          { status: 403 }
        );
      }

      const stvarniIzvrsioKorisnikId = user.id || izvrsioKorisnikId;

      if (!stvarniIzvrsioKorisnikId) {
        return NextResponse.json(
          { error: "Izvršio korisnik je obavezan." },
          { status: 400 }
        );
      }

      // Zadani Prisma timeout od 5 s je premalen. Zadatak s vise stavki znaci
      // desetke uzastopnih upita u transakciji (citanje zadatka s ugnijezdenim
      // include, provjera redoslijeda, po stavci citanje i skidanje preparata,
      // radnja po stavci, zavrsni update), a svaki nosi mreznu latenciju do
      // Supabase poolera. Zadatak s 5 stavki je na produkciji trajao 5847 ms i
      // pao na P2028 pri commitu.
      //   timeout 20 s — s rezervom za zadatke s vise stavki, a dovoljno
      //                  kratko da se brave ne drze predugo.
      //   maxWait  5 s — cekanje na slobodnu vezu iz poola prije nego
      //                  transakcija uopce pocne; nije dio timeouta, ali JEST
      //                  dio trajanja funkcije, pa se drzi nisko.
      // Opcije namjerno idu uz zatvaranje bloka, bez uvlacenja cijelog tijela,
      // da diff ostane citljiv.
      const rezultat = await prisma.$transaction(async (tx) => {
        const zadatak = await tx.zadatak.findUnique({
          where: { id: String(id) },
          include: {
            preparat: {
              include: {
                unit: true,
                skladisnaJedinica: true,
              },
            },
            jedinica: true,
            izlaznaJedinica: true,
            tank: true,
            // Samo da se prepozna filtracija koja stvarno prenosi vino.
            tankStavke: { select: { id: true } },
            stavke: {
              include: {
                preparat: {
                  include: {
                    unit: true,
                    skladisnaJedinica: true,
                  },
                },
                jedinica: true,
                izlaznaJedinica: true,
              },
              orderBy: {
                redoslijed: "asc",
              },
            },
          },
        });

        if (!zadatak) {
          throw new Error("Zadatak nije pronađen.");
        }

        if (zadatak.status === "IZVRSEN") {
          throw new Error("Zadatak je već izvršen.");
        }

        // Filtracija KOJA PRENOSI VINO (ima upisan izlaz i ciljne tankove) —
        // ova ruta to ne radi, promijenila bi samo status a količine bi ostale
        // krive. Izvršava se kroz /api/zadatak/filtracija/izvrsi.
        //
        // Stara, "gola" Filtracija bez tih podataka je samo bilješka da je
        // posao odrađen i dalje radi kao prije — takvih ima u produkciji.
        if (
          zadatak.vrsta === "FILTRACIJA" &&
          (zadatak.kolicinaIzlaz != null || zadatak.tankStavke.length > 0)
        ) {
          throw new Error(
            "Filtracija se izvršava kroz vlastiti ekran jer prenosi vino u druge tankove."
          );
        }

        if (zadatak.zakljucanDo && new Date() < new Date(zadatak.zakljucanDo)) {
          throw new Error("Vezani zadatak još nije dostupan za izvršenje.");
        }

        // Redoslijed izvršenja na istom tanku — zadatak mora pričekati
        // svaki raniji OTVOREN i nezaključan zadatak na istom tanku.
        await osigurajRedoslijed(tx, {
          id: zadatak.id,
          tankId: zadatak.tankId,
          zadanoAt: zadatak.zadanoAt,
          createdAt: zadatak.createdAt,
        });

        // ===== PROVJERA I SKIDANJE SA SKLADIŠTA =====
        const stavkeZaSkladiste =
          zadatak.stavke.length > 0
            ? zadatak.stavke
            : [
                {
                  preparatId: zadatak.preparatId,
                  izracunataKolicina: zadatak.izracunataKolicina,
                  izlaznaJedinica: zadatak.izlaznaJedinica,
                  preparat: zadatak.preparat,
                },
              ].filter(
                (s) => s.preparatId && s.izracunataKolicina != null
              );

        for (const stavka of stavkeZaSkladiste) {
          if (!stavka.preparatId || stavka.izracunataKolicina == null) continue;

          const preparation = await tx.preparation.findUnique({
            where: { id: stavka.preparatId },
            include: {
              unit: true,
              skladisnaJedinica: true,
            },
          });

          if (!preparation) {
            throw new Error("Preparat nije pronađen.");
          }

          const fromUnit =
            stavka.izlaznaJedinica?.naziv ??
            stavka.preparat?.unit?.naziv ??
            preparation.unit?.naziv ??
            null;

          const stockUnit =
            preparation.skladisnaJedinica?.naziv ??
            preparation.unit?.naziv ??
            null;

          const potrebno = convertValue(
            Number(stavka.izracunataKolicina),
            fromUnit,
            stockUnit
          );

          const trenutno = Number(preparation.stanjeNaSkladistu ?? 0);

          if (trenutno < potrebno) {
            throw new Error(
              `Nema dovoljno preparata na skladištu: ${preparation.naziv}.`
            );
          }

          await tx.preparation.update({
            where: { id: preparation.id },
            data: {
              stanjeNaSkladistu: {
                decrement: potrebno,
              },
            },
          });
        }

        // Ako zadatak ima više stavki, upiši radnju za SVAKU stavku
        if (zadatak.stavke.length > 0) {
          for (const stavka of zadatak.stavke) {
            await tx.radnja.create({
              data: {
                tankId: zadatak.tankId,
                korisnikId: String(stvarniIzvrsioKorisnikId),
                zadatakId: zadatak.id,
                vrsta: zadatak.vrsta,
                opis:
                  stavka.preparat?.naziv ||
                  zadatak.naslov?.trim() ||
                  "Izvršena radnja",
                napomena: zadatak.napomena ?? null,
                preparatId: stavka.preparatId ?? null,
                kolicina: stavka.izracunataKolicina ?? null,
                jedinicaId:
                  stavka.izlaznaJedinicaId ?? stavka.jedinicaId ?? null,
              },
            });
          }
        } else {
          // Stari način za zadatke koji imaju samo jedan preparat
          await tx.radnja.create({
            data: {
              tankId: zadatak.tankId,
              korisnikId: String(stvarniIzvrsioKorisnikId),
              zadatakId: zadatak.id,
              vrsta: zadatak.vrsta,
              opis:
                zadatak.naslov?.trim() ||
                zadatak.preparat?.naziv ||
                "Izvršena radnja",
              napomena: zadatak.napomena ?? null,
              preparatId: zadatak.preparatId ?? null,
              kolicina: zadatak.izracunataKolicina ?? null,
              jedinicaId:
                zadatak.izlaznaJedinicaId ?? zadatak.jedinicaId ?? null,
            },
          });
        }

        const datumIzvrsenja = new Date();

        const updated = await tx.zadatak.update({
          where: { id: String(id) },
          data: {
            status: "IZVRSEN",
            izvrsioKorisnikId: String(stvarniIzvrsioKorisnikId),
            izvrsenoAt: datumIzvrsenja,
          },
          include: {
            tank: true,
            preparat: {
              include: {
                unit: true,
                skladisnaJedinica: true,
              },
            },
            jedinica: true,
            izlaznaJedinica: true,
            zadaoKorisnik: true,
            izvrsioKorisnik: true,
            stavke: {
              include: {
                preparat: {
                  include: {
                    unit: true,
                    skladisnaJedinica: true,
                  },
                },
                jedinica: true,
                izlaznaJedinica: true,
              },
              orderBy: {
                redoslijed: "asc",
              },
            },
          },
        });

        if (
          zadatak.tipZadatka === "VEZANI" &&
          zadatak.vezanaVrsta &&
          zadatak.vezaniBrojDana != null
        ) {
          const vecPostojiDrugi = await tx.zadatak.findFirst({
            where: {
              parentZadatakId: zadatak.id,
            },
          });

          if (!vecPostojiDrugi) {
            const zakljucanDo = new Date(datumIzvrsenja);
            zakljucanDo.setDate(
              zakljucanDo.getDate() + Number(zadatak.vezaniBrojDana)
            );

            await tx.zadatak.create({
              data: {
                tankId: zadatak.tankId,
                zadaoKorisnikId: zadatak.zadaoKorisnikId,
                vrsta: zadatak.vezanaVrsta,
                status: "OTVOREN",

                naslov:
                  zadatak.vezaniNaslov?.trim() ||
                  (zadatak.vezanaVrsta === "PRETOK"
                    ? "Pretok"
                    : zadatak.vezanaVrsta === "MIJESANJE"
                    ? "Miješanje"
                    : "Vezani zadatak"),

                napomena: zadatak.vezanaNapomena ?? null,

                preparatId: null,
                doza: null,
                jedinicaId: null,
                volumenUTanku: zadatak.volumenUTanku ?? null,
                izracunataKolicina: null,
                izlaznaJedinicaId: null,

                tipZadatka: "STANDARDNI",
                vezanaVrsta: null,
                vezaniBrojDana: null,
                vezaniNaslov: null,
                vezanaNapomena: null,

                parentZadatakId: zadatak.id,
                zakljucanDo,
              },
            });
          }
        }

        return updated;
      }, { timeout: 20_000, maxWait: 5_000 });

      return NextResponse.json(rezultat);
    }

    if (!isLevel1(user)) {
      return NextResponse.json(
        { error: "Nemate pravo za uređivanje zadatka." },
        { status: 403 }
      );
    }

    const updated = await prisma.zadatak.update({
      where: { id: String(id) },
      data: {
        naslov:
          naslov !== undefined ? (String(naslov).trim() || null) : undefined,
        napomena:
          napomena !== undefined
            ? String(napomena).trim() || null
            : undefined,
        status: status !== undefined ? status : undefined,
      },
      include: {
        tank: true,
        preparat: {
          include: {
            unit: true,
            skladisnaJedinica: true,
          },
        },
        jedinica: true,
        izlaznaJedinica: true,
        zadaoKorisnik: true,
        izvrsioKorisnik: true,
        stavke: {
          include: {
            preparat: {
              include: {
                unit: true,
                skladisnaJedinica: true,
              },
            },
            jedinica: true,
            izlaznaJedinica: true,
          },
          orderBy: {
            redoslijed: "asc",
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/zadatak error:", error);

    if (
      error instanceof Error &&
      [
        "Zadatak nije pronađen.",
        "Zadatak je već izvršen.",
        "Vezani zadatak još nije dostupan za izvršenje.",
        "Preparat nije pronađen.",
        "Filtracija se izvršava kroz vlastiti ekran jer prenosi vino u druge tankove.",
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      (error.message.startsWith("Nema dovoljno preparata na skladištu:") ||
        error.message.startsWith(
          "Na ovom tanku postoji raniji neizvršeni zadatak:"
        ))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // P2028 = transakcija je istekla ili je zatvorena prije kraja. Postgres je
    // tada sve vratio unatrag: skladiste nije skinuto, radnje nisu upisane,
    // zadatak je i dalje otvoren. Korisniku to treba i reci, da ne pomisli da
    // je pola proslo — inace dobije "Greška kod ažuriranja zadatka" koja ne
    // govori nista. Isti obrazac: filtracija/izvrsi.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2028"
    ) {
      return NextResponse.json(
        {
          error:
            "Spremanje je predugo trajalo pa je prekinuto. Ništa nije promijenjeno — zadatak je i dalje otvoren, pokušaj ponovno.",
        },
        { status: 503 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Zadatak nije pronađen." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod ažuriranja zadatka." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    if (!isLevel1(user)) {
      return NextResponse.json(
        { error: "Nemate pravo za brisanje zadatka." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID zadatka je obavezan." },
        { status: 400 }
      );
    }

    await prisma.zadatak.delete({
      where: { id: String(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/zadatak error:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Zadatak nije pronađen." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Greška kod brisanja zadatka." },
      { status: 500 }
    );
  }
}