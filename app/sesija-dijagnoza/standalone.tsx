"use client";

import { useEffect, useState } from "react";

/** PRIVREMENO. Nacin prikaza zna samo preglednik, posluzitelj ga ne vidi. */
export default function Standalone() {
  const [tekst, setTekst] = useState("…");

  useEffect(() => {
    const css = window.matchMedia("(display-mode: standalone)").matches;
    const ios = (navigator as Navigator & { standalone?: boolean }).standalone;
    setTekst(
      `${css || ios === true ? "da" : "ne"} (display-mode: ${css ? "da" : "ne"}, navigator.standalone: ${
        ios === undefined ? "nema" : ios ? "da" : "ne"
      })`
    );
  }, []);

  return <>{tekst}</>;
}
