"use client";

import { useMemo, useState } from "react";

type ResetOptions = {
  obrisiTankove: boolean;
  obrisiPreparat: boolean;
  obrisiMjerenja: boolean;
  obrisiZadatke: boolean;
  obrisiRadnje: boolean;
  obrisiPretokeIMijesanja: boolean;
  obrisiPunjenjaIArhivu: boolean;
  obrisiKorisnikeOsimAdmina: boolean;
};

const initialState: ResetOptions = {
  obrisiTankove: false,
  obrisiPreparat: false,
  obrisiMjerenja: true,
  obrisiZadatke: true,
  obrisiRadnje: true,
  obrisiPretokeIMijesanja: true,
  obrisiPunjenjaIArhivu: true,
  obrisiKorisnikeOsimAdmina: false,
};

export default function AdminResetCard() {
  const [options, setOptions] = useState<ResetOptions>(initialState);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const hasAtLeastOneSelected = Object.values(options).some(Boolean);
    return hasAtLeastOneSelected && confirmText.trim() === "OBRISI";
  }, [options, confirmText]);

  function toggleOption(key: keyof ResetOptions) {
    setOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] };

      // Ako brišeš tankove, moraš obrisati sve što o njima ovisi
      if (key === "obrisiTankove" && !prev.obrisiTankove) {
        next.obrisiMjerenja = true;
        next.obrisiZadatke = true;
        next.obrisiRadnje = true;
        next.obrisiPretokeIMijesanja = true;
        next.obrisiPunjenjaIArhivu = true;
      }

      // Ako brišeš preparate, moraš obrisati sve što ih referencira
      if (key === "obrisiPreparat" && !prev.obrisiPreparat) {
        next.obrisiZadatke = true;
        next.obrisiRadnje = true;
      }

      return next;
    });
  }

  async function handleReset() {
    setLoading(true);
    setPoruka(null);
    setGreska(null);

    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmText,
          options,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Reset nije uspio.");
      }

      setPoruka(data?.message || "Reset uspješno izvršen.");
      setConfirmText("");
    } catch (err) {
      setGreska(err instanceof Error ? err.message : "Dogodila se greška.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-900">Reset sustava</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ova opcija je dostupna samo administratoru. Jedinice se nikada ne brišu.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            checked={options.obrisiTankove}
            onChange={() => toggleOption("obrisiTankove")}
          />
          <span>Obriši tankove</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            checked={options.obrisiPreparat}
            onChange={() => toggleOption("obrisiPreparat")}
          />
          <span>Obriši preparate</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            checked={options.obrisiMjerenja}
            onChange={() => toggleOption("obrisiMjerenja")}
          />
          <span>Obriši mjerenja</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            checked={options.obrisiZadatke}
            onChange={() => toggleOption("obrisiZadatke")}
          />
          <span>Obriši zadatke</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            checked={options.obrisiRadnje}
            onChange={() => toggleOption("obrisiRadnje")}
          />
          <span>Obriši radnje</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            checked={options.obrisiPretokeIMijesanja}
            onChange={() => toggleOption("obrisiPretokeIMijesanja")}
          />
          <span>Obriši pretoke i miješanja</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            checked={options.obrisiPunjenjaIArhivu}
            onChange={() => toggleOption("obrisiPunjenjaIArhivu")}
          />
          <span>Obriši punjenja, izlaze i arhivu</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            checked={options.obrisiKorisnikeOsimAdmina}
            onChange={() => toggleOption("obrisiKorisnikeOsimAdmina")}
          />
          <span>Obriši korisnike osim admina</span>
        </label>
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          Za potvrdu upiši <span className="font-bold">OBRISI</span>.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Upiši OBRISI"
          className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-red-500"
        />
      </div>

      {poruka && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {poruka}
        </div>
      )}

      {greska && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {greska}
        </div>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={handleReset}
          disabled={!canSubmit || loading}
          className="rounded-2xl bg-red-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Brišem..." : "Pokreni reset"}
        </button>
      </div>
    </div>
  );
}