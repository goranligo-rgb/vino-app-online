/**
 * Izvoz podruma u .xlsx — jedan redak po PUNOM tanku, za sortiranje i filtriranje.
 *
 * CITA, NE PISE. Nijedan upit odavde ne mijenja bazu.
 *
 * ISTI DOHVAT KAO TISKANI IZVJESTAJ: `dohvatiPodrum()` + `sloziKartice()`.
 * Ovdje se NE SMIJE napisati nijedan vlastiti upit. Razlog je isti kao kod
 * izvoza skladista: da izvoz i ekran ne mogu reci razlicito. Uz to, dohvat
 * izvjestaja ima tvrdo pravilo "nijedan upit po tanku" (vidi zaglavlje
 * `podaci.ts`) — 20 upita za cijeli podrum. Petlja po tankovima ovdje bi to
 * ponistila.
 *
 * SADRZAJ CELIJA JE U `lib/izvoz-podrum.ts`, ne ovdje: ruta se ne da pokrenuti
 * izvan zahtjeva, pa bi inace bila provjerljiva samo prepisivanjem u skriptu.
 * Ovdje ostaje ono sto je stvarno posao rute — prava, zaglavlje i oblikovanje.
 *
 * OGRANICENJE KOJE SE NASLJEDUJE: mjerenja se citaju u prozoru od 8 tjedana, a
 * ne od granice vina (`podaci.ts`, KRUG 2). Tanku napunjenom prije manje od 8
 * tjedana u stupce moze uci mjerenje PRETHODNOG vina, a tank bez mjerenja u tom
 * prozoru ostaje prazan (stupac "Mjereno" to pokazuje). Svjesno: izvoz se mora
 * slagati s izvjestajem podruma. Kad se taj nalaz popravi u `podaci.ts`,
 * POPRAVLJA SE ZA OBOJE ODJEDNOM — izvoz nema vlastiti prozor koji bi trebalo
 * mijenjati, pa se razilazenje ne bi ni vidjelo.
 *
 * runtime = "nodejs" je obavezan: exceljs koristi Node streamove i zlib.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { citajSesiju } from "@/lib/auth-sesija";
import { smijeRaditiUPodrumu } from "@/lib/zadatak-auth";
// Datum u nazivu datoteke po hrvatskoj zoni — jedina izvedba u repozitoriju
// (lib/preparat-stanje.ts). Druga kopija bi znala dati drugi dan oko ponoci.
import { danasZaNaziv } from "@/lib/preparat-stanje";
import { redakIzvoza } from "@/lib/izvoz-podrum";
import { dohvatiPodrum } from "@/app/dashboard/izvjestaji/podrum/podaci";
import { sloziKartice } from "@/app/dashboard/izvjestaji/podrum/model";

/**
 * Format po stupcu. `numFmt` je SAMO PRIKAZ: u celiju ide nezaokruzena
 * vrijednost, pa sortiranje i filtriranje rade s pravim brojem.
 */
const FORMATI: Record<string, string> = {
  kolicina: "#,##0",
  kapacitet: "#,##0",
  kiselina: "0.0",
  secer: "0.0",
  alkohol: "0.0",
  ph: "0.00",
  so2Slobodni: "0",
  so2Ukupni: "0",
  mjereno: "dd.mm.yyyy",
};

const SIROKE: string[] = ["sastav", "kvasac", "napomena"];

export async function GET() {
  try {
    const user = await citajSesiju();

    if (!user) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    // Isto pravilo kojim je zatvorena i stranica izvjestaja: ADMIN, PODRUM,
    // ENOLOG. Proxy ne gleda /api/* (vidi lib/zadatak-auth.ts), pa je ova
    // provjera jedina brava — bez nje bi izvoz bio zaobilaznica oko stranice.
    if (!smijeRaditiUPodrumu(user)) {
      return NextResponse.json(
        { error: "Nemate pravo izvoza podruma." },
        { status: 403 }
      );
    }

    const podaci = await dohvatiPodrum();
    // `sloziKartice` vraca SAMO pune tankove (`podaci.puni`) — prazne posude u
    // tablicu ne ulaze, kao ni na ispis.
    const kartice = sloziKartice(podaci);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Vino aplikacija";
    const ws = wb.addWorksheet("Podrum");

    ws.columns = [
      { header: "Br. tanka", key: "broj", width: 10 },
      { header: "Količina vina (L)", key: "kolicina", width: 16 },
      { header: "Kapacitet (L)", key: "kapacitet", width: 14 },
      { header: "Sorta", key: "sorta", width: 22 },
      { header: "Sastav", key: "sastav", width: 46 },
      { header: "Kiselina (g/L)", key: "kiselina", width: 14 },
      { header: "Šećer (g/L)", key: "secer", width: 13 },
      { header: "Alkohol (% vol)", key: "alkohol", width: 15 },
      { header: "pH", key: "ph", width: 8 },
      { header: "SO2 slobodni (mg/L)", key: "so2Slobodni", width: 19 },
      { header: "SO2 ukupni (mg/L)", key: "so2Ukupni", width: 18 },
      { header: "Mjereno", key: "mjereno", width: 12 },
      { header: "Kvasac", key: "kvasac", width: 46 },
      { header: "Napomena", key: "napomena", width: 38 },
    ];

    const zaglavlje = ws.getRow(1);
    zaglavlje.font = { bold: true };
    zaglavlje.alignment = { vertical: "middle" };
    zaglavlje.border = {
      bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
    };

    // Zamrznut prvi red — popis je dulji od ekrana.
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const k of kartice) {
      const red = ws.addRow(redakIzvoza(k));

      // Format se stavlja SAMO na popunjenu celiju: prazna tako ostaje prava
      // prazna celija, a ne oblikovana nula.
      for (const [kljuc, format] of Object.entries(FORMATI)) {
        const celija = red.getCell(kljuc);
        if (celija.value == null) continue;
        celija.numFmt = format;
        celija.alignment = { horizontal: "right" };
      }

      for (const kljuc of SIROKE) {
        red.getCell(kljuc).alignment = { vertical: "top", wrapText: true };
      }
    }

    // Autofilter nad zaglavljem. NAMJERNO NEMA retka s biljeskom ispod tablice
    // (izvoz skladista ga ima): Excel bi ga povukao u raspon filtriranja i
    // sortiranja, a ovdje je cijela svrha tablice da se sortira.
    if (kartice.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: ws.columns.length },
      };
    }

    const buffer = await wb.xlsx.writeBuffer();
    const naziv = `podrum-${danasZaNaziv(new Date())}.xlsx`;

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
    console.error("GET /api/izvoz/podrum error:", error);
    return NextResponse.json(
      { error: "Greška kod izvoza podruma." },
      { status: 500 }
    );
  }
}
