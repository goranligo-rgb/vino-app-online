"use client";

import { useEffect, useState } from "react";

export default function PotpisOverlay() {
  const [visible, setVisible] = useState(true);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFade(true), 18000);
    const t2 = setTimeout(() => setVisible(false), 20000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-3 right-3 z-50 pointer-events-none transition-opacity duration-2000 ${
        fade ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        className="text-[18px] sm:text-[22px] md:text-[26px] text-stone-700/80 italic"
        style={{
          fontFamily: '"Brush Script MT", "Segoe Script", cursive',
        }}
      >
        Design by Goran Kostanjevec
      </div>
    </div>
  );
}