"use client";

/**
 * PRIVREMENO - dijagnostika mobilnog rasporeda (17.08.2026.).
 *
 * Na telefonu se ne moze otvoriti konzola, a treba znati sto preglednik STVARNO
 * misli o sirini: ako je layout viewport 980 px (npr. meta viewport ne radi),
 * media upit "<640px" nikad ne okine i sve izgleda kao siroki desktop stisnut u
 * zoom. Ova traka pokazuje mjerene brojke i broj stupaca koje je grid dobio.
 *
 * Traka je i sama trag: pozadina joj se ispod 640 px mijenja u zelenu (klasa
 * .hlad-dijagnostika u page.tsx). Zelena = media upiti rade, tamna = ne rade.
 *
 * OBRISATI zajedno s .hlad-dijagnostika pravilima i pozivom u page.tsx cim se
 * potvrdi da raspored radi.
 */

import { useEffect, useState } from "react";

export default function DijagnostikaSirine() {
  const [redak, setRedak] = useState("mjerim…");

  useEffect(() => {
    function izmjeri() {
      const grid = document.querySelector(".hlad-grid");
      const stupci = grid
        ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length
        : 0;
      const mq = window.matchMedia("(max-width: 639px)").matches ? "DA" : "NE";
      const kartica = document.querySelector(".hlad-kartica");
      const sirinaKartice = kartica ? Math.round(kartica.getBoundingClientRect().width) : 0;
      setRedak(
        `viewport ${window.innerWidth}×${window.innerHeight} · ekran ${window.screen.width} · ` +
          `DPR ${window.devicePixelRatio} · media <640px: ${mq} · ` +
          `stupaca: ${stupci} · kartica: ${sirinaKartice}px`
      );
    }
    izmjeri();
    window.addEventListener("resize", izmjeri);
    window.addEventListener("orientationchange", izmjeri);
    return () => {
      window.removeEventListener("resize", izmjeri);
      window.removeEventListener("orientationchange", izmjeri);
    };
  }, []);

  return <div className="hlad-dijagnostika">DIJAGNOSTIKA · {redak}</div>;
}
