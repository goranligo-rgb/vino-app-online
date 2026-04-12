"use client";

import NatragHome from "@/components/NatragHome";
import { useEffect, useMemo, useRef, useState } from "react";

type Unit = {
  id: string;
  naziv: string;
  tip?: string | null;
  faktor?: number | null;
};

type KorekcijaTip =
  | "SLOBODNI_SO2"
  | "SECER"
  | "UKUPNE_KISELINE"
  | "PH"
  | "ALKOHOL";

type Preparat = {
  id: string;
  naziv: string;
  opis?: string | null;
  strucnoIme?: string | null;

  dozaOd: number | null;
  dozaDo: number | null;

  unitId: string | null;
  unit?: Unit | null;

  isKorekcijski?: boolean;
  korekcijaTip?: KorekcijaTip | null;
  korekcijaJedinica?: string | null;

  referentnaKolicina?: number | null;
  referentnaKolicinaJedinica?: string | null;
  referentniVolumen?: number | null;
  referentniVolumenJedinica?: string | null;
  povecanjeParametra?: number | null;

  ucinakPoJedinici?: number | null;
};

function broj(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "";
  return String(v);
}

const jediniceKolicine = ["mg", "g", "dkg", "kg", "ml", "dl", "dcl", "l"];
const jediniceVolumena = ["l", "hl"];
const jediniceParametra = ["mg/l", "g/l", "Oe", "Brix", "pH", "% vol"];

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

export default function PreparatPage() {
  const [preparati, setPreparati] = useState<Preparat[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");

  const [pretraga, setPretraga] = useState("");

  const [novi, setNovi] = useState({
    naziv: "",
    opis: "",
    strucnoIme: "",
    dozaOd: "",
    dozaDo: "",
    unitId: "",

    isKorekcijski: false,
    korekcijaTip: "",
    korekcijaJedinica: "mg/l",
    referentnaKolicina: "",
    referentnaKolicinaJedinica: "g",
    referentniVolumen: "",
    referentniVolumenJedinica: "l",
    povecanjeParametra: "",
  });

  const nazivRef = useRef<HTMLInputElement | null>(null);
  const dozaOdRef = useRef<HTMLInputElement | null>(null);
  const dozaDoRef = useRef<HTMLInputElement | null>(null);
  const unitRef = useRef<HTMLSelectElement | null>(null);
  const korekcijskiRef = useRef<HTMLInputElement | null>(null);
  const korekcijaTipRef = useRef<HTMLSelectElement | null>(null);
  const korekcijaJedinicaRef = useRef<HTMLSelectElement | null>(null);
  const refKolicinaRef = useRef<HTMLInputElement | null>(null);
  const refKolicinaJedRef = useRef<HTMLSelectElement | null>(null);
  const refVolumenRef = useRef<HTMLInputElement | null>(null);
  const refVolumenJedRef = useRef<HTMLSelectElement | null>(null);
  const povecanjeRef = useRef<HTMLInputElement | null>(null);
  const dodajRef = useRef<HTMLButtonElement | null>(null);

  function fokusirajSljedece(
    e: React.KeyboardEvent,
    next?: HTMLElement | null
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    next?.focus();
  }

  async function ucitajPreparati() {
    try {
      const res = await fetch("/api/preparat", { cache: "no-store" });
      const data = await res.json();
      setPreparati(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setPreparati([]);
    }
  }

  async function ucitajUnits() {
    try {
      const res = await fetch("/api/unit", { cache: "no-store" });
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        setUnits(data);
        return;
      }

      const seedRes = await fetch("/api/unit/seed", {
        method: "POST",
        cache: "no-store",
      });

      const seedData = await seedRes.json();
      setUnits(Array.isArray(seedData?.units) ? seedData.units : []);
    } catch (err) {
      console.error(err);
      setUnits([]);
    }
  }

  useEffect(() => {
    ucitajPreparati();
    ucitajUnits();
  }, []);

  const formulaPreview = useMemo(() => {
    if (!novi.isKorekcijski) return "";

    const povecanje =
      novi.povecanjeParametra === "" ? null : Number(novi.povecanjeParametra);
    const kolicina =
      novi.referentnaKolicina === "" ? null : Number(novi.referentnaKolicina);
    const volumen =
      novi.referentniVolumen === "" ? null : Number(novi.referentniVolumen);

    if (
      povecanje == null ||
      kolicina == null ||
      volumen == null ||
      Number.isNaN(povecanje) ||
      Number.isNaN(kolicina) ||
      Number.isNaN(volumen) ||
      povecanje <= 0 ||
      kolicina <= 0 ||
      volumen <= 0
    ) {
      return "";
    }

    return `${kolicina} ${novi.referentnaKolicinaJedinica} na ${volumen} ${novi.referentniVolumenJedinica} diže ${novi.korekcijaTip || "parametar"} za ${povecanje} ${novi.korekcijaJedinica}`;
  }, [novi]);

  async function dodaj() {
    if (!novi.naziv.trim()) {
      setPoruka("Naziv preparata je obavezan.");
      return;
    }

    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch("/api/preparat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          naziv: novi.naziv.trim(),
          opis: novi.opis.trim() || null,
          strucnoIme: novi.strucnoIme.trim() || null,
          dozaOd: novi.dozaOd === "" ? null : Number(novi.dozaOd),
          dozaDo: novi.dozaDo === "" ? null : Number(novi.dozaDo),
          unitId: novi.unitId || null,

          isKorekcijski: novi.isKorekcijski,
          korekcijaTip: novi.isKorekcijski ? novi.korekcijaTip || null : null,
          korekcijaJedinica: novi.isKorekcijski
            ? novi.korekcijaJedinica || null
            : null,
          referentnaKolicina:
            novi.isKorekcijski && novi.referentnaKolicina !== ""
              ? Number(novi.referentnaKolicina)
              : null,
          referentnaKolicinaJedinica: novi.isKorekcijski
            ? novi.referentnaKolicinaJedinica || null
            : null,
          referentniVolumen:
            novi.isKorekcijski && novi.referentniVolumen !== ""
              ? Number(novi.referentniVolumen)
              : null,
          referentniVolumenJedinica: novi.isKorekcijski
            ? novi.referentniVolumenJedinica || null
            : null,
          povecanjeParametra:
            novi.isKorekcijski && novi.povecanjeParametra !== ""
              ? Number(novi.povecanjeParametra)
              : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška.");
        return;
      }

      setNovi({
        naziv: "",
        opis: "",
        strucnoIme: "",
        dozaOd: "",
        dozaDo: "",
        unitId: "",

        isKorekcijski: false,
        korekcijaTip: "",
        korekcijaJedinica: "mg/l",
        referentnaKolicina: "",
        referentnaKolicinaJedinica: "g",
        referentniVolumen: "",
        referentniVolumenJedinica: "l",
        povecanjeParametra: "",
      });

      setPoruka("Preparat dodan.");
      await ucitajPreparati();
      await ucitajUnits();
      nazivRef.current?.focus();
    } catch {
      setPoruka("Greška.");
    } finally {
      setLoading(false);
    }
  }

  async function spremi(p: Preparat) {
    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch("/api/preparat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          naziv: p.naziv,
          opis: p.opis ?? null,
          strucnoIme: p.strucnoIme ?? null,
          dozaOd: p.dozaOd,
          dozaDo: p.dozaDo,
          unitId: p.unitId ?? null,

          isKorekcijski: p.isKorekcijski ?? false,
          korekcijaTip: p.isKorekcijski ? p.korekcijaTip ?? null : null,
          korekcijaJedinica: p.isKorekcijski
            ? p.korekcijaJedinica ?? null
            : null,
          referentnaKolicina: p.isKorekcijski
            ? p.referentnaKolicina ?? null
            : null,
          referentnaKolicinaJedinica: p.isKorekcijski
            ? p.referentnaKolicinaJedinica ?? null
            : null,
          referentniVolumen: p.isKorekcijski
            ? p.referentniVolumen ?? null
            : null,
          referentniVolumenJedinica: p.isKorekcijski
            ? p.referentniVolumenJedinica ?? null
            : null,
          povecanjeParametra: p.isKorekcijski
            ? p.povecanjeParametra ?? null
            : null,
        }),
      });

      if (res.ok) {
        setPoruka("Spremljeno.");
        await ucitajPreparati();
      } else {
        const data = await res.json().catch(() => null);
        setPoruka(data?.error || "Greška kod spremanja.");
      }
    } catch {
      setPoruka("Greška kod spremanja.");
    } finally {
      setLoading(false);
    }
  }

  async function obrisi(id: string) {
    if (!confirm("Obrisati preparat?")) return;

    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch("/api/preparat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setPoruka(data?.error || "Greška kod brisanja.");
        return;
      }

      setPoruka("Obrisano.");
      await ucitajPreparati();
    } catch {
      setPoruka("Greška kod brisanja.");
    } finally {
      setLoading(false);
    }
  }

  function promijeniPreparat(
    id: string,
    polje: keyof Preparat,
    vrijednost: string | boolean
  ) {
    setPreparati((stari) =>
      stari.map((p) =>
        p.id === id
          ? {
              ...p,
              [polje]:
                polje === "dozaOd" ||
                polje === "dozaDo" ||
                polje === "referentnaKolicina" ||
                polje === "referentniVolumen" ||
                polje === "povecanjeParametra"
                  ? vrijednost === ""
                    ? null
                    : Number(vrijednost)
                  : vrijednost,
            }
          : p
      )
    );
  }

  const filtriraniPreparati = useMemo(() => {
    const q = pretraga.trim().toLowerCase();

    return preparati.filter((p) => {
      if (!q) return true;
      const nazivUnit = p.unit?.naziv ?? "";
      const tekst =
        `${p.naziv} ${nazivUnit} ${p.korekcijaTip ?? ""} ${p.korekcijaJedinica ?? ""}`.toLowerCase();
      return tekst.includes(q);
    });
  }, [preparati, pretraga]);

  const brojKorekcijskih = preparati.filter((p) => p.isKorekcijski).length;
  const brojStandardnih = preparati.length - brojKorekcijskih;

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-emerald-50/35 to-stone-200">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <NatragHome />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-800">
              Preparati
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Uređivanje baze enoloških preparata i preporučenih doza.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <KarticaBroj naslov="Ukupno" vrijednost={String(preparati.length)} />
            <KarticaBroj
              naslov="Standardni"
              vrijednost={String(brojStandardnih)}
            />
            <KarticaBroj
              naslov="Korekcijski"
              vrijednost={String(brojKorekcijskih)}
            />
          </div>
        </div>

        {poruka && (
          <div className="border border-emerald-200 bg-white/85 px-4 py-3 text-sm text-stone-700 shadow-sm">
            {poruka}
          </div>
        )}

        <div className="border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/40 to-stone-50 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-stone-800">
              Novi preparat
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Dodaj naziv, preporučeni raspon, jedinicu i po potrebi formulu korekcije.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <input
              ref={nazivRef}
              placeholder="Naziv preparata"
              value={novi.naziv}
              onChange={(e) => setNovi({ ...novi, naziv: e.target.value })}
              onKeyDown={(e) => fokusirajSljedece(e, dozaOdRef.current)}
              className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-5"
            />

            <input
              ref={dozaOdRef}
              placeholder="Doza od"
              type="number"
              step="0.01"
              value={novi.dozaOd}
              onChange={(e) => setNovi({ ...novi, dozaOd: e.target.value })}
              onKeyDown={(e) => fokusirajSljedece(e, dozaDoRef.current)}
              className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
            />

            <input
              ref={dozaDoRef}
              placeholder="Doza do"
              type="number"
              step="0.01"
              value={novi.dozaDo}
              onChange={(e) => setNovi({ ...novi, dozaDo: e.target.value })}
              onKeyDown={(e) => fokusirajSljedece(e, unitRef.current)}
              className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
            />

            <select
              ref={unitRef}
              value={novi.unitId}
              onChange={(e) => setNovi({ ...novi, unitId: e.target.value })}
              onKeyDown={(e) => fokusirajSljedece(e, korekcijskiRef.current)}
              className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
            >
              <option value="">Jedinica</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.naziv}
                </option>
              ))}
            </select>

            <div className="md:col-span-12">
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <input
                  ref={korekcijskiRef}
                  type="checkbox"
                  checked={novi.isKorekcijski}
                  onChange={(e) =>
                    setNovi({ ...novi, isKorekcijski: e.target.checked })
                  }
                  onKeyDown={(e) =>
                    fokusirajSljedece(
                      e,
                      novi.isKorekcijski ? korekcijaTipRef.current : dodajRef.current
                    )
                  }
                />
                Korekcijski preparat
              </label>
            </div>

            {novi.isKorekcijski && (
              <>
                <select
                  ref={korekcijaTipRef}
                  value={novi.korekcijaTip}
                  onChange={(e) =>
                    setNovi({ ...novi, korekcijaTip: e.target.value })
                  }
                  onKeyDown={(e) =>
                    fokusirajSljedece(e, korekcijaJedinicaRef.current)
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                >
                  <option value="">Što korigira</option>
                  <option value="SLOBODNI_SO2">Slobodni SO2</option>
                  <option value="SECER">Šećer</option>
                  <option value="UKUPNE_KISELINE">Ukupne kiseline</option>
                  <option value="PH">pH</option>
                  <option value="ALKOHOL">Alkohol</option>
                </select>

                <select
                  ref={korekcijaJedinicaRef}
                  value={novi.korekcijaJedinica}
                  onChange={(e) =>
                    setNovi({ ...novi, korekcijaJedinica: e.target.value })
                  }
                  onKeyDown={(e) => fokusirajSljedece(e, refKolicinaRef.current)}
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                >
                  {jediniceParametra.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>

                <input
                  ref={refKolicinaRef}
                  placeholder="Referentna količina"
                  type="number"
                  step="0.01"
                  value={novi.referentnaKolicina}
                  onChange={(e) =>
                    setNovi({ ...novi, referentnaKolicina: e.target.value })
                  }
                  onKeyDown={(e) =>
                    fokusirajSljedece(e, refKolicinaJedRef.current)
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                />

                <select
                  ref={refKolicinaJedRef}
                  value={novi.referentnaKolicinaJedinica}
                  onChange={(e) =>
                    setNovi({
                      ...novi,
                      referentnaKolicinaJedinica: e.target.value,
                    })
                  }
                  onKeyDown={(e) => fokusirajSljedece(e, refVolumenRef.current)}
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                >
                  {jediniceKolicine.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>

                <input
                  ref={refVolumenRef}
                  placeholder="Referentni volumen"
                  type="number"
                  step="0.01"
                  value={novi.referentniVolumen}
                  onChange={(e) =>
                    setNovi({ ...novi, referentniVolumen: e.target.value })
                  }
                  onKeyDown={(e) =>
                    fokusirajSljedece(e, refVolumenJedRef.current)
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                />

                <select
                  ref={refVolumenJedRef}
                  value={novi.referentniVolumenJedinica}
                  onChange={(e) =>
                    setNovi({
                      ...novi,
                      referentniVolumenJedinica: e.target.value,
                    })
                  }
                  onKeyDown={(e) => fokusirajSljedece(e, povecanjeRef.current)}
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                >
                  {jediniceVolumena.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>

                <input
                  ref={povecanjeRef}
                  placeholder="Povećanje parametra"
                  type="number"
                  step="0.01"
                  value={novi.povecanjeParametra}
                  onChange={(e) =>
                    setNovi({ ...novi, povecanjeParametra: e.target.value })
                  }
                  onKeyDown={(e) => fokusirajSljedece(e, dodajRef.current)}
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                />

                {formulaPreview ? (
                  <div className="md:col-span-12 border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
                    Formula: {formulaPreview}
                  </div>
                ) : null}
              </>
            )}

            <div className="md:col-span-1">
              <button
                ref={dodajRef}
                onClick={dodaj}
                disabled={loading}
                className="inline-flex h-11 w-full items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:brightness-105 disabled:opacity-50"
              >
                Dodaj
              </button>
            </div>
          </div>
        </div>

        <div className="border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/35 to-stone-50 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-stone-800">
                Pregled preparata
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Pretraži i uređuj postojeće preparate.
              </p>
            </div>

            <input
              value={pretraga}
              onChange={(e) => setPretraga(e.target.value)}
              placeholder="Pretraga po nazivu..."
              className="h-11 min-w-[220px] border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
            />
          </div>

          <div className="space-y-3">
            {filtriraniPreparati.map((p) => (
              <div
                key={p.id}
                className="border border-emerald-200 bg-white/85 p-4 shadow-sm transition hover:bg-white"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center">
                  <div className="md:col-span-5">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Naziv
                    </label>
                    <input
                      value={p.naziv}
                      onChange={(e) =>
                        promijeniPreparat(p.id, "naziv", e.target.value)
                      }
                      className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Doza od
                    </label>
                    <input
                      value={broj(p.dozaOd)}
                      onChange={(e) =>
                        promijeniPreparat(p.id, "dozaOd", e.target.value)
                      }
                      type="number"
                      step="0.01"
                      className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Doza do
                    </label>
                    <input
                      value={broj(p.dozaDo)}
                      onChange={(e) =>
                        promijeniPreparat(p.id, "dozaDo", e.target.value)
                      }
                      type="number"
                      step="0.01"
                      className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Jedinica
                    </label>
                    <select
                      value={p.unitId ?? ""}
                      onChange={(e) =>
                        promijeniPreparat(p.id, "unitId", e.target.value)
                      }
                      className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                    >
                      <option value="">Jedinica</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.naziv}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-1">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Akcije
                    </label>
                    <div className="flex items-center justify-start gap-2 md:justify-end">
                      <button
                        onClick={() => spremi(p)}
                        disabled={loading}
                        className="inline-flex h-10 items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-3 text-xs font-semibold text-stone-800 transition hover:brightness-105 disabled:opacity-50"
                      >
                        Spremi
                      </button>

                      <button
                        onClick={() => obrisi(p.id)}
                        disabled={loading}
                        className="inline-flex h-10 items-center justify-center border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                      >
                        Obriši
                      </button>
                    </div>
                  </div>
                </div>

                {p.isKorekcijski && (
                  <div className="mt-4 grid grid-cols-1 gap-3 border border-emerald-200 bg-emerald-50/60 p-4 md:grid-cols-12">
                    <div className="md:col-span-12">
                      <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                        <input
                          type="checkbox"
                          checked={p.isKorekcijski ?? false}
                          onChange={(e) =>
                            promijeniPreparat(
                              p.id,
                              "isKorekcijski",
                              e.target.checked
                            )
                          }
                        />
                        Korekcijski preparat
                      </label>
                    </div>

                    <div className="md:col-span-3">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                        Što korigira
                      </label>
                      <select
                        value={p.korekcijaTip ?? ""}
                        onChange={(e) =>
                          promijeniPreparat(p.id, "korekcijaTip", e.target.value)
                        }
                        className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                      >
                        <option value="">Odaberi</option>
                        <option value="SLOBODNI_SO2">Slobodni SO2</option>
                        <option value="SECER">Šećer</option>
                        <option value="UKUPNE_KISELINE">Ukupne kiseline</option>
                        <option value="PH">pH</option>
                        <option value="ALKOHOL">Alkohol</option>
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                        Jedinica parametra
                      </label>
                      <select
                        value={p.korekcijaJedinica ?? "mg/l"}
                        onChange={(e) =>
                          promijeniPreparat(
                            p.id,
                            "korekcijaJedinica",
                            e.target.value
                          )
                        }
                        className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                      >
                        {jediniceParametra.map((j) => (
                          <option key={j} value={j}>
                            {j}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                        Ref. količina
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={broj(p.referentnaKolicina)}
                        onChange={(e) =>
                          promijeniPreparat(
                            p.id,
                            "referentnaKolicina",
                            e.target.value
                          )
                        }
                        className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                        Jed. količine
                      </label>
                      <select
                        value={p.referentnaKolicinaJedinica ?? "g"}
                        onChange={(e) =>
                          promijeniPreparat(
                            p.id,
                            "referentnaKolicinaJedinica",
                            e.target.value
                          )
                        }
                        className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                      >
                        {jediniceKolicine.map((j) => (
                          <option key={j} value={j}>
                            {j}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                        Ref. volumen
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={broj(p.referentniVolumen)}
                        onChange={(e) =>
                          promijeniPreparat(
                            p.id,
                            "referentniVolumen",
                            e.target.value
                          )
                        }
                        className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                        Jed. volumena
                      </label>
                      <select
                        value={p.referentniVolumenJedinica ?? "l"}
                        onChange={(e) =>
                          promijeniPreparat(
                            p.id,
                            "referentniVolumenJedinica",
                            e.target.value
                          )
                        }
                        className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                      >
                        {jediniceVolumena.map((j) => (
                          <option key={j} value={j}>
                            {j}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                        Povećanje
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={broj(p.povecanjeParametra)}
                        onChange={(e) =>
                          promijeniPreparat(
                            p.id,
                            "povecanjeParametra",
                            e.target.value
                          )
                        }
                        className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                      />
                    </div>
                  </div>
                )}

                {!p.isKorekcijski && (
                  <div className="mt-4 border border-dashed border-stone-300 bg-stone-50/70 p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                      <input
                        type="checkbox"
                        checked={p.isKorekcijski ?? false}
                        onChange={(e) =>
                          promijeniPreparat(
                            p.id,
                            "isKorekcijski",
                            e.target.checked
                          )
                        }
                      />
                      Označi kao korekcijski preparat
                    </label>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {p.unit?.naziv ? (
                    <span className="inline-flex border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600">
                      Jedinica: {p.unit.naziv}
                    </span>
                  ) : null}

                  {p.isKorekcijski ? (
                    <span className="inline-flex border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      Korekcijski preparat
                    </span>
                  ) : null}

                  {p.korekcijaTip ? (
                    <span className="inline-flex border border-lime-200 bg-lime-50 px-2.5 py-1 text-xs font-medium text-lime-700">
                      Tip: {p.korekcijaTip}
                    </span>
                  ) : null}

                  {p.korekcijaJedinica ? (
                    <span className="inline-flex border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
                      Parametar: {p.korekcijaJedinica}
                    </span>
                  ) : null}

                  {p.referentnaKolicina != null ? (
                    <span className="inline-flex border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700">
                      Ref. količina: {p.referentnaKolicina}{" "}
                      {p.referentnaKolicinaJedinica ?? ""}
                    </span>
                  ) : null}

                  {p.referentniVolumen != null ? (
                    <span className="inline-flex border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700">
                      Ref. volumen: {p.referentniVolumen}{" "}
                      {p.referentniVolumenJedinica ?? ""}
                    </span>
                  ) : null}

                  {p.povecanjeParametra != null ? (
                    <span className="inline-flex border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      Diže za: {p.povecanjeParametra} {p.korekcijaJedinica ?? ""}
                    </span>
                  ) : null}

                  {p.ucinakPoJedinici != null ? (
                    <span className="inline-flex border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      Učinak po jedinici: {p.ucinakPoJedinici}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}

            {filtriraniPreparati.length === 0 && (
              <div className="border border-dashed border-emerald-300 bg-white/70 px-4 py-10 text-center text-sm text-stone-500">
                Nema preparata za prikaz.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}