"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ArhivirajButton({
  tankId,
  brojTanka,
  style,
}: {
  tankId: string;
  brojTanka: number;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function arhiviraj() {
    const potvrda = confirm(
      `Arhivirati sadržaj tanka ${brojTanka} i isprazniti ga?`
    );

    if (!potvrda) return;

    setLoading(true);

    try {
      const res = await fetch("/api/tank/arhiviraj", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: tankId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Greška kod arhiviranja");
        return;
      }

      alert("Tank arhiviran ✔");
      router.push("/tankovi");
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Greška");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={arhiviraj}
      disabled={loading}
      style={{
        ...(style || {}),
        cursor: "pointer",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "Arhiviram..." : "Arhiviraj i isprazni"}
    </button>
  );
}