import Link from "next/link";
import type React from "react";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";
import { citajUlazneCine, vinoUTanku, type Sastavnica } from "@/lib/identitet-vina";
import { podrijetloTanka } from "@/lib/berba-model";
import { granicaVina } from "@/lib/granica-vina";
import { imeVina } from "@/lib/ime-vina";
import { imeKucice, izImena } from "@/lib/ime-kucice";
import { uValovima } from "@/lib/paralelno";
import { parametriVinaIzKnjige } from "@/lib/parametri-vina";
import {
  povijestVina,
  type RedakRadnje,
  type RedakArhivskeRadnje,
  type RedakMjerenjaPosude,
} from "@/lib/povijest-vina";
import {
  kvasciKucice,
  nadjiKucicu,
  prozoriKucice,
  rastaviKljucCina,
} from "@/lib/prosli-tank";
import { imeIzSnimke, kvasciIzSnimke, snimkaKucice } from "@/lib/snimka-vina";
import { nazivStavke, nazivVinaBezSastava, sastavVina } from "@/lib/sastav-vina";
import { Card } from "@/app/tankovi/[id]/kartica";
import NatragNaPrethodnu from "@/components/NatragNaPrethodnu";
import { parametriIzSnimke } from "./parametri-iz-snimke";
import VinoIzSnimke from "./vino-iz-snimke";
import ParametriPoPolju, {
  type ParametarPrikaz,
} from "@/app/tankovi/[id]/parametri-po-polju";

/**
 * PROSLI TANK — kucica iz sastava, otvorena kao vino ZAMRZNUTO na trenutak
 * ulaska u drugi tank. Samo za gledanje: nijedna akcija, nijedan upis.
 * ======================================================================
 *
 * Adresa: /prosli-tank?korijen=<tank>&iz=<tank>&cin=<Sastavnica.kljucCina>
 *   korijen — NEOBAVEZAN. Tank s cije je stranice kucica otvorena; njegov
 *             `VinoRadnja` daje kvasce, a njegovo stablo odredjuje kucicu;
 *   iz      — posuda iz koje je vino doslo (za vino koje je u posudi vec
 *             bilo: sama ta posuda);
 *   cin     — cin kojim je vino uslo (lib/identitet-vina.ts, `kljucCina`).
 *
 * BEZ KORIJENA (od 09.10.2026.) kucica se otvara iz samog kljuca cina
 * (`nadjiKucicu`, lib/prosli-tank.ts): roditelj je zapisan u kljucu, trenutak
 * u knjizi. Tako se otvara vino koje je otislo iz podruma — setnja kroz
 * arhivu, i iz /prosli-tank?snimka= — a i stara poveznica ciji je korijen u
 * medjuvremenu ponovno napunjen, koja je dotad davala notFound. Bez korijena
 * nema prijevoda kvasaca: `VinoRadnja` se brise kad se posuda isprazni, pa
 * kvasce pokazuje samo kucica sa snimkom; ostale kazu zasto ih nema.
 *
 * Adresa: /prosli-tank?snimka=<SnimkaVina.id> — RAZINA 1 arhive: vino koje
 * je izaslo kroz izlaz (boce ili rinfuza), puna evidencija. Vidi
 * vino-iz-snimke.tsx; ovdje se samo grana.
 *
 * ODLUKE VLASNIKA (28.09.2026):
 *
 * 1. KUPAZA je mijesanje s drugim vinom: ulazak u posudu koja vec drzi vino
 *    ILI vise izvora istim cinom, i kad je ciljna posuda prazna.
 *
 * 2. KUCICA SE CITA IZ KNJIGE, NIJE SNIMKA. Ispravak ili unatrag datirano
 *    punjenje mijenja i ovaj prikaz proslosti — namjerno: ispravak podataka
 *    mora popraviti i proslost. Ne shvatiti kao kvar.
 *
 *    OD 29.09.2026. IZNIMKA: kucica koja ima SNIMKU (lib/snimka-vina.ts,
 *    nastaje pri svakom izlasku vina od koraka 2) cita iz nje ime, sortu,
 *    parametre i kvasce. Berba, litre i dodaci i dalje dolaze iz knjige.
 *    Kucice bez snimke (sve starije) rade kao prije — staro se ne spasava,
 *    ali se ni ne skriva.
 *
 *    OZNAKA "iz snimke" / "iz knjige" JE OBAVEZNA, NE UKRAS. Snimka sprema
 *    ono sto je monitor pokazivao: primjenjuje pravilo fermentacije i
 *    procjenu iz blenda, a knjiga ne. Mjereno 29.09.2026: na 8 od 38 tankova
 *    bi se vrijednosti razlikovale (T7 alkohol 11,3 iz knjige skriven jer
 *    vino fermentira; T43 secer 5,43 iz knjige, 3,5 iz blenda). Bez oznake bi
 *    dvije kucice pokazivale razlicito bez vidljivog razloga.
 *
 * 3. PRAGA NEMA. Poveznicu ima svaka kucica — i progutano dolijevanje od
 *    1 % (T35 u T42) je vino s poviscu.
 *
 * TRENUTAK. Vino se cita milisekundu PRIJE cina: granica knjige je
 * ukljuciva, pa je na sam trenutak cina ispraznjen izvor vec prazan.
 *
 * GRAF: samo tocke koje pokrivaju barem 50 % litara komponente. Vino je spoj
 * vise partija i svaka je prosla svoj put; bez praga bi T5 crtao 79 tocaka
 * iz 10 posuda. Mjereno 28.09.2026: s pragom T5 ima tri krivulje (T11, T41,
 * T5), T8 tri, T35 dvije.
 *
 * KVASCI: kucica sa snimkom ih cita IZ SNIMKE, s tocnim udjelom u vinu
 * kucice (`kvasciIzSnimke`) — to ZAMJENJUJE prijevod, ne stoji uz njega.
 * Kucica bez snimke: udio iz `VinoRadnja` korijena, preveden na kucicu samo
 * gdje je prijevod tocan — obrazlozenje i mjerenje stoje uz `kvasciKucice`
 * (lib/prosli-tank.ts). Kucica bez ijednog kvasca pise "bez zapisa": 135 od
 * 161 kucice u T42 nema kvasac, vecinom zateceno vino iz 2025, i to je
 * ispravno stanje, ne rupa.
 */

/** Prag litara za tocku na grafu — vidi zaglavlje. */
const PRAG_GRAFA = 50;

const POLJA = [
  { kljuc: "secer", naziv: "Šećer", jedinica: "" },
  { kljuc: "ukupneKiseline", naziv: "Ukupne kiseline", jedinica: "" },
  { kljuc: "ph", naziv: "pH", jedinica: "" },
] as const;

function jedan(v: string | string[] | undefined): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x && x.trim() ? x : null;
}

function fDatum(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fDatumSat(d: Date): string {
  return d.toLocaleString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fBroj(v: number, dec = 0): string {
  return v.toLocaleString("hr-HR", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

/** S korijenom ista adresa kao do sada; bez njega samo posuda i cin. */
function hrefKucice(korijenId: string | null, s: Sastavnica): string | null {
  if (s.vino.vrsta === "partija") return `/berba/${s.vino.berbaId}`;
  return (
    `/prosli-tank?` +
    (korijenId ? `korijen=${encodeURIComponent(korijenId)}&` : "") +
    `iz=${encodeURIComponent(s.vino.tankId)}` +
    `&cin=${encodeURIComponent(s.kljucCina)}`
  );
}

export default async function ProsliTankPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  noStore();

  const prijavljeni = await citajSesiju();
  if (!prijavljeni) redirect("/login");

  const sp = await searchParams;

  // RAZINA 1 — vino koje je izaslo kroz izlaz (boce ili rinfuza). Nema
  // korijen: nije kucica ni u cijem stablu. Vidi vino-iz-snimke.tsx.
  const snimkaId = jedan(sp.snimka);
  if (snimkaId) return <VinoIzSnimke snimkaId={snimkaId} />;

  const korijenIzAdrese = jedan(sp.korijen);
  const izTankId = jedan(sp.iz);
  const kljucCina = jedan(sp.cin);
  if (!izTankId || !kljucCina) return notFound();

  // Upiti idu redom, ne u Promise.all — pooler drzi 15 veza za cijelu
  // aplikaciju, a `citajUlazneCine` sam trosi nekoliko.
  const sviTankovi = await prisma.tank.findMany({ select: { id: true, broj: true } });
  const brojTanka = new Map(sviTankovi.map((t) => [t.id, t.broj]));
  if (korijenIzAdrese && !brojTanka.has(korijenIzAdrese)) return notFound();
  if (!brojTanka.has(izTankId)) return notFound();

  const knjiga = await citajUlazneCine(prisma, sviTankovi.map((t) => t.id));
  // Oznaka partije ide u isti upit — treba je naziv stavke sastava.
  const sveBerbe = await prisma.berba.findMany({
    select: { id: true, nazivSorte: true, oznakaBerbe: true },
  });
  const sorteBerbi = new Map(sveBerbe.map((b) => [b.id, b.nazivSorte] as const));
  const oznakaPartije = new Map(sveBerbe.map((b) => [b.id, b.oznakaBerbe] as const));

  // S korijenom se kucica trazi u njegovom DANASNJEM stablu, istom koje crta
  // stranica tanka — tako ima i udio u korijenu, bez kojeg nema prijevoda
  // kvasaca. Bez korijena (ili kad ga korijen vise ne sadrzi) iz kljuca cina.
  const korijen = korijenIzAdrese
    ? vinoUTanku(
        knjiga.cini,
        sorteBerbi,
        korijenIzAdrese,
        Date.now(),
        {},
        [],
        (await podrijetloTanka(prisma, korijenIzAdrese)).ukupnoL
      )
    : null;

  const nadjena = nadjiKucicu(knjiga.cini, sorteBerbi, { korijen, izTankId, kljucCina });
  // Nema je ni iz kljuca: cin je ponisten, knjiga ispravljena ili je adresa
  // rucno sastavljena. Pogadjati se ne smije.
  if (!nadjena) return notFound();

  // Korijen vrijedi samo ako je kucica stvarno u njegovom stablu. Stara
  // poveznica ciji je korijen ponovno napunjen otvara se kao bez korijena: ni
  // prijevod kvasaca ni povratak "← Tank N" vise ne opisuju to vino.
  const korijenId = nadjena.kroz === "korijen" ? korijenIzAdrese : null;

  const kucica = nadjena.sastavnica;
  const roditeljTankId = nadjena.roditeljTankId;
  const vecBiloUPosudi = izTankId === roditeljTankId;
  const trenutak = new Date(kucica.usloAt.getTime() - 1);

  // SNIMKA — vino kakvo je bilo kad je izaslo iz posude (razina 2 arhive).
  // `null` za sve kucice od prije koraka 2, za vino koje je u posudi vec bilo
  // i za kretanja koja nisu izlazak; tada sve ide iz knjige kao prije.
  const snimka = await snimkaKucice(prisma, { kljucCina, izTankId, roditeljTankId });

  const granica = await granicaVina(prisma, izTankId, { doTrenutka: trenutak, zadnjeVino: true });
  // NASLOV JE IME VINA, BEZ TANKA (vlasnik, 09.10.2026.): "Graševina
  // 020/2026, kakva je bila 21. 09. 2026." Isti izvor kao kucica na stranici
  // tanka (lib/ime-kucice.ts), da kucica i stranica koju otvara ne kazu dvije
  // stvari. Bezimeno pada na sortu i partiju iz sastava.
  const ime = izImena(
    snimka
      ? imeIzSnimke(snimka)
      : await imeVina(prisma, izTankId, granica, { doTrenutka: trenutak })
  );
  const naslov =
    ime.naziv ??
    nazivStavke(kucica, oznakaPartije) ??
    (kucica.vino.vrsta === "posuda" ? nazivVinaBezSastava(kucica.vino.razlog) : "Vino");
  // Iz knjige i kad snimka postoji: iz nje dolazi GRAF (niz mjerenja kroz
  // vrijeme), a snimka nosi samo vrijednosti u jednom trenutku.
  const parametri = await parametriVinaIzKnjige(prisma, izTankId, { doTrenutka: trenutak });

  // VINO KOJE JE USLO I OTISLO ISTIM TRENUTKOM. Milisekundu prije cina knjiga
  // ga u posudi ne vidi: mjereno 28.09.2026, 20 od 307 kucica podruma (14
  // rodjenih i otislih u istoj sekundi, vecinom backfill rekonstrukcije).
  // Stablo zato iste slucajeve cita ukljucivo (lib/identitet-vina.ts); ovdje
  // se berba cita iz redaka samog cina, a za parametre se kaze zasto ih nema.
  const podrijetloPrije = await podrijetloTanka(prisma, izTankId, { doTrenutka: trenutak });
  const knjigaVidiVino = podrijetloPrije.ukupnoL > 0.5;

  // BERBA: sto je tim cinom USLO, po partijama. Za vino iz druge posude to
  // kazu retci knjige samog cina (izvor -> cilj, ista veza i vrsta) — tocne
  // litre, bez ovisnosti o trenutku. Za vino koje je u posudi vec bilo takvih
  // redaka nema, pa se cita sastav posude neposredno prije.
  const cin = rastaviKljucCina(kljucCina);
  if (!cin) return notFound();

  type StavkaBerbe = {
    berbaId: string;
    nazivSorte: string;
    oznakaBerbe: string | null;
    godinaBerbe: number | null;
    vinograd: string | null;
    polozaj: string | null;
    parcela: string | null;
    zateceno: boolean;
    litre: number;
    postotak: number;
  };
  let berba: StavkaBerbe[];

  if (vecBiloUPosudi) {
    berba = podrijetloPrije.stavke.map((s) => ({
      berbaId: s.berbaId,
      nazivSorte: s.nazivSorte,
      oznakaBerbe: s.oznakaBerbe,
      godinaBerbe: s.godinaBerbe,
      vinograd: s.vinograd,
      polozaj: s.polozaj,
      parcela: s.parcela,
      zateceno: s.vrstaUnosa === "ZATECENO",
      litre: (kucica.litre * s.postotak) / 100,
      postotak: s.postotak,
    }));
  } else {
    const redci = await prisma.berbaKretanje.findMany({
      where: {
        izTankId,
        uTankId: roditeljTankId,
        vrsta: cin.vrsta as never,
        OR: [{ pretokId: cin.veza }, { zadatakId: cin.veza }],
      },
      select: { berbaId: true, litre: true },
    });
    const litrePoBerbi = new Map<string, number>();
    for (const r of redci) {
      litrePoBerbi.set(r.berbaId, (litrePoBerbi.get(r.berbaId) ?? 0) + Number(r.litre));
    }
    const ukupno = [...litrePoBerbi.values()].reduce((z, l) => z + l, 0);
    const zapisi = await prisma.berba.findMany({ where: { id: { in: [...litrePoBerbi.keys()] } } });
    berba = zapisi
      .map((b) => ({
        berbaId: b.id,
        nazivSorte: b.nazivSorte,
        oznakaBerbe: b.oznakaBerbe,
        godinaBerbe: b.godinaBerbe,
        vinograd: b.vinograd,
        polozaj: b.polozaj,
        parcela: b.parcela,
        zateceno: b.vrstaUnosa === "ZATECENO",
        litre: litrePoBerbi.get(b.id) ?? 0,
        postotak: ukupno > 0 ? ((litrePoBerbi.get(b.id) ?? 0) / ukupno) * 100 : 0,
      }))
      .sort((a, b) => b.litre - a.litre);
  }

  // KVASCI: iz snimke kad je ima (tocan udio, bez prijevoda), inace prijevod
  // iz `VinoRadnja` korijena kao prije. Nikad oboje — vidi `kvasciIzSnimke`.
  //
  // BEZ KORIJENA I BEZ SNIMKE kvasci se NE ZNAJU — i to nije "bez zapisa".
  // `VinoRadnja` je jedini tocan izvor udjela, a brise se kad se posuda
  // isprazni; prijevod iz necijeg danasnjeg stabla ovdje ne postoji.
  // Mjereno 09.10.2026: nijedna kucica u stablu T42 ni ispod snimki izlaza
  // nema snimku, pa setnja kroz arhivu kvasce danas ne pokazuje nigdje.
  const korijenKucice = korijenId ? korijen : null;
  const kvasciPoznati = snimka !== null || korijenKucice !== null;
  type KvasacPrikaz = {
    id: string;
    naziv: string;
    brojTanka: number | null;
    dogodenoAt: Date;
    udio: number | null;
    zasto: null | "vise_putova" | "nesklad";
  };
  const kvasci: KvasacPrikaz[] = snimka
    ? kvasciIzSnimke(snimka).map((r) => ({
        id: r.id,
        naziv: r.preparatNaziv ?? r.opis ?? "kvasac",
        brojTanka: r.izvorniBrojTanka,
        dogodenoAt: r.dogodenoAt,
        udio: r.udio,
        zasto: null,
      }))
    : !korijenKucice || !korijenId
      ? []
      : kvasciKucice(
        korijenKucice,
        izTankId,
        kljucCina,
        await prisma.vinoRadnja.findMany({
          where: { tankId: korijenId, jeKvasac: true },
          orderBy: { dogodenoAt: "asc" },
        })
      ).map((k) => ({
        id: k.redak.id,
        naziv: k.redak.preparatNaziv ?? k.redak.opis ?? "kvasac",
        brojTanka: k.redak.izvorniBrojTanka,
        dogodenoAt: k.redak.dogodenoAt,
        udio: k.udio,
        zasto: k.zasto,
      }));

  // DODACI I HRANA: sve sto je dodano ovom vinu, i vinima od kojih je
  // nastalo, prije nego je uslo u roditelja. Iz `Radnja`, ne iz `VinoRadnja`
  // — popis ne nosi udio, pa mu ne treba ni snimka udjela. Arhivske tablice
  // se citaju OBAVEZNO (AGENTS.md): arhiviranje je selilo podatke.
  const prozori = prozoriKucice(kucica);
  const posude = [...new Set(prozori.map((p) => p.tankId))];

  const radnje: RedakRadnje[] = (
    await prisma.radnja.findMany({
      where: { tankId: { in: posude }, createdAt: { lte: kucica.usloAt } },
      select: {
        id: true,
        tankId: true,
        createdAt: true,
        vrsta: true,
        opis: true,
        kolicina: true,
        preparat: { select: { naziv: true } },
        jedinica: { select: { naziv: true } },
      },
    })
  ).map((r) => ({
    izvorniTankId: r.tankId,
    dogodenoAt: r.createdAt,
    vrsta: r.vrsta,
    opis: r.opis,
    preparatNaziv: r.preparat?.naziv ?? null,
    jedinicaNaziv: r.jedinica?.naziv ?? null,
    kolicina: r.kolicina,
    // Kvasac ostaje u popisu dodataka kao obicno dodavanje, bez postotka
    // (vlasnik, 28.09.2026) — zabrana filtriranja po `jeKvasac` vrijedi i
    // ovdje. Zato se oznaka ne cita.
    jeKvasac: false,
    izvornaRadnjaId: r.id,
  }));

  const arhivskeRadnje: RedakArhivskeRadnje[] = await prisma.arhivaVinaRadnja.findMany({
    where: { tankId: { in: posude } },
    select: {
      tankId: true,
      createdAt: true,
      vrsta: true,
      opis: true,
      preparatNaziv: true,
      jedinicaNaziv: true,
      kolicina: true,
      izvornaRadnjaId: true,
    },
  });

  const poljaMjerenja = {
    tankId: true,
    izmjerenoAt: true,
    alkohol: true,
    secer: true,
    ukupneKiseline: true,
    ph: true,
    slobodniSO2: true,
    ukupniSO2: true,
  } as const;
  const mjerenja: RedakMjerenjaPosude[] = await prisma.mjerenje.findMany({
    where: { tankId: { in: posude } },
    select: poljaMjerenja,
  });
  const arhivskaMjerenja: RedakMjerenjaPosude[] = (
    await prisma.arhivaVinaMjerenje.findMany({
      where: { tankId: { in: posude } },
      select: poljaMjerenja,
    })
  ).filter((m): m is RedakMjerenjaPosude => m.tankId !== null);

  const povijesti = prozori.map((p) =>
    povijestVina({
      tankId: p.tankId,
      od: p.od,
      do: p.do,
      radnje,
      mjerenja,
      arhivskeRadnje,
      arhivskaMjerenja,
    })
  );
  const sDodacima = povijesti.filter((p) => p.dodaci.length > 0);
  const rupe = povijesti.filter((p) => p.stanje === "rupa");

  // Graf je iz knjige u obje grane: snimka je jedan trenutak, ne niz.
  const nizZaGraf = (kljuc: keyof NonNullable<typeof parametri>["niz"]) =>
    (parametri?.niz[kljuc] ?? [])
      .filter((x) => x.postotak >= PRAG_GRAFA)
      .map((x) => ({
        t: x.izmjerenoAt.toISOString(),
        v: x.vrijednost,
        rucno: false,
        posuda: x.brojTanka != null ? `tank ${x.brojTanka}` : "nepoznatoj posudi",
      }));

  // IZ SNIMKE: svih osam polja monitora (app/prosli-tank/parametri-iz-snimke.ts,
  // zajednicko s razinom 1).
  const prikazParametara: ParametarPrikaz[] = snimka
    ? parametriIzSnimke(snimka, (k) => nizZaGraf(k as keyof NonNullable<typeof parametri>["niz"]))
    : POLJA.map((o): ParametarPrikaz => {
    const polje = parametri?.poPolju[o.kljuc] ?? null;
    return {
      kljuc: o.kljuc,
      naziv: o.naziv,
      jedinica: o.jedinica,
      vrijednost: polje?.vrijednost ?? null,
      podrijetlo: polje ? "knjiga" : "nema",
      datum: null,
      neprikazano: null,
      izKnjige: polje
        ? {
            mjerenoAt: polje.najnovijeAt.toISOString(),
            posude: [
              ...new Set(
                polje.izvori.map((x) =>
                  x.brojTanka != null ? `tank ${x.brojTanka}` : "nepoznatoj posudi"
                )
              ),
            ],
            postotak: polje.postotak,
          }
        : null,
      niz: nizZaGraf(o.kljuc),
      blend: null,
    };
  });

  const brIz = brojTanka.get(izTankId);
  const brRoditelj = brojTanka.get(roditeljTankId);
  const brKorijen = korijenId ? brojTanka.get(korijenId) : undefined;
  // "← NATRAG" NOSI IME VINA kad je poznato (vlasnik, 09.10.2026.): vraca se
  // na vino, a ne na posudu. Ime korijena DANAS — stranica tanka pokazuje
  // danasnje vino. Bezimeno ostaje "← Tank N".
  const imeKorijena = korijenId
    ? izImena(await imeVina(prisma, korijenId, await granicaVina(prisma, korijenId))).naziv
    : null;
  // SASTAV — vina, ne posude (vlasnik, 09.10.2026.): prijenosi istog vina u
  // praznu posudu sazeti su u stavku vina koje kroz njih prolazi
  // (lib/sastav-vina.ts). Samo prva razina; dublje vodi poveznica.
  const izvori = sastavVina(kucica.vino);
  // Ime i sifra stavki — ovo je prva razina ove kucice (lib/ime-kucice.ts).
  const imenaIzvora = await uValovima(
    izvori.map((st) => () => imeKucice(prisma, st.sastavnica, st.roditeljTankId))
  );

  return (
    <main style={stranicaStil}>
      <div style={{ display: "grid", gap: 4 }}>
        {korijenId ? (
          <Link href={`/tankovi/${korijenId}`} style={poveznicaStil}>
            ← {imeKorijena ?? `Tank ${brKorijen}`}
          </Link>
        ) : (
          // Bez korijena nema tanka na koji bi se vratilo: posuda iz koje je
          // kucica otvorena danas drzi drugo vino, ili je kucica otvorena iz
          // arhive. Natrag je ondje odakle se doslo.
          <div>
            <NatragNaPrethodnu />
          </div>
        )}
        <h1 style={naslovStil}>
          {naslov}
          {ime.sifra ? <span style={sifraStil}> · {ime.sifra}</span> : null}
          {/* fDatum vec zavrsava tockom ("21. 09. 2026."). "Kakvo je vino
              bilo", ne "kakva je bila": rod imena se ne zna. */}
          <span style={naslovDatumStil}>
            {" "}— kakvo je vino bilo {fDatum(kucica.usloAt)}
          </span>
        </h1>
        <div style={podnaslovStil}>
          {vecBiloUPosudi
            ? `Vino koje je već bilo u tanku ${brIz} kad je u njega ušlo novo (${fDatumSat(kucica.usloAt)}) — ${fBroj(kucica.litre)} L.`
            : `Ušlo ${fBroj(kucica.litre)} L u tank ${brRoditelj}` +
              (kucica.progutano ? " kao dolijevanje" : "") +
              ` (${fDatumSat(kucica.usloAt)})` +
              "."}
          {/* fDatum vec zavrsava tockom ("21. 09. 2026."). */}
          {granica.odAt ? ` U tanku ${brIz} od ${fDatum(granica.odAt)}` : ""}
        </div>
        {snimka ? (
          // Litre ove kucice (gore) su iz knjige: ono sto je USLO u ovaj tank.
          // Snimka broji sto je izaslo iz posude — za sve ciljeve cina i s
          // kalom — pa stoji kao zaseban redak, ne umjesto.
          <div style={podnaslovStil}>
            U tanku {brIz} prije: {fBroj(snimka.litrePrije)} L · otišlo{" "}
            {fBroj(snimka.litreOtislo)} L
            {snimka.ispraznjen ? " · posuda ispražnjena" : ""}
          </div>
        ) : null}
        <div style={napomenaStil}>
          {snimka ? (
            <>
              Samo za gledanje. Ime, parametri i kvasci su{" "}
              <strong>iz snimke u trenutku izlaska</strong> (
              {fDatumSat(snimka.dogodenoAt)}): onako kako ih je monitor tada
              pokazivao. Berba, litre i dodaci su iz knjige kretanja — ispravak
              podataka mijenja njih, snimku ne.
            </>
          ) : (
            <>
              Samo za gledanje. Čita se <strong>iz knjige</strong> kretanja, ne iz
              snimke: ispravak podataka mijenja i ovaj prikaz prošlosti.
            </>
          )}
        </div>
      </div>

      <Card title="Berba" broj={berba.length}>
        {berba.length === 0 ? (
          <div style={praznoStil}>Knjiga za ovo vino ne zna nijednu berbu.</div>
        ) : (
          <div style={{ display: "grid", gap: 6, padding: 10 }}>
            {berba.map((s) => (
              <div key={s.berbaId} style={redakStil}>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <strong>
                    {s.nazivSorte}
                    {s.oznakaBerbe ? ` · partija ${s.oznakaBerbe}` : ""}
                    {s.godinaBerbe ? ` · ${s.godinaBerbe}.` : ""}
                  </strong>
                  <span style={tihoStil}>
                    {[
                      s.vinograd ? `vinograd ${s.vinograd}` : null,
                      s.polozaj ? `položaj ${s.polozaj}` : null,
                      s.parcela ? `parcela ${s.parcela}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "vinograd nije upisan"}
                    {s.zateceno ? " · zatečeno" : ""}
                  </span>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <strong>{fBroj(s.postotak, 1)} %</strong>
                  <div style={tihoStil}>{fBroj(s.litre)} L</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Kvasci" broj={kvasciPoznati ? kvasci.length : undefined}>
        <div style={izvorStil}>
          {snimka
            ? "iz snimke u trenutku izlaska — udio u vinu ove kućice"
            : kvasciPoznati
              ? `iz knjige — udio iz zapisa tanka ${brKorijen}, preveden na ovu kućicu`
              : "nije poznato"}
        </div>
        {!kvasciPoznati ? (
          <div style={praznoStil}>
            Kvasci se ne prikazuju: zapis udjela kvasca briše se kad se posuda
            isprazni, a za ovu kućicu nema snimke.
          </div>
        ) : kvasci.length === 0 ? (
          <div style={praznoStil}>bez zapisa</div>
        ) : (
          <div style={{ display: "grid", gap: 6, padding: 10 }}>
            {kvasci.map((k) => (
              <div key={k.id} style={redakStil}>
                <div style={{ display: "grid", gap: 2 }}>
                  <strong>{k.naziv}</strong>
                  <span style={tihoStil}>
                    dodan u tank {k.brojTanka ?? "?"} · {fDatum(k.dogodenoAt)}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  {k.udio !== null ? (
                    <strong>{fBroj(k.udio * 100, 1)} %</strong>
                  ) : (
                    <span style={tihoStil}>
                      {k.zasto === "vise_putova"
                        ? `bez postotka — u tank ${brKorijen} stigao je i drugim putem`
                        : "bez postotka — zapis i knjiga se ovdje ne slažu"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Dodaci i hrana" broj={sDodacima.reduce((z, p) => z + p.dodaci.length, 0)}>
        {sDodacima.length === 0 ? (
          <div style={praznoStil}>bez zapisa</div>
        ) : (
          <div style={{ display: "grid", gap: 10, padding: 10 }}>
            {sDodacima.map((p) => (
              <div key={`${p.tankId}|${p.od.getTime()}|${p.do.getTime()}`}>
                <div style={skupinaStil}>
                  Tank {brojTanka.get(p.tankId) ?? "?"} · {fDatum(p.od)} – {fDatum(p.do)}
                </div>
                {p.dodaci.map((d, i) => (
                  <div key={i} style={stavkaStil}>
                    <span style={datumStil}>{fDatum(d.datum)}</span>
                    <span>{d.naslov}</span>
                    {d.detalj ? <span style={tihoStil}>{d.detalj}</span> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {rupe.length > 0 ? (
          // Rupa u evidenciji ne smije izgledati kao uredan kraj (vlasnik,
          // 14.09.2026): vino je dugo stajalo, a nista nije zapisano.
          <div style={rupaStil}>
            Rupa u evidenciji:{" "}
            {rupe
              .map((p) => `tank ${brojTanka.get(p.tankId) ?? "?"} (${fDatum(p.od)} – ${fDatum(p.do)})`)
              .join(", ")}{" "}
            — vino je ondje stajalo dulje od tri dana bez ijednog zapisa.
          </div>
        ) : null}
      </Card>

      <Card title="Parametri">
        <div style={izvorStil}>
          {snimka
            ? "vrijednosti iz snimke u trenutku izlaska (s pravilom fermentacije i procjenom iz blenda, kao monitor) · graf kroz vrijeme iz knjige"
            : "iz knjige — mjerenja ovog vina kroz sve posude, bez pravila fermentacije i bez procjene iz blenda"}
        </div>
        {snimka ? (
          <div style={{ padding: 10 }}>
            <ParametriPoPolju parametri={prikazParametara} />
          </div>
        ) : parametri ? (
          <div style={{ padding: 10 }}>
            <ParametriPoPolju parametri={prikazParametara} />
          </div>
        ) : knjigaVidiVino ? (
          <div style={praznoStil}>Za ovo vino nema nijednog mjerenja.</div>
        ) : (
          // Ne "nema mjerenja": o mjerenjima se ovdje nista ne zna, jer knjiga
          // vino u tom trenutku u posudi ne vidi.
          <div style={praznoStil}>
            Vino je u tank {brIz} ušlo i iz njega otišlo istim trenutkom, pa ga
            knjiga u tom trenutku ondje ne vidi. Parametri su na kućicama ispod,
            pod „Odakle je to vino".
          </div>
        )}
      </Card>

      {izvori.length > 0 ? (
        <Card title="Odakle je to vino" broj={izvori.length}>
          <div style={{ display: "grid", gap: 6, padding: 10 }}>
            {izvori.map((st, i) => {
              const s = st.sastavnica;
              const href = hrefKucice(korijenId, s);
              const imeStavke = imenaIzvora[i];
              // Ime vina kad je poznato; inace sorta i partija iz sastava.
              // Broj posude nije naziv — ide u sivi redak (vlasnik, 09.10.2026.).
              const naziv =
                imeStavke?.naziv ??
                nazivStavke(s, oznakaPartije) ??
                (s.vino.vrsta === "partija"
                  ? `berba · ${s.vino.nazivSorte}`
                  : s.vino.vrsta === "posuda"
                    ? nazivVinaBezSastava(s.vino.razlog)
                    : "Vino");
              const izTanka =
                s.vino.vrsta !== "partija" && s.vino.tankId !== st.roditeljTankId
                  ? brojTanka.get(s.vino.tankId) ?? null
                  : null;
              return (
                <div key={i} style={redakStil}>
                  <div style={{ display: "grid", gap: 2 }}>
                    <strong>
                      {naziv}
                      {imeStavke?.sifra ? <span style={sifraStil}> · {imeStavke.sifra}</span> : null}
                    </strong>
                    <span style={tihoStil}>
                      {fBroj(st.litre)} L · {fBroj(st.udio * 100, 0)} %
                      {izTanka != null ? ` · iz tanka ${izTanka}` : ""} · ušlo {fDatum(s.usloAt)}
                      {s.progutano ? " · dolijevanje" : ""}
                      {st.sazeta && st.kalo > 0.5
                        ? ` · kalo ukupno ${fBroj(st.kalo)} L (${fBroj((st.kalo / st.otpusteno) * 100, 1)} %)`
                        : ""}
                    </span>
                  </div>
                  {href ? (
                    <Link href={href} style={poveznicaStil}>
                      {s.vino.vrsta === "partija" ? "berba" : "prošlost vina"}
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </main>
  );
}

const stranicaStil: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: 16,
  display: "grid",
  gap: 14,
};
const naslovStil: React.CSSProperties = { margin: 0, fontSize: 26, fontWeight: 600 };
/** Datum u naslovu — dio recenice, ali tisi od imena. */
const naslovDatumStil: React.CSSProperties = { fontWeight: 400, color: "#6b7280", fontSize: 20 };
/** Sifra uz ime — kao na kucici stranice tanka. */
const sifraStil: React.CSSProperties = {
  fontWeight: 400,
  color: "#4b5563",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};
const podnaslovStil: React.CSSProperties = { fontSize: 14, color: "#374151" };
const napomenaStil: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  borderLeft: "3px solid #d1d5db",
  paddingLeft: 8,
  marginTop: 4,
};
const tihoStil: React.CSSProperties = { fontSize: 13, color: "#6b7280", padding: "2px 0" };
const praznoStil: React.CSSProperties = { ...tihoStil, padding: 10 };
/** Oznaka izvora na kartici — obavezna, vidi zaglavlje (odluka 2). */
const izvorStil: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  padding: "8px 10px 0",
  fontStyle: "italic",
};
const poveznicaStil: React.CSSProperties = { color: "#1f6f8b", fontSize: 14 };
const redakStil: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  borderBottom: "1px solid #f0f0f0",
  paddingBottom: 6,
  minWidth: 0,
};
const skupinaStil: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151" };
const stavkaStil: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 14,
  padding: "2px 0",
};
const datumStil: React.CSSProperties = { color: "#6b7280", fontVariantNumeric: "tabular-nums" };
const rupaStil: React.CSSProperties = {
  margin: 10,
  padding: 8,
  fontSize: 13,
  color: "#7f1d1d",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 6,
};
