export const dynamic = "force-dynamic";

/**
 * BERBA — CITANJE. Izvor za stranicu /berba.
 *
 * Cita `Berba` i `BerbaKretanje`, ne `PunjenjeStavka`. Razlika nije kozmeticka:
 * punjenja je staro arhiviranje brisalo, pa je stara stranica pokazivala samo
 * ono sto je slucajno prezivjelo. Knjiga ima i ono sto je rekonstruirano.
 *
 * SAMO ONO STO JE USLO
 * --------------------
 * `kolicinaLitara` je koliko je UBRANO. Povijesna cinjenica: ne mijenja se kad
 * vino ode, berba 2026 je 15.650 L i nakon sto je pola prodano. To NIJE stanje
 * skladista i ovdje se ono ne racuna.
 *
 * GDJE JE VINO DANAS OVDJE NE STOJI. Knjiga kretanja to zna i `gdjeJeSveBerbe`
 * u lib/berba-model.ts je i dalje ondje — ali to je stanje vina, ne podatak o
 * berbi, i ima svoje mjesto u monitoru tanka i pracenju vina. Ova ruta ga ne
 * pita, pa ga ni ne placa jednim upitom po zahtjevu.
 *
 * TRI UPITA, FIKSNO
 * -----------------
 * Ne ovisi o broju berbi: zapisi, ULAZ retci i brojevi tankova. Nijedan nije po
 * berbi — to je ono sto lib/paralelno.ts zabranjuje, jer pooler drzi 15 veza za
 * cijelu aplikaciju.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";

export async function GET() {
  try {
    // Prijava se trazi, role ne — /berba je pregled, a proxy.ts stiti samo
    // stranice, pa ruta mora sama provjeriti. Isti obrazac kao ostale rute.
    const user = await citajSesiju();

    if (!user?.id) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    // 1) Zapisi berbe. Meko obrisani (pogresan unos) ispadaju — njihove litre
    //    su povucene iz knjige pa bi u statistici bile dvostruka tvrdnja.
    const berbe = await prisma.berba.findMany({
      where: { obrisano: false },
      orderBy: [{ datumBerbe: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        vrstaUnosa: true,
        nazivSorte: true,
        sortaId: true,
        datumBerbe: true,
        godinaBerbe: true,
        kolicinaKgGrozdja: true,
        kolicinaLitara: true,
        polozaj: true,
        parcela: true,
        vinograd: true,
        oznakaBerbe: true,
        secer: true,
        kiseline: true,
        ph: true,
        maceracija: true,
        maceracijaSati: true,
        napomena: true,
        prviTankId: true,
        izvornaPunjenjeStavkaId: true,
        ispravljenoAt: true,
        razlogIspravka: true,
        createdAt: true,
      },
    });

    // 2) ULAZ retci — jedini nose KAD je vino uslo u podrum i u koji tank.
    //
    //    `godinaBerbe` je na vecini zapisa prazna (30 od 32 na dan pisanja):
    //    ZATECENO zapisi nastali iz rekonstrukcije nemaju upisano godiste. Bez
    //    rezerve bi svi pali u "bez godista" i filtar po godini bi bio prazan.
    //    `dogodenoAt` je pouzdana rezerva — punjenje ondje upisuje datum
    //    punjenja, backfill povijesni datum cina — ali je IZVEDENA, pa stranica
    //    mora moci reci koja je godina upisana a koja izracunata.
    const ulazi = await prisma.berbaKretanje.findMany({
      where: { vrsta: "ULAZ" },
      orderBy: { dogodenoAt: "asc" },
      select: { berbaId: true, dogodenoAt: true, uTankId: true, punjenjeId: true },
    });

    const prviUlaz = new Map<string, (typeof ulazi)[number]>();

    for (const u of ulazi) {
      if (!prviUlaz.has(u.berbaId)) prviUlaz.set(u.berbaId, u);
    }

    // 3) Brojevi tankova. Bez stranog kljuca na `Tank` — tank je mogao biti
    //    prenumeriran ili odavno napunjen drugim vinom, pa se broj cita sada i
    //    ne cuva na zapisu berbe.
    const tankovi = await prisma.tank.findMany({
      select: { id: true, broj: true },
    });

    const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));

    const rezultat = berbe.map((b) => {
      const ulaz = prviUlaz.get(b.id) ?? null;

      const godinaUpisana = b.godinaBerbe ?? null;
      const godinaIzvedena = ulaz ? ulaz.dogodenoAt.getUTCFullYear() : null;

      return {
        id: b.id,
        vrstaUnosa: b.vrstaUnosa,
        nazivSorte: b.nazivSorte,
        sortaId: b.sortaId,

        datumBerbe: b.datumBerbe,
        // Datum ulaska u podrum — kad datum berbe nije upisan, ovo je jedino
        // sto se o vremenu zna.
        datumUlaska: ulaz?.dogodenoAt ?? null,

        godina: godinaUpisana ?? godinaIzvedena,
        godinaUpisana,
        /** true = godina nije upisana nego izvedena iz datuma ulaska u podrum. */
        godinaIzvedena: godinaUpisana == null && godinaIzvedena != null,

        kolicinaLitara: Number(b.kolicinaLitara),
        kolicinaKgGrozdja:
          b.kolicinaKgGrozdja == null ? null : Number(b.kolicinaKgGrozdja),

        // Polozaj je interna sifra polozaja i `parcela` nosi isti broj; stranica
        // razradjuje po polozaju, parcela ostaje u odgovoru radi potpunosti.
        polozaj: b.polozaj,
        parcela: b.parcela,
        vinograd: b.vinograd,
        oznakaBerbe: b.oznakaBerbe,

        secer: b.secer == null ? null : Number(b.secer),
        kiseline: b.kiseline == null ? null : Number(b.kiseline),
        ph: b.ph == null ? null : Number(b.ph),

        maceracija: b.maceracija,
        maceracijaSati:
          b.maceracijaSati == null ? null : Number(b.maceracijaSati),

        napomena: b.napomena,
        ispravljenoAt: b.ispravljenoAt,
        razlogIspravka: b.razlogIspravka,

        prviTankId: b.prviTankId,
        prviTankBroj: b.prviTankId ? brojTanka.get(b.prviTankId) ?? null : null,

        // Stavka punjenja iz koje je zapis nastao — jedino po cemu se berba
        // moze obrisati (`DELETE /api/punjenje-stavka/[id]`). Zapisi
        // rekonstruirani iz arhive je nemaju: punjenja vise nema, pa nema ni
        // sto obrisati, i stranica ondje ne nudi gumb.
        izvornaPunjenjeStavkaId: b.izvornaPunjenjeStavkaId,
      };
    });

    return NextResponse.json({
      ok: true,
      berbe: rezultat,
      // Mjera cjelovitosti povijesti, ista koju ispisuje scripts/provjeri-berbu.ts.
      brojBerbi: rezultat.filter((b) => b.vrstaUnosa === "BERBA").length,
      brojZatecenih: rezultat.filter((b) => b.vrstaUnosa === "ZATECENO").length,
    });
  } catch (error) {
    console.error("GET /api/berba error:", error);

    return NextResponse.json(
      { error: "Greška kod dohvaćanja podataka o berbi." },
      { status: 500 }
    );
  }
}
