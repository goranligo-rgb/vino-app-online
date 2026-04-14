"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type StatPoSorti = {
  sorta: string;
  litara: number;
};

type StatPoGodistu = {
  godiste: string;
  litara: number;
};

type StatPoNazivu = {
  nazivVina: string;
  litara: number;
};

type StatPoTanku = {
  tankId: string;
  brojTanka: number;
  kapacitet: number;
  litara: number;
  popunjenostPosto: number;
  tip?: string | null;
  opis?: string | null;
  sorta?: string | null;
  nazivVina?: string | null;
  godiste?: number | null;
  udjeliSorti?: Array<{
    nazivSorte: string;
    postotak: number;
    litara: number;
  }>;
};

type StatistikaData = {
  ok?: boolean;
  sazetak?: {
    ukupnoTankova: number;
    ukupnoLitara: number;
    ukupnoProdanoLitara: number;
    ukupnoPunjenjeLitara: number;
    ukupnoPunjenihBoca: number;
  };
  poSortama?: StatPoSorti[];
  poGodistima?: StatPoGodistu[];
  poNazivimaVina?: StatPoNazivu[];
  poTankovima?: StatPoTanku[];
  punjenoPoSortama?: StatPoSorti[];
  prodanoPoSortama?: StatPoSorti[];
  error?: string;
};

function formatBroj(value: number | null | undefined, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export default function StatistikaPage() {
  const [data, setData] = useState<StatistikaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [greska, setGreska] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setGreska("");

      try {
        const res = await fetch("/api/statistika-vina", { cache: "no-store" });
        const json: StatistikaData = await res.json();

        if (!res.ok) {
          throw new Error(json.error || "Greška kod učitavanja statistike.");
        }

        setData(json);
      } catch (e) {
        setGreska(
          e instanceof Error ? e.message : "Greška kod učitavanja statistike."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const ukupniKapacitet = useMemo(() => {
    const tankovi = data?.poTankovima ?? [];
    return tankovi.reduce((sum, t) => sum + Number(t.kapacitet || 0), 0);
  }, [data]);

  const slobodanKapacitet = useMemo(() => {
    const litara = Number(data?.sazetak?.ukupnoLitara ?? 0);
    return Math.max(0, ukupniKapacitet - litara);
  }, [data, ukupniKapacitet]);

  const aktivniTankovi = useMemo(() => {
    const tankovi = data?.poTankovima ?? [];
    return tankovi.filter((t) => Number(t.litara || 0) > 0).length;
  }, [data]);

  const prazniTankovi = useMemo(() => {
    const tankovi = data?.poTankovima ?? [];
    return tankovi.filter((t) => Number(t.litara || 0) <= 0).length;
  }, [data]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={topBarStyle}>
          <div>
            <h1 style={titleStyle}>Statistika vina</h1>
            <div style={subtitleStyle}>
              Pregled količina vina u podrumu, punjenja u boce i rinfuza prodaje.
            </div>
          </div>

          <Link href="/dashboard" style={backButtonStyle}>
            POČETNA
          </Link>
        </div>

        {loading ? <div style={cardStyle}>Učitavanje...</div> : null}
        {greska ? <div style={errorStyle}>{greska}</div> : null}

        {!loading && !greska && data ? (
          <>
            <section style={summaryGridStyle}>
              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Ukupno vina u podrumu</div>
                <div style={summaryValueStyle}>
                  {formatBroj(data.sazetak?.ukupnoLitara)} L
                </div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Ukupni kapacitet</div>
                <div style={summaryValueStyle}>{formatBroj(ukupniKapacitet)} L</div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Slobodan kapacitet</div>
                <div style={summaryValueStyle}>
                  {formatBroj(slobodanKapacitet)} L
                </div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Ukupno tankova</div>
                <div style={summaryValueStyle}>
                  {formatBroj(data.sazetak?.ukupnoTankova, 0)}
                </div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Aktivni tankovi</div>
                <div style={summaryValueStyle}>{formatBroj(aktivniTankovi, 0)}</div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Prazni tankovi</div>
                <div style={summaryValueStyle}>{formatBroj(prazniTankovi, 0)}</div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Ukupno prodano</div>
                <div style={summaryValueStyle}>
                  {formatBroj(data.sazetak?.ukupnoProdanoLitara)} L
                </div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Ukupno punjeno</div>
                <div style={summaryValueStyle}>
                  {formatBroj(data.sazetak?.ukupnoPunjenjeLitara)} L
                </div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Ukupno punjenih boca</div>
                <div style={summaryValueStyle}>
                  {formatBroj(data.sazetak?.ukupnoPunjenihBoca, 0)}
                </div>
              </div>
            </section>

            <section style={threeColStyle}>
              <div style={cardStyle}>
                <div style={cardTitleStyle}>Količina vina po sortama</div>
                {(data.poSortama ?? []).length === 0 ? (
                  <div style={emptyStyle}>Nema podataka.</div>
                ) : (
                  <div style={listWrapStyle}>
                    {data.poSortama?.map((row) => (
                      <div key={row.sorta} style={progressRowStyle}>
                        <div style={progressHeadStyle}>
                          <strong>{row.sorta}</strong>
                          <span>{formatBroj(row.litara)} L</span>
                        </div>
                        <div style={progressTrackStyle}>
                          <div
                            style={{
                              ...progressFillStyle,
                              width: `${
                                data.sazetak?.ukupnoLitara
                                  ? Math.max(
                                      2,
                                      Math.min(
                                        100,
                                        (row.litara / data.sazetak.ukupnoLitara) *
                                          100
                                      )
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <div style={cardTitleStyle}>Punjeno u boce po sortama</div>
                {(data.punjenoPoSortama ?? []).length === 0 ? (
                  <div style={emptyStyle}>Nema podataka.</div>
                ) : (
                  <div style={listWrapStyle}>
                    {data.punjenoPoSortama?.map((row) => (
                      <div key={row.sorta} style={progressRowStyle}>
                        <div style={progressHeadStyle}>
                          <strong>{row.sorta}</strong>
                          <span>{formatBroj(row.litara)} L</span>
                        </div>
                        <div style={progressTrackStyle}>
                          <div
                            style={{
                              ...progressFillStyleBlue,
                              width: `${
                                data.sazetak?.ukupnoPunjenjeLitara
                                  ? Math.max(
                                      2,
                                      Math.min(
                                        100,
                                        (row.litara /
                                          data.sazetak.ukupnoPunjenjeLitara) *
                                          100
                                      )
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <div style={cardTitleStyle}>Prodano rinfuza po sortama</div>
                {(data.prodanoPoSortama ?? []).length === 0 ? (
                  <div style={emptyStyle}>Nema podataka.</div>
                ) : (
                  <div style={listWrapStyle}>
                    {data.prodanoPoSortama?.map((row) => (
                      <div key={row.sorta} style={progressRowStyle}>
                        <div style={progressHeadStyle}>
                          <strong>{row.sorta}</strong>
                          <span>{formatBroj(row.litara)} L</span>
                        </div>
                        <div style={progressTrackStyle}>
                          <div
                            style={{
                              ...progressFillStyleOrange,
                              width: `${
                                data.sazetak?.ukupnoProdanoLitara
                                  ? Math.max(
                                      2,
                                      Math.min(
                                        100,
                                        (row.litara /
                                          data.sazetak.ukupnoProdanoLitara) *
                                          100
                                      )
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section style={twoColStyle}>
              <div style={cardStyle}>
                <div style={cardTitleStyle}>Količina vina po godištima</div>
                {(data.poGodistima ?? []).length === 0 ? (
                  <div style={emptyStyle}>Nema podataka.</div>
                ) : (
                  <div style={listWrapStyle}>
                    {data.poGodistima?.map((row) => (
                      <div key={row.godiste} style={progressRowStyle}>
                        <div style={progressHeadStyle}>
                          <strong>{row.godiste}</strong>
                          <span>{formatBroj(row.litara)} L</span>
                        </div>
                        <div style={progressTrackStyle}>
                          <div
                            style={{
                              ...progressFillStyle,
                              width: `${
                                data.sazetak?.ukupnoLitara
                                  ? Math.max(
                                      2,
                                      Math.min(
                                        100,
                                        (row.litara / data.sazetak.ukupnoLitara) *
                                          100
                                      )
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <div style={cardTitleStyle}>Količina vina po nazivima vina</div>
                {(data.poNazivimaVina ?? []).length === 0 ? (
                  <div style={emptyStyle}>Nema podataka.</div>
                ) : (
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Naziv vina</th>
                          <th style={thStyle}>Količina</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.poNazivimaVina?.map((row) => (
                          <tr key={row.nazivVina}>
                            <td style={tdStyle}>{row.nazivVina}</td>
                            <td style={tdStyle}>{formatBroj(row.litara)} L</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section style={cardStyle}>
              <div style={cardTitleStyle}>Pregled po tankovima</div>

              {(data.poTankovima ?? []).length === 0 ? (
                <div style={emptyStyle}>Nema podataka.</div>
              ) : (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Tank</th>
                        <th style={thStyle}>Naziv vina</th>
                        <th style={thStyle}>Sorta</th>
                        <th style={thStyle}>Godište</th>
                        <th style={thStyle}>Tip</th>
                        <th style={thStyle}>Litara</th>
                        <th style={thStyle}>Kapacitet</th>
                        <th style={thStyle}>Popunjenost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.poTankovima?.map((row) => (
                        <tr key={row.tankId}>
                          <td style={tdStyle}>Tank {row.brojTanka}</td>
                          <td style={tdStyle}>{row.nazivVina || "—"}</td>
                          <td style={tdStyle}>{row.sorta || "—"}</td>
                          <td style={tdStyle}>{row.godiste ?? "—"}</td>
                          <td style={tdStyle}>{row.tip || "—"}</td>
                          <td style={tdStyle}>{formatBroj(row.litara)} L</td>
                          <td style={tdStyle}>{formatBroj(row.kapacitet)} L</td>
                          <td style={tdStyle}>
                            {formatBroj(row.popunjenostPosto)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f4f5",
  padding: 16,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 1400,
  margin: "0 auto",
  display: "grid",
  gap: 12,
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  color: "#2f2f2f",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#6b7280",
  fontSize: 14,
};

const backButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  background: "#ffffff",
  border: "1px solid #d1d5db",
  color: "#44403c",
  textDecoration: "none",
  fontSize: 13,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const summaryCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
  padding: "12px 14px",
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

const summaryValueStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 800,
  color: "#2f2f2f",
};

const threeColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const twoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
};

const cardTitleStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(127,29,29,0.18)",
  fontSize: 14,
  fontWeight: 700,
  color: "#2f2f2f",
};

const listWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
};

const progressRowStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const progressHeadStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 13,
  color: "#2f2f2f",
};

const progressTrackStyle: React.CSSProperties = {
  width: "100%",
  height: 10,
  background: "#ececec",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "rgba(127,29,29,0.72)",
};

const progressFillStyleBlue: React.CSSProperties = {
  height: "100%",
  background: "rgba(29,78,216,0.72)",
};

const progressFillStyleOrange: React.CSSProperties = {
  height: "100%",
  background: "rgba(234,88,12,0.72)",
};

const tableWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 800,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 12,
  color: "#6b7280",
  background: "#fafafa",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 13,
  color: "#2f2f2f",
  verticalAlign: "top",
};

const emptyStyle: React.CSSProperties = {
  padding: 12,
  color: "#6b7280",
  fontSize: 13,
};

const errorStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "#fff7ed",
  border: "1px solid #fdba74",
  color: "#9a3412",
  fontSize: 13,
};