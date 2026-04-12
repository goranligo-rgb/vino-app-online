"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Tank = {
  id: string;
  broj: number;
  kapacitet: number;
  kolicinaVinaUTanku: number | null;
  tip: string | null;
  opisVentila?: string | null;
  opisVrata?: string | null;
};

export default function TankoviPage() {
  const router = useRouter();

  const [tankovi, setTankovi] = useState<Tank[]>([]);
  const [broj, setBroj] = useState("");
  const [kapacitet, setKapacitet] = useState("");
  const [tip, setTip] = useState("");
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");
  const [prikaziFormu, setPrikaziFormu] = useState(false);

  async function ucitajTankove() {
    try {
      const res = await fetch("/api/tank", { cache: "no-store" });
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      lista.sort((a: Tank, b: Tank) => a.broj - b.broj);
      setTankovi(lista);
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod učitavanja tankova.");
    }
  }

  useEffect(() => {
    ucitajTankove();
  }, []);

  function idiNaSljedecePolje(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const form = e.currentTarget.form;
    if (!form) return;

    const elements = Array.from(form.elements).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement &&
        !el.hasAttribute("disabled") &&
        el.tabIndex !== -1
    );

    const index = elements.indexOf(e.currentTarget);
    if (index >= 0 && index < elements.length - 1) {
      elements[index + 1]?.focus();
    }
  }

  async function spremiTank(e: React.FormEvent) {
    e.preventDefault();
    setPoruka("");

    if (!broj.trim() || !kapacitet.trim()) {
      setPoruka("Upiši broj i kapacitet tanka.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/tank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          broj: Number(broj),
          kapacitet: Number(kapacitet),
          kolicinaVinaUTanku: 0,
          tip: tip.trim() || null,
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
        setPoruka(data?.error || "Spremanje nije uspjelo.");
        return;
      }

      setBroj("");
      setKapacitet("");
      setTip("");
      setPoruka("Tank je uspješno spremljen.");
      setPrikaziFormu(false);

      await ucitajTankove();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod spremanja.");
    } finally {
      setLoading(false);
    }
  }

  async function spremiTankPromjene(tank: Tank) {
    try {
      const res = await fetch("/api/tank", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: tank.id,
          broj: tank.broj,
          kapacitet: tank.kapacitet,
          kolicinaVinaUTanku: tank.kolicinaVinaUTanku ?? 0,
          tip: tank.tip,
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
        setPoruka(data?.error || "Spremanje promjena nije uspjelo.");
        return;
      }

      setPoruka(`Tank ${tank.broj} je ažuriran.`);
      await ucitajTankove();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod spremanja promjena.");
    }
  }

  async function obrisiTank(id: string) {
    const potvrda = confirm("Obrisati tank?");
    if (!potvrda) return;

    try {
      const res = await fetch("/api/tank", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      let data: any = null;
      const text = await res.text();

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        setPoruka(data?.error || "Brisanje nije uspjelo.");
        return;
      }

      setPoruka("Tank je obrisan.");
      await ucitajTankove();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod brisanja.");
    }
  }

  const prazniTankovi = useMemo(() => {
    return tankovi.filter((tank) => Number(tank.kolicinaVinaUTanku ?? 0) <= 0);
  }, [tankovi]);

  const ukupnoPrazno = useMemo(() => {
    return prazniTankovi.reduce(
      (sum, tank) => sum + Number(tank.kapacitet ?? 0),
      0
    );
  }, [prazniTankovi]);

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div style={headerStyle}>
          <div>
            <h1 style={pageTitleStyle}>Tankovi</h1>
            <p style={pageSubtitleStyle}>
              Ovdje su samo fizički tankovi. Količina vina vodi se automatski kroz
              punjenje i pretoke.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            style={secondaryButtonStyle}
          >
            ← Natrag
          </button>
        </div>

        {poruka ? <div style={messageBoxStyle}>{poruka}</div> : null}

        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <button
            type="button"
            onClick={() => setPrikaziFormu((prev) => !prev)}
            style={primaryButtonStyle}
          >
            {prikaziFormu ? "Zatvori unos" : "Dodaj tank"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: "12px",
            alignItems: "start",
          }}
        >
          <div>
            {prikaziFormu ? (
              <form onSubmit={spremiTank} style={panelStyle}>
                <div style={sectionTitleStyle}>Novi tank</div>

                <div style={formGridStyle}>
                  <div>
                    <label style={labelStyle}>Broj tanka</label>
                    <input
                      type="number"
                      value={broj}
                      onChange={(e) => setBroj(e.target.value)}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="npr. 1"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Kapacitet</label>
                    <input
                      type="number"
                      step="0.01"
                      value={kapacitet}
                      onChange={(e) => setKapacitet(e.target.value)}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="npr. 5000"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Tip</label>
                    <input
                      value={tip}
                      onChange={(e) => setTip(e.target.value)}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="npr. inox"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <button type="submit" disabled={loading} style={primaryButtonStyle}>
                      {loading ? "Spremam..." : "Spremi tank"}
                    </button>
                  </div>
                </div>
              </form>
            ) : null}

            <section style={panelStyle}>
              <div style={sectionTitleStyle}>Popis tankova</div>

              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Broj</th>
                      <th style={thStyle}>Kapacitet</th>
                      <th style={thStyle}>Trenutno u tanku</th>
                      <th style={thStyle}>Tip</th>
                      <th style={thStyle}>Akcije</th>
                    </tr>
                  </thead>

                  <tbody>
                    {tankovi.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={tdEmptyStyle}>
                          Nema unesenih tankova.
                        </td>
                      </tr>
                    ) : (
                      tankovi.map((tank) => (
                        <tr key={tank.id}>
                          <td style={tdStyle}>
                            <input
                              type="number"
                              value={tank.broj ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTankovi((prev) =>
                                  prev.map((t) =>
                                    t.id === tank.id
                                      ? {
                                          ...t,
                                          broj: value === "" ? 0 : Number(value),
                                        }
                                      : t
                                  )
                                );
                              }}
                              onKeyDown={idiNaSljedecePolje}
                              style={tableInputStyle}
                            />
                          </td>

                          <td style={tdStyle}>
                            <input
                              type="number"
                              step="0.01"
                              value={tank.kapacitet ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTankovi((prev) =>
                                  prev.map((t) =>
                                    t.id === tank.id
                                      ? {
                                          ...t,
                                          kapacitet:
                                            value === "" ? 0 : Number(value),
                                        }
                                      : t
                                  )
                                );
                              }}
                              onKeyDown={idiNaSljedecePolje}
                              style={tableInputStyle}
                            />
                          </td>

                          <td style={tdReadOnlyStyle}>
                            {Number(tank.kolicinaVinaUTanku ?? 0).toLocaleString(
                              "hr-HR",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}{" "}
                            L
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={tank.tip ?? ""}
                              onChange={(e) => {
                                const noviTip = e.target.value;
                                setTankovi((prev) =>
                                  prev.map((t) =>
                                    t.id === tank.id ? { ...t, tip: noviTip } : t
                                  )
                                );
                              }}
                              onKeyDown={idiNaSljedecePolje}
                              style={tableInputStyle}
                            />
                          </td>

                          <td style={tdStyle}>
                            <div style={actionsWrapStyle}>
                              <button
                                type="button"
                                onClick={() => router.push(`/tankovi/${tank.id}`)}
                                style={openButtonStyle}
                              >
                                Otvori
                              </button>

                              <button
                                type="button"
                                onClick={() => spremiTankPromjene(tank)}
                                style={editButtonStyle}
                              >
                                Uredi
                              </button>

                              <button
                                type="button"
                                onClick={() => obrisiTank(tank.id)}
                                style={deleteButtonStyle}
                              >
                                Obriši
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside style={panelStyleSticky}>
            <div style={sectionTitleStyle}>Prazni tankovi</div>

            {prazniTankovi.length === 0 ? (
              <p style={{ margin: 0, color: "#6b6470", fontSize: "13px" }}>
                Nema praznih tankova.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {prazniTankovi.map((tank) => {
                  const opis =
                    tank.opisVentila?.trim() ||
                    tank.opisVrata?.trim() ||
                    tank.tip?.trim() ||
                    "Bez opisa";

                  return (
                    <div key={tank.id} style={sideItemStyle}>
                      <div style={sideItemTitleStyle}>Tank {tank.broj}</div>
                      <div style={sideItemMetaStyle}>{opis}</div>
                      <div style={sideItemValueStyle}>
                        {Number(tank.kapacitet ?? 0).toLocaleString("hr-HR")} L
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={sideTotalStyle}>
              Ukupno prazno: {ukupnoPrazno.toLocaleString("hr-HR")} L
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "16px",
  background: "#f4f4f5",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  color: "#2f2f2f",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 600,
  margin: 0,
  color: "#3b2b31",
};

const pageSubtitleStyle: React.CSSProperties = {
  margin: "4px 0 0 0",
  color: "#6b6470",
  fontSize: "13px",
};

const panelStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
  padding: "12px",
  marginBottom: "12px",
};

const panelStyleSticky: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
  padding: "12px",
  position: "sticky",
  top: "12px",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#3b2b31",
  marginBottom: "10px",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "5px",
  fontWeight: 600,
  color: "#3b2b31",
  fontSize: "13px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  border: "1px solid rgba(127,29,29,0.18)",
  borderRadius: 0,
  background: "#ffffff",
  color: "#2f2f2f",
  outline: "none",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  fontSize: "13px",
};

const tableInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 8px",
  border: "1px solid rgba(127,29,29,0.16)",
  borderRadius: 0,
  minWidth: "110px",
  background: "#ffffff",
  color: "#2f2f2f",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  fontSize: "13px",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "9px 14px",
  border: "1px solid rgba(127,29,29,0.22)",
  borderRadius: 0,
  cursor: "pointer",
  fontWeight: 600,
  background: "#ffffff",
  color: "#7f1d1d",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "9px 14px",
  border: "1px solid rgba(127,29,29,0.18)",
  borderRadius: 0,
  cursor: "pointer",
  fontWeight: 600,
  background: "#ffffff",
  color: "#4a2d36",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const openButtonStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid rgba(127,29,29,0.16)",
  borderRadius: 0,
  cursor: "pointer",
  fontWeight: 600,
  background: "#ffffff",
  color: "#7f1d1d",
  fontSize: "12px",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const editButtonStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid rgba(127,29,29,0.14)",
  borderRadius: 0,
  cursor: "pointer",
  fontWeight: 600,
  background: "#fafafa",
  color: "#3b2b31",
  fontSize: "12px",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const deleteButtonStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #efcfcf",
  borderRadius: 0,
  cursor: "pointer",
  fontWeight: 600,
  background: "#fbf5f5",
  color: "#8c2a2a",
  fontSize: "12px",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const messageBoxStyle: React.CSSProperties = {
  marginBottom: "12px",
  padding: "10px 12px",
  border: "1px solid rgba(127,29,29,0.16)",
  background: "#faf6f7",
  color: "#4f3740",
  fontWeight: 600,
  fontSize: "13px",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid rgba(127,29,29,0.16)",
  background: "#fafafa",
  color: "#3b2b31",
  fontWeight: 600,
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid #efefef",
  background: "#ffffff",
};

const tdReadOnlyStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid #efefef",
  background: "#fcfcfc",
  color: "#2f2f2f",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdEmptyStyle: React.CSSProperties = {
  padding: "16px",
  textAlign: "center",
  color: "#6b6470",
  background: "#ffffff",
  fontSize: "13px",
};

const actionsWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  flexWrap: "wrap",
};

const sideItemStyle: React.CSSProperties = {
  borderBottom: "1px solid #efefef",
  paddingBottom: "8px",
};

const sideItemTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "#2f2f2f",
  fontSize: "13px",
};

const sideItemMetaStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b6470",
  marginTop: "3px",
};

const sideItemValueStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#2f2f2f",
  marginTop: "3px",
  fontWeight: 600,
};

const sideTotalStyle: React.CSSProperties = {
  marginTop: "12px",
  paddingTop: "10px",
  borderTop: "1px solid rgba(127,29,29,0.16)",
  fontSize: "14px",
  fontWeight: 600,
  color: "#2f2f2f",
};