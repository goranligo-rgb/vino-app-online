"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TankApiRow = {
  id: string;
  broj?: number;
  kapacitet?: number | null;
  kolicinaVinaUTanku?: number | null;
  sorta?: string | null;
  nazivVina?: string | null;
  godiste?: number | null;
  tip?: string | null;
};

type TankOption = {
  tankId: string;
  brojTanka: number;
  nazivVina?: string | null;
  sorta?: string | null;
  godiste?: number | null;
  litara: number;
};

type IzlazRow = {
  id: string;
  tip: "PRODAJA" | "PUNJENJE";
  datum: string;
  kolicinaLitara: number;
  brojBoca?: number | null;
  volumenBoce?: number | null;
  napomena?: string | null;
  tank?: {
    id: string;
    broj: number;
    sorta?: string | null;
    nazivVina?: string | null;
    godiste?: number | null;
  };
};

type IzlaziResponse = {
  ok?: boolean;
  count?: number;
  ukupnoLitara?: number;
  izlazi?: IzlazRow[];
  error?: string;
  warning?: string;
};

function formatBroj(value: number | null | undefined, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatDatum(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("hr-HR");
}

function formatDatumInputNow() {
  const now = new Date();
  const lokalno = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return lokalno.toISOString().slice(0, 16);
}

function toNumber(value: string) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function tankLabel(t: TankOption) {
  const naziv = t.nazivVina?.trim() || t.sorta?.trim() || "Bez naziva";
  const godina = t.godiste ? ` • ${t.godiste}` : "";
  return `Tank ${t.brojTanka} • ${naziv}${godina} • stanje ${formatBroj(t.litara)} L`;
}

function mapTankoviResponse(data: any): TankOption[] {
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(data?.tankovi)
      ? data.tankovi
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
          ? data.data
          : [];

  return rawList
    .map((t: TankApiRow) => ({
      tankId: t.id,
      brojTanka: Number(t.broj ?? 0),
      nazivVina: t.nazivVina ?? null,
      sorta: t.sorta ?? null,
      godiste: t.godiste ?? null,
      litara: Number(t.kolicinaVinaUTanku ?? 0),
    }))
    .filter((t) => !!t.tankId && Number.isFinite(t.brojTanka))
    .sort((a, b) => a.brojTanka - b.brojTanka);
}

function jeArhiviraniIzlaz(napomena?: string | null) {
  const text = (napomena ?? "").toLowerCase();
  return (
    text.includes("arhivirano") ||
    text.includes("tank ispražnjen") ||
    text.includes("tank ispraznjen") ||
    text.includes("završni izlaz") ||
    text.includes("zavrsni izlaz")
  );
}

function tipLabel(tip: "PRODAJA" | "PUNJENJE") {
  return tip === "PRODAJA" ? "PRODAJA RINFUZA" : "PUNJENJE U BOCE";
}

export default function IzlazVinaPage() {
  const [tankovi, setTankovi] = useState<TankOption[]>([]);
  const [izlazi, setIzlazi] = useState<IzlazRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [poruka, setPoruka] = useState("");
  const [greska, setGreska] = useState("");
  const [warning, setWarning] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const [tankId, setTankId] = useState("");
  const [tip, setTip] = useState<"PRODAJA" | "PUNJENJE">("PRODAJA");
  const [datum, setDatum] = useState(formatDatumInputNow());
  const [kolicinaLitara, setKolicinaLitara] = useState("");
  const [volumenBoce, setVolumenBoce] = useState("0.75");
  const [napomena, setNapomena] = useState("");

  const [filterTip, setFilterTip] = useState("");
  const [filterTankId, setFilterTankId] = useState("");

  useEffect(() => {
    const provjeri = () => setIsMobile(window.innerWidth <= 768);
    provjeri();
    window.addEventListener("resize", provjeri);
    return () => window.removeEventListener("resize", provjeri);
  }, []);

  const autoBrojBoca = useMemo(() => {
    const litara = toNumber(kolicinaLitara);
    const boca = toNumber(volumenBoce);

    if (tip !== "PUNJENJE") return 0;
    if (litara <= 0 || boca <= 0) return 0;

    return Math.floor(litara / boca);
  }, [kolicinaLitara, volumenBoce, tip]);

  const ostatakLitaraPunjenje = useMemo(() => {
    const litara = toNumber(kolicinaLitara);
    const boca = toNumber(volumenBoce);

    if (tip !== "PUNJENJE") return 0;
    if (litara <= 0 || boca <= 0) return 0;

    return Number((litara - autoBrojBoca * boca).toFixed(3));
  }, [kolicinaLitara, volumenBoce, tip, autoBrojBoca]);

  const ostajeUTanku = useMemo(() => {
    const trenutno = Number(
      tankovi.find((t) => t.tankId === tankId)?.litara ?? 0
    );
    const izlaz = toNumber(kolicinaLitara);
    return Math.max(0, Number((trenutno - izlaz).toFixed(3)));
  }, [tankovi, tankId, kolicinaLitara]);

  async function ucitajSve() {
    setLoading(true);
    setGreska("");
    setWarning("");

    try {
      const [tankRes, izlaziRes] = await Promise.all([
        fetch("/api/tank", { cache: "no-store" }),
        fetch("/api/izlaz-vina?limit=100", { cache: "no-store" }),
      ]);

      const tankData = await tankRes.json();
      const izlaziData: IzlaziResponse = await izlaziRes.json();

      if (!tankRes.ok) {
        throw new Error(
          tankData?.error || "Ne mogu dohvatiti tankove iz /api/tank."
        );
      }

      if (!izlaziRes.ok) {
        throw new Error(izlaziData.error || "Ne mogu dohvatiti izlaze vina.");
      }

      const tankoviData = mapTankoviResponse(tankData);

      setTankovi(tankoviData);
      setIzlazi(Array.isArray(izlaziData.izlazi) ? izlaziData.izlazi : []);
      setWarning(izlaziData.warning || "");

      if (!tankId && tankoviData.length > 0) {
        setTankId(tankoviData[0].tankId);
      }
    } catch (e) {
      setGreska(e instanceof Error ? e.message : "Greška kod učitavanja.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    ucitajSve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const odabraniTank = useMemo(
    () => tankovi.find((t) => t.tankId === tankId) ?? null,
    [tankovi, tankId]
  );

  const filtriraniIzlazi = useMemo(() => {
    return izlazi.filter((row) => {
      const tipOk = !filterTip || row.tip === filterTip;
      const tankOk = !filterTankId || row.tank?.id === filterTankId;
      return tipOk && tankOk;
    });
  }, [izlazi, filterTip, filterTankId]);

  const zadnjihDesetIzlaza = useMemo(() => {
    return filtriraniIzlazi.slice(0, 10);
  }, [filtriraniIzlazi]);

  async function spremiIzlaz() {
    setSaving(true);
    setPoruka("");
    setGreska("");

    try {
      const body = {
        tankId,
        tip,
        datum: datum ? new Date(datum).toISOString() : new Date().toISOString(),
        kolicinaLitara: toNumber(kolicinaLitara),
        brojBoca: tip === "PUNJENJE" ? autoBrojBoca : null,
        volumenBoce: tip === "PUNJENJE" ? toNumber(volumenBoce) : null,
        napomena: napomena.trim() || null,
      };

      const res = await fetch("/api/izlaz-vina", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Spremanje nije uspjelo.");
      }

      setPoruka("Izlaz vina je uspješno spremljen.");
      setKolicinaLitara("");
      setVolumenBoce("0.75");
      setNapomena("");
      setDatum(formatDatumInputNow());

      await ucitajSve();
    } catch (e) {
      setGreska(e instanceof Error ? e.message : "Greška kod spremanja.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div
          style={{
            ...topBarStyle,
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-start",
          }}
        >
          <div>
            <h1 style={{ ...titleStyle, fontSize: isMobile ? 24 : 28 }}>
              Izlaz vina
            </h1>
            <div style={subtitleStyle}>
              Izvadi vino iz odabranog tanka i evidentiraj punjenje ili rinfuza
              prodaju.
            </div>
          </div>

          <Link
            href="/dashboard"
            style={{
              ...backButtonStyle,
              width: isMobile ? "100%" : "auto",
            }}
          >
            POČETNA
          </Link>
        </div>

        <div
          style={{
            ...topSectionStyle,
            gridTemplateColumns: isMobile
              ? "minmax(0, 1fr)"
              : "minmax(0, 2fr) minmax(280px, 1fr)",
          }}
        >
          <section style={cardStyle}>
            <div style={cardTitleStyle}>Novi izlaz vina</div>

            <div
              style={{
                ...formGridStyle,
                gridTemplateColumns: isMobile
                  ? "minmax(0, 1fr)"
                  : "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Tank</label>
                <select
                  value={tankId}
                  onChange={(e) => setTankId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Odaberi tank</option>
                  {tankovi.map((t) => (
                    <option key={t.tankId} value={t.tankId}>
                      {tankLabel(t)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Tip izlaza</label>
                <select
                  value={tip}
                  onChange={(e) =>
                    setTip(e.target.value as "PRODAJA" | "PUNJENJE")
                  }
                  style={inputStyle}
                >
                  <option value="PRODAJA">Prodaja rinfuza</option>
                  <option value="PUNJENJE">Punjenje u boce</option>
                </select>
              </div>

              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Datum i vrijeme</label>
                <input
                  type="datetime-local"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Količina (L)</label>
                <input
                  value={kolicinaLitara}
                  onChange={(e) => setKolicinaLitara(e.target.value)}
                  placeholder="npr. 499.5"
                  style={inputStyle}
                />
              </div>

              {tip === "PUNJENJE" && (
                <div style={fieldWrapStyle}>
                  <label style={labelStyle}>Volumen boce (L)</label>
                  <input
                    value={volumenBoce}
                    onChange={(e) => setVolumenBoce(e.target.value)}
                    placeholder="0.75"
                    style={inputStyle}
                  />
                </div>
              )}

              <div style={{ ...fieldWrapStyle, gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Napomena</label>
                <textarea
                  value={napomena}
                  onChange={(e) => setNapomena(e.target.value)}
                  placeholder="Po želji upiši napomenu, a ako ne upišeš sustav će sam složiti zapis."
                  style={textareaStyle}
                />
              </div>
            </div>

            {odabraniTank ? (
              <div style={infoStripStyle}>
                Trenutno stanje odabranog tanka:{" "}
                <strong>{formatBroj(odabraniTank.litara)} L</strong>
              </div>
            ) : null}

            {warning ? <div style={warningStyle}>{warning}</div> : null}
            {poruka ? <div style={successStyle}>{poruka}</div> : null}
            {greska ? <div style={errorStyle}>{greska}</div> : null}

            <div style={actionsStyle}>
              <button
                type="button"
                onClick={spremiIzlaz}
                disabled={saving || !tankId}
                style={{
                  ...primaryButtonStyle,
                  width: isMobile ? "100%" : "auto",
                  opacity: saving || !tankId ? 0.6 : 1,
                  cursor: saving || !tankId ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Spremam..." : "Spremi izlaz vina"}
              </button>
            </div>
          </section>

          <aside style={cardStyle}>
            <div style={cardTitleStyle}>
              {tip === "PUNJENJE" ? "Kartica punjenja" : "Kartica izlaza"}
            </div>

            <div style={sideCardBodyStyle}>
              <div style={sideStatStyle}>
                <div style={sideStatLabelStyle}>Odabrani tank</div>
                <div style={sideStatValueStyle}>
                  {odabraniTank ? `Tank ${odabraniTank.brojTanka}` : "—"}
                </div>
              </div>

              <div style={sideStatStyle}>
                <div style={sideStatLabelStyle}>Sorta / vino</div>
                <div style={sideStatValueStyle}>
                  {odabraniTank?.nazivVina || odabraniTank?.sorta || "—"}
                </div>
              </div>

              <div style={sideStatStyle}>
                <div style={sideStatLabelStyle}>Količina izlaza</div>
                <div style={sideStatValueStyle}>
                  {toNumber(kolicinaLitara) > 0
                    ? `${formatBroj(toNumber(kolicinaLitara))} L`
                    : "—"}
                </div>
              </div>

              <div style={sideStatStyle}>
                <div style={sideStatLabelStyle}>Ostalo u tanku</div>
                <div style={sideStatValueStyle}>
                  {odabraniTank && toNumber(kolicinaLitara) > 0
                    ? `${formatBroj(ostajeUTanku)} L`
                    : "—"}
                </div>
              </div>

              {tip === "PUNJENJE" ? (
                <>
                  <div style={sideStatStyle}>
                    <div style={sideStatLabelStyle}>Volumen boce</div>
                    <div style={sideStatValueStyle}>
                      {toNumber(volumenBoce) > 0
                        ? `${formatBroj(toNumber(volumenBoce))} L`
                        : "—"}
                    </div>
                  </div>

                  <div style={sideStatStrongStyle}>
                    <div style={sideStatLabelStrongStyle}>Broj boca</div>
                    <div
                      style={{
                        ...sideStatValueStrongStyle,
                        fontSize: isMobile ? 24 : 28,
                      }}
                    >
                      {autoBrojBoca > 0 ? formatBroj(autoBrojBoca, 0) : "—"}
                    </div>
                  </div>

                  <div style={sideStatStyle}>
                    <div style={sideStatLabelStyle}>Ostatak kod punjenja</div>
                    <div style={sideStatValueStyle}>
                      {toNumber(kolicinaLitara) > 0 && toNumber(volumenBoce) > 0
                        ? `${formatBroj(ostatakLitaraPunjenje, 3)} L`
                        : "—"}
                    </div>
                  </div>

                  <div style={previewNoteStyle}>
                    {autoBrojBoca > 0
                      ? `Napunjeno ${formatBroj(autoBrojBoca, 0)} boca od ${formatBroj(
                          toNumber(volumenBoce)
                        )} L`
                      : "Upiši količinu vina i volumen boce."}
                  </div>
                </>
              ) : (
                <div style={previewNoteStyle}>
                  {toNumber(kolicinaLitara) > 0
                    ? `Prodano rinfuza ${formatBroj(toNumber(kolicinaLitara))} L`
                    : "Upiši količinu za rinfuza prodaju."}
                </div>
              )}

              {odabraniTank &&
              toNumber(kolicinaLitara) > 0 &&
              ostajeUTanku <= 0 ? (
                <div style={archiveNoticeStyle}>
                  Tank će nakon spremanja ostati prazan i automatski će se
                  arhivirati.
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <section style={cardStyle}>
          <div style={cardTitleStyle}>Zadnji izlazi vina</div>

          <div
            style={{
              ...filterGridStyle,
              gridTemplateColumns: isMobile
                ? "minmax(0, 1fr)"
                : "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Filter tip</label>
              <select
                value={filterTip}
                onChange={(e) => setFilterTip(e.target.value)}
                style={inputStyle}
              >
                <option value="">Sve</option>
                <option value="PRODAJA">Prodaja</option>
                <option value="PUNJENJE">Punjenje</option>
              </select>
            </div>

            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Filter tank</label>
              <select
                value={filterTankId}
                onChange={(e) => setFilterTankId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Svi tankovi</option>
                {tankovi.map((t) => (
                  <option key={t.tankId} value={t.tankId}>
                    Tank {t.brojTanka}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={summaryStripWrapStyle}>
            <div style={summaryBadgeStyle}>
              Prikazano zapisa: <strong>{zadnjihDesetIzlaza.length}</strong>
            </div>
            <div style={summaryBadgeStyle}>
              Ukupno nakon filtera:{" "}
              <strong>
                {formatBroj(
                  filtriraniIzlazi.reduce(
                    (sum, row) => sum + Number(row.kolicinaLitara || 0),
                    0
                  ),
                  0
                )}{" "}
                L
              </strong>
            </div>
          </div>

          {loading ? (
            <div style={emptyStyle}>Učitavanje...</div>
          ) : zadnjihDesetIzlaza.length === 0 ? (
            <div style={emptyStyle}>Nema zapisa.</div>
          ) : isMobile ? (
            <div style={mobileListWrapStyle}>
              {zadnjihDesetIzlaza.map((row) => (
                <div key={row.id} style={mobileCardStyle}>
                  <div style={mobileCardTopStyle}>
                    <div style={mobileCardTitleStyle}>
                      Tank {row.tank?.broj ?? "—"}
                    </div>

                    <div style={pillWrapStyle}>
                      <span
                        style={{
                          ...pillStyle,
                          background:
                            row.tip === "PRODAJA" ? "#fff5f5" : "#f4f8ff",
                          color:
                            row.tip === "PRODAJA" ? "#991b1b" : "#1d4ed8",
                          border:
                            row.tip === "PRODAJA"
                              ? "1px solid #fecaca"
                              : "1px solid #bfdbfe",
                        }}
                      >
                        {tipLabel(row.tip)}
                      </span>

                      {jeArhiviraniIzlaz(row.napomena) ? (
                        <span
                          style={{
                            ...pillStyle,
                            background: "#ecfdf5",
                            color: "#166534",
                            border: "1px solid #bbf7d0",
                          }}
                        >
                          ARHIVIRANO
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={mobileSubStyle}>
                    {row.tank?.nazivVina || row.tank?.sorta || "—"}
                    {row.tank?.godiste ? ` • ${row.tank.godiste}` : ""}
                  </div>

                  <div style={mobileStrongValueWrapStyle}>
                    <div style={mobileStrongValueStyle}>
                      {formatBroj(row.kolicinaLitara, 0)} L
                    </div>
                    <div style={mobileStrongLabelStyle}>Količina izlaza</div>
                  </div>

                  <div style={mobileRowStyle}>
                    <span style={mobileLabelStyle}>Datum</span>
                    <span style={mobileValueStyle}>{formatDatum(row.datum)}</span>
                  </div>

                  <div style={mobileRowStyle}>
                    <span style={mobileLabelStyle}>Broj boca</span>
                    <span style={mobileValueStyle}>
                      {row.brojBoca != null ? formatBroj(row.brojBoca, 0) : "—"}
                    </span>
                  </div>

                  <div style={mobileRowStyle}>
                    <span style={mobileLabelStyle}>Volumen boce</span>
                    <span style={mobileValueStyle}>
                      {row.volumenBoce != null
                        ? `${formatBroj(row.volumenBoce)} L`
                        : "—"}
                    </span>
                  </div>

                  <div style={mobileRowStyle}>
                    <span style={mobileLabelStyle}>Napomena</span>
                    <span style={mobileValueStyle}>{row.napomena || "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={desktopCardsWrapStyle}>
              {zadnjihDesetIzlaza.map((row) => (
                <div key={row.id} style={desktopExitCardStyle}>
                  <div style={desktopExitTopStyle}>
                    <div>
                      <div style={desktopExitTankStyle}>
                        Tank {row.tank?.broj ?? "—"}
                      </div>
                      <div style={desktopExitWineStyle}>
                        {row.tank?.nazivVina || row.tank?.sorta || "—"}
                        {row.tank?.godiste ? ` • ${row.tank.godiste}` : ""}
                      </div>
                    </div>

                    <div style={pillWrapStyle}>
                      <span
                        style={{
                          ...pillStyle,
                          background:
                            row.tip === "PRODAJA" ? "#fff5f5" : "#f4f8ff",
                          color:
                            row.tip === "PRODAJA" ? "#991b1b" : "#1d4ed8",
                          border:
                            row.tip === "PRODAJA"
                              ? "1px solid #fecaca"
                              : "1px solid #bfdbfe",
                        }}
                      >
                        {tipLabel(row.tip)}
                      </span>

                      {jeArhiviraniIzlaz(row.napomena) ? (
                        <span
                          style={{
                            ...pillStyle,
                            background: "#ecfdf5",
                            color: "#166534",
                            border: "1px solid #bbf7d0",
                          }}
                        >
                          ARHIVIRANO
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={desktopExitLitersStyle}>
                    {formatBroj(row.kolicinaLitara, 0)} L
                  </div>

                  <div style={desktopExitGridStyle}>
                    <div style={desktopMiniInfoStyle}>
                      <div style={desktopMiniLabelStyle}>Datum</div>
                      <div style={desktopMiniValueStyle}>
                        {formatDatum(row.datum)}
                      </div>
                    </div>

                    <div style={desktopMiniInfoStyle}>
                      <div style={desktopMiniLabelStyle}>Broj boca</div>
                      <div style={desktopMiniValueStyle}>
                        {row.brojBoca != null ? formatBroj(row.brojBoca, 0) : "—"}
                      </div>
                    </div>

                    <div style={desktopMiniInfoStyle}>
                      <div style={desktopMiniLabelStyle}>Volumen boce</div>
                      <div style={desktopMiniValueStyle}>
                        {row.volumenBoce != null
                          ? `${formatBroj(row.volumenBoce)} L`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div style={desktopExitNoteStyle}>
                    <strong>Napomena:</strong> {row.napomena || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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
  lineHeight: 1.45,
};

const backButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 12px",
  background: "#ffffff",
  border: "1px solid #d1d5db",
  color: "#44403c",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 700,
};

const topSectionStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
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

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  padding: 12,
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  padding: 12,
  borderBottom: "1px solid #f1f5f9",
};

const fieldWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 10px",
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
  color: "#2f2f2f",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 90,
  resize: "vertical",
};

const infoStripStyle: React.CSSProperties = {
  margin: "0 12px 12px 12px",
  padding: "10px 12px",
  background: "#fcfcfc",
  border: "1px solid #ececec",
  fontSize: 13,
  color: "#44403c",
};

const actionsStyle: React.CSSProperties = {
  padding: "0 12px 12px 12px",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "12px 14px",
  background: "#7f1d1d",
  color: "#ffffff",
  border: "1px solid #7f1d1d",
  fontSize: 14,
  fontWeight: 700,
};

const successStyle: React.CSSProperties = {
  margin: "0 12px 12px 12px",
  padding: "10px 12px",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  fontSize: 13,
};

const warningStyle: React.CSSProperties = {
  margin: "0 12px 12px 12px",
  padding: "10px 12px",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  color: "#92400e",
  fontSize: 13,
};

const errorStyle: React.CSSProperties = {
  margin: "0 12px 12px 12px",
  padding: "10px 12px",
  background: "#fff7ed",
  border: "1px solid #fdba74",
  color: "#9a3412",
  fontSize: 13,
};

const sideCardBodyStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
};

const sideStatStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#fcfcfc",
  padding: "10px 12px",
};

const sideStatStrongStyle: React.CSSProperties = {
  border: "1px solid rgba(127,29,29,0.25)",
  background: "#fffafa",
  padding: "12px 12px",
};

const sideStatLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: 0.2,
  fontWeight: 700,
};

const sideStatLabelStrongStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7f1d1d",
  textTransform: "uppercase",
  letterSpacing: 0.2,
  fontWeight: 800,
};

const sideStatValueStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 16,
  fontWeight: 700,
  color: "#2f2f2f",
  wordBreak: "break-word",
};

const sideStatValueStrongStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 28,
  fontWeight: 800,
  color: "#7f1d1d",
};

const previewNoteStyle: React.CSSProperties = {
  padding: "12px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  fontSize: 14,
  color: "#334155",
  fontWeight: 700,
  lineHeight: 1.45,
};

const archiveNoticeStyle: React.CSSProperties = {
  padding: "12px",
  background: "#fff7ed",
  border: "1px solid #fdba74",
  color: "#9a3412",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.45,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const pillWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const emptyStyle: React.CSSProperties = {
  padding: 12,
  color: "#6b7280",
  fontSize: 13,
};

const summaryStripWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  padding: "0 12px 12px 12px",
  borderBottom: "1px solid #f1f5f9",
};

const summaryBadgeStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#fafafa",
  border: "1px solid #e5e7eb",
  fontSize: 12,
  color: "#44403c",
};

const mobileListWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
};

const mobileCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  padding: 12,
  display: "grid",
  gap: 8,
};

const mobileCardTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
};

const mobileCardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#2f2f2f",
};

const mobileSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  lineHeight: 1.4,
};

const mobileStrongValueWrapStyle: React.CSSProperties = {
  border: "1px solid rgba(127,29,29,0.18)",
  background: "#fffafa",
  padding: 10,
  display: "grid",
  gap: 4,
};

const mobileStrongValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  color: "#7f1d1d",
  lineHeight: 1,
};

const mobileStrongLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7f1d1d",
  textTransform: "uppercase",
  fontWeight: 700,
};

const mobileRowStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  paddingTop: 6,
  borderTop: "1px solid #f1f5f9",
};

const mobileLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  textTransform: "uppercase",
  fontWeight: 700,
};

const mobileValueStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#2f2f2f",
  fontWeight: 600,
  lineHeight: 1.4,
};

const desktopCardsWrapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  padding: 12,
};

const desktopExitCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  padding: 14,
  display: "grid",
  gap: 10,
};

const desktopExitTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
};

const desktopExitTankStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#2f2f2f",
};

const desktopExitWineStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#6b7280",
  lineHeight: 1.4,
};

const desktopExitLitersStyle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
  color: "#7f1d1d",
  lineHeight: 1,
};

const desktopExitGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const desktopMiniInfoStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#fcfcfc",
  padding: 10,
  display: "grid",
  gap: 4,
};

const desktopMiniLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  textTransform: "uppercase",
  fontWeight: 700,
};

const desktopMiniValueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#2f2f2f",
  fontWeight: 700,
  lineHeight: 1.4,
};

const desktopExitNoteStyle: React.CSSProperties = {
  borderTop: "1px solid #f1f5f9",
  paddingTop: 10,
  fontSize: 13,
  color: "#44403c",
  lineHeight: 1.5,
};