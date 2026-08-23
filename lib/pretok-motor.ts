/**
 * MOTOR PRETOKA — N izvora u M ciljeva, u jednoj transakciji.
 *
 * FAZA 5a: ovo NITKO JOS NE ZOVE. Isporuceno je s testom
 * (`npm run test:pretok:motor`) da se ispravnost dokaze prije nego motor dode
 * na put pisanja. Prebacivanje `POST /api/pretok` na njega je faza 5c.
 *
 * ODNOS PREMA lib/filtracija.ts — NIJE KOPIJA.
 * Mililitarska matematika (podijeliMl, postotciIzMl, normalizirajBlend,
 * blendKojiOdlazi, blendKojiOstaje, sastavUMl) UVOZI se odande i ne dira se.
 * Nju pokriva scripts/test-filtracija.ts s 900.006 invarijanti i to je
 * najvrjednija stvar u repou. Ovdje je samo sloj IZNAD nje:
 *
 *   - vise izvora: svaki prode kroz postojeci `blendKojiOdlazi`, rezultati se
 *     spoje postojecim `normalizirajBlend` u jedan "virtualni izvor";
 *   - vise ciljeva: virtualni izvor se razdijeli postojecim `podijeliMl`;
 *   - identitet vina po vrsti pretoka;
 *   - kalo kao razlika izlaza i ulaza.
 *
 * Ako ijedna invarijanta padne nakon izmjene ovdje, znaci da je motor
 * prepisan umjesto prosiren — to je znak za zaustavljanje, ne za popravak
 * testa.
 *
 * TRI STVARI KOJE JE MOTOR PREUZEO OD STARIH GRANA (faza 5c):
 *   1. arhiviranje izvora koji je pao na nulu,
 *   2. preusmjeravanje blend pokazivaca s tog tanka na novonastalu arhivu,
 *   3. spajanje identiteta i sastava kod cuvéea.
 *
 * Prve dvije NISU prepisane — motor zove iste funkcije iz lib/pretok-arhiviranje.ts
 * koje je zvala i stara grana. Da je rijec o premjestanju, a ne o prepisivanju,
 * dokazuje scripts/test-arhiviranje-baza.ts sa 123 tvrdnje.
 *
 * Trecu motor racuna sam, u mililitrima, umjesto starim postotnim racunom iz
 * lib/pretok-sastav.ts. To je jedina od tri gdje se ishod smije razlikovati —
 * i razlikuje se u smjeru tocnosti, sto pokriva diferencijalni test.
 *
 * STO OVAJ MODUL NAMJERNO NE RADI:
 *   - ne dira `Zadatak` (izvrsiFiltraciju to radi; ovdje je pretok bez zadatka).
 */

import { Prisma } from "@prisma/client";
import {
  FiltracijaGreska,
  blendKojiOdlazi,
  blendKojiOstaje,
  nazivZaBlend,
  napraviOtisak,
  normalizirajBlend,
  podijeliMl,
  sastavUMl,
  ucitajTank,
  udjeliIzMape,
  uLitre,
  uMl,
  upisiBlend,
  upisiSastav,
  zakljucajTankove,
  type BlendStavka,
  type TankOtisak,
  type TankSaSastavom,
  type Tx,
} from "@/lib/filtracija";
import {
  arhivirajPotroseniTank,
  preusmjeriNaArhivu,
} from "@/lib/pretok-arhiviranje";

/** Sto se radi. Mehanika je za sve tri ISTA — razlikuje se samo identitet vina. */
export type VrstaPretoka = "OBICNI" | "CUVEE" | "ISTA_SORTA";

/**
 * Kako je fizicki izvedeno. Neovisno o vrsti: cuvée se moze raditi i kroz
 * filtar i bez njega. Zamjenjuje dosadasnje vrste zadatka FILTRACIJA /
 * FLOTACIJA, koje su bile "sto se radi" iako su zapravo "kako".
 */
export type NacinPretoka = "BEZ" | "FILTRACIJA" | "FLOTACIJA";

export type UlazTanka = {
  tankId: string;
  /** Litre. U mililitre se pretvara odmah, i dalje se racuna samo u njima. */
  kolicina: number;
};

export type UlazPretoka = {
  izvori: UlazTanka[];
  ciljevi: UlazTanka[];
  vrsta: VrstaPretoka;
  nacin: NacinPretoka;
  /**
   * Detalj o nacinu — koji filtar, kakve ploce. NEOBAVEZNA.
   *
   * Da je obavezna, upisivalo bi se "filtracija" ili tocka samo da se prode, pa
   * bi polje izgubilo smisao. Sama cinjenica filtriranja vec je u `nacin`.
   */
  nacinNapomena?: string | null;
  napomena?: string | null;
  korisnikId: string;
  /** Obavezno i dopusteno SAMO za CUVEE. Jedan identitet na sve ciljeve. */
  noviIdentitet?: {
    nazivVina: string;
    sorta: string;
    godiste?: number | null;
  } | null;
};

export type RezultatPretoka = {
  /** Sve u litrama, zaokruzeno iz mililitara — nikad iz decimalnog racuna. */
  izasloLitara: number;
  usloLitara: number;
  gubitakLitara: number;
  izvori: Array<{
    tankId: string;
    brojTanka: number;
    izasloLitara: number;
    ostaloLitara: number;
    paoNaNulu: boolean;
    prije: TankOtisak;
  }>;
  ciljevi: Array<{
    tankId: string;
    brojTanka: number;
    usloLitara: number;
    stanjePoslijeLitara: number;
    bioPrazan: boolean;
    biloDrugoVino: boolean;
    noviNazivVina: string | null;
    prije: TankOtisak;
  }>;
};

// ---------------------------------------------------------------------------
// Provjere ulaza — sve prije nego se ista upise
// ---------------------------------------------------------------------------

function norm(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

type ProvjereniUlaz = {
  izvori: Array<{ tankId: string; ml: number }>;
  ciljevi: Array<{ tankId: string; ml: number }>;
  izlazMl: number;
  ulazMl: number;
  gubitakMl: number;
};

/**
 * Cisti dio provjere — bez baze, pa se testira bez transakcije.
 *
 * Kalo se NE prima izvana nego ispada iz razlike. Da se prima, forma i server
 * mogli bi tvrditi razlicite brojke, a to je upravo ono sto se u podrumu ne
 * smije dogoditi.
 */
export function provjeriUlazPretoka(ulaz: UlazPretoka): ProvjereniUlaz {
  const izvori = (ulaz.izvori ?? [])
    .map((i) => ({ tankId: norm(i.tankId), ml: uMl(i.kolicina) }))
    .filter((i) => i.tankId !== "");

  const ciljevi = (ulaz.ciljevi ?? [])
    .map((c) => ({ tankId: norm(c.tankId), ml: uMl(c.kolicina) }))
    .filter((c) => c.tankId !== "");

  if (izvori.length === 0) {
    throw new FiltracijaGreska("Pretok mora imati barem jedan izvorni tank.");
  }

  if (ciljevi.length === 0) {
    throw new FiltracijaGreska("Pretok mora imati barem jedan ciljni tank.");
  }

  if (izvori.some((i) => i.ml <= 0)) {
    throw new FiltracijaGreska("Svaki izvor mora imati količinu veću od nule.");
  }

  if (ciljevi.some((c) => c.ml <= 0)) {
    throw new FiltracijaGreska("Svaki cilj mora imati količinu veću od nule.");
  }

  // Isti tank dvaput na istoj strani je gotovo uvijek pogreska u formi, a u
  // racunu bi tiho udvostrucio kolicinu.
  const dvaputIzvor = izvori.length !== new Set(izvori.map((i) => i.tankId)).size;
  const dvaputCilj = ciljevi.length !== new Set(ciljevi.map((c) => c.tankId)).size;

  if (dvaputIzvor || dvaputCilj) {
    throw new FiltracijaGreska("Isti tank je naveden dvaput na istoj strani.");
  }

  // Tank ne moze biti i izvor i cilj: vino bi izlazilo iz sebe i ulazilo u
  // sebe, a zakljucavanje bi ga uzelo dvaput.
  const ciljSet = new Set(ciljevi.map((c) => c.tankId));
  const preklop = izvori.find((i) => ciljSet.has(i.tankId));

  if (preklop) {
    throw new FiltracijaGreska(
      "Isti tank ne može biti i izvor i cilj istog pretoka."
    );
  }

  const izlazMl = izvori.reduce((z, i) => z + i.ml, 0);
  const ulazMl = ciljevi.reduce((z, c) => z + c.ml, 0);
  const gubitakMl = izlazMl - ulazMl;

  // Negativan kalo znaci da je u ciljeve uslo vise nego sto je iz izvora
  // izaslo — vino niotkuda. Forma to blokira, ali server se na formu ne
  // oslanja.
  if (gubitakMl < 0) {
    throw new FiltracijaGreska(
      `U ciljeve ulazi više (${uLitre(ulazMl)} L) nego što iz izvora izlazi (${uLitre(
        izlazMl
      )} L).`
    );
  }

  if (ulaz.vrsta === "CUVEE") {
    if (!norm(ulaz.noviIdentitet?.nazivVina)) {
      throw new FiltracijaGreska("Cuvée mora dobiti naziv novog vina.");
    }
    if (!norm(ulaz.noviIdentitet?.sorta)) {
      throw new FiltracijaGreska("Cuvée mora dobiti sortu novog vina.");
    }
  }

  return { izvori, ciljevi, izlazMl, ulazMl, gubitakMl };
}

// ---------------------------------------------------------------------------
// Identitet vina — jedino mjesto gdje se tri vrste razlikuju
// ---------------------------------------------------------------------------

type Identitet = {
  nazivVina: string | null;
  sorta: string | null;
  godiste: number | null;
};

function otisakIdentiteta(t: TankSaSastavom): Identitet {
  return {
    nazivVina: t.nazivVina ?? null,
    sorta: t.sorta ?? null,
    godiste: t.godiste ?? null,
  };
}

function istiIdentitetVina(a: Identitet, b: Identitet): boolean {
  return (
    norm(a.nazivVina).toLowerCase() === norm(b.nazivVina).toLowerCase() &&
    norm(a.sorta).toLowerCase() === norm(b.sorta).toLowerCase()
  );
}

/**
 * Koji identitet dobiva ciljni tank.
 *
 * OBICNI      — prazan cilj preuzima identitet izvora; pun ga zadrzava, ali samo
 *               ako je to isto vino. Drugo vino je greska s uputom na cuvée.
 * ISTA_SORTA  — sorte se moraju poklapati; naziv ostaje.
 * CUVEE       — nastaje JEDAN novi identitet i primjenjuje se na SVE ciljeve.
 *               Dva razlicita nova vina su dva pretoka, ne jedan.
 */
function identitetCilja(args: {
  vrsta: VrstaPretoka;
  cilj: TankSaSastavom;
  ciljPrijeMl: number;
  identitetIzvora: Identitet;
  noviIdentitet: UlazPretoka["noviIdentitet"];
}): { identitet: Identitet; biloDrugoVino: boolean } {
  const { vrsta, cilj, ciljPrijeMl, identitetIzvora, noviIdentitet } = args;
  const prazan = ciljPrijeMl <= 0;
  const ciljIdent = otisakIdentiteta(cilj);
  const isto = !prazan && istiIdentitetVina(ciljIdent, identitetIzvora);
  const biloDrugoVino = !prazan && !isto;

  if (vrsta === "CUVEE") {
    return {
      identitet: {
        nazivVina: norm(noviIdentitet?.nazivVina),
        sorta: norm(noviIdentitet?.sorta),
        godiste: noviIdentitet?.godiste ?? identitetIzvora.godiste,
      },
      biloDrugoVino,
    };
  }

  if (vrsta === "ISTA_SORTA") {
    if (
      !prazan &&
      norm(ciljIdent.sorta).toLowerCase() !== norm(identitetIzvora.sorta).toLowerCase()
    ) {
      throw new FiltracijaGreska(
        `Tank ${cilj.broj} sadrži sortu „${ciljIdent.sorta ?? "—"}”, a dolazi „${
          identitetIzvora.sorta ?? "—"
        }”. Za spajanje različitih sorti koristi cuvée.`
      );
    }

    return {
      identitet: prazan ? identitetIzvora : ciljIdent,
      biloDrugoVino,
    };
  }

  // OBICNI
  if (biloDrugoVino) {
    throw new FiltracijaGreska(
      `Tank ${cilj.broj} već sadrži drugo vino („${
        ciljIdent.nazivVina ?? "—"
      }”). Za takvo spajanje koristi cuvée ili blend iste sorte.`
    );
  }

  return { identitet: prazan ? identitetIzvora : ciljIdent, biloDrugoVino };
}

// ---------------------------------------------------------------------------
// Izvrsenje
// ---------------------------------------------------------------------------

/**
 * Izvrsava pretok. MORA se zvati unutar prisma.$transaction — ili prode sve
 * (izlazi iz svih izvora i ulazi u sve ciljeve), ili nista. Nikad ne smije
 * postojati stanje u kojem je vino izaslo a nije nikamo uslo.
 */
export async function izvrsiPretok(
  tx: Tx,
  ulaz: UlazPretoka
): Promise<RezultatPretoka> {
  const provjeren = provjeriUlazPretoka(ulaz);

  // 1) Zakljucaj SVE ukljucene tankove odjednom, sortirano po id-u. Sortiranje
  //    je ono sto sprjecava zakljucavanje unakrst kad dva pretoka dijele tank.
  const sviIds = [
    ...provjeren.izvori.map((i) => i.tankId),
    ...provjeren.ciljevi.map((c) => c.tankId),
  ];

  await zakljucajTankove(tx, sviIds);

  // 2) Ucitaj stanja tek NAKON zakljucavanja — prije toga bi se mogla promijeniti.
  const izvorniTankovi = new Map<string, TankSaSastavom>();
  for (const i of provjeren.izvori) {
    izvorniTankovi.set(i.tankId, await ucitajTank(tx, i.tankId));
  }

  const ciljniTankovi = new Map<string, TankSaSastavom>();
  for (const c of provjeren.ciljevi) {
    ciljniTankovi.set(c.tankId, await ucitajTank(tx, c.tankId));
  }

  // 3) Ima li svaki izvor toliko vina koliko iz njega izlazi.
  for (const i of provjeren.izvori) {
    const t = izvorniTankovi.get(i.tankId)!;
    const uTankuMl = uMl(t.kolicinaVinaUTanku);

    if (i.ml > uTankuMl) {
      throw new FiltracijaGreska(
        `Tank ${t.broj} ima ${uLitre(uTankuMl)} L, a iz njega izlazi ${uLitre(
          i.ml
        )} L.`
      );
    }
  }

  // 4) Stane li u svaki cilj ono sto u njega ulazi.
  for (const c of provjeren.ciljevi) {
    const t = ciljniTankovi.get(c.tankId)!;
    const uTankuMl = uMl(t.kolicinaVinaUTanku);
    const kapacitetMl = uMl(t.kapacitet);

    if (uTankuMl + c.ml > kapacitetMl) {
      throw new FiltracijaGreska(
        `U tank ${t.broj} ne stane ${uLitre(c.ml)} L — kapacitet je ${uLitre(
          kapacitetMl
        )} L, a u njemu je ${uLitre(uTankuMl)} L.`
      );
    }
  }

  const prijeIzvori = new Map<string, TankOtisak>();
  for (const [id, t] of izvorniTankovi) prijeIzvori.set(id, napraviOtisak(t));

  const prijeCiljevi = new Map<string, TankOtisak>();
  for (const [id, t] of ciljniTankovi) prijeCiljevi.set(id, napraviOtisak(t));

  // 5) VIRTUALNI IZVOR — ono sto je iz svih izvora zajedno izaslo.
  //
  //    Ovdje je cijela poanta viseizvornog pretoka: svaki izvor prode kroz
  //    POSTOJECI `blendKojiOdlazi`, a rezultati se spoje POSTOJECIM
  //    `normalizirajBlend`. Mililitarska matematika se ne dira; ovo je samo
  //    zbrajanje njezinih izlaza.
  const blendKojiIzlazi: BlendStavka[] = [];
  const sastavKojiIzlazi = new Map<string, number>();

  for (const i of provjeren.izvori) {
    const t = izvorniTankovi.get(i.tankId)!;
    const ukupnoPrijeMl = uMl(t.kolicinaVinaUTanku);

    blendKojiIzlazi.push(...blendKojiOdlazi(t, i.ml, ukupnoPrijeMl));

    // Sastav po sortama: udio ovog izvora u onome sto odlazi. Razdioba cuva
    // cjelinu, pa zbroj po sortama tocno odgovara `i.ml`.
    const sorteIzvora = Array.from(sastavUMl(t, ukupnoPrijeMl).entries());

    if (sorteIzvora.length > 0) {
      const dijelovi = podijeliMl(
        sorteIzvora.map(([, ml]) => ml),
        i.ml
      );

      sorteIzvora.forEach(([naziv], k) => {
        if (dijelovi[k] <= 0) return;
        sastavKojiIzlazi.set(naziv, (sastavKojiIzlazi.get(naziv) ?? 0) + dijelovi[k]);
      });
    }
  }

  const blendIzvoraSpojen = normalizirajBlend(blendKojiIzlazi);

  // Identitet koji "dolazi" — kod jednog izvora je to njegov identitet, kod
  // vise njih uzima se prvi. Kod cuvéea se ionako ne koristi, a kod obicnog
  // pretoka vise izvora s razlicitim vinima ne prolazi guard nize.
  const prviIzvor = izvorniTankovi.get(provjeren.izvori[0].tankId)!;
  const identitetIzvora = otisakIdentiteta(prviIzvor);

  // Obicni pretok i ista sorta traze da SVI izvori nose isto vino — inace bi se
  // dva razlicita vina spojila bez odluke o tome kako se to zove.
  if (ulaz.vrsta !== "CUVEE" && provjeren.izvori.length > 1) {
    for (const i of provjeren.izvori.slice(1)) {
      const t = izvorniTankovi.get(i.tankId)!;

      if (!istiIdentitetVina(otisakIdentiteta(t), identitetIzvora)) {
        throw new FiltracijaGreska(
          `Izvori nose različita vina (tank ${prviIzvor.broj} i tank ${t.broj}). Za spajanje različitih vina koristi cuvée.`
        );
      }
    }
  }

  // 6) IDENTITET SVAKOG CILJA — razrjesava se PRIJE ijednog upisa.
  //
  //    Ovdje se, a ne u petlji ciljeva, jer guard "u cilju je drugo vino" baca
  //    gresku. Da se to dogodi nakon sto su izvori vec umanjeni, pozivatelj koji
  //    gresku uhvati unutar svoje transakcije ostao bi s vinom koje je izaslo a
  //    nije nikamo uslo. Test DOKAZ 5 je upravo to uhvatio: tank je nakon
  //    odbijenog pretoka imao 900 umjesto 1000 L.
  //
  //    Pravilo: sve sto moze reci NE mora reci prije nego sto se ista upise.
  const identitetiCiljeva = new Map<
    string,
    { identitet: Identitet; biloDrugoVino: boolean }
  >();

  for (const c of provjeren.ciljevi) {
    const t = ciljniTankovi.get(c.tankId)!;

    identitetiCiljeva.set(
      c.tankId,
      identitetCilja({
        vrsta: ulaz.vrsta,
        cilj: t,
        ciljPrijeMl: uMl(t.kolicinaVinaUTanku),
        identitetIzvora,
        noviIdentitet: ulaz.noviIdentitet,
      })
    );
  }

  // 7) IZVORI — umanji kolicinu i proporcionalno smanji blend.
  //
  //    Izvor koji padne na nulu se arhivira; `arhiveIzvora` pamti koja je
  //    arhiva nastala iz kojeg tanka, da se blend pokazivaci ciljeva mogu
  //    preusmjeriti na nju umjesto na tank koji je od sada slobodan za novo vino.
  const arhiveIzvora = new Map<string, string>();
  const rezultatIzvori: RezultatPretoka["izvori"] = [];

  for (const i of provjeren.izvori) {
    const t = izvorniTankovi.get(i.tankId)!;
    const prijeMl = uMl(t.kolicinaVinaUTanku);
    const ostatakMl = prijeMl - i.ml;
    const paoNaNulu = ostatakMl <= 0;

    await tx.tank.update({
      where: { id: t.id },
      data: { kolicinaVinaUTanku: uLitre(ostatakMl) },
    });

    if (paoNaNulu) {
      // ARHIVIRANJE. Zove se ISTA funkcija koju je zvala stara grana — ne
      // kopija. Ona sama ocisti tank (kolicina 0, identitet i blend van) i u
      // arhivu prenese mjerenja, zadatke, dokumente, punjenja, radnje i izlaze.
      //
      // Mora se dogoditi PRIJE nego se upisu blendovi ciljeva, jer tek tada
      // postoji arhiva na koju se pokazivaci mogu preusmjeriti. Isti redoslijed
      // koji je faza 1 uspostavila u staroj grani.
      const dodatni = await tx.tank.findUniqueOrThrow({
        where: { id: t.id },
        select: { tip: true },
      });

      const arhiva = await arhivirajPotroseniTank(
        tx,
        {
          id: t.id,
          broj: t.broj,
          sorta: t.sorta ?? null,
          nazivVina: t.nazivVina ?? null,
          godiste: t.godiste ?? null,
          kapacitet: t.kapacitet,
          tip: dodatni.tip ?? null,
        },
        uLitre(prijeMl),
        `Automatski arhivirano jer je vino pretokom izašlo iz tanka ${t.broj}.`
      );

      arhiveIzvora.set(t.id, arhiva.id);
    } else {
      await upisiBlend(tx, t.id, blendKojiOstaje(t, ostatakMl, prijeMl));
    }

    rezultatIzvori.push({
      tankId: t.id,
      brojTanka: t.broj,
      izasloLitara: uLitre(i.ml),
      ostaloLitara: uLitre(Math.max(0, ostatakMl)),
      paoNaNulu,
      prije: prijeIzvori.get(t.id)!,
    });
  }

  // 8) CILJEVI — svakome njegov udio virtualnog izvora.
  //
  //    Blend i sastav koji dolaze dijele se `podijeliMl`-om po ciljevima, pa je
  //    zbroj dodijeljenog TOCNO ono sto je u ciljeve uslo — ni mililitar vise.
  //    Kalo je vec odbijen time sto je `ulazMl` manji od `izlazMl`.
  //    Razdioba ide PO CILJU, ne po sastavnici: za svaki cilj se tezine
  //    virtualnog izvora razdijele na TOCNO onoliko mililitara koliko u taj
  //    cilj ulazi. Time svaki cilj dobije blend koji se poklapa s njegovom
  //    kolicinom, a zbroj preko svih ciljeva je tocno .
  //
  //    Suprotan redoslijed (prvo skalirati na ulazMl, pa dijeliti po ciljevima)
  //    bio bi tocan u zbroju ali ne i po tanku — zaokruzivanje bi ostavilo
  //    drift na svakom cilju. Kalo je vec odbijen time sto je zbroj ciljeva
  //    manji od zbroja izvora.
  const tezineBlenda = blendIzvoraSpojen.map((b) => b.kolicinaMl);
  const sorteKojeDolaze = Array.from(sastavKojiIzlazi.entries());
  const tezineSorti = sorteKojeDolaze.map(([, ml]) => ml);

  const udjeliBlendaPoCilju = provjeren.ciljevi.map((c) =>
    podijeliMl(tezineBlenda, c.ml)
  );
  const udjeliSortiPoCilju = provjeren.ciljevi.map((c) =>
    podijeliMl(tezineSorti, c.ml)
  );

  const rezultatCiljevi: RezultatPretoka["ciljevi"] = [];

  for (let k = 0; k < provjeren.ciljevi.length; k++) {
    const c = provjeren.ciljevi[k];
    const t = ciljniTankovi.get(c.tankId)!;
    const prijeMl = uMl(t.kolicinaVinaUTanku);
    const poslijeMl = prijeMl + c.ml;

    const { identitet, biloDrugoVino } = identitetiCiljeva.get(c.tankId)!;

    // Blend: sto je vec bilo u cilju + udio onoga sto dolazi.
    const blendCilja: BlendStavka[] =
      prijeMl > 0 && t.blendIzvori.length > 0
        ? t.blendIzvori.map((b) => ({
            izvorTankId: b.izvorTankId ?? null,
            izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
            nazivVina: b.nazivVina ?? null,
            sorta: b.sorta ?? null,
            kolicinaMl: uMl(b.kolicina),
            postotak: 0,
          }))
        : prijeMl > 0
        ? [
            {
              izvorTankId: t.id,
              izvorArhivaVinaId: null,
              nazivVina: nazivZaBlend(t),
              sorta: t.sorta ?? null,
              kolicinaMl: prijeMl,
              postotak: 0,
            },
          ]
        : [];

    const dolazeciBlend: BlendStavka[] = blendIzvoraSpojen
      .map((b, j) => ({ ...b, kolicinaMl: udjeliBlendaPoCilju[k][j], postotak: 0 }))
      .filter((b) => b.kolicinaMl > 0);

    // PREUSMJERAVANJE POKAZIVACA. Ide PRIJE normalizacije da se stari i novi
    // redak istog porijekla spoje u jedan umjesto da ostanu dva. Prolazi i kroz
    // zatecen blend cilja: ondje moze stajati stariji redak koji pokazuje na
    // isti tank, i on je od ovog trenutka jednako kriv.
    let spojeniBlend = [...blendCilja, ...dolazeciBlend];

    for (const [izvorId, arhivaId] of arhiveIzvora) {
      spojeniBlend = preusmjeriNaArhivu(spojeniBlend, izvorId, arhivaId);
    }

    await upisiBlend(tx, t.id, normalizirajBlend(spojeniBlend));

    // Sastav po sortama: zatecено u cilju + udio onoga sto dolazi.
    const mapaSastava = sastavUMl(t, prijeMl);

    sorteKojeDolaze.forEach(([naziv], j) => {
      const ml = udjeliSortiPoCilju[k][j];
      if (ml <= 0) return;
      mapaSastava.set(naziv, (mapaSastava.get(naziv) ?? 0) + ml);
    });

    await upisiSastav(tx, t.id, udjeliIzMape(mapaSastava));

    await tx.tank.update({
      where: { id: t.id },
      data: {
        kolicinaVinaUTanku: uLitre(poslijeMl),
        nazivVina: identitet.nazivVina,
        sorta: identitet.sorta,
        godiste: identitet.godiste,
      },
    });

    rezultatCiljevi.push({
      tankId: t.id,
      brojTanka: t.broj,
      usloLitara: uLitre(c.ml),
      stanjePoslijeLitara: uLitre(poslijeMl),
      bioPrazan: prijeMl <= 0,
      biloDrugoVino,
      noviNazivVina: ulaz.vrsta === "CUVEE" ? identitet.nazivVina : null,
      prije: prijeCiljevi.get(t.id)!,
    });
  }

  return {
    izasloLitara: uLitre(provjeren.izlazMl),
    usloLitara: uLitre(provjeren.ulazMl),
    gubitakLitara: uLitre(provjeren.gubitakMl),
    izvori: rezultatIzvori,
    ciljevi: rezultatCiljevi,
  };
}

// Prisma se uvozi samo zbog tipa transakcije u potpisu; bez ovoga bi `Tx`
// izgledao kao nepovezan tip.
export type { Prisma };
