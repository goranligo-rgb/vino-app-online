export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";
import { uMl } from "@/lib/filtracija";
import { pocetnoMjerenjeIzStavki } from "@/lib/berba-polja";
import { BerbaGreska, zabiljeziUlazUVise } from "@/lib/berba-knjiga";

// Tko smije UPISATI punjenje. Isti popis koji proxy.ts pusta na stranicu
// /punjenje — proxy stiti samo stranice, pa svaka ruta mora sama provjeriti
// rolu. GET se namjerno NE zakljucava: cita ga i /berba.
const ROLE_UPIS_PUNJENJA = ["ADMIN", "PODRUM"] as const;

function ocistiString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function brojIliNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Samo PRAVI boolean prolazi; sve ostalo (undefined, null, "", 0, "false")
 * postaje null.
 *
 * Zasto tako strogo: NULL znaci "nije se pitalo" i razlikuje se od false
 * ("izricito nije bilo"). Da se ovdje radio Boolean(v), nedirnuta kvacica bi
 * stigla kao false i 11 zatecenih stavki bi tiho dobilo tvrdnju koju nitko
 * nije izgovorio. Vidi prisma/schema.prisma i migraciju
 * 20260823_maceracija_na_punjenju.
 */
function booleanIliNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function datumIliNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  try {
    const punjenjaRaw = await prisma.punjenjeTanka.findMany({
      orderBy: {
        datumPunjenja: "desc",
      },
      include: {
        tank: {
          select: {
            id: true,
            broj: true,
            tip: true,
          },
        },
        stavke: {
          where: {
            obrisano: false,
          },
          orderBy: {
            createdAt: "asc",
          },
          include: {
            sorta: true,
          },
        },
        pocetnoMjerenje: true,
      },
    });

    const punjenja = punjenjaRaw.map((p) => {
      const ukupnoLitara = p.stavke.reduce(
        (sum, s) => sum + Number(s.kolicinaLitara || 0),
        0
      );

      const ukupnoKgGrozdja = p.stavke.reduce(
        (sum, s) => sum + Number(s.kolicinaKgGrozdja || 0),
        0
      );

      return {
        ...p,
        ukupnoLitara,
        ukupnoKgGrozdja,
      };
    });

    return NextResponse.json(punjenja);
  } catch (error) {
    console.error("Greška kod dohvaćanja punjenja:", error);
    return NextResponse.json(
      { error: "Dogodila se greška kod dohvaćanja punjenja." },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// BERBA U VISE TANKOVA — oblik zahtjeva
//
// Jedna berba (jedno grozdje, jedan polozaj, ubrano jednom) cesto ide u dva
// ili vise tankova: samotok u jedan, presovina u drugi, ili jednostavno ne
// stane u jedan. To je JEDNA berba, ne dvije.
//
// Zato podjela stoji NA STAVCI, ne na punjenju:
//
//   { tankId, stavke: [ { ..., tankovi: [ { tankId, litre }, ... ] } ] }
//
// `stavke[].tankovi` je NEOBAVEZAN. Kad ga nema, stavka cijela ide u
// `body.tankId` — tocno kao dosad, isti put, ista provjera. Forma koja jos ne
// zna za vise tankova nastavlja raditi bez ijedne izmjene.
//
// Zasto na stavci a ne na punjenju: kad se u jednom cinu upisuju dvije sorte,
// podjela na razini punjenja bi svaku morala razmjerno razliti u sve tankove,
// pa bi u svakom zavrsila mjesavina. Samotok i presovina bas to ne zele.
// ---------------------------------------------------------------------------

/** Koliko litara jedne stavke ide u koji tank. */
export type Odrediste = {
  tankId: string;
  litre: number;
  ml: number;
};

export type CistaStavka = {
  /**
   * Id se dodjeljuje OVDJE, prije upisa, da se zna koja je stavka postala
   * koja berba. Bez toga bi se veza `Berba.izvornaPunjenjeStavkaId` morala
   * pogadjati iz redoslijeda koji Prisma pri `include` ne jamci — a ta veza
   * je jedino po cemu se poslije zna koja je stavka koji zapis berbe.
   *
   * Kad berba ide u vise tankova, svaki tank dobiva SVOJ redak
   * `PunjenjeStavka` (jer svaki tank dobiva svoje `PunjenjeTanka`), pa ovdje
   * stoji po jedan id za svaki tank: `tankId -> PunjenjeStavka.id`.
   */
  redakPoTanku: Map<string, string>;
  odredista: Odrediste[];
  sortaId: string | null;
  nazivSorte: string;
  opis: string | null;
  kolicinaKgGrozdja: number | null;
  kolicinaLitara: number;
  datumBerbe: Date | null;
  godinaBerbe: number | null;
  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
  secer: number | null;
  kiseline: number | null;
  ph: number | null;
  napomenaBerbe: string | null;
  maceracija: boolean | null;
  maceracijaSati: number | null;
};

/** Greska u zahtjevu koja ima poruku pisanu za korisnika. */
export class ZahtjevGreska extends Error {}

/**
 * Odredista jedne stavke: iz `stavke[].tankovi`, ili cijela stavka u zadani
 * tank kad tog polja nema.
 *
 * Zbroj po tankovima MORA biti tocno jednak kolicini stavke. Usporedjuje se u
 * cijelim mililitrima, ne u litrama — 1800.1 + 1199.9 u pokretnom zarezu nije
 * uvijek tocno 3000, a knjiga ionako racuna u mililitrima (lib/filtracija.ts).
 */
export function procitajOdredista(
  s: any,
  kolicinaLitara: number,
  zadaniTankId: string | null,
  redniBroj: number
): Odrediste[] {
  const popis = Array.isArray(s?.tankovi) ? s.tankovi : null;

  if (!popis || popis.length === 0) {
    if (!zadaniTankId) {
      throw new ZahtjevGreska("Tank je obavezan.");
    }

    return [
      { tankId: zadaniTankId, litre: kolicinaLitara, ml: uMl(kolicinaLitara) },
    ];
  }

  const odredista: Odrediste[] = popis.map((o: any, i: number) => {
    const tankId = ocistiString(o?.tankId);

    if (!tankId) {
      throw new ZahtjevGreska(
        `${redniBroj}. stavka: nedostaje tank na ${i + 1}. retku.`
      );
    }

    const litre = Number(o?.litre);

    if (!Number.isFinite(litre) || litre <= 0) {
      throw new ZahtjevGreska(
        `${redniBroj}. stavka: litre za ${i + 1}. tank moraju biti veće od nule.`
      );
    }

    return { tankId, litre, ml: uMl(litre) };
  });

  if (new Set(odredista.map((o) => o.tankId)).size !== odredista.length) {
    throw new ZahtjevGreska(
      `${redniBroj}. stavka: isti tank je naveden više puta. Spoji ga u jedan redak.`
    );
  }

  const zbrojMl = odredista.reduce((z, o) => z + o.ml, 0);
  const ukupnoMl = uMl(kolicinaLitara);

  if (zbrojMl !== ukupnoMl) {
    throw new ZahtjevGreska(
      `${redniBroj}. stavka: zbroj po tankovima je ${zbrojMl / 1000} L, ` +
        `a ukupna količina je ${kolicinaLitara} L. Moraju biti jednaki.`
    );
  }

  return odredista;
}

/** Sto od koje stavke ulazi u zadani tank, redoslijedom stavki. */
export type RedakTanka = {
  s: CistaStavka;
  o: Odrediste;
  /**
   * Je li ovo PRVI tank te stavke. Prvi tank nosi kilograme — ubrano je
   * jednom, s jednog polozaja, pa se ne dijele ni ne ponavljaju.
   */
  prvi: boolean;
};

export function stavkeZaTank(
  cisteStavke: CistaStavka[],
  tid: string
): RedakTanka[] {
  const popis: RedakTanka[] = [];

  for (const s of cisteStavke) {
    const o = s.odredista.find((x) => x.tankId === tid);
    if (!o) continue;
    popis.push({ s, o, prvi: s.odredista[0].tankId === tid });
  }

  return popis;
}

/**
 * Svi tankovi u koje ista ulazi, redoslijedom PRVOG pojavljivanja.
 *
 * Taj redoslijed nije kozmeticki: on odlucuje sto je "prvi tank" — a prvi
 * tank nosi kilograme, drzi zatecenu vezu `Berba.izvornaPunjenjeStavkaId`, i
 * njegovo punjenje je ono na koje se veze knjiga.
 */
export function tankoviRedom(cisteStavke: CistaStavka[]): string[] {
  const popis: string[] = [];

  for (const s of cisteStavke) {
    for (const o of s.odredista) {
      if (!popis.includes(o.tankId)) popis.push(o.tankId);
    }
  }

  return popis;
}

export async function POST(req: Request) {
  try {
    // Korisnik se cita SA SERVERA, ne iz body-ja. Kolacic je potpisan i
    // httpOnly pa ga klijent ne vidi, a `korisnikId` poslan s klijenta bio bi
    // krivotvorljiv. Isti obrazac kao app/api/izlaz-vina/route.ts:290.
    //
    // Prije ovoga ruta nije trazila prijavu uopce, pa `korisnikId` nikad nije
    // stigao — zbog cega punjenje NIJE ostavljalo `Radnja`.
    const user = await citajSesiju();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Niste prijavljeni." },
        { status: 401 }
      );
    }

    if (
      !ROLE_UPIS_PUNJENJA.includes(
        user.role as (typeof ROLE_UPIS_PUNJENJA)[number]
      )
    ) {
      return NextResponse.json(
        { error: "Nemate pravo upisa punjenja." },
        { status: 403 }
      );
    }

    const korisnikId = user.id;

    const body = await req.json();

    const tankId = ocistiString(body.tankId);
    const nazivVina = ocistiString(body.nazivVina);
    const napomena = ocistiString(body.napomena);
    const opis = ocistiString(body.opis);

    const datumPunjenja = datumIliNull(body.datumPunjenja) ?? new Date();
    const stavke = Array.isArray(body.stavke) ? body.stavke : [];
    const pocetnoMjerenje =
      body.pocetnoMjerenje && typeof body.pocetnoMjerenje === "object"
        ? body.pocetnoMjerenje
        : null;

    if (stavke.length === 0) {
      return NextResponse.json(
        { error: "Mora postojati barem jedna stavka punjenja." },
        { status: 400 }
      );
    }

    const cisteStavke: CistaStavka[] = [];

    let redniBroj = 0;

    for (const s of stavke) {
      redniBroj++;

      const sortaId = ocistiString(s.sortaId);
      const polozaj = ocistiString(s.polozaj);
      const parcela = ocistiString(s.parcela);
      const vinograd = ocistiString(s.vinograd);
      const oznakaBerbe = ocistiString(s.oznakaBerbe);
      const opisStavke = ocistiString(s.opis);
      const napomenaBerbe = ocistiString(s.napomenaBerbe);

      const datumBerbe = datumIliNull(s.datumBerbe);
      const godinaBerbe = brojIliNull(s.godinaBerbe);
      const kg = brojIliNull(s.kolicinaKgGrozdja);
      const litara = Number(s.kolicinaLitara);
      const secer = brojIliNull(s.secer);
      const kiseline = brojIliNull(s.kiseline);
      const ph = brojIliNull(s.ph);

      const maceracija = booleanIliNull(s.maceracija);
      // Sati bez potvrdjene maceracije nisu podatak nego smece: broj bez
      // tvrdnje uz koju pripada. Forma ih vec ne salje, ovo je drugi pojas.
      const maceracijaSati =
        maceracija === true ? brojIliNull(s.maceracijaSati) : null;

      let nazivSorte = ocistiString(s.nazivSorte) ?? "";

      if (sortaId) {
        const sorta = await prisma.sorta.findUnique({
          where: { id: sortaId },
        });

        if (!sorta) {
          return NextResponse.json(
            { error: "Odabrana sorta ne postoji." },
            { status: 400 }
          );
        }

        nazivSorte = sorta.naziv;
      }

      if (!nazivSorte) {
        return NextResponse.json(
          { error: "Svaka stavka mora imati sortu." },
          { status: 400 }
        );
      }

      // Kolicina se provjerava PRIJE odredista: podjela nema smisla dok se ne
      // zna sto se dijeli, a poruka o zbroju bi bila zbunjujuca.
      if (!Number.isFinite(litara) || litara <= 0) {
        return NextResponse.json(
          { error: "Neispravne stavke punjenja." },
          { status: 400 }
        );
      }

      const odredista = procitajOdredista(s, litara, tankId, redniBroj);

      cisteStavke.push({
        redakPoTanku: new Map(odredista.map((o) => [o.tankId, randomUUID()])),
        odredista,
        sortaId,
        nazivSorte,
        opis: opisStavke,
        kolicinaKgGrozdja: kg,
        kolicinaLitara: litara,
        datumBerbe,
        godinaBerbe,
        polozaj,
        parcela,
        vinograd,
        oznakaBerbe,
        secer,
        kiseline,
        ph,
        napomenaBerbe,
        maceracija,
        maceracijaSati,
      });
    }

    const neispravne = cisteStavke.some(
      (s) =>
        !s.nazivSorte ||
        !Number.isFinite(s.kolicinaLitara) ||
        s.kolicinaLitara <= 0 ||
        (s.kolicinaKgGrozdja !== null &&
          (!Number.isFinite(s.kolicinaKgGrozdja) || s.kolicinaKgGrozdja < 0))
    );

    if (neispravne) {
      return NextResponse.json(
        { error: "Neispravne stavke punjenja." },
        { status: 400 }
      );
    }

    const sviTankIds = tankoviRedom(cisteStavke);

    const tankovi = await prisma.tank.findMany({
      where: { id: { in: sviTankIds } },
      include: { udjeliSorti: true },
    });

    const tankPoId = new Map(tankovi.map((t) => [t.id, t]));

    const nepostojeci = sviTankIds.filter((id) => !tankPoId.has(id));

    if (nepostojeci.length > 0) {
      return NextResponse.json(
        {
          error:
            nepostojeci.length === sviTankIds.length
              ? "Odabrani tank ne postoji."
              : "Jedan od odabranih tankova ne postoji.",
        },
        { status: 404 }
      );
    }

    // Provjera kapaciteta ide PO TANKU. Dosad je bila jedna, nad jednim
    // tankom; s podjelom bi zbroj svih litara nad jednim tankom bio besmislen
    // — svaki tank prima samo svoj dio, i samo svoj dio mora stati.
    for (const tid of sviTankIds) {
      const tank = tankPoId.get(tid)!;
      const ulazi = stavkeZaTank(cisteStavke, tid).reduce(
        (z, x) => z + x.o.litre,
        0
      );
      const trenutno = Number(tank.kolicinaVinaUTanku ?? 0);
      const slobodno = Number(tank.kapacitet) - trenutno;

      if (ulazi > slobodno) {
        return NextResponse.json(
          {
            error:
              `Tank ${tank.broj}: trenutno je u njemu ${trenutno} L, slobodno je još ` +
              `${slobodno} L, a pokušavaš upisati ${ulazi} L.`,
          },
          { status: 400 }
        );
      }
    }

    /**
     * Dodatna polja mjerenja — ona koja NE ovise o tome u koji je tank vino
     * otislo. Forma ih danas ne salje, ali ruta ih od pocetka prima; kad
     * stignu, idu na svaki tank nepromijenjena.
     */
    const dodatnaMjerenja = {
      alkohol: brojIliNull(pocetnoMjerenje?.alkohol),
      hlapiveKiseline: brojIliNull(pocetnoMjerenje?.hlapiveKiseline),
      slobodniSO2: brojIliNull(pocetnoMjerenje?.slobodniSO2),
      ukupniSO2: brojIliNull(pocetnoMjerenje?.ukupniSO2),
      temperatura: brojIliNull(pocetnoMjerenje?.temperatura),
      bentotestDatum: datumIliNull(pocetnoMjerenje?.bentotestDatum),
      bentotestStatus: ocistiString(pocetnoMjerenje?.bentotestStatus),
      napomena: ocistiString(pocetnoMjerenje?.napomena),
    };

    const viseTankova = sviTankIds.length > 1;

    /**
     * Pocetno mjerenje ZA JEDAN TANK.
     *
     * Jedan tank: uzima se tocno ono sto je forma poslala — nepromijenjen
     * put, da svakodnevni slucaj ostane bit po bit isti.
     *
     * Vise tankova: `Mjerenje.tankId` je NOT NULL s FK, pa jedno mjerenje ne
     * moze pripadati dvama tankovima. Dijeljeni zapis bi nosio tank prvoga i
     * monitor drugoga ga nikad ne bi pokazao. Zato svaki tank dobiva svoje,
     * izracunato iz stavki koje su BAS U NJEGA usle — istom funkcijom kojom
     * ga racuna i forma (lib/berba-polja.ts), pa je ponderiranje isto. Kad u
     * tank ide jedna stavka, to je tocno njezin secer/kiseline/pH.
     */
    function mjerenjeZaTank(tid: string) {
      const izvedeno = viseTankova
        ? pocetnoMjerenjeIzStavki(
            stavkeZaTank(cisteStavke, tid).map((x) => ({
              kolicinaLitara: x.o.litre,
              secer: x.s.secer,
              kiseline: x.s.kiseline,
              ph: x.s.ph,
              datumBerbe: x.s.datumBerbe
                ? x.s.datumBerbe.toISOString().slice(0, 10)
                : null,
            })),
            datumPunjenja.toISOString()
          )
        : pocetnoMjerenje
          ? {
              secer: brojIliNull(pocetnoMjerenje.secer),
              ukupneKiseline: brojIliNull(pocetnoMjerenje.ukupneKiseline),
              ph: brojIliNull(pocetnoMjerenje.ph),
              izmjerenoAt: pocetnoMjerenje.izmjerenoAt,
            }
          : null;

      const polja = {
        alkohol: dodatnaMjerenja.alkohol,
        ukupneKiseline: izvedeno?.ukupneKiseline ?? null,
        hlapiveKiseline: dodatnaMjerenja.hlapiveKiseline,
        slobodniSO2: dodatnaMjerenja.slobodniSO2,
        ukupniSO2: dodatnaMjerenja.ukupniSO2,
        secer: izvedeno?.secer ?? null,
        ph: izvedeno?.ph ?? null,
        temperatura: dodatnaMjerenja.temperatura,
        bentotestDatum: dodatnaMjerenja.bentotestDatum,
        bentotestStatus: dodatnaMjerenja.bentotestStatus,
        napomena: dodatnaMjerenja.napomena,
        izmjerenoAt: datumIliNull(izvedeno?.izmjerenoAt) ?? datumPunjenja,
      };

      // Isti uvjet kao dosad: dovoljno je da JEDNO polje ima vrijednost.
      const ima = [
        polja.alkohol,
        polja.ukupneKiseline,
        polja.hlapiveKiseline,
        polja.slobodniSO2,
        polja.ukupniSO2,
        polja.secer,
        polja.ph,
        polja.temperatura,
        polja.bentotestStatus,
        polja.napomena,
      ].some((v) => v !== null && v !== undefined && v !== "");

      return ima ? polja : null;
    }

    // Oznaka koja povezuje punjenja nastala OVIM spremanjem. Bez nje bi se iz
    // baze vidjela dva punjenja ondje gdje je covjek napravio jedan potez.
    const grupaId = randomUUID();

    const rezultat = await prisma.$transaction(
      async (tx) => {
        const stvorena: any[] = [];

        // Petlja po tankovima. Sekvencijalno, ne Promise.all — jedna
        // transakcijska veza (lib/paralelno.ts).
        for (const tid of sviTankIds) {
          const tank = tankPoId.get(tid)!;
          const zaTank = stavkeZaTank(cisteStavke, tid);

          const ukupnoLitara = zaTank.reduce((z, x) => z + x.o.litre, 0);

          // Kilogrami idu SAMO na prvi tank te stavke. Ubrano je jednom, s
          // jednog polozaja — dijeljenje bi izmislilo vaganje kojeg nije bilo, a
          // upis punog iznosa na svaki tank bi ih u godisnjem zbroju udvostrucio.
          const ukupnoKgGrozdja = zaTank.reduce(
            (z, x) => z + (x.prvi ? (x.s.kolicinaKgGrozdja ?? 0) : 0),
            0
          );

          const trenutnoUTanku = Number(tank.kolicinaVinaUTanku ?? 0);

          let createdMjerenjeId: string | null = null;
          const polja = mjerenjeZaTank(tid);

          if (polja) {
            const createdMjerenje = await tx.mjerenje.create({
              data: {
                tankId: tid,
                korisnikId:
                  ocistiString(pocetnoMjerenje?.korisnikId) ?? korisnikId,
                ...polja,
              },
            });

            createdMjerenjeId = createdMjerenje.id;
          }

          const prethodniSastavJson =
            tank.udjeliSorti && tank.udjeliSorti.length > 0
              ? tank.udjeliSorti.map((u) => ({
                  nazivSorte: u.nazivSorte,
                  postotak: u.postotak,
                }))
              : [];

          const created = await tx.punjenjeTanka.create({
            data: {
              tankId: tid,
              grupaId,
              // Tko je punio. Ruta vec cita sesiju; dosad je korisnik zavrsavao
              // samo na pripadnoj Radnja, pa se iz samog punjenja nije znalo tko
              // ga je napravio.
              korisnikId,
              nazivVina,
              datumPunjenja,
              napomena,
              opis,
              ukupnoLitara,
              ukupnoKgGrozdja,
              pocetnoMjerenjeId: createdMjerenjeId,

              prethodnaKolicinaUTanku: trenutnoUTanku,
              prethodnaSorta: tank.sorta ?? null,
              prethodniNazivVina: tank.nazivVina ?? null,
              prethodnoGodiste: tank.godiste ?? null,
              prethodniSastavJson: prethodniSastavJson,

              stavke: {
                create: zaTank.map((x) => ({
                  id: x.s.redakPoTanku.get(tid)!,
                  sortaId: x.s.sortaId,
                  nazivSorte: x.s.nazivSorte,
                  opis: x.s.opis,
                  // Vidi obrazlozenje uz `ukupnoKgGrozdja` gore.
                  kolicinaKgGrozdja: x.prvi ? x.s.kolicinaKgGrozdja : null,
                  // Litre SU po tanku — to je jedino sto se stvarno dijeli.
                  kolicinaLitara: x.o.litre,
                  datumBerbe: x.s.datumBerbe,
                  godinaBerbe: x.s.godinaBerbe,
                  polozaj: x.s.polozaj,
                  parcela: x.s.parcela,
                  vinograd: x.s.vinograd,
                  oznakaBerbe: x.s.oznakaBerbe,
                  secer: x.s.secer,
                  kiseline: x.s.kiseline,
                  ph: x.s.ph,
                  napomenaBerbe: x.s.napomenaBerbe,
                  maceracija: x.s.maceracija,
                  maceracijaSati: x.s.maceracijaSati,
                })),
              },
            },
            include: {
              tank: {
                select: {
                  id: true,
                  broj: true,
                  tip: true,
                },
              },
              stavke: {
                where: {
                  obrisano: false,
                },
                include: {
                  sorta: true,
                },
              },
              pocetnoMjerenje: true,
            },
          });

          const glavnaSorta =
            zaTank.length === 1 ? zaTank[0].s.nazivSorte : nazivVina || "Cuvée";

          const godinaZaTank =
            zaTank.length === 1 ? (zaTank[0].s.godinaBerbe ?? null) : null;

          const novaKolicinaUTanku = trenutnoUTanku + ukupnoLitara;

          await tx.tank.update({
            where: { id: tid },
            data: {
              kolicinaVinaUTanku: novaKolicinaUTanku,
              nazivVina: nazivVina,
              sorta: glavnaSorta,
              godiste: godinaZaTank,
            },
          });

          await tx.tankContent.upsert({
            where: { tankId: tid },
            update: {
              sorta:
                zaTank.length === 1
                  ? zaTank[0].s.nazivSorte
                  : nazivVina || "Mješavina",
              kolicina: novaKolicinaUTanku,
              datumUlaza: datumPunjenja,
            },
            create: {
              tankId: tid,
              sorta:
                zaTank.length === 1
                  ? zaTank[0].s.nazivSorte
                  : nazivVina || "Mješavina",
              kolicina: novaKolicinaUTanku,
              datumUlaza: datumPunjenja,
            },
          });

          const litaraPoSortiPunjenje = new Map<string, number>();

          for (const x of zaTank) {
            const naziv = x.s.nazivSorte.trim();
            const stara = litaraPoSortiPunjenje.get(naziv) ?? 0;
            litaraPoSortiPunjenje.set(naziv, stara + x.o.litre);
          }

          const litaraPoSortiUkupno = new Map<string, number>();

          if (trenutnoUTanku > 0 && tank.udjeliSorti.length > 0) {
            for (const u of tank.udjeliSorti) {
              const litaraPostojece =
                (trenutnoUTanku * Number(u.postotak)) / 100;
              const stara = litaraPoSortiUkupno.get(u.nazivSorte) ?? 0;
              litaraPoSortiUkupno.set(u.nazivSorte, stara + litaraPostojece);
            }
          }

          for (const [nazivSorte, litara] of litaraPoSortiPunjenje.entries()) {
            const stara = litaraPoSortiUkupno.get(nazivSorte) ?? 0;
            litaraPoSortiUkupno.set(nazivSorte, stara + litara);
          }

          const noviUdjeli = Array.from(litaraPoSortiUkupno.entries())
            .map(([nazivSorte, litara]) => ({
              nazivSorte,
              postotak:
                novaKolicinaUTanku > 0
                  ? (litara / novaKolicinaUTanku) * 100
                  : 0,
            }))
            .filter((u) => u.postotak > 0);

          await tx.tankSortaUdio.deleteMany({
            where: { tankId: tid },
          });

          if (noviUdjeli.length > 0) {
            await tx.tankSortaUdio.createMany({
              data: noviUdjeli.map((u) => ({
                tankId: tid,
                nazivSorte: u.nazivSorte,
                postotak: u.postotak,
              })),
            });
          }

          // Punjenje MORA ostaviti trag u radnjama. Uvjet `if (korisnikId)` koji
          // je ovdje stajao nikad nije bio ispunjen — forma korisnika nije slala,
          // pa nijedno punjenje nije imalo svoju radnju. Sad je korisnik zajamcen
          // (401 gore), pa uvjet vise ne postoji.
          //
          // Po jedna radnja PO TANKU: radnja je vezana na tank, pa jedna
          // zajednicka ne bi postojala ni na jednom drugom tanku osim prvog.
          await tx.radnja.create({
            data: {
              tankId: tid,
              korisnikId,
              vrsta: "PUNJENJE",
              opis: nazivVina
                ? `Punjenje tanka - ${nazivVina}`
                : "Punjenje tanka",
              napomena: napomena ?? opis ?? null,
              // Trag bez litara je slab trag; zapisnik radova (faza 1) ovo cita.
              kolicina: ukupnoLitara,
            },
          });

          stvorena.push(created);
        }

        // ---------------------------------------------------------------------
        // KNJIGA BERBE — jedna stavka je JEDAN zapis berbe i JEDAN ULAZ PO TANKU.
        //
        // Ovo je isti podatak koji je vec upisan u `PunjenjeStavka`, ali s drugom
        // tvrdnjom: stavka kaze "toliko je toga dana upisano u punjenje", ULAZ
        // kaze "toliko je vina uslo u tank i od tog trenutka se prati". Prvo
        // arhiviranje tanka brise stavke (vidi arhivirajPrazanTank u
        // app/api/izlaz-vina/route.ts) — ULAZ prezivi, jer knjiga nema strani
        // kljuc ni na tank ni na punjenje.
        //
        // U ISTOJ transakciji: ako knjiga pukne, ne ostaje punjenje bez berbe.
        // Sekvencijalno, ne Promise.all — jedna transakcijska veza.
        //
        // VEZA je punjenje PRVOG tanka, i to za sve tankove te stavke. `Veza`
        // dopusta tocno jedan cin (provjeriVezu), a ovo JEST jedan cin — punjenja
        // ostalih tankova su njegovi dijelovi, povezani preko `grupaId`. Zato i
        // `zabiljeziPonistenje({ punjenjeId })` nad tim id-em ponisti cijeli
        // potez, u svim tankovima odjednom.
        const prvoPunjenjeId = stvorena[0].id;

        for (const s of cisteStavke) {
          const r = await zabiljeziUlazUVise(tx, {
            odredista: s.odredista.map((o) => ({
              tankId: o.tankId,
              litre: o.litre,
            })),
            vrstaUnosa: "BERBA",
            nazivSorte: s.nazivSorte,
            sortaId: s.sortaId,
            datumBerbe: s.datumBerbe,
            godinaBerbe: s.godinaBerbe,
            // Puni iznos na jedan zapis. Ne dijeli se.
            kolicinaKgGrozdja: s.kolicinaKgGrozdja,
            polozaj: s.polozaj,
            parcela: s.parcela,
            vinograd: s.vinograd,
            oznakaBerbe: s.oznakaBerbe,
            secer: s.secer,
            kiseline: s.kiseline,
            ph: s.ph,
            maceracija: s.maceracija,
            maceracijaSati: s.maceracijaSati,
            napomena: s.napomenaBerbe,
            korisnikId,
            // Zatecena veza, @unique, pa ju moze nositi samo JEDAN redak — onaj
            // u prvom tanku. Puna veza je `PunjenjeStavka.berbaId` nize.
            izvornaPunjenjeStavkaId: s.redakPoTanku.get(s.odredista[0].tankId),
            veza: { punjenjeId: prvoPunjenjeId },
            // Datum punjenja, ne trenutak upisa: berba se cesto upisuje naknadno.
            dogodenoAt: datumPunjenja,
          });

          // Veza u drugom smjeru, i to sa SVIH redaka te stavke. Bez nje se iz
          // stavke u drugom tanku ne bi znalo koja je berba iz nje nastala.
          await tx.punjenjeStavka.updateMany({
            where: { id: { in: Array.from(s.redakPoTanku.values()) } },
            data: { berbaId: r.berbaId },
          });
        }

        return stvorena;
      },
      // Zadanih 5 s bilo je dovoljno za jedan tank. Tri tanka rade otprilike
      // trostruko vise upita, a sve mora stati u JEDNU transakciju — punjenje
      // bez berbe, ili berba u dva tanka od kojih je upisan jedan, gore su od
      // odbijenog spremanja. Ovo je gornja granica cekanja, ne obecanje da ce
      // toliko trajati.
      { timeout: 30_000, maxWait: 15_000 }
    );

    return NextResponse.json({
      success: true,
      // Zatecen kljuc: prvo punjenje. Forma ga cita i dalje.
      punjenje: rezultat[0],
      // Nov kljuc: sva punjenja ovog cina, po jedno za svaki tank.
      punjenja: rezultat,
      grupaId,
    });
  } catch (error) {
    console.error("Greška kod spremanja punjenja:", error);

    // Greska u zahtjevu ima poruku pisanu za korisnika — kaze tocno koja
    // stavka i koji redak ne valja. Genericki 500 bi ju progutao.
    if (error instanceof ZahtjevGreska) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Poruka knjige je namijenjena korisniku i kaze sto tocno ne valja s
    // brojkama; generickih 500 bi ju progutao. Sve ostalo ostaje kako je bilo.
    if (error instanceof BerbaGreska) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Dogodila se greška kod spremanja punjenja." },
      { status: 500 }
    );
  }
}
