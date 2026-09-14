"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { Card } from "./kartica";

/**
 * KVACICA "KRONOLOGIJA" — kartica stoji, sadrzaj se pali.
 *
 * ZADANO ISKLJUCENA, i to je razlika od kvacice za berbu. Kronologija zna biti
 * 53 stavke na jednom tanku i zatrpa sve ispod sebe; tko je treba, upalit ce
 * je. Vlasnikova odluka, 14.09.2026.
 *
 * PAMTI SE, kao i kvacica "Povijest vina" i iz istog razloga: tko hoce cist
 * ekran, hoce ga i sutra. `localStorage`, ne URL — to je postavka pogleda, a ne
 * nesto sto se salje linkom.
 *
 * KLJUC SE CITA NA "1", A NE NA "ne-0", i to nije kozmetika. Kvacica "Povijest
 * vina" je zadano UPALJENA pa pamti iskljucenje (`!== "0"`); ova je zadano
 * ugasena pa mora pamtiti UKLJUCENJE. Da se cita jednako, svaki preglednik bez
 * zapisa dobio bi upaljenu kronologiju — dakle obrnuto od zadanog.
 *
 * `null` ISPRVA, pa `useEffect`: posluzitelj ne zna sto pise u `localStorage`,
 * a da se pocetno stanje pogodi, prvi render bi se razisao od klijentskog
 * (hydration). Do prvog `useEffect`-a kronologija je SKRIVENA — isto sto i
 * zadano stanje, pa nema bljeska od pedesetak redaka koji odmah nestanu.
 *
 * ZASTO KLIJENTSKA: stranica tanka je posluziteljska. Sadrzaj dolazi gotov, kao
 * `children` — posluzitelj ga izrenderira i preda, pa nista od citanja baze ne
 * prelazi na klijenta. Isti uzorak kao `berba-prekidac.tsx`.
 *
 * NE IDE UZ `sklopljena`: <summary> vec cijeli reagira na klik, pa bi kvacica u
 * njemu hvatala isti klik dvaput (vidi `kartica.tsx`).
 */

const KLJUC = "vino:prikaziKronologiju";

export default function KronologijaPrekidac({
  broj,
  pod,
  children,
}: {
  broj: number;
  pod?: string | null;
  children: React.ReactNode;
}) {
  const [prikazi, setPrikazi] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setPrikazi(window.localStorage.getItem(KLJUC) === "1");
    } catch {
      // Privatni prozor ili blokiran `localStorage` — tada se ne pamti nista,
      // a kvacica i dalje radi unutar posjeta.
      setPrikazi(false);
    }
  }, []);

  const promijeni = (v: boolean) => {
    setPrikazi(v);
    try {
      window.localStorage.setItem(KLJUC, v ? "1" : "0");
    } catch {
      // Vidi gore — pamcenje je pogodnost, ne uvjet za rad.
    }
  };

  const vidljivo = prikazi === true;

  return (
    <Card
      title="Kronologija"
      broj={broj}
      pod={pod}
      kontrola={
        <label style={kvacicaStyle}>
          <input
            type="checkbox"
            checked={vidljivo}
            onChange={(e) => promijeni(e.target.checked)}
            style={{ margin: 0, cursor: "pointer" }}
          />
          Prikaži kronologiju
        </label>
      }
    >
      {vidljivo ? (
        children
      ) : (
        // Broj stavki vec stoji u naslovu, pa skrivena kartica ne sakriva
        // podatak o tome ima li sto unutra.
        <div style={porukaStyle}>
          Skriveno. Upali kvačicu da se vidi što se s ovim vinom radilo.
        </div>
      )}
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
  // Da kvacica ne sjedne na istu baseline kao naslov i ne "pluta".
  alignSelf: "center",
};

const porukaStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  padding: "8px 10px",
};
