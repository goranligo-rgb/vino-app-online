"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// Zelena potvrda spremanja za cijeli /putnik modul (montira se u layout.tsx).
// Cita `?spremljeno=<token>` koji server akcije dodaju nakon uspjesnog upisa.
// Stoji 5 sekundi (dovoljno da se procita na tabletu u autu), moze se zatvoriti
// ranije klikom na ✕.
//
// Vidljivost se IZVODI iz tokena (nema setState u efektu): poruka se vidi dok
// token iz URL-a nije onaj koji smo vec zatvorili. URL se cisti tek kod
// zatvaranja — da uklanjanje parametra ne ugasi poruku prije vremena.
const TRAJANJE_MS = 5000;

export default function SpremljenoToast() {
  const params = useSearchParams();
  const token = params.get("spremljeno");
  const [zatvoreniToken, setZatvoreniToken] = useState<string | null>(null);
  const vidljiv = Boolean(token) && token !== zatvoreniToken;

  const sakrij = useCallback(() => {
    setZatvoreniToken(token);
    // Makni token iz URL-a da se poruka ne vrati na refresh ili "natrag".
    const url = new URL(window.location.href);
    url.searchParams.delete("spremljeno");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [token]);

  useEffect(() => {
    if (!vidljiv) return;
    const t = setTimeout(sakrij, TRAJANJE_MS);
    return () => clearTimeout(t);
  }, [vidljiv, sakrij]);

  if (!vidljiv) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center px-3"
    >
      <div className="pointer-events-auto flex items-center gap-3 border-2 border-green-800 bg-green-600 px-5 py-4 text-[18px] font-bold text-white shadow-2xl">
        <span>Spremljeno ✓</span>
        <button
          type="button"
          onClick={sakrij}
          aria-label="Zatvori poruku"
          className="border border-green-300/60 px-2 py-0.5 text-[16px] font-bold leading-none text-white/90 hover:bg-green-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
