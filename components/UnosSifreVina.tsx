"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { SIFARNIK, korijenSifre, rastaviSifru } from "@/lib/sifra-vina";

/**
 * UNOS INTERNE SIFRE VINA — prefiks iz sifarnika, mjesec i godina NASTANKA,
 * broj. Jedna komponenta za sve obrasce koji sifru traze (imenovanje,
 * filtracija u drugo vino; cuvée i punjenje u koraku 4), da pravilo i izgled
 * ne mogu odlutati.
 *
 * Predlaze sljedeci slobodan broj i UPOZORAVA kad sifru vec netko nosi — ne
 * brani: isto vino u dvije posude nosi istu sifru (lib/sifra-vina.ts).
 *
 * Roditelju javlja sifru kakva je utipkana, i nepotpunu; je li ispravna
 * provjerava roditelj s `greskaSifre`, a posluzitelj jos jednom.
 */

const MJESECI = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

type Stanje = {
  sljedeciBroj: number;
  sada: number[];
  ranije: number[];
};

function sastavi(p: string, m: string, g: string, b: string): string | null {
  if (!p && !m && !g && !b) return null;
  return `${p}-${m}${g}-${b}`;
}

export default function UnosSifreVina({
  vrijednost,
  onPromjena,
  tankId,
  zadaniMjesec,
  disabled,
}: {
  vrijednost: string | null;
  onPromjena: (sifra: string | null) => void;
  /** Tank koji se imenuje — njegovo danasnje vino nije „duplikat". */
  tankId?: string | null;
  /**
   * Kad sifra nastaje UZ cin koji stvara vino (cuvée, filtracija u drugo
   * vino, punjenje), mjesec cina je dobar pocetni prijedlog. Kod rucnog
   * imenovanja ga NEMA: zateceno vino je nastalo kad je nastalo, ne danas.
   */
  zadaniMjesec?: Date | null;
  disabled?: boolean;
}) {
  const pocetna = rastaviSifru(vrijednost);
  const [prefiks, setPrefiks] = useState(pocetna?.prefiks ?? "");
  const [mjesec, setMjesec] = useState(
    pocetna?.mjesec ??
      (zadaniMjesec ? String(zadaniMjesec.getMonth() + 1).padStart(2, "0") : "")
  );
  const [godina, setGodina] = useState(
    pocetna?.godina ?? (zadaniMjesec ? String(zadaniMjesec.getFullYear() % 100).padStart(2, "0") : "")
  );
  const [broj, setBroj] = useState(pocetna ? String(pocetna.broj) : "");
  const [stanje, setStanje] = useState<Stanje | null>(null);

  const korijenPotpun = Boolean(prefiks && mjesec && /^\d{2}$/.test(godina));
  const korijen = korijenPotpun ? korijenSifre({ prefiks, mjesec, godina }) : null;
  const sifra = sastavi(prefiks, mjesec, godina, broj);

  function promijeni(p: string, m: string, g: string, b: string) {
    setPrefiks(p);
    setMjesec(m);
    setGodina(g);
    setBroj(b);
    onPromjena(sastavi(p, m, g, b));
  }

  useEffect(() => {
    if (!korijen) {
      setStanje(null);
      return;
    }

    let otkazano = false;
    const q = new URLSearchParams({ korijen });
    if (sifra && /^\d+$/.test(broj)) q.set("sifra", sifra);
    if (tankId) q.set("tankId", tankId);

    (async () => {
      try {
        const res = await fetch(`/api/sifra-vina/slobodna?${q}`);
        if (!res.ok) return;
        const data = (await res.json()) as Stanje;
        if (!otkazano) setStanje(data);
      } catch {
        // Prijedlog je pomoc, ne uvjet: bez njega se sifra i dalje upisuje.
      }
    })();

    return () => {
      otkazano = true;
    };
  }, [korijen, sifra, broj, tankId]);

  const duplikat = stanje && (stanje.sada.length > 0 || stanje.ranije.length > 0);
  const predlozeni = stanje ? String(stanje.sljedeciBroj) : null;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={redakStyle}>
        <select
          value={prefiks}
          onChange={(e) => promijeni(e.target.value, mjesec, godina, broj)}
          disabled={disabled}
          style={{ ...unosStyle, flex: "2 1 160px" }}
          aria-label="Prefiks šifre"
        >
          <option value="">— prefiks —</option>
          {SIFARNIK.map((s) => (
            <option key={s.prefiks} value={s.prefiks}>
              {s.prefiks} · {s.naziv}
            </option>
          ))}
        </select>

        <select
          value={mjesec}
          onChange={(e) => promijeni(prefiks, e.target.value, godina, broj)}
          disabled={disabled}
          style={{ ...unosStyle, flex: "1 1 70px" }}
          aria-label="Mjesec nastanka"
        >
          <option value="">MM</option>
          {MJESECI.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <input
          value={godina}
          onChange={(e) =>
            promijeni(prefiks, mjesec, e.target.value.replace(/\D/g, "").slice(0, 2), broj)
          }
          inputMode="numeric"
          placeholder="GG"
          disabled={disabled}
          style={{ ...unosStyle, flex: "1 1 60px" }}
          aria-label="Godina nastanka (dvije znamenke)"
        />

        <input
          value={broj}
          onChange={(e) =>
            promijeni(prefiks, mjesec, godina, e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          inputMode="numeric"
          placeholder="broj"
          disabled={disabled}
          style={{ ...unosStyle, flex: "1 1 70px" }}
          aria-label="Redni broj"
        />
      </div>

      <div style={prigusenoStyle}>
        Mjesec i godina su mjesec NASTANKA vina, ne današnji.
        {sifra ? (
          <>
            {" "}Šifra: <strong style={{ color: "#111827" }}>{sifra}</strong>
          </>
        ) : null}
      </div>

      {predlozeni && broj !== predlozeni ? (
        <div style={prigusenoStyle}>
          Sljedeći slobodan broj za {korijen}: <strong>{predlozeni}</strong>{" "}
          <button
            type="button"
            onClick={() => promijeni(prefiks, mjesec, godina, predlozeni)}
            disabled={disabled}
            style={gumbMaliStyle}
          >
            uzmi
          </button>
        </div>
      ) : null}

      {duplikat ? (
        <div style={upozorenjeStyle}>
          Šifra {sifra} već postoji —{" "}
          {[
            stanje!.sada.length > 0
              ? `sada u: ${stanje!.sada.map((b) => `T${b}`).join(", ")}`
              : null,
            stanje!.ranije.length > 0
              ? `ranije u: ${stanje!.ranije.map((b) => `T${b}`).join(", ")}`
              : null,
          ]
            .filter(Boolean)
            .join("; ")}
          . Ako je to isto vino (razdvojeno u više posuda), šifra je ispravna;
          inače uzmi sljedeći broj.
        </div>
      ) : null}

      {sifra ? (
        <div>
          <button
            type="button"
            onClick={() => promijeni("", "", "", "")}
            disabled={disabled}
            style={gumbMaliStyle}
          >
            makni šifru
          </button>
        </div>
      ) : null}
    </div>
  );
}

const redakStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const unosStyle: CSSProperties = {
  padding: "10px 8px",
  border: "1px solid #d1d5db",
  fontSize: 15,
  color: "#111827",
  background: "#fff",
  minWidth: 0,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const prigusenoStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const upozorenjeStyle: CSSProperties = {
  fontSize: 12,
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  padding: 8,
};

const gumbMaliStyle: CSSProperties = {
  padding: "2px 8px",
  border: "1px solid #d1d5db",
  background: "#fafafa",
  color: "#44403c",
  fontSize: 12,
  cursor: "pointer",
};
