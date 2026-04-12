"use client";

import { useEffect, useMemo, useState } from "react";

type Tank = {
  id: string;
  broj: number;
  kolicinaVinaUTanku?: number | null;
  kolicina?: number | null;
};

type Preparat = {
  id: string;
  naziv: string;
  dozaOd?: number | null;
  dozaDo?: number | null;
  unitId?: string | null;
  unit?: {
    id: string;
    naziv?: string | null;
  } | null;
};

function Polje({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label
        htmlFor={htmlFor}
        style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function pretvoriIzBazneJedinice(vrijednost: number, izlaznaJedinica: string) {
  switch (izlaznaJedinica) {
    case "g":
      return vrijednost;
    case "dkg":
      return vrijednost / 10;
    case "kg":
      return vrijednost / 1000;
    case "ml":
      return vrijednost;
    case "dcl":
      return vrijednost / 100;
    case "L":
      return vrijednost / 1000;
    default:
      return vrijednost;
  }
}

export default function DodavanjaPage() {
  const [tankovi, setTankovi] = useState<Tank[]>([]);
  const [preparati, setPreparati] = useState<Preparat[]>([]);
  const [error, setError] = useState("");
  const [poruka, setPoruka] = useState("");

  const [form, setForm] = useState({
    tankId: "",
    preparatId: "",
    doza: "",
    jedinica: "",
    volumenUTanku: "",
    izracunataKolicina: "",
    izlaznaJedinica: "g",
    napomena: "",
  });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
    background: "#fff",
    boxSizing: "border-box",
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  useEffect(() => {
    async function load() {
      try {
        setError("");

        const tankRes = await fetch("/api/tank", { cache: "no-store" });
        const tankData = await tankRes.json();
        setTankovi(Array.isArray(tankData) ? tankData : []);

        const prepRes = await fetch("/api/preparat", { cache: "no-store" });
        const prepData = await prepRes.json();
        setPreparati(Array.isArray(prepData) ? prepData : []);
      } catch (e) {
        console.error(e);
        setError("Greška kod učitavanja podataka.");
      }
    }

    load();
  }, []);

  const odabraniTank = useMemo(
    () => tankovi.find((t) => t.id === form.tankId),
    [tankovi, form.tankId]
  );

  const odabraniPreparat = useMemo(
    () => preparati.find((p) => p.id === form.preparatId),
    [preparati, form.preparatId]
  );

  useEffect(() => {
    if (!odabraniTank) return;

    const volumen = odabraniTank.kolicinaVinaUTanku ?? odabraniTank.kolicina ?? 0;

    setForm((prev) => ({
      ...prev,
      volumenUTanku: volumen ? String(volumen) : "",
    }));
  }, [odabraniTank]);

  useEffect(() => {
    if (!odabraniPreparat) return;

    const preporucena = odabraniPreparat.dozaOd ?? odabraniPreparat.dozaDo;

    const jedinicaNaziv = odabraniPreparat.unit?.naziv || "";

    setForm((prev) => ({
      ...prev,
      doza: prev.doza || (preporucena != null ? String(preporucena) : ""),
      jedinica: prev.jedinica || jedinicaNaziv,
      izlaznaJedinica: prev.izlaznaJedinica || "g",
    }));
  }, [odabraniPreparat]);

  useEffect(() => {
    const doza = Number(form.doza);
    const volumen = Number(form.volumenUTanku);
    const jedinica = (form.jedinica || "").trim();

    if (!doza || !volumen || !jedinica) {
      setForm((prev) => ({
        ...prev,
        izracunataKolicina: "",
      }));
      return;
    }

    let baznaVrijednost = 0;
    let preporucenaIzlaznaJedinica = form.izlaznaJedinica;

    switch (jedinica) {
      case "g/hL":
        baznaVrijednost = (doza * volumen) / 100;
        if (!["g", "dkg", "kg"].includes(form.izlaznaJedinica)) {
          preporucenaIzlaznaJedinica = "g";
        }
        break;

      case "kg/hL":
        baznaVrijednost = (doza * volumen * 1000) / 100;
        if (!["g", "dkg", "kg"].includes(form.izlaznaJedinica)) {
          preporucenaIzlaznaJedinica = "kg";
        }
        break;

      case "dkg/hL":
        baznaVrijednost = (doza * volumen * 10) / 100;
        if (!["g", "dkg", "kg"].includes(form.izlaznaJedinica)) {
          preporucenaIzlaznaJedinica = "dkg";
        }
        break;

      case "g/L":
        baznaVrijednost = doza * volumen;
        if (!["g", "dkg", "kg"].includes(form.izlaznaJedinica)) {
          preporucenaIzlaznaJedinica = "g";
        }
        break;

      case "mL/L":
        baznaVrijednost = doza * volumen;
        if (!["ml", "dcl", "L"].includes(form.izlaznaJedinica)) {
          preporucenaIzlaznaJedinica = "ml";
        }
        break;

      case "mL/hL":
        baznaVrijednost = (doza * volumen) / 100;
        if (!["ml", "dcl", "L"].includes(form.izlaznaJedinica)) {
          preporucenaIzlaznaJedinica = "ml";
        }
        break;

      case "L/hL":
        baznaVrijednost = (doza * volumen * 1000) / 100;
        if (!["ml", "dcl", "L"].includes(form.izlaznaJedinica)) {
          preporucenaIzlaznaJedinica = "L";
        }
        break;

      case "dcl/hL":
        baznaVrijednost = (doza * volumen * 100) / 100;
        if (!["ml", "dcl", "L"].includes(form.izlaznaJedinica)) {
          preporucenaIzlaznaJedinica = "dcl";
        }
        break;

      default:
        setForm((prev) => ({
          ...prev,
          izracunataKolicina: "",
        }));
        return;
    }

    const izlaz = pretvoriIzBazneJedinice(baznaVrijednost, preporucenaIzlaznaJedinica);

    setForm((prev) => ({
      ...prev,
      izlaznaJedinica: preporucenaIzlaznaJedinica,
      izracunataKolicina: Number.isFinite(izlaz)
        ? String(Number(izlaz.toFixed(2)))
        : "",
    }));
  }, [form.doza, form.volumenUTanku, form.jedinica, form.izlaznaJedinica]);

  async function spremiDodavanje(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPoruka("");

    try {
      const res = await fetch("/api/zadatak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tankId: form.tankId,
          preparatId: form.preparatId,
          doza: form.doza ? Number(form.doza) : null,
          jedinica: form.jedinica,
          volumenUTanku: form.volumenUTanku ? Number(form.volumenUTanku) : null,
          izracunataKolicina: form.izracunataKolicina
            ? Number(form.izracunataKolicina)
            : null,
          izlaznaJedinica: form.izlaznaJedinica,
          napomena: form.napomena,
          naslov: "Dodavanje preparata",
        }),
      });

      let data: any = null;
      const text = await res.text();

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        setError(data?.error || "Spremanje dodavanja nije uspjelo.");
        return;
      }

      setPoruka(data?.message || "Dodavanje je uspješno spremljeno.");
    } catch (err) {
      console.error(err);
      setError("Greška kod spremanja dodavanja.");
    }
  }

  const jedinicaJeMasena = ["g/hL", "kg/hL", "dkg/hL", "g/L"].includes(form.jedinica);
  const jedinicaJeTekuca = ["mL/L", "mL/hL", "L/hL", "dcl/hL"].includes(form.jedinica);

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1100,
        margin: "0 auto",
        display: "grid",
        gap: 24,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 30 }}>Dodavanja</h1>
        <p style={{ marginTop: 8, color: "#6b7280" }}>
          Unos preparata, doze i automatski izračun količine za tank.
        </p>
      </div>

      {error ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: 12,
            borderRadius: 10,
          }}
        >
          {error}
        </div>
      ) : null}

      {poruka ? (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            padding: 12,
            borderRadius: 10,
          }}
        >
          {poruka}
        </div>
      ) : null}

      <form onSubmit={spremiDodavanje} style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 22 }}>
          Novo dodavanje
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          <Polje label="Tank" htmlFor="tankId">
            <select
              id="tankId"
              value={form.tankId}
              onChange={(e) => setForm({ ...form, tankId: e.target.value })}
              style={inputStyle}
              required
            >
              <option value="">Odaberi tank</option>
              {tankovi.map((tank) => (
                <option key={tank.id} value={tank.id}>
                  Tank {tank.broj}
                </option>
              ))}
            </select>
          </Polje>

          <Polje label="Preparat" htmlFor="preparatId">
            <select
              id="preparatId"
              value={form.preparatId}
              onChange={(e) => setForm({ ...form, preparatId: e.target.value })}
              style={inputStyle}
              required
            >
              <option value="">Odaberi preparat</option>
              {preparati.map((preparat) => (
                <option key={preparat.id} value={preparat.id}>
                  {preparat.naziv}
                </option>
              ))}
            </select>
          </Polje>

          <Polje label="Doza" htmlFor="doza">
            <input
              id="doza"
              type="number"
              step="0.01"
              value={form.doza}
              onChange={(e) => setForm({ ...form, doza: e.target.value })}
              style={inputStyle}
            />
          </Polje>

          <Polje label="Jedinica doze" htmlFor="jedinica">
            <input
              id="jedinica"
              value={form.jedinica}
              onChange={(e) => setForm({ ...form, jedinica: e.target.value })}
              style={inputStyle}
            />
          </Polje>

          <Polje label="Volumen u tanku" htmlFor="volumenUTanku">
            <input
              id="volumenUTanku"
              type="number"
              step="0.01"
              value={form.volumenUTanku}
              onChange={(e) =>
                setForm({ ...form, volumenUTanku: e.target.value })
              }
              style={inputStyle}
            />
          </Polje>

          <Polje label="Izlazna jedinica" htmlFor="izlaznaJedinica">
            <select
              id="izlaznaJedinica"
              value={form.izlaznaJedinica}
              onChange={(e) =>
                setForm({ ...form, izlaznaJedinica: e.target.value })
              }
              style={inputStyle}
            >
              {jedinicaJeMasena && (
                <>
                  <option value="g">g</option>
                  <option value="dkg">dkg</option>
                  <option value="kg">kg</option>
                </>
              )}

              {jedinicaJeTekuca && (
                <>
                  <option value="ml">ml</option>
                  <option value="dcl">dcl</option>
                  <option value="L">L</option>
                </>
              )}

              {!jedinicaJeMasena && !jedinicaJeTekuca && (
                <>
                  <option value="g">g</option>
                  <option value="dkg">dkg</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="dcl">dcl</option>
                  <option value="L">L</option>
                </>
              )}
            </select>
          </Polje>

          <Polje label="Izračunata količina" htmlFor="izracunataKolicina">
            <input
              id="izracunataKolicina"
              value={form.izracunataKolicina}
              onChange={(e) =>
                setForm({ ...form, izracunataKolicina: e.target.value })
              }
              style={{
                ...inputStyle,
                background: "#f9fafb",
                fontWeight: 600,
              }}
            />
          </Polje>

          <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
            <label
              htmlFor="napomena"
              style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}
            >
              Napomena
            </label>
            <textarea
              id="napomena"
              value={form.napomena}
              onChange={(e) => setForm({ ...form, napomena: e.target.value })}
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical",
              }}
            />
          </div>
        </div>

        {odabraniPreparat ? (
          <div
            style={{
              marginTop: 18,
              padding: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              display: "grid",
              gap: 4,
            }}
          >
            <div>
              <strong>Preparat:</strong> {odabraniPreparat.naziv}
            </div>
            <div>
              <strong>Preporučena doza:</strong> {odabraniPreparat.dozaOd ?? "-"}
              {odabraniPreparat.dozaDo != null ? ` - ${odabraniPreparat.dozaDo}` : ""}
            </div>
            <div>
              <strong>Jedinica:</strong> {odabraniPreparat.unit?.naziv || "-"}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <button
            type="submit"
            style={{
              padding: "12px 18px",
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Spremi dodavanje
          </button>
        </div>
      </form>
    </div>
  );
}