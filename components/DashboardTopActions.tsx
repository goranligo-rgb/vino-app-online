"use client";

import { useEffect, useState } from "react";

export default function DashboardTopActions() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    onChange();
    document.addEventListener("fullscreenchange", onChange);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  async function enterFullscreen() {
    await document.documentElement.requestFullscreen();
  }

  async function exitFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  }

  return (
    <button
      type="button"
      onClick={isFullscreen ? exitFullscreen : enterFullscreen}
      style={{
        background: "#14131c",
        border: "2px solid #ff2f92",
        color: "#ffffff",
        padding: "8px 16px",
        fontSize: "13px",
        fontWeight: 600,
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        boxShadow: "0 0 12px rgba(255,47,146,0.35)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "0 0 18px rgba(255,47,146,0.6)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          "0 0 12px rgba(255,47,146,0.35)";
      }}
    >
      {isFullscreen ? "Izađi" : "Puni zaslon"}
    </button>
  );
}