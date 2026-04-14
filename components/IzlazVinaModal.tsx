"use client";

import { useState } from "react";

export default function IzlazVinaModal({
  tankId,
  brojTanka,
}: {
  tankId: string;
  brojTanka: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [tip, setTip] = useState<"PRODAJA" | "PUNJENJE">("PRODAJA");
  const [kolicina, setKolicina] = useState("");
  const [datum, setDatum] = useState("");
  const [brojBoca, setBrojBoca] = useState("");
  const [volumenBoce, setVolumenBoce] = useState("0.75");
  const [napomena, setNapomena] = useState("");

  async function spremi() {
    setLoading(true);
    try {
      const res = await fetch("/api/izlaz-vina", {
        method: "POST",
        body: JSON.stringify({
          tankId,
          tip,
          datum: datum || new Date().toISOString(),
          kolicinaLitara: Number(kolicina),
          brojBoca: brojBoca ? Number(brojBoca) : null,
          volumenBoce: volumenBoce ? Number(volumenBoce) : null,
          napomena,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Greška");
        return;
      }

      alert("Spremljeno ✔");
      setOpen(false);
      location.reload();
    } catch (e) {
      alert("Greška servera");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Izlaz vina
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white text-black p-6 w-[400px] rounded">
            <h2 className="text-xl font-bold mb-4">
              Izlaz vina – tank {brojTanka}
            </h2>

            {/* TIP */}
            <select
              value={tip}
              onChange={(e) => setTip(e.target.value as any)}
              className="w-full mb-3 p-2 border"
            >
              <option value="PRODAJA">Prodaja</option>
              <option value="PUNJENJE">Punjenje</option>
            </select>

            {/* KOLIČINA */}
            <input
              placeholder="Količina (L)"
              value={kolicina}
              onChange={(e) => setKolicina(e.target.value)}
              className="w-full mb-3 p-2 border"
            />

            {/* DATUM */}
            <input
              type="datetime-local"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full mb-3 p-2 border"
            />

            {/* PUNJENJE */}
            {tip === "PUNJENJE" && (
              <>
                <input
                  placeholder="Broj boca"
                  value={brojBoca}
                  onChange={(e) => setBrojBoca(e.target.value)}
                  className="w-full mb-3 p-2 border"
                />

                <input
                  placeholder="Volumen boce (0.75)"
                  value={volumenBoce}
                  onChange={(e) => setVolumenBoce(e.target.value)}
                  className="w-full mb-3 p-2 border"
                />
              </>
            )}

            {/* NAPOMENA */}
            <textarea
              placeholder="Napomena"
              value={napomena}
              onChange={(e) => setNapomena(e.target.value)}
              className="w-full mb-3 p-2 border"
            />

            <div className="flex gap-2">
              <button
                onClick={spremi}
                disabled={loading}
                className="flex-1 bg-green-600 text-white p-2"
              >
                Spremi
              </button>

              <button
                onClick={() => setOpen(false)}
                className="flex-1 bg-gray-400 p-2"
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}