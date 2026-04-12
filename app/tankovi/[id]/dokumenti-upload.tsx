"use client";

import { useRef, useState } from "react";

export default function DokumentiUpload({ tankId }: { tankId: string }) {
  const [open, setOpen] = useState(false);
  const [naziv, setNaziv] = useState("");
  const [vrsta, setVrsta] = useState("");
  const [datumDokumenta, setDatumDokumenta] = useState("");
  const [napomena, setNapomena] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function resetForm() {
    setNaziv("");
    setVrsta("");
    setDatumDokumenta("");
    setNapomena("");
    setFile(null);
    setPoruka("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function zatvori() {
    if (loading) return;
    setOpen(false);
    setPoruka("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPoruka("");

    if (!naziv || !vrsta || !file) {
      setPoruka("Popuni naziv, vrstu i odaberi dokument.");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("tankId", tankId);
      formData.append("naziv", naziv);
      formData.append("vrsta", vrsta);
      formData.append("napomena", napomena);
      formData.append("file", file);

      if (datumDokumenta) {
        formData.append("datumDokumenta", datumDokumenta);
      }

      const res = await fetch("/api/dokumenti", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();

      console.log("UPLOAD STATUS:", res.status);
      console.log("UPLOAD RESPONSE:", text);

      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        setPoruka(data?.error || text || "Greška kod spremanja dokumenta.");
        return;
      }

      setPoruka("Dokument je uspješno spremljen.");
      resetForm();

      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Greška u uploadu:", error);
      setPoruka(
        error instanceof Error
          ? error.message
          : "Greška kod spremanja dokumenta."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={openButtonStyle}
      >
        + Učitaj dokument
      </button>

      {open ? (
        <div style={overlayStyle} onClick={zatvori}>
          <div
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={headerStyle}>
              <div>
                <div style={titleStyle}>Učitaj dokument</div>
                <div style={subtitleStyle}>
                  Dodaj dokument za ovaj tank
                </div>
              </div>

              <button
                type="button"
                onClick={zatvori}
                style={closeButtonStyle}
                disabled={loading}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              <input type="hidden" name="tankId" value={tankId} />

              <input
                value={naziv}
                onChange={(e) => setNaziv(e.target.value)}
                placeholder="Naziv dokumenta"
                required
                style={inputStyle}
                disabled={loading}
              />

              <select
                value={vrsta}
                onChange={(e) => setVrsta(e.target.value)}
                required
                style={inputStyle}
                disabled={loading}
              >
                <option value="">Odaberi vrstu dokumenta</option>
                <option value="ANALIZA">ANALIZA</option>
                <option value="PUSTANJE_U_PROMET">PUŠTANJE_U_PROMET</option>
                <option value="ZAVOD">ZAVOD</option>
                <option value="LAB_NALAZ">LAB_NALAZ</option>
                <option value="PUNJENJE">PUNJENJE</option>
                <option value="OSTALO">OSTALO</option>
              </select>

              <input
                type="date"
                value={datumDokumenta}
                onChange={(e) => setDatumDokumenta(e.target.value)}
                style={inputStyle}
                disabled={loading}
              />

              <input
                value={napomena}
                onChange={(e) => setNapomena(e.target.value)}
                placeholder="Napomena"
                style={inputStyle}
                disabled={loading}
              />

              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                style={inputStyle}
                disabled={loading}
              />

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 4,
                }}
              >
                <button
                  type="submit"
                  style={submitButtonStyle}
                  disabled={loading}
                >
                  {loading ? "Spremanje..." : "Spremi dokument"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                  style={secondaryButtonStyle}
                  disabled={loading}
                >
                  Zatvori
                </button>
              </div>

              {poruka ? (
                <div
                  style={{
                    marginTop: 4,
                    padding: "10px 12px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    color: poruka.includes("uspješno") ? "#3f6212" : "#7f1d1d",
                    background: poruka.includes("uspješno")
                      ? "rgba(132,204,22,0.10)"
                      : "rgba(127,29,29,0.08)",
                    border: poruka.includes("uspješno")
                      ? "1px solid rgba(132,204,22,0.20)"
                      : "1px solid rgba(127,29,29,0.16)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {poruka}
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

const openButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(245,158,11,0.10)",
  color: "#7c2d12",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.36)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 18px 50px rgba(15,23,42,0.18)",
  backdropFilter: "blur(8px)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 14,
};

const titleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: "#1f2937",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  marginTop: 4,
};

const closeButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(255,255,255,0.9)",
  color: "#475569",
  cursor: "pointer",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.22)",
  fontSize: 14,
  color: "#111827",
  background: "rgba(255,255,255,0.92)",
};

const submitButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "rgba(127,29,29,0.90)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(255,255,255,0.88)",
  color: "#1f2937",
  fontWeight: 700,
  cursor: "pointer",
};