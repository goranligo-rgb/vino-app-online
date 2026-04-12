"use client";

import { useEffect, useState } from "react";
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

export default function SastavEditor({
  tankId,
  stavke,
}: {
  tankId: string;
  stavke: Stavka[];
}) {
  const router = useRouter();
  const [nazivSorte, setNazivSorte] = useState("");
  const [postotak, setPostotak] = useState("");
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");
  const [sorte, setSorte] = useState<Sorta[]>([]);

  useEffect(() => {
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
  }, []);

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
        setPoruka(data.error ?? "Greška kod dodavanja.");
        return;
      }

      setNazivSorte("");
      setPostotak("");
      router.refresh();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod dodavanja.");
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
        setPoruka(data.error ?? "Greška kod brisanja svega.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod brisanja svega.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid #e5e7eb",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ fontWeight: 800, color: "#111827" }}>
        Ručni unos sastava
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 180px auto",
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

      {stavke.length > 0 && (
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
      )}

      {stavke.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {stavke.map((stavka) => (
            <div
              key={stavka.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <div>
                <strong>{stavka.nazivSorte}</strong> — {stavka.postotak}%
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
      )}

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
  );
}