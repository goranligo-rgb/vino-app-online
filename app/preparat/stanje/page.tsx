"use client";

/**
 * Pregled stanja skladista preparata — jedan redak po preparatu.
 *
 * Ovo je PREGLED, ne uredivanje: kartice za uredivanje ostaju na /preparat.
 * Bez zbroja na dnu — jedinice su razlicite (kg, l, g, ml) pa zbroj ne bi
 * imao znacenje.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NatragHome from "@/components/NatragHome";

type RedakStanja = {
  id: string;
  naziv: string;
  jedinica: string | null;
  stanje: number;
  minimum: number;
  razlika: number;
  ispodMinimuma: boolean;
  aktivan: boolean;
  zadnjiUlazDatum: string | null;
  zadnjiUlazDobavljac: string | null;
};

type Odstupanje = {
  id: string;
  naziv: string;
  stanje: number;
  zbrojDnevnika: number;
  razlika: number;
};

type ProvjeraKnjige = {
  ukupnoPreparata: number;
  uskladjeno: boolean;
  odstupanja: Odstupanje[];
};

type ApiOdgovor = {
  ok?: boolean;
  redci?: RedakStanja[];
  provjera?: ProvjeraKnjige;
  error?: string;
};

const brojFormat = new Intl.NumberFormat("hr-HR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatBroj(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "-";
  return brojFormat.format(Number(v));
}

function formatDatum(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";

  const dijelovi = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zagreb",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);

  const get = (tip: string) => dijelovi.find((x) => x.type === tip)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}`;
}

export default function StanjeSkladistaPage() {
  const [pretraga, setPretraga] = useState("");
  const [samoIspodMinimuma, setSamoIspodMinimuma] = useState(false);
  const [samoAktivni, setSamoAktivni] = useState(true);

  const [redci, setRedci] = useState<RedakStanja[]>([]);
  const [provjera, setProvjera] = useState<ProvjeraKnjige | null>(null);
  const [ucitavanje, setUcitavanje] = useState(true);
  const [greska, setGreska] = useState<string | null>(null);

  // Isti parametri idu i u pregled i u izvoz — izvoz zato daje tocno ono
  // sto je na ekranu.
  const parametri = useMemo(() => {
    const p = new URLSearchParams();
    if (pretraga.trim()) p.set("q", pretraga.trim());
    p.set("samoIspodMinimuma", samoIspodMinimuma ? "1" : "0");
    p.set("samoAktivni", samoAktivni ? "1" : "0");
    return p.toString();
  }, [pretraga, samoIspodMinimuma, samoAktivni]);

  useEffect(() => {
    let otkazano = false;

    // Kratka odgoda da tipkanje u pretrazi ne salje upit po znaku.
    const odgoda = setTimeout(async () => {
      try {
        setUcitavanje(true);
        setGreska(null);

        const res = await fetch(`/api/preparat/stanje?${parametri}`, {
          cache: "no-store",
        });
        const data: ApiOdgovor = await res.json();

        if (otkazano) return;

        if (!res.ok) {
          setGreska(data?.error || "Greška kod dohvaćanja stanja skladišta.");
          setRedci([]);
          setProvjera(null);
          return;
        }

        setRedci(Array.isArray(data.redci) ? data.redci : []);
        setProvjera(data.provjera ?? null);
      } catch (error) {
        console.error(error);
        if (!otkazano) {
          setGreska("Greška kod dohvaćanja stanja skladišta.");
        }
      } finally {
        if (!otkazano) setUcitavanje(false);
      }
    }, 250);

    return () => {
      otkazano = true;
      clearTimeout(odgoda);
    };
  }, [parametri]);

  const brojIspodMinimuma = redci.filter((r) => r.ispodMinimuma).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-emerald-50/35 to-stone-200">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <NatragHome />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-stone-500">
              <Link href="/preparat" className="hover:text-stone-700">
                Preparati
              </Link>
              {" / "}
              <span>Stanje skladišta</span>
            </div>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-800">
              Stanje skladišta
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Pregled stanja svih preparata odjednom. Klik na naziv otvara
              promet tog preparata.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/preparat/stanje/export?${parametri}`}
              className="inline-flex h-11 items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:brightness-105"
            >
              ⬇ Izvoz u Excel
            </a>

            <Link
              href="/preparat"
              className="inline-flex h-11 items-center justify-center border border-emerald-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-emerald-50"
            >
              Natrag na preparate
            </Link>
          </div>
        </div>

        {/* Provjera knjige: kontrolni upit koji se do sad pokretao rucno. */}
        {provjera ? (
          provjera.uskladjeno ? (
            <div className="border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              ✓ Knjiga usklađena ({provjera.ukupnoPreparata} preparata)
            </div>
          ) : (
            <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="font-semibold">
                ⚠ Odstupanje: {provjera.odstupanja.length} preparata
              </div>
              <div className="mt-1 break-words text-red-700">
                {provjera.odstupanja.map((o) => o.naziv).join(", ")}
              </div>
            </div>
          )
        ) : null}

        {greska ? (
          <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {greska}
          </div>
        ) : null}

        <div className="border border-emerald-200 bg-white/85 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <input
              value={pretraga}
              onChange={(e) => setPretraga(e.target.value)}
              placeholder="Pretraga po nazivu..."
              className="h-11 min-w-0 flex-1 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 sm:min-w-[240px] sm:flex-none"
            />

            <label className="inline-flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={samoIspodMinimuma}
                onChange={(e) => setSamoIspodMinimuma(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              Samo ispod minimuma
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={samoAktivni}
                onChange={(e) => setSamoAktivni(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              Samo aktivni
            </label>

            <div className="text-sm text-stone-500">
              {ucitavanje
                ? "Učitavam..."
                : `${redci.length} preparata · ${brojIspodMinimuma} ispod minimuma`}
            </div>
          </div>
        </div>

        {redci.length === 0 && !ucitavanje ? (
          <div className="border border-dashed border-emerald-300 bg-white/70 px-4 py-10 text-center text-sm text-stone-500">
            Nema preparata za zadane filtere.
          </div>
        ) : (
          <div className="border border-emerald-200 bg-white/85 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-emerald-200 text-left text-stone-500">
                    <th className="px-3 py-2 font-medium">Naziv</th>
                    <th className="px-3 py-2 font-medium">Skladišna jedinica</th>
                    <th className="px-3 py-2 text-right font-medium">Stanje</th>
                    <th className="px-3 py-2 text-right font-medium">Minimum</th>
                    <th className="px-3 py-2 text-right font-medium">Razlika</th>
                    <th className="px-3 py-2 font-medium">Zadnji ulaz</th>
                    <th className="px-3 py-2 font-medium">
                      Dobavljač zadnjeg ulaza
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {redci.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-emerald-100 last:border-0 ${
                        r.ispodMinimuma ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="px-3 py-3">
                        <Link
                          href={`/preparat?promet=${encodeURIComponent(r.id)}`}
                          className={`font-medium underline-offset-2 hover:underline ${
                            r.ispodMinimuma ? "text-red-800" : "text-stone-800"
                          }`}
                        >
                          {r.naziv}
                        </Link>
                        {!r.aktivan ? (
                          <span className="ml-2 text-xs text-stone-400">
                            (neaktivan)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-stone-700">
                        {r.jedinica || "-"}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums ${
                          r.ispodMinimuma ? "text-red-800" : "text-stone-700"
                        }`}
                      >
                        {formatBroj(r.stanje)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-stone-700">
                        {formatBroj(r.minimum)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums font-semibold ${
                          r.razlika < 0 ? "text-red-700" : "text-stone-700"
                        }`}
                      >
                        {formatBroj(r.razlika)}
                      </td>
                      <td className="px-3 py-3 text-stone-700">
                        {formatDatum(r.zadnjiUlazDatum)}
                      </td>
                      <td className="px-3 py-3 text-stone-700">
                        {r.zadnjiUlazDobavljac || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {redci.map((r) => (
                <div
                  key={r.id}
                  className={`min-w-0 border p-3 ${
                    r.ispodMinimuma
                      ? "border-red-300 bg-red-50"
                      : "border-emerald-200 bg-emerald-50/30"
                  }`}
                >
                  <Link
                    href={`/preparat?promet=${encodeURIComponent(r.id)}`}
                    className={`block break-words text-sm font-semibold underline-offset-2 hover:underline ${
                      r.ispodMinimuma ? "text-red-800" : "text-stone-800"
                    }`}
                  >
                    {r.naziv}
                  </Link>

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-600">
                    <div>
                      Stanje:{" "}
                      <span className="font-semibold text-stone-800">
                        {formatBroj(r.stanje)} {r.jedinica || ""}
                      </span>
                    </div>
                    <div>
                      Minimum:{" "}
                      <span className="font-semibold text-stone-800">
                        {formatBroj(r.minimum)}
                      </span>
                    </div>
                    <div>
                      Razlika:{" "}
                      <span
                        className={`font-semibold ${
                          r.razlika < 0 ? "text-red-700" : "text-stone-800"
                        }`}
                      >
                        {formatBroj(r.razlika)}
                      </span>
                    </div>
                    <div>
                      Zadnji ulaz:{" "}
                      <span className="font-semibold text-stone-800">
                        {formatDatum(r.zadnjiUlazDatum)}
                      </span>
                    </div>
                    <div className="col-span-2 break-words">
                      Dobavljač: {r.zadnjiUlazDobavljac || "-"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
