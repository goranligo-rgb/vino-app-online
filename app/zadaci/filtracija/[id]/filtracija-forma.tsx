"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { akuzativVrste, genitivVrste, nazivVrste } from "@/lib/vrste-prijenosa";

/**
 * Forma za IZVRSENJE prijenosa vina: FILTRACIJA, FLOTACIJA ili TALOZENJE.
 *
 * Sve tri su fizicki ista radnja (tekucina iz tanka A u tank B, talog ostaje)
 * pa dijele ovu formu. Ime radnje NIJE ugradjeno u tekst — dolazi iz
 * lib/vrste-prijenosa.ts na temelju zadatak.vrsta.
 *
 * Zadatak se zadaje na /zadaci bez brojki — kad se filtracija planira, litre se
 * jos ne znaju. Ovdje se upisuje STVARNO stanje: koliko je izaslo iz izvornog
 * tanka i u koje je tankove otislo. Server te brojke upisuje natrag u zadatak
 * u istoj transakciji u kojoj pomice vino.
 */

export type TankIzbor = {
  id: string;
  broj: number;
  kapacitet: number;
  kolicinaVinaUTanku: number | null;
  nazivVina: string | null;
  sorta: string | null;
  godiste: number | null;
};

export type ZadatakZaFormu = {
  id: string;
  /** FILTRACIJA | FLOTACIJA | TALOZENJE — odredjuje samo nazivlje u sucelju. */
  vrsta: string;
  /** null = nije se pitalo; false = izricito nije bilo; true = bilo je. */
  maceracija: boolean | null;
  maceracijaOpis: string | null;
  naslov: string | null;
  napomena: string | null;
  zadanoAt: string;
  kolicinaIzlaz: number | null;
  izvorTank: TankIzbor;
  planiraneStavke: Array<{ ciljTankId: string; kolicina: number }>;
};

type PregledCilja = {
  ciljTankId: string;
  brojTanka: number;
  slobodnoLitara: number;
  prazan: boolean;
  drugoVino: boolean;
  upozorenje: string | null;
};

type Red = {
  ciljTankId: string;
  kolicina: string;
  noviNaziv: string;
};

function uMl(litre: number): number {
  return Math.round((Number(litre) || 0) * 1000);
}

function brojIzPolja(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatL(n: number): string {
  return n.toLocaleString("hr-HR", { maximumFractionDigits: 3 });
}

export default function FiltracijaForma({
  zadatak,
  tankovi,
}: {
  zadatak: ZadatakZaFormu;
  tankovi: TankIzbor[];
}) {
  const router = useRouter();

  const uTankuL = Number(zadatak.izvorTank.kolicinaVinaUTanku ?? 0);

  const [kolicinaIzlaz, setKolicinaIzlaz] = useState<string>(
    zadatak.kolicinaIzlaz != null ? String(zadatak.kolicinaIzlaz) : ""
  );

  const [redovi, setRedovi] = useState<Red[]>(
    zadatak.planiraneStavke.length > 0
      ? zadatak.planiraneStavke.map((s) => ({
          ciljTankId: s.ciljTankId,
          kolicina: String(s.kolicina),
          noviNaziv: "",
        }))
      : [{ ciljTankId: "", kolicina: "", noviNaziv: "" }]
  );

  const [pregled, setPregled] = useState<Record<string, PregledCilja>>({});
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  // Ciljni tankovi bez izvornog — vino ne moze ici samo u sebe.
  const moguciCiljevi = useMemo(
    () => tankovi.filter((t) => t.id !== zadatak.izvorTank.id),
    [tankovi, zadatak.izvorTank.id]
  );

  const odabraniIds = useMemo(
    () => redovi.map((r) => r.ciljTankId).filter(Boolean),
    [redovi]
  );

  const kljucOdabranih = odabraniIds.join(",");

  // Upozorenja o zatecenom vinu dolaze sa servera — ista logika koja ce vrijediti
  // i pri izvrsenju, da forma i server ne govore razlicito.
  useEffect(() => {
    if (odabraniIds.length === 0) {
      setPregled({});
      return;
    }

    let otkazano = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/zadatak/filtracija/pregled?izvorTankId=${encodeURIComponent(
            zadatak.izvorTank.id
          )}&ciljTankIds=${encodeURIComponent(odabraniIds.join(","))}`
        );

        if (!res.ok) return;

        const data = await res.json();
        if (otkazano) return;

        const mapa: Record<string, PregledCilja> = {};
        for (const c of data.ciljevi ?? []) mapa[c.ciljTankId] = c;
        setPregled(mapa);
      } catch {
        // Upozorenja su pomoc, ne uvjet — server ionako sve provjerava ponovno.
      }
    })();

    return () => {
      otkazano = true;
    };
  }, [kljucOdabranih, zadatak.izvorTank.id, odabraniIds]);

  const izlazMl = uMl(brojIzPolja(kolicinaIzlaz));
  const zbrojMl = redovi.reduce((s, r) => s + uMl(brojIzPolja(r.kolicina)), 0);
  const kaloMl = izlazMl - zbrojMl;

  const duplikati = odabraniIds.length !== new Set(odabraniIds).size;

  const problemi: string[] = [];

  if (izlazMl <= 0) problemi.push("Upiši koliko je litara izašlo iz tanka.");
  if (izlazMl > uMl(uTankuL))
    problemi.push(
      `U tanku ${zadatak.izvorTank.broj} ima ${formatL(uTankuL)} L, a upisano je ${formatL(brojIzPolja(kolicinaIzlaz))} L.`
    );
  if (redovi.every((r) => !r.ciljTankId))
    problemi.push("Odaberi barem jedan ciljni tank.");
  if (redovi.some((r) => r.ciljTankId && uMl(brojIzPolja(r.kolicina)) <= 0))
    problemi.push("Svaki odabrani tank mora imati količinu veću od 0.");
  if (duplikati) problemi.push("Isti ciljni tank je odabran dvaput.");
  if (kaloMl < 0)
    problemi.push(
      `Zbroj po tankovima (${formatL(zbrojMl / 1000)} L) veći je od izlaza (${formatL(izlazMl / 1000)} L).`
    );

  for (const r of redovi) {
    const p = r.ciljTankId ? pregled[r.ciljTankId] : null;
    if (!p) continue;
    if (uMl(brojIzPolja(r.kolicina)) > uMl(p.slobodnoLitara)) {
      problemi.push(
        `U tank ${p.brojTanka} stane još ${formatL(p.slobodnoLitara)} L.`
      );
    }
  }

  const smijeSlati = problemi.length === 0 && !salje;

  function promijeni(index: number, dio: Partial<Red>) {
    setRedovi((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...dio } : r))
    );
  }

  async function posalji() {
    setGreska(null);
    setSalje(true);

    try {
      const naziviVina: Record<string, string> = {};
      for (const r of redovi) {
        if (r.ciljTankId && r.noviNaziv.trim()) {
          naziviVina[r.ciljTankId] = r.noviNaziv.trim();
        }
      }

      const res = await fetch("/api/zadatak/filtracija/izvrsi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zadatakId: zadatak.id,
          kolicinaIzlaz: brojIzPolja(kolicinaIzlaz),
          stavke: redovi
            .filter((r) => r.ciljTankId)
            .map((r) => ({
              ciljTankId: r.ciljTankId,
              kolicina: brojIzPolja(r.kolicina),
            })),
          naziviVina,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGreska(
          data?.error ?? `Greška kod izvršenja ${genitivVrste(zadatak.vrsta)}.`
        );
        setSalje(false);
        return;
      }

      router.push("/zadaci");
      router.refresh();
    } catch {
      setGreska("Greška u vezi sa serverom. Ništa nije promijenjeno.");
      setSalje(false);
    }
  }

  return (
    <div style={omotStyle}>
      <div style={karticaStyle}>
        <div style={zaglavljeStyle}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {zadatak.naslov?.trim() || nazivVrste(zadatak.vrsta)}
            </div>
            <div style={prigusenoStyle}>
              Tank {zadatak.izvorTank.broj}
              {zadatak.izvorTank.nazivVina
                ? ` — ${zadatak.izvorTank.nazivVina}`
                : zadatak.izvorTank.sorta
                  ? ` — ${zadatak.izvorTank.sorta}`
                  : ""}
              {" · "}u tanku {formatL(uTankuL)} L
            </div>
          </div>
        </div>

        {zadatak.napomena?.trim() && (
          <div style={napomenaStyle}>{zadatak.napomena}</div>
        )}

        {/* Maceracija se prikazuje SAMO ako se o njoj izjasnilo pri zadavanju.
            null (nije se pitalo) ne prikazuje ništa. */}
        {zadatak.maceracija != null && (
          <div style={napomenaStyle}>
            <strong>Maceracija:</strong>{" "}
            {zadatak.maceracija ? "da" : "ne"}
            {zadatak.maceracijaOpis?.trim()
              ? ` — ${zadatak.maceracijaOpis.trim()}`
              : ""}
          </div>
        )}

        <label style={oznakaStyle}>
          Stvarno izašlo iz tanka {zadatak.izvorTank.broj} (L)
        </label>
        <input
          value={kolicinaIzlaz}
          onChange={(e) => setKolicinaIzlaz(e.target.value)}
          inputMode="decimal"
          placeholder="npr. 1940"
          style={poljeStyle}
        />
        <div style={prigusenoStyle}>
          Planirano se i stvarno rijetko poklapaju — upiši ono što je stvarno izašlo.
        </div>

        <div style={{ ...oznakaStyle, marginTop: 20 }}>Kamo je vino otišlo</div>

        {redovi.map((red, index) => {
          const p = red.ciljTankId ? pregled[red.ciljTankId] : null;

          return (
            <div key={index} style={redStyle}>
              <div style={redGornjiStyle}>
                <select
                  value={red.ciljTankId}
                  onChange={(e) =>
                    promijeni(index, { ciljTankId: e.target.value })
                  }
                  style={{ ...poljeStyle, flex: 2 }}
                >
                  <option value="">— odaberi tank —</option>
                  {moguciCiljevi.map((t) => (
                    <option key={t.id} value={t.id}>
                      Tank {t.broj}
                      {t.nazivVina ? ` — ${t.nazivVina}` : t.sorta ? ` — ${t.sorta}` : " — prazan"}
                    </option>
                  ))}
                </select>

                <input
                  value={red.kolicina}
                  onChange={(e) => promijeni(index, { kolicina: e.target.value })}
                  inputMode="decimal"
                  placeholder="litara"
                  style={{ ...poljeStyle, flex: 1 }}
                />

                {redovi.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setRedovi((prev) => prev.filter((_, i) => i !== index))
                    }
                    style={maknuiStyle}
                  >
                    ×
                  </button>
                )}
              </div>

              {p && (
                <div style={prigusenoStyle}>
                  Slobodno: {formatL(p.slobodnoLitara)} L
                  {p.prazan ? " · tank je prazan" : ""}
                </div>
              )}

              {p?.drugoVino && (
                <div style={upozorenjeStyle}>
                  {p.upozorenje}
                  <input
                    value={red.noviNaziv}
                    onChange={(e) =>
                      promijeni(index, { noviNaziv: e.target.value })
                    }
                    placeholder="Novi naziv vina za taj tank (nije obavezno)"
                    style={{ ...poljeStyle, marginTop: 8 }}
                  />
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setRedovi((prev) => [
              ...prev,
              { ciljTankId: "", kolicina: "", noviNaziv: "" },
            ])
          }
          style={dodajStyle}
        >
          + još jedan tank
        </button>

        <div style={zbrojStyle}>
          <div>
            <span style={prigusenoStyle}>Zbroj po tankovima</span>
            <div style={{ fontWeight: 700 }}>{formatL(zbrojMl / 1000)} L</div>
          </div>
          <div>
            <span style={prigusenoStyle}>Kalo (računa server)</span>
            <div style={{ fontWeight: 700, color: kaloMl < 0 ? "#b91c1c" : "#111827" }}>
              {formatL(kaloMl / 1000)} L
            </div>
          </div>
        </div>

        {problemi.length > 0 && (
          <ul style={problemiStyle}>
            {problemi.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}

        {greska && <div style={greskaStyle}>{greska}</div>}

        <div style={gumbiStyle}>
          <button
            type="button"
            onClick={() => router.push("/zadaci")}
            style={odustaniStyle}
          >
            Odustani
          </button>

          <button
            type="button"
            onClick={posalji}
            disabled={!smijeSlati}
            style={{
              ...potvrdiStyle,
              opacity: smijeSlati ? 1 : 0.55,
              cursor: smijeSlati ? "pointer" : "not-allowed",
            }}
          >
            {salje ? "Izvršavam..." : `Izvrši ${akuzativVrste(zadatak.vrsta)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const omotStyle: CSSProperties = {
  padding: 16,
  maxWidth: 720,
  margin: "0 auto",
};

const karticaStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  padding: 20,
  display: "flex",
  flexDirection: "column",
};

const zaglavljeStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 16,
};

const prigusenoStyle: CSSProperties = { fontSize: 13, color: "#6b7280" };

const napomenaStyle: CSSProperties = {
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
  fontSize: 14,
  marginBottom: 16,
};

const oznakaStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 6,
};

const poljeStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 15,
};

const redStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  marginBottom: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const redGornjiStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const maknuiStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 8,
  width: 38,
  height: 38,
  fontSize: 18,
  cursor: "pointer",
};

const upozorenjeStyle: CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  borderRadius: 8,
  padding: 10,
  fontSize: 13,
};

const dodajStyle: CSSProperties = {
  alignSelf: "flex-start",
  background: "#fff",
  border: "1px dashed #9ca3af",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 14,
};

const zbrojStyle: CSSProperties = {
  display: "flex",
  gap: 24,
  marginTop: 18,
  paddingTop: 14,
  borderTop: "1px solid #e5e7eb",
};

const problemiStyle: CSSProperties = {
  marginTop: 14,
  paddingLeft: 20,
  color: "#b45309",
  fontSize: 14,
};

const greskaStyle: CSSProperties = {
  marginTop: 14,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 8,
  padding: 12,
  fontSize: 14,
};

const gumbiStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 20,
  justifyContent: "flex-end",
};

const odustaniStyle: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 15,
};

const potvrdiStyle: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: "#166534",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
};
