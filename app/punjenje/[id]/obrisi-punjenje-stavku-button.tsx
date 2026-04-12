"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ObrisiPunjenjeStavkuButton({
  stavkaId,
}: {
  stavkaId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function obrisi() {
    const potvrda = window.confirm(
      "Želiš obrisati ovu stavku? Nakon toga više se neće prikazivati ni zbrajati."
    );
    if (!potvrda) return;

    try {
      setLoading(true);

      const res = await fetch(`/api/punjenje-stavka/${stavkaId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Greška kod brisanja stavke.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Greška kod brisanja stavke.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={obrisi}
      disabled={loading}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #fecaca",
        background: "#fff1f2",
        color: "#b91c1c",
        fontWeight: 700,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "Brišem..." : "Obriši stavku"}
    </button>
  );
}