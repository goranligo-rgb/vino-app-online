"use client";

import { useEffect, useState } from "react";

type Mjerenje = {
  id: string;
  alkohol: number | null;
  ukupneKiseline: number | null;
  hlapiveKiseline: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  secer: number | null;
  ph: number | null;
  temperatura: number | null;
  izmjerenoAt: string;
  napomena: string | null;
};

type Radnja = {
  id: string;
  vrsta: string;
  naslov: string | null;
  napomena: string | null;
  doza: number | null;
  izracunataKolicina: number | null;
  updatedAt: string;
  preparat?: {
    naziv: string;
  } | null;
  jedinica?: {
    naziv: string;
    oznaka?: string | null;
  } | null;
  izlaznaJedinica?: {
    naziv: string;
    oznaka?: string | null;
  } | null;
  izvrsioKorisnik?: {
    ime: string | null;
    email: string | null;
  } | null;
  zadaoKorisnik?: {
    ime: string | null;
    email: string | null;
  } | null;
};

function formatDatum(datum: string) {
  return new Date(datum).toLocaleString("hr-HR");
}

function prikaziBroj(v: number | null) {
  if (v == null) return "-";
  return Number(v).toLocaleString("hr-HR", {
    maximumFractionDigits: 2,
  });
}

export default function PovijestVina({ tankId }: { tankId: string }) {
  const [mjerenja, setMjerenja] = useState<Mjerenje[]>([]);
  const [radnje, setRadnje] = useState<Radnja[]>([]);
  const [loading, setLoading] = useState(true);
  const [greska, setGreska] = useState("");

  useEffect(() => {
    async function ucitaj() {
      try {
        setLoading(true);
        setGreska("");

        const res = await fetch(`/api/tank/${tankId}/povijest`, {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Greška kod učitavanja");
        }

        setMjerenja(Array.isArray(data.mjerenja) ? data.mjerenja : []);
        setRadnje(Array.isArray(data.radnje) ? data.radnje : []);
      } catch (err) {
        const poruka =
          err instanceof Error ? err.message : "Greška kod učitavanja";
        setGreska(poruka);
      } finally {
        setLoading(false);
      }
    }

    ucitaj();
  }, [tankId]);

  if (loading) {
    return (
      <div
        style={{
          marginTop: 24,
          padding: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        Učitavanje povijesti vina...
      </div>
    );
  }

  if (greska) {
    return (
      <div
        style={{
          marginTop: 24,
          padding: 16,
          border: "1px solid #fecaca",
          borderRadius: 12,
          background: "#fef2f2",
          color: "#991b1b",
        }}
      >
        {greska}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24, display: "grid", gap: 24 }}>
      <div
        style={{
          padding: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          🍷 Sva mjerenja
        </h2>

        {mjerenja.length === 0 ? (
          <div style={{ color: "#6b7280" }}>Nema mjerenja.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {mjerenja.map((m) => (
              <div
                key={m.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 14,
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    marginBottom: 10,
                  }}
                >
                  {formatDatum(m.izmjerenoAt)}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: 8,
                    fontSize: 14,
                  }}
                >
                  <div>
                    <strong>Alkohol:</strong> {prikaziBroj(m.alkohol)}
                  </div>
                  <div>
                    <strong>Ukupne kiseline:</strong>{" "}
                    {prikaziBroj(m.ukupneKiseline)}
                  </div>
                  <div>
                    <strong>Hlapive kiseline:</strong>{" "}
                    {prikaziBroj(m.hlapiveKiseline)}
                  </div>
                  <div>
                    <strong>Slobodni SO2:</strong>{" "}
                    {prikaziBroj(m.slobodniSO2)}
                  </div>
                  <div>
                    <strong>Ukupni SO2:</strong> {prikaziBroj(m.ukupniSO2)}
                  </div>
                  <div>
                    <strong>Šećer:</strong> {prikaziBroj(m.secer)}
                  </div>
                  <div>
                    <strong>pH:</strong> {prikaziBroj(m.ph)}
                  </div>
                  <div>
                    <strong>Temperatura:</strong> {prikaziBroj(m.temperatura)}
                  </div>
                </div>

                {m.napomena ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      borderRadius: 8,
                      background: "#f3f4f6",
                      fontSize: 14,
                    }}
                  >
                    <strong>Napomena:</strong> {m.napomena}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          padding: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          🔧 Sve radnje
        </h2>

        {radnje.length === 0 ? (
          <div style={{ color: "#6b7280" }}>Nema izvršenih radnji.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {radnje.map((r) => (
              <div
                key={r.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 14,
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {r.naslov || "Radnja"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {r.vrsta}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    {formatDatum(r.updatedAt)}
                  </div>
                </div>

                {r.preparat ? (
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    <strong>Preparat:</strong> {r.preparat.naziv}
                  </div>
                ) : null}

                {r.doza != null ? (
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    <strong>Doza:</strong> {prikaziBroj(r.doza)}{" "}
                    {r.jedinica?.oznaka || r.jedinica?.naziv || ""}
                  </div>
                ) : null}

                {r.izracunataKolicina != null ? (
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    <strong>Ukupno dodano:</strong>{" "}
                    {prikaziBroj(r.izracunataKolicina)}{" "}
                    {r.izlaznaJedinica?.oznaka ||
                      r.izlaznaJedinica?.naziv ||
                      ""}
                  </div>
                ) : null}

                {r.napomena ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 8,
                      background: "#f3f4f6",
                      fontSize: 14,
                    }}
                  >
                    <strong>Napomena:</strong> {r.napomena}
                  </div>
                ) : null}

                {(r.izvrsioKorisnik || r.zadaoKorisnik) ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: "#6b7280",
                    }}
                  >
                    <strong>Izvršio:</strong>{" "}
                    {r.izvrsioKorisnik?.ime ||
                      r.izvrsioKorisnik?.email ||
                      r.zadaoKorisnik?.ime ||
                      r.zadaoKorisnik?.email ||
                      "-"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}