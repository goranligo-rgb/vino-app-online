import { Prisma } from "@prisma/client";
import { osigurajRedoslijed } from "@/lib/zadatak-redoslijed";

/**
 * Filtracija povlaci pretok vina.
 *
 * Zadatak vrste FILTRACIJA nosi jedan IZLAZ iz izvornog tanka (Zadatak.kolicinaIzlaz)
 * i 1..n ULAZA u ciljne tankove (ZadatakTankStavka). Pri izvrsenju se sve primjenjuje
 * u JEDNOJ transakciji: ili izlaz i svi ulazi, ili nista.
 *
 * Ovdje je samo logika — bez HTTP-a. Rute (app/api/zadatak/filtracija/*) rade auth,
 * parsiranje tijela i mapiranje gresaka na statuse.
 */

type Tx = Prisma.TransactionClient;

/**
 * Greska koju rute mapiraju na HTTP 400 i ciju poruku pokazuju korisniku.
 * Sve ostalo (nepredvidjeno) ide na 500 s generickom porukom.
 */
export class FiltracijaGreska extends Error {
  constructor(poruka: string) {
    super(poruka);
    this.name = "FiltracijaGreska";
  }
}

// ---------------------------------------------------------------------------
// Mililitri
// ---------------------------------------------------------------------------
// Sve provjere i racunanja idu nad CIJELIM mililitrima. Razlog: kolicine su
// DOUBLE PRECISION, pa bi usporedba "zbroj stavki <= kolicinaIzlaz" u litrama
// mogla lazno pasti na 0.1 + 0.2 !== 0.3. U bazu se pise natrag u litrama.

export function uMl(litre: number | null | undefined): number {
  return Math.round(Number(litre ?? 0) * 1000);
}

export function uLitre(ml: number): number {
  return Number((ml / 1000).toFixed(3));
}

// ---------------------------------------------------------------------------
// Tipovi
// ---------------------------------------------------------------------------

/** Jedan ulaz u ciljni tank, onako kako ga salje forma. */
export type StavkaUnos = {
  ciljTankId: string;
  kolicina: number; // litre
};

export type SortaUdio = {
  nazivSorte: string;
  postotak: number;
};

export type BlendStavka = {
  izvorTankId: string | null;
  izvorArhivaVinaId: string | null;
  nazivVina: string | null;
  sorta: string | null;
  kolicinaMl: number;
  postotak: number;
};

/**
 * Otisak stanja jednog tanka. Sluzi dvjema stvarima:
 *  - "prije" je materijal za vracanje (ponistavanje),
 *  - "poslije" je dokaz da stanje nije mijenjano izvan zadatka.
 * Rucna izmjena kroz PUT /api/tank ne ostavlja nikakav trag, pa je usporedba
 * s "poslije" jedini nacin da ju uhvatimo.
 */
export type TankOtisak = {
  tankId: string;
  brojTanka: number;
  kolicinaMl: number;
  sorta: string | null;
  nazivVina: string | null;
  godiste: number | null;
  udjeliSorti: SortaUdio[];
  blendIzvori: BlendStavka[];
};

/**
 * Litre i ciljni tankovi — planirani (kako je zadatak zadan) i stvarni
 * (kako je izmjereno pri izvrsenju).
 *
 * Izvrsenje prepisuje Zadatak.kolicinaIzlaz i ZadatakTankStavka stvarnim
 * brojkama, pa bi planirane inace nestale bez traga. Razlika planirano/stvarno
 * je podatak koji vinar zeli vidjeti (koliko se kala izgubilo u odnosu na plan),
 * zato se oboje cuva u snapshotu.
 */
export type BrojkeFiltracije = {
  kolicinaIzlaz: number | null; // litre
  stavke: Array<{
    ciljTankId: string;
    brojTanka: number | null;
    kolicina: number; // litre
  }>;
};

export type FiltracijaSnapshot = {
  verzija: 1;
  izvorTankId: string;
  planirano: BrojkeFiltracije;
  stvarno: BrojkeFiltracije;
  prije: TankOtisak[];
  poslije: TankOtisak[];
};

type TankSaSastavom = {
  id: string;
  broj: number;
  kapacitet: number;
  kolicinaVinaUTanku: number | null;
  sorta: string | null;
  nazivVina: string | null;
  godiste: number | null;
  udjeliSorti: Array<{ nazivSorte: string; postotak: number }>;
  blendIzvori: Array<{
    izvorTankId: string | null;
    izvorArhivaVinaId: string | null;
    nazivVina: string | null;
    sorta: string | null;
    kolicina: number;
    postotak: number;
  }>;
};

// ---------------------------------------------------------------------------
// Sitni alati
// ---------------------------------------------------------------------------

function norm(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function normKljuc(v: string | null | undefined): string {
  return norm(v).toLowerCase();
}

function postotak2(n: number): number {
  return Number(n.toFixed(2));
}

function nazivZaBlend(tank: { broj: number; nazivVina: string | null; sorta: string | null }) {
  return tank.nazivVina ?? tank.sorta ?? `Tank ${tank.broj}`;
}

/**
 * Razdijeli `ukupnoMl` po zadanim tezinama tako da zbroj dijelova bude TOCNO
 * `ukupnoMl` — ni mililitar vise ni manje.
 *
 * Metoda najveceg ostatka: svakoj komponenti prvo ide cijeli dio (floor), a
 * preostali mililitri (uvijek ih je manje od broja komponenti) dijele se redom
 * onima s najvecim odbacenim ostatkom.
 *
 * Zasto: obicno Math.round() po komponenti ne cuva cjelinu — tri komponente po
 * 33,4 ml zaokruze se na 33+33+33 = 99 od 100 ml. Taj se mililitar izgubi, pa
 * tank i njegov blend prestanu govoriti isti broj. Ovako se to ne moze dogoditi.
 *
 * Komponenta koja ispadne ispod 1 ml dobije 0 i ne upisuje se kao zaseban
 * zapis, ali njezin udio NIJE bacen — metoda najveceg ostatka ga je vec
 * rasporedila na ostale, pa cjelina ostaje tocna.
 */
export function podijeliMl(tezine: number[], ukupnoMl: number): number[] {
  const n = tezine.length;

  if (n === 0 || ukupnoMl <= 0) return new Array(n).fill(0);

  const pozitivne = tezine.map((t) => Math.max(Number(t) || 0, 0));
  const ukupnaTezina = pozitivne.reduce((s, t) => s + t, 0);

  if (ukupnaTezina <= 0) return new Array(n).fill(0);

  const sirovo = pozitivne.map((t) => (t / ukupnaTezina) * ukupnoMl);
  const dijelovi = sirovo.map((v) => Math.floor(v));

  let preostalo = ukupnoMl - dijelovi.reduce((s, v) => s + v, 0);

  const poOstatku = sirovo
    .map((v, i) => ({ i, frakcija: v - Math.floor(v) }))
    .sort((a, b) => b.frakcija - a.frakcija || a.i - b.i);

  let k = 0;
  while (preostalo > 0 && poOstatku.length > 0) {
    dijelovi[poOstatku[k % poOstatku.length].i] += 1;
    preostalo -= 1;
    k += 1;
  }

  return dijelovi;
}

/**
 * Postotci iz mililitara — na 2 decimale, ali tako da im je zbroj TOCNO 100.00.
 * Radi u stotinkama postotka (10000 jedinica) istom metodom najveceg ostatka,
 * pa nema slucaja da tri trecine daju 99,99 %.
 */
export function postotciIzMl(mlPoStavci: number[]): number[] {
  const ukupno = mlPoStavci.reduce((s, v) => s + v, 0);

  if (ukupno <= 0) return mlPoStavci.map(() => 0);

  return podijeliMl(mlPoStavci, 10000).map((stotinke) => stotinke / 100);
}

// ---------------------------------------------------------------------------
// Zakljucavanje redaka
// ---------------------------------------------------------------------------

/**
 * Zakljucava retke SVIH ukljucenih tankova (izvorni + svi ciljni) sa
 * SELECT ... FOR UPDATE, uvijek sortirano po id-u.
 *
 * Zasto sortirano: dvije istovremene filtracije koje dijele tank inace mogu
 * uzeti brave u suprotnom redoslijedu i zabiti se u deadlock (A drzi tank 1 i
 * ceka tank 2, B drzi tank 2 i ceka tank 1). Globalni redoslijed po id-u to
 * iskljucuje.
 *
 * Zasto redak po redak, a ne jedan IN (...) upit: Postgres ne jamci da ce
 * retke zakljucati redoslijedom iz ORDER BY — plan smije birati drukciji
 * pristup. Petlja po sortiranom popisu daje jamstvo, a tankova je nekoliko.
 *
 * PAZI — ZASTITA JE ZASAD DJELOMICNA. FOR UPDATE brani samo od onoga tko uzme
 * ISTU bravu, a to trenutno radi jedino filtracija. Ova mjesta mijenjaju
 * Tank.kolicinaVinaUTanku bez ikakve brave i mogu nam raditi ispod ruke:
 *   - app/api/pretok/route.ts            (pretok i cuvée, najveci pisac)
 *   - app/api/pretok/undo/route.ts       (vracanje pretoka iz snapshota)
 *   - app/api/izlaz-vina/route.ts        (izlaz vina iz tanka)
 *   - app/api/punjenje/route.ts          (punjenje tanka)
 *   - app/api/punjenje-stavka/[id]/route.ts
 *   - app/api/tank/route.ts (PUT)        (rucna izmjena kolicine)
 *   - app/api/tank/arhiviraj/route.ts
 *   - app/api/admin/reset/route.ts
 * Dok se ista brava ne doda i tamo, sloj 2 ponistavanja (usporedba otiska sa
 * snapshotJson) je jedino sto takvu izmjenu uopce moze primijetiti.
 */
export async function zakljucajTankove(tx: Tx, tankIds: string[]): Promise<string[]> {
  const jedinstveni = Array.from(new Set(tankIds.filter(Boolean))).sort();

  for (const tankId of jedinstveni) {
    const redovi = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Tank" WHERE "id" = ${tankId} FOR UPDATE
    `;

    if (redovi.length === 0) {
      throw new FiltracijaGreska("Jedan od tankova iz filtracije vise ne postoji.");
    }
  }

  return jedinstveni;
}

// ---------------------------------------------------------------------------
// Citanje i otisak
// ---------------------------------------------------------------------------

async function ucitajTank(tx: Tx, tankId: string): Promise<TankSaSastavom> {
  const tank = await tx.tank.findUnique({
    where: { id: tankId },
    select: {
      id: true,
      broj: true,
      kapacitet: true,
      kolicinaVinaUTanku: true,
      sorta: true,
      nazivVina: true,
      godiste: true,
      udjeliSorti: {
        select: { nazivSorte: true, postotak: true },
      },
      blendIzvori: {
        select: {
          izvorTankId: true,
          izvorArhivaVinaId: true,
          nazivVina: true,
          sorta: true,
          kolicina: true,
          postotak: true,
        },
      },
    },
  });

  if (!tank) {
    throw new FiltracijaGreska("Tank nije pronaden.");
  }

  return tank as TankSaSastavom;
}

function napraviOtisak(tank: TankSaSastavom): TankOtisak {
  return {
    tankId: tank.id,
    brojTanka: tank.broj,
    kolicinaMl: uMl(tank.kolicinaVinaUTanku),
    sorta: tank.sorta ?? null,
    nazivVina: tank.nazivVina ?? null,
    godiste: tank.godiste ?? null,
    udjeliSorti: tank.udjeliSorti.map((u) => ({
      nazivSorte: u.nazivSorte,
      postotak: postotak2(Number(u.postotak)),
    })),
    blendIzvori: tank.blendIzvori.map((b) => ({
      izvorTankId: b.izvorTankId ?? null,
      izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
      nazivVina: b.nazivVina ?? null,
      sorta: b.sorta ?? null,
      kolicinaMl: uMl(b.kolicina),
      postotak: postotak2(Number(b.postotak)),
    })),
  };
}

/**
 * Kanonski kljuc otiska — usporedba ide po SADRZAJU, ne po broju redaka.
 *
 * TankSortaUdio i BlendIzvor nemaju stabilan redoslijed (nema orderBy niti
 * prirodnog kljuca), pa se oba popisa pretvaraju u sortirani multiskup
 * tekstualnih zapisa. Dva tanka s istim sastavom upisanim drukcijim redom daju
 * isti kljuc; tank kojem je netko zamijenio jednu sortu drugom iste brojnosti
 * daje razlicit kljuc. Brojanje redaka bi oba slucaja proglasilo jednakima.
 */
export function kljucOtiska(otisak: TankOtisak): string {
  const sorte = otisak.udjeliSorti
    .map((s) => `${normKljuc(s.nazivSorte)}@${postotak2(s.postotak)}`)
    .sort()
    .join("|");

  const blend = otisak.blendIzvori
    .map((b) =>
      [
        b.izvorTankId ?? "",
        b.izvorArhivaVinaId ?? "",
        normKljuc(b.nazivVina),
        normKljuc(b.sorta),
        b.kolicinaMl,
        postotak2(b.postotak),
      ].join("~")
    )
    .sort()
    .join("|");

  return [
    otisak.kolicinaMl,
    normKljuc(otisak.sorta),
    normKljuc(otisak.nazivVina),
    otisak.godiste ?? "",
    sorte,
    blend,
  ].join("§");
}

/** Isto vino = isti naziv, sorta i godiste (prazna polja se gledaju kao prazna). */
export function istiIdentitet(a: TankOtisak, b: TankOtisak): boolean {
  return (
    normKljuc(a.nazivVina) === normKljuc(b.nazivVina) &&
    normKljuc(a.sorta) === normKljuc(b.sorta) &&
    (a.godiste ?? null) === (b.godiste ?? null)
  );
}

// ---------------------------------------------------------------------------
// Sastav (sorte) i blend
// ---------------------------------------------------------------------------

/**
 * Sastav tanka razlozen na mililitre po sorti. Ako tank nema upisane udjele,
 * pada na Tank.sorta = 100% (isti fallback koji koristi lib/pretok-sastav.ts).
 */
function sastavUMl(tank: TankSaSastavom, ukupnoMl: number): Map<string, number> {
  const mapa = new Map<string, number>();

  if (ukupnoMl <= 0) return mapa;

  const stavke = tank.udjeliSorti
    .map((u) => ({ naziv: norm(u.nazivSorte), tezina: Number(u.postotak) }))
    .filter((s) => s.naziv && s.tezina > 0);

  if (stavke.length > 0) {
    // Razdioba cuva cjelinu: zbroj dijelova je tocno ukupnoMl.
    const dijelovi = podijeliMl(
      stavke.map((s) => s.tezina),
      ukupnoMl
    );

    stavke.forEach((s, i) => {
      if (dijelovi[i] <= 0) return;
      mapa.set(s.naziv, (mapa.get(s.naziv) ?? 0) + dijelovi[i]);
    });

    return mapa;
  }

  const fallback = norm(tank.sorta);
  if (fallback) {
    mapa.set(fallback, ukupnoMl);
  }

  return mapa;
}

function udjeliIzMape(mapa: Map<string, number>): SortaUdio[] {
  const stavke = Array.from(mapa.entries()).filter(([, ml]) => ml > 0);

  if (stavke.length === 0) return [];

  const postotci = postotciIzMl(stavke.map(([, ml]) => ml));

  return stavke
    .map(([nazivSorte], i) => ({ nazivSorte, postotak: postotci[i] }))
    .filter((u) => u.postotak > 0)
    .sort((a, b) => b.postotak - a.postotak);
}

/**
 * Spaja blend stavke istog porijekla i preracunava postotke.
 * Isti obrazac kao normalizirajBlendStavke u app/api/pretok/route.ts, samo u ml.
 */
function normalizirajBlend(stavke: BlendStavka[]): BlendStavka[] {
  const mapa = new Map<string, BlendStavka>();

  for (const s of stavke) {
    const kljuc = [
      s.izvorTankId ?? "",
      s.izvorArhivaVinaId ?? "",
      normKljuc(s.nazivVina),
      normKljuc(s.sorta),
    ].join("||");

    const postojeci = mapa.get(kljuc);

    if (postojeci) {
      postojeci.kolicinaMl += s.kolicinaMl;
    } else {
      mapa.set(kljuc, { ...s, postotak: 0 });
    }
  }

  // Spajanje samo zbraja mililitre i izbacuje nule — ukupna kolicina ostaje
  // netaknuta, sto je uvjet da blend i dalje odgovara kolicini u tanku.
  const rezultat = Array.from(mapa.values()).filter((s) => s.kolicinaMl > 0);
  const postotci = postotciIzMl(rezultat.map((s) => s.kolicinaMl));

  return rezultat.map((s, i) => ({ ...s, postotak: postotci[i] }));
}

/**
 * Dio blenda izvornog tanka koji putuje s prenesenom kolicinom.
 * Ako izvor nema blend zapisa, sam izvorni tank je jedini "izvor" te kolicine.
 */
function blendKojiOdlazi(
  izvor: TankSaSastavom,
  prenosMl: number,
  ukupnoPrijeMl: number
): BlendStavka[] {
  if (prenosMl <= 0 || ukupnoPrijeMl <= 0) return [];

  if (izvor.blendIzvori.length > 0) {
    // Zbroj odnesenog je tocno prenosMl — inace bi ciljni tank dobio blend koji
    // se ne poklapa s kolicinom koja je u njega stvarno usla.
    const dijelovi = podijeliMl(
      izvor.blendIzvori.map((b) => uMl(b.kolicina)),
      prenosMl
    );

    return normalizirajBlend(
      izvor.blendIzvori.map((b, i) => ({
        izvorTankId: b.izvorTankId ?? null,
        izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
        nazivVina: b.nazivVina ?? null,
        sorta: b.sorta ?? null,
        kolicinaMl: dijelovi[i],
        postotak: 0,
      }))
    );
  }

  return [
    {
      izvorTankId: izvor.id,
      izvorArhivaVinaId: null,
      nazivVina: nazivZaBlend(izvor),
      sorta: izvor.sorta ?? null,
      kolicinaMl: prenosMl,
      postotak: 100,
    },
  ];
}

/** Blend koji ostaje u izvoru nakon odlaska dijela vina — proporcionalno smanjen. */
function blendKojiOstaje(
  izvor: TankSaSastavom,
  ostatakMl: number,
  ukupnoPrijeMl: number
): BlendStavka[] {
  if (ostatakMl <= 0 || ukupnoPrijeMl <= 0 || izvor.blendIzvori.length === 0) {
    return [];
  }

  // Zbroj ostatka je tocno ostatakMl — blend izvora i dalje odgovara onome
  // sto je u njemu ostalo.
  const dijelovi = podijeliMl(
    izvor.blendIzvori.map((b) => uMl(b.kolicina)),
    ostatakMl
  );

  return normalizirajBlend(
    izvor.blendIzvori.map((b, i) => ({
      izvorTankId: b.izvorTankId ?? null,
      izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
      nazivVina: b.nazivVina ?? null,
      sorta: b.sorta ?? null,
      kolicinaMl: dijelovi[i],
      postotak: 0,
    }))
  );
}

async function upisiSastav(tx: Tx, tankId: string, udjeli: SortaUdio[]) {
  await tx.tankSortaUdio.deleteMany({ where: { tankId } });

  if (udjeli.length > 0) {
    await tx.tankSortaUdio.createMany({
      data: udjeli.map((u) => ({
        tankId,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });
  }
}

async function upisiBlend(tx: Tx, ciljTankId: string, blend: BlendStavka[]) {
  await tx.blendIzvor.deleteMany({ where: { ciljTankId } });

  if (blend.length > 0) {
    await tx.blendIzvor.createMany({
      data: blend.map((b) => ({
        ciljTankId,
        izvorTankId: b.izvorTankId,
        izvorArhivaVinaId: b.izvorArhivaVinaId,
        nazivVina: b.nazivVina,
        sorta: b.sorta,
        kolicina: uLitre(b.kolicinaMl),
        postotak: b.postotak,
      })),
    });
  }
}

// ---------------------------------------------------------------------------
// Provjere ulaza (bez baze)
// ---------------------------------------------------------------------------

export type ProvjereniUnos = {
  izvorTankId: string;
  kolicinaIzlazMl: number;
  stavke: Array<{ ciljTankId: string; kolicinaMl: number; redoslijed: number }>;
  vezaniCiljTankId: string | null;
};

/**
 * Provjere koje ne trebaju bazu. Sve rade nad cijelim mililitrima.
 * Ono sto ovisi o zivom stanju tankova (raspoloziva kolicina, slobodan prostor)
 * provjerava se tek nakon zakljucavanja redaka, u provjeriProtivStanja().
 */
export function provjeriUnos(ulaz: {
  izvorTankId: string;
  kolicinaIzlaz: number;
  stavke: StavkaUnos[];
  vezaniCiljTankId?: string | null;
}): ProvjereniUnos {
  const izvorTankId = norm(ulaz.izvorTankId);

  if (!izvorTankId) {
    throw new FiltracijaGreska("Izvorni tank je obavezan.");
  }

  const kolicinaIzlazMl = uMl(ulaz.kolicinaIzlaz);

  if (!Number.isFinite(kolicinaIzlazMl) || kolicinaIzlazMl <= 0) {
    throw new FiltracijaGreska("Kolicina koja izlazi iz tanka mora biti veca od 0.");
  }

  const ulazneStavke = Array.isArray(ulaz.stavke) ? ulaz.stavke : [];

  if (ulazneStavke.length === 0) {
    throw new FiltracijaGreska("Dodaj barem jedan ciljni tank.");
  }

  const vidjeni = new Set<string>();
  const stavke: ProvjereniUnos["stavke"] = [];

  ulazneStavke.forEach((s, index) => {
    const ciljTankId = norm(s?.ciljTankId);

    if (!ciljTankId) {
      throw new FiltracijaGreska(`${index + 1}. stavka nema odabran ciljni tank.`);
    }

    if (ciljTankId === izvorTankId) {
      throw new FiltracijaGreska(
        "Ciljni tank ne moze biti isti kao izvorni tank."
      );
    }

    if (vidjeni.has(ciljTankId)) {
      throw new FiltracijaGreska(
        "Isti ciljni tank je naveden dvaput. Spoji ga u jednu stavku."
      );
    }

    vidjeni.add(ciljTankId);

    const kolicinaMl = uMl(s?.kolicina);

    if (!Number.isFinite(kolicinaMl) || kolicinaMl <= 0) {
      throw new FiltracijaGreska(
        `${index + 1}. stavka mora imati kolicinu vecu od 0.`
      );
    }

    stavke.push({ ciljTankId, kolicinaMl, redoslijed: index });
  });

  const zbrojMl = stavke.reduce((s, v) => s + v.kolicinaMl, 0);

  if (zbrojMl > kolicinaIzlazMl) {
    throw new FiltracijaGreska(
      `Zbroj po tankovima (${uLitre(zbrojMl)} L) veci je od kolicine koja izlazi iz tanka (${uLitre(kolicinaIzlazMl)} L).`
    );
  }

  const vezaniCiljTankId = norm(ulaz.vezaniCiljTankId) || null;

  if (vezaniCiljTankId && !vidjeni.has(vezaniCiljTankId)) {
    throw new FiltracijaGreska(
      "Tank vezanog zadatka mora biti jedan od ciljnih tankova filtracije."
    );
  }

  return { izvorTankId, kolicinaIzlazMl, stavke, vezaniCiljTankId };
}

/**
 * Redoslijed izvrsenja — na SVAKOM ukljucenom tanku (izvorni + svi ciljni).
 *
 * osigurajRedoslijed (lib/zadatak-redoslijed.ts) inace pazi samo na tank na
 * kojem zadatak stoji. Filtracija dira i ciljne tankove, pa bi bez ove petlje
 * mogla ubaciti vino u tank na kojem visi stariji otvoreni zadatak (npr.
 * mjerenje koje se odnosi na zateceno vino) i time mu maknuti podlogu.
 *
 * Helper usporedjuje po (zadanoAt, createdAt, id) unutar zadanog tankId, pa mu
 * se za ciljne tankove prosljedjuje isti zadatak s drugim tankId — pitanje je
 * "postoji li na tom tanku stariji otvoren zadatak od ovog".
 */
async function provjeriRedoslijedNaTankovima(
  tx: Tx,
  zadatak: { id: string; zadanoAt: Date; createdAt: Date },
  tankovi: Array<{ id: string; broj: number }>
) {
  const poredani = [...tankovi].sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const tank of poredani) {
    try {
      await osigurajRedoslijed(tx, {
        id: zadatak.id,
        tankId: tank.id,
        zadanoAt: zadatak.zadanoAt,
        createdAt: zadatak.createdAt,
      });
    } catch (error) {
      // Poruka helpera kaze "Na ovom tanku..." — uz vise tankova to nije dovoljno,
      // pa se dopisuje broj tanka.
      throw new FiltracijaGreska(
        `Tank ${tank.broj}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/** Provjere protiv zivog stanja tankova. Zove se tek nakon zakljucavanja redaka. */
function provjeriProtivStanja(
  izvor: TankSaSastavom,
  kolicinaIzlazMl: number,
  ciljevi: Array<{ tank: TankSaSastavom; kolicinaMl: number }>
) {
  const uTankuMl = uMl(izvor.kolicinaVinaUTanku);

  if (kolicinaIzlazMl > uTankuMl) {
    throw new FiltracijaGreska(
      `U tanku ${izvor.broj} ima ${uLitre(uTankuMl)} L, a filtracija trazi ${uLitre(kolicinaIzlazMl)} L.`
    );
  }

  // Izvorni tank smije ostati djelomicno pun — ostatak nije greska.

  for (const cilj of ciljevi) {
    const stanjeMl = uMl(cilj.tank.kolicinaVinaUTanku);
    const kapacitetMl = uMl(cilj.tank.kapacitet);
    const slobodnoMl = kapacitetMl - stanjeMl;

    if (cilj.kolicinaMl > slobodnoMl) {
      throw new FiltracijaGreska(
        `U tank ${cilj.tank.broj} stane jos ${uLitre(Math.max(slobodnoMl, 0))} L, a filtracija salje ${uLitre(cilj.kolicinaMl)} L.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Izvrsenje
// ---------------------------------------------------------------------------

export type RezultatIzvrsenja = {
  zadatakId: string;
  gubitakLitara: number;
  izvorTankId: string;
  izvorPaoNaNulu: boolean;
  /**
   * Stanje izvornog tanka prije filtracije. Cuva se i u snapshotJson; ovdje je
   * radi kasnijeg arhiviranja iz snapshota, ako se za to odlucimo.
   *
   * Ponuda "arhiviraj?" se NE vraca: /api/tank/arhiviraj odbija prazan tank,
   * pa bi gumb samo vratio gresku. F1 i dalje vrijedi — nista se ne arhivira
   * automatski.
   */
  izvorPrije: TankOtisak | null;
  /** Kako je zadatak bio zadan (plan) i sto je stvarno izmjereno. */
  planirano: BrojkeFiltracije;
  stvarno: BrojkeFiltracije;
  ciljevi: Array<{
    ciljTankId: string;
    brojTanka: number;
    kolicinaLitara: number;
    biloDrugoVino: boolean;
    noviNazivVina: string | null;
  }>;
};

/**
 * Izvrsava filtraciju. Mora se zvati unutar prisma.$transaction — ili prode
 * sve (izlaz iz izvornog + svi ulazi u ciljne), ili nista.
 *
 * naziviVina: opcionalno { [ciljTankId]: "novi naziv" }. Koristi se samo za
 * ciljne tankove u kojima je zateceno DRUGO vino — forma tamo pita korisnika
 * kako se zove nastala mjesavina. Za ciljne tankove s istim vinom se ignorira.
 *
 * kolicinaIzlaz / stavke: STVARNE brojke izmjerene pri izvrsenju. U podrumu se
 * planirano i stvarno gotovo nikad ne poklapaju (planira se 2000 L, izadje
 * 1940 L), pa se smiju poslati i drukcije od onih u zadatku. Ako se posalju,
 * upisuju se natrag u Zadatak.kolicinaIzlaz i ZadatakTankStavka u ISTOJ
 * transakciji — zadatak i tankovi nikad ne smiju govoriti razlicite brojke.
 * Ako se ne posalju, vrijede planirane iz zadatka.
 */
export async function izvrsiFiltraciju(
  tx: Tx,
  args: {
    zadatakId: string;
    izvrsioKorisnikId: string;
    naziviVina?: Record<string, string>;
    kolicinaIzlaz?: number | null;
    stavke?: StavkaUnos[] | null;
  }
): Promise<RezultatIzvrsenja> {
  const zadatak = await tx.zadatak.findUnique({
    where: { id: args.zadatakId },
    include: {
      tankStavke: { orderBy: { redoslijed: "asc" } },
    },
  });

  if (!zadatak) {
    throw new FiltracijaGreska("Zadatak nije pronaden.");
  }

  if (zadatak.vrsta !== "FILTRACIJA") {
    throw new FiltracijaGreska("Zadatak nije filtracija.");
  }

  if (zadatak.status === "IZVRSEN") {
    throw new FiltracijaGreska("Zadatak je vec izvrsen.");
  }

  if (zadatak.status === "OTKAZAN") {
    throw new FiltracijaGreska("Zadatak je otkazan.");
  }

  if (zadatak.zakljucanDo && new Date() < new Date(zadatak.zakljucanDo)) {
    throw new FiltracijaGreska("Vezani zadatak jos nije dostupan za izvrsenje.");
  }

  // Planirane brojke se hvataju PRIJE nego ih izvrsenje prepise — inace bi se
  // izgubile. Idu u snapshotJson kao "planirano".
  const planiraneStavke = zadatak.tankStavke.map((s) => ({
    ciljTankId: s.ciljTankId,
    kolicina: Number(s.kolicina),
  }));

  // Stvarne brojke s izvrsenja imaju prednost nad planiranima iz zadatka.
  const stavkeIzZahtjeva =
    Array.isArray(args.stavke) && args.stavke.length > 0 ? args.stavke : null;

  const brojkeSuIzmijenjene =
    args.kolicinaIzlaz != null || stavkeIzZahtjeva != null;

  const kolicinaIzlazEfektivna =
    args.kolicinaIzlaz != null
      ? Number(args.kolicinaIzlaz)
      : zadatak.kolicinaIzlaz != null
      ? Number(zadatak.kolicinaIzlaz)
      : null;

  if (kolicinaIzlazEfektivna == null) {
    throw new FiltracijaGreska(
      "Zadatak nema upisanu kolicinu koja izlazi iz tanka."
    );
  }

  // Ponovno kroz iste provjere kao pri unosu — stavke su u medjuvremenu mogle
  // biti dirane, a i vezaniCiljTankId mora i dalje biti jedan od ciljeva.
  // Kad brojke stizu sa izvrsenja, ovdje se provjeravaju one, ne planirane.
  const unos = provjeriUnos({
    izvorTankId: zadatak.tankId,
    kolicinaIzlaz: kolicinaIzlazEfektivna,
    stavke: stavkeIzZahtjeva ?? planiraneStavke,
    vezaniCiljTankId: zadatak.vezaniCiljTankId,
  });

  // 1) Zakljucaj SVE ukljucene tankove, sortirano po id-u.
  const sviTankIds = [unos.izvorTankId, ...unos.stavke.map((s) => s.ciljTankId)];
  await zakljucajTankove(tx, sviTankIds);

  // 2) Ucitaj stanje tek nakon zakljucavanja.
  const izvor = await ucitajTank(tx, unos.izvorTankId);
  const ciljevi: Array<{ tank: TankSaSastavom; kolicinaMl: number }> = [];

  for (const stavka of unos.stavke) {
    ciljevi.push({
      tank: await ucitajTank(tx, stavka.ciljTankId),
      kolicinaMl: stavka.kolicinaMl,
    });
  }

  // 3) Redoslijed zadataka — na izvornom I na svim ciljnim tankovima.
  await provjeriRedoslijedNaTankovima(
    tx,
    { id: zadatak.id, zadanoAt: zadatak.zadanoAt, createdAt: zadatak.createdAt },
    [izvor, ...ciljevi.map((c) => c.tank)]
  );

  provjeriProtivStanja(izvor, unos.kolicinaIzlazMl, ciljevi);

  // 4) Ako su brojke pri izvrsenju drukcije od planiranih, upisi ih natrag u
  //    zadatak — u istoj transakciji, tek nakon sto su prosle sve provjere.
  //    Bez ovoga bi zadatak zauvijek tvrdio da je izaslo 2000 L, a tankovi da
  //    je izaslo 1940 L.
  if (brojkeSuIzmijenjene) {
    await tx.zadatak.update({
      where: { id: zadatak.id },
      data: { kolicinaIzlaz: uLitre(unos.kolicinaIzlazMl) },
    });

    const ciljeviUnosa = unos.stavke.map((s) => s.ciljTankId);

    // Ciljni tank izbacen pri izvrsenju — njegova stavka vise nema smisla.
    await tx.zadatakTankStavka.deleteMany({
      where: {
        zadatakId: zadatak.id,
        ciljTankId: { notIn: ciljeviUnosa },
      },
    });

    for (const stavka of unos.stavke) {
      await tx.zadatakTankStavka.upsert({
        where: {
          zadatakId_ciljTankId: {
            zadatakId: zadatak.id,
            ciljTankId: stavka.ciljTankId,
          },
        },
        create: {
          zadatakId: zadatak.id,
          ciljTankId: stavka.ciljTankId,
          kolicina: uLitre(stavka.kolicinaMl),
          redoslijed: stavka.redoslijed,
        },
        update: {
          kolicina: uLitre(stavka.kolicinaMl),
          redoslijed: stavka.redoslijed,
        },
      });
    }
  }

  const prije: TankOtisak[] = [
    napraviOtisak(izvor),
    ...ciljevi.map((c) => napraviOtisak(c.tank)),
  ];

  const izvorPrijeOtisak = prije[0];
  const izvorUkupnoPrijeMl = uMl(izvor.kolicinaVinaUTanku);
  const izvorOstatakMl = izvorUkupnoPrijeMl - unos.kolicinaIzlazMl;
  const izvorPaoNaNulu = izvorOstatakMl === 0;

  // 5) Gubitak (kalo) racuna server: izlaz minus zbroj svega sto je uslo.
  //    Nikad se ne unosi rucno.
  const zbrojUlazaMl = unos.stavke.reduce((s, v) => s + v.kolicinaMl, 0);
  const gubitakMl = unos.kolicinaIzlazMl - zbrojUlazaMl;

  // 6) Izvorni tank.
  if (izvorPaoNaNulu) {
    // F1: tank je ostao prazan pa mu se brise identitet vina.
    // Brisu se: nazivVina, sorta, godiste, SVI TankSortaUdio zapisi tog tanka
    // i SVI BlendIzvor zapisi kojima je taj tank cilj.
    // NE dira se: broj, kapacitet, tip, opis, modbusAdresa, grana, temperaturne
    // postavke, mjerenja, dokumenti, povijest zadataka.
    //
    // NAMJERNO se NE arhivira automatski, iako pretok to radi
    // (arhivirajPotroseniTank u app/api/pretok/route.ts). Razlog: pretok je
    // zavrsni cin nad vinom pa je arhiva ocekivana; filtracija je medjukorak
    // koji se cesto radi vise puta nad istim vinom, a svako auto-arhiviranje
    // stvorilo bi ArhivaVina zapis koji korisnik nije trazio i koji se ne moze
    // jednostavno maknuti. Stanje prije filtracije ostaje u snapshotJson, pa se
    // arhiviranje iz njega moze dodati kasnije.
    await tx.tank.update({
      where: { id: izvor.id },
      data: {
        kolicinaVinaUTanku: 0,
        nazivVina: null,
        sorta: null,
        godiste: null,
      },
    });

    await tx.tankSortaUdio.deleteMany({ where: { tankId: izvor.id } });
    await tx.blendIzvor.deleteMany({ where: { ciljTankId: izvor.id } });
  } else {
    // Ostatak zadrzava identitet i postotke; blend se proporcionalno smanjuje
    // da litre u blendu i dalje odgovaraju kolicini u tanku.
    await tx.tank.update({
      where: { id: izvor.id },
      data: { kolicinaVinaUTanku: uLitre(izvorOstatakMl) },
    });

    await upisiBlend(
      tx,
      izvor.id,
      blendKojiOstaje(izvor, izvorOstatakMl, izvorUkupnoPrijeMl)
    );
  }

  // 7) Ciljni tankovi.
  const rezultatCiljeva: RezultatIzvrsenja["ciljevi"] = [];

  for (const cilj of ciljevi) {
    const ciljPrije = napraviOtisak(cilj.tank);
    const ciljPrijeMl = uMl(cilj.tank.kolicinaVinaUTanku);
    const ciljPoslijeMl = ciljPrijeMl + cilj.kolicinaMl;

    const praznCilj = ciljPrijeMl === 0;
    const isto = !praznCilj && istiIdentitet(ciljPrije, izvorPrijeOtisak);

    // "Drugo vino" je samo pitanje za korisnika (upozorenje + moguc novi naziv).
    // Sastav se preracunava uvijek i jednako: kad je vino stvarno isto, ponderirani
    // spoj vraca iste postotke pa je to matematicki nula-operacija. Time se izbjegava
    // da tank s istim imenom, a razlicitim udjelima sorti, ostane s krivim sastavom.
    const biloDrugoVino = !praznCilj && !isto;

    const trazeniNaziv = norm(args.naziviVina?.[cilj.tank.id]) || null;
    const noviNazivVina = biloDrugoVino ? trazeniNaziv : null;

    // Sastav: postojece u cilju + ono sto dolazi iz izvora.
    // Razdioba dolaznog vina po sortama cuva cjelinu — zbroj dodanih mililitara
    // je tocno cilj.kolicinaMl, pa nijedna kap ne ispari na zaokruzivanju.
    const mapa = sastavUMl(cilj.tank, ciljPrijeMl);
    const dolazeceSorte = Array.from(sastavUMl(izvor, izvorUkupnoPrijeMl).entries());

    if (dolazeceSorte.length > 0) {
      const dijelovi = podijeliMl(
        dolazeceSorte.map(([, ml]) => ml),
        cilj.kolicinaMl
      );

      dolazeceSorte.forEach(([naziv], i) => {
        if (dijelovi[i] <= 0) return;
        mapa.set(naziv, (mapa.get(naziv) ?? 0) + dijelovi[i]);
      });
    }

    // Blend: sto je vec bilo u cilju + proporcionalni dio izvorovog blenda.
    const blendCilja: BlendStavka[] =
      ciljPrijeMl > 0 && cilj.tank.blendIzvori.length > 0
        ? cilj.tank.blendIzvori.map((b) => ({
            izvorTankId: b.izvorTankId ?? null,
            izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
            nazivVina: b.nazivVina ?? null,
            sorta: b.sorta ?? null,
            kolicinaMl: uMl(b.kolicina),
            postotak: 0,
          }))
        : ciljPrijeMl > 0
        ? [
            {
              izvorTankId: cilj.tank.id,
              izvorArhivaVinaId: null,
              nazivVina: nazivZaBlend(cilj.tank),
              sorta: cilj.tank.sorta ?? null,
              kolicinaMl: ciljPrijeMl,
              postotak: 0,
            },
          ]
        : [];

    const blend = normalizirajBlend([
      ...blendCilja,
      ...blendKojiOdlazi(izvor, cilj.kolicinaMl, izvorUkupnoPrijeMl),
    ]);

    await tx.tank.update({
      where: { id: cilj.tank.id },
      data: {
        kolicinaVinaUTanku: uLitre(ciljPoslijeMl),
        // Prazan ciljni tank preuzima identitet vina koje u njega ulazi.
        // Popunjen zadrzava svoj, osim ako je korisnik poslao novi naziv.
        nazivVina: praznCilj
          ? trazeniNaziv ?? izvor.nazivVina ?? null
          : noviNazivVina ?? undefined,
        sorta: praznCilj ? izvor.sorta ?? null : undefined,
        godiste: praznCilj ? izvor.godiste ?? null : undefined,
      },
    });

    await upisiSastav(tx, cilj.tank.id, udjeliIzMape(mapa));
    await upisiBlend(tx, cilj.tank.id, blend);

    rezultatCiljeva.push({
      ciljTankId: cilj.tank.id,
      brojTanka: cilj.tank.broj,
      kolicinaLitara: uLitre(cilj.kolicinaMl),
      biloDrugoVino,
      noviNazivVina,
    });
  }

  // 8) Otisak stanja POSLIJE — cita se ponovno iz baze, ne racuna se napamet,
  //    da bude tocno ono sto ce ponistavanje kasnije usporediti.
  const poslije: TankOtisak[] = [];

  for (const tankId of [izvor.id, ...ciljevi.map((c) => c.tank.id)]) {
    poslije.push(napraviOtisak(await ucitajTank(tx, tankId)));
  }

  // Brojevi tankova za citljiv zapis planiranog i stvarnog. Planirani ciljni
  // tank je mogao biti izbacen pri izvrsenju, pa ga nema medju ucitanima —
  // zato zaseban upit nad unijom oba popisa.
  const sviCiljeviZaOpis = Array.from(
    new Set([
      ...planiraneStavke.map((s) => s.ciljTankId),
      ...unos.stavke.map((s) => s.ciljTankId),
    ])
  );

  const brojeviTankova = new Map(
    (
      await tx.tank.findMany({
        where: { id: { in: sviCiljeviZaOpis } },
        select: { id: true, broj: true },
      })
    ).map((t) => [t.id, t.broj])
  );

  const planirano: BrojkeFiltracije = {
    kolicinaIzlaz:
      zadatak.kolicinaIzlaz != null ? Number(zadatak.kolicinaIzlaz) : null,
    stavke: planiraneStavke.map((s) => ({
      ciljTankId: s.ciljTankId,
      brojTanka: brojeviTankova.get(s.ciljTankId) ?? null,
      kolicina: s.kolicina,
    })),
  };

  const stvarno: BrojkeFiltracije = {
    kolicinaIzlaz: uLitre(unos.kolicinaIzlazMl),
    stavke: unos.stavke.map((s) => ({
      ciljTankId: s.ciljTankId,
      brojTanka: brojeviTankova.get(s.ciljTankId) ?? null,
      kolicina: uLitre(s.kolicinaMl),
    })),
  };

  const snapshot: FiltracijaSnapshot = {
    verzija: 1,
    izvorTankId: izvor.id,
    planirano,
    stvarno,
    prije,
    poslije,
  };

  const datumIzvrsenja = new Date();

  await tx.zadatak.update({
    where: { id: zadatak.id },
    data: {
      status: "IZVRSEN",
      izvrsioKorisnikId: args.izvrsioKorisnikId,
      izvrsenoAt: datumIzvrsenja,
      gubitakLitara: uLitre(gubitakMl),
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  await tx.radnja.create({
    data: {
      tankId: izvor.id,
      korisnikId: args.izvrsioKorisnikId,
      zadatakId: zadatak.id,
      vrsta: "FILTRACIJA",
      opis:
        zadatak.naslov?.trim() ||
        `Filtracija ${uLitre(unos.kolicinaIzlazMl)} L u ${ciljevi.length} tank(ov)a`,
      napomena: zadatak.napomena ?? null,
      kolicina: uLitre(unos.kolicinaIzlazMl),
    },
  });

  // 9) Vezani (djeciji) zadatak. Isti obrazac kao u app/api/zadatak/route.ts,
  //    uz jednu razliku: dijete ide na vezaniCiljTankId ako je zadan, jer nakon
  //    filtracije vino vise nije u izvornom tanku.
  if (
    zadatak.tipZadatka === "VEZANI" &&
    zadatak.vezanaVrsta &&
    zadatak.vezaniBrojDana != null
  ) {
    const vecPostoji = await tx.zadatak.findFirst({
      where: { parentZadatakId: zadatak.id },
      select: { id: true },
    });

    if (!vecPostoji) {
      const zakljucanDo = new Date(datumIzvrsenja);
      zakljucanDo.setDate(zakljucanDo.getDate() + Number(zadatak.vezaniBrojDana));

      await tx.zadatak.create({
        data: {
          tankId: zadatak.vezaniCiljTankId ?? zadatak.tankId,
          zadaoKorisnikId: zadatak.zadaoKorisnikId,
          vrsta: zadatak.vezanaVrsta,
          status: "OTVOREN",
          naslov: zadatak.vezaniNaslov?.trim() || "Vezani zadatak",
          napomena: zadatak.vezanaNapomena ?? null,
          tipZadatka: "STANDARDNI",
          parentZadatakId: zadatak.id,
          zakljucanDo,
        },
      });
    }
  }

  return {
    zadatakId: zadatak.id,
    gubitakLitara: uLitre(gubitakMl),
    izvorTankId: izvor.id,
    izvorPaoNaNulu,
    izvorPrije: izvorPrijeOtisak,
    planirano,
    stvarno,
    ciljevi: rezultatCiljeva,
  };
}

// ---------------------------------------------------------------------------
// Ponistavanje
// ---------------------------------------------------------------------------

/**
 * Ponistava izvrsenu filtraciju i vraca zadatak u status OTVOREN.
 *
 * Dva sloja obrane:
 *  - sloj 1: na ukljucenim tankovima ne smije biti nikakvih kasnijih promjena
 *            (mjerenja, pretoci, punjenja, izlazi vina, zadaci, radnje),
 *  - sloj 2: zateceni otisak svakog tanka mora odgovarati "poslije" iz
 *            snapshotJson. Sloj 1 hvata promjene koje ostavljaju zapis, sloj 2
 *            hvata rucnu izmjenu kroz PUT /api/tank, koja ne ostavlja nikakav.
 */
export async function ponistiFiltraciju(
  tx: Tx,
  args: { zadatakId: string }
): Promise<{ zadatakId: string; vraceniTankovi: number }> {
  const zadatak = await tx.zadatak.findUnique({
    where: { id: args.zadatakId },
    include: { tankStavke: true },
  });

  if (!zadatak) {
    throw new FiltracijaGreska("Zadatak nije pronaden.");
  }

  if (zadatak.vrsta !== "FILTRACIJA") {
    throw new FiltracijaGreska("Zadatak nije filtracija.");
  }

  if (zadatak.status !== "IZVRSEN") {
    throw new FiltracijaGreska("Ponistiti se moze samo izvrsena filtracija.");
  }

  const snapshot = zadatak.snapshotJson as unknown as FiltracijaSnapshot | null;

  if (!snapshot?.prije?.length || !snapshot?.poslije?.length) {
    throw new FiltracijaGreska(
      "Za ovu filtraciju ne postoji spremljeni snapshot pa ju nije moguce sigurno vratiti."
    );
  }

  const granica = zadatak.izvrsenoAt ?? zadatak.updatedAt;
  const tankIds = snapshot.prije.map((o) => o.tankId);

  await zakljucajTankove(tx, tankIds);

  // Vezani zadatak nastao izvrsenjem ove filtracije — smije se maknuti dok je
  // otvoren, ali ako je vec izvrsen, povratak bi mu srusio podlogu.
  const dijete = await tx.zadatak.findFirst({
    where: { parentZadatakId: zadatak.id },
    select: { id: true, status: true },
  });

  if (dijete && dijete.status === "IZVRSEN") {
    throw new FiltracijaGreska(
      "Filtraciju nije moguce ponistiti jer je vezani zadatak koji je iz nje nastao vec izvrsen."
    );
  }

  // --- SLOJ 1: nikakvih kasnijih promjena na ukljucenim tankovima ---

  const kasnijeMjerenje = await tx.mjerenje.findFirst({
    where: { tankId: { in: tankIds }, izmjerenoAt: { gt: granica } },
    select: { id: true },
  });

  if (kasnijeMjerenje) {
    throw new FiltracijaGreska(
      "Filtraciju nije moguce ponistiti jer postoje kasnija mjerenja na ukljucenim tankovima."
    );
  }

  const kasnijiPretok = await tx.pretok.findFirst({
    where: {
      createdAt: { gt: granica },
      OR: [
        { ciljTankId: { in: tankIds } },
        { izvori: { some: { tankId: { in: tankIds } } } },
      ],
    },
    select: { id: true },
  });

  if (kasnijiPretok) {
    throw new FiltracijaGreska(
      "Filtraciju nije moguce ponistiti jer postoje kasniji pretoci na ukljucenim tankovima."
    );
  }

  const kasnijiIzlaz = await tx.izlazVina.findFirst({
    where: { tankId: { in: tankIds }, createdAt: { gt: granica } },
    select: { id: true },
  });

  if (kasnijiIzlaz) {
    throw new FiltracijaGreska(
      "Filtraciju nije moguce ponistiti jer postoje kasniji izlazi vina na ukljucenim tankovima."
    );
  }

  const kasnijePunjenje = await tx.punjenjeTanka.findFirst({
    where: { tankId: { in: tankIds }, createdAt: { gt: granica } },
    select: { id: true },
  });

  if (kasnijePunjenje) {
    throw new FiltracijaGreska(
      "Filtraciju nije moguce ponistiti jer postoje kasnija punjenja na ukljucenim tankovima."
    );
  }

  const preskociZadatke = [zadatak.id, ...(dijete ? [dijete.id] : [])];

  const kasnijiZadatak = await tx.zadatak.findFirst({
    where: {
      id: { notIn: preskociZadatke },
      createdAt: { gt: granica },
      OR: [
        { tankId: { in: tankIds } },
        { tankStavke: { some: { ciljTankId: { in: tankIds } } } },
      ],
    },
    select: { id: true },
  });

  if (kasnijiZadatak) {
    throw new FiltracijaGreska(
      "Filtraciju nije moguce ponistiti jer postoje kasniji zadaci na ukljucenim tankovima."
    );
  }

  // Radnja.zadatakId je nullable, a SQL NOT IN nad NULL-om ne vraca redak —
  // bez ove OR grane rucno upisana radnja bez zadatka prosla bi nezapazeno.
  const kasnijaRadnja = await tx.radnja.findFirst({
    where: {
      tankId: { in: tankIds },
      createdAt: { gt: granica },
      OR: [{ zadatakId: null }, { zadatakId: { notIn: preskociZadatke } }],
    },
    select: { id: true },
  });

  if (kasnijaRadnja) {
    throw new FiltracijaGreska(
      "Filtraciju nije moguce ponistiti jer postoje kasnije radnje na ukljucenim tankovima."
    );
  }

  // --- SLOJ 2: zateceno stanje mora biti tocno ono koje je filtracija ostavila ---

  for (const ocekivano of snapshot.poslije) {
    const sada = napraviOtisak(await ucitajTank(tx, ocekivano.tankId));

    if (kljucOtiska(sada) !== kljucOtiska(ocekivano)) {
      throw new FiltracijaGreska(
        `Filtraciju nije moguce ponistiti jer je stanje tanka ${sada.brojTanka} u medjuvremenu mijenjano izvan ovog zadatka.`
      );
    }
  }

  // --- Vracanje ---

  for (const otisak of snapshot.prije) {
    await tx.tank.update({
      where: { id: otisak.tankId },
      data: {
        kolicinaVinaUTanku: uLitre(otisak.kolicinaMl),
        sorta: otisak.sorta,
        nazivVina: otisak.nazivVina,
        godiste: otisak.godiste,
      },
    });

    await upisiSastav(tx, otisak.tankId, otisak.udjeliSorti);
    await upisiBlend(tx, otisak.tankId, otisak.blendIzvori);
  }

  if (dijete) {
    await tx.zadatak.delete({ where: { id: dijete.id } });
  }

  await tx.radnja.deleteMany({ where: { zadatakId: zadatak.id } });

  // Izvrsenje je prepisalo kolicine stvarnima; ponistavanje vraca zadatak u
  // stanje plana, onakav kakav je bio zadan. Ako je bio plan bez brojki
  // (glavni put — litre se pri zadavanju jos ne znaju), takav i ostaje.
  const planirano = snapshot.planirano ?? null;
  const planiraniCiljevi = planirano?.stavke ?? [];

  await tx.zadatakTankStavka.deleteMany({
    where: {
      zadatakId: zadatak.id,
      ciljTankId: { notIn: planiraniCiljevi.map((s) => s.ciljTankId) },
    },
  });

  for (const [index, stavka] of planiraniCiljevi.entries()) {
    await tx.zadatakTankStavka.upsert({
      where: {
        zadatakId_ciljTankId: {
          zadatakId: zadatak.id,
          ciljTankId: stavka.ciljTankId,
        },
      },
      create: {
        zadatakId: zadatak.id,
        ciljTankId: stavka.ciljTankId,
        kolicina: stavka.kolicina,
        redoslijed: index,
      },
      update: { kolicina: stavka.kolicina, redoslijed: index },
    });
  }

  await tx.zadatak.update({
    where: { id: zadatak.id },
    data: {
      status: "OTVOREN",
      izvrsenoAt: null,
      izvrsioKorisnikId: null,
      gubitakLitara: null,
      kolicinaIzlaz: planirano?.kolicinaIzlaz ?? null,
      snapshotJson: Prisma.DbNull,
    },
  });

  return { zadatakId: zadatak.id, vraceniTankovi: snapshot.prije.length };
}

// ---------------------------------------------------------------------------
// Pregled za formu
// ---------------------------------------------------------------------------

export type PregledCilja = {
  ciljTankId: string;
  brojTanka: number;
  kapacitet: number;
  stanjeLitara: number;
  slobodnoLitara: number;
  nazivVina: string | null;
  sorta: string | null;
  godiste: number | null;
  prazan: boolean;
  /** true = u tanku je zateceno DRUGO vino; forma na to upozorava, ali ne blokira. */
  drugoVino: boolean;
  upozorenje: string | null;
};

/**
 * Podaci koje forma treba da bi mogla upozoriti na razliciti identitet vina.
 * Ne mijenja nista i ne blokira nista — samo opisuje zateceno stanje.
 */
export async function pregledCiljeva(
  tx: Tx,
  args: { izvorTankId: string; ciljTankIds: string[] }
): Promise<{ izvor: TankOtisak; ciljevi: PregledCilja[] }> {
  const izvor = await ucitajTank(tx, args.izvorTankId);
  const izvorOtisak = napraviOtisak(izvor);

  const ciljevi: PregledCilja[] = [];

  for (const ciljTankId of args.ciljTankIds) {
    if (ciljTankId === args.izvorTankId) continue;

    const tank = await ucitajTank(tx, ciljTankId);
    const otisak = napraviOtisak(tank);
    const stanjeMl = otisak.kolicinaMl;
    const prazan = stanjeMl === 0;
    const drugoVino = !prazan && !istiIdentitet(otisak, izvorOtisak);

    ciljevi.push({
      ciljTankId: tank.id,
      brojTanka: tank.broj,
      kapacitet: Number(tank.kapacitet),
      stanjeLitara: uLitre(stanjeMl),
      slobodnoLitara: uLitre(Math.max(uMl(tank.kapacitet) - stanjeMl, 0)),
      nazivVina: tank.nazivVina ?? null,
      sorta: tank.sorta ?? null,
      godiste: tank.godiste ?? null,
      prazan,
      drugoVino,
      upozorenje: drugoVino
        ? `U tanku ${tank.broj} je ${norm(tank.nazivVina) || norm(tank.sorta) || "drugo vino"}, a filtrira se ${norm(izvor.nazivVina) || norm(izvor.sorta) || "vino iz drugog tanka"}. Vina ce se pomijesati.`
        : null,
    });
  }

  return { izvor: izvorOtisak, ciljevi };
}
