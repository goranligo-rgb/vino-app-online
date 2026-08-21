/**
 * Pregled stanja skladista preparata — zajednicki izvor za stranicu
 * /preparat/stanje i za izvoz u Excel.
 *
 * Zasto zajednicki modul: izvoz mora dati TOCNO ono sto je na ekranu, s istim
 * filterima i istim redoslijedom. Da su upit i filtriranje napisani dvaput,
 * prva izmjena jednoga tiho bi razisla izvoz i ekran.
 *
 * SAMO CITANJE. Nista ovdje ne pise u bazu.
 */

import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth-token";

/** Tolerancija usporedbe stanja i zbroja dnevnika (float aritmetika). */
export const TOLERANCIJA = 0.0001;

export type RedakStanja = {
  id: string;
  naziv: string;
  jedinica: string | null;
  stanje: number;
  minimum: number;
  /** stanje - minimum; negativno znaci manjak. */
  razlika: number;
  ispodMinimuma: boolean;
  aktivan: boolean;
  /** ISO datum najnovijeg zapisa tipa ULAZ, ili null ako ulaza nema. */
  zadnjiUlazDatum: string | null;
  zadnjiUlazDobavljac: string | null;
};

export type Odstupanje = {
  id: string;
  naziv: string;
  stanje: number;
  zbrojDnevnika: number;
  razlika: number;
};

export type ProvjeraKnjige = {
  /** Broj provjerenih preparata — provjera ide po SVIMA, neovisno o filterima. */
  ukupnoPreparata: number;
  uskladjeno: boolean;
  odstupanja: Odstupanje[];
};

export type Filteri = {
  q: string;
  samoIspodMinimuma: boolean;
  samoAktivni: boolean;
};

export type StanjeSkladista = {
  redci: RedakStanja[];
  provjera: ProvjeraKnjige;
  filteri: Filteri;
};

/**
 * Tko smije vidjeti pregled i izvesti ga: ADMIN, ENOLOG i PODRUM.
 *
 * PODRUM ima pregled, filtere, izvoz i promet, a uz to i upis (uredivanje,
 * unos zalihe, ispravak stanja) — sve osim brisanja. PREGLED (L4) nema nista.
 *
 * Mora se poklapati s pravilom u proxy.ts. Proxy stiti STRANICU, a /api/*
 * uopce nije u njegovom matcheru — za API rute ova funkcija je jedini cuvar,
 * inace bi izvoz bio zaobilaznica oko zatvorene stranice.
 */
export function smijeGledatiStanje(user: AuthUser | null): boolean {
  return (
    user?.role === "ADMIN" ||
    user?.role === "ENOLOG" ||
    user?.role === "PODRUM"
  );
}

function jeUkljuceno(v: string | null): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "da";
}

/**
 * Isti filteri za stranicu i za izvoz. "samoAktivni" je ukljucen kad parametar
 * uopce nije poslan — to je zadano stanje prekidaca na stranici.
 */
export function citajFiltere(searchParams: URLSearchParams): Filteri {
  const samoAktivniRaw = searchParams.get("samoAktivni");

  return {
    q: String(searchParams.get("q") ?? "").trim(),
    samoIspodMinimuma: jeUkljuceno(searchParams.get("samoIspodMinimuma")),
    samoAktivni: samoAktivniRaw === null ? true : jeUkljuceno(samoAktivniRaw),
  };
}

function broj(v: number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function dohvatiStanjeSkladista(
  filteri: Filteri
): Promise<StanjeSkladista> {
  const preparati = await prisma.preparation.findMany({
    select: {
      id: true,
      naziv: true,
      stanjeNaSkladistu: true,
      minimalnaKolicina: true,
      aktivan: true,
      skladisnaJedinica: { select: { naziv: true } },
      unit: { select: { naziv: true } },
    },
  });

  // Zbroj dnevnika po preparatu. Predknjizni zapisi imaju promjenaSkladisna = 0
  // pa ne trebaju poseban filter — invarijanta iz sheme glasi
  // SUM(promjenaSkladisna) == Preparation.stanjeNaSkladistu.
  const zbrojevi = await prisma.preparationStockEntry.groupBy({
    by: ["preparationId"],
    _sum: { promjenaSkladisna: true },
  });

  const zbrojPo = new Map<string, number>();
  for (const z of zbrojevi) {
    zbrojPo.set(z.preparationId, broj(z._sum.promjenaSkladisna));
  }

  // Zadnji ulaz. Maksimum se racuna u JS-u, a ne kroz orderBy s nulls: datum
  // je opcionalan, pa za retke bez njega vrijedi createdAt.
  const ulazi = await prisma.preparationStockEntry.findMany({
    where: { tip: "ULAZ" },
    select: {
      preparationId: true,
      datum: true,
      createdAt: true,
      dobavljac: true,
    },
  });

  const zadnjiUlaz = new Map<string, { kada: Date; dobavljac: string | null }>();
  for (const u of ulazi) {
    const kada = u.datum ?? u.createdAt;
    if (!kada) continue;

    const dosad = zadnjiUlaz.get(u.preparationId);
    if (!dosad || kada.getTime() > dosad.kada.getTime()) {
      zadnjiUlaz.set(u.preparationId, {
        kada,
        dobavljac: u.dobavljac?.trim() || null,
      });
    }
  }

  const sviRedci: RedakStanja[] = preparati
    .map((p) => {
      const stanje = broj(p.stanjeNaSkladistu);
      const minimum = broj(p.minimalnaKolicina);
      const ulaz = zadnjiUlaz.get(p.id) ?? null;

      return {
        id: p.id,
        naziv: p.naziv,
        jedinica: p.skladisnaJedinica?.naziv ?? p.unit?.naziv ?? null,
        stanje,
        minimum,
        razlika: stanje - minimum,
        // Ista definicija kao brojac "Ispod minimuma" na /preparat.
        ispodMinimuma: stanje <= minimum,
        aktivan: p.aktivan !== false,
        zadnjiUlazDatum: ulaz ? ulaz.kada.toISOString() : null,
        zadnjiUlazDobavljac: ulaz?.dobavljac ?? null,
      };
    })
    .sort((a, b) => a.naziv.localeCompare(b.naziv, "hr"));

  // Provjera knjige ide po SVIM preparatima — to je kontrolni upit, ne pregled,
  // pa ga filteri ekrana ne smiju suziti.
  const odstupanja: Odstupanje[] = [];
  for (const p of preparati) {
    const stanje = broj(p.stanjeNaSkladistu);
    const zbroj = zbrojPo.get(p.id) ?? 0;
    const razlika = stanje - zbroj;

    if (Math.abs(razlika) > TOLERANCIJA) {
      odstupanja.push({
        id: p.id,
        naziv: p.naziv,
        stanje,
        zbrojDnevnika: zbroj,
        razlika,
      });
    }
  }
  odstupanja.sort((a, b) => a.naziv.localeCompare(b.naziv, "hr"));

  const q = filteri.q.toLowerCase();
  const redci = sviRedci.filter((r) => {
    if (filteri.samoAktivni && !r.aktivan) return false;
    if (filteri.samoIspodMinimuma && !r.ispodMinimuma) return false;
    if (q && !r.naziv.toLowerCase().includes(q)) return false;
    return true;
  });

  return {
    redci,
    provjera: {
      ukupnoPreparata: preparati.length,
      uskladjeno: odstupanja.length === 0,
      odstupanja,
    },
    filteri,
  };
}

const ZONA = "Europe/Zagreb";

/** Godina/mjesec/dan po hrvatskoj zoni — server radi u UTC-u. */
export function zagrebYMD(value: Date | string): {
  y: number;
  m: number;
  d: number;
} {
  const dijelovi = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(value));

  const get = (tip: string) =>
    Number(dijelovi.find((x) => x.type === tip)?.value ?? "0");

  return { y: get("year"), m: get("month"), d: get("day") };
}

/** "YYYY-MM-DD" po hrvatskoj zoni — za naziv datoteke izvoza. */
export function danasZaNaziv(now: Date): string {
  const { y, m, d } = zagrebYMD(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}
