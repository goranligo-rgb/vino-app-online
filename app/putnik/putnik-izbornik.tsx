"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dohvatiAuthUserKlijent, jeL12Klijent } from "@/lib/auth-klijent";

type Stavka = {
  href: string;
  ikona: string;
  naziv: string;
  opis: string;
  samoL12?: boolean;
};

const STAVKE: Stavka[] = [
  { href: "/putnik/ruta", ikona: "🗺️", naziv: "Ruta", opis: "Ručna ruta po danu" },
  { href: "/putnik/vozilo", ikona: "🚚", naziv: "Vozilo", opis: "Stanje u autu" },
  { href: "/putnik/zaduzenje", ikona: "📦", naziv: "Zaduženje", opis: "Vino i promo u auto" },
  { href: "/putnik/promo", ikona: "🎁", naziv: "Promo", opis: "Materijal lokalima" },
  { href: "/putnik/priprema", ikona: "🧰", naziv: "Priprema", opis: "Popis za pripremu" },
  { href: "/putnik/dnevni-rad", ikona: "🕒", naziv: "Dnevni rad", opis: "Radni dan na terenu" },
  { href: "/putnik/dnevni-izvjestaj", ikona: "📄", naziv: "Dnevni izvještaj", opis: "Svi posjeti za dan" },
  {
    href: "/putnik/izvjestaj-razdoblje",
    ikona: "📊",
    naziv: "Izvještaj po razdoblju",
    opis: "Po putniku, od–do",
    samoL12: true,
  },
  { href: "/putnik/novi", ikona: "➕", naziv: "Novi lokal", opis: "Dodaj novog kupca" },
];

export default function PutnikIzbornik() {
  const [otvoren, setOtvoren] = useState(false);
  const [jeL12, setJeL12] = useState(false);

  useEffect(() => {
    let otkazano = false;

    dohvatiAuthUserKlijent().then((user) => {
      if (!otkazano) setJeL12(jeL12Klijent(user));
    });

    return () => {
      otkazano = true;
    };
  }, []);

  // Escape zatvara; dok je otvoren, pozadina se ne skrola (bitno na tabletu).
  useEffect(() => {
    if (!otvoren) return;

    function naTipku(e: KeyboardEvent) {
      if (e.key === "Escape") setOtvoren(false);
    }
    document.addEventListener("keydown", naTipku);

    const prijasnji = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", naTipku);
      document.body.style.overflow = prijasnji;
    };
  }, [otvoren]);

  const vidljive = STAVKE.filter((s) => !s.samoL12 || jeL12);

  return (
    <>
      {/* ☰ — fiksan gore desno, ostaje vidljiv i kad se skrola */}
      <button
        type="button"
        onClick={() => setOtvoren(true)}
        aria-label="Otvori izbornik"
        aria-expanded={otvoren}
        className="fixed right-4 top-4 z-[55] flex h-14 w-14 items-center justify-center border-2 border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 text-[26px] leading-none text-orange-950 shadow-lg hover:brightness-105 active:brightness-95 md:h-[52px] md:w-[52px]"
      >
        ☰
      </button>

      {/* Poluprozirna pozadina — klik zatvara */}
      <div
        onClick={() => setOtvoren(false)}
        aria-hidden={!otvoren}
        className={`fixed inset-0 z-[60] bg-stone-900/40 transition-opacity duration-300 ${
          otvoren ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Bočni izbornik — sklizne zdesna */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Izbornik putnika"
        aria-hidden={!otvoren}
        className={`fixed inset-y-0 right-0 z-[70] flex w-[300px] max-w-[86vw] flex-col border-l-2 border-orange-300 bg-[#f6f3ee] shadow-2xl transition-transform duration-300 ease-out sm:w-[330px] ${
          otvoren ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-3.5">
          <div className="text-[17px] font-semibold tracking-tight text-stone-800">
            Izbornik
          </div>
          <button
            type="button"
            onClick={() => setOtvoren(false)}
            aria-label="Zatvori izbornik"
            className="flex h-11 w-11 items-center justify-center border border-orange-300 bg-white text-[20px] leading-none text-stone-600 hover:bg-orange-50"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {vidljive.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => setOtvoren(false)}
                tabIndex={otvoren ? 0 : -1}
                className="flex items-center gap-3 border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-3 py-3 hover:brightness-[1.03] active:brightness-95"
              >
                <span className="text-[22px] leading-none">{s.ikona}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-stone-800">
                    {s.naziv}
                  </span>
                  <span className="block truncate text-[12px] text-stone-500">
                    {s.opis}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </nav>

        <div className="border-t border-orange-200 px-4 py-3 text-[11px] text-stone-400">
          Putnik — CRM za teren
        </div>
      </aside>
    </>
  );
}
