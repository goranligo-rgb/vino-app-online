"use client";

import { useState } from "react";
import type React from "react";
import { Card } from "./kartica";

/**
 * Kartica Berba s kvacicom koja skuplja njezin sadrzaj.
 *
 * ZASTO POSTOJI: berba naslijedjena kroz lanac blenda zna biti 15-25 zapisa
 * (bacva u koju tri tjedna idu zadnji dijelovi mosta). Kartica ostaje GORE,
 * medju onima koje se gledaju svaki put — ne seli se medju sklopljene dolje —
 * ali se smije skupiti kad smeta pogledu na ono ispod nje.
 *
 * ZASTO KLIJENTSKA: stranica tanka je posluziteljska. Sam prekidac trazi
 * stanje, pa ovaj omotac drzi `useState`, a sadrzaj dolazi gotov, kao
 * `children` — posluzitelj ga izrenderira i preda, tako da nista od citanja
 * baze ne prelazi na klijenta.
 *
 * NE PAMTI SE. Nema `localStorage` ni parametra u URL-u: svaki posjet pocinje
 * ukljuceno. Namjerno — kartica je gore jer se gleda svaki put, pa zatecena
 * vrijednost mora biti "vidi se", a ne ono sto je netko jednom iskljucio i
 * zaboravio.
 */
export default function BerbaPrekidac({
  broj,
  pod,
  children,
}: {
  broj: number;
  pod?: string | null;
  children: React.ReactNode;
}) {
  const [prikazi, setPrikazi] = useState(true);

  return (
    <Card
      title="Berba"
      broj={broj}
      pod={pod}
      kontrola={
        <label style={kvacicaStyle}>
          <input
            type="checkbox"
            checked={prikazi}
            onChange={(e) => setPrikazi(e.target.checked)}
            style={{ margin: 0, cursor: "pointer" }}
          />
          Prikaži berbu
        </label>
      }
    >
      {prikazi ? children : null}
    </Card>
  );
}

const kvacicaStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  cursor: "pointer",
  userSelect: "none",
  // Da kvacica ne sjedne na istu liniju baseline kao naslov i ne "pluta".
  alignSelf: "center",
};
