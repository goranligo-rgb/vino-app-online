"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prijaviSe, odjaviSe, type Rezultat } from "./actions";

/**
 * Veliki gumb PRIJAVA / ODJAVA — jedan klik + potvrda.
 * Vrijeme upisuje server (never klijent), pa je gumb samo okidač.
 */
export default function PrijavaGumb({
  prijavljen,
  odKad,
}: {
  prijavljen: boolean;
  odKad?: string;
}) {
  const router = useRouter();
  const [radi, start] = useTransition();
  const [poruka, setPoruka] = useState<Rezultat | null>(null);

  function klik() {
    const pitanje = prijavljen
      ? "Zabilježiti ODJAVU s trenutnim vremenom?"
      : "Zabilježiti PRIJAVU s trenutnim vremenom?";
    if (!confirm(pitanje)) return;

    start(async () => {
      const r = prijavljen ? await odjaviSe() : await prijaviSe();
      setPoruka(r);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button
        type="button"
        onClick={klik}
        disabled={radi}
        style={{
          width: "100%",
          minHeight: 96,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "#fff",
          background: radi ? "#6b7075" : prijavljen ? "#a11d1d" : "#2f6b43",
          border: `2px solid ${prijavljen ? "#7e1616" : "#255536"}`,
          cursor: radi ? "wait" : "pointer",
          padding: "18px 12px",
          touchAction: "manipulation",
        }}
      >
        {radi ? "SPREMAM…" : prijavljen ? "ODJAVA" : "PRIJAVA"}
      </button>

      <div style={{ fontSize: 13, color: "#4b5158" }}>
        {prijavljen
          ? `Prijavljeni ste od ${odKad}. Klik bilježi odlazak.`
          : "Klik bilježi dolazak s vremenom servera."}
      </div>

      {poruka && (
        <div
          style={{
            fontSize: 13,
            padding: "8px 12px",
            border: `1px solid ${poruka.ok ? "#8db79a" : "#e0776f"}`,
            background: poruka.ok ? "#eef7f0" : "#fdecec",
            color: poruka.ok ? "#2f6b43" : "#a11d1d",
          }}
        >
          {poruka.poruka}
          {poruka.upozorenje && (
            <div style={{ marginTop: 6, color: "#8a5a00", fontWeight: 600 }}>
              ⚠ {poruka.upozorenje}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
