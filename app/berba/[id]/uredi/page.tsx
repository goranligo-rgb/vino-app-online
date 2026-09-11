import Link from "next/link";
import type React from "react";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";
import { jeL12 } from "@/lib/auth-role";
import { IspravakBerbeGreska, stanjeZaUredjivanje } from "@/lib/berba-ispravak";
import UrediBerbu, { type PodaciZaObrazac } from "./uredi-berbu";

export const dynamic = "force-dynamic";

/**
 * ISPRAVAK BERBE — ekran. Pravila i upis su u lib/berba-ispravak.ts i
 * `PUT /api/berba/[id]`; ovdje se samo skupi sto obrazac treba znati PRIJE
 * spremanja: cijela grupa, gdje je berba danas (upozorenje o sorti) i kljucevi
 * ostalih grupa (upozorenje o sudaru).
 */
export default async function UrediBerbuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();

  const sesija = await citajSesiju();
  if (!sesija) redirect("/login");
  if (!jeL12(sesija.role)) redirect("/punjenje");

  const { id } = await params;

  let stanje;
  try {
    stanje = await stanjeZaUredjivanje(prisma, id);
  } catch (e) {
    if (e instanceof IspravakBerbeGreska) notFound();
    throw e;
  }

  const sorte = await prisma.sorta.findMany({
    where: { aktivna: true },
    orderBy: { naziv: "asc" },
    select: { naziv: true },
  });

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const g = stanje.glava;

  const podaci: PodaciZaObrazac = {
    id: g.id,
    vrstaUnosa: g.vrstaUnosa,
    nazivSorte: g.nazivSorte,
    kolicinaLitara: Number(g.kolicinaLitara),
    kolicinaKgGrozdja: g.kolicinaKgGrozdja == null ? null : Number(g.kolicinaKgGrozdja),
    secer: g.secer == null ? null : Number(g.secer),
    kiseline: g.kiseline == null ? null : Number(g.kiseline),
    ph: g.ph == null ? null : Number(g.ph),
    polozaj: g.polozaj,
    parcela: g.parcela,
    vinograd: g.vinograd,
    oznakaBerbe: g.oznakaBerbe,
    datumBerbe: iso(g.datumBerbe),
    datumUlaska: iso(g.datumUlaska),
    godinaBerbe: g.godinaBerbe,
    napomena: g.napomena,
    maceracija: g.maceracija,
    maceracijaSati: g.maceracijaSati == null ? null : Number(g.maceracijaSati),
    vlastitaBerba: g.vlastitaBerba,
    pocetakBranja: iso(g.pocetakBranja),
    krajBranja: iso(g.krajBranja),
    brojBeraca: g.brojBeraca,
    ispravljenoAt: iso(g.ispravljenoAt),
    razlogIspravka: g.razlogIspravka,
    grupa: stanje.grupa.map((c) => ({
      id: c.id,
      kolicinaLitara: Number(c.kolicinaLitara),
    })),
    tankoviDanas: stanje.tankoviDanas.map((t) => ({ broj: t.broj, litre: t.litre })),
    kljuceviOstalih: stanje.kljuceviOstalih,
    stavkiUGrupi: stanje.stavkiUGrupi,
    sorte: sorte.map((s) => s.naziv),
  };

  return (
    <main style={stranicaStyle}>
      <div style={omotStyle}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Link href="/punjenje" style={povratakStyle}>
            ← Punjenje
          </Link>
          <Link href="/berba" style={povratakStyle}>
            Izvještaj o berbi
          </Link>
        </div>

        <UrediBerbu podaci={podaci} />
      </div>
    </main>
  );
}

const stranicaStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f6f3ee",
  padding: 16,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  color: "#2f2f2f",
  boxSizing: "border-box",
};

const omotStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
};

const povratakStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  border: "1px solid #d1d5db",
  background: "#fafafa",
  color: "#44403c",
  textDecoration: "none",
  fontSize: 13,
};
