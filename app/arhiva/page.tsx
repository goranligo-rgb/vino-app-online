"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Arhiva = {
  id: string;
  tankId: string;
  brojTanka: number;
  sorta: string | null;
  kolicinaVina: number;
  kapacitetTanka: number | null;
  tipTanka: string | null;
  arhiviranoAt: string;
  napomena: string | null;
};

function formatBroj(v?: number | null, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatDatumVrijeme(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("hr-HR");
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
    <div className="border border-rose-200 bg-gradient-to-b from-white to-rose-50/70 px-4 py-4 shadow-sm">
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
  variant?: "default" | "soft" | "strong";
}) {
  const cls =
    variant === "strong"
      ? "border-rose-300 bg-gradient-to-b from-rose-100 to-red-100 text-rose-950"
      : variant === "soft"
      ? "border-stone-200 bg-stone-50 text-stone-700"
      : "border-rose-200 bg-rose-50 text-rose-900";

  return (
    <span className={`inline-flex border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

export default function ArhivaPage() {
  const router = useRouter();
  const [data, setData] = useState<Arhiva[]>([]);
  const [poruka, setPoruka] = useState("");

  async function ucitajArhivu() {
    try {
      const res = await fetch("/api/arhiva", { cache: "no-store" });
      const rezultat = await res.json();
      setData(Array.isArray(rezultat) ? rezultat : []);
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod učitavanja arhive.");
    }
  }

  useEffect(() => {
    ucitajArhivu();
  }, []);

  async function obrisiZapis(id: string) {
    const potvrda = confirm("Obrisati ovaj arhivski zapis? Ovo je trajno.");
    if (!potvrda) return;

    setPoruka("");

    try {
      const res = await fetch("/api/arhiva", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const rezultat = await res.json().catch(() => null);

      if (!res.ok) {
        setPoruka(rezultat?.error || "Brisanje arhivskog zapisa nije uspjelo.");
        return;
      }

      setData((prev) => prev.filter((red) => red.id !== id));
      setPoruka("Arhivski zapis je obrisan.");
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod brisanja arhivskog zapisa.");
    }
  }

  async function obrisiSveZaTank(tankId: string, brojTanka: number) {
    const potvrda = confirm(
      `Obrisati cijelu arhivu za tank ${brojTanka}? Ovo je trajno.`
    );
    if (!potvrda) return;

    setPoruka("");

    try {
      const res = await fetch("/api/arhiva", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tankId }),
      });

      const rezultat = await res.json().catch(() => null);

      if (!res.ok) {
        setPoruka(rezultat?.error || "Brisanje arhive za tank nije uspjelo.");
        return;
      }

      setData((prev) => prev.filter((red) => red.tankId !== tankId));
      setPoruka(
        `Obrisano zapisa za tank ${brojTanka}: ${rezultat?.obrisano ?? 0}.`
      );
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod brisanja arhive za tank.");
    }
  }

  const ukupnoZapisa = data.length;

  const ukupnoLitara = useMemo(() => {
    return data.reduce((sum, row) => sum + Number(row.kolicinaVina ?? 0), 0);
  }, [data]);

  const brojTankova = useMemo(() => {
    return new Set(data.map((row) => row.tankId)).size;
  }, [data]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f3f1_0%,#f9f3f4_45%,#fdf7f8_100%)] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1540px]">
        <div className="mb-4 border border-rose-200 bg-gradient-to-r from-rose-950/95 via-rose-900/90 to-stone-900/80 px-5 py-6 text-white shadow-[0_18px_36px_rgba(127,29,29,0.14)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/65">
                ARHIVA / TANKOVI
              </div>
              <h1 className="mt-1 text-[30px] font-semibold tracking-tight">
                Arhiva tankova
              </h1>
              <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-white/80">
                Pregled arhiviranih stanja tankova, količina, sorti i napomena,
                s mogućnošću otvaranja pojedinog zapisa ili brisanja arhive.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/tankovi")}
                className="border border-white/20 bg-white/90 px-4 py-2 text-[13px] font-medium text-stone-700 transition hover:bg-white"
              >
                Povratak na tankove
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <KarticaBroj naslov="Ukupno zapisa" vrijednost={String(ukupnoZapisa)} />
          <KarticaBroj
            naslov="Ukupno litara u arhivi"
            vrijednost={`${formatBroj(ukupnoLitara, 0)} L`}
          />
          <KarticaBroj naslov="Tankovi u arhivi" vrijednost={String(brojTankova)} />
        </div>

        {poruka ? (
          <div className="mb-4 border border-rose-200 bg-white/90 px-4 py-3 text-[13px] text-stone-700 shadow-sm">
            {poruka}
          </div>
        ) : null}

        <div className="border border-rose-200 bg-gradient-to-b from-white to-rose-50/60 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-200 px-4 py-4">
            <div>
              <h2 className="text-[17px] font-semibold text-stone-800">
                Popis arhivskih zapisa
              </h2>
              <p className="mt-1 text-[13px] text-stone-500">
                Pregled svih spremljenih arhiviranih stanja po tankovima.
              </p>
            </div>

            <div className="border border-rose-200 bg-white px-3 py-1 text-[12px] text-stone-600">
              Ukupno: {ukupnoZapisa}
            </div>
          </div>

          {data.length === 0 ? (
            <div className="border-t border-dashed border-rose-200 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
              Nema arhivskih zapisa.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-rose-200 bg-rose-50/70 text-left">
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Datum
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Tank
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Sorta
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Količina
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Kapacitet
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Tip
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Napomena
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Akcije
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {data.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`border-b border-rose-100 align-top text-[13px] transition hover:bg-white ${
                        index % 2 === 0 ? "bg-white/75" : "bg-rose-50/30"
                      }`}
                    >
                      <td className="px-4 py-4 text-stone-600 whitespace-nowrap">
                        {formatDatumVrijeme(row.arhiviranoAt)}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-stone-800">
                          Tank {row.brojTanka}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        {row.sorta ? (
                          <Oznaka>{row.sorta}</Oznaka>
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-4 font-medium text-stone-700 whitespace-nowrap">
                        {formatBroj(row.kolicinaVina, 0)} L
                      </td>

                      <td className="px-4 py-4 text-stone-600 whitespace-nowrap">
                        {formatBroj(row.kapacitetTanka, 0)} L
                      </td>

                      <td className="px-4 py-4">
                        {row.tipTanka ? (
                          <Oznaka variant="soft">{row.tipTanka}</Oznaka>
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-stone-600 min-w-[220px]">
                        {row.napomena ?? "-"}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={`/arhiva/${row.id}`}
                            className="inline-flex items-center justify-center border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] font-medium text-sky-700 transition hover:bg-sky-100"
                          >
                            Otvori
                          </Link>

                          <button
                            type="button"
                            onClick={() => obrisiZapis(row.id)}
                            className="inline-flex items-center justify-center border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100"
                          >
                            Obriši zapis
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              obrisiSveZaTank(row.tankId, row.brojTanka)
                            }
                            className="inline-flex items-center justify-center border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 transition hover:bg-red-100"
                          >
                            Obriši sve za tank
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}