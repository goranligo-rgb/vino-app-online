import type { Prisma } from "@prisma/client";
import { sastavSvihTankova } from "@/lib/berba-model";
import { PRAG_SORTNOSTI, razvrstaj } from "@/lib/identitet-vina";
import { imeZaPrikaz } from "@/lib/ime-vina";
import type { IzborPolja } from "@/lib/monitor-vina";
import { uValovima } from "@/lib/paralelno";
import { procitajMonitorVina } from "@/lib/snimka-vina";
import {
  POLJA_PREGLEDA,
  uMl,
  type PoljePregleda,
  type PregledVina,
  type VinoRedak,
  type VrijednostPolja,
} from "@/lib/statistika-vina";

/**
 * PREGLED VINA — citanje iz baze. Samo citanje: nijedan upis.
 *
 * ISTE VRIJEDNOSTI KAO STRANICA TANKA. `procitajMonitorVina` je prijepis
 * stranice koji cuva scripts/test-snimka-vina.ts, a svojim putem (kroz
 * `parametriVinaIzKnjige`) cita i `ArhivaVinaMjerenje`, pa pravilo iz AGENTS.md
 * ostaje ispunjeno. Vlastiti racun bio bi treca kopija istih pravila.
 *
 * CIJENA: upiti po tanku, valovima po cetiri (mjereno 03.11.2026.: 38 tankova
 * oko 6 s s lokalnog racunala). Skupo mjesto je `parametriVinaIzKnjige`.
 *
 * Izdvojeno iz rute jer se ruta ne da pokrenuti izvan zahtjeva (cita sesiju), a
 * test mora vidjeti bas ono sto ruta vraca.
 */

// Isti tip koji `procitajMonitorVina` trazi; `PrismaClient` mu je pridruziv.
type Klijent = Prisma.TransactionClient;

function vrijednostPolja(o: IzborPolja | undefined): VrijednostPolja {
  if (!o) return { vrijednost: null, podrijetlo: "nema", izmjerenoAt: null };
  return {
    vrijednost: o.vrijednost,
    podrijetlo: o.podrijetlo,
    // Datum samo uz stvarno izmjereno (vlasnik, 03.11.2026.): redak koji je
    // upisao pretok nosi datum pretoka, a vino tada nitko nije mjerio.
    izmjerenoAt:
      o.podrijetlo === "mjereno" && o.vlastito
        ? o.vlastito.izmjerenoAt.toISOString()
        : null,
  };
}

export async function procitajPregledVina(db: Klijent): Promise<PregledVina> {
  const tankovi = await db.tank.findMany({
    orderBy: { broj: "asc" },
    select: { id: true, broj: true, kolicinaVinaUTanku: true },
  });

  const puni = tankovi.filter((t) => uMl(t.kolicinaVinaUTanku) > 0);
  if (puni.length === 0) return { pragSortnosti: PRAG_SORTNOSTI, vina: [] };

  const sastavi = await sastavSvihTankova(db);
  const sada = new Date();

  const monitori = await uValovima(
    puni.map((t) => () => procitajMonitorVina(db, t.id, sada)),
    4
  );

  const vina = puni.map((t, i): VinoRedak => {
    const { izbor, ime, tank } = monitori[i];

    const sastav = (sastavi.get(t.id) ?? []).map((s) => ({
      nazivSorte: s.nazivSorte,
      postotak: s.postotak,
    }));

    const { vrsta, glavna } = razvrstaj(
      sastav.map((s) => ({ ...s, berbaId: "", litre: 0 }))
    );

    const parametri = {} as Record<PoljePregleda, VrijednostPolja>;
    for (const p of POLJA_PREGLEDA) {
      parametri[p.kljuc] = vrijednostPolja(izbor.find((o) => o.kljuc === p.kljuc));
    }

    const datumi = Object.values(parametri)
      .map((p) => p.izmjerenoAt)
      .filter((d): d is string => d != null)
      .sort();

    return {
      tankId: t.id,
      broj: t.broj,
      sifra: ime.sifra?.trim() || null,
      naziv: imeZaPrikaz(ime).tekst,
      godiste: tank.godiste,
      ml: uMl(t.kolicinaVinaUTanku),
      sastav,
      vrsta,
      glavna,
      parametri,
      zadnjeMjerenjeAt: datumi[datumi.length - 1] ?? null,
    };
  });

  return { pragSortnosti: PRAG_SORTNOSTI, vina };
}
