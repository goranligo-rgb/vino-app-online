"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tocka = { t: string; avg: number; min: number; max: number; hladi: boolean };

type Odgovor = {
  raspon: string;
  zadana: number | null;
  bucketSec: number;
  tocke: Tocka[];
};

const RASPONI: { key: "24h" | "7d" | "30d"; label: string }[] = [
  { key: "24h", label: "24 h" },
  { key: "7d", label: "7 dana" },
  { key: "30d", label: "30 dana" },
];

// Inline SVG graf (bez vanjske biblioteke). Sklopljen po defaultu, otvara se na klik.
export default function HladjenjeGraf({
  tankId,
  zadanaPocetna,
}: {
  tankId: string;
  zadanaPocetna: number | null;
}) {
  const [otvoren, setOtvoren] = useState(false);
  const [raspon, setRaspon] = useState<"24h" | "7d" | "30d">("24h");
  const [data, setData] = useState<Odgovor | null>(null);
  const [loading, setLoading] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const ucitaj = useCallback(
    async (r: "24h" | "7d" | "30d") => {
      setLoading(true);
      setGreska(null);
      try {
        const res = await fetch(`/api/tank/${tankId}/temperatura?raspon=${r}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("fetch");
        setData(await res.json());
      } catch {
        setGreska("Greška kod učitavanja grafa.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [tankId]
  );

  // Dohvati tek kad je graf otvoren (lazy).
  useEffect(() => {
    if (otvoren) ucitaj(raspon);
  }, [otvoren, raspon, ucitaj]);

  const zadana = data?.zadana ?? zadanaPocetna;

  if (!otvoren) {
    return (
      <button
        type="button"
        onClick={() => setOtvoren(true)}
        style={{
          alignSelf: "start",
          minHeight: 40,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          border: "1px solid #cfcfcf",
          background: "#f8f9fa",
          color: "#222",
          touchAction: "manipulation",
        }}
      >
        ▸ Prikaži graf temperature
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {RASPONI.map((r) => {
          const aktivan = r.key === raspon;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRaspon(r.key)}
              style={{
                minHeight: 40,
                minWidth: 72,
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                border: aktivan ? "1px solid #1f6f8b" : "1px solid #cfcfcf",
                background: aktivan ? "#1f6f8b" : "#f8f9fa",
                color: aktivan ? "#ffffff" : "#333",
                touchAction: "manipulation",
              }}
            >
              {r.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOtvoren(false)}
          style={{
            marginLeft: "auto",
            minHeight: 40,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            border: "1px solid #cfcfcf",
            background: "#f8f9fa",
            color: "#222",
            touchAction: "manipulation",
          }}
        >
          ▾ Sakrij
        </button>
      </div>

      <div style={{ background: "#ffffff", border: "1px solid #ececec", padding: 8 }}>
        {loading ? (
          <div style={porukaStyle}>Učitavam…</div>
        ) : greska ? (
          <div style={{ ...porukaStyle, color: "#a11d1d" }}>{greska}</div>
        ) : !data || data.tocke.length === 0 ? (
          <div style={porukaStyle}>Još nema očitanja za ovaj raspon.</div>
        ) : (
          <Graf
            tocke={data.tocke}
            zadana={zadana}
            raspon={raspon}
            bucketSec={data.bucketSec}
          />
        )}
      </div>
    </div>
  );
}

const porukaStyle: React.CSSProperties = {
  padding: "22px 12px",
  textAlign: "center",
  color: "#8a8f94",
  fontSize: 13,
};

// Glatka linija (Catmull-Rom -> kubične bezier krivulje).
function glatkaLinija(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function Graf({
  tocke,
  zadana,
  raspon,
  bucketSec,
}: {
  tocke: Tocka[];
  zadana: number | null;
  raspon: "24h" | "7d" | "30d";
  bucketSec: number;
}) {
  // Puna širina, fiksna (kompaktna) visina: viewBox širina = izmjerena širina
  // kontejnera pa uz width:100% ostaje mjerilo ~1:1 i visina stalna.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(720);
  const H = 160;
  const padL = 34;
  const padR = 14;
  const padT = 10;
  const padB = 20;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(320, Math.floor(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    const xs = tocke.map((p) => new Date(p.t).getTime());
    const t0 = Math.min(...xs);
    const t1 = Math.max(...xs);
    const spanT = t1 - t0 || 1;

    let vmin = Infinity;
    let vmax = -Infinity;
    for (const p of tocke) {
      vmin = Math.min(vmin, p.min);
      vmax = Math.max(vmax, p.max);
    }
    if (zadana != null) {
      vmin = Math.min(vmin, zadana);
      vmax = Math.max(vmax, zadana);
    }
    if (!Number.isFinite(vmin) || !Number.isFinite(vmax)) {
      vmin = 0;
      vmax = 20;
    }
    const pad = Math.max(0.5, (vmax - vmin) * 0.14);
    vmin = Math.floor((vmin - pad) * 2) / 2;
    vmax = Math.ceil((vmax + pad) * 2) / 2;
    if (vmax - vmin < 1) vmax = vmin + 1;

    const sx = (t: number) => padL + ((t - t0) / spanT) * innerW;
    const sy = (v: number) => padT + ((vmax - v) / (vmax - vmin)) * innerH;

    const pts = tocke.map((p) => ({
      x: sx(new Date(p.t).getTime()),
      y: sy(p.avg),
      t: new Date(p.t),
      p,
    }));

    const linija = glatkaLinija(pts);

    let band = "";
    if (bucketSec > 0 && pts.length > 1) {
      const gore = tocke.map((p) => ({ x: sx(new Date(p.t).getTime()), y: sy(p.max) }));
      const dolje = tocke.map((p) => ({ x: sx(new Date(p.t).getTime()), y: sy(p.min) }));
      const gorePath = glatkaLinija(gore);
      const doljeObrnuto = dolje
        .slice()
        .reverse()
        .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ");
      band = `${gorePath} ${doljeObrnuto} Z`;
    }

    const yTicks: { v: number; y: number }[] = [];
    for (let i = 0; i <= 3; i++) {
      const v = vmin + ((vmax - vmin) * i) / 3;
      yTicks.push({ v: Math.round(v * 10) / 10, y: sy(v) });
    }

    const brojX = Math.min(4, tocke.length);
    const xTicks: { x: number; label: string }[] = [];
    for (let i = 0; i < brojX; i++) {
      const t = t0 + (spanT * i) / (brojX - 1 || 1);
      xTicks.push({ x: sx(t), label: formatX(new Date(t), raspon) });
    }

    return { sx, sy, pts, linija, band, yTicks, xTicks, vmin, vmax };
  }, [tocke, zadana, raspon, bucketSec, innerW, innerH]);

  const yZadana = zadana != null ? model.sy(zadana) : null;

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || model.pts.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const vbX = ((e.clientX - rect.left) / rect.width) * W;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < model.pts.length; i++) {
        const d = Math.abs(model.pts[i].x - vbX);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      setHover(best);
    },
    [model]
  );

  const h = hover != null ? model.pts[hover] : null;

  return (
    <div ref={wrapRef} style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", touchAction: "pan-y" }}
        role="img"
        aria-label="Graf temperature"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {model.yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#f2f2f2" strokeWidth={1} />
            <text x={padL - 6} y={t.y + 3} textAnchor="end" fontSize={9} fill="#9aa0a6">
              {t.v.toLocaleString("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}

        {model.xTicks.map((t, i) => (
          <text key={`x${i}`} x={t.x} y={H - 6} textAnchor="middle" fontSize={9} fill="#9aa0a6">
            {t.label}
          </text>
        ))}

        {model.band && <path d={model.band} fill="rgba(31,111,139,0.08)" stroke="none" />}

        {yZadana != null && (
          <>
            <line
              x1={padL}
              y1={yZadana}
              x2={W - padR}
              y2={yZadana}
              stroke="#d1495b"
              strokeWidth={1}
              strokeDasharray="5 5"
              opacity={0.6}
            />
            <text x={W - padR} y={yZadana - 3} textAnchor="end" fontSize={9} fill="#d1495b" opacity={0.8}>
              zadana {zadana!.toLocaleString("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°C
            </text>
          </>
        )}

        <path
          d={model.linija}
          fill="none"
          stroke="#1f6f8b"
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {h && (
          <g>
            <line x1={h.x} y1={padT} x2={h.x} y2={H - padB} stroke="#c9ced2" strokeWidth={1} />
            <circle cx={h.x} cy={h.y} r={3} fill="#ffffff" stroke="#1f6f8b" strokeWidth={1.5} />
            <Tooltip x={h.x} temp={h.p.avg} vrijeme={h.t} raspon={raspon} W={W} padR={padR} padL={padL} />
          </g>
        )}
      </svg>
    </div>
  );
}

function Tooltip({
  x,
  temp,
  vrijeme,
  raspon,
  W,
  padR,
  padL,
}: {
  x: number;
  temp: number;
  vrijeme: Date;
  raspon: "24h" | "7d" | "30d";
  W: number;
  padR: number;
  padL: number;
}) {
  const bw = 110;
  const bh = 30;
  let bx = x - bw / 2;
  bx = Math.max(padL, Math.min(W - padR - bw, bx));
  const by = 6;
  const vrijemeTxt =
    raspon === "24h"
      ? vrijeme.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })
      : vrijeme.toLocaleString("hr-HR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <g>
      <rect x={bx} y={by} width={bw} height={bh} fill="#ffffff" stroke="#e0e0e0" strokeWidth={1} />
      <text x={bx + bw / 2} y={by + 13} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1f6f8b">
        {temp.toLocaleString("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C
      </text>
      <text x={bx + bw / 2} y={by + 25} textAnchor="middle" fontSize={9} fill="#8a8f94">
        {vrijemeTxt}
      </text>
    </g>
  );
}

function formatX(d: Date, raspon: "24h" | "7d" | "30d"): string {
  if (raspon === "24h") {
    return d.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit" });
}
