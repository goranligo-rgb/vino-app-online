import type { Sastavnica, VinoCvor } from "@/lib/identitet-vina";

/**
 * PROSLI TANK — kucica iz sastava, otvorena kao vino ZAMRZNUTO na trenutak
 * ulaska u drugi tank (/prosli-tank).
 * ======================================================================
 *
 * Cisti racun nad vec izgradjenim stablom (`vinoUTanku`), bez ijednog upita.
 *
 * KUCICA JE FIZICKA KOMPONENTA, NE MJESTO U STABLU. Odredjuju je cin kojim je
 * usla (`Sastavnica.kljucCina`) i posuda iz koje je dosla. Ista komponenta
 * se u stablu zna pojaviti vise puta: kad se vino razdvoji pa u korijen
 * stigne s dvije strane, cijelo njegovo podstablo se ponovi. Sve te pojave
 * su ISTO vino, pa se racunaju zajedno.
 */

/**
 * `kljucCina` rastavljen: `veza:ciljniTank:vrsta`. Veza je `pretokId` ili
 * `zadatakId` (UUID bez dvotocke); rastavlja se s desna, pa i veza oblika
 * `sam:<id>` ostaje cijela.
 */
export function rastaviKljucCina(
  kljucCina: string
): { veza: string; ciljTankId: string; vrsta: string } | null {
  const dijelovi = kljucCina.split(":");
  if (dijelovi.length < 3) return null;
  const vrsta = dijelovi.pop()!;
  const ciljTankId = dijelovi.pop()!;
  const veza = dijelovi.join(":");
  if (!veza || !ciljTankId || !vrsta) return null;
  return { veza, ciljTankId, vrsta };
}

/** Posuda iz koje je kucica dosla; `null` za partiju berbe. */
function posudaKucice(s: Sastavnica): string | null {
  return s.vino.vrsta === "partija" ? null : s.vino.tankId;
}

function jeTaKucica(s: Sastavnica, izTankId: string, kljucCina: string): boolean {
  return s.kljucCina === kljucCina && posudaKucice(s) === izTankId;
}

export type PojavaKucice = {
  /** Posuda u koju je komponenta usla. */
  roditeljTankId: string;
  sastavnica: Sastavnica;
  /** Koliki je dio vina u korijenu ova pojava: umnozak `udio` duz puta. */
  udioUKorijenu: number;
};

/** Sve pojave jedne kucice u stablu korijena. */
export function pojaveKucice(
  korijen: VinoCvor,
  izTankId: string,
  kljucCina: string
): PojavaKucice[] {
  const out: PojavaKucice[] = [];

  const hod = (v: VinoCvor, udio: number) => {
    if (v.vrsta !== "spoj") return;
    for (const s of v.sastavnice) {
      const u = udio * s.udio;
      if (jeTaKucica(s, izTankId, kljucCina)) {
        out.push({ roditeljTankId: v.tankId, sastavnica: s, udioUKorijenu: u });
      }
      hod(s.vino, u);
    }
  };

  hod(korijen, 1);
  return out;
}

/** `VinoRadnja` korijena onoliko koliko ovaj racun treba. */
export type RedakKvasca = {
  izvorniTankId: string;
  dogodenoAt: Date;
  /** Udio u DANASNJEM vinu korijena, 0..1. */
  udio: number;
};

export type KvasacKucice<T> = {
  redak: T;
  /**
   * Udio u vinu kucice, 0..1 — ili `null` kad se ne zna.
   *
   * BROJ KAD GA ZNAMO, SUTNJA KAD NE ZNAMO, NIKAD POGODJEN BROJ — isto
   * pravilo koje vrijedi za "bez zapisa" i "Nepoznato podrijetlo".
   */
  udio: number | null;
  /**
   * Zasto broja nema:
   *   "vise_putova" — kvasac je u korijen stigao i kroz druge kucice;
   *   "nesklad"     — stize samo kroz ovu kucicu, ali bi prijevod presao
   *                   100 %: zapis `VinoRadnja` i knjiga tu ne pricaju istu
   *                   pricu (vidi 70 parova na popisu, 28.09.2026).
   */
  zasto: null | "vise_putova" | "nesklad";
};

/**
 * KVASCI KUCICE — iz `VinoRadnja` KORIJENA, prevedeni na komponentu.
 *
 * SAMO ZA KUCICE BEZ SNIMKE. Od 29.09.2026. svaki izlazak vina sprema
 * snimku s tocnim udjelima (`SnimkaVinaRadnja`, lib/snimka-vina.ts); kucica
 * koja je ima cita kvasce iz nje (`kvasciIzSnimke`), a ovaj prijevod se za
 * nju ne racuna — dva broja bila bi dvije tvrdnje o istom vinu.
 *
 * ZASTO PRIJEVOD, A NE VLASTITI ZAPIS (za starije kucice). Do koraka 2
 * snimka udjela u trenutku pretoka (`snimiVinoRadnje`, korak 6b motora) se
 * nije spremala: redci izvora brisu se pri praznjenju, a u cilju su spojeni
 * po `izvornaRadnjaId`. Tocna brojka za te komponente zato ne postoji.
 * Iz odigravanja knjige se NE racuna: rucni racun od 28.09.2026. potvrdio je
 * zapis `VinoRadnja` za pet od sest kvasaca u T20 i T7 do decimale, a
 * odigravanje grijesi zbog tri retka knjige u krivom fizickom redoslijedu.
 *
 * KAD JE PRIJEVOD TOCAN. Radnja u korijen stize ISKLJUCIVO kroz ovu kucicu
 * kad svaki cvor stabla koji je nosi — ista posuda, trenutak radnje unutar
 * prozora tog vina — lezi u podstablu neke pojave ove kucice. Tada su litre
 * s kvascem u korijenu upravo litre kucice u korijenu, pa je
 *
 *     udio u kucici = udio u korijenu / udio kucice u korijenu.
 *
 * Kad radnja stize i drugim putem, udio u korijenu je zbroj vise dolazaka i
 * ne da se rastaviti: kvasac se pokazuje, ali BEZ POSTOTKA. Na granici
 * prozora radnja broji u oba cvora, pa racun radije suti nego da pogadja.
 *
 * MJERENO 28.09.2026. Na prvoj razini SVI kvasci imaju postotak (T42 -> T5,
 * T42 -> T1, T7 -> T4). Suti tek dubina 3-4, gdje se vino iz T12 i T11
 * razdijelilo 27.08. u T40/T41/T46 i u korijen stiglo kroz vise puteva.
 * "Bez postotka svugdje" bacilo bi i te tocne postotke s prve razine.
 *
 * PRIJEVOD PRENOSI I POZNATU KRIVU TVRDNJU. Zapis ne popravlja: FC-513 na
 * kucici T5 u T42 pokazat ce 23,2 %, a tocno je 0 % — kvasac je dodan vinu
 * iz T11 koje je 21. i 29.07. napunjeno u boce, a knjiga to bocanje nema
 * (skinuto ISPRAVKOM datiranim 26.08.). Na popisu je, ne rjesava se ovdje.
 */
export function kvasciKucice<T extends RedakKvasca>(
  korijen: VinoCvor,
  izTankId: string,
  kljucCina: string,
  kvasci: T[]
): KvasacKucice<T>[] {
  const udioKucice = pojaveKucice(korijen, izTankId, kljucCina).reduce(
    (z, p) => z + p.udioUKorijenu,
    0
  );

  // Svaki cvor koji posudu ima, s prozorom svog vina i podatkom je li unutar
  // neke pojave ove kucice. Korijen nema gornji rub; neotvorena posuda
  // (zateceno vino) nema donji.
  type Nosilac = { tankId: string; odMs: number; doMs: number; unutar: boolean };
  const nosioci: Nosilac[] = [];

  const hod = (v: VinoCvor, doMs: number, unutar: boolean) => {
    if (v.vrsta === "partija") return;
    nosioci.push({
      tankId: v.tankId,
      odMs: v.vrsta === "spoj" ? v.kada.getTime() : -Infinity,
      doMs,
      unutar,
    });
    if (v.vrsta !== "spoj") return;
    for (const s of v.sastavnice) {
      hod(s.vino, s.usloAt.getTime(), unutar || jeTaKucica(s, izTankId, kljucCina));
    }
  };

  hod(korijen, Infinity, false);

  const out: KvasacKucice<T>[] = [];

  for (const r of kvasci) {
    const t = r.dogodenoAt.getTime();
    const nose = nosioci.filter(
      (n) => n.tankId === r.izvorniTankId && t >= n.odMs && t <= n.doMs
    );
    const unutra = nose.filter((n) => n.unutar);

    // Kvasac nije dodan ovom vinu ni ijednom od kojeg je nastalo.
    if (unutra.length === 0) continue;

    if (unutra.length === nose.length && udioKucice > 0) {
      const u = r.udio / udioKucice;
      // Preko 100 % znaci da zapis i knjiga ne pricaju istu pricu. Tada nema
      // tocnog broja, pa ni broja.
      out.push(
        u <= 1 + 1e-6
          ? { redak: r, udio: Math.min(u, 1), zasto: null }
          : { redak: r, udio: null, zasto: "nesklad" }
      );
      continue;
    }

    out.push({ redak: r, udio: null, zasto: "vise_putova" });
  }

  return out;
}

/** Posuda i prozor u kojem je vino kucice (ili neko od kojeg je nastalo) u njoj stajalo. */
export type ProzorPosude = { tankId: string; od: Date; do: Date };

/**
 * Posude kroz koje je vino kucice proslo prije ulaska, s prozorom svake —
 * za popis dodataka. Prozor je [rodjenje u toj posudi, cas odlaska dalje],
 * isti kao kod kucica na stranici tanka (lib/povijest-vina.ts).
 *
 * PREKLAPANJA ISTE POSUDE SE SPAJAJU. Vino koje se u posudi razdvojilo
 * (dio je otisao 28.08., ostatak 08.09.) daje dva prozora koja pocinju
 * istim rodjenjem. Radnja iz tog zajednickog dijela pogodila je oba dijela
 * vina, ali je to JEDNA radnja — u popisu stoji jednom. Isto vrijedi za
 * ponovljeno podstablo, koje daje doslovno iste prozore.
 */
export function prozoriKucice(s: Sastavnica): ProzorPosude[] {
  const poPosudi = new Map<string, ProzorPosude[]>();

  const hod = (v: VinoCvor, doAt: Date) => {
    if (v.vrsta !== "spoj") return;
    const popis = poPosudi.get(v.tankId) ?? [];
    popis.push({ tankId: v.tankId, od: v.kada, do: doAt });
    poPosudi.set(v.tankId, popis);
    for (const d of v.sastavnice) hod(d.vino, d.usloAt);
  };

  hod(s.vino, s.usloAt);

  const out: ProzorPosude[] = [];
  for (const popis of poPosudi.values()) {
    popis.sort((a, b) => a.od.getTime() - b.od.getTime());
    let tekuci: ProzorPosude | null = null;
    for (const p of popis) {
      // Preklapanje, ne dodir: vino koje je otislo u trenutku kad je novo
      // nastalo drugo je vino i ostaje zaseban prozor.
      if (tekuci && p.od.getTime() < tekuci.do.getTime()) {
        if (p.do > tekuci.do) tekuci.do = p.do;
        continue;
      }
      if (tekuci && p.od.getTime() === tekuci.od.getTime() && p.do.getTime() === tekuci.do.getTime()) {
        continue;
      }
      tekuci = { ...p };
      out.push(tekuci);
    }
  }

  return out.sort((a, b) => b.do.getTime() - a.do.getTime());
}
