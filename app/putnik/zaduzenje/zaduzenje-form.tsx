"use client";

import { useState } from "react";

type Opcija = { id: string; naziv: string };
type Putnik = { ime: string };

// Jedan red unosa: artikl + kolicina (+ jedinica samo za vino).
type Red = { key: number; artiklId: string; kolicina: string; jedinica: string };

let brojac = 0;
function noviRed(): Red {
  brojac += 1;
  return { key: brojac, artiklId: "", kolicina: "", jedinica: "kom" };
}

// Faza 10 - jedna forma za batch unos: putnik + datum jednom, pa vise redova artikala.
// Koristi se 4x (zaduzi vino/promo, povrat vino/promo). withJedinica = vino.
export default function ZaduzenjeForm({
  action,
  putnici,
  artikli,
  danas,
  withJedinica,
  naslov,
  opis,
  gumb,
  artiklPlaceholder,
  accent = "orange",
  povratak,
}: {
  action: (formData: FormData) => void | Promise<void>;
  putnici: Putnik[];
  artikli: Opcija[];
  danas: string;
  withJedinica: boolean;
  naslov: string;
  opis: string;
  gumb: string;
  artiklPlaceholder: string;
  accent?: "orange" | "red";
  // Putanja s trenutnim filterima — akcija se nakon spremanja vrati tocno ovdje
  // (uz zelenu potvrdu), da se filtar putnika/datuma ne izgubi.
  povratak: string;
}) {
  const [redovi, setRedovi] = useState<Red[]>(() => [noviRed()]);

  function azuriraj(key: number, polje: "artiklId" | "kolicina" | "jedinica", vrijednost: string) {
    setRedovi((prev) => prev.map((r) => (r.key === key ? { ...r, [polje]: vrijednost } : r)));
  }
  function dodajRed() {
    setRedovi((prev) => [...prev, noviRed()]);
  }
  function obrisiRed(key: number) {
    setRedovi((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  const okvir = accent === "red" ? "border-red-200 from-white to-red-50" : "border-orange-200 from-white to-orange-50";
  const gumbAkcija =
    accent === "red"
      ? "border-red-300 from-red-100 to-orange-100 text-red-950"
      : "border-orange-300 from-orange-100 to-amber-100 text-orange-950";
  const polje = "w-full border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400";
  const kolone = withJedinica ? "md:grid-cols-[1fr_120px_90px_auto]" : "md:grid-cols-[1fr_140px_auto]";

  if (artikli.length === 0) {
    return (
      <div className={`border bg-gradient-to-b p-4 ${okvir}`}>
        <h2 className="mb-1 text-[18px] font-semibold text-stone-800">{naslov}</h2>
        <div className="text-[13px] text-stone-500">Prvo dodaj artikl u katalog na /putnik/promo.</div>
      </div>
    );
  }

  return (
    <form action={action} className={`border bg-gradient-to-b p-4 ${okvir}`}>
      <input type="hidden" name="povratak" value={povratak} />
      <h2 className="mb-1 text-[18px] font-semibold text-stone-800">{naslov}</h2>
      <p className="mb-3 text-[12px] text-stone-500">{opis}</p>

      {/* Putnik + datum — jednom za sve redove */}
      <div className="mb-3 grid gap-2 md:grid-cols-2">
        <select name="putnikIme" required defaultValue="" className={polje}>
          <option value="">Putnik…</option>
          {putnici.map((p) => (
            <option key={p.ime} value={p.ime}>{p.ime}</option>
          ))}
        </select>
        <input name="datum" type="date" defaultValue={danas} className={polje} />
      </div>

      {/* Redovi artikala */}
      <div className="space-y-2">
        {redovi.map((r, index) => (
          <div key={r.key} className={`grid gap-2 border border-orange-100 bg-white p-2 ${kolone}`}>
            <select
              value={r.artiklId}
              onChange={(e) => azuriraj(r.key, "artiklId", e.target.value)}
              name="artiklId"
              className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
            >
              <option value="">{`${artiklPlaceholder} ${index + 1}…`}</option>
              {artikli.map((a) => (
                <option key={a.id} value={a.id}>{a.naziv}</option>
              ))}
            </select>
            <input
              name="kolicina"
              value={r.kolicina}
              onChange={(e) => azuriraj(r.key, "kolicina", e.target.value)}
              type="number"
              step={withJedinica ? "any" : "1"}
              placeholder="Količina"
              className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
            />
            {withJedinica ? (
              <select
                name="jedinica"
                value={r.jedinica}
                onChange={(e) => azuriraj(r.key, "jedinica", e.target.value)}
                className="border border-orange-200 bg-white px-2 py-2 text-[14px] outline-none focus:border-orange-400"
              >
                <option value="kom">kom</option>
                <option value="L">L</option>
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => obrisiRed(r.key)}
              disabled={redovi.length === 1}
              className="border border-orange-200 bg-white px-3 py-2 text-[13px] font-semibold text-stone-600 hover:bg-orange-50 disabled:opacity-40"
            >
              Ukloni
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={dodajRed}
          className="border border-orange-300 bg-white px-3 py-2 text-[13px] font-semibold text-orange-900 hover:bg-orange-50"
        >
          + Dodaj red
        </button>
        <span className="text-[12px] text-stone-500">Prazni redovi (bez artikla ili količine) se ne spremaju.</span>
      </div>

      {/* Napomena — jednom za cijeli unos */}
      <input name="napomena" placeholder="Napomena (opc.) — vrijedi za cijeli unos" className={`${polje} mt-3`} />

      <div className="mt-3">
        <button type="submit" className={`border bg-gradient-to-b px-4 py-2 text-[13px] font-semibold hover:brightness-105 ${gumbAkcija}`}>
          {gumb}
        </button>
      </div>
    </form>
  );
}
