/**
 * Izvoz pregleda stanja skladista u .xlsx.
 *
 * runtime = "nodejs" je obavezan: exceljs koristi Node streamove i zlib, u Edge
 * runtimeu se ne moze pokrenuti.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { citajSesiju } from "@/lib/auth-sesija";
import {
  citajFiltere,
  danasZaNaziv,
  dohvatiStanjeSkladista,
  smijeGledatiStanje,
  zagrebYMD,
} from "@/lib/preparat-stanje";

const BOJA_ISPOD_MINIMUMA = "FFFDE2E2"; // svijetlo crvena podloga retka
const BOJA_TEKST_MANJAK = "FFB91C1C";

export async function GET(req: Request) {
  try {
    const user = await citajSesiju();

    if (!user) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    // Ista provjera kao na pregledu — izvoz nije zaobilaznica prava.
    if (!smijeGledatiStanje(user)) {
      return NextResponse.json(
        { error: "Nemate pravo izvoza stanja skladišta." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const filteri = citajFiltere(searchParams);

    // Isti upit i isti filteri kao stranica -> izvozi se tocno ono sto je na
    // ekranu, u istom redoslijedu.
    const { redci, provjera } = await dohvatiStanjeSkladista(filteri);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Vino aplikacija";
    const ws = wb.addWorksheet("Stanje skladišta");

    ws.columns = [
      { header: "Naziv", key: "naziv", width: 34 },
      { header: "Skladišna jedinica", key: "jedinica", width: 20 },
      { header: "Stanje", key: "stanje", width: 14 },
      { header: "Minimum", key: "minimum", width: 14 },
      { header: "Razlika", key: "razlika", width: 14 },
      { header: "Zadnji ulaz", key: "zadnjiUlaz", width: 16 },
      { header: "Dobavljač zadnjeg ulaza", key: "dobavljac", width: 28 },
    ];

    const zaglavlje = ws.getRow(1);
    zaglavlje.font = { bold: true };
    zaglavlje.alignment = { vertical: "middle" };
    zaglavlje.border = {
      bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
    };

    // Zamrznut prvi red.
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const r of redci) {
      // Datum ide kao pravi datum: exceljs racuna serijski broj iz getTime(),
      // pa se dan gradi kao UTC ponoc hrvatskog kalendarskog dana.
      let datum: Date | null = null;
      if (r.zadnjiUlazDatum) {
        const { y, m, d } = zagrebYMD(r.zadnjiUlazDatum);
        datum = new Date(Date.UTC(y, m - 1, d));
      }

      const red = ws.addRow({
        naziv: r.naziv,
        jedinica: r.jedinica ?? "",
        stanje: r.stanje,
        minimum: r.minimum,
        razlika: r.razlika,
        zadnjiUlaz: datum,
        dobavljac: r.zadnjiUlazDobavljac ?? "",
      });

      // Brojevi su brojevi, ne tekst — s dvije decimale.
      for (const stupac of ["stanje", "minimum", "razlika"]) {
        const celija = red.getCell(stupac);
        celija.numFmt = "0.00";
        celija.alignment = { horizontal: "right" };
      }

      const celijaDatuma = red.getCell("zadnjiUlaz");
      celijaDatuma.numFmt = "dd.mm.yyyy";
      celijaDatuma.alignment = { horizontal: "right" };

      if (r.ispodMinimuma) {
        red.eachCell({ includeEmpty: true }, (celija) => {
          celija.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: BOJA_ISPOD_MINIMUMA },
          };
        });
        red.getCell("razlika").font = {
          bold: true,
          color: { argb: BOJA_TEKST_MANJAK },
        };
      }
    }

    // Autofilter nad zaglavljem — praktican na duljem popisu.
    if (redci.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: ws.columns.length },
      };
    }

    // Kratka biljeska ispod tablice: sto je bilo filtrirano i je li knjiga
    // usklađena u trenutku izvoza. Namjerno BEZ zbroja stupaca — jedinice su
    // razlicite (kg, l, g, ml) pa zbroj ne bi imao znacenje.
    const opisFiltera = [
      filteri.q ? `pretraga: "${filteri.q}"` : null,
      filteri.samoIspodMinimuma ? "samo ispod minimuma" : null,
      filteri.samoAktivni ? "samo aktivni" : null,
    ].filter(Boolean);

    ws.addRow([]);
    const redFiltera = ws.addRow([
      `Filteri: ${opisFiltera.length ? opisFiltera.join(", ") : "bez filtera"} — redaka: ${redci.length}`,
    ]);
    redFiltera.font = { italic: true, color: { argb: "FF6B7280" } };

    const redProvjere = ws.addRow([
      provjera.uskladjeno
        ? `Knjiga usklađena (${provjera.ukupnoPreparata} preparata)`
        : `Odstupanje: ${provjera.odstupanja.length} preparata — ${provjera.odstupanja
            .map((o) => o.naziv)
            .join(", ")}`,
    ]);
    redProvjere.font = {
      italic: true,
      color: { argb: provjera.uskladjeno ? "FF15803D" : BOJA_TEKST_MANJAK },
    };

    const buffer = await wb.xlsx.writeBuffer();
    const naziv = `stanje-skladista-${danasZaNaziv(new Date())}.xlsx`;

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${naziv}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/preparat/stanje/export error:", error);
    return NextResponse.json(
      { error: "Greška kod izvoza stanja skladišta." },
      { status: 500 }
    );
  }
}
