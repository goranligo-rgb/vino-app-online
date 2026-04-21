import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VrstaRadnje } from "@prisma/client";

export const dynamic = "force-dynamic";

type StavkaResponse = {
  id: string;
  datum: string;
  tankId: string;
  brojTanka: number | null;
  sorta: string | null;
  nazivVina: string | null;
  godiste: number | null;
  preparatId: string | null;
  preparatNaziv: string | null;
  kolicina: number;
  jedinica: string | null;
  faktorJedinice: number;
  normaliziranaKolicina: number;
  korisnik: string | null;
  napomena: string | null;
};

type GrupiranoItem = {
  naziv: string;
  ukupno: number;
  jedinicaPrikaza: string;
  brojStavki: number;
};

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatKey(
  value: string | number | null | undefined,
  emptyLabel = "Nepoznato"
) {
  if (value === null || value === undefined || value === "") return emptyLabel;
  return String(value);
}

function getGroupUnitKey(
  jedinicaTip?: string | null,
  jedinicaNaziv?: string | null
): string {
  if (jedinicaTip && jedinicaTip.trim()) return jedinicaTip.trim().toUpperCase();
  if (jedinicaNaziv && jedinicaNaziv.trim()) {
    return `NAZIV:${jedinicaNaziv.trim().toUpperCase()}`;
  }
  return "NEPOZNATO";
}

function getDisplayUnit(
  jedinicaTip?: string | null,
  jedinicaNaziv?: string | null
): string {
  const tip = jedinicaTip?.trim().toUpperCase();

  if (tip === "MASA") return "g";
  if (tip === "VOLUMEN") return "ml";

  return jedinicaNaziv?.trim() || "jed.";
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const datumOd = searchParams.get("datumOd");
    const datumDo = searchParams.get("datumDo");
    const sorta = searchParams.get("sorta");
    const godiste = searchParams.get("godiste");
    const preparatId = searchParams.get("preparatId");

    const createdAtFilter: { gte?: Date; lte?: Date } = {};

    if (datumOd) {
      const od = new Date(`${datumOd}T00:00:00.000Z`);
      if (!Number.isNaN(od.getTime())) createdAtFilter.gte = od;
    }

    if (datumDo) {
      const doKraja = new Date(`${datumDo}T23:59:59.999Z`);
      if (!Number.isNaN(doKraja.getTime())) createdAtFilter.lte = doKraja;
    }

    const radnje = await prisma.radnja.findMany({
      where: {
        vrsta: VrstaRadnje.DODAVANJE,
        ...(Object.keys(createdAtFilter).length > 0
          ? { createdAt: createdAtFilter }
          : {}),
        ...(preparatId && preparatId !== "sve"
          ? { preparatId }
          : {}),
        tank: {
          ...(sorta && sorta !== "sve" ? { sorta } : {}),
          ...(godiste && godiste !== "sve"
            ? { godiste: Number(godiste) }
            : {}),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
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
        preparat: {
          select: {
            id: true,
            naziv: true,
            strucnoIme: true,
          },
        },
        jedinica: {
          select: {
            id: true,
            naziv: true,
            tip: true,
            faktor: true,
          },
        },
        korisnik: {
          select: {
            id: true,
            ime: true,
          },
        },
      },
    });

    const stavke: StavkaResponse[] = radnje.map((r) => {
      const faktor = toNumber(r.jedinica?.faktor, 1);
      const kolicina = toNumber(r.kolicina, 0);
      const normaliziranaKolicina = kolicina * faktor;

      return {
        id: r.id,
        datum: r.createdAt.toISOString(),
        tankId: r.tankId,
        brojTanka: r.tank?.broj ?? null,
        sorta: r.tank?.sorta ?? null,
        nazivVina: r.tank?.nazivVina ?? null,
        godiste: r.tank?.godiste ?? null,
        preparatId: r.preparat?.id ?? null,
        preparatNaziv: r.preparat?.naziv ?? null,
        kolicina,
        jedinica: r.jedinica?.naziv ?? null,
        faktorJedinice: faktor,
        normaliziranaKolicina,
        korisnik: r.korisnik?.ime ?? null,
        napomena: r.napomena ?? null,
      };
    });

    const ukupnoSveMap = new Map<
      string,
      { ukupno: number; jedinicaPrikaza: string; brojStavki: number }
    >();
    const poPreparatuMap = new Map<
      string,
      { naziv: string; ukupno: number; jedinicaPrikaza: string; brojStavki: number }
    >();
    const poSortiMap = new Map<
      string,
      { naziv: string; ukupno: number; jedinicaPrikaza: string; brojStavki: number }
    >();
    const poGodistuMap = new Map<
      string,
      { naziv: string; ukupno: number; jedinicaPrikaza: string; brojStavki: number }
    >();
    const poTankuMap = new Map<
      string,
      { naziv: string; ukupno: number; jedinicaPrikaza: string; brojStavki: number }
    >();

    for (const r of radnje) {
      const kolicina = toNumber(r.kolicina, 0);
      const faktor = toNumber(r.jedinica?.faktor, 1);
      const normalizirano = kolicina * faktor;

      const jedinicaTip = r.jedinica?.tip ?? null;
      const jedinicaNaziv = r.jedinica?.naziv ?? null;
      const unitKey = getGroupUnitKey(jedinicaTip, jedinicaNaziv);
      const jedinicaPrikaza = getDisplayUnit(jedinicaTip, jedinicaNaziv);

      {
        const key = unitKey;
        const prev = ukupnoSveMap.get(key) ?? {
          ukupno: 0,
          jedinicaPrikaza,
          brojStavki: 0,
        };
        prev.ukupno += normalizirano;
        prev.brojStavki += 1;
        ukupnoSveMap.set(key, prev);
      }

      {
        const naziv = r.preparat?.naziv ?? "Nepoznati preparat";
        const key = `${naziv}__${unitKey}`;
        const prev = poPreparatuMap.get(key) ?? {
          naziv,
          ukupno: 0,
          jedinicaPrikaza,
          brojStavki: 0,
        };
        prev.ukupno += normalizirano;
        prev.brojStavki += 1;
        poPreparatuMap.set(key, prev);
      }

      {
        const naziv = formatKey(r.tank?.sorta, "Bez sorte");
        const key = `${naziv}__${unitKey}`;
        const prev = poSortiMap.get(key) ?? {
          naziv,
          ukupno: 0,
          jedinicaPrikaza,
          brojStavki: 0,
        };
        prev.ukupno += normalizirano;
        prev.brojStavki += 1;
        poSortiMap.set(key, prev);
      }

      {
        const naziv = formatKey(r.tank?.godiste, "Bez godišta");
        const key = `${naziv}__${unitKey}`;
        const prev = poGodistuMap.get(key) ?? {
          naziv,
          ukupno: 0,
          jedinicaPrikaza,
          brojStavki: 0,
        };
        prev.ukupno += normalizirano;
        prev.brojStavki += 1;
        poGodistuMap.set(key, prev);
      }

      {
        const brojTanka = r.tank?.broj ?? null;
        const sortaTanka = r.tank?.sorta ?? null;
        const naziv = brojTanka
          ? `Tank ${brojTanka}${sortaTanka ? ` — ${sortaTanka}` : ""}`
          : "Nepoznati tank";

        const key = `${r.tankId}__${unitKey}`;
        const prev = poTankuMap.get(key) ?? {
          naziv,
          ukupno: 0,
          jedinicaPrikaza,
          brojStavki: 0,
        };
        prev.ukupno += normalizirano;
        prev.brojStavki += 1;
        poTankuMap.set(key, prev);
      }
    }

    const ukupnoSve = Array.from(ukupnoSveMap.values())
      .map((item) => ({
        ukupno: round(item.ukupno),
        jedinicaPrikaza: item.jedinicaPrikaza,
        brojStavki: item.brojStavki,
      }))
      .sort((a, b) => b.ukupno - a.ukupno);

    const poPreparatu: GrupiranoItem[] = Array.from(poPreparatuMap.values())
      .map((item) => ({
        naziv: item.naziv,
        ukupno: round(item.ukupno),
        jedinicaPrikaza: item.jedinicaPrikaza,
        brojStavki: item.brojStavki,
      }))
      .sort((a, b) => b.ukupno - a.ukupno);

    const poSorti: GrupiranoItem[] = Array.from(poSortiMap.values())
      .map((item) => ({
        naziv: item.naziv,
        ukupno: round(item.ukupno),
        jedinicaPrikaza: item.jedinicaPrikaza,
        brojStavki: item.brojStavki,
      }))
      .sort((a, b) => b.ukupno - a.ukupno);

    const poGodistu: GrupiranoItem[] = Array.from(poGodistuMap.values())
      .map((item) => ({
        naziv: item.naziv,
        ukupno: round(item.ukupno),
        jedinicaPrikaza: item.jedinicaPrikaza,
        brojStavki: item.brojStavki,
      }))
      .sort((a, b) => {
        const aNum = Number(a.naziv);
        const bNum = Number(b.naziv);
        if (Number.isFinite(aNum) && Number.isFinite(bNum)) return bNum - aNum;
        return a.naziv.localeCompare(b.naziv, "hr");
      });

    const poTanku: GrupiranoItem[] = Array.from(poTankuMap.values())
      .map((item) => ({
        naziv: item.naziv,
        ukupno: round(item.ukupno),
        jedinicaPrikaza: item.jedinicaPrikaza,
        brojStavki: item.brojStavki,
      }))
      .sort((a, b) => b.ukupno - a.ukupno);

    return NextResponse.json({
      ok: true,
      filteri: {
        datumOd: datumOd || null,
        datumDo: datumDo || null,
        sorta: sorta || null,
        godiste: godiste || null,
        preparatId: preparatId || null,
      },
      sazetak: {
        brojStavki: stavke.length,
      },
      ukupnoSve,
      poPreparatu,
      poSorti,
      poGodistu,
      poTanku,
      stavke,
    });
  } catch (error) {
    console.error("Greška u statistici preparata:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Greška kod dohvaćanja statistike preparata.",
        detalji: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}