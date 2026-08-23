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

    if (!ciljTankId || !Array.isArray(body?.izvori) || body.izvori.length === 0) {
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

    if (izvori.some((i) => i.tankId === ciljTankId)) {
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

    const ciljTank = await prisma.tank.findUnique({
      where: { id: ciljTankId },
      include: {
        udjeliSorti: {
          orderBy: { postotak: "desc" },
        },
        blendIzvori: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ciljTank) {
      return NextResponse.json(
        { error: "Ciljni tank nije pronađen." },
        { status: 404 }
      );
    }

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

    if (tipPretoka === TipPretokaDb.OBICNI) {
      const sourceTank = sourceTankovi[0];
      const ciljImaVino = Number(ciljTank.kolicinaVinaUTanku ?? 0) > 0;

      if (ciljImaVino) {
        const istaSorta =
          (ciljTank.sorta ?? "").trim() === (sourceTank.sorta ?? "").trim();

        const istiNaziv =
          (ciljTank.nazivVina ?? "").trim() ===
          (sourceTank.nazivVina ?? "").trim();

        if (!istaSorta || !istiNaziv) {
          return NextResponse.json(
            {
              error:
                "Ciljni tank već sadrži drugo vino. Za ovakvo spajanje koristi 'Novo vino – cuvée' ili 'Novo vino – ista sorta'.",
            },
            { status: 400 }
          );
        }
      }
    }

    const vrijednostiCilja = await dohvatiVrijednostiZaTank(ciljTankId);
    const vrijednostiIzvora = await Promise.all(
      izvori.map((i) => dohvatiVrijednostiZaTank(i.tankId))
    );

    const trenutnoUCilju = Number(ciljTank.kolicinaVinaUTanku ?? 0);
    const ukupnoDodano = izvori.reduce((sum, i) => sum + Number(i.kolicina), 0);

    const weightedInputs: MjerenjeWeighted[] = [];

    // Podrijetlo svakog polja koje je stvarno uslo u prosjek — sluzi napomeni
    // da rezultat ne izgleda kao jedno mjerenje uzeto u jednom trenutku.
    const koristenaPodrijetla: IzvorPolja[] = [];

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

      weightedInputs.push({
        kolicina: Number(izvor.kolicina),
        ...v.vrijednosti,
      });
      koristenaPodrijetla.push(v.izvorPolja);
    });

    const novoMjerenje = {
      alkohol: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.alkohol }))
      ),
      ukupneKiseline: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.ukupneKiseline,
        }))
      ),
      hlapiveKiseline: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.hlapiveKiseline,
        }))
      ),
      slobodniSO2: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.slobodniSO2,
        }))
      ),
      ukupniSO2: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.ukupniSO2,
        }))
      ),
      secer: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.secer }))
      ),
      ph: weightedAverage(
        weightedInputs.map((x) => ({ kolicina: x.kolicina, value: x.ph }))
      ),
      temperatura: weightedAverage(
        weightedInputs.map((x) => ({
          kolicina: x.kolicina,
          value: x.temperatura,
        }))
      ),
    };

    // Prenosi li ovaj pretok ijedan parametar? Ako izvori (i zateceni sadrzaj
    // cilja) nemaju nijednu upisanu vrijednost, ponderiranje vrati osam nulla i
    // upis bi bio lazan zapis "izmjereno" bez ijednog izmjerenog podatka. Takav
    // redak k tome postaje NAJNOVIJE mjerenje ciljnog tanka, pa ga svaki iduci
    // pretok uzme kao polaznu vrijednost i praznina se siri dalje.
    //
    // Isti guard filtracija ima od faze 3A (lib/filtracija.ts:1057 i :1252);
    // pretok ga nije imao, pa je u bazi ostavio 2 posve prazna mjerenja.
    // `jeMjerenjePrazno` se UVOZI iz lib/filtracija.ts — nema druge kopije.
    const parametriPreneseni = !jeMjerenjePrazno(novoMjerenje);

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
          ciljTankId,
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
          ciljevi: {
            create: [
              {
                tankId: ciljTankId,
                kolicina: ukupnoDodano,
                redoslijed: 0,
              },
            ],
          },
        },
        include: {
          izvori: true,
        },
      });

      await spremiSnapshotTanka(
        tx,
        pretok.id,
        {
          id: ciljTank.id,
          broj: ciljTank.broj,
          kapacitet: ciljTank.kapacitet,
          kolicinaVinaUTanku: ciljTank.kolicinaVinaUTanku,
          tip: ciljTank.tip,
          opis: ciljTank.opis,
          sorta: ciljTank.sorta,
          nazivVina: ciljTank.nazivVina,
          godiste: ciljTank.godiste,
          udjeliSorti: ciljTank.udjeliSorti.map((u) => ({
            nazivSorte: u.nazivSorte,
            postotak: u.postotak,
          })),
          blendIzvori: ciljTank.blendIzvori.map((b) => ({
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
        // Forma jos salje jedan cilj; motor ih prima vise od faze 4. Prosirenje
        // forme na N→M je faza 5e.
        ciljevi: [{ tankId: ciljTankId, kolicina: ukupnoDodano }],
        vrsta:
          tipPretoka === TipPretokaDb.CUVEE
            ? "CUVEE"
            : tipPretoka === TipPretokaDb.BLEND_ISTE_SORTE
            ? "ISTA_SORTA"
            : "OBICNI",
        // Nacin jos ne dolazi iz forme — dodaje ga faza 5e. Do tada "BEZ", sto
        // je i istina za sve dosadasnje pretoke.
        nacin: "BEZ",
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
      if (parametriPreneseni) {
        const createdMjerenje = await tx.mjerenje.create({
          data: {
            tankId: ciljTankId,
            korisnikId: null,
            alkohol: novoMjerenje.alkohol,
            ukupneKiseline: novoMjerenje.ukupneKiseline,
            hlapiveKiseline: novoMjerenje.hlapiveKiseline,
            slobodniSO2: novoMjerenje.slobodniSO2,
            ukupniSO2: novoMjerenje.ukupniSO2,
            secer: novoMjerenje.secer,
            ph: novoMjerenje.ph,
            temperatura: novoMjerenje.temperatura,
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
            tankId: ciljTankId,
          },
        });
      }

      // Sastav i blend se citaju IZ BAZE, ne racunaju napamet — odgovor tako
      // ne moze tvrditi nesto drugo od onoga sto je upisano.
      const ciljPoslije = await tx.tank.findUniqueOrThrow({
        where: { id: ciljTankId },
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