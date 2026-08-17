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

      // Vodoravni scroll cijele stranice + tko ga uzrokuje. Element koji desnim
      // rubom prelazi viewport je krivac; ispisuju se tri najgora, s oznakom po
      // kojoj se prepoznaju u kodu (tag.klasa ili tag#id).
      const sirina = window.innerWidth;
      const docW = document.documentElement.scrollWidth;
      const prelijeva = docW > sirina + 1;
      let krivci = "";
      if (prelijeva) {
        krivci =
          " · KRIVCI: " +
          (Array.from(document.querySelectorAll<HTMLElement>("body *"))
            .map((e) => ({ e, r: Math.round(e.getBoundingClientRect().right) }))
            .filter((x) => x.r > sirina + 1)
            .sort((a, b) => b.r - a.r)
            .slice(0, 3)
            .map(({ e, r }) => {
              const klasa = typeof e.className === "string" ? e.className.split(/\s+/)[0] : "";
              return `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : klasa ? "." + klasa : ""}→${r}`;
            })
            .join(", ") || "nijedan pojedinacni element");
      }

      setRedak(
        `viewport ${window.innerWidth}×${window.innerHeight} · ekran ${window.screen.width} · ` +
          `DPR ${window.devicePixelRatio} · media <640px: ${mq} · ` +
          `stupaca: ${stupci} · kartica: ${sirinaKartice}px · ` +
          `scrollWidth ${docW} vs ${sirina} → ${prelijeva ? "PRELIJEVA SE" : "OK"}${krivci}`
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
