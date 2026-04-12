export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

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

function isLevel1(user: AuthUser | null) {
  return user?.role === "ADMIN" || user?.role === "ENOLOG";
}

function isValidNumber(value: unknown) {
  if (value === null || value === undefined) return false;
  const s = String(value).trim().replace(",", ".");
  if (!s) return false;
  return !Number.isNaN(Number(s));
}

function toNumber(value: unknown): number | null {
  if (!isValidNumber(value)) return null;
  return Number(String(value).trim().replace(",", "."));
}

function parseKorekcijaTip(value: unknown) {
  const v = String(value ?? "").trim().toUpperCase();

  if (!v) return null;

  const dozvoljeni = [
    "SLOBODNI_SO2",
    "UKUPNE_KISELINE",
    "PH",
    "ALKOHOL",
    "SECER",
  ];

  return dozvoljeni.includes(v) ? v : null;
}

function masaUG(value: number, unit: string | null | undefined) {
  const u = String(unit ?? "").trim().toLowerCase();

  if (u === "g") return value;
  if (u === "dkg") return value * 10;
  if (u === "kg") return value * 1000;
  if (u === "mg") return value / 1000;

  return value;
}

function volumenUL(value: number, unit: string | null | undefined) {
  const u = String(unit ?? "").trim().toLowerCase();

  if (u === "l") return value;
  if (u === "dl" || u === "dcl") return value / 10;
  if (u === "ml") return value / 1000;
  if (u === "hl") return value * 100;

  return value;
}

function pretvoriGrameUBazu(
  valueG: number,
  targetUnit: string | null | undefined
) {
  const u = String(targetUnit ?? "").trim().toLowerCase();

  if (u === "g") return valueG;
  if (u === "dkg") return valueG / 10;
  if (u === "kg") return valueG / 1000;
  if (u === "mg") return valueG * 1000;

  return valueG;
}

function pretvoriLitreUBazu(
  valueL: number,
  targetUnit: string | null | undefined
) {
  const u = String(targetUnit ?? "").trim().toLowerCase();

  if (u === "l") return valueL;
  if (u === "dl" || u === "dcl") return valueL * 10;
  if (u === "ml") return valueL * 1000;
  if (u === "hl") return valueL / 100;

  return valueL;
}

function jeVolumenskaJedinica(unit: string | null | undefined) {
  const u = String(unit ?? "").trim().toLowerCase();
  return ["ml", "dl", "dcl", "l", "hl"].includes(u);
}

function izracunajUcinakPoJediniciIzFormule(input: {
  povecanjeParametra: number | null;
  referentnaKolicina: number | null;
  referentnaKolicinaJedinica: string | null;
  referentniVolumen: number | null;
  referentniVolumenJedinica: string | null;
  ciljnaJedinicaPreparata: string | null;
}) {
  const {
    povecanjeParametra,
    referentnaKolicina,
    referentnaKolicinaJedinica,
    referentniVolumen,
    referentniVolumenJedinica,
    ciljnaJedinicaPreparata,
  } = input;

  if (
    povecanjeParametra == null ||
    referentnaKolicina == null ||
    referentniVolumen == null
  ) {
    return null;
  }

  if (
    povecanjeParametra <= 0 ||
    referentnaKolicina <= 0 ||
    referentniVolumen <= 0
  ) {
    return null;
  }

  const ciljnaJedinica = String(ciljnaJedinicaPreparata ?? "").trim();
  if (!ciljnaJedinica) return null;

  const volumenskiPreparat = jeVolumenskaJedinica(ciljnaJedinica);

  let kolicinaUBaznojJedinici = 0;

  if (volumenskiPreparat) {
    const kolicinaUL = volumenUL(
      referentnaKolicina,
      referentnaKolicinaJedinica
    );
    kolicinaUBaznojJedinici = pretvoriLitreUBazu(kolicinaUL, ciljnaJedinica);
  } else {
    const kolicinaUG = masaUG(
      referentnaKolicina,
      referentnaKolicinaJedinica
    );
    kolicinaUBaznojJedinici = pretvoriGrameUBazu(kolicinaUG, ciljnaJedinica);
  }

  const volumenULitara = volumenUL(
    referentniVolumen,
    referentniVolumenJedinica
  );

  if (kolicinaUBaznojJedinici <= 0 || volumenULitara <= 0) return null;

  return Number((povecanjeParametra / kolicinaUBaznojJedinici).toFixed(6));
}

export async function GET() {
  try {
    const data = await prisma.preparation.findMany({
      include: {
        unit: true,
      },
      orderBy: {
        naziv: "asc",
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/preparat error:", error);
    return NextResponse.json(
      { error: "Greška kod dohvata preparata." },
      { status: 500 }
    );
  }
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

    if (!isLevel1(user)) {
      return NextResponse.json(
        { error: "Nemate pravo za kreiranje preparata." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const naziv = String(body?.naziv ?? "").trim();
    const opis = String(body?.opis ?? "").trim() || null;
    const strucnoIme = String(body?.strucnoIme ?? "").trim() || null;
    const unitId = String(body?.unitId ?? "").trim() || null;

    const dozaOd = toNumber(body?.dozaOd);
    const dozaDo = toNumber(body?.dozaDo);

    const isKorekcijski =
      body?.isKorekcijski === true ||
      body?.isKorekcijski === "true" ||
      body?.isKorekcijski === 1;

    const korekcijaTip = parseKorekcijaTip(body?.korekcijaTip);
    const korekcijaJedinica =
      String(body?.korekcijaJedinica ?? "").trim() || null;

    const povecanjeParametra = toNumber(body?.povecanjeParametra);
    const referentnaKolicina = toNumber(body?.referentnaKolicina);
    const referentniVolumen = toNumber(body?.referentniVolumen);
    const referentnaKolicinaJedinica =
      String(body?.referentnaKolicinaJedinica ?? "").trim() || null;
    const referentniVolumenJedinica =
      String(body?.referentniVolumenJedinica ?? "").trim() || null;

    const ucinakPoJediniciIzravno = toNumber(body?.ucinakPoJedinici);

    if (!naziv) {
      return NextResponse.json(
        { error: "Naziv preparata je obavezan." },
        { status: 400 }
      );
    }

    if (dozaOd != null && dozaOd < 0) {
      return NextResponse.json(
        { error: "Doza od ne može biti manja od 0." },
        { status: 400 }
      );
    }

    if (dozaDo != null && dozaDo < 0) {
      return NextResponse.json(
        { error: "Doza do ne može biti manja od 0." },
        { status: 400 }
      );
    }

    if (dozaOd != null && dozaDo != null && dozaDo < dozaOd) {
      return NextResponse.json(
        { error: "Doza do ne može biti manja od doze od." },
        { status: 400 }
      );
    }

    let unit = null;
    if (unitId) {
      unit = await prisma.unit.findUnique({
        where: { id: unitId },
      });
    }

    const izracunatiUcinak =
      ucinakPoJediniciIzravno ??
      izracunajUcinakPoJediniciIzFormule({
        povecanjeParametra,
        referentnaKolicina,
        referentnaKolicinaJedinica,
        referentniVolumen,
        referentniVolumenJedinica,
        ciljnaJedinicaPreparata: unit?.naziv ?? null,
      });

    if (isKorekcijski) {
      if (!korekcijaTip) {
        return NextResponse.json(
          { error: "Za korekcijski preparat moraš odabrati vrstu korekcije." },
          { status: 400 }
        );
      }

      if (
        povecanjeParametra == null ||
        referentnaKolicina == null ||
        referentniVolumen == null ||
        !referentnaKolicinaJedinica ||
        !referentniVolumenJedinica
      ) {
        return NextResponse.json(
          { error: "Za korekcijski preparat moraš upisati kompletnu formulu." },
          { status: 400 }
        );
      }

      if (
        izracunatiUcinak == null ||
        Number.isNaN(izracunatiUcinak) ||
        izracunatiUcinak <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "Ne mogu izračunati učinak po jedinici. Provjeri formulu i jedinice.",
          },
          { status: 400 }
        );
      }
    }

    const created = await prisma.preparation.create({
      data: {
        naziv,
        opis,
        strucnoIme,
        unitId,
        dozaOd,
        dozaDo,

        isKorekcijski,
        korekcijaTip: isKorekcijski ? (korekcijaTip as any) : null,
        korekcijaJedinica: isKorekcijski ? korekcijaJedinica : null,
        ucinakPoJedinici: isKorekcijski ? izracunatiUcinak : null,

        povecanjeParametra: isKorekcijski ? povecanjeParametra : null,
        referentnaKolicina: isKorekcijski ? referentnaKolicina : null,
        referentnaKolicinaJedinica: isKorekcijski
          ? referentnaKolicinaJedinica
          : null,
        referentniVolumen: isKorekcijski ? referentniVolumen : null,
        referentniVolumenJedinica: isKorekcijski
          ? referentniVolumenJedinica
          : null,
      },
      include: {
        unit: true,
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("POST /api/preparat error:", error);
    return NextResponse.json(
      { error: "Greška u kreiranju preparata." },
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

    if (!isLevel1(user)) {
      return NextResponse.json(
        { error: "Nemate pravo za uređivanje preparata." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const id = String(body?.id ?? "").trim();
    const naziv = String(body?.naziv ?? "").trim();
    const opis = String(body?.opis ?? "").trim() || null;
    const strucnoIme = String(body?.strucnoIme ?? "").trim() || null;
    const unitId = String(body?.unitId ?? "").trim() || null;

    const dozaOd = toNumber(body?.dozaOd);
    const dozaDo = toNumber(body?.dozaDo);

    const isKorekcijski =
      body?.isKorekcijski === true ||
      body?.isKorekcijski === "true" ||
      body?.isKorekcijski === 1;

    const korekcijaTip = parseKorekcijaTip(body?.korekcijaTip);
    const korekcijaJedinica =
      String(body?.korekcijaJedinica ?? "").trim() || null;

    const povecanjeParametra = toNumber(body?.povecanjeParametra);
    const referentnaKolicina = toNumber(body?.referentnaKolicina);
    const referentniVolumen = toNumber(body?.referentniVolumen);
    const referentnaKolicinaJedinica =
      String(body?.referentnaKolicinaJedinica ?? "").trim() || null;
    const referentniVolumenJedinica =
      String(body?.referentniVolumenJedinica ?? "").trim() || null;

    const ucinakPoJediniciIzravno = toNumber(body?.ucinakPoJedinici);

    if (!id) {
      return NextResponse.json(
        { error: "ID preparata je obavezan." },
        { status: 400 }
      );
    }

    if (!naziv) {
      return NextResponse.json(
        { error: "Naziv preparata je obavezan." },
        { status: 400 }
      );
    }

    if (dozaOd != null && dozaOd < 0) {
      return NextResponse.json(
        { error: "Doza od ne može biti manja od 0." },
        { status: 400 }
      );
    }

    if (dozaDo != null && dozaDo < 0) {
      return NextResponse.json(
        { error: "Doza do ne može biti manja od 0." },
        { status: 400 }
      );
    }

    if (dozaOd != null && dozaDo != null && dozaDo < dozaOd) {
      return NextResponse.json(
        { error: "Doza do ne može biti manja od doze od." },
        { status: 400 }
      );
    }

    let unit = null;
    if (unitId) {
      unit = await prisma.unit.findUnique({
        where: { id: unitId },
      });
    }

    const izracunatiUcinak =
      ucinakPoJediniciIzravno ??
      izracunajUcinakPoJediniciIzFormule({
        povecanjeParametra,
        referentnaKolicina,
        referentnaKolicinaJedinica,
        referentniVolumen,
        referentniVolumenJedinica,
        ciljnaJedinicaPreparata: unit?.naziv ?? null,
      });

    if (isKorekcijski) {
      if (!korekcijaTip) {
        return NextResponse.json(
          { error: "Za korekcijski preparat moraš odabrati vrstu korekcije." },
          { status: 400 }
        );
      }

      if (
        povecanjeParametra == null ||
        referentnaKolicina == null ||
        referentniVolumen == null ||
        !referentnaKolicinaJedinica ||
        !referentniVolumenJedinica
      ) {
        return NextResponse.json(
          { error: "Za korekcijski preparat moraš upisati kompletnu formulu." },
          { status: 400 }
        );
      }

      if (
        izracunatiUcinak == null ||
        Number.isNaN(izracunatiUcinak) ||
        izracunatiUcinak <= 0
      ) {
        return NextResponse.json(
          { error: "Ne mogu izračunati učinak po jedinici." },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.preparation.update({
      where: { id },
      data: {
        naziv,
        opis,
        strucnoIme,
        unitId,
        dozaOd,
        dozaDo,

        isKorekcijski,
        korekcijaTip: isKorekcijski ? (korekcijaTip as any) : null,
        korekcijaJedinica: isKorekcijski ? korekcijaJedinica : null,
        ucinakPoJedinici: isKorekcijski ? izracunatiUcinak : null,

        povecanjeParametra: isKorekcijski ? povecanjeParametra : null,
        referentnaKolicina: isKorekcijski ? referentnaKolicina : null,
        referentnaKolicinaJedinica: isKorekcijski
          ? referentnaKolicinaJedinica
          : null,
        referentniVolumen: isKorekcijski ? referentniVolumen : null,
        referentniVolumenJedinica: isKorekcijski
          ? referentniVolumenJedinica
          : null,
      },
      include: {
        unit: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/preparat error:", error);
    return NextResponse.json(
      { error: "Greška kod uređivanja preparata." },
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
        { error: "Nemate pravo za brisanje preparata." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const id = String(body?.id ?? "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "ID preparata je obavezan." },
        { status: 400 }
      );
    }

    await prisma.preparation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/preparat error:", error);
    return NextResponse.json(
      { error: "Greška kod brisanja preparata." },
      { status: 500 }
    );
  }
}