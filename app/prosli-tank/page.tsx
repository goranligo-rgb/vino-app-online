import Link from "next/link";
import type React from "react";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";
import { citajUlazneCine, vinoUTanku, type Sastavnica } from "@/lib/identitet-vina";
import { podrijetloTanka } from "@/lib/berba-model";
import { granicaVina } from "@/lib/granica-vina";
import { imeVina, imeZaPrikaz } from "@/lib/ime-vina";
import { parametriVinaIzKnjige } from "@/lib/parametri-vina";
import {
  povijestVina,
  type RedakRadnje,
  type RedakArhivskeRadnje,
  type RedakMjerenjaPosude,
} from "@/lib/povijest-vina";
import {
  kvasciKucice,
  pojaveKucice,
  prozoriKucice,
  rastaviKljucCina,
} from "@/lib/prosli-tank";
import { imeIzSnimke, kvasciIzSnimke, snimkaKucice } from "@/lib/snimka-vina";
import { POLJA_MONITORA } from "@/lib/monitor-vina";
import { Card } from "@/app/tankovi/[id]/kartica";
import ParametriPoPolju, {
  type ParametarPrikaz,
} from "@/app/tankovi/[id]/parametri-po-polju";

/**
 * PROSLI TANK — kucica iz sastava, otvorena kao vino ZAMRZNUTO na trenutak
 * ulaska u drugi tank. Samo za gledanje: nijedna akcija, nijedan upis.
 * ======================================================================
 *
 * Adresa: /prosli-tank?korijen=<tank>&iz=<tank>&cin=<Sastavnica.kljucCina>
 *   korijen — tank s cije je stranice kucica otvorena; njegov `VinoRadnja`
 *             daje kvasce, a njegovo stablo odredjuje kucicu;
 *   iz      — posuda iz koje je vino doslo (za vino koje je u posudi vec
 *             bilo: sama ta posuda);
 *   cin     — cin kojim je vino uslo (lib/identitet-vina.ts, `kljucCina`).
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

function hrefKucice(korijenId: string, s: Sastavnica): string | null {
  if (s.vino.vrsta === "partija") return `/berba/${s.vino.berbaId}`;
  return (
    `/prosli-tank?korijen=${encodeURIComponent(korijenId)}` +
    `&iz=${encodeURIComponent(s.vino.tankId)}` +
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
  const korijenId = jedan(sp.korijen);
  const izTankId = jedan(sp.iz);
  const kljucCina = jedan(sp.cin);
  if (!korijenId || !izTankId || !kljucCina) return notFound();

  // Upiti idu redom, ne u Promise.all — pooler drzi 15 veza za cijelu
  // aplikaciju, a `citajUlazneCine` sam trosi nekoliko.
  const sviTankovi = await prisma.tank.findMany({ select: { id: true, broj: true } });
  const brojTanka = new Map(sviTankovi.map((t) => [t.id, t.broj]));
  if (!brojTanka.has(korijenId) || !brojTanka.has(izTankId)) return notFound();

  const knjiga = await citajUlazneCine(prisma, sviTankovi.map((t) => t.id));
  const sorteBerbi = new Map(
    (await prisma.berba.findMany({ select: { id: true, nazivSorte: true } })).map(
      (b) => [b.id, b.nazivSorte] as const
    )
  );

  // Kucica se trazi u DANASNJEM stablu korijena, istom koje crta stranica
  // tanka — tako ima i udio u korijenu, bez kojeg nema prijevoda kvasaca.
  const podKorijena = await podrijetloTanka(prisma, korijenId);
  const korijen = vinoUTanku(
    knjiga.cini,
    sorteBerbi,
    korijenId,
    Date.now(),
    {},
    [],
    podKorijena.ukupnoL
  );

  const pojave = pojaveKucice(korijen, izTankId, kljucCina);
  // Nema je: poveznica je stara (cin ponisten, knjiga ispravljena) ili je
  // rucno sastavljena. Pogadjati se ne smije.
  if (pojave.length === 0) return notFound();

  const kucica = pojave[0].sastavnica;
  const roditeljTankId = pojave[0].roditeljTankId;
  const vecBiloUPosudi = izTankId === roditeljTankId;
  const trenutak = new Date(kucica.usloAt.getTime() - 1);

  // SNIMKA — vino kakvo je bilo kad je izaslo iz posude (razina 2 arhive).
  // `null` za sve kucice od prije koraka 2, za vino koje je u posudi vec bilo
  // i za kretanja koja nisu izlazak; tada sve ide iz knjige kao prije.
  const snimka = await snimkaKucice(prisma, { kljucCina, izTankId, roditeljTankId });

  const granica = await granicaVina(prisma, izTankId, { doTrenutka: trenutak, zadnjeVino: true });
  const ime = imeZaPrikaz(
    snimka
      ? imeIzSnimke(snimka)
      : await imeVina(prisma, izTankId, granica, { doTrenutka: trenutak })
  );
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
    : kvasciKucice(
        korijen,
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

  // IZ SNIMKE: svih osam polja monitora, redom kao na stranici tanka, s
  // podrijetlom kakvo je monitor tada pokazivao. Snimka ne nosi racun blenda
  // ni posude iz knjige, pa ih ploca ne tvrdi (`blend`/`izKnjige` bez detalja).
  const poljaSnimke = new Map((snimka?.polja ?? []).map((p) => [p.kljuc, p]));
  const prikazIzSnimke: ParametarPrikaz[] = POLJA_MONITORA.map((o): ParametarPrikaz => {
    const p = poljaSnimke.get(o.kljuc);
    const podrijetlo = (p?.podrijetlo.toLowerCase() ?? "nema") as ParametarPrikaz["podrijetlo"];
    const datum = p?.izmjerenoAt ? p.izmjerenoAt.toISOString() : null;
    return {
      kljuc: o.kljuc,
      naziv: o.naziv,
      jedinica: o.jedinica,
      vrijednost: p?.vrijednost ?? null,
      podrijetlo,
      datum: podrijetlo === "mjereno" || podrijetlo === "preneseno" ? datum : null,
      // NEMA u snimci ne znaci "nije mjereno": monitor je vrijednost iz knjige
      // mogao i sakriti jer je vino fermentiralo. Razlog snimka ne nosi, pa se
      // kaze samo ono sto se zna.
      neprikazano:
        p?.vrijednost == null ? "monitor je u trenutku izlaska nije pokazivao" : null,
      // `postotak` ploca ne prikazuje (tip ga trazi); posude snimka ne nosi.
      izKnjige: podrijetlo === "knjiga" ? { mjerenoAt: datum, posude: [], postotak: 100 } : null,
      niz: nizZaGraf(o.kljuc),
      blend: null,
    };
  });

  const prikazParametara: ParametarPrikaz[] = snimka ? prikazIzSnimke : POLJA.map((o): ParametarPrikaz => {
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
  const brKorijen = brojTanka.get(korijenId);
  const izvori = kucica.vino.vrsta === "spoj" ? kucica.vino.sastavnice : [];

  return (
    <main style={stranicaStil}>
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/tankovi/${korijenId}`} style={poveznicaStil}>
          ← Tank {brKorijen}
        </Link>
        <div style={nadnaslovStil}>
          Vino iz tanka {brIz}, kakvo je bilo {fDatumSat(kucica.usloAt)}
        </div>
        <h1 style={naslovStil}>{ime.tekst}</h1>
        <div style={podnaslovStil}>
          {vecBiloUPosudi
            ? `Vino koje je već bilo u tanku ${brIz} kad je u njega ušlo novo — ${fBroj(kucica.litre)} L.`
            : `Ušlo ${fBroj(kucica.litre)} L u tank ${brRoditelj}` +
              (kucica.progutano ? " kao dolijevanje" : "") +
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

      <Card title="Kvasci" broj={kvasci.length}>
        <div style={izvorStil}>
          {snimka
            ? "iz snimke u trenutku izlaska — udio u vinu ove kućice"
            : `iz knjige — udio iz zapisa tanka ${brKorijen}, preveden na ovu kućicu`}
        </div>
        {kvasci.length === 0 ? (
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
            {izvori.map((s, i) => {
              const href = hrefKucice(korijenId, s);
              const naziv =
                s.vino.vrsta === "partija"
                  ? `berba · ${s.vino.nazivSorte}`
                  : `Tank ${brojTanka.get(s.vino.tankId) ?? "?"}`;
              return (
                <div key={i} style={redakStil}>
                  <div style={{ display: "grid", gap: 2 }}>
                    <strong>{naziv}</strong>
                    <span style={tihoStil}>
                      {fBroj(s.litre)} L · {fBroj(s.udio * 100, 0)} % · ušlo {fDatum(s.usloAt)}
                      {s.progutano ? " · dolijevanje" : ""}
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
const nadnaslovStil: React.CSSProperties = { fontSize: 13, color: "#6b7280" };
const naslovStil: React.CSSProperties = { margin: 0, fontSize: 26, fontWeight: 600 };
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
