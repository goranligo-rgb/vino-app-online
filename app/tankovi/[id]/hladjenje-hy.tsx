"use client";

/**
 * Diferencijal hladjenja (Hy) na kartici Hladjenje u monitoru tanka.
 *
 * Ista komanda, ista prava i isti dnevnik kao na /dashboard/hladjenje - razlika
 * je samo u tome sto je ovdje jedan tank umjesto plocica. Prava se NE oslanjaju
 * na skrivanje gumba: server akcija posaljiKomandu ponovno provjerava rolu.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KORAK_ZA, LIMITI, stegni, OPIS_TIPA } from "@/lib/tank-komanda";
import { posaljiKomandu } from "@/app/dashboard/hladjenje/actions";

export type HyKomandaStanje = { status: string; greska: string | null } | null;

function fmt(v: number | null): string {
  return v == null ? "—" : v.toFixed(1).replace(".", ",");
}

const STATUS_OPIS: Record<string, { label: string; bg: string; border: string; text: string }> = {
  NA_CEKANJU: { label: "na čekanju", bg: "#fff8e1", border: "#e6c65c", text: "#8a6d00" },
  PRIMIJENJENO: { label: "primijenjeno", bg: "#eef7f0", border: "#8db79a", text: "#2f6b43" },
  NEUSPJELO: { label: "neuspjelo", bg: "#fdecec", border: "#e0776f", text: "#a11d1d" },
};

export default function HladjenjeHy({
  tankId,
  tankBroj,
  hy,
  smijeUpravljati,
  zadnjaKomanda,
}: {
  tankId: string;
  tankBroj: number;
  hy: number | null;
  smijeUpravljati: boolean;
  zadnjaKomanda: HyKomandaStanje;
}) {
  const [vrijednost, setVrijednost] = useState<number>(hy ?? 2);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const { min, max } = LIMITI.HY;
  const korak = KORAK_ZA.HY;
  const promijenjeno = vrijednost !== (hy ?? 2);
  const stil = zadnjaKomanda ? STATUS_OPIS[zadnjaKomanda.status] ?? STATUS_OPIS.NA_CEKANJU : null;

  function spremi() {
    const novo = stegni("HY", vrijednost);
    if (
      !window.confirm(
        `Tank ${tankBroj}: ${OPIS_TIPA.HY} ${fmt(hy)} → ${fmt(novo)} K?`
      )
    ) {
      return;
    }
    setPoruka(null);
    start(async () => {
      const r = await posaljiKomandu({ tankId, tip: "HY", vrijednost: novo });
      if (!r.ok) setPoruka(r.error ?? "Greška.");
      else router.refresh();
    });
  }

  const btn: React.CSSProperties = {
    minWidth: 40,
    minHeight: 40,
    fontSize: 20,
    fontWeight: 700,
    border: "1px solid #cfcfcf",
    background: "#ffffff",
    cursor: pending ? "not-allowed" : "pointer",
    lineHeight: 1,
    touchAction: "manipulation",
  };

  return (
    <div
      style={{
        border: "1px solid #e2e2e2",
        background: "rgba(255,255,255,0.6)",
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#444",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        Diferencijal (Hy)
        {stil ? (
          <span
            title={zadnjaKomanda?.greska ?? undefined}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              background: stil.bg,
              border: `1px solid ${stil.border}`,
              color: stil.text,
              whiteSpace: "nowrap",
            }}
          >
            {stil.label}
            {zadnjaKomanda?.status === "NEUSPJELO" && zadnjaKomanda.greska
              ? ` · ${zadnjaKomanda.greska}`
              : ""}
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 11, color: "#777" }}>
        Za koliko K temperatura mora prijeći zadanu da hlađenje krene.
      </div>

      {smijeUpravljati ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={btn}
            disabled={pending || vrijednost <= min}
            onClick={() =>
              setVrijednost(Math.max(min, Math.round((vrijednost - korak) * 10) / 10))
            }
            aria-label="Smanji"
          >
            −
          </button>
          <span style={{ minWidth: 54, textAlign: "center", fontSize: 18, fontWeight: 700 }}>
            {fmt(vrijednost)} K
          </span>
          <button
            type="button"
            style={btn}
            disabled={pending || vrijednost >= max}
            onClick={() =>
              setVrijednost(Math.min(max, Math.round((vrijednost + korak) * 10) / 10))
            }
            aria-label="Povećaj"
          >
            +
          </button>
          <button
            type="button"
            onClick={spremi}
            disabled={!promijenjeno || pending}
            style={{
              minHeight: 40,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 700,
              border: "none",
              cursor: promijenjeno && !pending ? "pointer" : "not-allowed",
              background: promijenjeno && !pending ? "#1f6f8b" : "#c7d2d6",
              color: "#ffffff",
              touchAction: "manipulation",
            }}
          >
            Spremi
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(hy)} K</div>
      )}

      {poruka ? (
        <div style={{ fontSize: 12, color: "#a11d1d", fontWeight: 600 }}>{poruka}</div>
      ) : null}
      {pending ? <div style={{ fontSize: 12, color: "#777" }}>Spremam…</div> : null}
    </div>
  );
}
