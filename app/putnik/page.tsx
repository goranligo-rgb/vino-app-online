"use client";

import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { useEffect, useMemo, useState } from "react";

type Kupac = {
  id: string;
  nazivLokala: string;
  nazivFirme: string | null;
  vlasnik: string | null;
  kontaktOsoba: string | null;
  telefon: string | null;
  email: string | null;
  grad: string | null;
  regija: string | null;
  tip: string | null;
  status: string | null;
  kategorija: string | null;
  aktivan: boolean;
};

function Oznaka({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-900">
      {children}
    </span>
  );
}

function Kartica({
  naslov,
  vrijednost,
  podnaslov,
}: {
  naslov: string;
  vrijednost: string;
  podnaslov?: string;
}) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
        {naslov}
      </div>

      <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">
        {vrijednost}
      </div>

      {podnaslov ? (
        <div className="mt-2 text-[12px] text-stone-500">
          {podnaslov}
        </div>
      ) : null}
    </div>
  );
}

function nazivStatusa(status?: string | null) {
  if (!status) return "-";

  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function nazivTipa(tip?: string | null) {
  if (!tip) return "-";

  return tip
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function PutnikPage() {
  const [kupci, setKupci] = useState<Kupac[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function ucitaj() {
      try {
        const res = await fetch("/api/putnik/kupci", {
          cache: "no-store",
        });

        const data = await res.json();

        setKupci(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setKupci([]);
      } finally {
        setLoading(false);
      }
    }

    ucitaj();
  }, []);

  const filtriraniKupci = useMemo(() => {
    const q = search.toLowerCase().trim();

    if (!q) return kupci;

    return kupci.filter((k) => {
      return [
        k.nazivLokala,
        k.nazivFirme,
        k.grad,
        k.kontaktOsoba,
        k.vlasnik,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [kupci, search]);

  const brojAktivnih = kupci.filter((k) => k.aktivan).length;

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                Putnik / teren CRM
              </h1>

              <div className="mt-1 text-[13px] text-stone-500">
                Pregled lokala i kupaca za terenski rad.
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href="/putnik/ruta"
                className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
              >
                Prodajna ruta
              </Link>

              <Link
                href="/putnik/novi"
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
              >
                + Novi lokal
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Kartica
            naslov="Ukupno lokala"
            vrijednost={String(kupci.length)}
          />

          <Kartica
            naslov="Aktivni"
            vrijednost={String(brojAktivnih)}
          />

          <Kartica
            naslov="Prikaz"
            vrijednost={String(filtriraniKupci.length)}
            podnaslov="nakon filtera"
          />

          <Kartica
            naslov="Modul"
            vrijednost="Teren CRM"
            podnaslov="lokali i kupci"
          />
        </div>

        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Pretraga lokala
              </label>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Naziv lokala, grad, kontakt osoba..."
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              />
            </div>

            <div className="flex items-end">
              <div className="w-full border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-600">
                Ukupno pronađeno:
                <div className="mt-1 text-[24px] font-semibold text-stone-800">
                  {filtriraniKupci.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-stone-800">
              Lokali / kupci
            </h2>

            <Oznaka>{filtriraniKupci.length}</Oznaka>
          </div>

          {loading ? (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
              Učitavam kupce...
            </div>
          ) : filtriraniKupci.length === 0 ? (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
              Nema pronađenih lokala.
            </div>
          ) : (
            <div className="space-y-3">
              {filtriraniKupci.map((kupac) => (
                <div
                  key={kupac.id}
                  className="border border-orange-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                          Lokal
                        </div>

                        <div className="mt-1 text-[18px] font-semibold text-stone-800">
                          {kupac.nazivLokala}
                        </div>

                        <div className="mt-1 text-[13px] text-stone-500">
                          {kupac.nazivFirme || "-"}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                          Kontakt
                        </div>

                        <div className="mt-1 text-[15px] font-semibold text-stone-800">
                          {kupac.kontaktOsoba || "-"}
                        </div>

                        <div className="mt-1 text-[13px] text-stone-500">
                          {kupac.telefon || "-"}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                          Lokacija
                        </div>

                        <div className="mt-1 text-[15px] font-semibold text-stone-800">
                          {kupac.grad || "-"}
                        </div>

                        <div className="mt-1 text-[13px] text-stone-500">
                          {kupac.regija || "-"}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <Oznaka>{nazivTipa(kupac.tip)}</Oznaka>
                        </div>

                        <div>
                          <Oznaka>{nazivStatusa(kupac.status)}</Oznaka>
                        </div>

                        <div>
                          <Oznaka>
                            Kategorija {kupac.kategorija || "-"}
                          </Oznaka>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/putnik/kupci/${kupac.id}`}
                        className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
                      >
                        Otvori lokal
                      </Link>

                      <Link
                        href={`/putnik/kupci/${kupac.id}/anketa/nova`}
                        className="border border-orange-200 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
                      >
                        Nova anketa
                      </Link>
                      
                      <Link
                        href={`/putnik/kupci/${kupac.id}/dogovor/novi`}
                        className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
                      >
                        Novi dogovor
                      </Link>

                      <Link
                        href={`/putnik/kupci/${kupac.id}/uredi`}
                        className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
                      >
                        Uredi kupca
                      </Link>

                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}