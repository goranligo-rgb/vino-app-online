import type {
  IzvorPolja,
  PodrijetloPolja,
  PokrivenostPolja,
  ParametriBlenda,
  VrijednostiMjerenja,
} from "@/lib/mjerenja";
import type { ParametriVina, PoljeVina } from "@/lib/parametri-vina";
import { razlogSkrivanja, stanjeVina } from "@/lib/vino-fermentira";

/**
 * VRIJEDNOSTI MONITORA PO POLJU — koju vrijednost stranica tanka pokazuje za
 * svako polje i odakle ona dolazi.
 * ======================================================================
 *
 * IZDVOJENO IZ app/tankovi/[id]/page.tsx (29.09.2026), doslovno i bez promjene
 * ponasanja. Razlog: snimka vina u trenutku kad napusta posudu mora spremiti
 * ISTO sto monitor pokazuje, a dvije kopije istog izbora bi se razisle (vec se
 * dogodilo s dvije kopije arhiviranja, vidi lib/pretok-arhiviranje.ts).
 *
 * Dokaz da je izdvajanje doslovno: otisak propsa `<ParametriPoPolju>` za svih
 * 48 tankova, prije i poslije izmjene, jednak do znaka.
 *
 * Cisti racun — nijedan upit. Ulaze salje pozivatelj, koji ih ionako cita:
 * stranica tanka u svojim valovima, snimka unutar transakcije pretoka.
 *
 * REDOSLIJED IZVORA po polju:
 *   1. vlastito mjerenje ovog tanka ("mjereno"; "preneseno" kad ga je upisao
 *      pretok, jeRucno = false — ni to nitko nije izmjerio);
 *   2. procjena iz blenda ("blend");
 *   3. vrijednost izmjerena na ovom vinu u ranijoj posudi ("knjiga") — osim
 *      kad je vino u fermentaciji, a vrijednost starija od secera koji to
 *      dokazuje (lib/vino-fermentira.ts);
 *   4. "nema".
 */

type Polje = keyof VrijednostiMjerenja;

/** Polja monitora, redom kojim se prikazuju. */
export const POLJA_MONITORA: ReadonlyArray<{
  kljuc: Polje;
  naziv: string;
  jedinica: string;
}> = [
  { kljuc: "alkohol", naziv: "Alkohol", jedinica: "%" },
  { kljuc: "secer", naziv: "Šećer", jedinica: "" },
  { kljuc: "ukupneKiseline", naziv: "Ukupne kiseline", jedinica: "" },
  { kljuc: "hlapiveKiseline", naziv: "Hlapive kiseline", jedinica: "" },
  { kljuc: "slobodniSO2", naziv: "Slobodni SO₂", jedinica: "" },
  { kljuc: "ukupniSO2", naziv: "Ukupni SO₂", jedinica: "" },
  { kljuc: "ph", naziv: "pH", jedinica: "" },
  { kljuc: "temperatura", naziv: "Temperatura", jedinica: "°C" },
];

export type PodrijetloMonitora =
  | "mjereno"
  | "preneseno"
  | "blend"
  | "knjiga"
  | "nema";

export type IzborPolja = {
  kljuc: Polje;
  naziv: string;
  jedinica: string;
  /** Vrijednost koju monitor pokazuje. */
  vrijednost: number | null;
  podrijetlo: PodrijetloMonitora;
  /** Zasto vrijednost iz knjige NIJE prikazana (fermentacija), inace null. */
  neprikazano: string | null;
  /** Vlastito mjerenje ovog tanka za to polje, ako postoji. */
  vlastito: PodrijetloPolja;
  /** Procjena iz blenda za to polje, ako postoji. */
  blend: PokrivenostPolja | null;
  /** Vrijednost iz knjige koja SMIJE na ekran (vec prosla pravilo fermentacije). */
  izKnjige: PoljeVina | null;
};

export type UlazMonitora = {
  /** `sloziPoPolju` nad mjerenjima trenutnog vina ovog tanka. */
  poPolju: { vrijednosti: VrijednostiMjerenja; izvorPolja: IzvorPolja };
  blend: ParametriBlenda | null;
  parametriVina: ParametriVina | null;
  /** Granica vina je PRAZAN: ni procjene iz blenda ni vrijednosti iz knjige. */
  tankBezVina: boolean;
  /**
   * Trenutak za koji se sudi fermentira li vino. Stranica ga ne salje (sada);
   * snimka salje trenutak cina.
   */
  sada?: Date;
};

/** Izbor vrijednosti za svako polje monitora. */
export function vrijednostiMonitora(ulaz: UlazMonitora): IzborPolja[] {
  const { poPolju, blend, parametriVina, tankBezVina } = ulaz;

  // FERMENTIRA LI VINO — po VLASTITOM seceru ovog tanka, unutar granice vina.
  const stanjeFermentacije = stanjeVina(
    poPolju.vrijednosti.secer,
    poPolju.izvorPolja.secer?.izmjerenoAt ?? null,
    ulaz.sada
  );

  return POLJA_MONITORA.map((o): IzborPolja => {
    const izvor = poPolju.izvorPolja[o.kljuc];
    const vlastita = poPolju.vrijednosti[o.kljuc];
    // Prazan tank: ni procjene iz blenda ni vrijednosti iz knjige. `BlendIzvor`
    // retci ostaju na ispraznjenom tanku i opisuju vino koje je otislo.
    const b = tankBezVina ? null : (blend?.poPolju[o.kljuc] ?? null);

    // TRECI IZVOR, kad prva dva sute: vrijednost izmjerena na OVOM vinu dok
    // je bilo u ranijoj posudi. Nije racun nego mjerenje, pa stoji ispred
    // "nema" — a iza vlastitog i iza blenda, koji su blizi ovom tanku.
    const izKnjigeSirovo = tankBezVina
      ? null
      : (parametriVina?.poPolju[o.kljuc] ?? null);

    // FERMENTACIJA GASI NASLIJEDJENU VRIJEDNOST.
    //
    // Vino usred fermentacije svaki dan ima drugi alkohol i drugi SO2, pa
    // vrijednost naslijedjena iz neke ranije posude opisuje vino koje je tada
    // bilo ondje, a ne ovo. Pravilo i njegova iznimka (svjezija vrijednost
    // ostaje) stoje u lib/vino-fermentira.ts.
    //
    // Gasi SAMO naslijedjeno iz knjige. Vlastito mjerenje i procjena iz blenda
    // se ne diraju: prvo je mjereno na ovom vinu, drugo je racun nad danasnjim
    // sastavnicama.
    const razlogNeprikaza = izKnjigeSirovo
      ? razlogSkrivanja(o.kljuc, izKnjigeSirovo.najnovijeAt, stanjeFermentacije)
      : null;

    const izKnjige = razlogNeprikaza ? null : izKnjigeSirovo;

    // "preneseno" = vlastiti redak koji je upisao pretok (jeRucno = false).
    // Ni to nitko nije izmjerio, pa ide u isti vizualni razred kao blend.
    const podrijetlo: PodrijetloMonitora =
      vlastita != null
        ? izvor?.jeRucno === false
          ? "preneseno"
          : "mjereno"
        : b?.vrijednost != null
          ? "blend"
          : izKnjige != null
            ? "knjiga"
            : "nema";

    return {
      kljuc: o.kljuc,
      naziv: o.naziv,
      jedinica: o.jedinica,
      vrijednost:
        vlastita != null
          ? vlastita
          : (b?.vrijednost ?? izKnjige?.vrijednost ?? null),
      podrijetlo,
      neprikazano: razlogNeprikaza,
      vlastito: izvor,
      blend: b,
      izKnjige,
    };
  });
}
