"use client";

import { useEffect, useMemo, useState } from "react";

type KorekcijaTipApi =
  | "SLOBODNI_SO2"
  | "SECER"
  | "UKUPNE_KISELINE"
  | "PH"
  | "ALKOHOL";

type VrstaKorekcijeUi =
  | "slobodniSO2"
  | "ukupniSO2"
  | "ukupneKiseline"
  | "ph"
  | "alkohol"
  | "secer";

type TankInfo = {
  id: string;
  broj: number;
  tip: string | null;
  kolicinaVinaUTanku?: number | null;
};

type Mjerenje = {
  alkohol?: number | null;
  ukupneKiseline?: number | null;
  hlapiveKiseline?: number | null;
  slobodniSO2?: number | null;
  ukupniSO2?: number | null;
  secer?: number | null;
  ph?: number | null;
  temperatura?: number | null;
};

type Preparat = {
  id: string;
  naziv: string;
  opis?: string | null;
  strucnoIme?: string | null;

  dozaOd?: number | null;
  dozaDo?: number | null;
  unitId?: string | null;

  isKorekcijski?: boolean;
  korekcijaTip?: KorekcijaTipApi | null;
  korekcijaJedinica?: string | null;
  ucinakPoJedinici?: number | null;

  referentnaKolicina?: number | null;
  referentnaKolicinaJedinica?: string | null;
  referentniVolumen?: number | null;
  referentniVolumenJedinica?: string | null;
  povecanjeParametra?: number | null;

  unit?: {
    id: string;
    naziv: string;
  } | null;
};

type Props = {
  otvoren: boolean;
  onClose: () => void;
  tank: TankInfo | null;
  zadnjeMjerenje: Mjerenje | null;
  preparati: Preparat[];
  onSaved?: () => void;
};

const LABELS: Record<VrstaKorekcijeUi, string> = {
  slobodniSO2: "Slobodni SO2",
  ukupniSO2: "Ukupni SO2",
  ukupneKiseline: "Ukupne kiseline",
  ph: "pH",
  alkohol: "Alkohol",
  secer: "Šećer",
};

const JEDINICE: Record<VrstaKorekcijeUi, string> = {
  slobodniSO2: "mg/L",
  ukupniSO2: "mg/L",
  ukupneKiseline: "g/L",
  ph: "pH",
  alkohol: "% vol",
  secer: "g/L",
};

function mapUiToApi(vrsta: VrstaKorekcijeUi): KorekcijaTipApi | null {
  if (vrsta === "slobodniSO2") return "SLOBODNI_SO2";
  if (vrsta === "ukupneKiseline") return "UKUPNE_KISELINE";
  if (vrsta === "ph") return "PH";
  if (vrsta === "alkohol") return "ALKOHOL";
  if (vrsta === "secer") return "SECER";
  return null;
}

function fmt(v: number | null | undefined, dec = 2) {
  if (v == null || Number.isNaN(Number(v))) return "-";
  return Number(v).toFixed(dec);
}

function fmtKolicina(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "-";

  const broj = Number(v);

  if (Number.isInteger(broj)) {
    return broj.toLocaleString("hr-HR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  return broj.toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function volumenULitre(value: number, unit: string | null | undefined) {
  const u = norm(unit);
  if (u === "l") return value;
  if (u === "hl") return value * 100;
  if (u === "ml") return value / 1000;
  if (u === "dl" || u === "dcl") return value / 10;
  return value;
}

function jedinicaJeVolumen(unit: string | null | undefined) {
  const u = norm(unit);
  return ["ml", "dl", "dcl", "l", "hl"].includes(u);
}

function jedinicaJeMasa(unit: string | null | undefined) {
  const u = norm(unit);
  return ["mg", "g", "dkg", "kg"].includes(u);
}

function kolicinaUBaznojJedinici(
  value: number,
  unit: string | null | undefined
): number {
  const u = norm(unit);

  if (jedinicaJeVolumen(u)) {
    if (u === "ml") return value;
    if (u === "dl" || u === "dcl") return value * 100;
    if (u === "l") return value * 1000;
    if (u === "hl") return value * 100000;
  }

  if (jedinicaJeMasa(u)) {
    if (u === "mg") return value;
    if (u === "g") return value * 1000;
    if (u === "dkg") return value * 10000;
    if (u === "kg") return value * 1000000;
  }

  return value;
}

function bazaUPrikaznuJedinicu(
  value: number,
  unit: string | null | undefined
): number {
  const u = norm(unit);

  if (jedinicaJeVolumen(u)) {
    if (u === "ml") return value;
    if (u === "dl" || u === "dcl") return value / 100;
    if (u === "l") return value / 1000;
    if (u === "hl") return value / 100000;
  }

  if (jedinicaJeMasa(u)) {
    if (u === "mg") return value;
    if (u === "g") return value / 1000;
    if (u === "dkg") return value / 10000;
    if (u === "kg") return value / 1000000;
  }

  return value;
}

export default function KorekcijaModal({
  otvoren,
  onClose,
  tank,
  zadnjeMjerenje,
  preparati,
  onSaved,
}: Props) {
  const [vrsta, setVrsta] = useState<VrstaKorekcijeUi>("slobodniSO2");
  const [zeljeno, setZeljeno] = useState("");
  const [preparatId, setPreparatId] = useState("");
  const [spremam, setSpremam] = useState(false);
  const [poruka, setPoruka] = useState("");

  useEffect(() => {
    if (!otvoren) {
      setVrsta("slobodniSO2");
      setZeljeno("");
      setPreparatId("");
      setPoruka("");
      setSpremam(false);
    }
  }, [otvoren]);

  const trenutnoStanje = useMemo(() => {
    if (!zadnjeMjerenje) return null;
    return zadnjeMjerenje[vrsta] ?? null;
  }, [zadnjeMjerenje, vrsta]);

  const jedinicaParametra = JEDINICE[vrsta];
  const tipKorekcijeApi = mapUiToApi(vrsta);

  const filtriraniPreparati = useMemo(() => {
    if (!tipKorekcijeApi) return [];
    return preparati.filter(
      (p) => p.isKorekcijski && p.korekcijaTip === tipKorekcijeApi
    );
  }, [preparati, tipKorekcijeApi]);

  useEffect(() => {
    if (!filtriraniPreparati.some((p) => p.id === preparatId)) {
      setPreparatId(filtriraniPreparati[0]?.id ?? "");
    }
  }, [filtriraniPreparati, preparatId]);

  const odabraniPreparat =
    filtriraniPreparati.find((p) => p.id === preparatId) ?? null;

  const zeljenaVrijednost =
    zeljeno.trim() !== "" && !Number.isNaN(Number(zeljeno))
      ? Number(zeljeno)
      : null;

  const razlika =
    trenutnoStanje != null && zeljenaVrijednost != null
      ? Number((zeljenaVrijednost - trenutnoStanje).toFixed(3))
      : null;

  const jedinicaZaPreparat =
    odabraniPreparat?.unit?.naziv ??
    odabraniPreparat?.referentnaKolicinaJedinica ??
    "";

  const volumenTankaL = Number(tank?.kolicinaVinaUTanku ?? 0);
  const volumenTankaHL = volumenTankaL > 0 ? volumenTankaL / 100 : 0;

  const izracun = useMemo(() => {
    if (!tank?.kolicinaVinaUTanku) return null;
    if (!odabraniPreparat) return null;
    if (razlika == null || razlika <= 0) return null;

    const refKolicina = odabraniPreparat.referentnaKolicina;
    const refVolumen = odabraniPreparat.referentniVolumen;
    const povecanje = odabraniPreparat.povecanjeParametra;

    if (
      refKolicina == null ||
      refVolumen == null ||
      povecanje == null ||
      refKolicina <= 0 ||
      refVolumen <= 0 ||
      povecanje <= 0
    ) {
      return null;
    }

    const refVolumenLit = volumenULitre(
      refVolumen,
      odabraniPreparat.referentniVolumenJedinica
    );

    if (refVolumenLit <= 0) return null;

    const potrebnaKolicinaURefJedinici =
      refKolicina *
      (razlika / povecanje) *
      (Number(tank.kolicinaVinaUTanku) / refVolumenLit);

    const baza = kolicinaUBaznojJedinici(
      potrebnaKolicinaURefJedinici,
      odabraniPreparat.referentnaKolicinaJedinica
    );

    const prikazna = bazaUPrikaznuJedinicu(baza, jedinicaZaPreparat);

    const dozaPoHL =
      volumenTankaHL > 0 ? Number((prikazna / volumenTankaHL).toFixed(3)) : null;

    return {
      uRefJedinici: Number(potrebnaKolicinaURefJedinici.toFixed(3)),
      prikazna: Number(prikazna.toFixed(3)),
      dozaPoHL,
    };
  }, [
    tank?.kolicinaVinaUTanku,
    odabraniPreparat,
    razlika,
    jedinicaZaPreparat,
    volumenTankaHL,
  ]);

  async function spremiKorekciju() {
    if (!tank?.id) {
      setPoruka("Tank nije odabran.");
      return;
    }

    if (!tipKorekcijeApi) {
      setPoruka("Vrsta korekcije nije podržana.");
      return;
    }

    if (trenutnoStanje == null) {
      setPoruka("Za odabrani parametar nema zadnjeg mjerenja.");
      return;
    }

    if (zeljenaVrijednost == null) {
      setPoruka(`Upiši željenu vrijednost u ${jedinicaParametra}.`);
      return;
    }

    if (zeljenaVrijednost <= trenutnoStanje) {
      setPoruka(
        `Željena vrijednost mora biti veća od trenutne vrijednosti u ${jedinicaParametra}.`
      );
      return;
    }

    if (!preparatId) {
      setPoruka("Odaberi preparat.");
      return;
    }

    if (!odabraniPreparat) {
      setPoruka("Preparat nije pronađen.");
      return;
    }

    if (!izracun || izracun.prikazna <= 0) {
      setPoruka("Nije moguće izračunati potrebnu količinu preparata.");
      return;
    }

    setSpremam(true);
    setPoruka("");

    try {
      const korekcijskaJedinica =
        odabraniPreparat?.korekcijaJedinica ?? jedinicaParametra;

      const res = await fetch("/api/zadatak/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tankId: tank.id,
          vrsta: "KOREKCIJA",
          naslov: `Korekcija: ${LABELS[vrsta]}`,
          napomena: `Trenutno: ${fmt(trenutnoStanje, 2)} ${korekcijskaJedinica}, željeno: ${fmt(zeljenaVrijednost, 2)} ${korekcijskaJedinica}, povećanje: ${fmt(razlika, 2)} ${korekcijskaJedinica}, doza: ${fmtKolicina(izracun.dozaPoHL)} ${jedinicaZaPreparat}/hL, dodati: ${fmtKolicina(izracun.prikazna)} ${jedinicaZaPreparat}`,
          tipKorekcije: tipKorekcijeApi,
          trenutnaVrijednost: trenutnoStanje,
          zeljenaVrijednost: zeljenaVrijednost,

          preparatId,
          doza: izracun.dozaPoHL,
          jedinicaId: odabraniPreparat.unitId ?? odabraniPreparat.unit?.id ?? null,
          volumenUTanku: tank.kolicinaVinaUTanku ?? null,
          izracunataKolicina: izracun.prikazna,
          izlaznaJedinicaId:
            odabraniPreparat.unitId ?? odabraniPreparat.unit?.id ?? null,
          izlaznaJedinicaNaziv: jedinicaZaPreparat || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška kod spremanja korekcije.");
        return;
      }

      setPoruka("Korekcija je spremljena.");

      if (onSaved) {
        await onSaved();
      }

      setTimeout(() => {
        onClose();
      }, 300);
    } catch {
      setPoruka("Došlo je do greške kod spremanja.");
    } finally {
      setSpremam(false);
    }
  }

  if (!otvoren || !tank) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(33, 18, 24, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 580,
          background: "#fffdfd",
          border: "1px solid #eadde1",
          borderRadius: 22,
          boxShadow: "0 24px 60px rgba(72, 23, 39, 0.22)",
          padding: 22,
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#4a1f2d",
                marginBottom: 8,
              }}
            >
              Korekcija
            </div>

            <div style={{ color: "#5a2534", fontWeight: 700, fontSize: 15 }}>
              Tank {tank.broj}
            </div>

            <div style={{ color: "#7a5b63", fontSize: 14, marginTop: 4 }}>
              Količina vina: {fmt(tank.kolicinaVinaUTanku, 2)} L
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #dcc9cf",
              background: "#fff",
              color: "#5a2534",
              borderRadius: 10,
              width: 38,
              height: 38,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        <div>
          <label style={labelStyle}>Vrsta korekcije</label>
          <select
            value={vrsta}
            onChange={(e) => setVrsta(e.target.value as VrstaKorekcijeUi)}
            style={inputStyle}
          >
            <option value="slobodniSO2">Slobodni SO2</option>
            <option value="ukupniSO2" disabled>
              Ukupni SO2
            </option>
            <option value="ukupneKiseline">Ukupne kiseline</option>
            <option value="ph">pH</option>
            <option value="alkohol">Alkohol</option>
            <option value="secer">Šećer</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Trenutno stanje iz mjerenja</label>
          <input
            value={`${fmt(trenutnoStanje, 2)} ${jedinicaParametra}`}
            readOnly
            style={{
              ...inputStyle,
              background: "#f8f3f4",
              color: "#5a3d46",
            }}
          />
        </div>

        <div>
          <label style={labelStyle}>Željena vrijednost</label>
          <input
            type="number"
            step="0.01"
            value={zeljeno}
            onChange={(e) => setZeljeno(e.target.value)}
            placeholder={`Upiši željenu vrijednost u ${jedinicaParametra}`}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Preparat</label>
          <select
            value={preparatId}
            onChange={(e) => setPreparatId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Odaberi preparat</option>
            {filtriraniPreparati.map((p) => (
              <option key={p.id} value={p.id}>
                {p.naziv}
              </option>
            ))}
          </select>
        </div>

        {odabraniPreparat && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "#faf4f5",
              border: "1px solid #eadde1",
              color: "#4d343b",
              display: "grid",
              gap: 8,
              fontSize: 14,
            }}
          >
            <div>
              <strong>Formula preparata:</strong>{" "}
              {fmt(odabraniPreparat.referentnaKolicina, 2)}{" "}
              {odabraniPreparat.referentnaKolicinaJedinica ?? jedinicaZaPreparat} na{" "}
              {fmt(odabraniPreparat.referentniVolumen, 2)}{" "}
              {odabraniPreparat.referentniVolumenJedinica ?? "L"} diže za{" "}
              {fmt(odabraniPreparat.povecanjeParametra, 2)}{" "}
              {odabraniPreparat.korekcijaJedinica ?? jedinicaParametra}
            </div>

            <div>
              <strong>Trenutno stanje:</strong> {fmt(trenutnoStanje, 2)}{" "}
              {odabraniPreparat.korekcijaJedinica ?? jedinicaParametra}
            </div>

            <div>
              <strong>Željena vrijednost:</strong> {fmt(zeljenaVrijednost, 2)}{" "}
              {odabraniPreparat.korekcijaJedinica ?? jedinicaParametra}
            </div>

            <div>
              <strong>Potrebno povećanje:</strong> {fmt(razlika, 2)}{" "}
              {odabraniPreparat.korekcijaJedinica ?? jedinicaParametra}
            </div>

            <div>
              <strong>Doza:</strong> {fmtKolicina(izracun?.dozaPoHL)} {jedinicaZaPreparat}/hL
            </div>

            <div>
              <strong>Potrebno dodati:</strong> {fmtKolicina(izracun?.prikazna)}{" "}
              {jedinicaZaPreparat}
              {norm(jedinicaZaPreparat) === "ml" && izracun?.prikazna != null
                ? ` (${fmtKolicina(izracun.prikazna / 1000)} L)`
                : ""}
            </div>
          </div>
        )}

        {poruka ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: poruka.includes("spremljena")
                ? "#eef8f1"
                : "#fff1f1",
              border: poruka.includes("spremljena")
                ? "1px solid #cfe7d5"
                : "1px solid #efc1c1",
              color: poruka.includes("spremljena") ? "#245b39" : "#9f1d1d",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {poruka}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={secondaryButtonStyle}
          >
            Odustani
          </button>

          <button
            type="button"
            onClick={spremiKorekciju}
            disabled={spremam}
            style={{
              ...primaryButtonStyle,
              opacity: spremam ? 0.65 : 1,
              cursor: spremam ? "not-allowed" : "pointer",
            }}
          >
            {spremam ? "Spremam..." : "Spremi"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "7px",
  fontWeight: 700,
  fontSize: "14px",
  color: "#5a2534",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid #d9c3ca",
  borderRadius: "12px",
  background: "#fff",
  color: "#3f2b31",
  outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "11px 16px",
  border: "none",
  borderRadius: "12px",
  fontWeight: 700,
  background: "linear-gradient(135deg, #5b2333 0%, #7a3044 100%)",
  color: "#fff",
  boxShadow: "0 8px 18px rgba(91, 35, 51, 0.22)",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "11px 16px",
  border: "1px solid #dcc9cf",
  borderRadius: "12px",
  fontWeight: 700,
  background: "#fff",
  color: "#5a2534",
  cursor: "pointer",
};