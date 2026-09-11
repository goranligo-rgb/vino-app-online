"use client";

import { useEffect, useState } from "react";
import type React from "react";

/**
 * KVACICA "POVIJEST VINA" — skriva sve sto govori KAKO je vino doslo dovde.
 *
 * Stranica tanka odgovara na dva pitanja odjednom: sto je u tanku SADA i kako
 * je do toga doslo. Prvo je sest kartica (parametri, sastav, kvasci, zadaci,
 * temperatura, zaglavlje), drugo ih je isto toliko i zna biti dugacko —
 * kronologija, porijeklo, sva mjerenja, arhive, dokumenti, berba. Kad se vino
 * slije u veliki tank pa razdijeli u male, svi mali imaju ISTU povijest, pa
 * ona prestaje razlikovati tankove i samo zauzima ekran.
 *
 * ZASTO IZVAN KARTICA, uz naslov: jedna kvacica zatvara sest kartica odjednom.
 * Da stoji unutar jedne, morala bi se ponoviti sest puta.
 *
 * PAMTI SE, za razliku od kvacice za berbu. Ta namjerno pocinje ukljucena
 * svaki put: kartica je gore i gleda se svaki put, pa zatecena vrijednost mora
 * biti "vidi se". Ova se koristi obrnuto — tko hoce cist ekran, hoce ga i
 * sutra. Pamti se u `localStorage`, ne u URL-u: to je postavka pogleda, a ne
 * nesto sto se salje linkom.
 *
 * ZADANO UKLJUCENO. Nitko ne smije izgubiti ono sto danas vidi samo zato sto
 * je kvacica dodana.
 *
 * KVACICA ZA BERBU OSTAJE unutar ove — berba se zna gledati i kad je ostalo
 * skriveno, pa ima smisla da se moze zatvoriti zasebno.
 *
 * `null` ISPRVA, pa `useEffect`: posluzitelj ne zna sto pise u `localStorage`,
 * a da se pocetno stanje pogodi, prvi render bi se razisao od klijentskog
 * (hydration). Do prvog `useEffect`-a se prikazuje sve, sto je i zadano stanje.
 */

const KLJUC = "vino:prikaziPovijest";

export default function PovijestPrekidac({
  uvijek,
  children,
}: {
  /** Sto se vidi UVIJEK — stanje vina danas. Stoji ispod kvacice. */
  uvijek: React.ReactNode;
  /** Povijest — skuplja se kvacicom. */
  children: React.ReactNode;
}) {
  const [prikazi, setPrikazi] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setPrikazi(window.localStorage.getItem(KLJUC) !== "0");
    } catch {
      // Privatni prozor ili blokiran `localStorage` — tada se ne pamti nista,
      // a kvacica i dalje radi unutar posjeta.
      setPrikazi(true);
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

  const vidljivo = prikazi !== false;

  return (
    <>
      <div style={trakaStyle}>
        <label style={kvacicaStyle}>
          <input
            type="checkbox"
            checked={vidljivo}
            onChange={(e) => promijeni(e.target.checked)}
            style={{ margin: 0, cursor: "pointer" }}
          />
          Povijest vina
        </label>

        <span style={opisStyle}>
          {vidljivo
            ? "berba, kronologija, porijeklo, mjerenja, arhive i dokumenti"
            : "skriveno — vide se cuvée, sastav i trenutni parametri"}
        </span>
      </div>

      {uvijek}

      {vidljivo ? children : null}
    </>
  );
}

const trakaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "8px 10px",
  border: "1px solid #ececec",
  background: "#fafafa",
};

const kvacicaStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#2f2f2f",
  cursor: "pointer",
  userSelect: "none",
};

const opisStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
};
