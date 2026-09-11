"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type React from "react";

/**
 * BOCNA TRAKA: BERBE, ne punjenja.
 * ======================================================================
 *
 * Do 11.09.2026. je ovdje stajao popis `PunjenjeTanka` pod naslovom "Zadnja
 * punjenja". Svima je pisalo "Bez naziva" i "Kg: 0", i to nije bio kvar
 * dohvata nego istina o tim retcima: od 16 zivih punjenja njih 13 ima
 * `nazivVina = NULL` i 15 ima `kg = 0`. To su DOLIJEVANJA — sitni unosi u
 * T2/T28/T40 bez imena i bez grozdja.
 *
 * Prave berbe ondje vise nisu. Arhiviranje je punjenja brisalo (do faze F),
 * pa od 22 zapisa berbe njih 19 pokazuje na obrisanu stavku, jedan na zivu, a
 * dva nemaju vezu. Grozdje iz 2026. — Chardonnay 7.754 kg, Veltlinac
 * 14.960 kg — zivi jos samo u `Berba` i u knjizi kretanja.
 *
 * Zato traka cita `/api/berba`. Nije stvar ukusa nego jedinog mjesta gdje
 * podatak jos postoji.
 *
 * GRUPIRANO PO DANU, ne po sorti: berba se pamti po danu ("ono sto smo brali u
 * ponedjeljak") i tako se i trazi. Sorta je filtar iznad popisa.
 *
 * PRAVILO "NE ZBRAJAJ" — isto koje vrijedi za kilograme i za sate branja.
 * Jedna berba zna uci u vise tankova i tada ima VISE zapisa s ISTIM
 * kilogramima: Sauvignon s parcele 13 od 27.08. stoji u tri retka, svaki sa
 * 8.400 kg. Zato se retci najprije skupe u grupu (datum, sorta, parcela), pa
 * je jedna KARTICA jedna berba — kilogrami jednom, litre i tankovi zbrojeni.
 */

type TankUlaz = { tankId: string; broj: number | null; litre: number };

type BerbaZapis = {
  id: string;
  vrstaUnosa: "BERBA" | "ZATECENO";
  nazivSorte: string;
  datumBerbe: string | null;
  datumUlaska: string | null;
  godina: number | null;
  kolicinaLitara: number;
  kolicinaKgGrozdja: number | null;
  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
  secer: number | null;
  tankovi: TankUlaz[];
  vlastitaBerba: boolean | null;
  pocetakBranja: string | null;
  krajBranja: string | null;
  brojBeraca: number | null;
};

/** Jedna berba: svi njezini zapisi skupljeni u jedan. */
type Berba = {
  kljuc: string;
  /** Zapis iz kojeg se citaju opisi; svi u grupi nose iste. */
  glava: BerbaZapis;
  /** Zbroj litara SVIH zapisa grupe — litre se smiju zbrajati. */
  litre: number;
  /** Kilogrami JEDNOM, ne po retku. */
  kg: number | null;
  tankovi: TankUlaz[];
  /** Koliko je zapisa (punjenja) ta berba dala. */
  zapisa: number;
};

type Dan = { dan: string; oznaka: string; berbe: Berba[]; kg: number; litre: number };

const f = (n: number, d = 0) =>
  n.toLocaleString("hr-HR", { minimumFractionDigits: d, maximumFractionDigits: d });

function datumKljuc(b: BerbaZapis): string {
  const iso = b.datumBerbe ?? b.datumUlaska;
  return iso ? iso.slice(0, 10) : "bez-datuma";
}

function hrDatum(dan: string): string {
  if (dan === "bez-datuma") return "Bez datuma berbe";
  const [g, m, d] = dan.split("-");
  return `${d}.${m}.${g}.`;
}

/** Sati cistog branja, ili `null` kad vrijeme nije upisano. */
function satiBranja(b: BerbaZapis): number | null {
  if (!b.pocetakBranja || !b.krajBranja) return null;
  const od = new Date(b.pocetakBranja).getTime();
  const doo = new Date(b.krajBranja).getTime();
  if (!Number.isFinite(od) || !Number.isFinite(doo) || doo <= od) return null;
  return (doo - od) / 3_600_000;
}

function sat(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";
}

export default function BerbeTraka({
  osvjezi = 0,
}: {
  /**
   * Mijenja se nakon svakog spremljenog punjenja i time trazi ponovno
   * citanje. Traka je inace sama svoja — cita jednom pri otvaranju.
   */
  osvjezi?: number;
}) {
  const [zapisi, setZapisi] = useState<BerbaZapis[]>([]);
  const [ucitavam, setUcitavam] = useState(true);
  const [greska, setGreska] = useState<string | null>(null);
  const [sorta, setSorta] = useState("");
  const [saZatecenim, setSaZatecenim] = useState(false);

  useEffect(() => {
    let otkazano = false;

    (async () => {
      try {
        const res = await fetch("/api/berba", { cache: "no-store" });
        const data = await res.json();
        if (otkazano) return;

        if (!res.ok || !data?.ok) {
          setGreska(data?.error ?? "Greška kod dohvaćanja berbi.");
          return;
        }

        setZapisi(Array.isArray(data.berbe) ? data.berbe : []);
      } catch {
        if (!otkazano) setGreska("Greška kod dohvaćanja berbi.");
      } finally {
        if (!otkazano) setUcitavam(false);
      }
    })();

    return () => {
      otkazano = true;
    };
  }, [osvjezi]);

  // Tekuca godina: traka sluzi unosu koji traje sada, a ne pregledu povijesti.
  const godina = new Date().getFullYear();

  const sorte = useMemo(
    () =>
      Array.from(
        new Set(
          zapisi
            .filter((z) => z.vrstaUnosa === "BERBA" && z.godina === godina)
            .map((z) => z.nazivSorte)
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "hr")),
    [zapisi, godina]
  );

  const dani = useMemo<Dan[]>(() => {
    const odabrani = zapisi.filter((z) => {
      if (z.godina !== godina) return false;
      if (!saZatecenim && z.vrstaUnosa !== "BERBA") return false;
      if (sorta && z.nazivSorte !== sorta) return false;
      return true;
    });

    // 1) Skupi zapise iste berbe. Kljuc je (datum, sorta, parcela) — isti po
    //    kojem se ne zbrajaju ni kilogrami ni sati branja.
    const grupe = new Map<string, Berba>();

    for (const z of odabrani) {
      const kljuc = [
        datumKljuc(z),
        z.nazivSorte.trim().toLocaleLowerCase("hr"),
        (z.parcela ?? "").trim().toLocaleLowerCase("hr"),
      ].join("|");

      const prije = grupe.get(kljuc);

      if (!prije) {
        grupe.set(kljuc, {
          kljuc,
          glava: z,
          litre: z.kolicinaLitara,
          kg: z.kolicinaKgGrozdja,
          tankovi: [...z.tankovi],
          zapisa: 1,
        });
        continue;
      }

      prije.litre += z.kolicinaLitara;
      prije.zapisa += 1;
      // Kilogrami se NE zbrajaju: isti broj stoji na svakom zapisu grupe.
      if (prije.kg == null) prije.kg = z.kolicinaKgGrozdja;
      for (const t of z.tankovi) {
        const isti = prije.tankovi.find((x) => x.tankId === t.tankId);
        if (isti) isti.litre += t.litre;
        else prije.tankovi.push({ ...t });
      }
    }

    // 2) Po danima, najnoviji gore.
    const poDanu = new Map<string, Berba[]>();
    for (const b of grupe.values()) {
      const d = datumKljuc(b.glava);
      poDanu.set(d, [...(poDanu.get(d) ?? []), b]);
    }

    return Array.from(poDanu.entries())
      .map(([dan, berbe]) => ({
        dan,
        oznaka: hrDatum(dan),
        berbe: berbe.sort((a, b) => b.litre - a.litre),
        kg: berbe.reduce((z, b) => z + (b.kg ?? 0), 0),
        litre: berbe.reduce((z, b) => z + b.litre, 0),
      }))
      .sort((a, b) => (a.dan < b.dan ? 1 : a.dan > b.dan ? -1 : 0));
  }, [zapisi, godina, sorta, saZatecenim]);

  const ukupnoBerbi = dani.reduce((z, d) => z + d.berbe.length, 0);

  return (
    <>
      <div style={zaglavljeStyle}>
        <div style={naslovStyle}>Berba {godina}</div>
        <div style={podnaslovStyle}>
          {ucitavam
            ? "Učitavanje…"
            : `${ukupnoBerbi} ${ukupnoBerbi === 1 ? "berba" : "berbi"} kroz ${dani.length} ${dani.length === 1 ? "dan" : "dana"}`}
        </div>
      </div>

      <div style={filtriStyle}>
        <select
          value={sorta}
          onChange={(e) => setSorta(e.target.value)}
          style={odabirStyle}
        >
          <option value="">Sve sorte</option>
          {sorte.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* ZATECENO VINO NEMA BERBU — nema datuma, parcele ni kilograma, pa u
            traci nema sto pokazati. Prekidac postoji jer se ta kolicina
            ponekad trazi, ali je iskljucen. */}
        <label style={kvacicaStyle}>
          <input
            type="checkbox"
            checked={saZatecenim}
            onChange={(e) => setSaZatecenim(e.target.checked)}
            style={{ margin: 0, cursor: "pointer" }}
          />
          Prikaži i zatečeno
        </label>
      </div>

      {greska ? (
        <div style={infoStyle}>{greska}</div>
      ) : ucitavam ? (
        <div style={infoStyle}>Učitavanje…</div>
      ) : dani.length === 0 ? (
        <div style={infoStyle}>
          {sorta
            ? `Nema berbi sorte ${sorta} u ${godina}.`
            : `Još nema zapisa berbe za ${godina}.`}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {dani.map((d) => (
            <div key={d.dan}>
              <div style={danZaglavljeStyle}>
                <strong>{d.oznaka}</strong>
                <span>
                  {d.berbe.length} {d.berbe.length === 1 ? "berba" : "berbi"}
                  {d.kg > 0 ? ` · ${f(d.kg)} kg` : ""} · {f(d.litre)} L
                </span>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {d.berbe.map((b) => (
                  <KarticaBerbe key={b.kljuc} b={b} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function KarticaBerbe({ b }: { b: Berba }) {
  const sati = satiBranja(b.glava);
  const beraca = b.glava.brojBeraca ?? 0;
  const brzina =
    sati != null && beraca > 0 && b.kg && b.kg > 0
      ? b.kg / (sati * beraca)
      : null;

  const mjesto = [b.glava.vinograd, b.glava.polozaj]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .join(" · ");

  return (
    <Link
      href={`/berba?sorta=${encodeURIComponent(b.glava.nazivSorte)}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={karticaStyle}>
        <div style={redakGoreStyle}>
          <strong>{b.glava.nazivSorte}</strong>
          {b.glava.oznakaBerbe ? (
            <span style={oznakaStyle}>{b.glava.oznakaBerbe}</span>
          ) : null}
        </div>

        {mjesto ? <div style={sitnoStyle}>{mjesto}</div> : null}

        <div style={brojeviStyle}>
          <span>
            {b.kg && b.kg > 0 ? `${f(b.kg)} kg → ` : ""}
            {f(b.litre)} L
          </span>
          {b.glava.secer != null ? (
            <span style={sitnoStyle}>šećer {f(b.glava.secer, 1)}</span>
          ) : null}
        </div>

        {/* VRIJEME BRANJA. Kad ga nema, kaze se naglas — to je ujedno poziv da
            se dopuni i razlog zasto ta berba ne ulazi u prosjek brzine. */}
        <div style={sati != null ? vrijemeStyle : vrijemePraznoStyle}>
          {sati != null ? (
            <>
              ⏱ {sat(b.glava.pocetakBranja)}–{sat(b.glava.krajBranja)}
              {beraca > 0 ? ` · ${beraca} ${beraca === 1 ? "berač" : "berača"}` : ""}
              {brzina != null ? ` · ${f(brzina, 1)} kg/berač/sat` : ""}
            </>
          ) : (
            "vrijeme branja nije upisano"
          )}
        </div>

        <div style={redakDoljeStyle}>
          <span style={sitnoStyle}>
            {b.tankovi.length === 0
              ? "bez tanka"
              : b.tankovi.length === 1
                ? `Tank ${b.tankovi[0].broj ?? "?"}`
                : `Tankovi ${b.tankovi.map((t) => t.broj ?? "?").join(", ")}`}
            {b.zapisa > 1 ? ` · ${b.zapisa} punjenja` : ""}
          </span>
          {b.glava.vrstaUnosa === "ZATECENO" ? (
            <span style={zatecenoStyle}>zatečeno</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

const zaglavljeStyle: React.CSSProperties = {
  borderBottom: "1px solid #ead7db",
  paddingBottom: 10,
  marginBottom: 12,
};

const naslovStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#7f1d1d",
};

const podnaslovStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#8a6b70",
  marginTop: 2,
};

const filtriStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginBottom: 12,
};

const odabirStyle: React.CSSProperties = {
  border: "1px solid #e3cdd2",
  padding: "6px 8px",
  fontSize: 13,
  background: "#fff",
  width: "100%",
};

const kvacicaStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "#6b7280",
  cursor: "pointer",
  userSelect: "none",
};

const infoStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#8a6b70",
};

const danZaglavljeStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 8,
  flexWrap: "wrap",
  fontSize: 12,
  color: "#7f1d1d",
  marginBottom: 6,
};

const karticaStyle: React.CSSProperties = {
  border: "1px solid #ead7db",
  background: "#fff",
  padding: "8px 10px",
  display: "grid",
  gap: 3,
};

const redakGoreStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 8,
  fontSize: 13,
  color: "#2f2f2f",
};

const oznakaStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  fontVariantNumeric: "tabular-nums",
};

const brojeviStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  color: "#2f2f2f",
};

const sitnoStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  color: "#6b7280",
};

const vrijemeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#166534",
};

const vrijemePraznoStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#9ca3af",
  fontStyle: "italic",
};

const redakDoljeStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "baseline",
};

const zatecenoStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#6b7280",
  border: "1px solid #e5e7eb",
  padding: "1px 4px",
};
