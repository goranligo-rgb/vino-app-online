"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  izracunajStatus,
  stilZaStatus,
  formatTemp,
} from "@/lib/temperatura";

type Tank = {
  id: string;
  broj: number;
  kapacitet: number;
  tip: string | null;
  kolicinaVinaUTanku: number | null;
  /** Deklarirana sorta iz cina imenovanja (faza 4), ne `Tank.sorta`. */
  sorta: string | null;
  nazivVina: string | null;
  /** Vino je u posudi, a nitko ga nije imenovao. Razlicito od prazne posude. */
  bezimeno: boolean;
  /** Gotov jednoredni opis sa servera — vidi lib/ime-vina.ts `imeZaPrikaz`. */
  opisVina: string;
  zadnjaTemp: number | null;
  zadanaTemp: number | null;
  hladjenjeAktivno: boolean | null;
  mjerenoU: string | null;
  imaAktivanAlarm: boolean;
};

type TankSaZadacima = Tank & {
  brojZadataka: number;
};

export default function MonitorPage() {
  const [tankovi, setTankovi] = useState<TankSaZadacima[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/tank/monitor", {
          cache: "no-store",
        });
        const data = await res.json();
        setTankovi(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Greška kod učitavanja monitora:", error);
        setTankovi([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  function getStatus(tank: TankSaZadacima) {
    const kolicina = tank.kolicinaVinaUTanku || 0;

    if (kolicina === 0) {
      return {
        label: "PRAZAN",
        bg: "#f5f5f5",
        border: "#cfcfcf",
      };
    }

    if (tank.brojZadataka > 0) {
      return {
        label: "ZADATAK",
        bg: "#fff4e6",
        border: "#f0a54a",
      };
    }

    return {
      label: "OK",
      bg: "#eef7f0",
      border: "#8db79a",
    };
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#e9ecef",
          padding: 24,
          fontFamily: "Calibri, sans-serif",
          color: "#222",
        }}
      >
        Učitavanje monitora...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#e9ecef",
        padding: 24,
        fontFamily: "Calibri, sans-serif",
        color: "#222",
      }}
    >
      {/* ZAGLAVLJE SE MORA PRELOMITI, INACE GURA CIJELU STRANICU.
          ======================================================================
          Desno u zaglavlju stoji kutija OBJASNJENJE s `minWidth: 220`. Bez
          `flexWrap` red se ne smije prelomiti, pa na uskom prozoru zbroj
          (naslov + razmak + 220) premasi sirinu — dokument se rasiri, stranica
          dobije vodoravni klizac, a mreza tankova (koja sama uredno stane)
          izgleda odsjecena s obje strane cim se otklizi u stranu.

          IZMJERENO na produkciji, prozor 360 px: prelijev 31 px, krivac bas ta
          kutija. Redom pokusa: bez retka „Ime:" -> i dalje 31 px; bez
          `minWidth: 0` na karticama -> i dalje 31 px; bez kutije -> 0 px; sa
          `flexWrap: "wrap"` -> 0 px. Dakle zatečeno, ne od faze 4. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.5px",
              marginBottom: 12,
            }}
          >
            MONITOR TANKOVA
          </div>

          <Link
            href="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #cfcfcf",
              background: "#f8f9fa",
              padding: "8px 12px",
              fontSize: 12,
              color: "#222",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            NATRAG
          </Link>

          <Link
            href="/dashboard/izvjestaji/podrum"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #cfcfcf",
              background: "#f8f9fa",
              padding: "8px 12px",
              fontSize: 12,
              color: "#222",
              textDecoration: "none",
              fontWeight: 700,
              marginLeft: 8,
            }}
          >
            ISPIS
          </Link>
        </div>

        {/* KUTIJA OBJASNJENJA — smije se stisnuti, nikad ne smije izaci.
            ==================================================================
            Prije je imala tvrdi `minWidth: 220`. Dok zaglavlje nije imalo
            `flexWrap`, to je gurALO cijelu stranicu u sirinu (vidi biljesku uz
            zaglavlje). Sada se red prelama, pa kutija dobije svoj red — ali
            tvrdih 220 px i dalje znaci da ispod ~268 px viewporta (zum 400 %)
            probija desni rub, jer se ne smije suziti.

            `flex: 0 1 220px` cuva istu zeljenu sirinu, ali dopusta stiskanje.
            NULA za rast je namjerna: s `1` bi se kutija na sirokom ekranu
            razvukla preko pola zaglavlja umjesto da ostane uredna oznaka.
            `minWidth: 0` uklanja zapreku koju element flexa ima po zadanom, a
            `maxWidth: 100%` je tvrda brana da nikad ne prijede redak.

            PORAVNANJE: zaglavlje ima `justify-content: space-between`. Kad su
            oba elementa u istom redu, kutija ide desno; kad se prelomi, ostaje
            sama u redu i `space-between` je stavlja na POCETAK, dakle lijevo
            ispod naslova. Izmjereno na 12 sirina od 265 do 1265 px. */}
        <div
          style={{
            border: "1px solid #cfcfcf",
            background: "#f8f9fa",
            padding: "10px 12px",
            flex: "0 1 220px",
            minWidth: 0,
            maxWidth: "100%",
            boxSizing: "border-box",
            fontSize: 12,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 8,
              fontSize: 13,
            }}
          >
            OBJAŠNJENJE
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                background: "#eef7f0",
                border: "1px solid #8db79a",
              }}
            />
            <span>Zeleni — OK</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                background: "#fff4e6",
                border: "1px solid #f0a54a",
              }}
            />
            <span>Narančasti — zadatak</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                background: "#f5f5f5",
                border: "1px solid #cfcfcf",
              }}
            />
            <span>Sivi — prazan</span>
          </div>
        </div>
      </div>

      {/* MREZA JE FLEX, NE GRID — zbog ZADNJEG REDA.
          ======================================================================
          Rešetka (`grid` s `repeat(auto-fit, minmax(200px, 1fr))`) centrira
          spremnik, ali ne i posljednji red: broj tankova rijetko je djeljiv s
          brojem stupaca, pa zadnji red ostane pri lijevom rubu. Izmjereno na
          produkciji, zum 100 % i 5 stupaca: zadnja tri tanka lijevo, a desno
          zjapi 516 px. Na 125/150/200 % se 48 dijeli tocno (4, 3, 2) pa se to
          ne vidi — zato je izgledalo kao da ovisi o zumu.

          `justify-content: center` na rešetki ne pomaze: on pomice CIJELI skup
          staza, koji je za sve redove isti, pa zadnji red i dalje ostaje uz
          lijevi rub svojih staza. Flex s `flex-wrap: wrap` centrira SVAKI red
          zasebno, ukljucujuci nepotpun zadnji.

          `flex: 1 1 200px` drzi isto ponasanje kao `minmax(200px, 1fr)` —
          kartica je najmanje 200 px i rasteze se da popuni red; `maxWidth`
          sprjecava da se u nepotpunom zadnjem redu razvuku preko mjere. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 12,
        }}
      >
        {tankovi.map((tank) => {
          const status = getStatus(tank);
          const tempStatus = izracunajStatus({
            mjerenoU: tank.mjerenoU,
            imaAktivanAlarm: tank.imaAktivanAlarm,
          });
          const tempStil = stilZaStatus(tempStatus);

          return (
            <Link
              key={tank.id}
              href={`/tankovi/${tank.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                // Zamjena za `minmax(200px, 1fr)` iz rešetke: najmanje 200 px,
                // rasteze se da popuni red. `maxWidth` je ograda za NEPOTPUN
                // zadnji red — bez nje bi se tri preostale kartice razvukle
                // preko cijele sirine i bile dvostruko vece od ostalih.
                flex: "1 1 200px",
                maxWidth: 280,
                // Element flexa ima `min-width: auto` kao i element rešetke —
                // bez ovoga ga dugo ime moze napuhati preko `flex-basis`.
                minWidth: 0,
              }}
            >
              <div
                style={{
                  background: status.bg,
                  border: `1px solid ${status.border}`,
                  padding: 12,
                  cursor: "pointer",
                  minHeight: 128,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    TANK {tank.broj}
                  </div>

                  <div style={{ fontSize: 12, marginBottom: 3 }}>
                    Kapacitet: {tank.kapacitet} L
                  </div>

                  <div style={{ fontSize: 12, marginBottom: 3 }}>
                    Vino: {tank.kolicinaVinaUTanku || 0} L
                  </div>

                  {/* IME, PA SORTA. Do faze 4 je ovdje stajala samo
                      `Tank.sorta`, stupac koji se s knjigom razilazio na 14 od
                      36 punih tankova. Sada ide ime vina iz cina imenovanja, a
                      sorta ispod njega kao DEKLARIRANA — stvarni sastav se
                      izvodi iz knjige i stoji na stranici tanka.

                      Bezimeno vino se kaze rijecima. Crtica izgleda kao da se
                      podatak nije ucitao; „bez imena" je tvrdnja. */}
                  <div
                    style={{
                      fontSize: 12,
                      marginBottom: 3,
                      // Ime vina zna biti dugacko („Bijeli pinot, sivi pinot,
                      // zeleni silvanac"), a staza je najuze 200 px. Neka se
                      // prelomi bilo gdje prije nego sto gurne karticu.
                      overflowWrap: "anywhere",
                    }}
                  >
                    Ime:{" "}
                    {tank.bezimeno ? (
                      <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
                        bez imena
                      </span>
                    ) : (
                      tank.opisVina
                    )}
                  </div>

                  {/* Isti oprez kao na retku iznad. Ovaj je redak i prije
                      faze 4 znao prijeci u dva na najuzoj stazi („Sorta:
                      Bijeli pinot, sivi pinot, zeleni silvanac" — izmjereno
                      30 px visine na 176 px sirine); sada se barem ne moze
                      dogoditi da gurne karticu. */}
                  <div
                    style={{
                      fontSize: 12,
                      marginBottom: 3,
                      overflowWrap: "anywhere",
                    }}
                  >
                    Sorta: {tank.sorta || "-"}
                  </div>

                  <div style={{ fontSize: 12 }}>
                    Aktivni zadaci: {tank.brojZadataka}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      fontSize: 13,
                    }}
                    title={`Temperatura: ${tempStil.label}`}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        background: tempStil.dot,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 700 }}>
                      {formatTemp(tank.zadnjaTemp)} °C
                    </span>
                    {tank.zadanaTemp != null ? (
                      <span style={{ color: "#888", fontSize: 12 }}>
                        / {formatTemp(tank.zadanaTemp)}
                      </span>
                    ) : null}
                    {tank.hladjenjeAktivno ? (
                      <span style={{ marginLeft: "auto", fontSize: 12 }} title="Hlađenje aktivno">
                        ❄
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#555",
                    letterSpacing: "0.4px",
                  }}
                >
                  {status.label}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}