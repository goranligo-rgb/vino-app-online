"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NatragHome from "@/components/NatragHome";

type GrupiranoItem = {
  naziv: string;
  ukupno: number;
  jedinicaPrikaza: string;
  brojStavki: number;
};

type UkupnoSveItem = {
  ukupno: number;
  jedinicaPrikaza: string;
  brojStavki: number;
};

type StavkaResponse = {
  id: string;
  datum: string;
  tankId: string;
  brojTanka: number | null;
  sorta: string | null;
  nazivVina: string | null;
  godiste: number | null;
  preparatId: string | null;
  preparatNaziv: string | null;
  kolicina: number;
  jedinica: string | null;
  faktorJedinice: number;
  normaliziranaKolicina: number;
  korisnik: string | null;
  napomena: string | null;
};

type ApiResponse = {
  ok: boolean;
  filteri?: {
    datumOd: string | null;
    datumDo: string | null;
    sorta: string | null;
    godiste: string | null;
    preparatId: string | null;
  };
  sazetak?: {
    brojStavki: number;
  };
  ukupnoSve?: UkupnoSveItem[];
  poPreparatu?: GrupiranoItem[];
  poSorti?: GrupiranoItem[];
  poGodistu?: GrupiranoItem[];
  poTanku?: GrupiranoItem[];
  stavke?: StavkaResponse[];
  error?: string;
};

function formatBroj(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return Number(value).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatDatum(value?: string | null) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDatumInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
    <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50 px-4 py-4 shadow-sm">
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

function SekcijaTablica({
  title,
  items,
}: {
  title: string;
  items: GrupiranoItem[];
}) {
  return (
    <section className="border border-emerald-200/80 bg-white/90 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-800">{title}</h2>
          <p className="mt-1 text-sm text-stone-500">
            Grupirani prikaz statistike.
          </p>
        </div>

        <div className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-stone-700">
          {items.length} redaka
        </div>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-emerald-300 bg-white/70 px-4 py-10 text-center text-sm text-stone-500">
          Nema podataka za prikaz.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-emerald-200 text-left text-stone-500">
                  <th className="px-3 py-2 font-medium">Naziv</th>
                  <th className="px-3 py-2 font-medium">Ukupno</th>
                  <th className="px-3 py-2 font-medium">Jedinica</th>
                  <th className="px-3 py-2 font-medium">Broj stavki</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr
                    key={`${item.naziv}-${idx}`}
                    className="border-b border-emerald-100 last:border-0"
                  >
                    <td className="px-3 py-3 font-medium text-stone-800">
                      {item.naziv}
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      {formatBroj(item.ukupno)}
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      {item.jedinicaPrikaza}
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      {item.brojStavki}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {items.map((item, idx) => (
              <div
                key={`${item.naziv}-${idx}`}
                className="border border-emerald-200 bg-emerald-50/30 p-4"
              >
                <div className="text-sm font-semibold text-stone-800">
                  {item.naziv}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-stone-500">Ukupno</div>
                    <div className="font-medium text-stone-800">
                      {formatBroj(item.ukupno)}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-500">Jedinica</div>
                    <div className="font-medium text-stone-800">
                      {item.jedinicaPrikaza}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-500">Broj stavki</div>
                    <div className="font-medium text-stone-800">
                      {item.brojStavki}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function StatistikaPreparataPage() {
  const today = useMemo(() => new Date(), []);
  const firstDayOfYear = useMemo(
    () => new Date(today.getFullYear(), 0, 1),
    [today]
  );

  const [datumOd, setDatumOd] = useState(formatDatumInput(firstDayOfYear));
  const [datumDo, setDatumDo] = useState(formatDatumInput(today));
  const [sorta, setSorta] = useState("sve");
  const [godiste, setGodiste] = useState("sve");
  const [preparatId, setPreparatId] = useState("sve");

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const stavke = data?.stavke ?? [];
  const ukupnoSve = data?.ukupnoSve ?? [];
  const poPreparatu = data?.poPreparatu ?? [];
  const poSorti = data?.poSorti ?? [];
  const poGodistu = data?.poGodistu ?? [];
  const poTanku = data?.poTanku ?? [];

  const dostupneSorte = useMemo(() => {
    const set = new Set<string>();
    for (const s of stavke) {
      if (s.sorta?.trim()) set.add(s.sorta.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "hr"));
  }, [stavke]);

  const dostupnaGodista = useMemo(() => {
    const set = new Set<number>();
    for (const s of stavke) {
      if (typeof s.godiste === "number") set.add(s.godiste);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [stavke]);

  const dostupniPreparati = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stavke) {
      if (s.preparatId && s.preparatNaziv) {
        map.set(s.preparatId, s.preparatNaziv);
      }
    }
    return Array.from(map.entries())
      .map(([id, naziv]) => ({ id, naziv }))
      .sort((a, b) => a.naziv.localeCompare(b.naziv, "hr"));
  }, [stavke]);

  async function fetchData(custom?: {
    datumOd?: string;
    datumDo?: string;
    sorta?: string;
    godiste?: string;
    preparatId?: string;
  }) {
    const od = custom?.datumOd ?? datumOd;
    const doDatuma = custom?.datumDo ?? datumDo;
    const sortaValue = custom?.sorta ?? sorta;
    const godisteValue = custom?.godiste ?? godiste;
    const preparatValue = custom?.preparatId ?? preparatId;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (od) params.set("datumOd", od);
      if (doDatuma) params.set("datumDo", doDatuma);
      if (sortaValue && sortaValue !== "sve") params.set("sorta", sortaValue);
      if (godisteValue && godisteValue !== "sve") {
        params.set("godiste", godisteValue);
      }
      if (preparatValue && preparatValue !== "sve") {
        params.set("preparatId", preparatValue);
      }

      const res = await fetch(
        `/api/statistika/preparati?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const text = await res.text();

      let json: ApiResponse;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`API nije vratio JSON. Odgovor: ${text.slice(0, 200)}`);
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Greška kod dohvaćanja statistike.");
      }

      setData(json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Dogodila se greška kod dohvaćanja statistike.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePretrazi() {
    fetchData();
  }

  function handleReset() {
    const od = formatDatumInput(firstDayOfYear);
    const dd = formatDatumInput(today);

    setDatumOd(od);
    setDatumDo(dd);
    setSorta("sve");
    setGodiste("sve");
    setPreparatId("sve");

    fetchData({
      datumOd: od,
      datumDo: dd,
      sorta: "sve",
      godiste: "sve",
      preparatId: "sve",
    });
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-emerald-50/35 to-stone-200 print:bg-white">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <div className="print:hidden">
          <NatragHome />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
          <div>
            <div className="text-sm text-stone-500">
              <Link href="/dashboard" className="hover:text-stone-700">
                Dashboard
              </Link>
              {" / "}
              <span>Statistika preparata</span>
            </div>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-800">
              Statistika preparata
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Pregled potrošnje preparata po periodu, sorti, godištu i tankovima.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-11 items-center justify-center border border-emerald-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-emerald-50"
            >
              PDF / Ispis
            </button>

            <Link
              href="/preparat"
              className="inline-flex h-11 items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:brightness-105"
            >
              Natrag na preparate
            </Link>
          </div>
        </div>

        <div className="hidden print:block">
          <h1 className="text-2xl font-bold text-stone-800">
            Statistika potrošnje preparata
          </h1>
          <p className="mt-2 text-sm text-stone-700">
            Period: <strong>{datumOd || "-"}</strong> do{" "}
            <strong>{datumDo || "-"}</strong>
          </p>
          <p className="mt-1 text-sm text-stone-700">
            Sorta: <strong>{sorta === "sve" ? "Sve sorte" : sorta}</strong> |
            Godište:{" "}
            <strong>{godiste === "sve" ? "Sva godišta" : godiste}</strong> |
            Preparat:{" "}
            <strong>
              {preparatId === "sve"
                ? "Svi preparati"
                : dostupniPreparati.find((p) => p.id === preparatId)?.naziv ||
                  preparatId}
            </strong>
          </p>
        </div>

        {porukaBlok(error)}

        <section className="border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/40 to-stone-50 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)] print:hidden">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-stone-800">Filteri</h2>
            <p className="mt-1 text-sm text-stone-500">
              Odaberi period i filtriraj statistiku kako želiš.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Datum od
              </span>
              <input
                type="date"
                value={datumOd}
                onChange={(e) => setDatumOd(e.target.value)}
                className="h-11 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Datum do
              </span>
              <input
                type="date"
                value={datumDo}
                onChange={(e) => setDatumDo(e.target.value)}
                className="h-11 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Sorta
              </span>
              <select
                value={sorta}
                onChange={(e) => setSorta(e.target.value)}
                className="h-11 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
              >
                <option value="sve">Sve sorte</option>
                {dostupneSorte.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Godište
              </span>
              <select
                value={godiste}
                onChange={(e) => setGodiste(e.target.value)}
                className="h-11 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
              >
                <option value="sve">Sva godišta</option>
                {dostupnaGodista.map((item) => (
                  <option key={item} value={String(item)}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Preparat
              </span>
              <select
                value={preparatId}
                onChange={(e) => setPreparatId(e.target.value)}
                className="h-11 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
              >
                <option value="sve">Svi preparati</option>
                {dostupniPreparati.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.naziv}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePretrazi}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              {loading ? "Učitavanje..." : "Prikaži statistiku"}
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center border border-emerald-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
            >
              Reset filtera
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KarticaBroj
            naslov="Broj stavki"
            vrijednost={loading ? "..." : formatBroj(data?.sazetak?.brojStavki ?? 0, 0)}
          />
          <KarticaBroj
            naslov="Broj preparata"
            vrijednost={loading ? "..." : formatBroj(poPreparatu.length, 0)}
          />
          <KarticaBroj
            naslov="Broj sorti"
            vrijednost={loading ? "..." : formatBroj(poSorti.length, 0)}
          />
          <KarticaBroj
            naslov="Broj tankova"
            vrijednost={loading ? "..." : formatBroj(poTanku.length, 0)}
          />
        </section>

        <section className="border border-emerald-200/80 bg-white/90 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-stone-800">
              Ukupno sve
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Ukupan zbroj svih zapisa po grupama jedinica.
            </p>
          </div>

          {ukupnoSve.length === 0 ? (
            <div className="border border-dashed border-emerald-300 bg-white/70 px-4 py-10 text-center text-sm text-stone-500">
              Nema podataka za prikaz.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ukupnoSve.map((item, idx) => (
                <div
                  key={`${item.jedinicaPrikaza}-${idx}`}
                  className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50 px-4 py-4 shadow-sm"
                >
                  <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                    Ukupno
                  </div>
                  <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">
                    {formatBroj(item.ukupno)}
                  </div>
                  <div className="mt-2 text-sm text-stone-600">
                    {item.jedinicaPrikaza}
                  </div>
                  <div className="mt-2 text-xs text-stone-500">
                    {item.brojStavki} stavki
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <SekcijaTablica title="Potrošnja po preparatu" items={poPreparatu} />
          <SekcijaTablica title="Potrošnja po sorti" items={poSorti} />
          <SekcijaTablica title="Potrošnja po godištu" items={poGodistu} />
          <SekcijaTablica title="Potrošnja po tanku" items={poTanku} />
        </div>

        <section className="border border-emerald-200/80 bg-white/90 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-800">
                Detaljna tablica dodavanja
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Svi pojedinačni zapisi koji ulaze u statistiku.
              </p>
            </div>

            <div className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-stone-700">
              {stavke.length} redaka
            </div>
          </div>

          {stavke.length === 0 ? (
            <div className="border border-dashed border-emerald-300 bg-white/70 px-4 py-10 text-center text-sm text-stone-500">
              Nema stavki za zadane filtere.
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-emerald-200 text-left text-stone-500">
                      <th className="px-3 py-2 font-medium">Datum</th>
                      <th className="px-3 py-2 font-medium">Tank</th>
                      <th className="px-3 py-2 font-medium">Sorta</th>
                      <th className="px-3 py-2 font-medium">Naziv vina</th>
                      <th className="px-3 py-2 font-medium">Godište</th>
                      <th className="px-3 py-2 font-medium">Preparat</th>
                      <th className="px-3 py-2 font-medium">Količina</th>
                      <th className="px-3 py-2 font-medium">Jedinica</th>
                      <th className="px-3 py-2 font-medium">Normalizirano</th>
                      <th className="px-3 py-2 font-medium">Korisnik</th>
                      <th className="px-3 py-2 font-medium">Napomena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stavke.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-emerald-100 align-top last:border-0"
                      >
                        <td className="px-3 py-3 text-stone-700">
                          {formatDatum(item.datum)}
                        </td>
                        <td className="px-3 py-3 font-medium text-stone-800">
                          {item.brojTanka ? `Tank ${item.brojTanka}` : "-"}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {item.sorta || "-"}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {item.nazivVina || "-"}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {item.godiste ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {item.preparatNaziv || "-"}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {formatBroj(item.kolicina)}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {item.jedinica || "-"}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {formatBroj(item.normaliziranaKolicina)}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {item.korisnik || "-"}
                        </td>
                        <td className="px-3 py-3 text-stone-700">
                          {item.napomena || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {stavke.map((item) => (
                  <div
                    key={item.id}
                    className="border border-emerald-200 bg-emerald-50/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-stone-800">
                          {item.preparatNaziv || "Bez preparata"}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                          {formatDatum(item.datum)}
                        </div>
                      </div>

                      <div className="border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-stone-700">
                        {item.brojTanka ? `Tank ${item.brojTanka}` : "Tank -"}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-stone-500">Sorta</div>
                        <div className="font-medium text-stone-800">
                          {item.sorta || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-stone-500">Godište</div>
                        <div className="font-medium text-stone-800">
                          {item.godiste ?? "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-stone-500">Naziv vina</div>
                        <div className="font-medium text-stone-800">
                          {item.nazivVina || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-stone-500">Korisnik</div>
                        <div className="font-medium text-stone-800">
                          {item.korisnik || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-stone-500">Količina</div>
                        <div className="font-medium text-stone-800">
                          {formatBroj(item.kolicina)} {item.jedinica || ""}
                        </div>
                      </div>
                      <div>
                        <div className="text-stone-500">Normalizirano</div>
                        <div className="font-medium text-stone-800">
                          {formatBroj(item.normaliziranaKolicina)}
                        </div>
                      </div>
                    </div>

                    {item.napomena ? (
                      <div className="mt-3 border border-emerald-200 bg-white px-3 py-2 text-sm text-stone-700">
                        <span className="font-medium">Napomena:</span>{" "}
                        {item.napomena}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function porukaBlok(error: string) {
  if (!error) return null;

  return (
    <div className="border border-red-200 bg-white/85 px-4 py-3 text-sm text-red-700 shadow-sm print:hidden">
      {error}
    </div>
  );
}