/**
 * Izvoz tablice berbe u .xlsx — ono sto je trenutno na ekranu /berba.
 *
 * POST, ne GET-link kao na /preparat/stanje: popis oznacenih redaka moze biti
 * predug za URL. Tijelo nosi postavke tablice (godina, zateceno, trazilica,
 * grupiranje, sortiranje, oznaceni), a server SAM cita podatke i provlaci ih
 * kroz isti lanac kao stranica (lib/berba-citanje.ts + lib/berba-tablica.ts).
 * Klijent ne salje redove — izvoz ne moze tvrditi nesto sto baza ne zna.
 *
 * Kad je ista oznaceno, izvoze se SAMO oznaceni: zbrojevi na ekranu tada racunaju
 * samo njih, pa bi izvoz svih redaka dao podnozje koje ne odgovara ekranu.
 *
 * runtime = "nodejs" je obavezan: exceljs koristi Node streamove i zlib.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { citajSesiju } from "@/lib/auth-sesija";
import { citajBerbe } from "@/lib/berba-citanje";
import { opisMaceracije } from "@/lib/berba-polja";
import { danasZaNaziv } from "@/lib/preparat-stanje";
import {
  BEZ_GODISTA,
  GRUPIRANJA,
  STUPCI,
  type Grupiranje,
  type PostavkeTablice,
  type RedakBerbe,
  type Sazetak,
  type Smjer,
  type Stupac,
  danBerbe,
  grupiraj,
  izracunajSazetak,
  prikazaniZapisi,
  randmanRetka,
} from "@/lib/berba-tablica";

const BOJA_GRUPA = "FFECFDF5";
const BOJA_PODZBROJ = "FFD1FAE5";
const BOJA_UKUPNO = "FFA7F3D0";
const BOJA_ZATECENO = "FFFEF3C7";

/** Tijelo zahtjeva u postavke — sve nepoznato pada na zadano, ne na gresku. */
function citajPostavke(t: Record<string, unknown>): PostavkeTablice {
  const tekst = (v: unknown) => (typeof v === "string" ? v : "");
  const grupiraj = GRUPIRANJA.includes(t.grupiraj as Grupiranje)
    ? (t.grupiraj as Grupiranje)
    : "nista";
  const stupac = STUPCI.includes(t.stupac as Stupac) ? (t.stupac as Stupac) : "datum";
  const smjer: Smjer = t.smjer === "asc" ? "asc" : "desc";
  const oznaceni = Array.isArray(t.oznaceni)
    ? t.oznaceni.filter((x): x is string => typeof x === "string")
    : [];

  return {
    godina: tekst(t.godina),
    zateceno: t.zateceno === true,
    tekst: tekst(t.tekst).slice(0, 200),
    grupiraj,
    stupac,
    smjer,
    oznaceni,
  };
}

/** Dan berbe kao pravi Excel datum: UTC ponoc hrvatskog kalendarskog dana. */
function datumZaExcel(z: RedakBerbe): Date | null {
  const dan = danBerbe(z);
  if (!dan) return null;
  const [y, m, d] = dan.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function POST(req: Request) {
  try {
    // Isto pravo kao citanje: /api/berba trazi prijavu, ne rolu.
    const user = await citajSesiju();
    if (!user?.id) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    let tijelo: Record<string, unknown>;
    try {
      const procitano = await req.json();
      if (!procitano || typeof procitano !== "object" || Array.isArray(procitano)) {
        throw new Error("tijelo");
      }
      tijelo = procitano as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Neispravan zahtjev." }, { status: 400 });
    }

    const p = citajPostavke(tijelo);

    // JSON povratno putovanje: stranica dobiva zapise kroz NextResponse.json
    // (datumi kao ISO tekst), pa ih i izvoz racuna u tocno tom obliku.
    const sve = JSON.parse(JSON.stringify(await citajBerbe())) as RedakBerbe[];

    const prikazani = prikazaniZapisi(sve, p);
    const oznaceni = new Set(p.oznaceni);
    const imaOznacenih = prikazani.some((z) => oznaceni.has(z.id));
    const zapisi = imaOznacenih ? prikazani.filter((z) => oznaceni.has(z.id)) : prikazani;
    const grupe = grupiraj(zapisi, p.grupiraj, p.stupac, p.smjer);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Vino aplikacija";
    const ws = wb.addWorksheet("Berba");

    ws.columns = [
      { header: "Datum berbe", key: "datum", width: 13 },
      { header: "Sorta", key: "sorta", width: 26 },
      { header: "Položaj", key: "polozaj", width: 14 },
      { header: "Kg", key: "kg", width: 11 },
      { header: "Litre", key: "litre", width: 11 },
      { header: "Randman L/100 kg", key: "randman", width: 12 },
      { header: "Šećer °Oe", key: "secer", width: 11 },
      { header: "Kiseline", key: "kiseline", width: 10 },
      { header: "pH", key: "ph", width: 8 },
      { header: "Maceracija", key: "maceracija", width: 14 },
      { header: "Oznaka berbe", key: "oznaka", width: 16 },
      { header: "Napomena", key: "napomena", width: 36 },
    ];

    const zaglavlje = ws.getRow(1);
    zaglavlje.font = { bold: true };
    zaglavlje.border = { bottom: { style: "thin", color: { argb: "FF9CA3AF" } } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const FORMATI: Record<string, string> = {
      kg: "#,##0",
      litre: "#,##0",
      randman: "0.0",
      secer: "0.0",
      kiseline: "0.00",
      ph: "0.00",
    };

    const oboji = (red: ExcelJS.Row, argb: string) =>
      red.eachCell({ includeEmpty: true }, (c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      });

    const formatiraj = (red: ExcelJS.Row) => {
      for (const [k, f] of Object.entries(FORMATI)) {
        const c = red.getCell(k);
        c.numFmt = f;
        c.alignment = { horizontal: "right" };
      }
    };

    const redZbroja = (oznaka: string, s: Sazetak, boja: string) => {
      const red = ws.addRow({
        sorta: oznaka,
        kg: s.kg,
        litre: s.litara,
        randman: s.randman.vrijednost,
        secer: s.secer.vrijednost,
        kiseline: s.kiseline.vrijednost,
        ph: s.ph.vrijednost,
        napomena: `pokrivenost: šećer ${s.secer.n}/${s.secer.od}, kis. ${s.kiseline.n}/${s.kiseline.od}, pH ${s.ph.n}/${s.ph.od}`,
      });
      red.font = { bold: true };
      formatiraj(red);
      oboji(red, boja);
      red.getCell("napomena").font = { italic: true, color: { argb: "FF6B7280" } };
    };

    for (const g of grupe) {
      if (p.grupiraj !== "nista") {
        const naslov = ws.addRow({ datum: `${g.naziv} · ${g.zapisi.length}` });
        naslov.font = { bold: true };
        oboji(naslov, BOJA_GRUPA);
      }

      for (const z of g.zapisi) {
        const jeZateceno = z.vrstaUnosa === "ZATECENO";
        const red = ws.addRow({
          datum: datumZaExcel(z),
          sorta: jeZateceno ? `${z.nazivSorte} (zatečeno)` : z.nazivSorte,
          polozaj: z.polozaj ?? "",
          kg: z.kolicinaKgGrozdja,
          litre: z.kolicinaLitara,
          randman: randmanRetka(z),
          secer: z.secer,
          kiseline: z.kiseline,
          ph: z.ph,
          maceracija: opisMaceracije(z.maceracija, z.maceracijaSati) ?? "",
          oznaka: z.oznakaBerbe ?? "",
          napomena: z.napomena ?? "",
        });
        red.getCell("datum").numFmt = "dd.mm.yyyy";
        formatiraj(red);
        if (jeZateceno) oboji(red, BOJA_ZATECENO);
      }

      if (p.grupiraj !== "nista") {
        redZbroja(`Podzbroj · ${g.zapisi.length}`, izracunajSazetak(g.zapisi), BOJA_PODZBROJ);
      }
    }

    redZbroja(
      imaOznacenih
        ? `Označeno · ${zapisi.length} od ${prikazani.length}`
        : `Ukupno · ${zapisi.length}`,
      izracunajSazetak(zapisi),
      BOJA_UKUPNO
    );

    // Biljeska: kako je racunato i sto je bilo odabrano.
    const opis = [
      p.godina === BEZ_GODISTA ? "bez godišta" : p.godina ? `berba ${p.godina}` : "sve godine",
      p.zateceno ? "zatečeno uključeno" : "bez zatečenog",
      p.tekst.trim() ? `pretraga: "${p.tekst.trim()}"` : null,
      p.grupiraj !== "nista" ? `grupirano po: ${p.grupiraj}` : null,
      imaOznacenih ? `samo označeni (${zapisi.length})` : null,
    ].filter(Boolean);

    ws.addRow([]);
    for (const tekst of [
      `Odabir: ${opis.join(", ")}.`,
      "Šećer, kiseline i pH u zbrojevima su prosjek ponderiran kilogramima; ulazi samo zapis koji ima i vrijednost i kg. Uz zbroj stoji koliko je takvih (n/od).",
      "Randman u zbroju je ΣL / Σkg × 100 nad zapisima s kilogramima, ne prosjek randmana.",
    ]) {
      ws.addRow([tekst]).font = { italic: true, color: { argb: "FF6B7280" } };
    }

    const buffer = await wb.xlsx.writeBuffer();
    const oznakaGodine = p.godina && p.godina !== BEZ_GODISTA ? `-${p.godina}` : "";
    const naziv = `berba${oznakaGodine}-${danasZaNaziv(new Date())}.xlsx`;

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${naziv}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("POST /api/berba/export error:", error);
    return NextResponse.json({ error: "Greška kod izvoza berbe." }, { status: 500 });
  }
}
