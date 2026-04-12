"use client";

import NatragHome from "@/components/NatragHome";
import { useEffect, useMemo, useRef, useState } from "react";

type Tank = {
  id: string;
  broj: number;
  kapacitet?: number | null;
  tip: string | null;
  kolicinaVinaUTanku?: number | null;
  sorta?: string | null;
  nazivVina?: string | null;
};

type Mjerenje = {
  id: string;
  tankId: string;
  korisnikId: string | null;
  alkohol: number | null;
  ukupneKiseline: number | null;
  hlapiveKiseline: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  secer: number | null;
  ph: number | null;
  temperatura: number | null;
  bentotestDatum: string | null;
  bentotestStatus: string | null;
  izmjerenoAt: string;
  napomena: string | null;
  tank?: {
    id: string;
    broj: number;
    tip?: string | null;
    sorta?: string | null;
    nazivVina?: string | null;
  };
  korisnik?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type FormDataType = {
  tankId: string;
  alkohol: string;
  ukupneKiseline: string;
  hlapiveKiseline: string;
  slobodniSO2: string;
  ukupniSO2: string;
  secer: string;
  ph: string;
  temperatura: string;
  bentotestDatum: string;
  bentotestStatus: string;
  izmjerenoAt: string;
  napomena: string;
};

function toDatetimeLocal(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function praznaForma(): FormDataType {
  return {
    tankId: "",
    alkohol: "",
    ukupneKiseline: "",
    hlapiveKiseline: "",
    slobodniSO2: "",
    ukupniSO2: "",
    secer: "",
    ph: "",
    temperatura: "",
    bentotestDatum: "",
    bentotestStatus: "",
    izmjerenoAt: toDatetimeLocal(),
    napomena: "",
  };
}

function brojIliNull(v: string) {
  const x = String(v ?? "").trim().replace(",", ".");
  if (!x) return null;
  const n = Number(x);
  return Number.isNaN(n) ? null : n;
}

function fmtL(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "0";
  return Number(v).toLocaleString("hr-HR", {
    maximumFractionDigits: 0,
  });
}

function opisTanka(tank: Tank) {
  const sorta = tank.sorta?.trim() || tank.nazivVina?.trim() || null;
  const tip = tank.tip?.trim() || "tank";
  const opis = sorta ? sorta : tip;

  const kapacitet = Number(tank.kapacitet ?? 0);
  const trenutno = Number(tank.kolicinaVinaUTanku ?? 0);
  const slobodno = Math.max(kapacitet - trenutno, 0);

  return `Tank ${tank.broj} — ${opis} — kapacitet ${fmtL(
    kapacitet
  )} L — trenutno ${fmtL(trenutno)} L — slobodno ${fmtL(slobodno)} L`;
}

function opisTankaKratko(
  tank?: {
    broj: number;
    tip?: string | null;
    sorta?: string | null;
    nazivVina?: string | null;
  } | null
) {
  if (!tank) return "Tank -";

  const sorta = tank.sorta?.trim() || tank.nazivVina?.trim() || null;
  const tip = tank.tip?.trim() || null;

  if (sorta) return `Tank ${tank.broj} — ${sorta}`;
  if (tip) return `Tank ${tank.broj} — ${tip}`;
  return `Tank ${tank.broj}`;
}

function formatDatum(v?: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("hr-HR");
  } catch {
    return v;
  }
}

function formatDatumSamoDan(v?: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleDateString("hr-HR");
  } catch {
    return v;
  }
}

function bojaStatusa(
  value: number | null,
  min?: number,
  max?: number
): { background: string; border: string; color: string } {
  if (value == null) {
    return {
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      color: "#64748b",
    };
  }

  if ((min != null && value < min) || (max != null && value > max)) {
    return {
      background: "#fff1f2",
      border: "1px solid #fecdd3",
      color: "#9f1239",
    };
  }

  if (
    (min != null && value < min + 2) ||
    (max != null && value > max - 2)
  ) {
    return {
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      color: "#1d4ed8",
    };
  }

  return {
    background: "#f0f9ff",
    border: "1px solid #bae6fd",
    color: "#0f766e",
  };
}

function Polje({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
      {hint ? <div style={hintStyle}>{hint}</div> : null}
    </div>
  );
}

function MiniValue({
  label,
  value,
  unit,
  min,
  max,
}: {
  label: string;
  value: number | null;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const tone = bojaStatusa(value, min, max);

  return (
    <div
      style={{
        background: tone.background,
        border: tone.border,
        padding: "9px 10px",
        display: "grid",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#64748b",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: tone.color, fontWeight: 800 }}>
        {value ?? "-"}
        {unit ? <span style={{ marginLeft: 3, fontSize: 10 }}>{unit}</span> : null}
      </div>
    </div>
  );
}

function DetaljVrijednost({
  naslov,
  vrijednost,
  jedinica,
  min,
  max,
}: {
  naslov: string;
  vrijednost: number | null;
  jedinica?: string;
  min?: number;
  max?: number;
}) {
  const tone = bojaStatusa(vrijednost, min, max);

  return (
    <div
      style={{
        background: tone.background,
        border: tone.border,
        padding: 14,
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {naslov}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: tone.color }}>
        {vrijednost ?? "-"}
        {jedinica ? (
          <span style={{ marginLeft: 5, fontSize: 12, fontWeight: 700 }}>
            {jedinica}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function UpozorenjeParametri({ m }: { m: Mjerenje }) {
  const upozorenja: string[] = [];

  if (m.temperatura != null && m.temperatura > 22) {
    upozorenja.push("Temperatura je povišena.");
  }
  if (m.slobodniSO2 != null && m.slobodniSO2 < 10) {
    upozorenja.push("Slobodni SO2 je nizak.");
  }
  if (m.ph != null && m.ph > 3.6) {
    upozorenja.push("pH je povišen.");
  }
  if (m.hlapiveKiseline != null && m.hlapiveKiseline > 0.8) {
    upozorenja.push("Hlapive kiseline su povišene.");
  }
  if (m.ukupniSO2 != null && m.ukupniSO2 > 220) {
    upozorenja.push("Ukupni SO2 je povišen.");
  }
  if (m.bentotestStatus === "NESTABILNO") {
    upozorenja.push("Bentotest je nestabilan.");
  }

  if (upozorenja.length === 0) return null;

  return (
    <div
      style={{
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        padding: 12,
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          textTransform: "uppercase",
          color: "#1d4ed8",
          letterSpacing: 0.3,
        }}
      >
        Upozorenja
      </div>

      {upozorenja.map((u, i) => (
        <div key={i} style={{ fontSize: 13, color: "#1e3a8a", fontWeight: 700 }}>
          • {u}
        </div>
      ))}
    </div>
  );
}

function imaKlasicneParametre(m: Mjerenje) {
  return (
    m.alkohol != null ||
    m.ukupneKiseline != null ||
    m.hlapiveKiseline != null ||
    m.slobodniSO2 != null ||
    m.ukupniSO2 != null ||
    m.secer != null ||
    m.ph != null ||
    m.temperatura != null
  );
}

function jeSamoBentotest(m: Mjerenje) {
  return !imaKlasicneParametre(m) && !!(m.bentotestDatum || m.bentotestStatus);
}

export default function MjerenjePage() {
  const [tankovi, setTankovi] = useState<Tank[]>([]);
  const [mjerenja, setMjerenja] = useState<Mjerenje[]>([]);
  const [poruka, setPoruka] = useState("");
  const [formData, setFormData] = useState<FormDataType>(praznaForma());
  const [otvorenoMjerenjeId, setOtvorenoMjerenjeId] = useState<string | null>(null);

  const formaRef = useRef<HTMLFormElement | null>(null);

  async function ucitajTankove() {
    try {
      const res = await fetch("/api/tank", { cache: "no-store" });
      const data = await res.json();
      setTankovi(Array.isArray(data) ? data : []);
    } catch {
      setTankovi([]);
    }
  }

  async function ucitajMjerenja() {
    try {
      const res = await fetch("/api/mjerenje", { cache: "no-store" });

      let data: any = null;
      const text = await res.text();

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      const lista = Array.isArray(data)
        ? data
        : Array.isArray(data?.mjerenja)
        ? data.mjerenja
        : [];

      setMjerenja(lista);
    } catch {
      setMjerenja([]);
    }
  }

  useEffect(() => {
    ucitajTankove();
    ucitajMjerenja();
  }, []);

  const mjerenjaSortirana = useMemo(() => {
    return [...mjerenja].sort((a, b) => {
      const da = new Date(a.izmjerenoAt).getTime();
      const db = new Date(b.izmjerenoAt).getTime();
      return db - da;
    });
  }, [mjerenja]);

  function promjenaForme(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function idiNaSljedecePolje(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    if (e.key !== "Enter") return;

    const target = e.currentTarget;

    if (target.tagName.toLowerCase() === "textarea") {
      return;
    }

    e.preventDefault();

    const form = formaRef.current;
    if (!form) return;

    const polja = Array.from(
      form.querySelectorAll<HTMLElement>(
        'select, input, textarea, button[type="submit"]'
      )
    ).filter((el) => {
      const disabled =
        (
          el as
            | HTMLInputElement
            | HTMLSelectElement
            | HTMLTextAreaElement
            | HTMLButtonElement
        ).disabled;
      const style = window.getComputedStyle(el);
      return !disabled && style.display !== "none" && style.visibility !== "hidden";
    });

    const index = polja.indexOf(target);
    if (index === -1) return;

    const next = polja[index + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
        next.select?.();
      }
    }
  }

  async function spremiMjerenje(e: React.FormEvent) {
    e.preventDefault();
    setPoruka("");

    try {
      const payload = {
        tankId: formData.tankId,
        alkohol: brojIliNull(formData.alkohol),
        ukupneKiseline: brojIliNull(formData.ukupneKiseline),
        hlapiveKiseline: brojIliNull(formData.hlapiveKiseline),
        slobodniSO2: brojIliNull(formData.slobodniSO2),
        ukupniSO2: brojIliNull(formData.ukupniSO2),
        secer: brojIliNull(formData.secer),
        ph: brojIliNull(formData.ph),
        temperatura: brojIliNull(formData.temperatura),
        bentotestDatum: formData.bentotestDatum || null,
        bentotestStatus: formData.bentotestStatus || null,
        izmjerenoAt: formData.izmjerenoAt || null,
        napomena: formData.napomena.trim() || null,
      };

      const res = await fetch("/api/mjerenje", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      const text = await res.text();

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        setPoruka(data?.error || "Spremanje mjerenja nije uspjelo.");
        return;
      }

      setPoruka(data?.message || "Mjerenje spremljeno.");

      const odabraniTankId = formData.tankId;

      setFormData({
        ...praznaForma(),
        tankId: odabraniTankId,
      });

      await ucitajMjerenja();

      setTimeout(() => {
        const prvoPolje = formaRef.current?.querySelector<HTMLElement>("#temperatura");
        prvoPolje?.focus();
      }, 50);
    } catch {
      setPoruka("Spremanje mjerenja nije uspjelo.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f4f8fb 0%, #eef4f8 100%)",
        padding: 20,
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1700,
          margin: "0 auto",
          display: "grid",
          gap: 16,
        }}
      >
        <NatragHome />

        {poruka ? (
          <div
            style={{
              padding: "14px 16px",
              background: "#ffffff",
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              fontWeight: 800,
              boxShadow: "0 8px 20px rgba(59,130,246,0.06)",
            }}
          >
            {poruka}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 0.7fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(180deg, #ffffff 0%, #f3f8fc 48%, #edf5fb 100%)",
              padding: 24,
              border: "1px solid #cfe3f1",
              boxShadow: "0 12px 26px rgba(59,130,246,0.06)",
            }}
          >
            <h2
              style={{
                margin: 0,
                marginBottom: 20,
                fontSize: 28,
                fontWeight: 800,
                color: "#1e3a5f",
              }}
            >
              Novo mjerenje
            </h2>

            <form ref={formaRef} onSubmit={spremiMjerenje} style={{ display: "grid", gap: 18 }}>
              <div style={sectionStyleWarm}>
                <div style={sectionTitleWarm}>Osnovno</div>

                <div style={grid2}>
                  <Polje label="Tank" htmlFor="tankId">
                    <select
                      id="tankId"
                      name="tankId"
                      value={formData.tankId}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      style={input}
                      required
                    >
                      <option value="">Odaberi tank</option>
                      {tankovi.map((t) => (
                        <option key={t.id} value={t.id}>
                          {opisTanka(t)}
                        </option>
                      ))}
                    </select>
                  </Polje>

                  <Polje label="Vrijeme mjerenja" htmlFor="izmjerenoAt">
                    <input
                      id="izmjerenoAt"
                      type="datetime-local"
                      name="izmjerenoAt"
                      value={formData.izmjerenoAt}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      style={input}
                    />
                  </Polje>
                </div>
              </div>

              <div style={sectionStyleStrong}>
                <div style={sectionTitleStrong}>Glavni parametri</div>

                <div style={grid4}>
                  <Polje label="Temperatura (°C)" htmlFor="temperatura">
                    <input
                      id="temperatura"
                      name="temperatura"
                      value={formData.temperatura}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="Temp °C"
                      style={inputStrongWarm}
                    />
                  </Polje>

                  <Polje label="Šećer" htmlFor="secer">
                    <input
                      id="secer"
                      name="secer"
                      value={formData.secer}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="Šećer"
                      style={inputStrongWarm}
                    />
                  </Polje>

                  <Polje label="Ukupne kiseline" htmlFor="ukupneKiseline">
                    <input
                      id="ukupneKiseline"
                      name="ukupneKiseline"
                      value={formData.ukupneKiseline}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="Kiseline"
                      style={inputStrongWarm}
                    />
                  </Polje>

                  <Polje label="Slobodni SO2" htmlFor="slobodniSO2">
                    <input
                      id="slobodniSO2"
                      name="slobodniSO2"
                      value={formData.slobodniSO2}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="Slob. SO2"
                      style={inputStrongWarm}
                    />
                  </Polje>
                </div>
              </div>

              <div style={sectionStyleWarm}>
                <div style={sectionTitleWarm}>Dodatni parametri</div>

                <div style={grid4}>
                  <Polje label="Alkohol" htmlFor="alkohol">
                    <input
                      id="alkohol"
                      name="alkohol"
                      value={formData.alkohol}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="Alkohol"
                      style={input}
                    />
                  </Polje>

                  <Polje label="pH" htmlFor="ph">
                    <input
                      id="ph"
                      name="ph"
                      value={formData.ph}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="pH"
                      style={input}
                    />
                  </Polje>

                  <Polje label="Hlapive kiseline" htmlFor="hlapiveKiseline">
                    <input
                      id="hlapiveKiseline"
                      name="hlapiveKiseline"
                      value={formData.hlapiveKiseline}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="Hlapive"
                      style={input}
                    />
                  </Polje>

                  <Polje label="Ukupni SO2" htmlFor="ukupniSO2">
                    <input
                      id="ukupniSO2"
                      name="ukupniSO2"
                      value={formData.ukupniSO2}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      placeholder="Ukupni SO2"
                      style={input}
                    />
                  </Polje>
                </div>
              </div>

              <div style={sectionStyleWarm}>
                <div style={sectionTitleWarm}>Napomena</div>

                <Polje
                  label="Napomena"
                  htmlFor="napomena"
                  hint="U napomeni Enter radi novi red."
                >
                  <textarea
                    id="napomena"
                    name="napomena"
                    value={formData.napomena}
                    onChange={promjenaForme}
                    onKeyDown={idiNaSljedecePolje}
                    placeholder="Napomena"
                    style={textarea}
                  />
                </Polje>
              </div>

              <div style={sectionStyleBentotest}>
                <div style={sectionTitleBentotest}>Bentotest</div>

                <div style={grid2}>
                  <Polje label="Datum bentotesta" htmlFor="bentotestDatum">
                    <input
                      id="bentotestDatum"
                      type="date"
                      name="bentotestDatum"
                      value={formData.bentotestDatum}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      style={inputBentotest}
                    />
                  </Polje>

                  <Polje label="Status bentotesta" htmlFor="bentotestStatus">
                    <select
                      id="bentotestStatus"
                      name="bentotestStatus"
                      value={formData.bentotestStatus}
                      onChange={promjenaForme}
                      onKeyDown={idiNaSljedecePolje}
                      style={inputBentotest}
                    >
                      <option value="">Odaberi status</option>
                      <option value="STABILNO">Stabilno</option>
                      <option value="NESTABILNO">Nestabilno</option>
                    </select>
                  </Polje>
                </div>
              </div>

              <button type="submit" style={btnWarm}>
                Spremi mjerenje
              </button>
            </form>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: 18,
              border: "1px solid #dbeafe",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(59,130,246,0.05)",
            }}
          >
            <h3
              style={{
                marginTop: 0,
                marginBottom: 14,
                color: "#1e3a5f",
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              Zadnja mjerenja
            </h3>

            {mjerenjaSortirana.length === 0 ? (
              <div
                style={{
                  border: "1px dashed #bfdbfe",
                  padding: 16,
                  background: "#f8fbff",
                  color: "#64748b",
                  fontSize: 14,
                  textAlign: "center",
                }}
              >
                Nema mjerenja za prikaz.
              </div>
            ) : (
              mjerenjaSortirana.map((m, index) => {
                const otvoreno = otvorenoMjerenjeId === m.id;
                const samoBentotest = jeSamoBentotest(m);

                return (
                  <div
                    key={m.id}
                    onClick={() =>
                      setOtvorenoMjerenjeId((prev) => (prev === m.id ? null : m.id))
                    }
                    style={{
                      border: index === 0 ? "2px solid #60a5fa" : "1px solid #dbeafe",
                      padding: 12,
                      marginBottom: 10,
                      cursor: "pointer",
                      background: otvoreno ? "#f8fbff" : index === 0 ? "#f0f7ff" : "#fafcff",
                      boxShadow:
                        index === 0 ? "0 8px 18px rgba(59,130,246,0.10)" : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 800, color: "#1e3a5f" }}>
                        {opisTankaKratko(m.tank)}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        {index === 0 ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 900,
                              padding: "4px 8px",
                              background: "#dbeafe",
                              border: "1px solid #93c5fd",
                              color: "#1d4ed8",
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                            }}
                          >
                            Zadnje mjerenje
                          </span>
                        ) : null}

                        {samoBentotest ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 900,
                              padding: "4px 8px",
                              background: "#f3f4f6",
                              border: "1px solid #d1d5db",
                              color: "#374151",
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                            }}
                          >
                            Samo bentotest
                          </span>
                        ) : null}

                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                          {otvoreno ? "Zatvori" : "Otvori"}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      {formatDatum(m.izmjerenoAt)}
                    </div>

                    {samoBentotest ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <div
                          style={{
                            background: "#f8fbff",
                            border: "1px solid #dbeafe",
                            padding: "9px 10px",
                            display: "grid",
                            gap: 4,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              color: "#64748b",
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                            }}
                          >
                            Bentotest datum
                          </div>
                          <div style={{ fontSize: 13, color: "#1e3a5f", fontWeight: 800 }}>
                            {formatDatumSamoDan(m.bentotestDatum)}
                          </div>
                        </div>

                        <div
                          style={{
                            background:
                              m.bentotestStatus === "NESTABILNO" ? "#fff1f2" : "#f0fdf4",
                            border:
                              m.bentotestStatus === "NESTABILNO"
                                ? "1px solid #fecdd3"
                                : "1px solid #bbf7d0",
                            padding: "9px 10px",
                            display: "grid",
                            gap: 4,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              color: "#64748b",
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                            }}
                          >
                            Bentotest status
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color:
                                m.bentotestStatus === "NESTABILNO" ? "#9f1239" : "#166534",
                              fontWeight: 800,
                            }}
                          >
                            {m.bentotestStatus === "STABILNO"
                              ? "Stabilno"
                              : m.bentotestStatus === "NESTABILNO"
                              ? "Nestabilno"
                              : "-"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <MiniValue label="T" value={m.temperatura} unit="°C" max={22} />
                        <MiniValue label="Šećer" value={m.secer} />
                        <MiniValue
                          label="Kiseline"
                          value={m.ukupneKiseline}
                          min={4}
                          max={9}
                        />
                        <MiniValue label="Slob. SO2" value={m.slobodniSO2} min={10} />
                      </div>
                    )}

                    {otvoreno ? (
                      <div
                        style={{
                          marginTop: 12,
                          background: "#ffffff",
                          border: "1px solid #dbeafe",
                          padding: 14,
                          display: "grid",
                          gap: 12,
                        }}
                      >
                        <UpozorenjeParametri m={m} />

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                            gap: 10,
                          }}
                        >
                          <DetaljVrijednost
                            naslov="Temperatura"
                            vrijednost={m.temperatura}
                            jedinica="°C"
                            max={22}
                          />
                          <DetaljVrijednost naslov="Šećer" vrijednost={m.secer} />
                          <DetaljVrijednost
                            naslov="Ukupne kiseline"
                            vrijednost={m.ukupneKiseline}
                            min={4}
                            max={9}
                          />
                          <DetaljVrijednost
                            naslov="Slobodni SO2"
                            vrijednost={m.slobodniSO2}
                            min={10}
                          />
                          <DetaljVrijednost
                            naslov="Alkohol"
                            vrijednost={m.alkohol}
                            jedinica="%"
                          />
                          <DetaljVrijednost
                            naslov="pH"
                            vrijednost={m.ph}
                            min={2.9}
                            max={3.6}
                          />
                          <DetaljVrijednost
                            naslov="Hlapive kiseline"
                            vrijednost={m.hlapiveKiseline}
                            max={0.8}
                          />
                          <DetaljVrijednost
                            naslov="Ukupni SO2"
                            vrijednost={m.ukupniSO2}
                            max={220}
                          />
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              background: "#f8fbff",
                              border: "1px solid #dbeafe",
                              padding: 14,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#64748b",
                                textTransform: "uppercase",
                                letterSpacing: 0.3,
                                marginBottom: 6,
                              }}
                            >
                              Datum bentotesta
                            </div>
                            <div style={{ color: "#1e3a5f", fontWeight: 800 }}>
                              {formatDatumSamoDan(m.bentotestDatum)}
                            </div>
                          </div>

                          <div
                            style={{
                              background: "#f8fbff",
                              border: "1px solid #dbeafe",
                              padding: 14,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#64748b",
                                textTransform: "uppercase",
                                letterSpacing: 0.3,
                                marginBottom: 6,
                              }}
                            >
                              Bentotest status
                            </div>
                            <div style={{ color: "#1e3a5f", fontWeight: 800 }}>
                              {m.bentotestStatus === "STABILNO"
                                ? "Stabilno"
                                : m.bentotestStatus === "NESTABILNO"
                                ? "Nestabilno"
                                : "-"}
                            </div>
                          </div>
                        </div>

                        {m.napomena ? (
                          <div
                            style={{
                              background: "#f8fbff",
                              border: "1px solid #dbeafe",
                              padding: 14,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#64748b",
                                textTransform: "uppercase",
                                letterSpacing: 0.3,
                                marginBottom: 6,
                              }}
                            >
                              Napomena
                            </div>
                            <div
                              style={{
                                color: "#334155",
                                lineHeight: 1.55,
                                fontWeight: 600,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {m.napomena}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 800,
  fontSize: 14,
  color: "#1e3a8a",
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
};

const sectionStyleWarm: React.CSSProperties = {
  border: "1px solid #cfe3f1",
  padding: 16,
  display: "grid",
  gap: 12,
  background: "linear-gradient(180deg, #ffffff 0%, #f3f8fc 100%)",
};

const sectionStyleStrong: React.CSSProperties = {
  border: "2px solid #6fb6e9",
  padding: 18,
  display: "grid",
  gap: 14,
  background: "linear-gradient(180deg, #f2f8fd 0%, #e6f2fb 100%)",
  boxShadow: "0 8px 18px rgba(59,130,246,0.10)",
};

const sectionStyleBentotest: React.CSSProperties = {
  border: "1px solid #dbeafe",
  padding: 14,
  display: "grid",
  gap: 10,
  background: "#f8fbff",
};

const sectionTitleWarm: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#2563eb",
  letterSpacing: 0.3,
  textTransform: "uppercase",
};

const sectionTitleStrong: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#1d4ed8",
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const sectionTitleBentotest: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  letterSpacing: 0.3,
  textTransform: "uppercase",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr 1fr",
  gap: 10,
};

const input: React.CSSProperties = {
  padding: 12,
  border: "1px solid #cbd5e1",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
  color: "#1f2937",
};

const inputStrongWarm: React.CSSProperties = {
  padding: 14,
  border: "2px solid #60a5fa",
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
  background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
  color: "#1e3a8a",
  fontWeight: 800,
};

const inputBentotest: React.CSSProperties = {
  padding: 11,
  border: "1px solid #bfdbfe",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
  color: "#334155",
};

const textarea: React.CSSProperties = {
  padding: 12,
  border: "1px solid #cbd5e1",
  minHeight: 90,
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  fontSize: 14,
  background: "#ffffff",
  color: "#1f2937",
};

const btnWarm: React.CSSProperties = {
  padding: 15,
  border: "none",
  background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 15,
  boxShadow: "0 10px 20px rgba(59,130,246,0.25)",
};