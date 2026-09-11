"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ocisti, usporediSaSastavom } from "@/lib/ime-vina-cisto";

/**
 * OBRAZAC ZA IMENOVANJE VINA (faza 5).
 *
 * Ime se ne daje naslijepo: iznad polja stoji sto KNJIGA kaze da je stvarno u
 * tanku, a dok se tipka deklarirana sorta, nesklad s knjigom se pokazuje po
 * istom pravilu kao na stranici tanka (`usporediSaSastavom`). Nesklad ne
 * zabranjuje upis — cuvée se smije zvati „Cuvée bijeli" — samo se mora vidjeti.
 *
 * Prikazuje se samo L1/L2 i samo kad u tanku ima vina; to odlucuje stranica.
 * Bravu drzi `POST /api/tank/imenuj`.
 */

export type StavkaSastavaZaObrazac = {
  nazivSorte: string;
  litre: number;
  postotak: number;
  nepoznata: boolean;
};

function broj(v: number, decimale: number) {
  return v.toLocaleString("hr-HR", {
    minimumFractionDigits: decimale,
    maximumFractionDigits: decimale,
  });
}

export default function ImenujVino({
  tankId,
  brojTanka,
  naziv,
  deklariranaSorta,
  sastav,
}: {
  tankId: string;
  brojTanka: number;
  naziv: string | null;
  deklariranaSorta: string | null;
  sastav: StavkaSastavaZaObrazac[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [noviNaziv, setNoviNaziv] = useState(naziv ?? "");
  const [novaSorta, setNovaSorta] = useState(deklariranaSorta ?? "");
  const [razlog, setRazlog] = useState("");
  const [loading, setLoading] = useState(false);
  const [greska, setGreska] = useState("");

  const usporedba = usporediSaSastavom(novaSorta, sastav);
  const poznatih = sastav.filter((s) => !s.nepoznata).length;

  const nistaPromijenjeno =
    ocisti(noviNaziv) === ocisti(naziv) &&
    ocisti(novaSorta) === ocisti(deklariranaSorta);
  const praznoOboje = !ocisti(noviNaziv) && !ocisti(novaSorta);
  const mozeSpremiti =
    !loading && !nistaPromijenjeno && !praznoOboje && Boolean(ocisti(razlog));

  function otvori() {
    // Svako otvaranje krece od onoga sto je SADA na ekranu, ne od napola
    // utipkanog prethodnog pokusaja.
    setNoviNaziv(naziv ?? "");
    setNovaSorta(deklariranaSorta ?? "");
    setRazlog("");
    setGreska("");
    setOpen(true);
  }

  async function spremi() {
    if (!mozeSpremiti) return;
    setLoading(true);
    setGreska("");

    try {
      const res = await fetch("/api/tank/imenuj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tankId,
          naziv: noviNaziv,
          deklariranaSorta: novaSorta,
          razlog,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setGreska(data?.error || "Imenovanje nije uspjelo.");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      setGreska("Imenovanje nije uspjelo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button type="button" onClick={otvori} style={gumbOtvoriStyle}>
          {naziv ? "Promijeni ime vina" : "Imenuj vino"}
        </button>
      </div>

      {open ? (
        <div onClick={() => (loading ? null : setOpen(false))} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={prozorStyle}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, color: "#111827" }}>
                Ime vina — tank {brojTanka}
              </h2>
              <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
                Upisuje se kao čin imenovanja: tko, kada i zašto.
              </div>
            </div>

            {/* STO JE STVARNO U TANKU — prije polja, da se ne imenuje naslijepo. */}
            <div style={okvirKnjigeStyle}>
              <div style={naslovOkviraStyle}>Knjiga kaže da je u tanku</div>

              {sastav.length === 0 ? (
                <div style={prigusenoStyle}>
                  Knjiga za ovaj tank ne zna nijednu berbu.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 4 }}>
                  {sastav.map((s) => (
                    <div key={s.nazivSorte} style={redakSastavaStyle}>
                      <span
                        style={{
                          minWidth: 0,
                          overflowWrap: "anywhere",
                          color: s.nepoznata ? "#6b7280" : "#111827",
                          fontWeight: s.nepoznata ? 400 : 600,
                        }}
                      >
                        {s.nazivSorte}
                      </span>
                      <span style={{ whiteSpace: "nowrap", color: "#374151" }}>
                        <span style={{ color: "#6b7280", marginRight: 8 }}>
                          {broj(s.litre, 0)} L
                        </span>
                        {broj(s.postotak, 1)} %
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label style={poljeStyle}>
              <span style={oznakaStyle}>Naziv vina</span>
              <input
                value={noviNaziv}
                onChange={(e) => setNoviNaziv(e.target.value)}
                placeholder="npr. Graševina 2025"
                style={unosStyle}
                disabled={loading}
              />
            </label>

            <label style={poljeStyle}>
              <span style={oznakaStyle}>Deklarirana sorta (etiketa)</span>
              <input
                value={novaSorta}
                onChange={(e) => setNovaSorta(e.target.value)}
                placeholder="npr. Graševina"
                style={unosStyle}
                disabled={loading}
              />
              {/* NESKLAD — isto pravilo kao na stranici tanka. Upozorava, ne brani. */}
              {usporedba.razilazi && usporedba.deklarirana && usporedba.glavna ? (
                <span style={neskladStyle}>
                  Deklarirano „{usporedba.deklarirana}”, a knjiga kaže{" "}
                  {usporedba.glavna} {broj(usporedba.glavniPostotak ?? 0, 1)} %.
                </span>
              ) : ocisti(novaSorta) && !usporedba.glavna && poznatih > 1 ? (
                <span style={prigusenoStyle}>
                  Po knjizi je ovo mješavina — deklarirana sorta se ne uspoređuje.
                </span>
              ) : null}
            </label>

            <label style={poljeStyle}>
              <span style={oznakaStyle}>Razlog promjene (obavezno)</span>
              <textarea
                value={razlog}
                onChange={(e) => setRazlog(e.target.value)}
                placeholder="npr. ispravak tipfelera, vino dobilo ime za etiketu"
                rows={2}
                style={{ ...unosStyle, resize: "vertical" }}
                disabled={loading}
              />
            </label>

            {praznoOboje ? (
              <div style={prigusenoStyle}>Upiši naziv vina ili deklariranu sortu.</div>
            ) : nistaPromijenjeno ? (
              <div style={prigusenoStyle}>Naziv i sorta su isti kao sada.</div>
            ) : null}

            {greska ? <div style={greskaStyle}>{greska}</div> : null}

            <div style={gumbiStyle}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                style={gumbSporedniStyle}
              >
                Odustani
              </button>
              <button
                type="button"
                onClick={spremi}
                disabled={!mozeSpremiti}
                style={{
                  ...gumbGlavniStyle,
                  opacity: mozeSpremiti ? 1 : 0.5,
                  cursor: mozeSpremiti ? "pointer" : "default",
                }}
              >
                {loading ? "Spremam..." : "Spremi ime"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const gumbOtvoriStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #d1d5db",
  background: "#fafafa",
  color: "#44403c",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

// Omotac s paddingom, prozor `width: 100%` + `maxWidth`, a visina ogranicena s
// vlastitim klizanjem — inace pri zumu vrh prozora pobjegne iznad ekrana.
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 9999,
};

const prozorStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  padding: 20,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  display: "grid",
  gap: 14,
  boxSizing: "border-box",
};

const okvirKnjigeStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  padding: 12,
  display: "grid",
  gap: 8,
  fontSize: 13,
};

const naslovOkviraStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const redakSastavaStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
};

const poljeStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const oznakaStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const unosStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  fontSize: 15,
  color: "#111827",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const neskladStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#92400e",
};

const prigusenoStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const greskaStyle: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  padding: 10,
  fontSize: 13,
};

const gumbiStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const gumbSporedniStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontWeight: 600,
  cursor: "pointer",
};

const gumbGlavniStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #7f1d1d",
  background: "#7f1d1d",
  color: "#fff",
  fontWeight: 700,
};
