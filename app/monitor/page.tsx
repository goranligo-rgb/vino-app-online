"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Tank = {
  id: string;
  broj: number;
  kapacitet: number;
  tip: string | null;
  kolicinaVinaUTanku: number | null;
  sorta: string | null;
};

type TankSaZadacima = Tank & {
  brojZadataka: number;
};

export default function MonitorPage() {
  const [tankovi, setTankovi] = useState<TankSaZadacima[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/tank/monitor", {
          cache: "no-store",
        });
        const data = await res.json();
        setTankovi(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Greška kod učitavanja monitora:", error);
        setTankovi([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  function getStatus(tank: TankSaZadacima) {
    const kolicina = tank.kolicinaVinaUTanku || 0;

    if (kolicina === 0) {
      return {
        label: "PRAZAN",
        bg: "#f5f5f5",
        border: "#cfcfcf",
      };
    }

    if (tank.brojZadataka > 0) {
      return {
        label: "ZADATAK",
        bg: "#fff4e6",
        border: "#f0a54a",
      };
    }

    return {
      label: "OK",
      bg: "#eef7f0",
      border: "#8db79a",
    };
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#e9ecef",
          padding: 24,
          fontFamily: "Calibri, sans-serif",
          color: "#222",
        }}
      >
        Učitavanje monitora...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#e9ecef",
        padding: 24,
        fontFamily: "Calibri, sans-serif",
        color: "#222",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          gap: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.5px",
              marginBottom: 12,
            }}
          >
            MONITOR TANKOVA
          </div>

          <Link
            href="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #cfcfcf",
              background: "#f8f9fa",
              padding: "8px 12px",
              fontSize: 12,
              color: "#222",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            NATRAG
          </Link>
        </div>

        <div
          style={{
            border: "1px solid #cfcfcf",
            background: "#f8f9fa",
            padding: "10px 12px",
            minWidth: 220,
            fontSize: 12,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 8,
              fontSize: 13,
            }}
          >
            OBJAŠNJENJE
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                background: "#eef7f0",
                border: "1px solid #8db79a",
              }}
            />
            <span>Zeleni — OK</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                background: "#fff4e6",
                border: "1px solid #f0a54a",
              }}
            />
            <span>Narančasti — zadatak</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                background: "#f5f5f5",
                border: "1px solid #cfcfcf",
              }}
            />
            <span>Sivi — prazan</span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {tankovi.map((tank) => {
          const status = getStatus(tank);

          return (
            <Link
              key={tank.id}
              href={`/tankovi/${tank.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  background: status.bg,
                  border: `1px solid ${status.border}`,
                  padding: 12,
                  cursor: "pointer",
                  minHeight: 128,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    TANK {tank.broj}
                  </div>

                  <div style={{ fontSize: 12, marginBottom: 3 }}>
                    Kapacitet: {tank.kapacitet} L
                  </div>

                  <div style={{ fontSize: 12, marginBottom: 3 }}>
                    Vino: {tank.kolicinaVinaUTanku || 0} L
                  </div>

                  <div style={{ fontSize: 12, marginBottom: 3 }}>
                    Sorta: {tank.sorta || "-"}
                  </div>

                  <div style={{ fontSize: 12 }}>
                    Aktivni zadaci: {tank.brojZadataka}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#555",
                    letterSpacing: "0.4px",
                  }}
                >
                  {status.label}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}