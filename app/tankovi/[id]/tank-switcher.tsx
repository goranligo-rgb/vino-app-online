"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tank = {
  id: string;
  broj: number;
};

export default function TankSwitcher({ currentId }: { currentId: string }) {
  const router = useRouter();
  const [tankovi, setTankovi] = useState<Tank[]>([]);

  useEffect(() => {
    async function ucitaj() {
      try {
        const res = await fetch("/api/tank", { cache: "no-store" });
        const data = await res.json();
        setTankovi(Array.isArray(data) ? data : []);
      } catch {
        setTankovi([]);
      }
    }

    ucitaj();
  }, []);

  return (
    <select
      value={currentId}
      onChange={(e) => router.push(`/tankovi/${e.target.value}`)}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #374151",
        background: "#111827",
        color: "#fff",
        fontWeight: 600,
        cursor: "pointer",
        minWidth: 120,
      }}
    >
      {tankovi.map((t) => (
        <option key={t.id} value={t.id}>
          Tank {t.broj}
        </option>
      ))}
    </select>
  );
}