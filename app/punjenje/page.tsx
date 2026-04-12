"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Tank = {
  id: string;
  broj: number;
  kapacitet: number;
  tip: string | null;
  opis?: string | null;
  kolicinaVinaUTanku?: number | null;
};

type Sorta = {
  id: string;
  naziv: string;
};

type StavkaPunjenja = {
  sortaId: string;
  nazivSorte: string;
  polozaj: string;
  opis: string;
  kolicinaKgGrozdja: string;
  kolicinaLitara: string;
};

type ZadnjePunjenje = {
  id: string;
  nazivVina: string | null;
  datumPunjenja: string;
  ukupnoLitara: number;
  ukupnoKgGrozdja: number;
  tank: {
    id: string;
    broj: number;
    tip: string | null;
  };
};

const SORTE_HR: Sorta[] = [
  { id: "grasevina", naziv: "Graševina" },
  { id: "sauvignon", naziv: "Sauvignon" },
  { id: "rajnski-rizling", naziv: "Rajnski rizling" },
  { id: "chardonnay", naziv: "Chardonnay" },
  { id: "pinot-bijeli", naziv: "Pinot bijeli" },
  { id: "pinot-sivi", naziv: "Pinot sivi" },
  { id: "traminac", naziv: "Traminac" },
  { id: "muskat-zuti", naziv: "Muškat žuti" },
  { id: "zeleni-silvanac", naziv: "Zeleni silvanac" },
  { id: "veltlinac-zeleni", naziv: "Veltlinac zeleni" },
  { id: "manzoni", naziv: "Manzoni" },
  { id: "kerner", naziv: "Kerner" },
  { id: "rkaciteli", naziv: "Rkaciteli" },
  { id: "malvazija-istarska", naziv: "Malvazija istarska" },
  { id: "posip", naziv: "Pošip" },
  { id: "marastina", naziv: "Maraština" },
  { id: "debit", naziv: "Debit" },
  { id: "zlahtina", naziv: "Žlahtina" },
  { id: "plavac-mali", naziv: "Plavac mali" },
  { id: "frankovka", naziv: "Frankovka" },
  { id: "pinot-crni", naziv: "Pinot crni" },
  { id: "merlot", naziv: "Merlot" },
  { id: "cabernet-sauvignon", naziv: "Cabernet Sauvignon" },
  { id: "cabernet-franc", naziv: "Cabernet Franc" },
  { id: "syrah", naziv: "Syrah" },
  { id: "teran", naziv: "Teran" },
  { id: "babic", naziv: "Babić" },
  { id: "lasina", naziv: "Lasina" },
  { id: "plavina", naziv: "Plavina" },
  { id: "crljenak", naziv: "Crljenak" },
  { id: "portugizac", naziv: "Portugizac" },
];

const praznaStavka = (): StavkaPunjenja => ({
  sortaId: "",
  nazivSorte: "",
  polozaj: "",
  opis: "",
  kolicinaKgGrozdja: "",
  kolicinaLitara: "",
});

function parseBroj(vrijednost: string | number | null | undefined) {
  if (vrijednost == null) return 0;
  const broj = Number(String(vrijednost).replace(",", ".").trim());
  return Number.isFinite(broj) ? broj : 0;
}

function sadaZaDatetimeLocal() {
  const sada = new Date();
  const offset = sada.getTimezoneOffset();
  const lokalno = new Date(sada.getTime() - offset * 60 * 1000);
  return lokalno.toISOString().slice(0, 16);
}

function formatBroj(vrijednost: number | null | undefined, decimale = 2) {
  if (vrijednost == null || !Number.isFinite(Number(vrijednost))) return "-";
  return Number(vrijednost).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimale,
  });
}

function formatDatumVrijeme(value: string) {
  try {
    return new Date(value).toLocaleString("hr-HR");
  } catch {
    return value;
  }
}

export default function PunjenjePage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [tankovi, setTankovi] = useState<Tank[]>([]);
  const [sorte] = useState<Sorta[]>(SORTE_HR);
  const [zadnjaPunjenja, setZadnjaPunjenja] = useState<ZadnjePunjenje[]>([]);
  const [loadingTankovi, setLoadingTankovi] = useState(true);
  const [loadingPunjenja, setLoadingPunjenja] = useState(true);
  const [loadingSorte] = useState(false);
  const [saving, setSaving] = useState(false);
  const [poruka, setPoruka] = useState("");
  const [zadnjeSpremljenoTankId, setZadnjeSpremljenoTankId] = useState("");

  const [tankId, setTankId] = useState("");
  const [nazivVina, setNazivVina] = useState("");
  const [datumPunjenja, setDatumPunjenja] = useState(sadaZaDatetimeLocal());
  const [napomena, setNapomena] = useState("");

  const [stavke, setStavke] = useState<StavkaPunjenja[]>([praznaStavka()]);

  useEffect(() => {
    ucitajTankove();
    ucitajZadnjaPunjenja();
  }, []);

  async function ucitajTankove() {
    try {
      setLoadingTankovi(true);
      const res = await fetch("/api/tank", { cache: "no-store" });
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      const sortirano = lista.sort((a: Tank, b: Tank) => a.broj - b.broj);
      setTankovi(sortirano);
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod učitavanja tankova.");
    } finally {
      setLoadingTankovi(false);
    }
  }

  async function ucitajZadnjaPunjenja() {
    try {
      setLoadingPunjenja(true);
      const res = await fetch("/api/punjenje", { cache: "no-store" });
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      setZadnjaPunjenja(lista.slice(0, 20));
    } catch (error) {
      console.error(error);
      setZadnjaPunjenja([]);
    } finally {
      setLoadingPunjenja(false);
    }
  }

  function resetForm() {
    setTankId("");
    setNazivVina("");
    setDatumPunjenja(sadaZaDatetimeLocal());
    setNapomena("");
    setStavke([praznaStavka()]);
  }

  function promijeniStavku(
    index: number,
    field: keyof StavkaPunjenja,
    value: string
  ) {
    setStavke((prev) =>
      prev.map((stavka, i) =>
        i === index ? { ...stavka, [field]: value } : stavka
      )
    );
  }

  function promijeniSortu(index: number, sortaId: string) {
    const odabranaSorta = sorte.find((s) => s.id === sortaId);

    setStavke((prev) =>
      prev.map((stavka, i) =>
        i === index
          ? {
              ...stavka,
              sortaId,
              nazivSorte: odabranaSorta?.naziv || "",
            }
          : stavka
      )
    );
  }

  function dodajStavku() {
    setStavke((prev) => [...prev, praznaStavka()]);

    setTimeout(() => {
      const form = formRef.current;
      if (!form) return;

      const inputs = Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input, select, textarea"
        )
      ).filter((el) => !el.hasAttribute("disabled"));

      const target = inputs[inputs.length - 6];
      target?.focus();
    }, 0);
  }

  function obrisiStavku(index: number) {
    setStavke((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleEnterMoveNext(
    e: React.KeyboardEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    if (e.key !== "Enter") return;
    if (e.currentTarget.tagName.toLowerCase() === "textarea") return;

    e.preventDefault();

    const form = formRef.current;
    if (!form) return;

    const focusable = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(
        'input, select, textarea, button[type="button"], button[type="submit"]'
      )
    ).filter((el) => {
      const disabled = el.hasAttribute("disabled");
      const hidden =
        el.getAttribute("type") === "hidden" ||
        (el as HTMLElement).offsetParent === null;
      return !disabled && !hidden;
    });

    const currentIndex = focusable.indexOf(e.currentTarget as any);
    if (currentIndex === -1) return;

    const nextElement = focusable[currentIndex + 1];
    if (nextElement) nextElement.focus();
  }

  const ukupnoLitara = useMemo(() => {
    return stavke.reduce((sum, s) => sum + parseBroj(s.kolicinaLitara), 0);
  }, [stavke]);

  const ukupnoKgGrozdja = useMemo(() => {
    return stavke.reduce((sum, s) => sum + parseBroj(s.kolicinaKgGrozdja), 0);
  }, [stavke]);

  const odabraniTank = useMemo(
    () => tankovi.find((t) => t.id === tankId),
    [tankId, tankovi]
  );

  const trenutnoUTanku = Number(odabraniTank?.kolicinaVinaUTanku || 0);
  const kapacitetTanka = Number(odabraniTank?.kapacitet || 0);
  const slobodnoMjesto = Math.max(kapacitetTanka - trenutnoUTanku, 0);

  const stanjeNakonPunjenja = trenutnoUTanku + ukupnoLitara;
  const slobodnoNakonPunjenja = Math.max(kapacitetTanka - stanjeNakonPunjenja, 0);
  const prelaziKapacitet = !!odabraniTank && stanjeNakonPunjenja > kapacitetTanka;

  const pregledPostotaka = useMemo(() => {
    const validne = stavke
      .map((s) => {
        const lit = parseBroj(s.kolicinaLitara);
        return {
          nazivSorte: s.nazivSorte.trim(),
          polozaj: s.polozaj.trim(),
          opis: s.opis.trim(),
          litara: lit,
        };
      })
      .filter((s) => s.nazivSorte && s.litara > 0);

    if (validne.length === 0 || ukupnoLitara <= 0) return [];

    const grupirano = new Map<string, number>();

    for (const s of validne) {
      const key = s.nazivSorte;
      grupirano.set(key, (grupirano.get(key) || 0) + s.litara);
    }

    return Array.from(grupirano.entries())
      .map(([nazivSorte, litara]) => ({
        nazivSorte,
        litara,
        postotak: (litara / ukupnoLitara) * 100,
      }))
      .sort((a, b) => b.litara - a.litara);
  }, [stavke, ukupnoLitara]);

  async function spremiPunjenje(e: React.FormEvent) {
    e.preventDefault();
    setPoruka("");
    setZadnjeSpremljenoTankId("");

    if (!tankId) {
      setPoruka("Odaberi tank.");
      return;
    }

    const cisteStavke = stavke
      .map((s) => ({
        sortaId: null,
        nazivSorte: s.nazivSorte.trim(),
        polozaj: s.polozaj.trim(),
        opis: s.opis.trim(),
        kolicinaKgGrozdja:
          s.kolicinaKgGrozdja.trim() === ""
            ? null
            : parseBroj(s.kolicinaKgGrozdja),
        kolicinaLitara: parseBroj(s.kolicinaLitara),
      }))
      .filter((s) => s.nazivSorte !== "" || s.kolicinaLitara > 0);

    if (cisteStavke.length === 0) {
      setPoruka("Upiši barem jednu stavku punjenja.");
      return;
    }

    const imaNeispravnih = cisteStavke.some(
      (s) =>
        !s.nazivSorte ||
        !Number.isFinite(s.kolicinaLitara) ||
        s.kolicinaLitara <= 0 ||
        (s.kolicinaKgGrozdja !== null &&
          (!Number.isFinite(s.kolicinaKgGrozdja) || s.kolicinaKgGrozdja < 0))
    );

    if (imaNeispravnih) {
      setPoruka("Provjeri sortu, položaj, litre i opcionalno kg grožđa.");
      return;
    }

    if (ukupnoLitara > slobodnoMjesto) {
      setPoruka(
        `U tanku je trenutno ${formatBroj(
          trenutnoUTanku
        )} L, slobodno je još ${formatBroj(
          slobodnoMjesto
        )} L, a pokušavaš upisati ${formatBroj(ukupnoLitara)} L.`
      );
      return;
    }

    try {
      setSaving(true);

      const spremljeniTankId = tankId;

      const res = await fetch("/api/punjenje", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tankId,
          nazivVina: nazivVina.trim() || null,
          datumPunjenja,
          napomena: napomena.trim() || null,
          stavke: cisteStavke,
        }),
      });

      const rezultat = await res.json();

      if (!res.ok) {
        setPoruka(rezultat?.error || "Greška kod spremanja punjenja.");
        return;
      }

      setPoruka("Punjenje je uspješno spremljeno. Možeš odmah upisati novo.");
      setZadnjeSpremljenoTankId(spremljeniTankId);

      resetForm();
      await ucitajTankove();
      await ucitajZadnjaPunjenja();

      setTimeout(() => {
        const form = formRef.current;
        if (!form) return;
        const firstSelect = form.querySelector("select");
        firstSelect?.focus();
      }, 0);
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod spremanja punjenja.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #fcf8f9 0%, #faf3f4 45%, #f7edef 100%)",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1580, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 360px",
            gap: 22,
            alignItems: "start",
          }}
        >
          <section
            style={{
              border: "1px solid #ebd3d8",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,246,247,0.96) 100%)",
              boxShadow: "0 18px 40px rgba(127,29,29,0.07)",
              padding: 24,
            }}
          >
            <div style={heroBoxStyle}>
              <div>
                <div style={heroOverlineStyle}>PODRUMSKI UNOS</div>
                <h1 style={heroTitleStyle}>Punjenje / berba</h1>
                <p style={heroTextStyle}>
                  Unesi mošt koji ulazi u tank, evidentiraj količinu grožđa,
                  položaj i kvalitetu te odmah vidi raspodjelu sorti i stanje
                  tanka nakon unosa.
                </p>
              </div>

              <div style={heroStatsGrid}>
                <div style={heroStatCard}>
                  <div style={heroStatLabel}>Ukupno mošta</div>
                  <div style={heroStatValue}>{formatBroj(ukupnoLitara)} L</div>
                </div>

                <div style={heroStatCard}>
                  <div style={heroStatLabel}>Ukupno grožđa</div>
                  <div style={heroStatValue}>{formatBroj(ukupnoKgGrozdja)} kg</div>
                </div>

                <div style={heroStatCard}>
                  <div style={heroStatLabel}>Stavke</div>
                  <div style={heroStatValue}>{stavke.length}</div>
                </div>

                <div style={heroStatCard}>
                  <div style={heroStatLabel}>Tank</div>
                  <div style={heroStatValue}>
                    {odabraniTank ? `#${odabraniTank.broj}` : "-"}
                  </div>
                </div>
              </div>
            </div>

            <form
              ref={formRef}
              onSubmit={spremiPunjenje}
              style={{ display: "grid", gap: 18, marginTop: 18 }}
            >
              <section style={sectionCardStyle}>
                <div style={sectionHeaderRow}>
                  <div>
                    <div style={sectionKickerStyle}>01</div>
                    <div style={sectionTitleStyle}>Osnovni podaci</div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  <label style={labelStyle}>
                    <span style={labelText}>Tank</span>
                    <select
                      value={tankId}
                      onChange={(e) => setTankId(e.target.value)}
                      onKeyDown={handleEnterMoveNext}
                      style={inputStyle}
                      disabled={loadingTankovi || saving}
                    >
                      <option value="">Odaberi tank</option>
                      {tankovi.map((tank) => {
                        const trenutno = Number(tank.kolicinaVinaUTanku || 0);
                        const slobodno = Math.max(
                          Number(tank.kapacitet || 0) - trenutno,
                          0
                        );

                        return (
                          <option key={tank.id} value={tank.id}>
                            Tank {tank.broj}
                            {tank.tip ? ` — ${tank.tip}` : ""}
                            {` — kapacitet ${formatBroj(tank.kapacitet)} L`}
                            {` — trenutno ${formatBroj(trenutno)} L`}
                            {` — slobodno ${formatBroj(slobodno)} L`}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label style={labelStyle}>
                    <span style={labelText}>Naziv vina</span>
                    <input
                      value={nazivVina}
                      onChange={(e) => setNazivVina(e.target.value)}
                      onKeyDown={handleEnterMoveNext}
                      placeholder="npr. Graševina Lukovec"
                      style={inputStyle}
                      disabled={saving}
                    />
                  </label>

                  <label style={labelStyle}>
                    <span style={labelText}>Datum punjenja</span>
                    <input
                      type="datetime-local"
                      value={datumPunjenja}
                      onChange={(e) => setDatumPunjenja(e.target.value)}
                      onKeyDown={handleEnterMoveNext}
                      style={inputStyle}
                      disabled={saving}
                    />
                  </label>
                </div>

                <label style={{ ...labelStyle, marginTop: 10 }}>
                  <span style={labelText}>Napomena</span>
                  <textarea
                    value={napomena}
                    onChange={(e) => setNapomena(e.target.value)}
                    placeholder="Opća napomena uz punjenje..."
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
                    disabled={saving}
                  />
                </label>
              </section>

              <section style={sectionCardStyle}>
                <div style={sectionHeaderRow}>
                  <div>
                    <div style={sectionKickerStyle}>02</div>
                    <div style={sectionTitleStyle}>Stavke punjenja</div>
                    <div style={sectionSubStyle}>
                      Sorta, položaj, opis, količina grožđa i litara mošta
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={dodajStavku}
                    style={secondaryButton}
                    disabled={saving}
                  >
                    + Dodaj stavku
                  </button>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  {stavke.map((stavka, index) => {
                    const litara = parseBroj(stavka.kolicinaLitara);
                    const postotak =
                      ukupnoLitara > 0 && Number.isFinite(litara) && litara > 0
                        ? (litara / ukupnoLitara) * 100
                        : 0;

                    return (
                      <div key={index} style={stavkaCardStyle}>
                        <div style={stavkaTopRow}>
                          <div style={stavkaNaslovStyle}>Stavka {index + 1}</div>
                          <div style={stavkaUdioStyle}>
                            Udio: {formatBroj(postotak)}%
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(170px, 1fr))",
                            gap: 12,
                          }}
                        >
                          <label style={labelStyle}>
                            <span style={labelMini}>Sorta</span>
                            <select
                              value={stavka.sortaId}
                              onChange={(e) =>
                                promijeniSortu(index, e.target.value)
                              }
                              onKeyDown={handleEnterMoveNext}
                              style={inputStyle}
                              disabled={saving || loadingSorte}
                            >
                              <option value="">Odaberi sortu</option>
                              {sorte.map((sorta) => (
                                <option key={sorta.id} value={sorta.id}>
                                  {sorta.naziv}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label style={labelStyle}>
                            <span style={labelMini}>Položaj / parcela</span>
                            <input
                              value={stavka.polozaj}
                              onChange={(e) =>
                                promijeniStavku(index, "polozaj", e.target.value)
                              }
                              onKeyDown={handleEnterMoveNext}
                              placeholder="npr. Lukovec 2"
                              style={inputStyle}
                              disabled={saving}
                            />
                          </label>

                          <label style={labelStyle}>
                            <span style={labelMini}>Opis kvalitete / bilješka</span>
                            <input
                              value={stavka.opis}
                              onChange={(e) =>
                                promijeniStavku(index, "opis", e.target.value)
                              }
                              onKeyDown={handleEnterMoveNext}
                              placeholder="npr. zdravo grožđe, odličan šećer"
                              style={inputStyle}
                              disabled={saving}
                            />
                          </label>

                          <label style={labelStyle}>
                            <span style={labelMini}>Kg grožđa</span>
                            <input
                              value={stavka.kolicinaKgGrozdja}
                              onChange={(e) =>
                                promijeniStavku(
                                  index,
                                  "kolicinaKgGrozdja",
                                  e.target.value
                                )
                              }
                              onKeyDown={handleEnterMoveNext}
                              placeholder="npr. 2300"
                              style={inputStyle}
                              disabled={saving}
                              inputMode="decimal"
                            />
                          </label>

                          <label style={labelStyle}>
                            <span style={labelMini}>Litara mošta</span>
                            <input
                              value={stavka.kolicinaLitara}
                              onChange={(e) =>
                                promijeniStavku(
                                  index,
                                  "kolicinaLitara",
                                  e.target.value
                                )
                              }
                              onKeyDown={handleEnterMoveNext}
                              placeholder="npr. 1900"
                              style={inputStyle}
                              disabled={saving}
                              inputMode="decimal"
                            />
                          </label>
                        </div>

                        <div style={stavkaButtonsRow}>
                          <button
                            type="button"
                            onClick={dodajStavku}
                            style={secondaryButton}
                            disabled={saving}
                          >
                            + Dodaj stavku
                          </button>

                          <button
                            type="button"
                            onClick={() => obrisiStavku(index)}
                            style={dangerButton}
                            disabled={saving || stavke.length === 1}
                          >
                            Obriši stavku
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section style={sectionCardStyle}>
                <div style={sectionHeaderRow}>
                  <div>
                    <div style={sectionKickerStyle}>03</div>
                    <div style={sectionTitleStyle}>Sažetak</div>
                  </div>
                </div>

                <div style={summaryGridStyle}>
                  <div style={summaryCardStyle}>
                    <div style={summaryTitleStyle}>Ukupno kg grožđa</div>
                    <div style={summaryValueStyle}>
                      {formatBroj(ukupnoKgGrozdja)} kg
                    </div>
                  </div>

                  <div style={summaryCardStyle}>
                    <div style={summaryTitleStyle}>Ukupno litara mošta</div>
                    <div style={summaryValueStyle}>
                      {formatBroj(ukupnoLitara)} L
                    </div>
                  </div>

                  <div style={summaryCardStyle}>
                    <div style={summaryTitleStyle}>Kapacitet tanka</div>
                    <div style={summaryValueStyle}>
                      {odabraniTank ? `${formatBroj(kapacitetTanka)} L` : "-"}
                    </div>
                  </div>

                  <div style={summaryCardStyle}>
                    <div style={summaryTitleStyle}>Trenutno u tanku</div>
                    <div style={summaryValueStyle}>
                      {odabraniTank ? `${formatBroj(trenutnoUTanku)} L` : "-"}
                    </div>
                  </div>

                  <div style={summaryCardStyle}>
                    <div style={summaryTitleStyle}>Slobodno prije punjenja</div>
                    <div style={summaryValueStyle}>
                      {odabraniTank ? `${formatBroj(slobodnoMjesto)} L` : "-"}
                    </div>
                  </div>

                  <div style={summaryCardStyle}>
                    <div style={summaryTitleStyle}>Stanje nakon punjenja</div>
                    <div style={summaryValueStyle}>
                      {odabraniTank
                        ? `${formatBroj(stanjeNakonPunjenja)} L`
                        : "-"}
                    </div>
                  </div>

                  <div style={summaryCardStyle}>
                    <div style={summaryTitleStyle}>Slobodno nakon punjenja</div>
                    <div style={summaryValueStyle}>
                      {odabraniTank
                        ? `${formatBroj(slobodnoNakonPunjenja)} L`
                        : "-"}
                    </div>
                  </div>
                </div>

                {odabraniTank && prelaziKapacitet ? (
                  <div style={warningBoxStyle}>
                    Upozorenje: nakon ovog punjenja tank bi imao{" "}
                    {formatBroj(stanjeNakonPunjenja)} L, a kapacitet je{" "}
                    {formatBroj(kapacitetTanka)} L.
                  </div>
                ) : null}

                {pregledPostotaka.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <div style={pregledTitleStyle}>Udio sorti po moštu</div>

                    <div style={{ display: "grid", gap: 8 }}>
                      {pregledPostotaka.map((s) => (
                        <div key={s.nazivSorte} style={sortaRedStyle}>
                          <span style={sortaNazivStyle}>{s.nazivSorte}</span>
                          <span style={sortaVrijednostStyle}>
                            {formatBroj(s.litara)} L — {formatBroj(s.postotak)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              {poruka ? (
                <div
                  style={{
                    padding: 14,
                    border: poruka.includes("uspješno")
                      ? "1px solid #efc8cf"
                      : "1px solid #fdba74",
                    background: poruka.includes("uspješno")
                      ? "linear-gradient(180deg, #fff8f9 0%, #fdf0f2 100%)"
                      : "linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)",
                    color: "#4b1d26",
                    fontWeight: 600,
                  }}
                >
                  {poruka}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button type="submit" style={primaryButton} disabled={saving}>
                  {saving ? "Spremanje..." : "Spremi punjenje"}
                </button>

                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() => router.push("/dashboard")}
                  disabled={saving}
                >
                  Natrag na početnu
                </button>

                {zadnjeSpremljenoTankId ? (
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() =>
                      router.push(
                        `/mjerenje?tankId=${zadnjeSpremljenoTankId}&initial=1`
                      )
                    }
                  >
                    Idi na mjerenje
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <aside
            style={{
              border: "1px solid #ebd3d8",
              background:
                "linear-gradient(180deg, #fffafb 0%, #fff3f5 52%, #fdecef 100%)",
              boxShadow: "0 18px 36px rgba(127,29,29,0.08)",
              padding: 18,
              position: "sticky",
              top: 18,
            }}
          >
            <div
              style={{
                borderBottom: "1px solid #ead7db",
                paddingBottom: 10,
                marginBottom: 14,
              }}
            >
              <div style={asideTitleStyle}>Zadnja punjenja</div>
              <div style={asideSubStyle}>Zadnjih 15–20 spremljenih unosa</div>
            </div>

            {loadingPunjenja ? (
              <div style={sideInfoText}>Učitavanje...</div>
            ) : zadnjaPunjenja.length === 0 ? (
              <div style={sideInfoText}>Nema još evidentiranih punjenja.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {zadnjaPunjenja.map((punjenje) => (
                  <Link
                    key={punjenje.id}
                    href={`/punjenje/${punjenje.id}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div style={sideCardStyle}>
                      <div style={sideCardTopRow}>
                        <div style={sideCardTitleStyle}>
                          {punjenje.nazivVina || "Bez naziva"}
                        </div>
                        <div style={sideCardTankStyle}>
                          Tank {punjenje.tank.broj}
                        </div>
                      </div>

                      <div style={sideCardDateStyle}>
                        {formatDatumVrijeme(punjenje.datumPunjenja)}
                      </div>

                      <div style={sideCardMetaStyle}>
                        <div>Mošt: {formatBroj(punjenje.ukupnoLitara)} L</div>
                        <div>
                          Grožđe: {formatBroj(punjenje.ukupnoKgGrozdja)} kg
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

const heroBoxStyle: React.CSSProperties = {
  border: "1px solid #dfbcc4",
  background:
    "linear-gradient(135deg, rgba(127,29,29,0.96) 0%, rgba(136,19,55,0.92) 55%, rgba(159,18,57,0.84) 100%)",
  color: "#fff",
  padding: 24,
  boxShadow: "0 18px 34px rgba(127,29,29,0.14)",
};

const heroOverlineStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  fontWeight: 700,
  color: "rgba(255,255,255,0.72)",
};

const heroTitleStyle: React.CSSProperties = {
  margin: "6px 0 0 0",
  fontSize: 34,
  fontWeight: 700,
  lineHeight: 1.05,
};

const heroTextStyle: React.CSSProperties = {
  margin: "10px 0 0 0",
  maxWidth: 760,
  color: "rgba(255,255,255,0.82)",
  lineHeight: 1.6,
  fontSize: 15,
};

const heroStatsGrid: React.CSSProperties = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
};

const heroStatCard: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  padding: 14,
};

const heroStatLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  color: "rgba(255,255,255,0.66)",
};

const heroStatValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 24,
  fontWeight: 700,
  color: "#fff",
};

const sectionCardStyle: React.CSSProperties = {
  border: "1px solid #ead6da",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,247,248,0.98) 100%)",
  padding: 18,
  boxShadow: "0 8px 22px rgba(127,29,29,0.04)",
};

const sectionHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const sectionKickerStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#9f1239",
  letterSpacing: 1.4,
  textTransform: "uppercase",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 22,
  fontWeight: 700,
  color: "#6b1f2b",
};

const sectionSubStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 14,
  color: "#8a6470",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelText: React.CSSProperties = {
  fontWeight: 600,
  color: "#5f2732",
  fontSize: 14,
};

const labelMini: React.CSSProperties = {
  fontWeight: 600,
  color: "#7b5560",
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  border: "1px solid #ead5da",
  background: "#fffdfd",
  fontSize: 14,
  color: "#1f2937",
  outline: "none",
};

const primaryButton: React.CSSProperties = {
  padding: "12px 18px",
  border: "1px solid #7f1d1d",
  background: "linear-gradient(180deg, #a21c44 0%, #7f1d1d 100%)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 10px 20px rgba(127,29,29,0.18)",
};

const secondaryButton: React.CSSProperties = {
  padding: "12px 18px",
  border: "1px solid #e6d2d7",
  background: "linear-gradient(180deg, #ffffff 0%, #fdf1f3 100%)",
  color: "#612632",
  fontWeight: 600,
  cursor: "pointer",
};

const dangerButton: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #f3c6ce",
  background: "linear-gradient(180deg, #fff2f4 0%, #ffe8ec 100%)",
  color: "#9f1239",
  fontWeight: 600,
  cursor: "pointer",
};

const stavkaCardStyle: React.CSSProperties = {
  border: "1px solid #ecd9dd",
  background: "linear-gradient(180deg, #ffffff 0%, #fff8f9 100%)",
  padding: 14,
  boxShadow: "0 4px 12px rgba(127,29,29,0.035)",
};

const stavkaTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
};

const stavkaNaslovStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#6b1f2b",
};

const stavkaUdioStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#8a6470",
};

const stavkaButtonsRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginTop: 14,
  flexWrap: "wrap",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #ebd9dd",
  background: "linear-gradient(180deg, #ffffff 0%, #fff7f8 100%)",
  padding: 14,
};

const summaryTitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#8a6470",
  marginBottom: 6,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: 23,
  fontWeight: 700,
  color: "#7f1d1d",
};

const warningBoxStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  border: "1px solid #fecaca",
  background: "linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)",
  color: "#9f1239",
  fontWeight: 700,
};

const pregledTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#5b1e28",
  marginBottom: 8,
};

const sortaRedStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  border: "1px solid #edd8dc",
  background: "#fff8f8",
};

const sortaNazivStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#7f1d1d",
};

const sortaVrijednostStyle: React.CSSProperties = {
  color: "#5b1e28",
};

const asideTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#7f1d1d",
};

const asideSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#7b5560",
  marginTop: 4,
};

const sideCardStyle: React.CSSProperties = {
  border: "1px solid #ead8dc",
  background: "rgba(255,255,255,0.84)",
  padding: 12,
};

const sideCardTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "start",
};

const sideCardTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#5b1e28",
  lineHeight: 1.3,
};

const sideCardTankStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#7b5560",
  whiteSpace: "nowrap",
};

const sideCardDateStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#7b5560",
  lineHeight: 1.45,
};

const sideCardMetaStyle: React.CSSProperties = {
  marginTop: 8,
  display: "grid",
  gap: 4,
  fontSize: 13,
  color: "#5b1e28",
};

const sideInfoText: React.CSSProperties = {
  fontSize: 14,
  color: "#7b5560",
};