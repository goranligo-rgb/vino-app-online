"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function NatragNaPrethodnu() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from");

  return (
    <button
      type="button"
      onClick={() => {
        if (from) {
          router.push(from);
        } else {
          router.back();
        }
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 14px",
        borderRadius: 10,
        background: "#ffffff",
        color: "#111827",
        fontWeight: 700,
        border: "1px solid rgba(255,255,255,0.18)",
        cursor: "pointer",
      }}
    >
      ← Natrag
    </button>
  );
}