"use client";

import { useEffect, useState } from "react";

const FULL_TEXT = "Design by Goran Kostanjevec";

export default function SignatureAnimation() {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    setDisplayedText("");

    let index = 0;

    const timer = setInterval(() => {
      index += 1;
      setDisplayedText(FULL_TEXT.slice(0, index));

      if (index >= FULL_TEXT.length) {
        clearInterval(timer);
      }
    }, 65);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-8 right-6 z-50">
      <span
        className="signature-handwriting"
        style={{
          fontSize: "38px", // ⬅️ duplo veće
          lineHeight: "1.2",
          color: "rgba(255,255,255,0.95)",
          textShadow: "0 3px 12px rgba(0,0,0,0.6)",
        }}
      >
        {displayedText}
      </span>
    </div>
  );
}