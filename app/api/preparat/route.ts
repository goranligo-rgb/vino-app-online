export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { citajSesiju } from "@/lib/auth-sesija";
import type { AuthUser } from "@/lib/auth-token";

async function getAuthUser(): Promise<AuthUser | null> {
  return citajSesiju();
}

// Dodavanje / uređivanje / zalihe preparata: ADMIN, ENOLOG i PODRUM.
// PODRUM je ovdje jer fizicki radi inventuru — otvara novi preparat, uredjuje
// ga i ispravlja stanje. Jedino mu brisanje ostaje zatvoreno (smijeBrisati).
function smijeUredjivati(user: AuthUser | null) {
  return (
    user?.role === "ADMIN" ||
    user?.role === "ENOLOG" ||
    user?.role === "PODRUM"
  );
}

// Brisanje preparata iz sustava: ADMIN i ENOLOG. PODRUM NIJE ovdje — to je
// jedina radnja nad preparatima koju L2 ne smije.
function smijeBrisati(user: AuthUser | null) {
  return user?.role === "ADMIN" || user?.role === "ENOLOG";
}

// Citanje popisa preparata: ADMIN, ENOLOG i PODRUM. PREGLED (L4) ne.
function smijeGledati(user: AuthUser | null) {
  return (
    user?.role === "ADMIN" ||
    user?.role === "ENOLOG" ||
    user?.role === "PODRUM"
  );
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

// --- Citanje polja: razlika izmedu "kljuc nije poslan" i "poslan prazan / nula" ---
//
// Citaci ispod vracaju undefined kad kljuc uopce ne postoji u body-ju. Prisma polja
// s vrijednoscu undefined preskace, pa zatecena vrijednost u bazi ostaje netaknuta.
// Ako je kljuc poslan (makar prazan ili 0), vrijednost se upisuje - to je namjerna
// korekcija s ekrana /preparat, sekcija "Pregled preparata".

function imaKljuc(body: unknown, kljuc: string) {
  return (
    typeof body === "object" &&
    body !== null &&
    Object.prototype.hasOwnProperty.call(body, kljuc)
  );
}

// Cita se tek nakon imaKljuc(), koji je vec potvrdio da je body objekt.
function polje(body: unknown, kljuc: string): unknown {
  return (body as Record<string, unknown>)[kljuc];
}

// Brojcano polje koje u bazi smije ostati prazno (npr. dozaOd): prazno -> null.
function citajBrojIliNull(
  body: unknown,
  kljuc: string
): number | null | undefined {
  if (!imaKljuc(body, kljuc)) return undefined;
  return toNumber(polje(body, kljuc));
}

// Brojcano polje koje se vodi kao nula kad je poslano prazno
// (stanjeNaSkladistu, minimalnaKolicina): prazno ili 0 -> 0.
function citajBrojIliNulu(body: unknown, kljuc: string): number | undefined {
  if (!imaKljuc(body, kljuc)) return undefined;
  return toNumber(polje(body, kljuc)) ?? 0;
}

// Tekstualno polje: prazno -> null.
function citajTekstIliNull(
  body: unknown,
  kljuc: string
): string | null | undefined {
  if (!imaKljuc(body, kljuc)) return undefined;
  return String(polje(body, kljuc) ?? "").trim() || null;
}

// aktivan: sve osim eksplicitnog false znaci "aktivan" (zateceno ponasanje).
function citajAktivan(body: unknown, kljuc: string): boolean | undefined {
  if (!imaKljuc(body, kljuc)) return undefined;
  const v = polje(body, kljuc);
  return v === false || v === "false" ? false : true;
}

// isKorekcijski: samo eksplicitni true znaci "korekcijski" (zateceno ponasanje).
function citajIsKorekcijski(
  body: unknown,
  kljuc: string
): boolean | undefined {
  if (!imaKljuc(body, kljuc)) return undefined;
  const v = polje(body, kljuc);
  return v === true || v === "true" || v === 1;
}

// jeKvasac: samo eksplicitni true. Izostanak kljuca vraca `undefined`, sto
// Prisma tretira kao "ne diraj" — stari klijent koji polje ne salje ne moze
// slucajno ugasiti oznaku.
//
// SLUZI SAMO ZA PONUDU U FORMI FERMENTACIJE. Ne filtrira ispis preparata —
// vidi biljesku uz Preparation.jeKvasac u schema.prisma.
function citajJeKvasac(body: unknown, kljuc: string): boolean | undefined {
  if (!imaKljuc(body, kljuc)) return undefined;
  const v = polje(body, kljuc);
  return v === true || v === "true" || v === 1;
}

function citajKorekcijaTip(
  body: unknown,
  kljuc: string
): string | null | undefined {
  if (!imaKljuc(body, kljuc)) return undefined;
  return parseKorekcijaTip(polje(body, kljuc));
}

// Polja formule korekcijskog preparata; izostavljena polja se ne upisuju.
type KorekcijaPolja = {
  korekcijaTip?: any;
  korekcijaJedinica?: string | null;
  ucinakPoJedinici?: number | null;
  povecanjeParametra?: number | null;
  referentnaKolicina?: number | null;
  referentnaKolicinaJedinica?: string | null;
  referentniVolumen?: number | null;
  referentniVolumenJedinica?: string | null;
};

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
    // Ova ruta do sad NIJE provjeravala ni prijavu — popis svih preparata sa
    // stanjima vracao je i neprijavljenom zahtjevu. Proxy je ne stiti jer
    // /api/* nije u njegovom matcheru.
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    if (!smijeGledati(user)) {
      return NextResponse.json(
        { error: "Nemate pravo pregleda preparata." },
        { status: 403 }
      );
    }

    const data = await prisma.preparation.findMany({
      include: {
        unit: true,
        skladisnaJedinica: true,
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

    if (!smijeUredjivati(user)) {
      return NextResponse.json(
        { error: "Nemate pravo za kreiranje preparata." },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Kod kreiranja izostavljen kljuc znaci "pusti default iz sheme"
    // (stanje 0, minimalna kolicina 0, aktivan true, isKorekcijski false).
    const naziv = String(body?.naziv ?? "").trim();
    const opis = citajTekstIliNull(body, "opis");
    const strucnoIme = citajTekstIliNull(body, "strucnoIme");
    const unitId = citajTekstIliNull(body, "unitId");

    const dozaOd = citajBrojIliNull(body, "dozaOd");
    const dozaDo = citajBrojIliNull(body, "dozaDo");

    const stanjeNaSkladistu = citajBrojIliNulu(body, "stanjeNaSkladistu");
    const minimalnaKolicina = citajBrojIliNulu(body, "minimalnaKolicina");
    const skladisnaJedinicaId = citajTekstIliNull(body, "skladisnaJedinicaId");
    const aktivan = citajAktivan(body, "aktivan");
    const jeKvasac = citajJeKvasac(body, "jeKvasac") ?? false;

    const isKorekcijski = citajIsKorekcijski(body, "isKorekcijski") ?? false;

    const korekcijaTip = citajKorekcijaTip(body, "korekcijaTip") ?? null;
    const korekcijaJedinica =
      citajTekstIliNull(body, "korekcijaJedinica") ?? null;

    const povecanjeParametra =
      citajBrojIliNull(body, "povecanjeParametra") ?? null;
    const referentnaKolicina =
      citajBrojIliNull(body, "referentnaKolicina") ?? null;
    const referentniVolumen =
      citajBrojIliNull(body, "referentniVolumen") ?? null;
    const referentnaKolicinaJedinica =
      citajTekstIliNull(body, "referentnaKolicinaJedinica") ?? null;
    const referentniVolumenJedinica =
      citajTekstIliNull(body, "referentniVolumenJedinica") ?? null;

    const ucinakPoJediniciIzravno =
      citajBrojIliNull(body, "ucinakPoJedinici") ?? null;

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

    if (stanjeNaSkladistu != null && stanjeNaSkladistu < 0) {
      return NextResponse.json(
        { error: "Stanje na skladištu ne može biti manje od 0." },
        { status: 400 }
      );
    }

    if (minimalnaKolicina != null && minimalnaKolicina < 0) {
      return NextResponse.json(
        { error: "Minimalna količina ne može biti manja od 0." },
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

    const created = await prisma.$transaction(async (tx) => {
      const noviPreparat = await tx.preparation.create({
        data: {
          naziv,
          opis,
          strucnoIme,
          unitId,
          dozaOd,
          dozaDo,
          stanjeNaSkladistu,
          minimalnaKolicina,
          skladisnaJedinicaId,
          aktivan,
          jeKvasac,

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
          skladisnaJedinica: true,
        },
      });

      // Preparat unesen s pocetnom zalihom mora odmah uci u dnevnik. Bez
      // ovoga stanje postoji bez ijednog zapisa i knjiga se razilazi - bas
      // to se dogodilo preparatu unesenom neposredno nakon migracije.
      const pocetnoStanje = Number(noviPreparat.stanjeNaSkladistu ?? 0);

      if (Math.abs(pocetnoStanje) > 0.0001) {
        await tx.preparationStockEntry.create({
          data: {
            preparationId: noviPreparat.id,
            tip: "POCETNO_STANJE",
            kolicina: Math.abs(pocetnoStanje),
            promjenaSkladisna: pocetnoStanje,
            unitId:
              noviPreparat.skladisnaJedinicaId ?? noviPreparat.unitId,
            korisnikId: user.id,
            napomena: "Pocetno stanje kod unosa preparata",
          },
        });
      }

      return noviPreparat;
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

    if (!smijeUredjivati(user)) {
      return NextResponse.json(
        { error: "Nemate pravo za uređivanje preparata." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const id = String(body?.id ?? "").trim();

    // Izostavljen kljuc = polje se ne mijenja i ostaje kako je u bazi.
    const naziv = imaKljuc(body, "naziv")
      ? String(body?.naziv ?? "").trim()
      : undefined;
    const opis = citajTekstIliNull(body, "opis");
    const strucnoIme = citajTekstIliNull(body, "strucnoIme");
    const unitId = citajTekstIliNull(body, "unitId");

    const dozaOd = citajBrojIliNull(body, "dozaOd");
    const dozaDo = citajBrojIliNull(body, "dozaDo");

    const stanjeNaSkladistu = citajBrojIliNulu(body, "stanjeNaSkladistu");
    const minimalnaKolicina = citajBrojIliNulu(body, "minimalnaKolicina");
    const skladisnaJedinicaId = citajTekstIliNull(body, "skladisnaJedinicaId");
    const aktivan = citajAktivan(body, "aktivan");
    const jeKvasac = citajJeKvasac(body, "jeKvasac");

    const isKorekcijski = citajIsKorekcijski(body, "isKorekcijski");

    const korekcijaTip = citajKorekcijaTip(body, "korekcijaTip");
    const korekcijaJedinica = citajTekstIliNull(body, "korekcijaJedinica");

    const povecanjeParametra = citajBrojIliNull(body, "povecanjeParametra");
    const referentnaKolicina = citajBrojIliNull(body, "referentnaKolicina");
    const referentniVolumen = citajBrojIliNull(body, "referentniVolumen");
    const referentnaKolicinaJedinica = citajTekstIliNull(
      body,
      "referentnaKolicinaJedinica"
    );
    const referentniVolumenJedinica = citajTekstIliNull(
      body,
      "referentniVolumenJedinica"
    );

    const ucinakPoJediniciIzravno = citajBrojIliNull(body, "ucinakPoJedinici");

    if (!id) {
      return NextResponse.json(
        { error: "ID preparata je obavezan." },
        { status: 400 }
      );
    }

    if (naziv !== undefined && !naziv) {
      return NextResponse.json(
        { error: "Naziv preparata ne može biti prazan." },
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

    if (stanjeNaSkladistu != null && stanjeNaSkladistu < 0) {
      return NextResponse.json(
        { error: "Stanje na skladištu ne može biti manje od 0." },
        { status: 400 }
      );
    }

    if (minimalnaKolicina != null && minimalnaKolicina < 0) {
      return NextResponse.json(
        { error: "Minimalna količina ne može biti manja od 0." },
        { status: 400 }
      );
    }

    const postojeci = await prisma.preparation.findUnique({
      where: { id },
    });

    if (!postojeci) {
      return NextResponse.json(
        { error: "Preparat nije pronađen." },
        { status: 404 }
      );
    }

    // Efektivna vrijednost = poslana ako je kljuc tu, inace zatecena u bazi.
    // Bez ovoga bi djelomicni PUT racunao formulu iz praznih vrijednosti.
    const efIsKorekcijski = isKorekcijski ?? postojeci.isKorekcijski;
    const efUnitId = unitId === undefined ? postojeci.unitId : unitId;
    const efKorekcijaTip =
      korekcijaTip === undefined ? postojeci.korekcijaTip : korekcijaTip;
    const efKorekcijaJedinica =
      korekcijaJedinica === undefined
        ? postojeci.korekcijaJedinica
        : korekcijaJedinica;
    const efPovecanjeParametra =
      povecanjeParametra === undefined
        ? postojeci.povecanjeParametra
        : povecanjeParametra;
    const efReferentnaKolicina =
      referentnaKolicina === undefined
        ? postojeci.referentnaKolicina
        : referentnaKolicina;
    const efReferentnaKolicinaJedinica =
      referentnaKolicinaJedinica === undefined
        ? postojeci.referentnaKolicinaJedinica
        : referentnaKolicinaJedinica;
    const efReferentniVolumen =
      referentniVolumen === undefined
        ? postojeci.referentniVolumen
        : referentniVolumen;
    const efReferentniVolumenJedinica =
      referentniVolumenJedinica === undefined
        ? postojeci.referentniVolumenJedinica
        : referentniVolumenJedinica;

    let unit = null;
    if (efUnitId) {
      unit = await prisma.unit.findUnique({
        where: { id: efUnitId },
      });
    }

    const izracunatiUcinak =
      ucinakPoJediniciIzravno ??
      izracunajUcinakPoJediniciIzFormule({
        povecanjeParametra: efPovecanjeParametra,
        referentnaKolicina: efReferentnaKolicina,
        referentnaKolicinaJedinica: efReferentnaKolicinaJedinica,
        referentniVolumen: efReferentniVolumen,
        referentniVolumenJedinica: efReferentniVolumenJedinica,
        ciljnaJedinicaPreparata: unit?.naziv ?? null,
      });

    if (efIsKorekcijski) {
      if (!efKorekcijaTip) {
        return NextResponse.json(
          { error: "Za korekcijski preparat moraš odabrati vrstu korekcije." },
          { status: 400 }
        );
      }

      if (
        efPovecanjeParametra == null ||
        efReferentnaKolicina == null ||
        efReferentniVolumen == null ||
        !efReferentnaKolicinaJedinica ||
        !efReferentniVolumenJedinica
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

    // Korekcijski preparat: formula se preracunava iz efektivnih vrijednosti.
    // Eksplicitno ugasena korekcija (isKorekcijski: false): formula se brise.
    // Kljuc nije poslan, a preparat nije korekcijski: ne dira se nista.
    let korekcijaPolja: KorekcijaPolja = {};

    if (efIsKorekcijski) {
      korekcijaPolja = {
        korekcijaTip: efKorekcijaTip,
        korekcijaJedinica: efKorekcijaJedinica,
        ucinakPoJedinici: izracunatiUcinak,
        povecanjeParametra: efPovecanjeParametra,
        referentnaKolicina: efReferentnaKolicina,
        referentnaKolicinaJedinica: efReferentnaKolicinaJedinica,
        referentniVolumen: efReferentniVolumen,
        referentniVolumenJedinica: efReferentniVolumenJedinica,
      };
    } else if (isKorekcijski === false) {
      korekcijaPolja = {
        korekcijaTip: null,
        korekcijaJedinica: null,
        ucinakPoJedinici: null,
        povecanjeParametra: null,
        referentnaKolicina: null,
        referentnaKolicinaJedinica: null,
        referentniVolumen: null,
        referentniVolumenJedinica: null,
      };
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Stanje se cita PONOVNO unutar transakcije: razlika za dnevnik mora
      // se racunati iz vrijednosti koja vrijedi u trenutku upisa, ne iz one
      // procitane prije validacija.
      const prije = await tx.preparation.findUnique({
        where: { id },
        select: {
          stanjeNaSkladistu: true,
          skladisnaJedinicaId: true,
          unitId: true,
        },
      });

      if (!prije) {
        throw new Error("PREPARAT_NIJE_PRONADEN");
      }

      const noviPreparat = await tx.preparation.update({
        where: { id },
        data: {
          naziv,
          opis,
          strucnoIme,
          unitId,
          dozaOd,
          dozaDo,
          stanjeNaSkladistu,
          minimalnaKolicina,
          skladisnaJedinicaId,
          aktivan,
          jeKvasac,
          isKorekcijski,

          ...korekcijaPolja,
        },
        include: {
          unit: true,
          skladisnaJedinica: true,
        },
      });

      // Rucna korekcija zalihe: knjizi se RAZLIKA, nikad novo stanje.
      // Ako stanje nije poslano ili se nije promijenilo, zapisa nema.
      if (stanjeNaSkladistu !== undefined) {
        const razlika =
          Number(stanjeNaSkladistu) - Number(prije.stanjeNaSkladistu ?? 0);

        if (Math.abs(razlika) > 0.0001) {
          await tx.preparationStockEntry.create({
            data: {
              preparationId: id,
              tip: "KOREKCIJA",
              kolicina: Math.abs(razlika),
              promjenaSkladisna: razlika,
              unitId: prije.skladisnaJedinicaId ?? prije.unitId,
              korisnikId: user.id,
              napomena: "Rucna korekcija stanja",
            },
          });
        }
      }

      return noviPreparat;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/preparat error:", error);

    if (error instanceof Error && error.message === "PREPARAT_NIJE_PRONADEN") {
      return NextResponse.json(
        { error: "Preparat nije pronađen." },
        { status: 404 }
      );
    }

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

    if (!smijeBrisati(user)) {
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