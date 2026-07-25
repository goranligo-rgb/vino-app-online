"use client";

import { useState } from "react";

// Bočni tabovi kartice kupca. Sav sadržaj je server-renderan (dolazi kao
// `panel`), ovdje se samo bira aktivni tab — nema nove logike ni polja.
export type TabDef = {
  id: string;
  label: string;
  ikona?: string;
  panel: React.ReactNode;
};

export default function KupacTabovi({ tabovi }: { tabovi: TabDef[] }) {
  const [aktivni, setAktivni] = useState(tabovi[0]?.id);
  const trenutni = tabovi.find((t) => t.id === aktivni) ?? tabovi[0];

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      {/* Bočna navigacija: vertikalna na desktopu, horizontalno skrolabilna na mobu */}
      <nav className="flex gap-2 overflow-x-auto border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-2 md:flex-col md:overflow-visible">
        {tabovi.map((t) => {
          const jeAktivan = t.id === trenutni?.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAktivni(t.id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap border px-4 py-3 text-left text-[14px] font-semibold transition md:w-full ${
                jeAktivan
                  ? "border-orange-400 bg-gradient-to-b from-orange-500 to-amber-600 text-white shadow-sm"
                  : "border-orange-200 bg-white text-stone-700 hover:bg-orange-50"
              }`}
            >
              {t.ikona ? <span className="text-[16px]">{t.ikona}</span> : null}
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-4">{trenutni?.panel}</div>
    </div>
  );
}
