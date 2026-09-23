"use client";

/**
 * IZVJESTAJ O BERBI — cita knjigu berbe (`/api/berba`), ne punjenja.
 *
 * SAMO ONO STO JE USLO
 * --------------------
 * Sorta, kilogrami, litre, datum berbe, polozaj, secer, kiseline, pH i oznaka.
 * Sve su to podaci o TRENUTKU ULASKA u podrum i ne mijenjaju se nikad: berba
 * 2026 je 15.650 L i nakon sto je pola prodano ili napunjeno u boce.
 *
 * JEDNA TABLICA (tablica-berbe.tsx), racun u lib/berba-tablica.ts — isti koji
 * zove izvoz u Excel. Tank nije stupac: u koje je tankove berba usla stoji na
 * /berba/[id], kamo vodi sorta u retku.
 *
 * KAMO JE VINO POSLIJE OTISLO OVDJE NE PISE. To je stanje vina, ne podatak o
 * berbi, i vec ima svoje mjesto — monitor tanka i pracenje vina. Knjiga
 * kretanja (`gdjeJeSveBerbe` u lib/berba-model.ts) i dalje sve to zna; ova je
 * stranica samo ne pita.
 *
 * ZATECENO
 * --------
 * `vrstaUnosa = ZATECENO` nije berba nego rekonstrukcija: staro arhiviranje
 * brisalo je punjenja, pa knjiga za dio vina zna kolicinu ali ne i podrijetlo.
 * Takvi zapisi imaju vlastiti odjeljak i ZADANO NE ulaze u zbrojeve — inace bi
 * berba 2026 ispala 127.935 L umjesto 15.650 L, a najveca "sorta" u podrumu
 * zvala bi se "Nepoznato podrijetlo". Prekidac ih moze ukljuciti, i tada su
 * kartice vidljivo oznacene.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatHrDate } from "@/lib/datum";
import {
  BEZ_GODISTA,
  type Prosjek,
  type RedakBerbe,
  type Sazetak,
  filtrirajTekst,
  izracunajSazetak,
  kljucGodine,
} from "@/lib/berba-tablica";
import TablicaBerbe, { formatBroj } from "./tablica-berbe";

/** Zapis iz `/api/berba`. Oblik i racun zive u lib/berba-tablica.ts. */
type Berba = RedakBerbe;
type SazetakGodine = Sazetak;

type SortaPoGodinama = {
  sorta: string;
  poGodinama: Record<string, SazetakGodine>;
};

function uniqueSorted(values: (string | number | null | undefined)[]) {
  return [
    ...new Set(
      values
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(String)
    ),
  ].sort((a, b) => a.localeCompare(b, "hr"));
}

/**
 * KG PO BERACU PO SATU — brzina branja, ne prinos.
 *
 * `kilogrami / (trajanje_sati * broj_beraca)`. Trajanje je cisto vrijeme
 * branja; prijevoz i pauze se ne racunaju jer se ni ne mjere.
 *
 * NE ZBRAJA PO RETKU. Jedna berba zna uci u vise punjenja, a svako punjenje
 * stvara SVOJ zapis s ISTIM kilogramima i istim vremenom — Sauvignon s parcele
 * 13 od 27.08.2026. stoji u tri retka, svaki sa 8.400 kg. Zbrajanje po retku
 * utrostrucilo bi i kilograme i sate. Grupa je (datum, sorta, parcela), isto
 * pravilo koje vec vrijedi za same kilograme.
 *
 * SAMO VLASTITA BERBA. Kooperantsko grozdje nemaju brali nasi ljudi, pa u
 * prosjek ne ulazi. `vlastitaBerba === null` (svih 52 zatecena zapisa) takodjer
 * ne ulazi — ne zna se cije je.
 */
type BrzinaBranja = {
  /** Prosjek ponderiran kilogramima, ne prosjek prosjeka. */
  kgPoBeracuSat: number | null;
  /** Koliko je berbi (grupa) uslo u racun i koliko ih je ukupno bilo. */
  izmjereno: number;
  ukupno: number;
  kg: number;
  radniSati: number;
};

function kljucGrupe(z: Berba): string {
  return [
    (z.datumBerbe ?? "").slice(0, 10),
    z.nazivSorte.trim().toLocaleLowerCase("hr"),
    (z.parcela ?? "").trim().toLocaleLowerCase("hr"),
  ].join("|");
}

function satiBranja(z: Berba): number | null {
  if (!z.pocetakBranja || !z.krajBranja) return null;
  const od = new Date(z.pocetakBranja).getTime();
  const doo = new Date(z.krajBranja).getTime();
  if (!Number.isFinite(od) || !Number.isFinite(doo) || doo <= od) return null;
  return (doo - od) / 3_600_000;
}

function izracunajBrzinu(zapisi: Berba[]): BrzinaBranja {
  // Vlastite berbe, skupljene po grupi — svaka grupa ulazi JEDNOM.
  const grupe = new Map<string, Berba>();
  for (const z of zapisi) {
    if (z.vlastitaBerba !== true) continue;
    const k = kljucGrupe(z);
    if (!grupe.has(k)) grupe.set(k, z);
  }

  let kg = 0;
  let radniSati = 0;
  let izmjereno = 0;

  for (const z of grupe.values()) {
    const sati = satiBranja(z);
    const beraca = z.brojBeraca ?? 0;
    const kgGrupe = z.kolicinaKgGrozdja ?? 0;
    if (sati == null || beraca <= 0 || kgGrupe <= 0) continue;

    kg += kgGrupe;
    radniSati += sati * beraca;
    izmjereno++;
  }

  return {
    // Ponderirano kilogramima: velika berba nosi vise od male, kao i svugdje
    // drugdje u ovoj aplikaciji.
    kgPoBeracuSat: radniSati > 0 ? kg / radniSati : null,
    izmjereno,
    ukupno: grupe.size,
    kg,
    radniSati,
  };
}

function KarticaBroj({
  naslov,
  vrijednost,
  podnaslov,
}: {
  naslov: string;
  vrijednost: string;
  podnaslov?: string;
}) {
  return (
    <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/70 px-4 py-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
        {naslov}
      </div>
      <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">
        {vrijednost}
      </div>
      {podnaslov ? (
        <div className="mt-2 text-[12px] text-stone-500">{podnaslov}</div>
      ) : null}
    </div>
  );
}

/**
 * Prosjek s brojem zapisa ispod. "—" kad ga nema iz cega izracunati.
 *
 * Ponderiran kilogramima — isti racun kao podnozje tablice (lib/berba-tablica.ts),
 * da gore i dolje ne stoje dva razlicita broja za istu stvar.
 */
function KarticaProsjek({
  naslov,
  p,
  digits = 2,
}: {
  naslov: string;
  p: Prosjek;
  digits?: number;
}) {
  return (
    <KarticaBroj
      naslov={naslov}
      vrijednost={p.vrijednost == null ? "—" : formatBroj(p.vrijednost, digits)}
      podnaslov={
        p.vrijednost == null
          ? `nema podatka s kg ni na jednom od ${p.od}`
          : `ponderirano po kg · ${p.n} od ${p.od}`
      }
    />
  );
}

function Oznaka({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "soft" | "strong" | "upozorenje";
}) {
  const cls =
    variant === "strong"
      ? "border-emerald-300 bg-gradient-to-b from-emerald-100 to-lime-100 text-emerald-950"
      : variant === "soft"
      ? "border-lime-200 bg-lime-50 text-lime-800"
      : variant === "upozorenje"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <span className={`inline-flex border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

export default function BerbaPage() {
  const [sve, setSve] = useState<Berba[]>([]);
  const [loading, setLoading] = useState(true);
  const [greska, setGreska] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [aktivnaGodina, setAktivnaGodina] = useState("");
  const [otvoriUsporedbu, setOtvoriUsporedbu] = useState(false);
  const [godineUsporedba, setGodineUsporedba] = useState<string[]>([]);

  // ZADANO ISKLJUCEN. Vidi zaglavlje datoteke.
  const [ukljuciZateceno, setUkljuciZateceno] = useState(false);

  const [filterTekst, setFilterTekst] = useState("");

  async function ucitaj() {
    try {
      setLoading(true);
      setGreska("");

      const res = await fetch("/api/berba", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setGreska(json?.error || "Greška kod dohvaćanja podataka.");
        setSve([]);
        return;
      }

      setSve(Array.isArray(json?.berbe) ? json.berbe : []);
    } catch (error) {
      console.error(error);
      setGreska("Greška kod dohvaćanja podataka o berbi.");
      setSve([]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Brisanje ide na stavku punjenja iz koje je zapis nastao. Ruta poslije toga
   * povlaci BAS TU berbu iz knjige i oznaci je obrisanom — ali samo dok je jos
   * cijela u svom tanku. Ako je dio pretocen dalje, vraca 400 s uputom, i to se
   * pokazuje korisniku umjesto tihog neuspjeha.
   */
  async function obrisiBerbu(b: Berba) {
    if (!b.izvornaPunjenjeStavkaId) return;

    const potvrda = window.confirm(
      `Obrisati zapis berbe „${b.nazivSorte}” (${formatBroj(
        b.kolicinaLitara,
        0
      )} L)?\n\n` +
        "Ovo znači da unos NIJE BIO TOČAN — to vino se povlači iz knjige. " +
        "Ako je vino stvarno otišlo iz tanka, ovo nije prava radnja."
    );
    if (!potvrda) return;

    try {
      setDeletingId(b.id);

      const res = await fetch(
        `/api/punjenje-stavka/${b.izvornaPunjenjeStavkaId}`,
        { method: "DELETE" }
      );

      const json = await res.json();

      if (!res.ok) {
        alert(json?.error || "Greška kod brisanja stavke.");
        return;
      }

      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error(error);
      alert("Greška kod brisanja stavke.");
    } finally {
      setDeletingId("");
    }
  }

  useEffect(() => {
    ucitaj();
  }, [refreshKey]);

  // --- razdvajanje: berba vs zateceno -------------------------------------

  const berbe = useMemo(
    () => sve.filter((b) => b.vrstaUnosa === "BERBA"),
    [sve]
  );

  const zatecene = useMemo(
    () => sve.filter((b) => b.vrstaUnosa === "ZATECENO"),
    [sve]
  );

  /** Podloga za SVE zbrojeve. Zateceno ulazi samo ako je prekidac ukljucen. */
  const podloga = useMemo(
    () => (ukljuciZateceno ? sve : berbe),
    [sve, berbe, ukljuciZateceno]
  );

  // --- godine --------------------------------------------------------------

  const godine = useMemo(() => {
    const kljucevi = new Set(podloga.map(kljucGodine));
    const brojcane = [...kljucevi]
      .filter((k) => k !== BEZ_GODISTA)
      .sort((a, b) => Number(b) - Number(a));

    return kljucevi.has(BEZ_GODISTA) ? [...brojcane, BEZ_GODISTA] : brojcane;
  }, [podloga]);

  const nazivGodine = (k: string) =>
    k === BEZ_GODISTA ? "Bez godišta" : `Berba ${k}`;

  useEffect(() => {
    if (godine.length === 0) return;
    if (!aktivnaGodina || !godine.includes(aktivnaGodina)) {
      setAktivnaGodina(godine[0]);
    }
  }, [godine, aktivnaGodina]);

  useEffect(() => {
    if (aktivnaGodina && godineUsporedba.length === 0) {
      setGodineUsporedba([aktivnaGodina]);
    }
  }, [aktivnaGodina, godineUsporedba.length]);

  const uGodini = useMemo(() => {
    if (!aktivnaGodina) return podloga;
    return podloga.filter((b) => kljucGodine(b) === aktivnaGodina);
  }, [podloga, aktivnaGodina]);

  // --- trazilica -----------------------------------------------------------

  /**
   * Prikazani zapisi: godina + zateceno + trazilica (sorta i polozaj). Kartice
   * gore i tablica racunaju nad istim skupom; sortiranje i kvacice su tablicini.
   */
  const filtrirani = useMemo(
    () => filtrirajTekst(uGodini, filterTekst),
    [uGodini, filterTekst]
  );

  // --- sazetak -------------------------------------------------------------

  const sazetak = useMemo(() => izracunajSazetak(filtrirani), [filtrirani]);
  const brzina = useMemo(() => izracunajBrzinu(filtrirani), [filtrirani]);

  const najzastupljenijaSorta = useMemo(() => {
    const poSorti = new Map<string, number>();
    for (const b of filtrirani) {
      poSorti.set(
        b.nazivSorte,
        (poSorti.get(b.nazivSorte) ?? 0) + (b.kolicinaLitara || 0)
      );
    }
    return [...poSorti.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
  }, [filtrirani]);

  // --- usporedba godina ----------------------------------------------------

  const usporedbaUkupno = useMemo<Record<string, SazetakGodine>>(() => {
    const r: Record<string, SazetakGodine> = {};
    for (const g of godineUsporedba) {
      r[g] = izracunajSazetak(podloga.filter((b) => kljucGodine(b) === g));
    }
    return r;
  }, [podloga, godineUsporedba]);

  const usporedbaPoSortama = useMemo<SortaPoGodinama[]>(() => {
    const sveSorte = uniqueSorted(
      podloga
        .filter((b) => godineUsporedba.includes(kljucGodine(b)))
        .map((b) => b.nazivSorte)
    );

    return sveSorte
      .map((sorta) => {
        const poGodinama: Record<string, SazetakGodine> = {};

        for (const g of godineUsporedba) {
          poGodinama[g] = izracunajSazetak(
            podloga.filter(
              (b) => kljucGodine(b) === g && b.nazivSorte === sorta
            )
          );
        }

        return { sorta, poGodinama };
      })
      .sort((a, b) => {
        const zbroj = (x: SortaPoGodinama) =>
          godineUsporedba.reduce((s, g) => s + (x.poGodinama[g]?.litara || 0), 0);
        return zbroj(b) - zbroj(a);
      });
  }, [podloga, godineUsporedba]);

  const zateceneUGodini = useMemo(() => {
    if (!aktivnaGodina) return zatecene;
    return zatecene.filter((b) => kljucGodine(b) === aktivnaGodina);
  }, [zatecene, aktivnaGodina]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f6f2_0%,#eef5ef_45%,#eaf3ed_100%)] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1540px]">
        <div className="mb-4 border border-emerald-200 bg-gradient-to-r from-emerald-950/95 via-emerald-900/90 to-lime-900/80 px-5 py-6 text-white shadow-[0_18px_36px_rgba(22,101,52,0.14)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/65">
                VINOGRAD / BERBA
              </div>
              <h1 className="mt-1 text-[30px] font-semibold tracking-tight">
                Izvještaj o berbi
              </h1>
              <p className="mt-2 max-w-[860px] text-[14px] leading-6 text-white/80">
                Koliko je ubrano, po sortama i položajima. Količine su
                povijesna činjenica i ne mijenjaju se kad vino ode iz tanka.
                Kamo je poslije otišlo vidi se u monitoru tanka i praćenju
                vina — to je stanje vina, ne podatak o berbi.
              </p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/dashboard"
                className="border border-white/20 bg-white/90 px-4 py-2 text-[13px] font-medium text-stone-700 transition hover:bg-white"
              >
                Natrag
              </Link>

              <Link
                href="/punjenje"
                className="border border-lime-300/40 bg-gradient-to-b from-lime-200 to-emerald-100 px-4 py-2 text-[13px] font-semibold text-emerald-950 transition hover:brightness-105"
              >
                Novo punjenje
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-4 border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/70 p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                Aktivna berba
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <select
                  value={aktivnaGodina}
                  onChange={(e) => {
                    setAktivnaGodina(e.target.value);
                    setFilterTekst("");
                  }}
                  className="border border-emerald-300 bg-white px-4 py-3 text-[18px] font-semibold text-stone-800 outline-none focus:border-emerald-500"
                >
                  {godine.map((g) => (
                    <option key={g} value={g}>
                      {nazivGodine(g)}
                    </option>
                  ))}
                </select>

                {aktivnaGodina === BEZ_GODISTA ? (
                  <Oznaka variant="upozorenje">Zapisi bez godišta</Oznaka>
                ) : aktivnaGodina ? (
                  <Oznaka variant="strong">Godina {aktivnaGodina}</Oznaka>
                ) : null}

                {uGodini.some((b) => b.godinaIzvedena) ? (
                  <Oznaka variant="soft">
                    {uGodini.filter((b) => b.godinaIzvedena).length} zapisa bez
                    upisanog godišta — godina izvedena iz datuma ulaska u podrum
                  </Oznaka>
                ) : null}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 border border-emerald-200 bg-white px-3 py-2 text-[13px] text-stone-700">
              <input
                type="checkbox"
                checked={ukljuciZateceno}
                onChange={(e) => setUkljuciZateceno(e.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
              Uključi zatečeno u zbrojeve
            </label>
          </div>

          {ukljuciZateceno ? (
            <div className="mb-3 border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Zbrojevi ispod uključuju i <strong>zatečeno vino</strong> — ono
              kojemu knjiga zna količinu ali ne i podrijetlo. To više nije
              statistika berbe.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
            <KarticaBroj
              naslov="Ubrano litara"
              vrijednost={`${formatBroj(sazetak.litara, 0)} L`}
              podnaslov="ne mijenja se kad vino ode"
            />
            <KarticaBroj
              naslov="Ubrano kg grožđa"
              vrijednost={`${formatBroj(sazetak.kg, 0)} kg`}
            />
            <KarticaBroj
              naslov="Zapisa berbe"
              vrijednost={String(sazetak.zapisa)}
            />
            <KarticaBroj
              naslov="Sorte"
              vrijednost={String(sazetak.sorte)}
              podnaslov={
                najzastupljenijaSorta !== "-"
                  ? `glavna: ${najzastupljenijaSorta}`
                  : undefined
              }
            />
            <KarticaBroj
              naslov="kg po beraču po satu"
              vrijednost={
                brzina.kgPoBeracuSat == null
                  ? "—"
                  : formatBroj(brzina.kgPoBeracuSat, 1)
              }
              podnaslov={`izmjereno na ${brzina.izmjereno} od ${brzina.ukupno} berbi`}
            />
            <KarticaProsjek naslov="Šećer °Oe" p={sazetak.secer} digits={1} />
            <KarticaProsjek naslov="Kiseline" p={sazetak.kiseline} />
            <KarticaProsjek naslov="pH" p={sazetak.ph} />
          </div>

          {/* TRI OGRADE UZ BROJ. Bez njih "kg po beracu po satu" laze na tri
              nacina: da ukljucuje sve berbe, da mjeri prinos i da vrijedi za
              tude grozdje. */}
          <div className="mt-3 border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12px] leading-relaxed text-emerald-900">
            <strong>kg po beraču po satu</strong> mjeri brzinu branja, ne prinos
            — kilogrami su kilogrami grožđa, a randman se razlikuje po sorti.{" "}
            {brzina.kgPoBeracuSat == null ? (
              <>
                Još nema nijedne berbe s upisanim vremenom i brojem berača, pa
                se broj ne može izračunati.
              </>
            ) : (
              <>
                Izmjereno na <strong>{brzina.izmjereno}</strong> od{" "}
                <strong>{brzina.ukupno}</strong>{" "}
                {brzina.ukupno === 1 ? "berbe" : "berbi"}; ostale nemaju upisano
                vrijeme ili broj berača i <strong>ne ulaze u prosjek</strong> —
                ne broje se kao nula. Ukupno {formatBroj(brzina.kg, 0)} kg kroz{" "}
                {formatBroj(brzina.radniSati, 1)} radnih sati.
              </>
            )}{" "}
            U prosjek ulazi <strong>samo vlastita berba</strong>: kooperantsko
            grožđe nisu brali naši ljudi. Berba koja je ušla u više punjenja
            broji se jednom.
          </div>
        </div>

        <div className="mb-4 border border-emerald-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                Usporedba berbi
              </div>
              <div className="mt-1 text-[14px] text-stone-700">
                Najprije ukupna usporedba godišta, a ispod detaljno po sortama.
                Šećer, kiseline i pH su prosjeci ponderirani po kg.
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setOtvoriUsporedbu((prev) => {
                  const next = !prev;
                  if (!prev && aktivnaGodina && godineUsporedba.length === 0) {
                    setGodineUsporedba([aktivnaGodina]);
                  }
                  return next;
                });
              }}
              className="border border-emerald-300 bg-gradient-to-b from-emerald-100 to-lime-100 px-4 py-2 text-[13px] font-semibold text-emerald-950 transition hover:brightness-105"
            >
              {otvoriUsporedbu ? "Zatvori usporedbu" : "Usporedi berbe"}
            </button>
          </div>
        </div>

        {otvoriUsporedbu && (
          <div className="mb-4 border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
            <div className="mb-3 text-[16px] font-semibold text-stone-800">
              Odaberi godišta za usporedbu
            </div>

            {godine.length < 2 ? (
              <div className="mb-4 border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                Knjiga zasad ima samo jedno godište, pa usporedba pokazuje jedan
                stupac. Starije berbe nisu sačuvane — staro arhiviranje brisalo
                je punjenja.
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap gap-2">
              {godine.map((g) => {
                const aktivno = godineUsporedba.includes(g);

                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      setGodineUsporedba((prev) =>
                        prev.includes(g)
                          ? prev.filter((x) => x !== g)
                          : [...prev, g].sort((a, b) => {
                              if (a === BEZ_GODISTA) return 1;
                              if (b === BEZ_GODISTA) return -1;
                              return Number(b) - Number(a);
                            })
                      )
                    }
                    className={`border px-4 py-2 text-[13px] font-medium transition ${
                      aktivno
                        ? "border-emerald-400 bg-gradient-to-b from-emerald-100 to-lime-100 text-emerald-950"
                        : "border-emerald-200 bg-white text-stone-600 hover:bg-emerald-50"
                    }`}
                  >
                    {nazivGodine(g)}
                  </button>
                );
              })}
            </div>

            {godineUsporedba.length === 0 ? (
              <div className="text-[13px] text-stone-500">
                Odaberi barem jedno godište za usporedbu.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-emerald-200 bg-white">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-emerald-100/70 text-left text-[12px] uppercase tracking-[0.12em] text-emerald-900">
                        <th className="border border-emerald-200 px-3 py-2">
                          Ukupno
                        </th>
                        {godineUsporedba.map((g) => (
                          <th key={g} className="border border-emerald-200 px-3 py-2">
                            {nazivGodine(g)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Ubrano litara", (d: SazetakGodine) => `${formatBroj(d.litara, 0)} L`],
                          ["Ubrano kg grožđa", (d: SazetakGodine) => `${formatBroj(d.kg, 0)} kg`],
                          ["Zapisa berbe", (d: SazetakGodine) => String(d.zapisa)],
                          ["Sorti", (d: SazetakGodine) => String(d.sorte)],
                          [
                            "Prosječni šećer",
                            (d: SazetakGodine) =>
                              d.secer.vrijednost == null
                                ? "—"
                                : `${formatBroj(d.secer.vrijednost, 2)} (n=${d.secer.n}/${d.secer.od})`,
                          ],
                          [
                            "Prosječne kiseline",
                            (d: SazetakGodine) =>
                              d.kiseline.vrijednost == null
                                ? "—"
                                : `${formatBroj(d.kiseline.vrijednost, 2)} (n=${d.kiseline.n}/${d.kiseline.od})`,
                          ],
                          [
                            "Prosječni pH",
                            (d: SazetakGodine) =>
                              d.ph.vrijednost == null
                                ? "—"
                                : `${formatBroj(d.ph.vrijednost, 2)} (n=${d.ph.n}/${d.ph.od})`,
                          ],
                        ] as Array<[string, (d: SazetakGodine) => string]>
                      ).map(([naslov, prikaz]) => (
                        <tr key={naslov} className="bg-white text-[13px] text-stone-700">
                          <td className="border border-emerald-100 px-3 py-2 font-semibold">
                            {naslov}
                          </td>
                          {godineUsporedba.map((g) => (
                            <td key={g} className="border border-emerald-100 px-3 py-2">
                              {usporedbaUkupno[g] ? prikaz(usporedbaUkupno[g]) : "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border border-emerald-200 bg-white">
                  <div className="border-b border-emerald-200 px-4 py-3 text-[15px] font-semibold text-stone-800">
                    Usporedba po sortama
                  </div>

                  {usporedbaPoSortama.length === 0 ? (
                    <div className="p-4 text-[13px] text-stone-500">
                      Nema podataka za odabrana godišta.
                    </div>
                  ) : (
                    <div className="space-y-4 p-4">
                      {usporedbaPoSortama.map((s) => (
                        <div key={s.sorta} className="border border-emerald-200">
                          <div className="border-b border-emerald-200 bg-emerald-50/60 px-4 py-2 text-[15px] font-semibold text-stone-800">
                            {s.sorta}
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse">
                              <thead>
                                <tr className="bg-emerald-100/50 text-left text-[12px] uppercase tracking-[0.12em] text-emerald-900">
                                  <th className="border border-emerald-100 px-3 py-2">
                                    Podatak
                                  </th>
                                  {godineUsporedba.map((g) => (
                                    <th
                                      key={g}
                                      className="border border-emerald-100 px-3 py-2"
                                    >
                                      {nazivGodine(g)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(
                                  [
                                    ["Litara", (d: SazetakGodine) => `${formatBroj(d?.litara, 0)} L`],
                                    ["Kg grožđa", (d: SazetakGodine) => `${formatBroj(d?.kg, 0)} kg`],
                                    ["Zapisa", (d: SazetakGodine) => String(d?.zapisa ?? 0)],
                                    [
                                      "Šećer",
                                      (d: SazetakGodine) =>
                                        d?.secer?.vrijednost == null
                                          ? "—"
                                          : formatBroj(d.secer.vrijednost, 2),
                                    ],
                                    [
                                      "Kiseline",
                                      (d: SazetakGodine) =>
                                        d?.kiseline?.vrijednost == null
                                          ? "—"
                                          : formatBroj(d.kiseline.vrijednost, 2),
                                    ],
                                    [
                                      "pH",
                                      (d: SazetakGodine) =>
                                        d?.ph?.vrijednost == null
                                          ? "—"
                                          : formatBroj(d.ph.vrijednost, 2),
                                    ],
                                  ] as Array<[string, (d: SazetakGodine) => string]>
                                ).map(([naslov, prikaz]) => (
                                  <tr
                                    key={naslov}
                                    className="bg-white text-[13px] text-stone-700"
                                  >
                                    <td className="border border-emerald-100 px-3 py-2 font-semibold">
                                      {naslov}
                                    </td>
                                    {godineUsporedba.map((g) => (
                                      <td
                                        key={g}
                                        className="border border-emerald-100 px-3 py-2"
                                      >
                                        {prikaz(s.poGodinama[g])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="border border-dashed border-emerald-300 bg-white p-8 text-center text-[13px] text-stone-500">
            Učitavam podatke...
          </div>
        ) : greska ? (
          <div className="border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
            {greska}
          </div>
        ) : (
          <TablicaBerbe
            zapisi={filtrirani}
            tekst={filterTekst}
            setTekst={setFilterTekst}
            godina={aktivnaGodina}
            zateceno={ukljuciZateceno}
          />
        )}

        {zatecene.length > 0 && !ukljuciZateceno ? (
          <div className="mt-4 border border-amber-300 bg-gradient-to-b from-amber-50/70 to-white p-4 shadow-sm">
            <h2 className="text-[16px] font-semibold text-stone-800">
              Zatečeno u podrumu — vino bez zapisa o berbi
            </h2>
            <p className="mt-1 max-w-[900px] text-[13px] leading-6 text-stone-600">
              Knjiga za ovo vino zna količinu, ali ne i odakle je došlo. Staro
              arhiviranje brisalo je zapise punjenja, pa je količina
              rekonstruirana iz pretoka i izlaza. Ovo <strong>nije berba</strong> i
              ne ulazi u zbrojeve iznad. Broj ovih zapisa je mjera koliko
              povijesti nedostaje — što ih je manje, to je povijest cjelovitija.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Oznaka variant="upozorenje">
                {zatecene.length} zapisa ukupno
              </Oznaka>
              <Oznaka variant="upozorenje">
                {formatBroj(
                  zatecene.reduce((s, b) => s + b.kolicinaLitara, 0),
                  0
                )}{" "}
                L
              </Oznaka>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-amber-100/70 text-left text-[12px] uppercase tracking-[0.12em] text-amber-900">
                    <th className="border border-amber-200 px-3 py-2">Naziv</th>
                    <th className="border border-amber-200 px-3 py-2">Položaj</th>
                    <th className="border border-amber-200 px-3 py-2">U podrum</th>
                    <th className="border border-amber-200 px-3 py-2">Količina</th>
                    <th className="border border-amber-200 px-3 py-2">Akcija</th>
                  </tr>
                </thead>
                <tbody>
                  {(aktivnaGodina ? zateceneUGodini : zatecene).map((b) => (
                    <tr key={b.id} className="bg-white text-[13px] text-stone-700">
                      <td className="border border-amber-100 px-3 py-2 font-semibold">
                        {b.nazivSorte}
                      </td>
                      <td className="border border-amber-100 px-3 py-2">
                        {b.polozaj || "-"}
                      </td>
                      <td className="border border-amber-100 px-3 py-2">
                        {formatHrDate(b.datumUlaska)}
                      </td>
                      <td className="border border-amber-100 px-3 py-2">
                        {formatBroj(b.kolicinaLitara, 0)} L
                      </td>
                      <td className="border border-amber-100 px-3 py-2">
                        {b.izvornaPunjenjeStavkaId ? (
                          <button
                            type="button"
                            onClick={() => obrisiBerbu(b)}
                            disabled={deletingId === b.id}
                            className="border border-red-200 bg-gradient-to-b from-red-50 to-rose-50 px-3 py-1.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingId === b.id ? "Brišem..." : "Obriši"}
                          </button>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

      </div>
    </main>
  );
}
