"use client";

/**
 * PREGLED VINA — sto je danas u podrumu, s parametrima, i simulacija kupaze.
 *
 * Samo citanje: ruta `/api/izvjestaji/statistika-vina` ne pise nista, a
 * simulacija zivi u stanju ove stranice i nestaje s njom. Racun je u
 * lib/statistika-vina.ts.
 *
 * Tablica pokazuje iste vrijednosti kao stranica tanka, a oznaka uz broj kaze
 * ako nije izmjeren na tom vinu. Secer se ne prosjecuje (vidi zaglavlje racuna).
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BEZ_GODISTA,
  BEZ_SIFRE,
  NAZIV_VRSTE,
  PRAZNI_FILTRI,
  filtrirajVina,
  jeIzborSorte,
  kljucGodine,
  kljucVina,
  opcijeSorte,
  type Filtri,
  type Grupiranje,
  type PregledVina,
  type VinoRedak,
  type VrstaVina,
} from "@/lib/statistika-vina";
import SimulacijaKupaze from "./simulacija-kupaze";
import TablicaVina from "./tablica-vina";

const NAZIV_GRUPIRANJA: Record<Grupiranje, string> = {
  nista: "ništa",
  sorta: "sorta",
  vino: "vino (šifra)",
  godina: "godina",
  tip: "tip",
};

const POLJE_KLASA =
  "w-full border border-stone-300 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#7f1d1d]";

function Izbor({
  oznaka,
  value,
  onChange,
  children,
}: {
  oznaka: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12px] font-semibold text-stone-700">{oznaka}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={POLJE_KLASA}>
        {children}
      </select>
    </label>
  );
}

export default function PregledVinaStranica() {
  const [podaci, setPodaci] = useState<PregledVina | null>(null);
  const [greska, setGreska] = useState("");

  const [filtri, setFiltri] = useState<Filtri>(PRAZNI_FILTRI);
  const [po, setPo] = useState<Grupiranje>("nista");

  // tankId -> upisane litre, kao tekst iz polja. Samo stanje stranice.
  const [odabir, setOdabir] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    let otkazano = false;

    (async () => {
      try {
        const res = await fetch("/api/izvjestaji/statistika-vina", { cache: "no-store" });
        const json = await res.json();
        if (otkazano) return;
        if (!res.ok) {
          setGreska(json?.error || "Greška kod dohvaćanja pregleda vina.");
          return;
        }
        setPodaci(json);
      } catch (e) {
        console.error(e);
        if (!otkazano) setGreska("Greška kod dohvaćanja pregleda vina.");
      }
    })();

    return () => {
      otkazano = true;
    };
  }, []);

  const vina = useMemo(() => podaci?.vina ?? [], [podaci]);
  const prikazana = useMemo(() => filtrirajVina(vina, filtri), [vina, filtri]);

  const opcije = useMemo(() => {
    const sorte = opcijeSorte(vina);

    const poSifri = new Map<string, string>();
    for (const v of vina) if (!poSifri.has(kljucVina(v))) poSifri.set(kljucVina(v), v.naziv);
    const sifre = [...poSifri.entries()].sort(([a], [b]) => a.localeCompare(b, "hr", { numeric: true }));

    const godine = [...new Set(vina.map(kljucGodine))].sort((a, b) => {
      if (a === BEZ_GODISTA) return 1;
      if (b === BEZ_GODISTA) return -1;
      return Number(b) - Number(a);
    });

    const tipovi = (Object.keys(NAZIV_VRSTE) as VrstaVina[]).filter((t) =>
      vina.some((v) => v.vrsta === t)
    );

    return { sorte, sifre, godine, tipovi };
  }, [vina]);

  const odabrana = useMemo(
    () =>
      [...odabir.entries()]
        .map(([tankId, upis]) => {
          const vino = vina.find((v) => v.tankId === tankId);
          return vino ? { vino, upis } : null;
        })
        .filter((x): x is { vino: VinoRedak; upis: string } => x !== null),
    [odabir, vina]
  );

  function prebaci(v: VinoRedak) {
    setOdabir((prije) => {
      const n = new Map(prije);
      if (n.has(v.tankId)) n.delete(v.tankId);
      else n.set(v.tankId, String(v.ml / 1000));
      return n;
    });
  }

  function upisi(tankId: string, upis: string) {
    setOdabir((prije) => new Map(prije).set(tankId, upis));
  }

  const postavi = <K extends keyof Filtri>(k: K, v: Filtri[K]) =>
    setFiltri((f) => ({ ...f, [k]: v }));

  const imaFiltra = Object.entries(filtri).some(([k, x]) => k !== "ukljuciCuvee" && x !== "");
  const izborSorte = jeIzborSorte(filtri.sorta);

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1540px]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4 bg-[#3b1226] px-5 py-5 text-white">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/65">Izvještaji</div>
            <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Pregled vina</h1>
            <p className="mt-1 max-w-[860px] text-[14px] leading-6 text-white/80">
              Vino koje je danas u tankovima, sa zadnjim parametrima i simulacijom kupaže. Ništa se
              ovdje ne sprema.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="bg-white/90 px-4 py-2 text-[13px] font-medium text-stone-700 hover:bg-white"
          >
            Natrag
          </Link>
        </div>

        {greska ? (
          <div className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {greska}
          </div>
        ) : null}

        {!podaci && !greska ? (
          <div className="border border-stone-200 bg-white p-8 text-center text-[13px] text-stone-500">
            Učitavanje... za cijeli podrum može potrajati nekoliko sekundi.
          </div>
        ) : null}

        {podaci ? (
          <>
            <div className="mb-4 border border-stone-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <label className="block min-w-0">
                  <span className="mb-1 block text-[12px] font-semibold text-stone-700">Traži</span>
                  <input
                    value={filtri.tekst}
                    onChange={(e) => postavi("tekst", e.target.value)}
                    placeholder="tank, šifra, vino, sorta"
                    className={POLJE_KLASA}
                  />
                </label>

                <Izbor oznaka="Sorta" value={filtri.sorta} onChange={(v) => postavi("sorta", v)}>
                  <option value="">sve</option>
                  {opcije.sorte.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Izbor>

                <Izbor oznaka="Vino" value={filtri.vino} onChange={(v) => postavi("vino", v)}>
                  <option value="">sva</option>
                  {opcije.sifre.map(([sifra, naziv]) => (
                    <option key={sifra} value={sifra}>
                      {sifra === BEZ_SIFRE ? "bez šifre" : `${sifra} · ${naziv}`}
                    </option>
                  ))}
                </Izbor>

                <Izbor oznaka="Godina" value={filtri.godina} onChange={(v) => postavi("godina", v)}>
                  <option value="">sve</option>
                  {opcije.godine.map((g) => (
                    <option key={g} value={g}>
                      {g === BEZ_GODISTA ? "bez godišta" : g}
                    </option>
                  ))}
                </Izbor>

                <Izbor
                  oznaka="Tip"
                  value={filtri.tip}
                  onChange={(v) => postavi("tip", v as Filtri["tip"])}
                >
                  <option value="">svi</option>
                  {opcije.tipovi.map((t) => (
                    <option key={t} value={t}>
                      {NAZIV_VRSTE[t]}
                    </option>
                  ))}
                </Izbor>

                <Izbor oznaka="Grupiraj po" value={po} onChange={(v) => setPo(v as Grupiranje)}>
                  {(Object.keys(NAZIV_GRUPIRANJA) as Grupiranje[]).map((g) => (
                    <option key={g} value={g}>
                      {NAZIV_GRUPIRANJA[g]}
                    </option>
                  ))}
                </Izbor>
              </div>

              <label
                className={`mt-3 flex items-center gap-2 text-[13px] ${
                  izborSorte ? "cursor-pointer text-stone-700" : "text-stone-400"
                }`}
              >
                <input
                  type="checkbox"
                  checked={filtri.ukljuciCuvee}
                  disabled={!izborSorte}
                  onChange={(e) => postavi("ukljuciCuvee", e.target.checked)}
                  className="h-4 w-4 accent-[#7f1d1d]"
                />
                Uključi cuvée koji sadrže ovu sortu
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-stone-500">
                <span>
                  Prikazano {prikazana.length} od {vina.length} tankova s vinom.
                </span>
                {imaFiltra ? (
                  <button
                    type="button"
                    onClick={() => setFiltri(PRAZNI_FILTRI)}
                    className="underline hover:text-stone-800"
                  >
                    Poništi filtre
                  </button>
                ) : null}
                <span>Označi vina kvačicom za simulaciju kupaže.</span>
              </div>
            </div>

            {odabrana.length > 0 ? (
              <SimulacijaKupaze
                odabir={odabrana}
                prag={podaci.pragSortnosti}
                upisi={upisi}
                makni={prebaci}
                ponisti={() => setOdabir(new Map())}
              />
            ) : null}

            <TablicaVina
              vina={prikazana}
              po={po}
              jeOdabrano={(tankId) => odabir.has(tankId)}
              prebaci={prebaci}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}
