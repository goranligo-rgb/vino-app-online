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
  jeHladjenjeIskljuceno,
  jeIsteklaKomanda,
  porukaBezOznake,
  OPIS_TIPA,
  JEDINICA_TIPA,
  type KomandaTip,
} from "@/lib/tank-komanda";
import { posaljiKomandu } from "./actions";
import SmsPrekidac from "./sms-prekidac";

export type KomandaStanje = { status: string; greska: string | null } | null;

export type TankTile = {
  id: string;
  broj: number;
  sorta: string | null;
  nazivVina: string | null;
  zadnjaTemp: number | null;
  // Zelja iz baze (upisana kod slanja komande). Moze zaostati za kontrolerom.
  zadanaTemp: number | null;
  // Stvarni set point procitan s kontrolera u zadnjem ocitanju - istina.
  zadanaNaKontroleru: number | null;
  // Soft-OFF: zadanaTemp = SOFT_OFF_TEMP znaci "hladjenje iskljuceno", a
  // zadnjaZadanaTemp je vrijednost koja se vraca kad se opet ukljuci.
  zadnjaZadanaTemp: number | null;
  // Racuna se iz stvarnog set pointa s kontrolera (vidi page.tsx).
  hladjenjeIskljuceno: boolean;
  alarmMinus: number | null;
  alarmPlus: number | null;
  hy: number | null;
  hladjenjeAktivno: boolean | null;
  mjerenoU: string | null;
  imaAktivanAlarm: boolean;
  // Salje li se SMS kad ovaj tank ode u alarm. Ne utjece na sam alarm.
  smsAktivan: boolean;
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
    // Istekla komanda NIJE kvar: gateway je nije izvrsio jer je bila prestara,
    // tank i dalje radi po svom stvarnom stanju. Sivo i tiho - crveno na kartici
    // znaci "korisnik mora nesto poduzeti".
    ISTEKLA: { label: "istekla", bg: "#f1f3f5", border: "#c8ccd0", text: "#5c6469" },
  };
  const s = jeIsteklaKomanda(komanda.status, komanda.greska)
    ? map.ISTEKLA
    : map[komanda.status] ?? map.NA_CEKANJU;
  // Sama znacka je uvijek kratka i u jednom retku; tekst greske ide u zaseban
  // redak ispod (GreskaKomande). Prije je bio zalijepljen ovdje pa je poruka
  // poput "komanda starija od 30 min" razvukla znacku preko ruba kartice.
  return (
    <span
      title={porukaBezOznake(komanda.greska) || undefined}
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 0,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}

/**
 * Objasnjenje uz komandu: crveno samo kad korisnik stvarno mora nesto poduzeti
 * (kontroler odbio upis, nema odgovora), zuto dok komanda jos ceka.
 *
 * Istekla komanda (ograda od 30 min) NEMA redak: ona je mrtva i tank o njoj ne
 * ovisi. Trag ostaje u sivoj znacki "istekla", a cijeli tekst u tooltipu.
 */
function GreskaKomande({ komanda }: { komanda: KomandaStanje }) {
  if (!komanda?.greska) return null;
  if (jeIsteklaKomanda(komanda.status, komanda.greska)) return null;
  const crvena = komanda.status === "NEUSPJELO";
  return (
    <div
      className="hlad-napomena"
      style={{ color: crvena ? "#a11d1d" : "#8a6d00", fontWeight: 600 }}
    >
      {porukaBezOznake(komanda.greska)}
    </div>
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
  // Velicina gumba dolazi iz klase .hlad-korak (na mobitelu 52x48 px, dovoljno
  // za prst); ovdje ostaje samo izgled.
  const btn: React.CSSProperties = {
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
    <div className="hlad-stepper">
      <button
        type="button"
        className="hlad-korak"
        style={btn}
        disabled={disabled || vrijednost <= min}
        onClick={() => onChange(Math.max(min, Math.round((vrijednost - korak) * 10) / 10))}
        aria-label="Smanji"
      >
        −
      </button>
      <span className="hlad-vrijednost">{fmt(vrijednost)}</span>
      <button
        type="button"
        className="hlad-korak"
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
  // Stvarno stanje kontrolera (iz zadnjeg ocitanja), a ne ono sto baza zeli.
  const iskljuceno = tank.hladjenjeIskljuceno;

  // Stepper radi sa zeljom iz BAZE: s tom vrijednoscu racuna i server kod slanja
  // komandi (vidi actions.ts). Dok je u bazi soft-OFF, zadanaTemp je 20,0 (oznaka
  // iskljucenja) pa se koristi zapamcena vrijednost - ona koja se vraca kod
  // ukljucivanja.
  const iskljucenoUBazi = jeHladjenjeIskljuceno(tank.zadanaTemp);
  const zadanaZaPrikaz = iskljucenoUBazi ? tank.zadnjaZadanaTemp : tank.zadanaTemp;

  // Baza i kontroler se razilaze: komanda jos ceka ili je propala. Vrijednost s
  // kontrolera je ono sto se stvarno dogada u podrumu, pa se mora vidjeti.
  const razilaziSe =
    tank.zadanaNaKontroleru != null &&
    zadanaZaPrikaz != null &&
    Math.abs(tank.zadanaNaKontroleru - zadanaZaPrikaz) >= 0.05;

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
        (zadanaZaPrikaz != null ? ` (zadana natrag na ${fmt(zadanaZaPrikaz)} °C)` : "") +
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

  // Visina/sirina dolaze iz klase .hlad-spremi (na mobitelu puna sirina retka).
  const spremiBtn = (aktivan: boolean): React.CSSProperties => ({
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
      className="hlad-kartica"
      style={{
        background: stil.bg,
        border: `2px solid ${stil.border}`,
        borderRadius: 0,
      }}
    >
      {/* Zaglavlje pločice (klik na broj -> pregled tanka) */}
      <div className="hlad-zaglavlje">
        <div className="hlad-naslov">
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
        {/* Desni stupac zaglavlja se SMIJE stisnuti i prelomiti: status
            "HLAĐENJE ISKLJUČENO" je dugačak i na uskoj kartici bi inače
            gurnuo naslov i SMS prekidač izvan okvira. */}
        <div className="hlad-zaglavlje-desno">
          <span
            className="hlad-znacka"
            style={{
              borderRadius: 0,
              background: "#ffffff",
              border: `1px solid ${stil.border}`,
              color: stil.text,
            }}
          >
            <span className="hlad-tocka" style={{ borderRadius: 0, background: stil.dot }} />
            {stil.label}
          </span>
          <SmsPrekidac
            tankId={tank.id}
            tankBroj={tank.broj}
            smsAktivan={tank.smsAktivan}
            smijeUpravljati={smijeUpravljati}
            uAlarmu={status === "ALARM"}
          />
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
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
      <div className="hlad-red">
        <div className="hlad-oznaka">
          {iskljuceno ? "Zadana (zapamćena)" : "Zadana"}{" "}
          <StatusBadge komanda={tank.komande.ZADANA_TEMP ?? null} />
        </div>
        {smijeUpravljati ? (
          <div className="hlad-kontrole">
            <Stepper
              vrijednost={zadana}
              min={LIMITI.ZADANA_TEMP.min}
              max={LIMITI.ZADANA_TEMP.max}
              onChange={setZadana}
              disabled={pending}
            />
            <button
              type="button"
              className="hlad-spremi"
              style={spremiBtn(promijenjenaZadana)}
              disabled={!promijenjenaZadana || pending}
              onClick={() => posalji("ZADANA_TEMP", stegni("ZADANA_TEMP", zadana), zadanaZaPrikaz)}
            >
              Spremi
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {fmt(iskljuceno ? zadanaZaPrikaz : (tank.zadanaNaKontroleru ?? zadanaZaPrikaz))} °C
          </div>
        )}
        <GreskaKomande komanda={tank.komande.ZADANA_TEMP ?? null} />
        {iskljuceno ? (
          <div className="hlad-napomena" style={{ color: "#3d5566" }}>
            Hlađenje je isključeno (na kontroleru stoji {fmt(SOFT_OFF_TEMP)} °C).{" "}
            {zadanaZaPrikaz != null
              ? "Ova vrijednost se vraća pritiskom na UKLJUČI."
              : "Nema zapamćene vrijednosti — upiši zadanu i hlađenje se uključuje s njom."}
          </div>
        ) : razilaziSe ? (
          <div className="hlad-napomena" style={{ color: "#8a6d00", fontWeight: 600 }}>
            Na kontroleru je {fmt(tank.zadanaNaKontroleru)} °C (zadnje očitanje).
          </div>
        ) : null}
      </div>

      {/* Diferencijal (Hy) — koliko temperatura mora prijeci zadanu da hladjenje krene */}
      <div className="hlad-red">
        <div className="hlad-oznaka">
          Diferencijal (Hy) <StatusBadge komanda={tank.komande.HY ?? null} />
        </div>
        {smijeUpravljati ? (
          <div className="hlad-kontrole">
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
              className="hlad-spremi"
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
        <GreskaKomande komanda={tank.komande.HY ?? null} />
      </div>

      {/* Alarm − / Alarm + (na mobitelu jedan ispod drugog) */}
      <div className="hlad-alarmi">
        <div className="hlad-red">
          <div className="hlad-oznaka">
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
                className="hlad-spremi"
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
          <GreskaKomande komanda={tank.komande.ALARM_MINUS ?? null} />
        </div>

        <div className="hlad-red">
          <div className="hlad-oznaka">
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
                className="hlad-spremi"
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
          <GreskaKomande komanda={tank.komande.ALARM_PLUS ?? null} />
        </div>
      </div>

      {/* Hlađenje ON/OFF (soft-OFF preko zadane temperature) */}
      <div className="hlad-red">
        <div className="hlad-oznaka">
          Hlađenje <StatusBadge komanda={tank.komande.HLADJENJE_ON ?? tank.komande.HLADJENJE_OFF ?? null} />
        </div>
        {smijeUpravljati ? (
          <div className="hlad-onoff">
            <button
              type="button"
              disabled={pending}
              onClick={() => posalji("HLADJENJE_ON", null, null)}
              style={{
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
        <GreskaKomande
          komanda={tank.komande.HLADJENJE_ON ?? tank.komande.HLADJENJE_OFF ?? null}
        />
      </div>

      {poruka ? (
        <div className="hlad-napomena" style={{ fontSize: 12, color: "#a11d1d", fontWeight: 600 }}>
          {poruka}
        </div>
      ) : null}
      {pending ? <div style={{ fontSize: 12, color: "#777" }}>Spremam…</div> : null}
    </div>
  );
}

// Raspored redaka kartice (.hlad-red, .hlad-oznaka, .hlad-kontrole i ostalo)
// definiran je u <style> bloku u page.tsx - tamo se mogu pisati media upiti,
// koji su za mobilni prikaz nužni, a u inline stilu ih nema.
