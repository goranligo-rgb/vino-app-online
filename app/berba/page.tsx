"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PunjenjeStavka = {
  id: string;
  nazivSorte: string;
  sortaId?: string | null;
  opis?: string | null;
  kolicinaKgGrozdja?: number | null;
  kolicinaLitara: number;

  datumBerbe?: string | null;
  godinaBerbe?: number | null;
  polozaj?: string | null;
  parcela?: string | null;
  vinograd?: string | null;
  oznakaBerbe?: string | null;
  secer?: number | null;
  kiseline?: number | null;
  ph?: number | null;
  napomenaBerbe?: string | null;
};

type PocetnoMjerenje = {
  id: string;
  alkohol?: number | null;
  ukupneKiseline?: number | null;
  hlapiveKiseline?: number | null;
  slobodniSO2?: number | null;
  ukupniSO2?: number | null;
  secer?: number | null;
  ph?: number | null;
  temperatura?: number | null;
  napomena?: string | null;
  izmjerenoAt?: string | null;
};

type Punjenje = {
  id: string;
  tankId: string;
  nazivVina?: string | null;
  datumPunjenja: string;
  napomena?: string | null;
  opis?: string | null;
  ukupnoLitara: number;
  ukupnoKgGrozdja: number;
  tank?: {
    id: string;
    broj: number;
    tip?: string | null;
  } | null;
  stavke: PunjenjeStavka[];
  pocetnoMjerenje?: PocetnoMjerenje | null;
};

type Red = {
  punjenjeId: string;
  tankId: string | null;
  datumPunjenja: string;
  tankBroj: number | null;
  tankTip: string | null;
  nazivVina: string | null;
  opisPunjenja: string | null;
  napomenaPunjenja: string | null;

  stavkaId: string;
  sorta: string;
  kolicinaKgGrozdja: number | null;
  kolicinaLitara: number;
  datumBerbe: string | null;
  godinaBerbe: number | null;
  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
  secer: number | null;
  kiseline: number | null;
  ph: number | null;
  opisStavke: string | null;
  napomenaBerbe: string | null;

  pocetnoMjerenje: PocetnoMjerenje | null | undefined;
};

type GrupiranoPunjenje = {
  punjenjeId: string;
  tankId: string | null;
  datumPunjenja: string;
  tankBroj: number | null;
  tankTip: string | null;
  nazivVina: string | null;
  opisPunjenja: string | null;
  napomenaPunjenja: string | null;
  pocetnoMjerenje: PocetnoMjerenje | null | undefined;
  stavke: Red[];
  ukupnoLitara: number;
  ukupnoKg: number;
};

function formatBroj(v?: number | null, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatDatum(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("hr-HR");
}

function uniqueSorted(values: (string | number | null | undefined)[]) {
  return [
    ...new Set(
      values
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(String)
    ),
  ].sort((a, b) => a.localeCompare(b, "hr"));
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

function Oznaka({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "soft" | "strong";
}) {
  const cls =
    variant === "strong"
      ? "border-emerald-300 bg-gradient-to-b from-emerald-100 to-lime-100 text-emerald-950"
      : variant === "soft"
      ? "border-lime-200 bg-lime-50 text-lime-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <span className={`inline-flex border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Polje({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border border-emerald-100 bg-white px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-stone-400">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-medium text-stone-700">
        {value || "-"}
      </div>
    </div>
  );
}

export default function BerbaPage() {
  const [data, setData] = useState<Punjenje[]>([]);
  const [loading, setLoading] = useState(true);
  const [greska, setGreska] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [filterSorta, setFilterSorta] = useState("");
  const [filterPolozaj, setFilterPolozaj] = useState("");
  const [filterGodina, setFilterGodina] = useState("");
  const [filterTank, setFilterTank] = useState("");
  const [filterNazivVina, setFilterNazivVina] = useState("");
  const [filterTekst, setFilterTekst] = useState("");

  async function ucitaj() {
    try {
      setLoading(true);
      setGreska("");

      const res = await fetch("/api/punjenje", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setGreska(json?.error || "Greška kod dohvaćanja podataka.");
        setData([]);
        return;
      }

      setData(Array.isArray(json) ? json : []);
    } catch (error) {
      console.error(error);
      setGreska("Greška kod dohvaćanja podataka o berbi.");
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  async function obrisiRed(stavkaId: string) {
    const potvrda = window.confirm(
      "Želiš obrisati ovu stavku berbe? Nakon toga više se neće prikazivati ni zbrajati."
    );
    if (!potvrda) return;

    try {
      setDeletingId(stavkaId);

      const res = await fetch(`/api/punjenje-stavka/${stavkaId}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json?.error || "Greška kod brisanja stavke.");
        return;
      }

      setData((prev) =>
        prev
          .map((p) => ({
            ...p,
            stavke: p.stavke.filter((s) => s.id !== stavkaId),
          }))
          .filter((p) => p.stavke.length > 0)
      );

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

  const redovi = useMemo<Red[]>(() => {
    const result: Red[] = [];

    for (const punjenje of data) {
      for (const stavka of punjenje.stavke ?? []) {
        result.push({
          punjenjeId: punjenje.id,
          tankId: punjenje.tank?.id ?? null,
          datumPunjenja: punjenje.datumPunjenja,
          tankBroj: punjenje.tank?.broj ?? null,
          tankTip: punjenje.tank?.tip ?? null,
          nazivVina: punjenje.nazivVina ?? null,
          opisPunjenja: punjenje.opis ?? null,
          napomenaPunjenja: punjenje.napomena ?? null,

          stavkaId: stavka.id,
          sorta: stavka.nazivSorte,
          kolicinaKgGrozdja: stavka.kolicinaKgGrozdja ?? null,
          kolicinaLitara: Number(stavka.kolicinaLitara ?? 0),
          datumBerbe: stavka.datumBerbe ?? null,
          godinaBerbe: stavka.godinaBerbe ?? null,
          polozaj: stavka.polozaj ?? null,
          parcela: stavka.parcela ?? null,
          vinograd: stavka.vinograd ?? null,
          oznakaBerbe: stavka.oznakaBerbe ?? null,
          secer: stavka.secer ?? null,
          kiseline: stavka.kiseline ?? null,
          ph: stavka.ph ?? null,
          opisStavke: stavka.opis ?? null,
          napomenaBerbe: stavka.napomenaBerbe ?? null,

          pocetnoMjerenje: punjenje.pocetnoMjerenje ?? null,
        });
      }
    }

    return result;
  }, [data]);

  const sorte = useMemo(() => uniqueSorted(redovi.map((r) => r.sorta)), [redovi]);
  const polozaji = useMemo(() => uniqueSorted(redovi.map((r) => r.polozaj)), [redovi]);
  const godine = useMemo(() => uniqueSorted(redovi.map((r) => r.godinaBerbe)), [redovi]);
  const tankovi = useMemo(() => uniqueSorted(redovi.map((r) => r.tankBroj)), [redovi]);
  const naziviVina = useMemo(() => uniqueSorted(redovi.map((r) => r.nazivVina)), [redovi]);

  const filtrirani = useMemo(() => {
    const tekst = filterTekst.trim().toLowerCase();

    return redovi.filter((r) => {
      if (filterSorta && r.sorta !== filterSorta) return false;
      if (filterPolozaj && (r.polozaj ?? "") !== filterPolozaj) return false;
      if (filterGodina && String(r.godinaBerbe ?? "") !== filterGodina) return false;
      if (filterTank && String(r.tankBroj ?? "") !== filterTank) return false;
      if (filterNazivVina && (r.nazivVina ?? "") !== filterNazivVina) return false;

      if (tekst) {
        const haystack = [
          r.sorta,
          r.polozaj,
          r.parcela,
          r.vinograd,
          r.oznakaBerbe,
          r.nazivVina,
          r.opisPunjenja,
          r.napomenaPunjenja,
          r.opisStavke,
          r.napomenaBerbe,
          String(r.tankBroj ?? ""),
          String(r.godinaBerbe ?? ""),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(tekst)) return false;
      }

      return true;
    });
  }, [
    redovi,
    filterSorta,
    filterPolozaj,
    filterGodina,
    filterTank,
    filterNazivVina,
    filterTekst,
  ]);

  const sazetak = useMemo(() => {
    const punjenjaIds = new Set(filtrirani.map((r) => r.punjenjeId));
    const polozajiSet = new Set(filtrirani.map((r) => r.polozaj).filter(Boolean));
    const sorteSet = new Set(filtrirani.map((r) => r.sorta).filter(Boolean));

    const ukupnoLitara = filtrirani.reduce((sum, r) => sum + (r.kolicinaLitara || 0), 0);
    const ukupnoKg = filtrirani.reduce((sum, r) => sum + (r.kolicinaKgGrozdja || 0), 0);

    return {
      brojPunjenja: punjenjaIds.size,
      brojStavki: filtrirani.length,
      brojPolozaja: polozajiSet.size,
      brojSorti: sorteSet.size,
      ukupnoLitara,
      ukupnoKg,
    };
  }, [filtrirani]);

  const poSorti = useMemo(() => {
    const mapa = new Map<string, { sorta: string; litara: number; kg: number; stavki: number }>();

    for (const r of filtrirani) {
      const key = r.sorta || "Nepoznato";
      const postojeci = mapa.get(key) || {
        sorta: key,
        litara: 0,
        kg: 0,
        stavki: 0,
      };
      postojeci.litara += r.kolicinaLitara || 0;
      postojeci.kg += r.kolicinaKgGrozdja || 0;
      postojeci.stavki += 1;
      mapa.set(key, postojeci);
    }

    return [...mapa.values()].sort((a, b) => b.litara - a.litara);
  }, [filtrirani]);

  const poPolozaju = useMemo(() => {
    const mapa = new Map<string, { polozaj: string; litara: number; kg: number; stavki: number }>();

    for (const r of filtrirani) {
      const key = r.polozaj || "Bez položaja";
      const postojeci = mapa.get(key) || {
        polozaj: key,
        litara: 0,
        kg: 0,
        stavki: 0,
      };
      postojeci.litara += r.kolicinaLitara || 0;
      postojeci.kg += r.kolicinaKgGrozdja || 0;
      postojeci.stavki += 1;
      mapa.set(key, postojeci);
    }

    return [...mapa.values()].sort((a, b) => b.litara - a.litara);
  }, [filtrirani]);

  const detaljiPoPunjenju = useMemo<GrupiranoPunjenje[]>(() => {
    const mapa = new Map<string, GrupiranoPunjenje>();

    for (const r of filtrirani) {
      if (!mapa.has(r.punjenjeId)) {
        mapa.set(r.punjenjeId, {
          punjenjeId: r.punjenjeId,
          tankId: r.tankId,
          datumPunjenja: r.datumPunjenja,
          tankBroj: r.tankBroj,
          tankTip: r.tankTip,
          nazivVina: r.nazivVina,
          opisPunjenja: r.opisPunjenja,
          napomenaPunjenja: r.napomenaPunjenja,
          pocetnoMjerenje: r.pocetnoMjerenje,
          stavke: [],
          ukupnoLitara: 0,
          ukupnoKg: 0,
        });
      }

      const grupa = mapa.get(r.punjenjeId)!;
      grupa.stavke.push(r);
      grupa.ukupnoLitara += r.kolicinaLitara || 0;
      grupa.ukupnoKg += r.kolicinaKgGrozdja || 0;
    }

    return [...mapa.values()].sort(
      (a, b) =>
        new Date(b.datumPunjenja).getTime() - new Date(a.datumPunjenja).getTime()
    );
  }, [filtrirani]);

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
              <p className="mt-2 max-w-[780px] text-[14px] leading-6 text-white/80">
                Pregled unosa iz punjenja, sorti, položaja i osnovnih parametara
                berbe, sa sažecima po sorti i položaju te detaljnim prikazom po
                punjenju.
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

        <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KarticaBroj naslov="Punjenja" vrijednost={String(sazetak.brojPunjenja)} />
          <KarticaBroj naslov="Stavke berbe" vrijednost={String(sazetak.brojStavki)} />
          <KarticaBroj
            naslov="Ukupno litara"
            vrijednost={`${formatBroj(sazetak.ukupnoLitara, 0)} L`}
          />
          <KarticaBroj
            naslov="Ukupno kg grožđa"
            vrijednost={`${formatBroj(sazetak.ukupnoKg, 0)} kg`}
          />
          <KarticaBroj naslov="Sorte" vrijednost={String(sazetak.brojSorti)} />
          <KarticaBroj naslov="Položaji" vrijednost={String(sazetak.brojPolozaja)} />
        </div>

        <div className="mb-4 border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-stone-800">Filteri</h2>
            <button
              type="button"
              onClick={() => {
                setFilterSorta("");
                setFilterPolozaj("");
                setFilterGodina("");
                setFilterTank("");
                setFilterNazivVina("");
                setFilterTekst("");
              }}
              className="border border-emerald-200 bg-white px-3 py-2 text-[12px] font-medium text-stone-700 transition hover:bg-emerald-50"
            >
              Očisti filtere
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Sorta
              </label>
              <select
                value={filterSorta}
                onChange={(e) => setFilterSorta(e.target.value)}
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              >
                <option value="">Sve sorte</option>
                {sorte.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Položaj
              </label>
              <select
                value={filterPolozaj}
                onChange={(e) => setFilterPolozaj(e.target.value)}
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              >
                <option value="">Svi položaji</option>
                {polozaji.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Godina berbe
              </label>
              <select
                value={filterGodina}
                onChange={(e) => setFilterGodina(e.target.value)}
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              >
                <option value="">Sve godine</option>
                {godine.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Tank
              </label>
              <select
                value={filterTank}
                onChange={(e) => setFilterTank(e.target.value)}
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              >
                <option value="">Svi tankovi</option>
                {tankovi.map((t) => (
                  <option key={t} value={t}>
                    Tank {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Naziv vina
              </label>
              <select
                value={filterNazivVina}
                onChange={(e) => setFilterNazivVina(e.target.value)}
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              >
                <option value="">Sva vina</option>
                {naziviVina.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Pretraga
              </label>
              <input
                value={filterTekst}
                onChange={(e) => setFilterTekst(e.target.value)}
                placeholder="sorta, položaj, parcela, oznaka..."
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              />
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-4 xl:grid-cols-2">
          <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
            <h2 className="mb-3 text-[16px] font-semibold text-stone-800">
              Pregled po sorti
            </h2>

            {poSorti.length === 0 ? (
              <p className="text-[13px] text-stone-500">Nema podataka.</p>
            ) : (
              <div className="space-y-2">
                {poSorti.map((r) => (
                  <div
                    key={r.sorta}
                    className="border border-emerald-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[14px] font-semibold text-stone-800">
                        {r.sorta}
                      </div>
                      <Oznaka variant="soft">{r.stavki} stavki</Oznaka>
                    </div>
                    <div className="mt-1 text-[13px] text-stone-600">
                      {formatBroj(r.litara, 0)} L / {formatBroj(r.kg, 0)} kg
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
            <h2 className="mb-3 text-[16px] font-semibold text-stone-800">
              Pregled po položaju
            </h2>

            {poPolozaju.length === 0 ? (
              <p className="text-[13px] text-stone-500">Nema podataka.</p>
            ) : (
              <div className="space-y-2">
                {poPolozaju.map((r) => (
                  <div
                    key={r.polozaj}
                    className="border border-emerald-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[14px] font-semibold text-stone-800">
                        {r.polozaj}
                      </div>
                      <Oznaka variant="soft">{r.stavki} stavki</Oznaka>
                    </div>
                    <div className="mt-1 text-[13px] text-stone-600">
                      {formatBroj(r.litara, 0)} L / {formatBroj(r.kg, 0)} kg
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-stone-800">
              Detaljni izvještaji
            </h2>
            <div className="border border-emerald-200 bg-white px-3 py-1 text-[12px] text-stone-600">
              Ukupno punjenja: {detaljiPoPunjenju.length}
            </div>
          </div>

          {loading ? (
            <div className="border border-dashed border-emerald-300 bg-white p-8 text-center text-[13px] text-stone-500">
              Učitavam podatke...
            </div>
          ) : greska ? (
            <div className="border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
              {greska}
            </div>
          ) : detaljiPoPunjenju.length === 0 ? (
            <div className="border border-dashed border-emerald-300 bg-white p-8 text-center text-[13px] text-stone-500">
              Nema podataka za odabrane filtere.
            </div>
          ) : (
            <div className="space-y-5">
              {detaljiPoPunjenju.map((g) => (
                <div
                  key={g.punjenjeId}
                  className="border border-emerald-200 bg-gradient-to-b from-white via-emerald-50/35 to-lime-50/50 px-4 py-4 shadow-sm"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[20px] font-semibold text-stone-800">
                          {g.nazivVina || "Bez naziva vina"}
                        </h3>
                        {g.tankBroj != null ? (
                          <Oznaka variant="strong">Tank {g.tankBroj}</Oznaka>
                        ) : null}
                        {g.tankTip ? <Oznaka>{g.tankTip}</Oznaka> : null}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-2 text-[13px] text-stone-600">
                        <span>Datum punjenja: {formatDatum(g.datumPunjenja)}</span>
                        {g.tankId ? (
                          <>
                            <span>•</span>
                            <Link
                              href={`/tankovi/${g.tankId}`}
                              className="font-medium text-emerald-800 hover:underline"
                            >
                              Otvori tank
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Oznaka variant="strong">
                        {formatBroj(g.ukupnoLitara, 0)} L
                      </Oznaka>
                      <Oznaka>{formatBroj(g.ukupnoKg, 0)} kg</Oznaka>
                      <Oznaka variant="soft">{g.stavke.length} stavki</Oznaka>
                    </div>
                  </div>

                  <div className="mb-4 overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="bg-emerald-100/70 text-left text-[12px] uppercase tracking-[0.12em] text-emerald-900">
                          <th className="border border-emerald-200 px-3 py-2">Sorta</th>
                          <th className="border border-emerald-200 px-3 py-2">Položaj</th>
                          <th className="border border-emerald-200 px-3 py-2">Parcela</th>
                          <th className="border border-emerald-200 px-3 py-2">Vinograd</th>
                          <th className="border border-emerald-200 px-3 py-2">Datum berbe</th>
                          <th className="border border-emerald-200 px-3 py-2">Godina</th>
                          <th className="border border-emerald-200 px-3 py-2">L</th>
                          <th className="border border-emerald-200 px-3 py-2">kg</th>
                          <th className="border border-emerald-200 px-3 py-2">Akcija</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.stavke.map((r) => (
                          <tr key={r.stavkaId} className="bg-white text-[13px] text-stone-700">
                            <td className="border border-emerald-100 px-3 py-2 font-semibold">
                              {r.sorta}
                            </td>
                            <td className="border border-emerald-100 px-3 py-2">
                              {r.polozaj || "-"}
                            </td>
                            <td className="border border-emerald-100 px-3 py-2">
                              {r.parcela || "-"}
                            </td>
                            <td className="border border-emerald-100 px-3 py-2">
                              {r.vinograd || "-"}
                            </td>
                            <td className="border border-emerald-100 px-3 py-2">
                              {formatDatum(r.datumBerbe)}
                            </td>
                            <td className="border border-emerald-100 px-3 py-2">
                              {r.godinaBerbe || "-"}
                            </td>
                            <td className="border border-emerald-100 px-3 py-2">
                              {formatBroj(r.kolicinaLitara, 0)}
                            </td>
                            <td className="border border-emerald-100 px-3 py-2">
                              {formatBroj(r.kolicinaKgGrozdja, 0)}
                            </td>
                            <td className="border border-emerald-100 px-3 py-2">
                              <button
                                type="button"
                                onClick={() => obrisiRed(r.stavkaId)}
                                disabled={deletingId === r.stavkaId}
                                className="border border-red-200 bg-gradient-to-b from-red-50 to-rose-50 px-3 py-2 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingId === r.stavkaId ? "Brišem..." : "Obriši"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(g.opisPunjenja || g.napomenaPunjenja) && (
                    <div className="mb-4 grid gap-3 xl:grid-cols-2">
                      <div className="border border-emerald-200 bg-white p-4">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                          Opis punjenja
                        </div>
                        <div className="text-[13px] text-stone-700">
                          {g.opisPunjenja || "-"}
                        </div>
                      </div>

                      <div className="border border-emerald-200 bg-white p-4">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                          Napomena punjenja
                        </div>
                        <div className="text-[13px] text-stone-700">
                          {g.napomenaPunjenja || "-"}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mb-4">
                    <div className="mb-2 text-[13px] font-semibold text-stone-800">
                      Bilješke po stavkama
                    </div>
                    <div className="grid gap-3 xl:grid-cols-2">
                      {g.stavke.map((r) => (
                        <div
                          key={`${r.stavkaId}-biljeske`}
                          className="border border-emerald-200 bg-white p-4"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-stone-800">
                              {r.sorta}
                            </span>
                            {r.polozaj ? <Oznaka>{r.polozaj}</Oznaka> : null}
                          </div>
                          <div className="space-y-2 text-[13px] text-stone-700">
                            <div>
                              <span className="font-medium text-stone-800">Opis: </span>
                              {r.opisStavke || "-"}
                            </div>
                            <div>
                              <span className="font-medium text-stone-800">
                                Napomena:{" "}
                              </span>
                              {r.napomenaBerbe || "-"}
                            </div>
                            <div>
                              <span className="font-medium text-stone-800">
                                Šećer / kiseline / pH:{" "}
                              </span>
                              {formatBroj(r.secer, 2)} / {formatBroj(r.kiseline, 2)} /{" "}
                              {formatBroj(r.ph, 2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {g.pocetnoMjerenje ? (
                    <div className="mt-3 border border-lime-300 bg-gradient-to-r from-lime-50 via-emerald-50 to-green-50 p-4">
                      <div className="mb-3 text-[13px] font-semibold text-emerald-900">
                        Početno mjerenje
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <Polje
                          label="Datum mjerenja"
                          value={formatDatum(g.pocetnoMjerenje.izmjerenoAt || null)}
                        />
                        <Polje
                          label="Alkohol"
                          value={formatBroj(g.pocetnoMjerenje.alkohol, 2)}
                        />
                        <Polje
                          label="Ukupne kiseline"
                          value={formatBroj(g.pocetnoMjerenje.ukupneKiseline, 2)}
                        />
                        <Polje
                          label="Šećer"
                          value={formatBroj(g.pocetnoMjerenje.secer, 2)}
                        />
                        <Polje
                          label="pH"
                          value={formatBroj(g.pocetnoMjerenje.ph, 2)}
                        />
                        <Polje
                          label="Hlapive kiseline"
                          value={formatBroj(g.pocetnoMjerenje.hlapiveKiseline, 2)}
                        />
                        <Polje
                          label="Slobodni SO2"
                          value={formatBroj(g.pocetnoMjerenje.slobodniSO2, 2)}
                        />
                        <Polje
                          label="Ukupni SO2"
                          value={formatBroj(g.pocetnoMjerenje.ukupniSO2, 2)}
                        />
                        <Polje
                          label="Temperatura"
                          value={formatBroj(g.pocetnoMjerenje.temperatura, 2)}
                        />
                        <Polje
                          label="Napomena"
                          value={g.pocetnoMjerenje.napomena || "-"}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}