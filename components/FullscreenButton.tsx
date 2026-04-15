"use client";

import { useEffect, useState } from "react";

export default function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);

    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      window.removeEventListener("resize", checkDevice);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // tiho ignoriramo ako browser blokira fullscreen
    }
  };

  if (!isDesktop) return null;

  return (
    <button
      onClick={toggleFullscreen}
      type="button"
      title={isFullscreen ? "Izađi iz punog zaslona" : "Puni zaslon"}
      style={{
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: 9999,
        padding: "12px 16px",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(15, 23, 42, 0.92)",
        color: "#ffffff",
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        backdropFilter: "blur(8px)",
      }}
    >
      {isFullscreen ? "Izađi iz punog zaslona" : "Puni zaslon"}
    </button>
  );
}