/**
 * Arhiviranje potrosenog tanka i preusmjeravanje blend pokazivaca na arhivu.
 *
 * PREMJESTENO iz app/api/pretok/route.ts, doslovno — nijedna linija tijela nije
 * promijenjena. Razlog: motor u lib/pretok-motor.ts ih mora zvati, a lib ne
 * smije uvoziti iz app/.
 *
 * Da je rijec o premjestanju, a ne o prepisivanju, dokazuje
 * scripts/test-arhiviranje-baza.ts — njegove 123 tvrdnje moraju proci
 * nepromijenjene.
 *
 * NAPOMENA: app/api/izlaz-vina/route.ts ima svoj `arhivirajPrazanTank`, koji
 * radi isti posao drugim kodom. Spajanje te dvije funkcije je zaseban zahvat i
 * NIJE dio ovoga — do tada svaka izmjena arhiviranja mora ici u OBJE.
 */

import { Prisma } from "@prisma/client";
import { citajGranicuArhive, odGranice } from "./granica-arhive";

/**
 * Preusmjeri pokazivace s tanka na arhivu.
 *
 * Kad pretok isprazni izvorni tank, taj se tank arhivira i ODMAH je slobodan za
 * novo vino. Pokazivac `izvorTankId` tada vise ne vodi do vina od kojeg je
 * blend nastao nego do onoga sto u tom tanku bude sljedece — "Porijeklo vina"
 * na ciljnom tanku pokazuje tude vino. Zato pokazivac mora prijeci na arhivu,
 * koja je od tog trenutka jedino stabilno mjesto te povijesti.
 *
 * Cuvée grana to radi otpocetka (vidi `izvorArhivaVinaId = arhiva.id` nize);
 * obicni pretok nije, pa je ovo izjednacavanje.
 *
 * Prolazi kroz SVE stavke, ne samo kroz onu koja se sad prenosi: u ciljnom
 * blendu moze vec stajati stariji redak koji pokazuje na isti tank. I on je od
 * ovog trenutka kriv, a nakon preusmjeravanja se s novim spoji u jedan redak
 * (isti kljuc u `normalizirajBlendStavke`).
 */
export function preusmjeriNaArhivu<
  T extends { izvorTankId: string | null; izvorArhivaVinaId: string | null }
>(stavke: T[], izvorTankId: string, arhivaId: string | null): T[] {
  if (!arhivaId) return stavke;

  return stavke.map((s) =>
    s.izvorTankId === izvorTankId
      ? { ...s, izvorTankId: null, izvorArhivaVinaId: arhivaId }
      : s
  );
}

export async function arhivirajPotroseniTank(
  tx: Prisma.TransactionClient,
  tank: {
    id: string;
    broj: number;
    sorta: string | null;
    nazivVina: string | null;
    godiste: number | null;
    kapacitet: number;
    tip: string | null;
  },
  kolicinaZaArhivu: number,
  napomena?: string | null
) {
  // PRETHODNA arhiva ovog tanka. Nova nastaje tek nize (`arhivaVina.create`),
  // pa je ovdje jos nema — citamo crtu ispred koje je bilo prethodno vino.
  // U ovu arhivu smiju samo punjenja nastala OD te crte; starija vec pripadaju
  // svojoj arhivi i bez ovoga bi se, nakon faze 3, kopirala iznova pri svakom
  // sljedecem arhiviranju istog tanka.
  const granica = await citajGranicuArhive(tx, tank.id);

  const [mjerenja, zadaci, udjeliSorti, documents, punjenja] =
    await Promise.all([
      tx.mjerenje.findMany({
        where: { tankId: tank.id },
        orderBy: { izmjerenoAt: "asc" },
      }),
      tx.zadatak.findMany({
        where: { tankId: tank.id },
        include: {
          preparat: true,
          jedinica: true,
          izlaznaJedinica: true,
          zadaoKorisnik: true,
          izvrsioKorisnik: true,
          stavke: {
            include: {
              preparat: true,
              jedinica: true,
              izlaznaJedinica: true,
            },
            orderBy: {
              redoslijed: "asc",
            },
          },
        },
        orderBy: { zadanoAt: "asc" },
      }),
      tx.tankSortaUdio.findMany({
        where: { tankId: tank.id },
        orderBy: { postotak: "desc" },
      }),
      tx.document.findMany({
        where: { tankId: tank.id },
        orderBy: [{ datumDokumenta: "desc" }, { createdAt: "desc" }],
      }),
      tx.punjenjeTanka.findMany({
        where: { tankId: tank.id, createdAt: odGranice(granica) },
        include: {
          stavke: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { datumPunjenja: "asc" },
      }),
    ]);

  // Radnje i izlazi se dohvaćaju REDOM, ne u gornji Promise.all.
  //
  // Gornji `Promise.all` šalje pet upita istovremeno preko jedne veze
  // transakcije. `pg` to prijavljuje kao DeprecationWarning ("Calling
  // client.query() when the client is already executing a query") i najavljuje
  // da u pg@9 prestaje raditi. To je zatečeno ponašanje i ne dira se ovdje —
  // ali se NE širi: dva nova upita idu redom, pa izmjena ne dodaje ništa
  // onome što će se ionako morati prepisati.
  const radnje = await tx.radnja.findMany({
    where: { tankId: tank.id },
    include: {
      korisnik: { select: { ime: true, email: true } },
      preparat: { select: { naziv: true } },
      jedinica: { select: { naziv: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const izlazi = await tx.izlazVina.findMany({
    where: { tankId: tank.id },
    orderBy: { datum: "asc" },
  });

  const arhiva = await tx.arhivaVina.create({
    data: {
      tankId: tank.id,
      brojTanka: tank.broj,
      sorta: tank.sorta,
      nazivVina: tank.nazivVina,
      godiste: tank.godiste,
      kolicinaVina: kolicinaZaArhivu,
      kapacitetTanka: tank.kapacitet,
      tipTanka: tank.tip,
      tipArhive: "PRIVREMENA",
      napomena:
        napomena?.trim() || "Automatski arhivirano nakon pretoka/cuvéea.",
    },
  });

  if (udjeliSorti.length > 0) {
    await tx.arhivaVinaUdioSorte.createMany({
      data: udjeliSorti.map((u) => ({
        arhivaVinaId: arhiva.id,
        izvorniUdioSorteId: u.id,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });
  }

  if (mjerenja.length > 0) {
    await tx.arhivaVinaMjerenje.createMany({
      data: mjerenja.map((m) => ({
        arhivaVinaId: arhiva.id,
        izvornoMjerenjeId: m.id,
        tankId: m.tankId,
        korisnikId: m.korisnikId,
        alkohol: m.alkohol,
        ukupneKiseline: m.ukupneKiseline,
        hlapiveKiseline: m.hlapiveKiseline,
        slobodniSO2: m.slobodniSO2,
        ukupniSO2: m.ukupniSO2,
        secer: m.secer,
        ph: m.ph,
        temperatura: m.temperatura,
        bentotestDatum: m.bentotestDatum,
        bentotestStatus: m.bentotestStatus,
        napomena: m.napomena,
        izmjerenoAt: m.izmjerenoAt,
      })),
    });
  }

  if (zadaci.length > 0) {
    for (const z of zadaci) {
      const arhivaZadatak = await tx.arhivaVinaZadatak.create({
        data: {
          arhivaVinaId: arhiva.id,
          izvorniZadatakId: z.id,
          tankId: z.tankId,
          vrsta: z.vrsta,
          status: z.status,
          naslov: z.naslov,
          napomena: z.napomena,
          doza: z.doza,
          volumenUTanku: z.volumenUTanku,
          izracunataKolicina: z.izracunataKolicina,
          preparatId: z.preparatId,
          preparatNaziv: z.preparat?.naziv ?? null,
          jedinicaId: z.jedinicaId,
          jedinicaNaziv: z.jedinica?.naziv ?? null,
          izlaznaJedinicaId: z.izlaznaJedinicaId,
          izlaznaJedinicaNaziv: z.izlaznaJedinica?.naziv ?? null,
          zadaoKorisnikId: z.zadaoKorisnikId,
          zadaoKorisnikIme: z.zadaoKorisnik?.ime ?? null,
          izvrsioKorisnikId: z.izvrsioKorisnikId,
          izvrsioKorisnikIme: z.izvrsioKorisnik?.ime ?? null,
          zadanoAt: z.zadanoAt,
          izvrsenoAt: z.izvrsenoAt,
        },
      });

      if (z.stavke && z.stavke.length > 0) {
        await tx.arhivaVinaZadatakStavka.createMany({
          data: z.stavke.map((s) => ({
            arhivaZadatakId: arhivaZadatak.id,
            preparatId: s.preparatId ?? null,
            preparatNaziv: s.preparat?.naziv ?? null,
            doza: s.doza,
            volumenUTanku: s.volumenUTanku,
            izracunataKolicina: s.izracunataKolicina,
            jedinicaId: s.jedinicaId ?? null,
            jedinicaNaziv: s.jedinica?.naziv ?? null,
            izlaznaJedinicaId: s.izlaznaJedinicaId ?? null,
            izlaznaJedinicaNaziv: s.izlaznaJedinica?.naziv ?? null,
            redoslijed: s.redoslijed ?? 0,
          })),
        });
      }
    }
  }

  if (documents.length > 0) {
    await tx.arhivaVinaDokument.createMany({
      data: documents.map((d) => ({
        arhivaVinaId: arhiva.id,
        vrsta: d.vrsta,
        naziv: d.naziv,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        datumDokumenta: d.datumDokumenta,
        napomena: d.napomena,
        uploadedByUserId: d.uploadedByUserId,
        uploadedByIme: d.uploadedByIme,
      })),
    });
  }

  // PUNJENJA U ARHIVU.
  //
  // Ovo je bio zatecen gubitak podataka, ne propust u prikazu: punjenja su se
  // dohvacala gore (`punjenja` u istom Promise.all) i nikad upisivala, a
  // originali su se nize brisali. Svaki pretok koji je ispraznio tank trajno je
  // unistio zapis berbe — parcelu, vinograd, oznaku berbe, kilograme grozdja i
  // secer/kiseline/pH berbe. Isti blok vec radi u izlaz-vina putu
  // (`arhivirajPrazanTank`), samo ovdje nikad nije napisan.
  //
  // Petlja po punjenju, ne createMany: stavke se pisu ugnijezdjeno, pa je jedan
  // create po punjenju. Tank ih u praksi ima jedno do dva.
  for (const p of punjenja) {
    await tx.arhivaPunjenjeTanka.create({
      data: {
        arhivaVinaId: arhiva.id,
        izvornoPunjenjeId: p.id,
        nazivVina: p.nazivVina,
        datumPunjenja: p.datumPunjenja,
        napomena: p.napomena,
        opis: p.opis,
        ukupnoLitara: p.ukupnoLitara,
        ukupnoKgGrozdja: p.ukupnoKgGrozdja,
        pocetnoMjerenjeId: p.pocetnoMjerenjeId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        stavke: {
          create: p.stavke.map((s) => ({
            izvornaPunjenjeStavkaId: s.id,
            nazivSorte: s.nazivSorte,
            sortaId: s.sortaId,
            opis: s.opis,
            kolicinaKgGrozdja: s.kolicinaKgGrozdja,
            kolicinaLitara: s.kolicinaLitara,
            datumBerbe: s.datumBerbe,
            godinaBerbe: s.godinaBerbe,
            polozaj: s.polozaj,
            parcela: s.parcela,
            vinograd: s.vinograd,
            oznakaBerbe: s.oznakaBerbe,
            secer: s.secer,
            kiseline: s.kiseline,
            ph: s.ph,
            napomenaBerbe: s.napomenaBerbe,
            // Maceracija se do 24.08.2026. NIJE kopirala — arhivska tablica
            // nije imala te stupce, pa je arhiviranje (koje original brise
            // nize, :358-368) tvrdnju o maceraciji trajno unistavalo.
            // Prenosi se doslovno, ukljucujuci NULL: null i false nisu isto.
            maceracija: s.maceracija,
            maceracijaSati: s.maceracijaSati,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
        },
      },
    });
  }

  // RADNJE I IZLAZI U ARHIVU — SAMO KOPIJA, ORIGINALI OSTAJU.
  //
  // Namjerno se NE brišu. `POST /api/pretok/undo` vraća tankove po
  // snapshotovima i briše pretok, ali `ArhivaVina` ne dira — dakle poništavanje
  // ne vraća ništa što je otišlo u arhivu. Dok je tako, brisanje originala je
  // tihi gubitak. Monitor tanka od granice arhive ionako ne prikazuje starije
  // radnje i izlaze, pa se na ekranu ništa ne dvostruči.
  //
  // `izvorniZadatakId` se sprema OVDJE, a ne u snapshot pretoka: veza
  // radnja→zadatak pripada vinu, ne pretoku, pa mora preživjeti i brisanje
  // pretoka. Bez nje se gubi zauvijek — `Radnja.zadatak` je opcijska relacija
  // bez `onDelete`, pa Prisma na brisanju zadatka postavi `zadatakId` na NULL.
  if (radnje.length > 0) {
    await tx.arhivaVinaRadnja.createMany({
      data: radnje.map((r) => ({
        arhivaVinaId: arhiva.id,
        izvornaRadnjaId: r.id,
        izvorniZadatakId: r.zadatakId,
        tankId: tank.id,
        vrsta: r.vrsta,
        opis: r.opis,
        napomena: r.napomena,
        preparatId: r.preparatId,
        preparatNaziv: r.preparat?.naziv ?? null,
        jedinicaId: r.jedinicaId,
        jedinicaNaziv: r.jedinica?.naziv ?? null,
        kolicina: r.kolicina,
        korisnikId: r.korisnikId,
        korisnikIme: r.korisnik?.ime ?? r.korisnik?.email ?? null,
        createdAt: r.createdAt,
      })),
    });
  }

  if (izlazi.length > 0) {
    await tx.arhivaVinaIzlaz.createMany({
      data: izlazi.map((i) => ({
        arhivaVinaId: arhiva.id,
        izvorniIzlazId: i.id,
        tankId: tank.id,
        tip: i.tip,
        datum: i.datum,
        kolicinaLitara: i.kolicinaLitara,
        brojBoca: i.brojBoca,
        volumenBoce: i.volumenBoce,
        napomena: i.napomena,
        createdAt: i.createdAt,
      })),
    });
  }

  await tx.mjerenje.deleteMany({ where: { tankId: tank.id } });
  await tx.zadatak.deleteMany({ where: { tankId: tank.id } });
  await tx.tankSortaUdio.deleteMany({ where: { tankId: tank.id } });
  await tx.document.deleteMany({ where: { tankId: tank.id } });
  // `izlazVina.deleteMany` je maknut. Prije je brisao izlaze bez ikakve kopije,
  // pa je na tanku ostajala samo `Radnja` o prodaji, a zapisa o izlazu vina
  // nije bilo — zatečeno na tanku 16 ("Prodano rinfuza 1.000 L", nula izlaza).
  // Sada izlaz i njegova radnja idu u arhivu zajedno, a originali ostaju.

  await tx.punjenjeStavka.deleteMany({
    where: {
      punjenje: {
        tankId: tank.id,
      },
    },
  });

  await tx.punjenjeTanka.deleteMany({
    where: { tankId: tank.id },
  });

  await tx.blendIzvor.deleteMany({
    where: { ciljTankId: tank.id },
  });

  await tx.tank.update({
    where: { id: tank.id },
    data: {
      kolicinaVinaUTanku: 0,
      sorta: null,
      nazivVina: null,
      godiste: null,
    },
  });

  return arhiva;
}
