"use client";

import { useMemo, useState } from "react";

/**
 * Kronologija — "sve sto se s ovim vinom radilo", jedan slijed umjesto sest
 * odvojenih kartica (Radnje, Pretoci, Dolasci, Punjenja, Izlazi, Izvrseni
 * zadaci).
 *
 * Klijentska je SAMO zbog filtra po vrsti. Dogadaji stizu vec sloziti i
 * sortirani sa servera; ovdje se nista ne dohvaca, ne cita iz baze ni ne
 * racuna. Zato u nju ne smije uci nikakva logika o vinu — sve sto se racuna,
 * racuna se u page.tsx.
 *
 * MJERENJA NAMJERNO NISU OVDJE. Ostaju vlastita kartica: imaju svoj graf po
 * parametru i u kronologiji bi bila sum (tank ih ima i po nekoliko desetaka
 * naspram jednoznamenkastog broja ostalih dogadaja).
 *
 * Granicu arhive postuje page.tsx pri slaganju dogadaja — ovdje se ne filtrira.
 */

export type VrstaDogadaja =
  | "PUNJENJE"
  | "ZADATAK"
  | "RADNJA"
  | "PRIJENOS_ULAZ"
  | "PRIJENOS_IZLAZ"
  | "PRETOK_ULAZ"
  | "PRETOK_IZLAZ"
  | "IZLAZ"
  | "ARHIVA";

export type Dogadaj = {
  id: string;
  vrsta: VrstaDogadaja;
  vrijeme: string; // ISO
  naslov: string;
  podnaslov?: string | null;
  tko?: string | null;
  iznos?: string | null;
  detalji?: Array<{ label: string; value: string }>;
  upozorenje?: string | null;
};

const OZNAKE: Record<VrstaDogadaja, { kratko: string; boja: string; pozadina: string }> = {
  PUNJENJE:       { kratko: "Punjenje",  boja: "#7f1d1d", pozadina: "#fff5f5" },
  ZADATAK:        { kratko: "Zadatak",   boja: "#166534", pozadina: "#f0fdf4" },
  RADNJA:         { kratko: "Radnja",    boja: "#44403c", pozadina: "#f4f4f5" },
  PRIJENOS_ULAZ:  { kratko: "Prijenos ↓", boja: "#166534", pozadina: "#f0fdf4" },
  PRIJENOS_IZLAZ: { kratko: "Prijenos ↑", boja: "#9f1239", pozadina: "#fff5f5" },
  PRETOK_ULAZ:    { kratko: "Pretok ↓",  boja: "#166534", pozadina: "#f0fdf4" },
  PRETOK_IZLAZ:   { kratko: "Pretok ↑",  boja: "#9f1239", pozadina: "#fff5f5" },
  IZLAZ:          { kratko: "Izlaz",     boja: "#9f1239", pozadina: "#fbf5f5" },
  ARHIVA:         { kratko: "Arhiva",    boja: "#6b7280", pozadina: "#f4f4f5" },
};

// Redoslijed gumba filtra. Grupirano po smislu, ne abecedno.
const REDOSLIJED: VrstaDogadaja[] = [
  "PUNJENJE",
  "ZADATAK",
  "RADNJA",
  "PRIJENOS_ULAZ",
  "PRIJENOS_IZLAZ",
  "PRETOK_ULAZ",
  "PRETOK_IZLAZ",
  "IZLAZ",
  "ARHIVA",
];

/**
 * Samo sat i minuta. Datum je vec u zaglavlju dana, pa se u retku ne ponavlja.
 *
 * NE izvlaci se rezanjem punog datuma po razmaku: hrvatski format je
 * "21. 08. 2026. 16:28", pa je drugi dio MJESEC, a ne vrijeme. Skica je
 * upravo to radila i u retku je pisalo "08." umjesto "16:28".
 */
function formatVrijeme(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDan(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function Kronologija({ dogadaji }: { dogadaji: Dogadaj[] }) {
  const [ukljucene, setUkljucene] = useState<Set<VrstaDogadaja>>(new Set());

  const prisutne = useMemo(() => {
    const brojac = new Map<VrstaDogadaja, number>();
    for (const d of dogadaji) brojac.set(d.vrsta, (brojac.get(d.vrsta) ?? 0) + 1);
    return REDOSLIJED.filter((v) => brojac.has(v)).map((v) => ({
      vrsta: v,
      broj: brojac.get(v) ?? 0,
    }));
  }, [dogadaji]);

  const vidljivi = useMemo(() => {
    if (ukljucene.size === 0) return dogadaji;
    return dogadaji.filter((d) => ukljucene.has(d.vrsta));
  }, [dogadaji, ukljucene]);

  // Grupiranje po danu — na uskom ekranu je datum-zaglavlje citljivije od
  // ponavljanja punog datuma u svakom retku.
  const poDanima = useMemo(() => {
    const mapa = new Map<string, Dogadaj[]>();
    for (const d of vidljivi) {
      const kljuc = formatDan(d.vrijeme);
      if (!mapa.has(kljuc)) mapa.set(kljuc, []);
      mapa.get(kljuc)!.push(d);
    }
    return Array.from(mapa.entries());
  }, [vidljivi]);

  function prebaci(v: VrstaDogadaja) {
    setUkljucene((prev) => {
      const novo = new Set(prev);
      if (novo.has(v)) novo.delete(v);
      else novo.add(v);
      return novo;
    });
  }

  return (
    <div>
      <div style={filterWrap}>
        <button
          type="button"
          onClick={() => setUkljucene(new Set())}
          style={{
            ...cip,
            ...(ukljucene.size === 0 ? cipAktivan : {}),
          }}
        >
          Sve ({dogadaji.length})
        </button>

        {prisutne.map(({ vrsta, broj }) => {
          const o = OZNAKE[vrsta];
          const aktivan = ukljucene.has(vrsta);
          return (
            <button
              key={vrsta}
              type="button"
              onClick={() => prebaci(vrsta)}
              style={{
                ...cip,
                ...(aktivan
                  ? { background: o.pozadina, color: o.boja, borderColor: o.boja, fontWeight: 700 }
                  : {}),
              }}
            >
              {o.kratko} ({broj})
            </button>
          );
        })}
      </div>

      {vidljivi.length === 0 ? (
        <div style={prazno}>Nema događaja za odabrani filtar.</div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {poDanima.map(([dan, stavke]) => (
            <div key={dan}>
              <div style={danZaglavlje}>{dan}</div>

              <div style={{ display: "grid", gap: 8 }}>
                {stavke.map((d) => {
                  const o = OZNAKE[d.vrsta];
                  const imaDetalje = (d.detalji?.length ?? 0) > 0;

                  const glava = (
                    <>
                      <div style={redGornji}>
                        <span style={{ ...znacka, background: o.pozadina, color: o.boja }}>
                          {o.kratko}
                        </span>
                        <span style={vrijemeStil}>
                          {formatVrijeme(d.vrijeme)}
                        </span>
                        {d.iznos ? <span style={iznosStil}>{d.iznos}</span> : null}
                      </div>

                      <div style={naslovStil}>{d.naslov}</div>

                      {d.podnaslov ? <div style={podnaslovStil}>{d.podnaslov}</div> : null}

                      {d.tko ? <div style={tkoStil}>{d.tko}</div> : null}

                      {d.upozorenje ? (
                        <div style={upozorenjeStil}>⚠ {d.upozorenje}</div>
                      ) : null}
                    </>
                  );

                  if (!imaDetalje) {
                    return (
                      <div key={d.id} style={{ ...kartica, borderLeftColor: o.boja }}>
                        {glava}
                      </div>
                    );
                  }

                  return (
                    <details key={d.id} style={{ ...kartica, borderLeftColor: o.boja }}>
                      <summary style={sazetakStil}>{glava}</summary>
                      <div style={detaljiStil}>
                        {d.detalji!.map((r, i) => (
                          <div key={i} style={detaljRed}>
                            <span style={detaljLabel}>{r.label}</span>
                            <span style={detaljValue}>{r.value}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- STILOVI ---------------- */
// Sve u jednom stupcu; nista ne tjera vodoravno pomicanje na uskom ekranu.

const filterWrap: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 16,
};

const cip: React.CSSProperties = {
  padding: "7px 11px",
  fontSize: 12,
  border: "1px solid #ececec",
  background: "#fff",
  color: "#44403c",
  cursor: "pointer",
  lineHeight: 1.2,
  // Dodir na mobitelu: dovoljno velika meta.
  minHeight: 34,
};

const cipAktivan: React.CSSProperties = {
  background: "#7f1d1d",
  color: "#fff",
  borderColor: "#7f1d1d",
  fontWeight: 700,
};

const danZaglavlje: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
  borderBottom: "1px solid #ececec",
  paddingBottom: 4,
  marginBottom: 8,
  position: "sticky",
  top: 0,
  background: "#fbfbfb",
  zIndex: 1,
};

const kartica: React.CSSProperties = {
  border: "1px solid #ececec",
  borderLeft: "3px solid #6b7280",
  background: "#fff",
  padding: "10px 12px",
};

const sazetakStil: React.CSSProperties = {
  cursor: "pointer",
  listStyle: "none",
};

const redGornji: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 4,
};

const znacka: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const vrijemeStil: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  fontVariantNumeric: "tabular-nums",
};

const iznosStil: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 13,
  fontWeight: 700,
  color: "#2f2f2f",
  fontVariantNumeric: "tabular-nums",
};

const naslovStil: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#2f2f2f",
  // Dugi nazivi vina se lome, ne razvlace karticu.
  overflowWrap: "anywhere",
};

const podnaslovStil: React.CSSProperties = {
  fontSize: 12,
  color: "#44403c",
  marginTop: 2,
  overflowWrap: "anywhere",
};

const tkoStil: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 2,
};

const upozorenjeStil: React.CSSProperties = {
  fontSize: 12,
  color: "#9a3412",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  padding: "4px 7px",
  marginTop: 6,
};

const detaljiStil: React.CSSProperties = {
  display: "grid",
  gap: 4,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px dashed #ececec",
};

const detaljRed: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(90px, 40%) 1fr",
  gap: 8,
  fontSize: 12,
};

const detaljLabel: React.CSSProperties = { color: "#6b7280" };
const detaljValue: React.CSSProperties = {
  color: "#2f2f2f",
  fontWeight: 500,
  overflowWrap: "anywhere",
};

const prazno: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  padding: "20px 0",
};
