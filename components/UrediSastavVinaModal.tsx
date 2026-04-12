"use client";

import { useState } from "react";

type Udio = {
  nazivSorte: string;
  postotak: number;
};

export default function UrediSastavVinaModal({
  tankId,
  initialUdjeli,
}: {
  tankId: string;
  initialUdjeli: Udio[];
}) {
  const [open, setOpen] = useState(false);
  const [udjeli, setUdjeli] = useState<Udio[]>(
    initialUdjeli.length > 0
      ? initialUdjeli
      : [{ nazivSorte: "", postotak: 0 }]
  );
  const [loading, setLoading] = useState(false);

  function update(index: number, field: keyof Udio, value: string) {
    setUdjeli((prev) =>
      prev.map((u, i) =>
        i === index
          ? {
              ...u,
              [field]: field === "postotak" ? Number(value) : value,
            }
          : u
      )
    );
  }

  function addRow() {
    setUdjeli((prev) => [...prev, { nazivSorte: "", postotak: 0 }]);
  }

  function removeRow(index: number) {
    setUdjeli((prev) => prev.filter((_, i) => i !== index));
  }

  async function spremi() {
    setLoading(true);

    try {
      const ocisceniUdjeli = udjeli.filter(
        (u) => u.nazivSorte.trim() !== "" && Number(u.postotak) > 0
      );

      const res = await fetch("/api/tank-sastav", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tankId,
          udjeli: ocisceniUdjeli,
        }),
      });

      if (!res.ok) {
        alert("Greška kod spremanja.");
        return;
      }

      setOpen(false);
      location.reload();
    } catch (e) {
      console.error(e);
      alert("Greška.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Uredi sastav
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              color: "#111",
              padding: 20,
              borderRadius: 12,
              width: "100%",
              maxWidth: 520,
              display: "grid",
              gap: 12,
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>Sastav vina</h3>

              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: "1px solid #ddd",
                  background: "#fff",
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
              }}
            >
              {udjeli.map((u, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 110px 44px",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <input
                    placeholder="Sorta"
                    value={u.nazivSorte}
                    onChange={(e) => update(i, "nazivSorte", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      fontSize: "14px",
                      color: "#111",
                      background: "#fff",
                    }}
                  />

                  <input
                    type="number"
                    placeholder="%"
                    value={u.postotak}
                    onChange={(e) => update(i, "postotak", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      fontSize: "14px",
                      color: "#111",
                      background: "#fff",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    style={{
                      border: "1px solid #ddd",
                      background: "#fff",
                      borderRadius: 8,
                      height: 40,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={addRow}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                + Dodaj sortu
              </button>

              <button
                type="button"
                onClick={spremi}
                disabled={loading}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Spremam..." : "Spremi"}
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}