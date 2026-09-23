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
import { citajBerbe } from "@/lib/berba-citanje";
import { citajSesiju } from "@/lib/auth-sesija";

export async function GET() {
  try {
    // Prijava se trazi, role ne — /berba je pregled, a proxy.ts stiti samo
    // stranice, pa ruta mora sama provjeriti. Isti obrazac kao ostale rute.
    const user = await citajSesiju();

    if (!user?.id) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    // Citanje zivi u lib/berba-citanje.ts — isto ga zove izvoz u Excel.
    const rezultat = await citajBerbe();

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
