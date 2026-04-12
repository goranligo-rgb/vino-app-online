"use client";

import { useState } from "react";
import SastavVinaModal from "@/components/SastavVinaModal";

type TankData = {
  tank: {
    id: string;
    broj: number;
    kapacitet: number;
    tip: string | null;
    udjeliSorti?: {
      id: string;
      nazivSorte: string;
      postotak: number;
    }[];
  };
  currentContent: {
    id: string;
    sorta: string;
    kolicina: number;
    datumUlaza: string;
  } | null;
};

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
} | null;

type Radnja = {
  id: string;
  vrsta: string;
  opis: string | null;
  napomena: string | null;
  createdAt: string;
};

type PregledTankaData = {
  tank: {
    id: string;
    broj: number;
    kapacitet: number;
    tip: string | null;
    createdAt?: string;
  } | null;
  zadnjeMjerenje: Mjerenje;
  radnje: Radnja[];
};

export default function SadrzajTankaPage() {
  const [broj, setBroj] = useState("");
  const [sorta, setSorta] = useState("");
  const [kolicina, setKolicina] = useState("");
  const [datumUlaza, setDatumUlaza] = useState("");
  const [poruka, setPoruka] = useState("");
  const [loading, setLoading] = useState(false);
  const [tankData, setTankData] = useState<TankData | null>(null);
  const [pregledTanka, setPregledTanka] = useState<PregledTankaData | null>(null);

  async function pronadiTank() {
    setPoruka("");
    setTankData(null);
    setPregledTanka(null);

    if (!broj.trim()) {
      setPoruka("Upiši broj tanka.");
      return;
    }

    try {
      const res = await fetch(`/api/tank-content?broj=${Number(broj)}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Tank nije pronađen.");
        return;
      }

      setTankData(data);

      if (data.currentContent) {
        setSorta(data.currentContent.sorta ?? "");
        setKolicina(String(data.currentContent.kolicina ?? ""));
        setDatumUlaza(
          data.currentContent.datumUlaza
            ? new Date(data.currentContent.datumUlaza).toISOString().slice(0, 10)
            : ""
        );
      } else {
        setSorta("");
        setKolicina("");
        setDatumUlaza("");
      }

      if (data?.tank?.id) {
        const pregledRes = await fetch(`/api/tank/pregled?id=${data.tank.id}`, {
          cache: "no-store",
        });

        const pregledData = await pregledRes.json();

        if (pregledRes.ok) {
          setPregledTanka(pregledData);
        }
      }
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod dohvaćanja tanka.");
    }
  }

  async function spremi(e: React.FormEvent) {
    e.preventDefault();
    setPoruka("");

    if (!broj.trim() || !sorta.trim() || !kolicina.trim() || !datumUlaza.trim()) {
      setPoruka("Upiši broj tanka, sortu, količinu i datum ulaza.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/tank-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          broj: Number(broj),
          sorta,
          kolicina: Number(kolicina),
          datumUlaza,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Spremanje nije uspjelo.");
        return;
      }

      setPoruka("Sadržaj tanka je spremljen.");
      await pronadiTank();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod spremanja.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "24px", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "24px" }}>
        Sadržaj tanka
      </h1>

      <div
        style={{
          display: "grid",
          gap: "12px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          marginBottom: "20px",
        }}
      >
        <div>
          <label style={{ display: "block", marginBottom: "6px" }}>
            Broj tanka
          </label>
          <input
            type="number"
            value={broj}
            onChange={(e) => setBroj(e.target.value)}
            placeholder="npr. 1"
            style={inputStyle}
          />
        </div>

        <button type="button" onClick={pronadiTank} style={buttonStyle}>
          Pronađi tank
        </button>

        {tankData && (
          <div
            style={{
              padding: "12px",
              borderRadius: "8px",
              background: "#f7f7f7",
              border: "1px solid #e5e5e5",
            }}
          >
            <strong>Tank {tankData.tank.broj}</strong>
            <div>Kapacitet: {tankData.tank.kapacitet} L</div>
            <div>Tip: {tankData.tank.tip ?? "-"}</div>
          </div>
        )}
      </div>

      {pregledTanka && (
        <>
          <section
            style={{
              display: "grid",
              gap: "12px",
              padding: "16px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              marginBottom: "20px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "22px" }}>Trenutno stanje</h2>

            <div>
              <strong>Tank:</strong> {pregledTanka.tank?.broj ?? "-"}
            </div>
            <div>
              <strong>Kapacitet:</strong> {pregledTanka.tank?.kapacitet ?? 0} L
            </div>
            <div>
              <strong>Tip:</strong> {pregledTanka.tank?.tip ?? "-"}
            </div>

            <div>
              <strong>Sorta / vino:</strong> {sorta || "-"}
            </div>
            <div>
              <strong>Količina:</strong> {kolicina || "-"} L
            </div>

            <div style={{ marginTop: "8px" }}>
              <SastavVinaModal udjeli={tankData?.tank?.udjeliSorti ?? []} />
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gap: "12px",
              padding: "16px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              marginBottom: "20px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "22px" }}>Zadnje mjerenje</h2>

            {pregledTanka.zadnjeMjerenje ? (
              <>
                <div>
                  <strong>Datum:</strong>{" "}
                  {new Date(pregledTanka.zadnjeMjerenje.izmjerenoAt).toLocaleString("hr-HR")}
                </div>
                <div>
                  <strong>Alkohol:</strong> {pregledTanka.zadnjeMjerenje.alkohol ?? "-"}
                </div>
                <div>
                  <strong>pH:</strong> {pregledTanka.zadnjeMjerenje.ph ?? "-"}
                </div>
                <div>
                  <strong>Ukupne kiseline:</strong>{" "}
                  {pregledTanka.zadnjeMjerenje.ukupneKiseline ?? "-"}
                </div>
                <div>
                  <strong>Hlapive kiseline:</strong>{" "}
                  {pregledTanka.zadnjeMjerenje.hlapiveKiseline ?? "-"}
                </div>
                <div>
                  <strong>Slobodni SO2:</strong>{" "}
                  {pregledTanka.zadnjeMjerenje.slobodniSO2 ?? "-"}
                </div>
                <div>
                  <strong>Ukupni SO2:</strong>{" "}
                  {pregledTanka.zadnjeMjerenje.ukupniSO2 ?? "-"}
                </div>
                <div>
                  <strong>Šećer:</strong> {pregledTanka.zadnjeMjerenje.secer ?? "-"}
                </div>
                <div>
                  <strong>Temperatura:</strong>{" "}
                  {pregledTanka.zadnjeMjerenje.temperatura ?? "-"}
                </div>
                <div>
                  <strong>Napomena:</strong>{" "}
                  {pregledTanka.zadnjeMjerenje.napomena ?? "-"}
                </div>
              </>
            ) : (
              <div>Nema mjerenja za ovaj tank.</div>
            )}
          </section>

          <section
            style={{
              display: "grid",
              gap: "12px",
              padding: "16px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              marginBottom: "20px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "22px" }}>Zadnje radnje</h2>

            {pregledTanka.radnje.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {pregledTanka.radnje.map((radnja: any) => (
                  <div
                    key={radnja.id}
                    style={{
                      border: "1px solid #e5e5e5",
                      borderRadius: "8px",
                      padding: "12px",
                      background: "#fafafa",
                    }}
                  >
                    <div>
                      <strong>{radnja.vrsta}</strong>
                    </div>

                    <div>Opis: {radnja.opis ?? "-"}</div>

                    <div>Izvršio: {radnja.korisnik?.ime ?? "-"}</div>

                    <div>Preparat: {radnja.preparat?.naziv ?? "-"}</div>

                    <div>
                      Količina:{" "}
                      {radnja.kolicina != null
                        ? `${radnja.kolicina} ${radnja.jedinica?.naziv ?? ""}`
                        : "-"}
                    </div>

                    <div>Napomena: {radnja.napomena ?? "-"}</div>

                    <div>
                      Datum: {new Date(radnja.createdAt).toLocaleString("hr-HR")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>Nema radnji za ovaj tank.</div>
            )}
          </section>
        </>
      )}

      <form
        onSubmit={spremi}
        style={{
          display: "grid",
          gap: "12px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <div>
          <label style={{ display: "block", marginBottom: "6px" }}>
            Sorta / naziv vina
          </label>
          <input
            value={sorta}
            onChange={(e) => setSorta(e.target.value)}
            placeholder="npr. Graševina"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "6px" }}>
            Količina vina
          </label>
          <input
            type="number"
            step="0.01"
            value={kolicina}
            onChange={(e) => setKolicina(e.target.value)}
            placeholder="npr. 4200"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "6px" }}>
            Datum ulaza
          </label>
          <input
            type="date"
            value={datumUlaza}
            onChange={(e) => setDatumUlaza(e.target.value)}
            style={inputStyle}
          />
        </div>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Spremam..." : "Spremi sadržaj"}
        </button>

        {poruka && <p style={{ margin: 0 }}>{poruka}</p>}
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px",
  border: "1px solid #ccc",
  borderRadius: "8px",
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 16px",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: 600,
};