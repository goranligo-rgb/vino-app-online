import Link from "next/link";
import React from "react";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import NatragNaPrethodnu from "@/components/NatragNaPrethodnu";

function boja(value: number | null, min?: number, max?: number) {
  if (value == null) return "#ffffff";

  if (min != null && value < min) return "#fee2e2";
  if (max != null && value > max) return "#fee2e2";

  if ((min != null && value < min + 2) || (max != null && value > max - 2)) {
    return "#fef9c3";
  }

  return "#dcfce7";
}

function statusBadge(status: string) {
  if (status === "OTVOREN") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    };
  }

  if (status === "IZVRSEN") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (status === "OTKAZAN") {
    return {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  }

  return {
    background: "#e5e7eb",
    color: "#374151",
    border: "1px solid #d1d5db",
  };
}

function bentotestLabel(status?: string | null) {
  if (status === "STABILNO") return "Stabilno";
  if (status === "NESTABILNO") return "Nestabilno";
  return "-";
}

function formatDatum(d?: Date | string | null) {
  if (!d) return "-";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("hr-HR");
}

function formatDatumSamoDan(d?: Date | string | null) {
  if (!d) return "-";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("hr-HR");
}

function formatBroj(v?: number | null, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function Param({
  label,
  value,
  unit,
  min,
  max,
}: {
  label: string;
  value: number | null;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const hasValue = value != null;

  return (
    <div
      style={{
        border: "1px solid #e4c7cc",
        background: hasValue ? boja(value, min, max) : "#ffffff",
        padding: 16,
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "rgba(136, 19, 55, 0.75)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 28,
          lineHeight: 1,
          fontWeight: 600,
          color: "#292524",
        }}
      >
        {hasValue ? value : "—"}
        {hasValue && unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #e4c7cc",
        background:
          "linear-gradient(to bottom, #ffffff, rgba(255,241,242,0.55))",
        padding: 14,
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#78716c",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#292524",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function KarticaBroj({
  naslov,
  vrijednost,
  podnaslov,
}: {
  naslov: string;
  vrijednost: string;
  podnaslov?: string;
}) {
  return (
    <div
      className="border border-rose-200 bg-gradient-to-b from-white to-rose-50/70 px-4 py-4 shadow-sm"
      style={{ fontFamily: "Calibri, Segoe UI, Arial, sans-serif" }}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-rose-800/70">
        {naslov}
      </div>
      <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">
        {vrijednost}
      </div>
      {podnaslov ? (
        <div className="mt-2 text-[12px] text-stone-500">{podnaslov}</div>
      ) : null}
    </div>
  );
}

function Oznaka({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "soft" | "strong" | "success" | "danger";
}) {
  const cls =
    variant === "strong"
      ? "border-rose-300 bg-gradient-to-b from-rose-100 to-red-100 text-rose-950"
      : variant === "soft"
        ? "border-stone-200 bg-stone-50 text-stone-700"
        : variant === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : variant === "danger"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-rose-200 bg-rose-50 text-rose-900";

  return (
    <span className={`inline-flex border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Card({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="border border-rose-200 bg-gradient-to-b from-white to-rose-50/60 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-200 px-4 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-stone-800">{title}</h2>
        </div>
        {right ? right : null}
      </div>

      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

type PovijestStavka =
  | {
      tip: "MJERENJE";
      datum: Date;
      id: string;
      naslov: string;
      opis: string;
    }
  | {
      tip: "ZADATAK";
      datum: Date;
      id: string;
      naslov: string;
      opis: string;
      status: string;
    };

function opisArhivaZadatka(
  z: {
    preparatNaziv?: string | null;
    doza?: number | null;
    jedinicaNaziv?: string | null;
    izracunataKolicina?: number | null;
    izlaznaJedinicaNaziv?: string | null;
    stavke?: Array<{
      preparatNaziv?: string | null;
      doza?: number | null;
      jedinicaNaziv?: string | null;
      izracunataKolicina?: number | null;
      izlaznaJedinicaNaziv?: string | null;
    }>;
  }
) {
  if (z.stavke && z.stavke.length > 0) {
    return z.stavke
      .map((s, index) => {
        const naziv = s.preparatNaziv ?? "-";
        const doza = `${s.doza ?? "-"} ${s.jedinicaNaziv ?? ""}`.trim();
        const ukupno = `${s.izracunataKolicina ?? "-"} ${
          s.izlaznaJedinicaNaziv ?? ""
        }`.trim();

        return `${index + 1}. ${naziv} | doza: ${doza} | ukupno: ${ukupno}`;
      })
      .join("\n");
  }

  return (
    `${z.preparatNaziv ?? ""}` +
    ` | doza: ${z.doza ?? "-"} ${z.jedinicaNaziv ?? ""}` +
    ` | ukupno: ${z.izracunataKolicina ?? "-"} ${z.izlaznaJedinicaNaziv ?? ""}`
  );
}

export default async function ArhivaDetaljPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const arhiva = await prisma.arhivaVina.findUnique({
    where: { id },
    include: {
      mjerenja: {
        orderBy: {
          izmjerenoAt: "desc",
        },
      },
      zadaci: {
        orderBy: {
          zadanoAt: "desc",
        },
        include: {
          stavke: {
            orderBy: {
              redoslijed: "asc",
            },
          },
        },
      },
      udjeliSorti: {
        orderBy: {
          postotak: "desc",
        },
      },
      dokumenti: {
        orderBy: [{ datumDokumenta: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!arhiva) return notFound();

  const zadnje = arhiva.mjerenja[0] ?? null;

  const otvoreniZadaci = arhiva.zadaci.filter((z) => z.status === "OTVOREN");
  const izvrseniZadaci = arhiva.zadaci.filter((z) => z.status === "IZVRSEN");

  const povijest: PovijestStavka[] = [
    ...arhiva.mjerenja.map((m) => ({
      tip: "MJERENJE" as const,
      datum: new Date(m.izmjerenoAt),
      id: m.id,
      naslov: "Mjerenje",
      opis:
        `Temp: ${m.temperatura ?? "-"}°C | pH: ${m.ph ?? "-"} | SO2: ${
          m.slobodniSO2 ?? "-"
        } | Šećer: ${m.secer ?? "-"} | Alkohol: ${m.alkohol ?? "-"} | Bentotest: ${bentotestLabel(
          (m as any).bentotestStatus
        )}`,
    })),
    ...izvrseniZadaci.map((z) => ({
      tip: "ZADATAK" as const,
      datum: new Date(z.izvrsenoAt ?? z.zadanoAt),
      id: z.id,
      naslov: z.naslov ?? "Zadatak",
      opis: opisArhivaZadatka(z),
      status: z.status,
    })),
  ].sort((a, b) => b.datum.getTime() - a.datum.getTime());

  const napomenaTekst = arhiva.napomena ?? "";
  const matchBoca = napomenaTekst.match(/Napunjeno\s+(\d+)/i);
  const matchVolumen = napomenaTekst.match(/od\s+([\d.,]+)\s*L/i);
  const matchProdaja = napomenaTekst.match(/Prodano rinfuza\s+([\d.,]+)/i);

  const brojBocaIzNapomene = matchBoca ? Number(matchBoca[1]) : null;
  const volumenBoceIzNapomene = matchVolumen
    ? Number(matchVolumen[1].replace(",", "."))
    : null;
  const litaraProdanoIzNapomene = matchProdaja
    ? Number(matchProdaja[1].replace(",", "."))
    : null;

  const punjenja: any[] = [];
  const zadnjePunjenje = null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f3f1_0%,#f9f3f4_45%,#fdf7f8_100%)] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1540px]">
        <div className="mb-4 border border-rose-200 bg-gradient-to-r from-rose-950/95 via-rose-900/90 to-stone-900/80 px-5 py-6 text-white shadow-[0_18px_36px_rgba(127,29,29,0.14)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/65">
                ARHIVA / DETALJ
              </div>
              <h1 className="mt-1 text-[30px] font-semibold tracking-tight">
                Arhiva tanka {arhiva.brojTanka}
              </h1>
              <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-white/80">
                Arhivirani pregled sadržaja tanka, mjerenja, zadataka, završnog
                izlaza i dokumenata.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <NatragNaPrethodnu />
              <Link
                href="/dashboard"
                className="border border-white/20 bg-white/90 px-4 py-2 text-[13px] font-medium text-stone-700 transition hover:bg-white"
              >
                Glavni meni
              </Link>
              <Link
                href="/arhiva"
                className="border border-white/20 bg-white/90 px-4 py-2 text-[13px] font-medium text-stone-700 transition hover:bg-white"
              >
                Arhiva
              </Link>
              <Link
                href="/tankovi"
                className="border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-white/20"
              >
                Popis tankova
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Oznaka>{`Sorta: ${arhiva.sorta ?? "-"}`}</Oznaka>
            <Oznaka>{`Naziv vina: ${arhiva.nazivVina ?? "-"}`}</Oznaka>
            <Oznaka variant="soft">{`Tip: ${arhiva.tipTanka ?? "-"}`}</Oznaka>
            <Oznaka variant="strong">{`Količina prije arhive: ${formatBroj(
              arhiva.kolicinaVina ?? 0,
              0
            )} L`}</Oznaka>
            <Oznaka variant="success">{`Arhivirano: ${formatDatum(
              arhiva.arhiviranoAt
            )}`}</Oznaka>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <KarticaBroj
            naslov="Broj tanka"
            vrijednost={String(arhiva.brojTanka ?? "-")}
          />
          <KarticaBroj
            naslov="Količina prije pražnjenja"
            vrijednost={`${formatBroj(arhiva.kolicinaVina, 0)} L`}
          />
          <KarticaBroj
            naslov="Kapacitet tanka"
            vrijednost={`${formatBroj(arhiva.kapacitetTanka, 0)} L`}
          />
          <KarticaBroj
            naslov="Otvoreni zadaci"
            vrijednost={String(otvoreniZadaci.length)}
          />
        </div>

        <Card title="Završni izlaz vina">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <KarticaBroj
              naslov="Datum završetka"
              vrijednost={formatDatumSamoDan(arhiva.arhiviranoAt)}
              podnaslov={formatDatum(arhiva.arhiviranoAt)}
            />
            <KarticaBroj
              naslov="Broj boca"
              vrijednost={
                brojBocaIzNapomene != null
                  ? formatBroj(brojBocaIzNapomene, 0)
                  : "-"
              }
              podnaslov="Završno punjenje"
            />
            <KarticaBroj
              naslov="Volumen boce"
              vrijednost={
                volumenBoceIzNapomene != null
                  ? `${formatBroj(volumenBoceIzNapomene, 2)} L`
                  : "-"
              }
              podnaslov="Po boci"
            />
            <KarticaBroj
              naslov="Prodano / punjeno"
              vrijednost={
                litaraProdanoIzNapomene != null
                  ? `${formatBroj(litaraProdanoIzNapomene, 0)} L`
                  : `${formatBroj(arhiva.kolicinaVina, 0)} L`
              }
              podnaslov="Završni izlaz"
            />
            <KarticaBroj
              naslov="Status"
              vrijednost="TANK ISPRAŽNJEN"
              podnaslov="Arhiva završena"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {brojBocaIzNapomene != null ? (
              <Oznaka variant="strong">
                Napunjeno {formatBroj(brojBocaIzNapomene, 0)} boca
              </Oznaka>
            ) : null}
            {volumenBoceIzNapomene != null ? (
              <Oznaka variant="soft">
                Volumen boce: {formatBroj(volumenBoceIzNapomene, 2)} L
              </Oznaka>
            ) : null}
            {litaraProdanoIzNapomene != null ? (
              <Oznaka variant="danger">
                Prodaja / rinfuza: {formatBroj(litaraProdanoIzNapomene, 0)} L
              </Oznaka>
            ) : (
              <Oznaka variant="success">
                Završno zatvaranje tanka: {formatBroj(arhiva.kolicinaVina, 0)} L
              </Oznaka>
            )}
            <Oznaka variant="success">Tank je očišćen za novi ciklus</Oznaka>
          </div>

          {arhiva.napomena ? (
            <div className="mt-4 border border-rose-200 bg-white px-4 py-4 text-[14px] leading-6 text-stone-700">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                Zabilješka završnog izlaza
              </div>
              <div className="mt-2 whitespace-pre-wrap">{arhiva.napomena}</div>
            </div>
          ) : null}
        </Card>

        <div className="mb-4 border border-dashed border-rose-200 bg-white px-4 py-4 text-[13px] text-stone-600">
          Detalji punjenja privremeno su skriveni dok se nova arhivska tablica ne
          sinkronizira s bazom.
        </div>

        <div className="grid gap-4">
          <Card
            title="Dokumenti vina"
            right={
              <div className="border border-rose-200 bg-white px-3 py-1 text-[12px] text-stone-600">
                Ukupno: {arhiva.dokumenti.length}
              </div>
            }
          >
            {arhiva.dokumenti.length === 0 ? (
              <div className="border border-dashed border-rose-200 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
                Nema spremljenih dokumenata.
              </div>
            ) : (
              <div className="grid gap-3">
                {arhiva.dokumenti.map((d, index) => (
                  <div
                    key={d.id}
                    className={`border border-rose-200 px-4 py-4 ${
                      index % 2 === 0 ? "bg-white" : "bg-rose-50/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-[240px] flex-1">
                        <div className="text-[15px] font-semibold text-stone-800">
                          {d.naziv}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Oznaka>{d.vrsta}</Oznaka>
                          <Oznaka variant="soft">
                            Datum dokumenta:{" "}
                            {d.datumDokumenta
                              ? formatDatumSamoDan(d.datumDokumenta)
                              : "-"}
                          </Oznaka>
                          <Oznaka variant="soft">
                            Dodao: {d.uploadedByIme ?? "-"}
                          </Oznaka>
                        </div>
                        <div className="mt-3 text-[13px] text-stone-600">
                          <span className="font-medium text-stone-700">
                            Napomena:
                          </span>{" "}
                          {d.napomena ?? "-"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] font-medium text-sky-700 transition hover:bg-sky-100"
                        >
                          Otvori
                        </a>

                        <a
                          href={d.fileUrl}
                          download
                          className="inline-flex items-center justify-center border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100"
                        >
                          Preuzmi
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Zadnje mjerenje">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Param
                label="Temperatura"
                value={zadnje?.temperatura ?? null}
                unit="°C"
              />
              <Param label="pH" value={zadnje?.ph ?? null} />
              <Param label="Šećer" value={zadnje?.secer ?? null} />
              <Param
                label="Alkohol"
                value={zadnje?.alkohol ?? null}
                unit="%"
              />
              <Param
                label="Ukupne kiseline"
                value={zadnje?.ukupneKiseline ?? null}
              />
              <Param
                label="Hlapive kiseline"
                value={zadnje?.hlapiveKiseline ?? null}
              />
              <Param label="SO2 slobodni" value={zadnje?.slobodniSO2 ?? null} />
              <Param label="SO2 ukupni" value={zadnje?.ukupniSO2 ?? null} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <InfoBox
                label="Datum bentotesta"
                value={formatDatumSamoDan((zadnje as any)?.bentotestDatum)}
              />
              <InfoBox
                label="Bentotest status"
                value={bentotestLabel((zadnje as any)?.bentotestStatus)}
              />
              <InfoBox
                label="Zadnje mjerenje"
                value={
                  zadnje?.izmjerenoAt
                    ? formatDatum(zadnje.izmjerenoAt)
                    : "Nema mjerenja"
                }
              />
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Sastav vina">
              {arhiva.udjeliSorti?.length ? (
                <div className="grid gap-3">
                  {arhiva.udjeliSorti.map((u, index) => (
                    <div
                      key={u.id}
                      className={`border border-rose-200 px-4 py-4 ${
                        index % 2 === 0 ? "bg-white" : "bg-rose-50/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[14px] font-semibold text-stone-800">
                          {u.nazivSorte}
                        </div>
                        <div className="text-[15px] font-semibold text-stone-800">
                          {formatBroj(Number(u.postotak), 2)}%
                        </div>
                      </div>

                      <div className="mt-3 h-[10px] w-full border border-rose-200 bg-white">
                        <div
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, Number(u.postotak))
                            )}%`,
                          }}
                          className="h-full bg-gradient-to-r from-rose-200 via-rose-400 to-rose-700"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-rose-200 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
                  Nema podataka o sastavu vina.
                </div>
              )}
            </Card>

            <Card title="Otvoreni zadaci">
              {otvoreniZadaci.length === 0 ? (
                <div className="border border-dashed border-rose-200 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
                  Nema otvorenih zadataka.
                </div>
              ) : (
                <div className="grid gap-3">
                  {otvoreniZadaci.map((z, index) => {
                    const imaStavke = z.stavke && z.stavke.length > 0;

                    return (
                      <details
                        key={z.id}
                        className={`border border-rose-200 ${
                          index % 2 === 0 ? "bg-white" : "bg-rose-50/40"
                        }`}
                      >
                        <summary className="cursor-pointer list-none px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-[15px] font-semibold text-stone-800">
                              {z.naslov ?? "Zadatak"}
                            </div>

                            <span
                              style={{
                                padding: "4px 10px",
                                fontSize: 12,
                                fontWeight: 700,
                                ...statusBadge(z.status),
                              }}
                            >
                              {z.status}
                            </span>
                          </div>

                          <div className="mt-2 text-[13px] text-stone-500">
                            {imaStavke
                              ? `${z.stavke.length} preparata`
                              : `${z.preparatNaziv ?? "Bez preparata"}`}
                          </div>
                        </summary>

                        <div className="border-t border-rose-200 px-4 py-4">
                          <div className="grid gap-2 text-[13px] text-stone-600">
                            <div>Vrsta: {z.vrsta}</div>

                            {imaStavke ? (
                              <>
                                <div>Broj preparata: {z.stavke.length}</div>
                                <div className="mt-2 grid gap-2">
                                  {z.stavke.map((s, sIndex) => (
                                    <div
                                      key={s.id}
                                      className="border border-rose-200 bg-white px-3 py-3"
                                    >
                                      <div className="font-medium text-stone-800">
                                        {sIndex + 1}. {s.preparatNaziv ?? "-"}
                                      </div>
                                      <div className="mt-1 text-[13px] text-stone-600">
                                        Doza: {s.doza ?? "-"} {s.jedinicaNaziv ?? ""}
                                      </div>
                                      <div className="text-[13px] text-stone-600">
                                        Ukupno: {s.izracunataKolicina ?? "-"}{" "}
                                        {s.izlaznaJedinicaNaziv ?? ""}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <>
                                <div>Preparat: {z.preparatNaziv ?? "-"}</div>
                                <div>
                                  Doza: {z.doza ?? "-"} {z.jedinicaNaziv ?? ""}
                                </div>
                                <div>
                                  Ukupno: {z.izracunataKolicina ?? "-"}{" "}
                                  {z.izlaznaJedinicaNaziv ?? ""}
                                </div>
                              </>
                            )}

                            <div>Napomena: {z.napomena ?? "-"}</div>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card
            title="Povijest arhiviranog sadržaja"
            right={
              <div className="border border-rose-200 bg-white px-3 py-1 text-[12px] text-stone-600">
                Ukupno: {povijest.length}
              </div>
            }
          >
            {povijest.length === 0 ? (
              <div className="border border-dashed border-rose-200 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
                Nema podataka u povijesti.
              </div>
            ) : (
              <div className="grid gap-3">
                {povijest.map((p, index) => (
                  <details
                    key={p.id}
                    className={`border border-rose-200 ${
                      index % 2 === 0 ? "bg-white" : "bg-rose-50/40"
                    }`}
                  >
                    <summary className="cursor-pointer list-none px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[14px] font-semibold text-stone-800">
                            {p.tip}
                          </div>

                          {"status" in p && (
                            <span
                              style={{
                                padding: "4px 10px",
                                fontSize: 12,
                                fontWeight: 700,
                                ...statusBadge(p.status),
                              }}
                            >
                              {p.status}
                            </span>
                          )}
                        </div>

                        <div className="text-[13px] text-stone-500">
                          {p.datum.toLocaleString("hr-HR")}
                        </div>
                      </div>

                      <div className="mt-2 text-[14px] font-semibold text-stone-800">
                        {p.naslov}
                      </div>
                    </summary>

                    <div className="border-t border-rose-200 px-4 py-4">
                      <div className="whitespace-pre-wrap text-[13px] text-stone-600">
                        {p.opis}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Sva mjerenja"
            right={
              <div className="border border-rose-200 bg-white px-3 py-1 text-[12px] text-stone-600">
                Ukupno: {arhiva.mjerenja.length}
              </div>
            }
          >
            {arhiva.mjerenja.length === 0 ? (
              <div className="border border-dashed border-rose-200 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
                Nema arhiviranih mjerenja.
              </div>
            ) : (
              <div className="grid gap-3">
                {arhiva.mjerenja.map((m, index) => (
                  <div
                    key={m.id}
                    className={`border border-rose-200 px-4 py-4 ${
                      index % 2 === 0 ? "bg-white" : "bg-rose-50/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[15px] font-semibold text-stone-800">
                        Mjerenje
                      </div>
                      <div className="text-[13px] text-stone-500">
                        {formatDatum(m.izmjerenoAt)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <InfoBox label="Alkohol" value={m.alkohol ?? "-"} />
                      <InfoBox label="pH" value={m.ph ?? "-"} />
                      <InfoBox label="Šećer" value={m.secer ?? "-"} />
                      <InfoBox
                        label="Temperatura"
                        value={`${m.temperatura ?? "-"} °C`}
                      />
                      <InfoBox
                        label="Ukupne kiseline"
                        value={m.ukupneKiseline ?? "-"}
                      />
                      <InfoBox
                        label="Hlapive kiseline"
                        value={m.hlapiveKiseline ?? "-"}
                      />
                      <InfoBox
                        label="SO2 slobodni"
                        value={m.slobodniSO2 ?? "-"}
                      />
                      <InfoBox
                        label="SO2 ukupni"
                        value={m.ukupniSO2 ?? "-"}
                      />
                      <InfoBox
                        label="Bentotest datum"
                        value={formatDatumSamoDan((m as any).bentotestDatum)}
                      />
                      <InfoBox
                        label="Bentotest status"
                        value={bentotestLabel((m as any).bentotestStatus)}
                      />
                    </div>

                    <div className="mt-3 text-[13px] text-stone-600">
                      <span className="font-medium text-stone-700">Napomena:</span>{" "}
                      {m.napomena ?? "-"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Svi zadaci"
            right={
              <div className="border border-rose-200 bg-white px-3 py-1 text-[12px] text-stone-600">
                Ukupno: {arhiva.zadaci.length}
              </div>
            }
          >
            {arhiva.zadaci.length === 0 ? (
              <div className="border border-dashed border-rose-200 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
                Nema arhiviranih zadataka.
              </div>
            ) : (
              <div className="grid gap-3">
                {arhiva.zadaci.map((z, index) => {
                  const imaStavke = z.stavke && z.stavke.length > 0;

                  return (
                    <details
                      key={z.id}
                      className={`border border-rose-200 ${
                        index % 2 === 0 ? "bg-white" : "bg-rose-50/40"
                      }`}
                    >
                      <summary className="cursor-pointer list-none px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-[15px] font-semibold text-stone-800">
                            {z.naslov ?? "Zadatak"}
                          </div>

                          <span
                            style={{
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              ...statusBadge(z.status),
                            }}
                          >
                            {z.status}
                          </span>
                        </div>

                        <div className="mt-2 text-[13px] text-stone-500">
                          {imaStavke
                            ? `${z.stavke.length} preparata`
                            : `${z.preparatNaziv ?? "Bez preparata"}`}
                        </div>
                      </summary>

                      <div className="border-t border-rose-200 px-4 py-4">
                        <div className="grid gap-2 text-[13px] text-stone-600">
                          <div>Vrsta: {z.vrsta}</div>

                          {imaStavke ? (
                            <>
                              <div>Broj preparata: {z.stavke.length}</div>
                              <div className="mt-2 grid gap-2">
                                {z.stavke.map((s, sIndex) => (
                                  <div
                                    key={s.id}
                                    className="border border-rose-200 bg-white px-3 py-3"
                                  >
                                    <div className="font-medium text-stone-800">
                                      {sIndex + 1}. {s.preparatNaziv ?? "-"}
                                    </div>
                                    <div className="mt-1 text-[13px] text-stone-600">
                                      Doza: {s.doza ?? "-"} {s.jedinicaNaziv ?? ""}
                                    </div>
                                    <div className="text-[13px] text-stone-600">
                                      Ukupno: {s.izracunataKolicina ?? "-"}{" "}
                                      {s.izlaznaJedinicaNaziv ?? ""}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <>
                              <div>Preparat: {z.preparatNaziv ?? "-"}</div>
                              <div>
                                Doza: {z.doza ?? "-"} {z.jedinicaNaziv ?? ""}
                              </div>
                              <div>
                                Ukupno: {z.izracunataKolicina ?? "-"}{" "}
                                {z.izlaznaJedinicaNaziv ?? ""}
                              </div>
                            </>
                          )}

                          <div>Zadao: {z.zadaoKorisnikIme ?? "-"}</div>
                          <div>Izvršio: {z.izvrsioKorisnikIme ?? "-"}</div>
                          <div>Zadano: {formatDatum(z.zadanoAt)}</div>
                          <div>
                            Izvršeno: {z.izvrsenoAt ? formatDatum(z.izvrsenoAt) : "-"}
                          </div>
                          <div>Napomena: {z.napomena ?? "-"}</div>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}