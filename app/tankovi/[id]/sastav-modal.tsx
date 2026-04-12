"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Stavka = {
  id: string;
  nazivSorte: string;
  postotak: number;
};

type Sorta = {
  id: string;
  naziv: string;
  aktivna?: boolean;
};

export default function SastavModal({
  tankId,
  stavke,
  buttonStyle,
}: {
  tankId: string;
  stavke: Stavka[];
  buttonStyle?: React.CSSProperties;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nazivSorte, setNazivSorte] = useState("");
  const [postotak, setPostotak] = useState("");
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");
  const [sorte, setSorte] = useState<Sorta[]>([]);

  const ukupno = useMemo(() => {
    return Number(
      stavke.reduce((sum, s) => sum + Number(s.postotak || 0), 0).toFixed(2)
    );
  }, [stavke]);

  const ispravno100 = Math.abs(ukupno - 100) < 0.01;

  useEffect(() => {
    if (!open) return;

    async function ucitajSorte() {
      try {
        const res = await fetch("/api/sorte", { cache: "no-store" });
        const data = await res.json();
        setSorte(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setSorte([]);
      }
    }

    ucitajSorte();
  }, [open]);

  async function dodaj() {
    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch("/api/tank-sastav", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tankId,
          nazivSorte,
          postotak: Number(postotak),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data.error ?? "Greška kod dodavanja sastava.");
        return;
      }

      setNazivSorte("");
      setPostotak("");
      router.refresh();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod dodavanja sastava.");
    } finally {
      setLoading(false);
    }
  }

  async function obrisi(id: string) {
    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch(`/api/tank-sastav/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data.error ?? "Greška kod brisanja.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod brisanja.");
    } finally {
      setLoading(false);
    }
  }

  async function obrisiSve() {
    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch("/api/tank-sastav/obrisi-sve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tankId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data.error ?? "Greška kod brisanja svih stavki.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod brisanja svih stavki.");
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
          ...(buttonStyle || {}),
          padding: "10px 14px",
          borderRadius: 0,
          border: "1px solid #d1d5db",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {stavke.length ? "Uredi sastav" : "Kreiraj sastav"}
      </button>

      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 760,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 20,
              padding: 22,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              display: "grid",
              gap: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 24, color: "#111827" }}>
                  Sastav vina
                </h2>
                <div style={{ marginTop: 6, fontSize: 14, color: "#6b7280" }}>
                  Ručni unos i uređivanje sastava tanka
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#111827",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Zatvori
              </button>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: 12,
                borderRadius: 12,
                background: ispravno100 ? "#ecfdf5" : "#fef2f2",
                border: ispravno100
                  ? "1px solid #a7f3d0"
                  : "1px solid #fecaca",
              }}
            >
              <div style={{ fontWeight: 700, color: "#111827" }}>
                Ukupno upisano: {ukupno}%
              </div>

              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: ispravno100 ? "#166534" : "#991b1b",
                }}
              >
                {ispravno100
                  ? "Sastav je ispravno zbrojen"
                  : "Upozorenje: sastav nije 100%"}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 160px auto",
                gap: 10,
              }}
            >
              <select
                value={nazivSorte}
                onChange={(e) => setNazivSorte(e.target.value)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  outline: "none",
                  background: "#fff",
                }}
              >
                <option value="">Odaberi sortu</option>
                {sorte.map((sorta) => (
                  <option key={sorta.id} value={sorta.naziv}>
                    {sorta.naziv}
                  </option>
                ))}
              </select>

              <input
                value={postotak}
                onChange={(e) => setPostotak(e.target.value)}
                placeholder="Postotak"
                type="number"
                step="0.01"
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  outline: "none",
                }}
              />

              <button
                type="button"
                onClick={dodaj}
                disabled={loading}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Dodaj
              </button>
            </div>

            {stavke.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                {stavke.map((stavka) => (
                  <div
                    key={stavka.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                    }}
                  >
                    <div>
                      <strong>{stavka.nazivSorte}</strong> —{" "}
                      {Number(stavka.postotak).toLocaleString("hr-HR")}%
                    </div>

                    <button
                      type="button"
                      onClick={() => obrisi(stavka.id)}
                      disabled={loading}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid #fecaca",
                        background: "#fff1f2",
                        color: "#991b1b",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Obriši
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#6b7280" }}>Nema upisanih stavki.</div>
            )}

            {stavke.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={obrisiSve}
                  disabled={loading}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#991b1b",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Obriši sve sastave
                </button>
              </div>
            ) : null}

            {poruka ? (
              <div
                style={{
                  color: "#991b1b",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {poruka}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}