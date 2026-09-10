/**
 * POPIS KVASACA ZA PRIKAZ — jedan racun za sve ekrane.
 * ======================================================================
 *
 * Vino u tanku obicno nije fermentiralo jednim kvascem. Tank 5 danas nosi pet
 * kvasaca iz cetiri druga tanka, a stranica je do sada pokazivala jedan — onaj
 * koji je slucajno bio zadnji upisan U TOM TANKU. Cesto nijedan, jer nijedna
 * od tih radnji nije ni izvedena ondje.
 *
 * Prikaz je zato POPIS, sa svotom koja se moze provjeriti:
 *
 *   Uvaferm FC-E (T11) 33 % · Lalvin Sensy (T17) 19 % ·
 *   Alchemy II (T10) 9 % · bez zapisa 39 %
 *
 * BEZ ZAPISA SE UVIJEK PRIKAZUJE KAD POSTOJI. Zbroj mora davati 100 %; kad se
 * pokazu samo kvasci, "33 % · 19 % · 9 %" izgleda kao da je racun negdje pojeo
 * 39 %, a zapravo toliko vina jednostavno nema zapis o fermentaciji.
 *
 * ZBROJ PREKO 100 % NIJE GRESKA. U istu sarzu zna otici vise od jednog kvasca
 * (T11 je dobio Uvaferm FC-513 u srpnju i RENAISSANCE TR 313 u kolovozu), pa
 * njihovi udjeli opisuju isto vino dvaput. Tada nema ostatka i "bez zapisa" se
 * ne prikazuje — brojke se pokazuju kakve jesu, umjesto da ih se stisce u
 * stotku koja bi lagala.
 */

/** Redak `VinoRadnja` onako kako ga prikaz treba. */
export type IzvorKvasca = {
  preparatNaziv: string | null;
  opis: string | null;
  izvorniBrojTanka: number | null;
  dogodenoAt: Date;
  udio: number;
  jeKvasac: boolean;
  vrsta: string;
};

export type StavkaKvasca = {
  naziv: string;
  brojTanka: number | null;
  datum: Date;
  /** Cijeli postotak, vec zaokruzen tako da se popis zbraja u 100. */
  postotak: number;
};

export type PopisKvasaca = {
  stavke: StavkaKvasca[];
  /** Cijeli postotak vina bez zapisa; 0 kad ga nema. */
  bezZapisaPostotak: number;
  /**
   * VECINSKI kvasac — onaj s najvecim udjelom. Od njega se racuna dan
   * fermentacije.
   *
   * NIJE najnoviji, i to je ispravak. Dok se citalo iz `Radnja`, tank je imao
   * samo svoje kvasce pa je "zadnji upisani" bio razuman izbor. Otkad popis
   * nosi i kvasce koje je vino donijelo, najmladji zna biti sasvim sporedan:
   * tank 7 je pao s 9. na 4. dan fermentacije zbog kvasca koji drzi 5 % tanka.
   * Dan fermentacije opisuje vino u tanku, pa ga mora odrediti vecina tog vina.
   *
   * Kod jednakog udjela odlucuje STARIJI datum: fermentacija tog vina je tada
   * i pocela.
   */
  vecinski: StavkaKvasca | null;
};

export const PRAZAN_POPIS: PopisKvasaca = {
  stavke: [],
  bezZapisaPostotak: 0,
  vecinski: null,
};

/**
 * Zaokruzi udjele na cijele postotke tako da im je zbroj TOCNO 100.
 *
 * Obicno zaokruzivanje svakog udjela za sebe daje 33 + 19 + 9 + 39 = 100 samo
 * slucajno; cesce ispadne 99 ili 101, i to na ekranu izgleda kao greska. Metoda
 * najveceg ostatka dijeli razliku onima koji su najvise izgubili
 * zaokruzivanjem.
 */
function stotka(udjeli: number[]): number[] {
  const sirovi = udjeli.map((u) => u * 100);
  const dolje = sirovi.map((x) => Math.floor(x));
  const manjak = 100 - dolje.reduce((z, x) => z + x, 0);

  if (manjak <= 0) return dolje;

  const poOstatku = sirovi
    .map((x, i) => ({ i, ostatak: x - Math.floor(x) }))
    .sort((a, b) => b.ostatak - a.ostatak);

  const rezultat = [...dolje];

  for (let n = 0; n < manjak && n < poOstatku.length; n++) {
    rezultat[poOstatku[n].i]++;
  }

  return rezultat;
}

/**
 * Popis kvasaca iz redaka `VinoRadnja` jednog tanka.
 *
 * `jeKvasac` se ovdje koristi ZA ONO ZA STO JEDINO SMIJE — da odgovori je li
 * neki dodatak kvasac. Popis DODATAKA se njime nikad ne filtrira: dnevnik mora
 * pokazati sve sto je islo u most. Vidi biljesku uz `Preparation.jeKvasac`.
 */
export function popisKvasaca(redci: IzvorKvasca[]): PopisKvasaca {
  const kvasci = redci
    .filter((r) => r.jeKvasac && r.vrsta === "DODAVANJE" && r.udio > 0)
    .sort((a, b) => b.udio - a.udio);

  if (kvasci.length === 0) return PRAZAN_POPIS;

  const zbroj = kvasci.reduce((z, r) => z + r.udio, 0);
  const rupa = Math.max(0, 1 - zbroj);

  // Kad ima ostatka, on ulazi u isti racun kao i kvasci — inace bi zaokruzivanje
  // popravljalo samo kvasce, a "bez zapisa" bi ostao razlika do 99 ili 101.
  const postotci =
    rupa > 0
      ? stotka([...kvasci.map((r) => r.udio), rupa])
      : kvasci.map((r) => Math.round(r.udio * 100));

  const stavke: StavkaKvasca[] = kvasci.map((r, i) => ({
    naziv: r.preparatNaziv ?? r.opis ?? "kvasac bez imena",
    brojTanka: r.izvorniBrojTanka,
    datum: r.dogodenoAt,
    postotak: postotci[i],
  }));

  // Stavke s 0 % nakon zaokruzivanja se izbacuju: "Alchemy II (T10) 0 %" ne
  // kaze nista, a popisu oduzima citljivost. Njihov postotak je vec podijeljen
  // ostalima, pa zbroj i dalje daje 100.
  const vidljive = stavke.filter((s) => s.postotak > 0);

  const vecinski =
    [...vidljive].sort(
      (a, b) => b.postotak - a.postotak || a.datum.getTime() - b.datum.getTime()
    )[0] ?? null;

  return {
    stavke: vidljive,
    bezZapisaPostotak: rupa > 0 ? postotci[postotci.length - 1] : 0,
    vecinski,
  };
}

/** Jedan kvasac kao tekst: "Uvaferm FC-E (T11) 33 %". */
export function opisStavke(s: StavkaKvasca): string {
  const tank = s.brojTanka !== null ? ` (T${s.brojTanka})` : "";
  return `${s.naziv}${tank} ${s.postotak} %`;
}

/** Cijeli popis kao jedan redak teksta, s "bez zapisa" na kraju. */
export function opisPopisa(p: PopisKvasaca): string {
  const dijelovi = p.stavke.map(opisStavke);

  if (p.bezZapisaPostotak > 0) {
    dijelovi.push(`bez zapisa ${p.bezZapisaPostotak} %`);
  }

  return dijelovi.join(" · ");
}
