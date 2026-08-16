"use client";

import { useState, useTransition } from "react";
import {
  izracunajStatus,
  stilZaStatus,
  formatTemp,
  prijeKoliko,
} from "@/lib/temperatura";
import {
  KORAK,
  KORAK_ZA,
  LIMITI,
  stegni,
  SOFT_OFF_TEMP,
  OPIS_TIPA,
  JEDINICA_TIPA,
  type KomandaTip,
} from "@/lib/tank-komanda";
import { posaljiKomandu } from "./actions";

export type KomandaStanje = { status: string; greska: string | null } | null;

export type TankTile = {
  id: string;
  broj: number;
  sorta: string | null;
  nazivVina: string | null;
  zadnjaTemp: number | null;
  zadanaTemp: number | null;
  // Soft-OFF: zadanaTemp = SOFT_OFF_TEMP znaci "hladjenje iskljuceno", a
  // zadnjaZadanaTemp je vrijednost koja se vraca kad se opet ukljuci.
  zadnjaZadanaTemp: number | null;
  hladjenjeIskljuceno: boolean;
  alarmMinus: number | null;
  alarmPlus: number | null;
  hy: number | null;
  hladjenjeAktivno: boolean | null;
  mjerenoU: string | null;
  imaAktivanAlarm: boolean;
  komande: Partial<Record<KomandaTip, KomandaStanje>>;
};

function fmt(v: number | null): string {
  return formatTemp(v);
}

function StatusBadge({ komanda }: { komanda: KomandaStanje }) {
  if (!komanda) return null;
  const map: Record<string, { label: string; bg: string; border: string; text: string }> = {
    NA_CEKANJU: { label: "na čekanju", bg: "#fff8e1", border: "#e6c65c", text: "#8a6d00" },
    PRIMIJENJENO: { label: "primijenjeno", bg: "#eef7f0", border: "#8db79a", text: "#2f6b43" },
    NEUSPJELO: { label: "neuspjelo", bg: "#fdecec", border: "#e0776f", text: "#a11d1d" },
  };
  const s = map[komanda.status] ?? map.NA_CEKANJU;
  return (
    <span
      title={komanda.greska ?? undefined}
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 0,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
      {komanda.status === "NEUSPJELO" && komanda.greska ? ` · ${komanda.greska}` : ""}
    </span>
  );
}

function Stepper({
  vrijednost,
  min,
  max,
  onChange,
  disabled,
  korak = KORAK,
}: {
  vrijednost: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled: boolean;
  korak?: number;
}) {
  const btn: React.CSSProperties = {
    minWidth: 40,
    minHeight: 40,
    fontSize: 20,
    fontWeight: 700,
    border: "1px solid #cfcfcf",
    background: "#ffffff",
    borderRadius: 0,
    cursor: disabled ? "not-allowed" : "pointer",
    lineHeight: 1,
    touchAction: "manipulation",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
      <button
        type="button"
        style={btn}
        disabled={disabled || vrijednost <= min}
        onClick={() => onChange(Math.max(min, Math.round((vrijednost - korak) * 10) / 10))}
        aria-label="Smanji"
      >
        −
      </button>
      <span style={{ minWidth: 44, textAlign: "center", fontSize: 18, fontWeight: 700 }}>
        {fmt(vrijednost)}
      </span>
      <button
        type="button"
        style={btn}
        disabled={disabled || vrijednost >= max}
        onClick={() => onChange(Math.min(max, Math.round((vrijednost + korak) * 10) / 10))}
        aria-label="Povećaj"
      >
        +
      </button>
    </div>
  );
}

export default function TankKontrole({
  tank,
  smijeUpravljati,
}: {
  tank: TankTile;
  smijeUpravljati: boolean;
}) {
  const iskljuceno = tank.hladjenjeIskljuceno;
  // Dok je hladjenje iskljuceno, zadanaTemp je 20,0 (oznaka iskljucenja) - stepper
  // zato radi sa zapamcenom vrijednoscu, onom koja se vraca kod ukljucivanja.
  const zadanaZaPrikaz = iskljuceno ? tank.zadnjaZadanaTemp : tank.zadanaTemp;

  const [zadana, setZadana] = useState<number>(zadanaZaPrikaz ?? 12);
  const [aMinus, setAMinus] = useState<number>(tank.alarmMinus ?? 2);
  const [aPlus, setAPlus] = useState<number>(tank.alarmPlus ?? 2);
  const [hy, setHy] = useState<number>(tank.hy ?? 2);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const status = izracunajStatus({
    mjerenoU: tank.mjerenoU,
    imaAktivanAlarm: tank.imaAktivanAlarm,
    hladjenjeIskljuceno: iskljuceno,
  });
  const stil = stilZaStatus(status);

  function posalji(tip: KomandaTip, vrijednost: number | null, stara: number | null) {
    let poruka: string;
    if (tip === "HLADJENJE_ON") {
      poruka =
        `Tank ${tank.broj}: uključi hlađenje` +
        (tank.zadnjaZadanaTemp != null ? ` (zadana natrag na ${fmt(tank.zadnjaZadanaTemp)} °C)` : "") +
        "?";
    } else if (tip === "HLADJENJE_OFF") {
      poruka =
        `Tank ${tank.broj}: isključi hlađenje? Zadana se diže na ${fmt(SOFT_OFF_TEMP)} °C, ` +
        `a ${fmt(tank.zadanaTemp)} °C se pamti za ponovno uključivanje.`;
    } else {
      poruka = `Tank ${tank.broj}: ${OPIS_TIPA[tip]} ${fmt(stara)} → ${fmt(vrijednost)} ${JEDINICA_TIPA[tip]}?`;
      if (tip === "ZADANA_TEMP" && iskljuceno) {
        poruka += " Hlađenje je isključeno - spremanjem zadane se ponovno uključuje.";
      }
    }
    if (!window.confirm(poruka)) return;
    setPoruka(null);
    start(async () => {
      const r = await posaljiKomandu({ tankId: tank.id, tip, vrijednost });
      if (!r.ok) setPoruka(r.error ?? "Greška.");
    });
  }

  const promijenjenaZadana = zadana !== (zadanaZaPrikaz ?? 12);
  const promijenjenMinus = aMinus !== (tank.alarmMinus ?? 2);
  const promijenjenPlus = aPlus !== (tank.alarmPlus ?? 2);
  const promijenjenHy = hy !== (tank.hy ?? 2);

  const spremiBtn = (aktivan: boolean): React.CSSProperties => ({
    minHeight: 40,
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 0,
    border: "none",
    cursor: aktivan && !pending ? "pointer" : "not-allowed",
    background: aktivan && !pending ? "#1f6f8b" : "#c7d2d6",
    color: "#ffffff",
    touchAction: "manipulation",
  });

  return (
    <div
      style={{
        background: stil.bg,
        border: `2px solid ${stil.border}`,
        borderRadius: 0,
        padding: 12,
        display: "grid",
        gap: 10,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Zaglavlje pločice (klik na broj -> pregled tanka) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <a
            href={`/tankovi/${tank.id}`}
            style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a", textDecoration: "none" }}
          >
            TANK {tank.broj}
          </a>
          <div
            style={{
              fontSize: 12,
              color: "#555",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tank.nazivVina || tank.sorta || "—"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 9px",
              borderRadius: 0,
              fontSize: 11,
              fontWeight: 700,
              background: "#ffffff",
              border: `1px solid ${stil.border}`,
              color: stil.text,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 0, background: stil.dot }} />
            {stil.label}
          </span>
          <a
            href={`/tankovi/${tank.id}#hladjenje`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 0,
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none",
              background: "#ffffff",
              border: "1px solid #d5d9dd",
              color: "#1f6f8b",
              whiteSpace: "nowrap",
            }}
          >
            Graf →
          </a>
        </div>
      </div>

      {/* Trenutna temperatura (velika) + zadnje očitanje */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: stil.text }}>
          {fmt(tank.zadnjaTemp)}
        </span>
        <span style={{ fontSize: 16, color: "#555" }}>°C</span>
        {iskljuceno ? (
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#3d5566", fontWeight: 700 }}>
            hlađenje isključeno
          </span>
        ) : tank.hladjenjeAktivno ? (
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#1f6f8b", fontWeight: 700 }}>
            ❄ hladi
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 11, color: "#777", marginTop: -4 }}>
        {tank.mjerenoU ? `očitano ${prijeKoliko(tank.mjerenoU)}` : "nema očitanja"}
      </div>

      {/* Zadana temperatura */}
      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          {iskljuceno ? "Zadana (zapamćena)" : "Zadana"}{" "}
          <StatusBadge komanda={tank.komande.ZADANA_TEMP ?? null} />
        </div>
        {smijeUpravljati ? (
          <div style={rowKontroleStyle}>
            <Stepper
              vrijednost={zadana}
              min={LIMITI.ZADANA_TEMP.min}
              max={LIMITI.ZADANA_TEMP.max}
              onChange={setZadana}
              disabled={pending}
            />
            <button
              type="button"
              style={spremiBtn(promijenjenaZadana)}
              disabled={!promijenjenaZadana || pending}
              onClick={() => posalji("ZADANA_TEMP", stegni("ZADANA_TEMP", zadana), zadanaZaPrikaz)}
            >
              Spremi
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(zadanaZaPrikaz)} °C</div>
        )}
        {iskljuceno ? (
          <div style={{ fontSize: 11, color: "#3d5566" }}>
            Hlađenje je isključeno (na kontroleru stoji {fmt(SOFT_OFF_TEMP)} °C).{" "}
            {tank.zadnjaZadanaTemp != null
              ? "Ova vrijednost se vraća pritiskom na UKLJUČI."
              : "Nema zapamćene vrijednosti — upiši zadanu i hlađenje se uključuje s njom."}
          </div>
        ) : null}
      </div>

      {/* Diferencijal (Hy) — koliko temperatura mora prijeci zadanu da hladjenje krene */}
      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          Diferencijal (Hy) <StatusBadge komanda={tank.komande.HY ?? null} />
        </div>
        {smijeUpravljati ? (
          <div style={rowKontroleStyle}>
            <Stepper
              vrijednost={hy}
              min={LIMITI.HY.min}
              max={LIMITI.HY.max}
              korak={KORAK_ZA.HY}
              onChange={setHy}
              disabled={pending}
            />
            <button
              type="button"
              style={spremiBtn(promijenjenHy)}
              disabled={!promijenjenHy || pending}
              onClick={() => posalji("HY", stegni("HY", hy), tank.hy)}
            >
              Spremi
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(tank.hy)} K</div>
        )}
      </div>

      {/* Alarm − / Alarm + */}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}>
        <div style={rowStyle}>
          <div style={rowLabelStyle}>
            Alarm − <StatusBadge komanda={tank.komande.ALARM_MINUS ?? null} />
          </div>
          {smijeUpravljati ? (
            <>
              <Stepper
                vrijednost={aMinus}
                min={LIMITI.ALARM_MINUS.min}
                max={LIMITI.ALARM_MINUS.max}
                onChange={setAMinus}
                disabled={pending}
              />
              <button
                type="button"
                style={spremiBtn(promijenjenMinus)}
                disabled={!promijenjenMinus || pending}
                onClick={() => posalji("ALARM_MINUS", stegni("ALARM_MINUS", aMinus), tank.alarmMinus)}
              >
                Spremi
              </button>
            </>
          ) : (
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(tank.alarmMinus)} °C</div>
          )}
        </div>

        <div style={rowStyle}>
          <div style={rowLabelStyle}>
            Alarm + <StatusBadge komanda={tank.komande.ALARM_PLUS ?? null} />
          </div>
          {smijeUpravljati ? (
            <>
              <Stepper
                vrijednost={aPlus}
                min={LIMITI.ALARM_PLUS.min}
                max={LIMITI.ALARM_PLUS.max}
                onChange={setAPlus}
                disabled={pending}
              />
              <button
                type="button"
                style={spremiBtn(promijenjenPlus)}
                disabled={!promijenjenPlus || pending}
                onClick={() => posalji("ALARM_PLUS", stegni("ALARM_PLUS", aPlus), tank.alarmPlus)}
              >
                Spremi
              </button>
            </>
          ) : (
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(tank.alarmPlus)} °C</div>
          )}
        </div>
      </div>

      {/* Hlađenje ON/OFF (soft-OFF preko zadane temperature) */}
      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          Hlađenje <StatusBadge komanda={tank.komande.HLADJENJE_ON ?? tank.komande.HLADJENJE_OFF ?? null} />
        </div>
        {smijeUpravljati ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => posalji("HLADJENJE_ON", null, null)}
              style={{
                flex: 1,
                minHeight: 42,
                borderRadius: 0,
                fontWeight: 700,
                fontSize: 14,
                cursor: pending ? "not-allowed" : "pointer",
                border: "1px solid #1f6f8b",
                background: iskljuceno ? "#ffffff" : "#1f6f8b",
                color: iskljuceno ? "#1f6f8b" : "#ffffff",
                touchAction: "manipulation",
              }}
            >
              UKLJUČI
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => posalji("HLADJENJE_OFF", null, null)}
              style={{
                flex: 1,
                minHeight: 42,
                borderRadius: 0,
                fontWeight: 700,
                fontSize: 14,
                cursor: pending ? "not-allowed" : "pointer",
                border: "1px solid #999",
                background: iskljuceno ? "#666" : "#ffffff",
                color: iskljuceno ? "#ffffff" : "#666",
                touchAction: "manipulation",
              }}
            >
              ISKLJUČI
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {iskljuceno ? "ISKLJUČENO" : "UKLJUČENO"}
          </div>
        )}
      </div>

      {poruka ? (
        <div style={{ fontSize: 12, color: "#a11d1d", fontWeight: 600 }}>{poruka}</div>
      ) : null}
      {pending ? <div style={{ fontSize: 12, color: "#777" }}>Spremam…</div> : null}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  background: "rgba(255,255,255,0.55)",
  borderRadius: 0,
  padding: 8,
};
const rowLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#444",
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};
const rowKontroleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};
