"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prijaviSe, odjaviSe, type Rezultat } from "@/app/dashboard/prisutnost/actions";

/**
 * Gumb PRIJAVA / ODJAVA — jedina logika prijave na posao u aplikaciji.
 * Koristi se na dva mjesta (vrh /dashboard i /dashboard/prisutnost), pa je
 * namjerno JEDNA komponenta: potvrda, poziv server akcije i poruke ne smiju
 * postojati u dvije verzije koje se raziđu.
 *
 * Vrijeme uvijek upisuje server (akcija), klijent je samo okidač.
 */
export default function PrisutnostGumb({
  prijavljen,
  odKad,
  tamnaPodloga = false,
}: {
  prijavljen: boolean;
  odKad?: string;
  /** true na tamnom dashboardu — mijenja samo boju pomoćnog teksta. */
  tamnaPodloga?: boolean;
}) {
  const router = useRouter();
  const [radi, start] = useTransition();
  const [poruka, setPoruka] = useState<Rezultat | null>(null);

  const mutedBoja = tamnaPodloga ? "rgba(255,255,255,0.72)" : "#4b5158";

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
    <div style={{ display: "grid", gap: 8, width: "100%" }}>
      {prijavljen && odKad && (
        <div style={{ fontSize: 13, color: mutedBoja }}>Na poslu od {odKad}</div>
      )}

      <button
        type="button"
        onClick={klik}
        disabled={radi}
        style={{
          width: "100%",
          minHeight: 96,
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "#fff",
          background: radi ? "#6b7075" : prijavljen ? "#a11d1d" : "#2f6b43",
          border: `2px solid ${prijavljen ? "#7e1616" : "#255536"}`,
          cursor: radi ? "wait" : "pointer",
          padding: "18px 12px",
          touchAction: "manipulation",
          fontFamily: "inherit",
        }}
      >
        {radi ? "SPREMAM…" : prijavljen ? "ODJAVA" : "PRIJAVA NA POSAO"}
      </button>

      <div style={{ fontSize: 12.5, color: mutedBoja }}>
        {prijavljen
          ? "Klik bilježi odlazak s vremenom servera."
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
