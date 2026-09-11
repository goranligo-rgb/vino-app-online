/**
 * BACKFILL IMENA VINA (faza 2) — rekonstrukcija, ne izmisljanje.
 *
 * Pokretanje:  npm run ime:backfill            (suho, nista ne pise)
 *              npm run ime:backfill -- --primijeni
 *
 * ODAKLE DOLAZE PODACI
 * --------------------
 * Ime vina se nikad nije zapisivalo kao cin, ali se zapisivalo kao STANJE, i
 * to na pet mjesta. Svako od njih je promatranje oblika "u trenutku T tank X
 * se zvao Y":
 *
 *   PretokSnapshot.nazivVinaPrije   152 retka   stanje PRIJE pretoka
 *   PunjenjeTanka.prethodniNazivVina            stanje PRIJE punjenja
 *   PunjenjeTanka.nazivVina           3 retka   stanje POSLIJE punjenja
 *   ArhivaVina.nazivVina             76 od 92   stanje u casu arhiviranja
 *   Tank.nazivVina                   42 tanka   stanje DANAS
 *
 * BLENDIZVOR JE NAMJERNO IZOSTAVLJEN, iako nosi `nazivVina` na 88 redaka.
 * Njegov `createdAt` nije trenutak blendanja nego trenutak upisa retka, a
 * retke je naknadno prepisivala popravna skripta: 14 ih dijeli istu
 * milisekundu (2026-09-10T10:40:02.788Z), 29 ih je nastalo tog jednog dana.
 * Promatranje cije vrijeme ne opisuje trenutak o kojem govori nije dokaz.
 * Mjereno: bez njega se T2, T34 i T38 prestaju raziliziti s onim sto tank
 * danas pokazuje, jer su bas ta tri dobivala ime iz popravnog upisa.
 *
 * CINOVI se citaju iz knjige (BerbaKretanje): svaki redak kojim je vino USLO
 * u tank je trenutak u kojem se ime moglo promijeniti — punjenje, pretok
 * (cuvée ili obican) ili filtracija. Knjiga je jedini izvor koji zna i tocan
 * trenutak i tocan tank, a vec je okosnica svega ostalog.
 *
 * KAKO SE SPAJA
 * -------------
 * Cin u trenutku Te proizveo je ono ime koje se PRVI PUT promatra poslije
 * njega, a prije sljedeceg cina. Ako izmedju dva cina nema nijednog
 * promatranja, taj cin NE DOBIVA ZAPIS — ne zna se sto je napravio.
 *
 * Promatranja su razvrstana na PRIJE i POSLIJE jer padaju u istu sekundu kao
 * i cin: nazivVinaPrije snimljen pri pretoku opisuje stanje prije TOG
 * pretoka, dakle proizvod PRETHODNOG cina.
 *
 * STO SE NAMJERNO NE RADI
 * -----------------------
 *   - BEZIMENO OSTAJE BEZIMENO. Sest tankova danas nema ime; nijedan nece
 *     dobiti zapis. Imenovat ce ih covjek kroz obrazac iz faze 5.
 *   - TIPFELERI SE NE POPRAVLJAJU. "Cvee bijeli", "Preševina", "Rajnski
 *     riesling" uz "Rajnski rizling", "Zeleni veltlinac" uz "Veltlinac
 *     zeleni" — sve se prepisuje kako jest. Normalizacija je odluka o
 *     sadrzaju, a ovo je prepisivanje; popravlja se rucno, poslije.
 *   - NE POGADJA SE UNATRAG. Cin bez promatranja ostaje bez zapisa, makar to
 *     znacilo da vino u proslosti izgleda bezimeno.
 *
 * PONOVNO POKRETANJE je sigurno: zapisi nastali backfillom prepoznaju se po
 * napomeni koja pocinje BILJEG-om i brisu se prije novog upisa. Rucni zapisi
 * i oni koje su napisale rute se NE DIRAJU.
 *
 * I NE UDVAJAJU SE. Od faze 3 pretok, punjenje i filtracija sami upisuju cin u
 * trenutku kad ga rade — a taj isti cin stoji i u knjizi, pa bi ga backfill
 * izveo po drugi put. Zato se prije spajanja procitaju svi zapisi KOJI NISU
 * backfillovi i cin se preskoci ako ga medju njima vec ima (po `pretokId` ili
 * `punjenjeId`, a kad ih nema — po tanku i trenutku).
 *
 * Ovo nije teorija: 11.09. je backfill pokrenut u 11:00, a u 11:17 i 11:19 su
 * u podrum usla cetiri punjenja i jedan cuvée. Cim faza 3 ode na posluzitelj,
 * svako sljedece pokretanje zatekne i vlastite i tudje zapise.
 *
 * STO OSTAJE RAZLICITO — I ZASTO SE NE POPRAVLJA
 * ----------------------------------------------
 * T20 je jedini tank kojem se DEKLARIRANA SORTA razilazi: iz dokaza ispada
 * "Muškat žuti", a `Tank.sorta` danas kaze "Sauvignon". Uzrok je unatrag
 * datiran unos — punjenje T20 nosi `datumPunjenja` 09.09. u 10:28, a redak je
 * upisan 10.09. u 08:31. Snimka pretoka od 09.09. u 10:35 zato pada IZMEDJU
 * datuma cina i trenutka u kojem je taj cin stvarno pisao po tanku, pa svjedoci
 * o stanju koje je cin tek trebao promijeniti.
 *
 * Ne popravlja se jer bi za to trebao drugi sat (kad je zapis NASTAO, uz onaj
 * kad se dogodio) na svakom promatranju, a rijec je o jednom retku: ime T20 se
 * slaze (oba su prazna), tank je ionako medju sest bezimenih koje ce covjek
 * imenovati u fazi 5, i tada se sorta upisuje rukom. Faza 3 ovo ne moze
 * ponoviti — ondje cin sam upisuje sto je napravio, u trenutku kad to radi.
 */

import { prisma } from "../lib/prisma";
import { satKretanja } from "../lib/sat-knjige";
import { izracunajGranicuVina, PRAZNO_ML } from "../lib/granica-vina";
import {
  izracunajImeVina,
  ocisti,
  vrijediUpisati,
  type ZapisImena,
} from "../lib/ime-vina";

const PRIMIJENI = process.argv.includes("--primijeni");
const BILJEG = "faza 2:";

type Kind = "PUNJENJE" | "CUVEE" | "PRETOK" | "FILTRACIJA";

type Cin = {
  at: Date;
  vrsta: Kind;
  pretokId: string | null;
  punjenjeId: string | null;
  /** Je li tank neposredno prije ovog cina bio prazan. */
  izPraznog: boolean;
};

/**
 * Promatranje stanja imena u jednom trenutku.
 *
 * `undefined` i `null` NISU isto, i razlika je nosiva:
 *   undefined = izvor to polje uopce ne biljezi (PunjenjeTanka nema stupac za
 *               sortu POSLIJE punjenja), pa se o njemu ne tvrdi nista;
 *   null      = izvor ga biljezi i biljezi ga PRAZNIM — tank tada nije imao
 *               ime, i to je tvrdnja koja se mora postovati.
 *
 * Bez te razlike bi T30, T31 i T44 izgubili deklariranu sortu: njihov jedini
 * cin je punjenje, a jedini dokaz o njemu je `PunjenjeTanka.nazivVina`, koji
 * sortu ne poznaje. Sa razlikom se sorta uzme iz prvog izvora koji je stvarno
 * promatra.
 */
type Promatranje = {
  at: Date;
  /** PRIJE = opisuje stanje prije cina u istoj sekundi. */
  strana: "PRIJE" | "POSLIJE";
  naziv: string | null | undefined;
  sorta: string | null | undefined;
  dokaz: string;
};

const kljuc = (p: { at: Date; strana: "PRIJE" | "POSLIJE" }) =>
  p.at.getTime() * 2 + (p.strana === "PRIJE" ? 0 : 1);

type RedakKnjige = {
  uTankId: string | null;
  izTankId: string | null;
  litre: number;
  vrsta: string;
  dogodenoAt: Date;
  createdAt: Date;
  pretokId: string | null;
  punjenjeId: string | null;
  zadatakId: string | null;
};

type Upis = {
  tankId: string;
  brojTanka: number;
  odAt: Date;
  naziv: string | null;
  deklariranaSorta: string | null;
  izvor: Kind;
  pretokId: string | null;
  punjenjeId: string | null;
  dokaz: string;
};

async function main() {
  console.log(
    PRIMIJENI
      ? "BACKFILL IMENA — PISE\n"
      : "BACKFILL IMENA — suho, nista se ne pise\n"
  );

  const tankovi = await prisma.tank.findMany({
    select: { id: true, broj: true, nazivVina: true, sorta: true },
  });
  const knjiga = (await prisma.berbaKretanje.findMany({
    select: {
      uTankId: true,
      izTankId: true,
      litre: true,
      vrsta: true,
      dogodenoAt: true,
      createdAt: true,
      pretokId: true,
      punjenjeId: true,
      zadatakId: true,
    },
  })) as RedakKnjige[];
  const pretoci = await prisma.pretok.findMany({
    select: { id: true, tip: true, datum: true },
  });
  const punjenja = await prisma.punjenjeTanka.findMany({
    select: {
      id: true,
      tankId: true,
      datumPunjenja: true,
      nazivVina: true,
      prethodniNazivVina: true,
      prethodnaSorta: true,
    },
  });
  const snapshoti = await prisma.pretokSnapshot.findMany({
    select: {
      tankId: true,
      pretokId: true,
      nazivVinaPrije: true,
      sortaPrije: true,
    },
  });
  const arhive = await prisma.arhivaVina.findMany({
    select: { tankId: true, nazivVina: true, sorta: true, arhiviranoAt: true },
  });

  // Zapisi koje backfill NIJE napisao — vidi „I NE UDVAJAJU SE" u zaglavlju.
  const tudji = await prisma.imeVina.findMany({
    where: { NOT: { napomena: { startsWith: BILJEG } } },
    select: { tankId: true, odAt: true, pretokId: true, punjenjeId: true },
  });

  const vecZapisano = new Set<string>();
  for (const z of tudji) {
    if (z.pretokId) vecZapisano.add(`p:${z.pretokId}:${z.tankId}`);
    if (z.punjenjeId) vecZapisano.add(`u:${z.punjenjeId}:${z.tankId}`);
    if (!z.pretokId && !z.punjenjeId)
      vecZapisano.add(`t:${z.tankId}:${z.odAt.getTime()}`);
  }

  const tipPretoka = new Map(pretoci.map((p) => [p.id, p.tip]));
  const datumPretoka = new Map(pretoci.map((p) => [p.id, p.datum]));
  const datumPunjenja = new Map(punjenja.map((p) => [p.id, p.datumPunjenja]));

  // ---------------------------------------------------------------- cinovi
  const poTankuKnjiga = new Map<string, RedakKnjige[]>();
  for (const k of knjiga) {
    for (const t of [k.uTankId, k.izTankId]) {
      if (!t) continue;
      const popis = poTankuKnjiga.get(t) ?? [];
      popis.push(k);
      poTankuKnjiga.set(t, popis);
    }
  }

  const poTankuCin = new Map<string, Map<string, Cin>>();

  for (const [tankId, redci] of poTankuKnjiga) {
    // Preklapanje po satu knjige — treba samo da se zna je li tank bio prazan
    // neposredno prije cina.
    const poredani = redci
      .map((r) => {
        const sat = satKretanja(r);
        const punjeno = r.punjenjeId
          ? datumPunjenja.get(r.punjenjeId)?.getTime()
          : undefined;
        return {
          r,
          poredak: sat,
          at: new Date(punjeno != null ? Math.min(sat, punjeno) : sat),
          ml:
            (r.uTankId === tankId ? Math.round(Number(r.litre) * 1000) : 0) -
            (r.izTankId === tankId ? Math.round(Number(r.litre) * 1000) : 0),
        };
      })
      .sort((a, b) => a.poredak - b.poredak);

    const cinovi = new Map<string, Cin>();
    let ml = 0;

    for (const p of poredani) {
      const prijeMl = ml;
      ml += p.ml;
      if (p.r.uTankId !== tankId) continue;

      const vrsta: Kind =
        p.r.vrsta === "ULAZ"
          ? "PUNJENJE"
          : p.r.vrsta === "FILTRACIJA"
            ? "FILTRACIJA"
            : p.r.pretokId && tipPretoka.get(p.r.pretokId) === "CUVEE"
              ? "CUVEE"
              : "PRETOK";

      // Kljuc cina: sam dogadaj, ne redak knjige. Jedan pretok knjizi po jedan
      // redak za svaku berbu, a cin je JEDAN.
      const id =
        p.r.pretokId ?? p.r.punjenjeId ?? p.r.zadatakId ?? `k:${p.poredak}`;
      const postoji = cinovi.get(id);
      if (postoji) {
        if (p.at < postoji.at) postoji.at = p.at;
        continue;
      }

      cinovi.set(id, {
        // CIN SE SIDRI NA ISTI SAT KOJIM SU DATIRANA NJEGOVA PROMATRANJA.
        //
        // Pretok nosi svoj `datum` iz obrasca i snapshoti su datirani po
        // njemu; punjenje nosi `datumPunjenja`, a knjiga za isti dogadaj zna
        // znati drugi sat (T44: knjiga 11:43, punjenje 13:29). Sidri li se cin
        // na sat knjige, `prethodniNazivVina` — koji opisuje stanje PRIJE tog
        // punjenja — padne IZA njega i bude procitan kao njegov proizvod.
        // Mjereno: T44 je tako izgubio ime.
        at: p.r.pretokId
          ? (datumPretoka.get(p.r.pretokId) ?? p.at)
          : p.r.punjenjeId
            ? (datumPunjenja.get(p.r.punjenjeId) ?? p.at)
            : p.at,
        vrsta,
        pretokId: p.r.pretokId ?? null,
        punjenjeId: p.r.punjenjeId ?? null,
        izPraznog: prijeMl < PRAZNO_ML,
      });
    }

    poTankuCin.set(tankId, cinovi);
  }

  // ---------------------------------------------------------- promatranja
  const poTankuProm = new Map<string, Promatranje[]>();
  const dodaj = (tankId: string | null, p: Promatranje) => {
    if (!tankId) return;
    // Odbacuje se samo promatranje koje ne tvrdi NISTA. Promatranje koje tvrdi
    // "tada nije imao ime" ostaje — inace bi se preskocilo na kasnije ime i
    // tank bi dobio ime koje u tom casu nije imao.
    if (p.naziv === undefined && p.sorta === undefined) return;
    const popis = poTankuProm.get(tankId) ?? [];
    popis.push(p);
    poTankuProm.set(tankId, popis);
  };

  for (const s of snapshoti) {
    const at = s.pretokId ? datumPretoka.get(s.pretokId) : null;
    if (!at) continue;
    dodaj(s.tankId, {
      at,
      strana: "PRIJE",
      naziv: ocisti(s.nazivVinaPrije),
      sorta: ocisti(s.sortaPrije),
      dokaz: "PretokSnapshot.nazivVinaPrije",
    });
  }

  for (const p of punjenja) {
    dodaj(p.tankId, {
      at: p.datumPunjenja,
      strana: "PRIJE",
      naziv: ocisti(p.prethodniNazivVina),
      sorta: ocisti(p.prethodnaSorta),
      dokaz: "PunjenjeTanka.prethodniNazivVina",
    });
    dodaj(p.tankId, {
      at: p.datumPunjenja,
      strana: "POSLIJE",
      naziv: ocisti(p.nazivVina),
      // PunjenjeTanka nema stupac za sortu POSLIJE punjenja — vidi `Promatranje`.
      sorta: undefined,
      dokaz: "PunjenjeTanka.nazivVina",
    });
  }

  for (const a of arhive) {
    dodaj(a.tankId, {
      at: a.arhiviranoAt,
      strana: "PRIJE",
      naziv: ocisti(a.nazivVina),
      sorta: ocisti(a.sorta),
      dokaz: "ArhivaVina.nazivVina",
    });
  }

  const SADA = new Date();
  for (const t of tankovi) {
    dodaj(t.id, {
      at: SADA,
      strana: "POSLIJE",
      naziv: ocisti(t.nazivVina),
      sorta: ocisti(t.sorta),
      dokaz: "Tank.nazivVina (danas)",
    });
  }

  // ------------------------------------------------------------- spajanje
  const upisi: Upis[] = [];
  let cinovaUkupno = 0;
  let cinovaBezDokaza = 0;
  let cinovaVecZapisanih = 0;

  /** Je li ovaj cin vec zapisala ruta (faza 3). Vidi zaglavlje. */
  const zapisaoNetkoDrugi = (tankId: string, c: Cin) =>
    (c.pretokId && vecZapisano.has(`p:${c.pretokId}:${tankId}`)) ||
    (c.punjenjeId && vecZapisano.has(`u:${c.punjenjeId}:${tankId}`)) ||
    (!c.pretokId &&
      !c.punjenjeId &&
      vecZapisano.has(`t:${tankId}:${c.at.getTime()}`));

  for (const t of tankovi) {
    const cinovi = [...(poTankuCin.get(t.id)?.values() ?? [])].sort(
      (a, b) => a.at.getTime() - b.at.getTime()
    );
    const prom = (poTankuProm.get(t.id) ?? []).sort((a, b) => kljuc(a) - kljuc(b));

    let zadnjiNaziv: string | null = null;
    let zadnjaSorta: string | null = null;
    let imaZadnji = false;

    for (let i = 0; i < cinovi.length; i++) {
      cinovaUkupno++;
      const c = cinovi[i];
      const od = kljuc({ at: c.at, strana: "POSLIJE" });
      const doK =
        i + 1 < cinovi.length
          ? kljuc({ at: cinovi[i + 1].at, strana: "PRIJE" })
          : Number.POSITIVE_INFINITY;

      // Ime i deklarirana sorta se traze NEOVISNO: uzima se prvi izvor koji to
      // polje stvarno promatra. Vidi biljesku uz `Promatranje`.
      const uProzoru = prom.filter((x) => kljuc(x) >= od && kljuc(x) <= doK);
      const pNaziv = uProzoru.find((x) => x.naziv !== undefined);
      const pSorta = uProzoru.find((x) => x.sorta !== undefined);
      if (!pNaziv && !pSorta) {
        cinovaBezDokaza++;
        continue;
      }

      const naziv = pNaziv?.naziv ?? null;
      const sorta = pSorta?.sorta ?? null;
      const dokaz = [...new Set([pNaziv?.dokaz, pSorta?.dokaz])]
        .filter(Boolean)
        .join(" + ");

      const isto = imaZadnji && naziv === zadnjiNaziv && sorta === zadnjaSorta;
      zadnjiNaziv = naziv;
      zadnjaSorta = sorta;
      imaZadnji = true;

      // CIN KOJI JE VEC ZAPISALA RUTA (faza 3) se preskace TEK OVDJE, a ne
      // prije racuna: tekuce ime se mora osvjeziti i za njega, inace bi
      // sljedeci cin usporedivao s imenom od prije dva cina i ili upisao zapis
      // koji ne treba, ili izostavio onaj koji treba.
      if (zapisaoNetkoDrugi(t.id, c)) {
        cinovaVecZapisanih++;
        continue;
      }

      // Ime se upisuje kad se PROMIJENI — ili kad u praznu posudu ude novo
      // vino, jer tada stariji zapisi ispadaju iz prozora i bez novog bi vino
      // ostalo bezimeno.
      if (isto && !c.izPraznog) continue;
      if (!vrijediUpisati(naziv, sorta)) continue;

      upisi.push({
        tankId: t.id,
        brojTanka: t.broj,
        odAt: c.at,
        naziv,
        deklariranaSorta: sorta,
        izvor: c.vrsta,
        pretokId: c.pretokId,
        punjenjeId: c.punjenjeId,
        dokaz,
      });
    }
  }

  console.log(
    `cinova iz knjige: ${cinovaUkupno}, bez ijednog promatranja: ${cinovaBezDokaza}, vec zapisanih rutom: ${cinovaVecZapisanih}`
  );
  console.log(`zapisa za upis: ${upisi.length}\n`);

  const poVrsti = new Map<string, number>();
  for (const u of upisi) poVrsti.set(u.izvor, (poVrsti.get(u.izvor) ?? 0) + 1);
  console.log("po vrsti cina:", Object.fromEntries(poVrsti));

  const poDokazu = new Map<string, number>();
  for (const u of upisi) poDokazu.set(u.dokaz, (poDokazu.get(u.dokaz) ?? 0) + 1);
  console.log("po dokazu:   ", Object.fromEntries(poDokazu), "\n");

  // ------------------------------------------------------------------ upis
  if (PRIMIJENI) {
    const obrisano = await prisma.imeVina.deleteMany({
      where: { napomena: { startsWith: BILJEG } },
    });
    if (obrisano.count > 0)
      console.log(`obrisano ranijih backfill zapisa: ${obrisano.count}`);

    await prisma.imeVina.createMany({
      data: upisi.map((u) => ({
        tankId: u.tankId,
        odAt: u.odAt,
        naziv: u.naziv,
        deklariranaSorta: u.deklariranaSorta,
        izvor: u.izvor,
        pretokId: u.pretokId,
        punjenjeId: u.punjenjeId,
        napomena: `${BILJEG} rekonstruirano iz ${u.dokaz}`,
      })),
    });
    console.log(`upisano: ${upisi.length}\n`);
  }

  await provjeri(tankovi, poTankuKnjiga, datumPunjenja, upisi);

  await prisma.$disconnect();
}

/**
 * PROVJERA: cita li se poslije backfilla isto ime koje tank danas pokazuje.
 *
 * Ovo je jedina mjera koja govori hoce li faza 4 promijeniti ijedan ekran.
 * Razilazenje NIJE nuzno greska — tank bez imena ga po dogovoru ni ne dobiva —
 * pa se svako imenom i brojem ispisuje.
 */
async function provjeri(
  tankovi: {
    id: string;
    broj: number;
    nazivVina: string | null;
    sorta: string | null;
  }[],
  poTankuKnjiga: Map<string, RedakKnjige[]>,
  datumPunjenja: Map<string, Date>,
  upisi: Upis[]
) {
  console.log("PROVJERA — cita li se isto ime koje tank danas pokazuje\n");

  const izBaze = PRIMIJENI
    ? await prisma.imeVina.findMany({ where: { obrisano: false } })
    : null;

  let slaze = 0;
  let slazeSorta = 0;
  const razilazi: string[] = [];
  const razilaziSorta: string[] = [];
  const bezimeni: number[] = [];

  for (const t of [...tankovi].sort((a, b) => a.broj - b.broj)) {
    const granica = izracunajGranicuVina(
      t.id,
      poTankuKnjiga.get(t.id) ?? [],
      datumPunjenja
    );
    if (granica.razlog === "PRAZAN" || granica.razlog === "NEMA_KNJIGE") continue;

    const zapisi: ZapisImena[] = (
      izBaze
        ? izBaze.filter((z) => z.tankId === t.id)
        : upisi
            .filter((u) => u.tankId === t.id)
            .map((u, i) => ({
              id: `x${i}`,
              tankId: u.tankId,
              odAt: u.odAt,
              naziv: u.naziv,
              deklariranaSorta: u.deklariranaSorta,
              izvor: u.izvor,
              obrisano: false,
              createdAt: u.odAt,
            }))
    ) as ZapisImena[];

    const ime = izracunajImeVina(granica, zapisi);
    const danas = ocisti(t.nazivVina);

    if (ime.naziv === danas) {
      slaze++;
      if (!danas) bezimeni.push(t.broj);
    } else {
      razilazi.push(
        `  T${String(t.broj).padStart(2)}  danas: ${JSON.stringify(danas)}  iz knjige: ${JSON.stringify(ime.naziv)}  (${ime.razlog})`
      );
    }

    const sortaDanas = ocisti(t.sorta);
    if (ime.deklariranaSorta === sortaDanas) slazeSorta++;
    else
      razilaziSorta.push(
        `  T${String(t.broj).padStart(2)}  Tank.sorta: ${JSON.stringify(sortaDanas)}  zapis: ${JSON.stringify(ime.deklariranaSorta)}`
      );
  }

  console.log(`  ime   — slaze se: ${slaze}   razilazi se: ${razilazi.length}`);
  console.log(`  sorta — slaze se: ${slazeSorta}   razilazi se: ${razilaziSorta.length}`);
  if (bezimeni.length)
    console.log(
      `  bezimenih i danas i poslije backfilla (po dogovoru): T${bezimeni.join(", T")}`
    );
  if (razilazi.length) {
    console.log("\n  RAZILAZENJA IMENA:");
    for (const r of razilazi) console.log(r);
  }
  if (razilaziSorta.length) {
    console.log("\n  RAZILAZENJA DEKLARIRANE SORTE:");
    for (const r of razilaziSorta) console.log(r);
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
