import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type StavkaInput = {
  preparatId?: string | null;
  doza?: number | string | null;
  jedinicaId?: string | null;
  volumenUTanku?: number | string | null;
  izracunataKolicina?: number | string | null;
  izlaznaJedinicaId?: string | null;
  izlaznaJedinicaNaziv?: string | null;
};

async function getAuthUser() {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("auth_user")?.value;
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      tankId,
      naslov,
      napomena,
      vrsta,
      stavke = [],

      // fallback za direktan unos jednog preparata / korekcije
      preparatId = null,
      doza = null,
      jedinicaId = null,
      volumenUTanku = null,
      izracunataKolicina = null,
      izlaznaJedinicaId = null,
      izlaznaJedinicaNaziv = null,

      // korekcijska polja
      tipKorekcije = null,
      trenutnaVrijednost = null,
      zeljenaVrijednost = null,

      tipZadatka = "STANDARDNI",
      vezanaVrsta = null,
      vezaniBrojDana = null,
      vezaniNaslov = null,
      vezanaNapomena = null,
    } = body;

    if (!tankId) {
      return NextResponse.json(
        { error: "Tank je obavezan." },
        { status: 400 }
      );
    }

    const vrstaNormalizirana = String(vrsta ?? "DODAVANJE")
      .trim()
      .toUpperCase();

    const tank = await prisma.tank.findUnique({
      where: { id: String(tankId) },
      select: {
        id: true,
        kolicinaVinaUTanku: true,
      },
    });

    if (!tank) {
      return NextResponse.json(
        { error: "Tank nije pronađen." },
        { status: 404 }
      );
    }

    const volumenIzTanka = Number(tank.kolicinaVinaUTanku ?? 0);

    const ulazneStavke: StavkaInput[] = Array.isArray(stavke) ? stavke : [];

    // ako nije poslan stavke[], ali je poslan direktan preparat/korekcija,
    // pretvori ga u jednu stavku da prikaz bude svugdje isti
    const fallbackStavke: StavkaInput[] =
      String(preparatId ?? "").trim() !== ""
        ? [
            {
              preparatId: String(preparatId),
              doza,
              jedinicaId,
              volumenUTanku,
              izracunataKolicina,
              izlaznaJedinicaId,
              izlaznaJedinicaNaziv,
            },
          ]
        : [];

    const sveUlazneStavke =
      ulazneStavke.length > 0 ? ulazneStavke : fallbackStavke;

    const procisceneStavke = sveUlazneStavke.filter(
      (s) => String(s?.preparatId ?? "").trim() !== ""
    );

    const trebaPreparate =
      vrstaNormalizirana === "DODAVANJE" || vrstaNormalizirana === "KOREKCIJA";

    if (trebaPreparate && procisceneStavke.length === 0) {
      return NextResponse.json(
        { error: "Dodaj barem jedan preparat." },
        { status: 400 }
      );
    }

    if (String(tipZadatka).trim().toUpperCase() === "VEZANI") {
      const brojDana = toNumber(vezaniBrojDana);

      if (!String(vezanaVrsta ?? "").trim()) {
        return NextResponse.json(
          { error: "Vezana vrsta zadatka je obavezna." },
          { status: 400 }
        );
      }

      if (brojDana == null || brojDana < 0) {
        return NextResponse.json(
          { error: "Vezani broj dana mora biti 0 ili veći." },
          { status: 400 }
        );
      }
    }

    const naziviIzlaznihJedinica = [
      ...new Set(
        procisceneStavke
          .map((s) => String(s.izlaznaJedinicaNaziv ?? "").trim())
          .filter(Boolean)
      ),
    ];

    const jedinicePoNazivu = naziviIzlaznihJedinica.length
      ? await prisma.unit.findMany({
          where: {
            naziv: {
              in: naziviIzlaznihJedinica,
            },
          },
          select: {
            id: true,
            naziv: true,
          },
        })
      : [];

    const mapaJedinica = new Map(
      jedinicePoNazivu.map((j) => [j.naziv.trim().toLowerCase(), j.id])
    );

    const pripremljeneStavke = procisceneStavke.map((s, index) => {
      const resolvedIzlaznaJedinicaId = s.izlaznaJedinicaId
        ? String(s.izlaznaJedinicaId)
        : mapaJedinica.get(
            String(s.izlaznaJedinicaNaziv ?? "").trim().toLowerCase()
          ) ?? null;

      return {
        preparatId: String(s.preparatId),
        doza: toNumber(s.doza),
        jedinicaId: s.jedinicaId ? String(s.jedinicaId) : null,
        volumenUTanku:
          toNumber(s.volumenUTanku) != null
            ? toNumber(s.volumenUTanku)
            : volumenIzTanka,
        izracunataKolicina: toNumber(s.izracunataKolicina),
        izlaznaJedinicaId: resolvedIzlaznaJedinicaId,
        redoslijed: index,
      };
    });

    // Ako imamo točno jednu stavku, popuni i glavna polja zadatka
    // da se sve komponente koje gledaju zadatak.preparat/doza/... ponašaju jednako.
    const glavnaStavka = pripremljeneStavke.length === 1 ? pripremljeneStavke[0] : null;

    const defaultNaslov =
      vrstaNormalizirana === "KOREKCIJA"
        ? "Korekcija"
        : vrstaNormalizirana === "DODAVANJE"
        ? "Dodavanje preparata"
        : "Novi zadatak";

    const zadatak = await prisma.zadatak.create({
      data: {
        tankId: String(tankId),
        zadaoKorisnikId: String(user.id),
        vrsta: vrstaNormalizirana as any,
        naslov: String(naslov ?? "").trim() || defaultNaslov,
        napomena: String(napomena ?? "").trim() || null,
        status: "OTVOREN",

        // glavna polja radi prikaza i kompatibilnosti
        preparatId: glavnaStavka?.preparatId ?? null,
        doza: glavnaStavka?.doza ?? null,
        jedinicaId: glavnaStavka?.jedinicaId ?? null,
        volumenUTanku: glavnaStavka?.volumenUTanku ?? volumenIzTanka,
        izracunataKolicina: glavnaStavka?.izracunataKolicina ?? null,
        izlaznaJedinicaId: glavnaStavka?.izlaznaJedinicaId ?? null,

        // korekcija
        tipKorekcije:
          vrstaNormalizirana === "KOREKCIJA"
            ? String(tipKorekcije ?? "").trim() || null
            : null,
        trenutnaVrijednost:
          vrstaNormalizirana === "KOREKCIJA"
            ? toNumber(trenutnaVrijednost)
            : null,
        zeljenaVrijednost:
          vrstaNormalizirana === "KOREKCIJA"
            ? toNumber(zeljenaVrijednost)
            : null,

        tipZadatka:
          String(tipZadatka ?? "STANDARDNI").trim().toUpperCase() === "VEZANI"
            ? "VEZANI"
            : "STANDARDNI",

        vezanaVrsta:
          String(tipZadatka ?? "STANDARDNI").trim().toUpperCase() === "VEZANI"
            ? (String(vezanaVrsta ?? "").trim().toUpperCase() as any)
            : null,

        vezaniBrojDana:
          String(tipZadatka ?? "STANDARDNI").trim().toUpperCase() === "VEZANI"
            ? toNumber(vezaniBrojDana)
            : null,

        vezaniNaslov:
          String(tipZadatka ?? "STANDARDNI").trim().toUpperCase() === "VEZANI"
            ? String(vezaniNaslov ?? "").trim() || null
            : null,

        vezanaNapomena:
          String(tipZadatka ?? "STANDARDNI").trim().toUpperCase() === "VEZANI"
            ? String(vezanaNapomena ?? "").trim() || null
            : null,

        stavke: {
          create: pripremljeneStavke,
        },
      },
      include: {
        tank: true,
        preparat: {
          include: {
            unit: true,
          },
        },
        jedinica: true,
        izlaznaJedinica: true,
        zadaoKorisnik: true,
        stavke: {
          include: {
            preparat: {
              include: {
                unit: true,
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

    return NextResponse.json(zadatak);
  } catch (error) {
    console.error("CREATE zadatak error:", error);
    return NextResponse.json(
      { error: "Greška kod kreiranja zadatka." },
      { status: 500 }
    );
  }
}