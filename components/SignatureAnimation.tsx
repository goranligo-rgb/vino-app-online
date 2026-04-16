"use client";

import { useEffect, useState } from "react";

const FULL_TEXT = "Design by Goran Kostanjevec";

export default function SignatureAnimation() {
  const [displayedText, setDisplayedText] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let index = 0;

    const typing = setInterval(() => {
      index += 1;
      setDisplayedText(FULL_TEXT.slice(0, index));

      if (index >= FULL_TEXT.length) {
        clearInterval(typing);
      }
    }, 60);

    // ⬇️ nestaje nakon 20 sekundi
    const timeout = setTimeout(() => {
      setVisible(false);
    }, 20000);

    return () => {
      clearInterval(typing);
      clearTimeout(timeout);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-4 z-50">
      <span
        className="signature-handwriting"
        style={{
          fontSize: "clamp(18px, 4vw, 28px)", // 🔥 responsive (mobitel manji)
          lineHeight: "1.2",
          color: "rgba(255,255,255,0.95)",
          textShadow: "0 3px 10px rgba(0,0,0,0.6)",
        }}
      >
        {displayedText}
      </span>
    </div>
  );
}