import { razvrstaj, type Sastavnica, type VinoCvor } from "@/lib/identitet-vina";
import { jePravaSorta } from "@/lib/sorta-naziv";

/**
 * SASTAV VINA — stablo kucica onako kako ga PRIKAZ pokazuje: vina, ne posude.
 * ======================================================================
 *
 * Odluka vlasnika 09.10.2026.: sastav pokazuje VINA. Kucica postoji samo kad
 * je ondje doista drugo vino — komponenta kupaze ili dolijevanje iz druge
 * posude. Prijenos istog vina u praznu posudu nije sastav nego KRETANJE, i
 * pripada kronologiji (lib/kronologija-vina.ts), ne ovdje.
 *
 * MODEL SE NE DIRA. lib/identitet-vina.ts i dalje biljezi put kroz svaku
 * posudu, jer na njemu stoje `prozoriVina`, granica vina, prijevod kvasaca
 * (`kvasciKucice`) i adrese /prosli-tank. Ovo je cisti racun nad vec
 * izgradjenim stablom — nijedan upit — i koristi ga samo prikaz.
 *
 * PRIJENOS je sastavnica koja je JEDINA neprogutana sastavnica svog roditelja,
 * dolazi iz druge posude, a vino ispod nje je spoj. Takva se zamjenjuje
 * stavkama vina ispod sebe, rekurzivno: T12 <- T7 <- T12 <- berba postaje
 * jedna stavka "Graševina, partija 020/2026". Mjereno 09.10.2026.: 200 od 568
 * kucica posude u zivim stablima su prijenosi.
 *
 * BROJEVI STAVKE:
 *   udio  — umnozak udjela duz sazetog puta: udio vrha lanca u ovom vinu puta
 *           udio stavke u vinu ispod prijenosa. Nije ni udio vrha lanca ni udio
 *           najdublje kucice sam za sebe. Udio svake berbe u korijenu ostaje
 *           tocno isti kao u punom stablu, a zbroj udjela stavki iste razine je
 *           tocno 100 % (mjereno 09.10.2026.: najvece odstupanje 1e-14 %);
 *   litre — udio puta litre koje su usle u OVU posudu, a ne litre iz stare
 *           posude: bez toga bi T23 pokazao 6.400 L umjesto 1.050. Zbroj prve
 *           razine ostaje isti kao u punom stablu, pa se odljev ne mijenja;
 *   kalo  — sve sto se izgubilo od trenutka kad je vino stavke krenulo iz svoje
 *           posude do ulaska ovamo, kroz sve sazete prijenose. Na T12: 4.200 L
 *           uslo u T12 iz berbe, 4.150 L stiglo natrag iz T7 — kalo 50 L.
 *
 * Put kroz posude se NE prikazuje (vlasnik: "posuda nije podatak o vinu").
 * `prozori` nosi posude za povijest stavke — radnje i mjerenja iz vremena dok
 * je vino stavke stajalo u posudama kroz koje je samo prolazilo.
 */

type Spoj = Extract<VinoCvor, { vrsta: "spoj" }>;

/** Posuda i razdoblje u kojem je vino stavke u njoj stajalo — za povijest. */
export type ProzorStavke = { tankId: string; od: Date; do: Date };

export type StavkaVina = {
  /** Prava sastavnica u punom stablu: adresa za /prosli-tank, vrsta, dolijevanje. */
  sastavnica: Sastavnica;
  /** Posuda u koju je prava sastavnica usla (roditelj u punom stablu). */
  roditeljTankId: string;
  /** Udio u vinu nad kojim je sastav slozen, 0..1. */
  udio: number;
  /** Litre koje su od ove stavke usle u posudu nad kojom je sastav slozen. */
  litre: number;
  /** Koliko je vina stavke krenulo na put; `otpusteno - litre` je kalo. */
  otpusteno: number;
  kalo: number;
  /** Prosla je kroz barem jedan prijenos koji se ne prikazuje. */
  sazeta: boolean;
  /** Posude u kojima je vino stavke stajalo prije ulaska — za povijest stavke. */
  prozori: ProzorStavke[];
  /** Sastav vina ove stavke, isto sazet. */
  djeca: StavkaVina[];
  /** Djeca su odrezana dubinom prikaza (vidi `skratiSastav`). */
  odrezano: boolean;
};

/** Je li sastavnica PRIJENOS istog vina — vidi zaglavlje. */
export function jePrijenos(roditelj: Spoj, s: Sastavnica): boolean {
  return (
    !s.progutano &&
    s.vino.vrsta === "spoj" &&
    s.vino.tankId !== roditelj.tankId &&
    roditelj.sastavnice.filter((x) => !x.progutano).length === 1
  );
}

/** Koliko je od otpustenog stiglo; 1 kad otpusteno nije poznato. */
function zadrzano(s: Sastavnica): number {
  return s.otpusteno > 0 ? s.litre / s.otpusteno : 1;
}

/**
 * Posude kroz koje je vino sastavnice stajalo prije ulaska u roditelja: njezina
 * posuda pa svaka posuda sazetih prijenosa ispod nje. Prozor je isti kao kod
 * kucice do sada — [rodjenje vina u toj posudi, cas odlaska dalje].
 */
function kicma(s: Sastavnica): ProzorStavke[] {
  const out: ProzorStavke[] = [];
  let cvor: VinoCvor = s.vino;
  let doAt = s.usloAt;
  while (cvor.vrsta === "spoj") {
    out.push({ tankId: cvor.tankId, od: cvor.kada, do: doAt });
    const jedina: Sastavnica | undefined = cvor.sastavnice.find((x) => jePrijenos(cvor as Spoj, x));
    if (!jedina) break;
    doAt = jedina.usloAt;
    cvor = jedina.vino;
  }
  return out;
}

function slozi(
  v: Spoj,
  udio: number,
  litre: number,
  zadrzanoDosad: number,
  sazeta: boolean,
  out: StavkaVina[]
) {
  for (const s of v.sastavnice) {
    const u = udio * s.udio;
    const l = litre * s.udio;
    const z = zadrzanoDosad * zadrzano(s);

    if (jePrijenos(v, s)) {
      slozi(s.vino as Spoj, u, l, z, true, out);
      continue;
    }

    const otpusteno = z > 0 ? l / z : l;
    out.push({
      sastavnica: s,
      roditeljTankId: v.tankId,
      udio: u,
      litre: l,
      otpusteno,
      kalo: Math.max(0, otpusteno - l),
      sazeta,
      prozori: kicma(s),
      djeca: s.vino.vrsta === "spoj" ? sastavVina(s.vino) : [],
      odrezano: false,
    });
  }
}

/**
 * Sastav vina `v` za prikaz: prave sastavnice, prijenosi sazeti. Cijelo
 * stablo; dubinu prikaza rezi `skratiSastav`.
 */
export function sastavVina(v: VinoCvor): StavkaVina[] {
  if (v.vrsta !== "spoj") return [];
  const ukupno = v.sastavnice.reduce((z, s) => z + s.litre, 0);
  const out: StavkaVina[] = [];
  slozi(v, 1, ukupno, 1, false, out);
  return out;
}

/** Broj razina stavki ispod (ukljucujuci ove). */
export function dubinaSastava(stavke: StavkaVina[]): number {
  return stavke.length === 0 ? 0 : 1 + Math.max(...stavke.map((s) => dubinaSastava(s.djeca)));
}

/**
 * Rez na `razina` razina stavki. Odrezana stavka ostaje bez djece i nosi
 * `odrezano`, pa prikaz kaze da ispod ima jos. `jos` je koliko je razina
 * ostalo ispod reza.
 */
export function skratiSastav(stavke: StavkaVina[], razina: number): { stavke: StavkaVina[]; jos: number } {
  const ukupno = dubinaSastava(stavke);
  const rez = (x: StavkaVina[], r: number): StavkaVina[] =>
    x.map((s) =>
      r <= 1
        ? { ...s, djeca: [], odrezano: s.djeca.length > 0 }
        : { ...s, djeca: rez(s.djeca, r - 1) }
    );
  return { stavke: rez(stavke, razina), jos: Math.max(0, ukupno - razina) };
}

/** Udio svake berbe u vinu `v` (umnozak duz puta); zateceno vino pod kljucem `null`. */
function udjeliBerbi(v: VinoCvor, u: number, out: Map<string | null, { naziv: string; udio: number }>) {
  if (v.vrsta === "partija") {
    const z = out.get(v.berbaId) ?? { naziv: v.nazivSorte, udio: 0 };
    z.udio += u;
    out.set(v.berbaId, z);
    return;
  }
  if (v.vrsta === "posuda") {
    const z = out.get(null) ?? { naziv: "Nepoznato podrijetlo", udio: 0 };
    z.udio += u;
    out.set(null, z);
    return;
  }
  for (const s of v.sastavnice) udjeliBerbi(s.vino, u * s.udio, out);
}

/**
 * NAZIV STAVKE iz onoga sto vino jest, ne iz posude.
 *
 *   partija berbe — "Graševina, partija 020/2026";
 *   vino          — po sastavu, istim pravilom kao zaglavlje tanka (`razvrstaj`):
 *                   sortno ("Graševina", uz partiju kad je berba jedna), cuvée
 *                   ("Cuvée (Graševina 62 %)"), bez tvrdnje, ili "Zatečeno
 *                   vino" kad nijedna sorta nije prava;
 *   posuda bez razmotavanja (zateceno, prekinuto) — `null`: prikaz zadrzava
 *                   svoje oznake kraja lanca.
 *
 * Ime vina u tom trenutku (`ImeVina`) trazi dodatne upite, pa ga od
 * 09.10.2026. nose samo kucice prve razine (lib/ime-kucice.ts); ovo je
 * rezerva kad je vino bezimeno i naziv svih dubljih razina.
 */
export function nazivStavke(
  s: Sastavnica,
  oznakaPartije: Map<string, string | null>
): string | null {
  const v = s.vino;
  if (v.vrsta === "partija") {
    const oznaka = oznakaPartije.get(v.berbaId);
    return `${v.nazivSorte}${oznaka ? `, partija ${oznaka}` : ""}`;
  }
  if (v.vrsta !== "spoj") return null;

  const udjeli = new Map<string | null, { naziv: string; udio: number }>();
  udjeliBerbi(v, 1, udjeli);
  const sastav = [...udjeli.entries()].map(([berbaId, x]) => ({
    berbaId: berbaId ?? "",
    nazivSorte: x.naziv,
    litre: 0,
    postotak: x.udio * 100,
  }));
  const { vrsta, glavna } = razvrstaj(sastav);
  if (!glavna) return null;

  if (vrsta === "SORTNO") {
    const berbe = sastav.filter((x) => x.berbaId !== "");
    const oznaka = berbe.length === 1 ? oznakaPartije.get(berbe[0].berbaId) : null;
    return `${glavna.nazivSorte}${oznaka ? `, partija ${oznaka}` : ""}`;
  }
  // Nijedna prava sorta: isti naziv kao u zaglavlju stranice tanka.
  if (!sastav.some((x) => jePravaSorta(x.nazivSorte))) return "Zatečeno vino";

  const posto = Math.round(glavna.postotak);
  return vrsta === "CUVEE"
    ? `Cuvée (${glavna.nazivSorte} ${posto} %)`
    : `Bez tvrdnje o sorti (${glavna.nazivSorte} ${posto} %)`;
}

/**
 * Naziv stavke-posude bez razmotavanja, kad ni ime vina nije poznato. Do
 * 09.10.2026. ovdje je stajalo "Tank 11"; broj posude sad ide u sivi redak
 * ("iz tanka 11"), ne u naslov (vlasnik). Kraj lanca i dalje razlikuje
 * oznaka uz stavku ("knjiga dalje ne zna", "lanac prekinut", "još razina").
 */
export function nazivVinaBezSastava(razlog: "neotvoreno" | "bez_knjige" | "prekinuto"): string {
  return razlog === "bez_knjige" ? "Zatečeno vino" : "Vino";
}
