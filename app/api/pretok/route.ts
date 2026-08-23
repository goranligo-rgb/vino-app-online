export const dynamic = "force-dynamic";

// Vercel prekida funkciju bez obzira na to sto Prisma radi. Ako platforma
// istekne prva, korisnik dobije grubi 504 FUNCTION_INVOCATION_TIMEOUT umjesto
// nase poruke, i ne zna je li pretok prosao ili je ostao napola. Zato gornja
// granica funkcije mora biti OSJETNO veca od Prisminog budzeta:
//   Prisma najgori slucaj = maxWait 5 s + timeout 30 s = 35 s
//   maxDuration           = 60 s
// Prisma tako uvijek istekne prva, s rezervom. 60 s je i najveca vrijednost
// koju dopusta najnizi Vercel plan, pa vrijedi na svakom.
//
// Isti obrazac kao app/api/zadatak/filtracija/izvrsi/route.ts, samo je ovdje
// Prismin budzet veci (30 s umjesto 20 s): pretok koji isprazni izvorni tank
// jos i arhivira cijelu njegovu sezonu — mjerenja, zadatke sa stavkama,
// dokumente i punjenja — pa dosegne nekoliko stotina upita.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, smijeRaditiUPodrumu } from "@/lib/zadatak-auth";
import { jeMjerenjePrazno, NAPOMENA_BEZ_PARAMETARA } from "@/lib/filtracija";
import {
  vrijednostiTankaPoPolju,
  rasponDatumaIzvora,
  type IzvorPolja,
} from "@/lib/mjerenja";
import { Prisma, TipPretokaDb } from "@prisma/client";
import { izvrsiPretok } from "@/lib/pretok-motor";

type UlazPretoka = {
  tankId: string;
  kolicina: number;
};

type MjerenjeWeighted = {
  kolicina: number;
  alkohol: number | null;
  ukupneKiseline: number | null;
  hlapiveKiseline: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  secer: number | null;
  ph: number | null;
  temperatura: number | null;
};

type TankZaSnapshot = {
  id: string;
  broj: number;
  kapacitet: number;
  kolicinaVinaUTanku: number | null;
  tip: string | null;
  opis: string | null;
  sorta: string | null;
  nazivVina: string | null;
  godiste: number | null;
  udjeliSorti: {
    nazivSorte: string;
    postotak: number;
  }[];
  blendIzvori: {
    izvorTankId: string | null;
    izvorArhivaVinaId: string | null;
    nazivVina: string | null;
    sorta: string | null;
    kolicina: number;
    postotak: number;
  }[];
};


function weightedAverage(
  stavke: { kolicina: number; value: number | null | undefined }[]
): number | null {
  const valjane = stavke.filter(
    (s) => s.value !== null && s.value !== undefined && s.kolicina > 0
  );

  if (valjane.length === 0) return null;

  const ukupno = valjane.reduce((sum, s) => sum + s.kolicina, 0);
  if (ukupno <= 0) return null;

  const ponderirano = valjane.reduce(
    (sum, s) => sum + s.kolicina * Number(s.value),
    0
  );

  return Number((ponderirano / ukupno).toFixed(3));
}


/**
 * Vrijednosti tanka PO POLJU, ne "zadnji redak mjerenja".
 *
 * Prije je ovdje stajao `findFirst` s `orderBy: izmjerenoAt desc`, pa je pretok
 * uzimao samo ono sto je bilo u zadnjem retku. Kako se SO2 mjeri tjedno, a
 * alkohol/kiseline/secer rijetko, taj je redak gotovo uvijek imao samo SO2 —
 * i pretok bi u ciljni tank upisao mjerenje bez alkohola, iako alkohol na
 * izvoru postoji, samo je stariji. Vidi lib/mjerenja.ts.
 */
async function dohvatiVrijednostiZaTank(tankId: string) {
  return vrijednostiTankaPoPolju(prisma, tankId);
}


async function spremiSnapshotTanka(
  tx: Prisma.TransactionClient,
  pretokId: string,
  tank: TankZaSnapshot,
  uloga: "CILJ" | "IZVOR"
) {
  const snapshot = await tx.pretokSnapshot.create({
    data: {
      pretokId,
      tankId: tank.id,
      uloga,
      brojTanka: tank.broj,
      kolicinaPrije: Number(tank.kolicinaVinaUTanku ?? 0),
      sortaPrije: tank.sorta,
      nazivVinaPrije: tank.nazivVina,
      godistePrije: tank.godiste,
      kapacitetPrije: tank.kapacitet,
      tipTankaPrije: tank.tip,
      opisPrije: tank.opis,
    },
  });

  if (tank.udjeliSorti.length > 0) {
    await tx.pretokSnapshotSorta.createMany({
      data: tank.udjeliSorti.map((u) => ({
        snapshotId: snapshot.id,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });
  }

  if (tank.blendIzvori.length > 0) {
    await tx.pretokSnapshotBlend.createMany({
      data: tank.blendIzvori.map((b) => ({
        snapshotId: snapshot.id,
        izvorTankId: b.izvorTankId ?? null,
        izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
        nazivVina: b.nazivVina ?? null,
        sorta: b.sorta ?? null,
        kolicina: Number(b.kolicina),
        postotak: Number(b.postotak),
      })),
    });
  }

  return snapshot;
}


export async function POST(req: Request) {
  try {
    // PROVJERA PRIJAVE. Ove rute do 23.08.2026. NIJE BILO — `proxy.ts` svojim
    // matcherom pokriva stranicu `/pretok`, ali ne i `/api/pretok`, pa je
    // `POST` bio otvoren svakome tko zna URL. Provjereno na produkciji: prazno
    // tijelo vracalo je 400 (pala validacija), ne 401. Pretok premjesta vino i
    // moze pokrenuti arhiviranje, koje brise mjerenja i zadatke.
    //
    // Isti obrazac kao app/api/zadatak/filtracija/izvrsi/route.ts: 401 kad nije
    // prijavljen, 403 kad nema pravo. Provjera ide PRIJE citanja tijela.
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    }

    if (!smijeRaditiUPodrumu(user)) {
      return NextResponse.json(
        { error: "Nemate pravo raditi pretok." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const tipPretoka: TipPretokaDb =
      body?.tipPretoka === "CUVEE"
        ? TipPretokaDb.CUVEE
        : body?.tipPretoka === "BLEND_ISTE_SORTE"
        ? TipPretokaDb.BLEND_ISTE_SORTE
        : TipPretokaDb.OBICNI;

    const ciljTankId = String(body?.ciljTankId ?? "").trim();
    const napomena =
      typeof body?.napomena === "string" ? body.napomena : null;

    const nazivNovogVina =
      typeof body?.nazivNovogVina === "string"
        ? body.nazivNovogVina.trim()
        : "";

    const sortaNovogVina =
      typeof body?.sortaNovogVina === "string"
        ? body.sortaNovogVina.trim()
        : "";

    const godisteNovo =
      body?.godiste !== undefined &&
      body?.godiste !== null &&
      String(body.godiste).trim() !== ""
        ? Number(body.godiste)
        : null;

    // CILJEVI. Novi oblik je `ciljevi: [{ tankId, kolicina }]`; stari
    // `ciljTankId` bez kolicine i dalje radi i znaci "sve sto izadje ide onamo".
    // Forma se prebacuje u 5e-2, a stari oblik ostaje dok se ne uvjerimo da
    // nista drugo ne gadja ovu rutu.
    const ciljeviMap = new Map<string, number>();

    if (Array.isArray(body?.ciljevi) && body.ciljevi.length > 0) {
      for (const raw of body.ciljevi as Array<Record<string, unknown>>) {
        const tankId = String(raw?.tankId ?? "").trim();
        const kolicina = Number(raw?.kolicina ?? 0);

        if (!tankId || !Number.isFinite(kolicina) || kolicina <= 0) continue;

        ciljeviMap.set(tankId, Number((ciljeviMap.get(tankId) ?? 0) + kolicina));
      }
    }

    const nacin =
      body?.nacin === "FILTRACIJA" || body?.nacin === "FLOTACIJA"
        ? body.nacin
        : "BEZ";

    const nacinNapomena =
      typeof body?.nacinNapomena === "string" ? body.nacinNapomena.trim() : "";

    if (nacin !== "BEZ" && !nacinNapomena) {
      return NextResponse.json(
        { error: "Kad način nije „bez”, napomena o načinu je obavezna." },
        { status: 400 }
      );
    }

    if (
      (!ciljTankId && ciljeviMap.size === 0) ||
      !Array.isArray(body?.izvori) ||
      body.izvori.length === 0
    ) {
      return NextResponse.json(
        { error: "Neispravni podaci." },
        { status: 400 }
      );
    }

    const agregiraniIzvoriMap = new Map<string, number>();

    for (const raw of body.izvori as any[]) {
      const tankId = String(raw?.tankId ?? "").trim();
      const kolicina = Number(raw?.kolicina ?? 0);

      if (!tankId || !Number.isFinite(kolicina) || kolicina <= 0) continue;

      agregiraniIzvoriMap.set(
        tankId,
        Number((agregiraniIzvoriMap.get(tankId) ?? 0) + kolicina)
      );
    }

    const izvori: UlazPretoka[] = Array.from(agregiraniIzvoriMap.entries()).map(
      ([tankId, kolicina]) => ({
        tankId,
        kolicina,
      })
    );

    if (izvori.length === 0) {
      return NextResponse.json(
        { error: "Nema valjanih izvora za pretok." },
        { status: 400 }
      );
    }

    const ukupnoIzIzvora = izvori.reduce((z, i) => z + Number(i.kolicina), 0);

    // Stari oblik: jedan cilj koji prima sve sto je izaslo.
    if (ciljeviMap.size === 0) ciljeviMap.set(ciljTankId, ukupnoIzIzvora);

    const ciljevi = Array.from(ciljeviMap.entries()).map(([tankId, kolicina]) => ({
      tankId,
      kolicina,
    }));

    // GLAVNI cilj je prvi — on ide u `Pretok.ciljTankId`. Puni popis je u
    // `PretokCilj`, koji od faze 4 nosi istinu.
    const glavniCiljId = ciljevi[0].tankId;

    if (izvori.some((i) => ciljeviMap.has(i.tankId))) {
      return NextResponse.json(
        { error: "Ciljni tank ne može istovremeno biti i izvor." },
        { status: 400 }
      );
    }

    const trebaNovoVino =
      tipPretoka === TipPretokaDb.CUVEE ||
      tipPretoka === TipPretokaDb.BLEND_ISTE_SORTE;

    if (trebaNovoVino && !nazivNovogVina) {
      return NextResponse.json(
        { error: "Naziv novog vina je obavezan." },
        { status: 400 }
      );
    }

    if (trebaNovoVino && !sortaNovogVina) {
      return NextResponse.json(
        { error: "Sorta novog vina je obavezna." },
        { status: 400 }
      );
    }

    if (tipPretoka === TipPretokaDb.OBICNI && izvori.length !== 1) {
      return NextResponse.json(
        {
          error:
            "Obični pretok trenutno podržava samo jedan izvorni tank. Za spajanje više izvora koristi cuvée ili blend iste sorte.",
        },
        { status: 400 }
      );
    }

    const ciljniTankovi = await prisma.tank.findMany({
      where: { id: { in: ciljevi.map((c) => c.tankId) } },
      include: {
        udjeliSorti: {
          orderBy: { postotak: "desc" },
        },
        blendIzvori: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (ciljniTankovi.length !== ciljevi.length) {
      return NextResponse.json(
        { error: "Jedan ili više ciljnih tankova nisu pronađeni." },
        { status: 404 }
      );
    }

    const ciljById = new Map(ciljniTankovi.map((t) => [t.id, t]));


    const sourceTankIds = izvori.map((i) => i.tankId);

    const sourceTankovi = await prisma.tank.findMany({
      where: { id: { in: sourceTankIds } },
      include: {
        udjeliSorti: {
          orderBy: { postotak: "desc" },
        },
        blendIzvori: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (sourceTankovi.length !== sourceTankIds.length) {
      return NextResponse.json(
        { error: "Jedan ili više izvornih tankova nisu pronađeni." },
        { status: 404 }
      );
    }

    const tankById = new Map(sourceTankovi.map((t) => [t.id, t]));

    for (const i of izvori) {
      const tank = tankById.get(i.tankId);

      if (!tank) {
        return NextResponse.json(
          { error: "Izvorni tank nije pronađen." },
          { status: 404 }
        );
      }

      const dostupno = Number(tank.kolicinaVinaUTanku ?? 0);

      if (i.kolicina > dostupno) {
        return NextResponse.json(
          {
            error: `Tank ${tank.broj} nema dovoljno vina. Dostupno: ${dostupno} L.`,
          },
          { status: 400 }
        );
      }
    }

    // Kapacitet ciljeva se provjerava TEK nakon dostupnosti u izvorima —
    // inace bi zahtjev s prevelikom kolicinom javio "ne stane u cilj" umjesto
    // "izvor nema toliko vina", a to je krivi uzrok.
    for (const c of ciljevi) {
      const t = ciljById.get(c.tankId)!;
      const uTanku = Number(t.kolicinaVinaUTanku ?? 0);
      const slobodno = Number(t.kapacitet ?? 0) - uTanku;

      if (c.kolicina > slobodno) {
        return NextResponse.json(
          {
            error: `U tank ${t.broj} ne stane ${c.kolicina} L — slobodno je ${slobodno} L.`,
          },
          { status: 400 }
        );
      }
    }

    // Guard se provjerava za SVAKI cilj. Motor bi ga svejedno uhvatio, ali
    // ovdje je poruka konkretnija i pada prije nego transakcija uopce pocne.
    if (tipPretoka === TipPretokaDb.OBICNI) {
      const sourceTank = sourceTankovi[0];

      for (const c of ciljevi) {
        const t = ciljById.get(c.tankId)!;
        if (Number(t.kolicinaVinaUTanku ?? 0) <= 0) continue;

        const istaSorta = (t.sorta ?? "").trim() === (sourceTank.sorta ?? "").trim();
        const istiNaziv =
          (t.nazivVina ?? "").trim() === (sourceTank.nazivVina ?? "").trim();

        if (!istaSorta || !istiNaziv) {
          return NextResponse.json(
            {
              error: `Tank ${t.broj} već sadrži drugo vino. Za ovakvo spajanje koristi 'Novo vino – cuvée' ili 'Novo vino – ista sorta'.`,
            },
            { status: 400 }
          );
        }
      }
    }

    const vrijednostiIzvora = await Promise.all(
      izvori.map((i) => dohvatiVrijednostiZaTank(i.tankId))
    );

    const ukupnoDodano = ciljevi.reduce((z, c) => z + Number(c.kolicina), 0);

    // MJERENJE SE RACUNA PO CILJU.
    //
    // Svaki cilj ima svoj zatecen sadrzaj, pa i svoj ponderirani prosjek. Udio
    // pojedinog izvora u pojedinom cilju je razmjeran tome koliko je u taj cilj
    // uslo od ukupnog ulaza — isto kako motor dijeli blend i sastav.
    //
    // Uz jedan cilj i bez kala ovo daje TOCNO isti broj kao prije: tezina
    // izvora je `kolicina * ulaz / ulaz`, dakle nepromijenjena.
    const koristenaPodrijetla: IzvorPolja[] = [];

    const mjerenjaPoCilju = await Promise.all(
      ciljevi.map(async (c) => {
        const t = ciljById.get(c.tankId)!;
        const trenutnoUCilju = Number(t.kolicinaVinaUTanku ?? 0);
        const vrijednostiCilja = await dohvatiVrijednostiZaTank(c.tankId);

        const weightedInputs: MjerenjeWeighted[] = [];

        if (trenutnoUCilju > 0 && !jeMjerenjePrazno(vrijednostiCilja.vrijednosti)) {
          weightedInputs.push({
            kolicina: trenutnoUCilju,
            ...vrijednostiCilja.vrijednosti,
          });
          koristenaPodrijetla.push(vrijednostiCilja.izvorPolja);
        }

        izvori.forEach((izvor, index) => {
          const v = vrijednostiIzvora[index];
          if (jeMjerenjePrazno(v.vrijednosti)) return;

          const udio =
            ukupnoDodano > 0
              ? (Number(izvor.kolicina) * Number(c.kolicina)) / ukupnoDodano
              : 0;

          if (udio <= 0) return;

          weightedInputs.push({ kolicina: udio, ...v.vrijednosti });
          koristenaPodrijetla.push(v.izvorPolja);
        });

        const polje = (uzmi: (x: MjerenjeWeighted) => number | null) =>
          weightedAverage(
            weightedInputs.map((x) => ({ kolicina: x.kolicina, value: uzmi(x) }))
          );

        const vrijednosti = {
          alkohol: polje((x) => x.alkohol),
          ukupneKiseline: polje((x) => x.ukupneKiseline),
          hlapiveKiseline: polje((x) => x.hlapiveKiseline),
          slobodniSO2: polje((x) => x.slobodniSO2),
          ukupniSO2: polje((x) => x.ukupniSO2),
          secer: polje((x) => x.secer),
          ph: polje((x) => x.ph),
          temperatura: polje((x) => x.temperatura),
        };

        return { ciljTankId: c.tankId, vrijednosti, prazno: jeMjerenjePrazno(vrijednosti) };
      })
    );

    // Odgovor i dalje nosi jedno mjerenje — ono glavnog cilja. Forma ga tako i
    // prikazuje; puni popis po ciljevima se upisuje u bazu nize.
    const novoMjerenje =
      mjerenjaPoCilju.find((m) => m.ciljTankId === glavniCiljId)?.vrijednosti ??
      mjerenjaPoCilju[0].vrijednosti;

    // Prenosi li ovaj pretok ijedan parametar? Ako izvori (i zateceni sadrzaj
    // cilja) nemaju nijednu upisanu vrijednost, ponderiranje vrati osam nulla i
    // upis bi bio lazan zapis "izmjereno" bez ijednog izmjerenog podatka. Takav
    // redak k tome postaje NAJNOVIJE mjerenje ciljnog tanka, pa ga svaki iduci
    // pretok uzme kao polaznu vrijednost i praznina se siri dalje.
    //
    // Isti guard filtracija ima od faze 3A. `jeMjerenjePrazno` se UVOZI iz
    // lib/filtracija.ts — nema druge kopije.
    const parametriPreneseni = mjerenjaPoCilju.some((m) => !m.prazno);

    // Rezultat je prosjek preko vise tankova i moguce vise datuma. Bez ovoga bi
    // izgledao kao jedno mjerenje uzeto u jednom trenutku.
    const rasponIzvora = rasponDatumaIzvora(koristenaPodrijetla);
    const dodatakONastanku = rasponIzvora
      ? ` Vrijednosti su složene iz mjerenja od ${rasponIzvora.od.toLocaleDateString(
          "hr-HR"
        )} do ${rasponIzvora.do.toLocaleDateString("hr-HR")}.`
      : "";

    const rezultat = await prisma.$transaction(async (tx) => {
      const pretok = await tx.pretok.create({
        data: {
          // `ciljTankId` ostaje GLAVNI cilj — jos ga se pise, i dalje je jedini
          // koji zna `Pretok.ciljTank`. Pravi popis ciljeva je `ciljevi` nize.
          ciljTankId: glavniCiljId,
          tip: tipPretoka,
          // Tko je pretocio. Zateceni pretoci ostaju NULL — vidi migraciju
          // 20260823_korisnik_na_pretok_punjenje_izlaz.
          korisnikId: user.id,
          // Pretok, za razliku od filtracije, ne stvara `Radnja` — pa se podatak
          // o neprenesenim parametrima dopisuje ovdje. Korisnikov tekst ostaje
          // netaknut ispred, isti spoj " • " kao u filtraciji.
          napomena: parametriPreneseni
            ? napomena
            : [napomena?.trim() || null, NAPOMENA_BEZ_PARAMETARA]
                .filter(Boolean)
                .join(" • "),
          izvori: {
            create: izvori.map((i) => ({
              tankId: i.tankId,
              kolicina: Number(i.kolicina),
            })),
          },
          // Ciljevi kao zrcalo izvora. Danas uvijek TOCNO JEDAN, isti onaj koji je
          // u `ciljTankId` — ponasanje se ne mijenja, model je samo spreman za
          // vise njih. `ukupnoDodano` je zbroj izvora, a za oba puta (obicni i
          // cuvee) je to tocno ono za sto se ciljni tank uvecava.
          //
          // `kolicinaIzlaz` i `gubitakLitara` ostaju NULL: kalo jos nitko ne
          // racuna, a lazna nula bi tvrdila da gubitka nije bilo.
          nacin,
          nacinNapomena: nacinNapomena || null,
          ciljevi: {
            create: ciljevi.map((c, i) => ({
              tankId: c.tankId,
              kolicina: Number(c.kolicina),
              redoslijed: i,
            })),
          },
        },
        include: {
          izvori: true,
        },
      });

      // Snapshot po SVAKOM cilju — ponistavanje vraca tank po tank, pa mu za
      // svaki treba njegovo stanje prije.
      for (const c of ciljevi) {
        const t = ciljById.get(c.tankId)!;

        await spremiSnapshotTanka(
          tx,
          pretok.id,
          {
            id: t.id,
            broj: t.broj,
            kapacitet: t.kapacitet,
            kolicinaVinaUTanku: t.kolicinaVinaUTanku,
            tip: t.tip,
            opis: t.opis,
            sorta: t.sorta,
            nazivVina: t.nazivVina,
            godiste: t.godiste,
            udjeliSorti: t.udjeliSorti.map((u) => ({
              nazivSorte: u.nazivSorte,
              postotak: u.postotak,
            })),
            blendIzvori: t.blendIzvori.map((b) => ({
              izvorTankId: b.izvorTankId ?? null,
              izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
              nazivVina: b.nazivVina ?? null,
              sorta: b.sorta ?? null,
              kolicina: Number(b.kolicina),
              postotak: Number(b.postotak),
            })),
          },
          "CILJ"
        );
      }

      for (const sourceTank of sourceTankovi) {
        await spremiSnapshotTanka(
          tx,
          pretok.id,
          {
            id: sourceTank.id,
            broj: sourceTank.broj,
            kapacitet: sourceTank.kapacitet,
            kolicinaVinaUTanku: sourceTank.kolicinaVinaUTanku,
            tip: sourceTank.tip,
            opis: sourceTank.opis,
            sorta: sourceTank.sorta,
            nazivVina: sourceTank.nazivVina,
            godiste: sourceTank.godiste,
            udjeliSorti: sourceTank.udjeliSorti.map((u) => ({
              nazivSorte: u.nazivSorte,
              postotak: u.postotak,
            })),
            blendIzvori: sourceTank.blendIzvori.map((b) => ({
              izvorTankId: b.izvorTankId ?? null,
              izvorArhivaVinaId: b.izvorArhivaVinaId ?? null,
              nazivVina: b.nazivVina ?? null,
              sorta: b.sorta ?? null,
              kolicina: Number(b.kolicina),
              postotak: Number(b.postotak),
            })),
          },
          "IZVOR"
        );
      }

      // ---------------------------------------------------------------------
      // MOTOR. Dvije grane po vrsti (obicna i cuvée) su nestale — vrste se
      // razlikuju samo u identitetu vina, a to motor rjesava jednim korakom.
      //
      // Sto je ostalo ruti: zapis `Pretok`, snapshoti, automatsko mjerenje i
      // HTTP. Sto je preuzeo motor: sve sto se dogada s vinom.
      //
      // Povratak ako nesto pukne: `git revert` OVOG commita. Baza se ne dira —
      // faza 4 je aditivna, `ciljTankId` i `PretokCilj` pise i stara grana.
      // ---------------------------------------------------------------------
      const rezultatMotora = await izvrsiPretok(tx, {
        izvori: izvori.map((i) => ({
          tankId: i.tankId,
          kolicina: Number(i.kolicina),
        })),
        ciljevi: ciljevi.map((c) => ({
          tankId: c.tankId,
          kolicina: Number(c.kolicina),
        })),
        vrsta:
          tipPretoka === TipPretokaDb.CUVEE
            ? "CUVEE"
            : tipPretoka === TipPretokaDb.BLEND_ISTE_SORTE
            ? "ISTA_SORTA"
            : "OBICNI",
        nacin,
        nacinNapomena: nacinNapomena || null,
        napomena,
        korisnikId: user.id,
        noviIdentitet: trebaNovoVino
          ? {
              nazivVina: nazivNovogVina,
              sorta: sortaNovogVina,
              godiste: godisteNovo ?? null,
            }
          : null,
      });

      // Kalo i izlaz sada racuna motor, pa se konacno upisuju. Na starim
      // pretocima ostaju NULL — ondje ih nitko nije ni racunao.
      await tx.pretok.update({
        where: { id: pretok.id },
        data: {
          kolicinaIzlaz: rezultatMotora.izasloLitara,
          gubitakLitara: rezultatMotora.gubitakLitara,
        },
      });

      // Prazno mjerenje se NE upisuje. `pretokMjerenje.create` mora biti pod
      // istim uvjetom — inace bi veza pokazivala na mjerenje koje ne postoji.
      // Mjerenje po cilju. Prazno se NE upisuje — `pretokMjerenje.create` je pod
      // istim uvjetom, inace bi veza pokazivala na mjerenje koje ne postoji.
      for (const m of mjerenjaPoCilju) {
        if (m.prazno) continue;

        const createdMjerenje = await tx.mjerenje.create({
          data: {
            tankId: m.ciljTankId,
            korisnikId: null,
            alkohol: m.vrijednosti.alkohol,
            ukupneKiseline: m.vrijednosti.ukupneKiseline,
            hlapiveKiseline: m.vrijednosti.hlapiveKiseline,
            slobodniSO2: m.vrijednosti.slobodniSO2,
            ukupniSO2: m.vrijednosti.ukupniSO2,
            secer: m.vrijednosti.secer,
            ph: m.vrijednosti.ph,
            temperatura: m.vrijednosti.temperatura,
            napomena:
              (tipPretoka === TipPretokaDb.OBICNI
                ? "Automatski izračunato novo mjerenje nakon običnog pretoka."
                : tipPretoka === TipPretokaDb.CUVEE
                ? "Automatski izračunato novo mjerenje nakon cuvéea."
                : "Automatski izračunato novo mjerenje nakon blenda iste sorte.") +
              dodatakONastanku,
            jeRucno: false,
          },
        });

        await tx.pretokMjerenje.create({
          data: {
            pretokId: pretok.id,
            mjerenjeId: createdMjerenje.id,
            tankId: m.ciljTankId,
          },
        });
      }

      // Sastav i blend se citaju IZ BAZE, ne racunaju napamet — odgovor tako
      // ne moze tvrditi nesto drugo od onoga sto je upisano.
      const ciljPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: glavniCiljId },
        include: {
          udjeliSorti: { orderBy: { postotak: "desc" } },
          blendIzvori: { orderBy: { kolicina: "desc" } },
        },
      });

      return {
        pretok,
        noviBlendIzvori: ciljPoslije.blendIzvori.map((b) => ({
          izvorTankId: b.izvorTankId,
          izvorArhivaVinaId: b.izvorArhivaVinaId,
          nazivVina: b.nazivVina,
          sorta: b.sorta,
          kolicina: Number(b.kolicina),
          postotak: Number(b.postotak),
        })),
        noviSastav: ciljPoslije.udjeliSorti.map((u) => ({
          nazivSorte: u.nazivSorte,
          postotak: Number(u.postotak),
        })),
      };
      // Zadani Prismin timeout je 5 s. Pretok koji arhivira potroseni izvorni
      // tank to redovito probije, i to TIHO — transakcija se povuce natrag, a
      // korisnik vidi samo "Greska kod pretoka". Arhivski dio je preko 40 upita
      // s mreznom latencijom Supabase poolera.
      //   timeout 30 s — s rezervom za arhiviranje tanka s cijelom sezonom.
      //   maxWait  5 s — cekanje na slobodnu vezu iz poola PRIJE nego
      //                  transakcija pocne. Nije dio timeouta, ali JEST dio
      //                  trajanja funkcije, pa se drzi nisko.
    }, { timeout: 30_000, maxWait: 5_000 });

    return NextResponse.json({
      success: true,
      tipPretoka,
      noviSastav: rezultat.noviSastav,
      blendIzvori: rezultat.noviBlendIzvori,
      novoMjerenje,
      pretok: rezultat.pretok,
    });
  } catch (error) {
    console.error("Greška pretok:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Greška kod pretoka.",
      },
      { status: 500 }
    );
  }
}