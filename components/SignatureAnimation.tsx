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
    <div className="pointer-events-none fixed bottom-4 right-4 z-50">
      <span className="signature-handwriting">{displayedText}</span>
    </div>
  );
}