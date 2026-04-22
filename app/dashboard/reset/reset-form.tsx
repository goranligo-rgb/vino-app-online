"use client";

import { useMemo, useState } from "react";

type ResetOptions = {
  obrisiTankove: boolean;
  obrisiPreparat: boolean;
  nulirajKolicinePreparata: boolean;
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
  nulirajKolicinePreparata: false,
  obrisiMjerenja: true,
  obrisiZadatke: true,
  obrisiRadnje: true,
  obrisiPretokeIMijesanja: true,
  obrisiPunjenjaIArhivu: true,
  obrisiKorisnikeOsimAdmina: false,
};

export default function AdminResetForm() {
  const [options, setOptions] = useState<ResetOptions>(initialState);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const hasSelected = Object.values(options).some(Boolean);
    return hasSelected && confirmText.trim() === "OBRISI";
  }, [options, confirmText]);

  function setOption<K extends keyof ResetOptions>(key: K, value: boolean) {
    setOptions((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "obrisiTankove" && value) {
        next.obrisiMjerenja = true;
        next.obrisiZadatke = true;
        next.obrisiRadnje = true;
        next.obrisiPretokeIMijesanja = true;
        next.obrisiPunjenjaIArhivu = true;
      }

      if (key === "obrisiPreparat" && value) {
        next.obrisiZadatke = true;
        next.obrisiRadnje = true;
        next.nulirajKolicinePreparata = false;
      }

      return next;
    });
  }

  async function handleSubmit() {
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

      setPoruka(data?.message || "Reset je uspješno izvršen.");
      setConfirmText("");
    } catch (err) {
      setGreska(err instanceof Error ? err.message : "Dogodila se greška.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#14131c] p-6 shadow-xl">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.obrisiTankove}
            onChange={(e) => setOption("obrisiTankove", e.target.checked)}
          />
          <span>Obriši tankove</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.obrisiPreparat}
            onChange={(e) => setOption("obrisiPreparat", e.target.checked)}
          />
          <span>Obriši preparate</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.nulirajKolicinePreparata}
            disabled={options.obrisiPreparat}
            onChange={(e) =>
              setOption("nulirajKolicinePreparata", e.target.checked)
            }
          />
          <span>Postavi količine preparata na 0</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.obrisiMjerenja}
            onChange={(e) => setOption("obrisiMjerenja", e.target.checked)}
          />
          <span>Obriši mjerenja</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.obrisiZadatke}
            onChange={(e) => setOption("obrisiZadatke", e.target.checked)}
          />
          <span>Obriši zadatke</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.obrisiRadnje}
            onChange={(e) => setOption("obrisiRadnje", e.target.checked)}
          />
          <span>Obriši radnje</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.obrisiPretokeIMijesanja}
            onChange={(e) => setOption("obrisiPretokeIMijesanja", e.target.checked)}
          />
          <span>Obriši pretoke i miješanja</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.obrisiPunjenjaIArhivu}
            onChange={(e) => setOption("obrisiPunjenjaIArhivu", e.target.checked)}
          />
          <span>Obriši punjenja, izlaze i arhivu</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-white">
          <input
            type="checkbox"
            checked={options.obrisiKorisnikeOsimAdmina}
            onChange={(e) => setOption("obrisiKorisnikeOsimAdmina", e.target.checked)}
          />
          <span>Obriši korisnike osim admina</span>
        </label>
      </div>

      <div className="mt-6 rounded-2xl border border-red-300/20 bg-red-950/30 p-4">
        <p className="text-sm text-red-100">
          Za potvrdu upiši <span className="font-bold">OBRISI</span>.
        </p>

        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Upiši OBRISI"
          className="mt-3 w-full rounded-xl border border-white/10 bg-[#0f0d14] px-4 py-3 text-white outline-none focus:border-red-400"
        />
      </div>

      {poruka && (
        <div className="mt-4 rounded-xl border border-green-500/20 bg-green-950/30 p-3 text-sm text-green-100">
          {poruka}
        </div>
      )}

      {greska && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-950/30 p-3 text-sm text-red-100">
          {greska}
        </div>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="rounded-2xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Brišem..." : "Pokreni reset"}
        </button>
      </div>
    </div>
  );
}