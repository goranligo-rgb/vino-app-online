"use client";

/**
 * Zuti podsjetnik samokontrole na kartici tanka + prekidac "izuzmi iz provjere".
 *
 * Prikazuje se samo kad ima sto reci:
 *   - nalaz (pun tank bez hladjenja / prazan tank hladi) -> zuta traka s razlogom
 *     i gumbom "izuzmi", jer se bas tada tank i zeli izuzeti;
 *   - tank vec izuzet -> tiha siva traka s gumbom "vrati u provjeru", da se vidi
 *     zasto za taj tank nema podsjetnika i da ga se moze vratiti.
 * Tank koji je uredan i nije izuzet ne dobiva nista - 40 kartica ne treba
 * 40 prekidaca koje nitko ne gleda.
 *
 * Zuto = "provjeri", namjerno razlicito od crvenog (alarm) i sivog (istekla komanda).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SAMOKONTROLA_STIL, type SamokontrolaNalaz } from "@/lib/samokontrola";
import { postaviSamokontrolu } from "./actions";

export default function SamokontrolaOznaka({
  tankId,
  tankBroj,
  nalaz,
  samokontrolaAktivna,
  smijeUpravljati,
}: {
  tankId: string;
  tankBroj: number;
  nalaz: SamokontrolaNalaz;
  samokontrolaAktivna: boolean;
  smijeUpravljati: boolean;
}) {
  const [greska, setGreska] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (samokontrolaAktivna && !nalaz) return null;

  function prebaci(aktivna: boolean) {
    if (
      !aktivna &&
      !window.confirm(
        `Tank ${tankBroj}: izuzeti iz samokontrole hlađenja?\n\n` +
          "Za ovaj tank se više neće javljati nelogičnosti (pun bez hlađenja, " +
          "prazan hladi). Alarmi i SMS ostaju netaknuti."
      )
    ) {
      return;
    }
    setGreska(null);
    start(async () => {
      const r = await postaviSamokontrolu({ tankId, aktivna });
      if (!r.ok) {
        setGreska(r.error ?? "Greška.");
        return;
      }
      router.refresh();
    });
  }

  const izuzet = !samokontrolaAktivna;
  const boje = izuzet
    ? { bg: "#f1f3f5", border: "#c8ccd0", text: "#5c6469" }
    : SAMOKONTROLA_STIL;

  const gumb: React.CSSProperties = {
    border: `1px solid ${boje.border}`,
    background: "#ffffff",
    color: boje.text,
    fontSize: 11,
    fontWeight: 700,
    padding: "6px 10px",
    minHeight: 34,
    borderRadius: 0,
    cursor: pending ? "wait" : "pointer",
    whiteSpace: "nowrap",
    touchAction: "manipulation",
    flex: "0 0 auto",
  };

  return (
    <div
      className="hlad-samokontrola"
      style={{ background: boje.bg, border: `1px solid ${boje.border}`, color: boje.text }}
    >
      <span className="hlad-samokontrola-tekst">
        {izuzet ? "Izuzet iz samokontrole" : `⚠ ${nalaz?.poruka}`}
      </span>
      {smijeUpravljati ? (
        <button type="button" style={gumb} disabled={pending} onClick={() => prebaci(izuzet)}>
          {izuzet ? "Vrati u provjeru" : "Izuzmi"}
        </button>
      ) : null}
      {greska ? (
        <span style={{ fontSize: 11, color: "#a11d1d", fontWeight: 600 }}>{greska}</span>
      ) : null}
    </div>
  );
}
