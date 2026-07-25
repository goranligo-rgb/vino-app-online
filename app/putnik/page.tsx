"use client";

import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { useEffect, useMemo, useState } from "react";
import { otvoriDanasnjiPosjet } from "./kupci/[id]/posjet/actions";
import PutnikIzbornik from "./putnik-izbornik";
import { citajAuthUserKlijent } from "@/lib/auth-klijent";

type Kupac = {
  id: string;
  nazivLokala: string;
  nazivFirme: string | null;
  vlasnik: string | null;
  kontaktOsoba: string | null;
  telefon: string | null;
  email: string | null;
  adresa: string | null;
  grad: string | null;
  regija: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  tip: string | null;
  status: string | null;
  kategorija: string | null;
  aktivan: boolean;
  zadnjiPosjetDatum: string | null;
};

// Broj dana od zadnjeg posjeta (null ako lokal još nema posjeta).
function daniOdPosjeta(datum: string | null): number | null {
  if (!datum) return null;
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const danas = new Date();
  danas.setHours(0, 0, 0, 0);
  return Math.round((danas.getTime() - d.getTime()) / 86400000);
}

// Vanjske Google karte (bez API ključa): koordinate ako ih ima, inače adresa+grad.
function googleKarteUrl(k: Kupac): string | null {
  if (k.gpsLat != null && k.gpsLng != null) {
    return `https://www.google.com/maps?q=${k.gpsLat},${k.gpsLng}`;
  }
  const adresa = [k.adresa, k.grad].filter(Boolean).join(", ");
  if (adresa) return `https://www.google.com/maps?q=${encodeURIComponent(adresa)}`;
  return null;
}

// Badge dana od zadnjeg posjeta (crveno > 30).
function DaniBadge({ datum }: { datum: string | null }) {
  const dani = daniOdPosjeta(datum);
  if (dani == null) {
    return (
      <span className="inline-flex shrink-0 border border-stone-300 bg-white px-2 py-1 text-[12px] font-semibold text-stone-500">
        Bez posjeta
      </span>
    );
  }
  const crveno = dani > 30;
  return (
    <span
      className={`inline-flex shrink-0 border px-2.5 py-1 text-[12px] font-semibold ${
        crveno ? "border-red-300 bg-red-50 text-red-700" : "border-orange-200 bg-orange-50 text-orange-800"
      }`}
      title={datum ? `Zadnji posjet: ${new Date(datum).toLocaleDateString("hr-HR")}` : undefined}
    >
      {dani === 0 ? "Danas" : `${dani} d`}
    </span>
  );
}

export default function PutnikPage() {
  const [kupci, setKupci] = useState<Kupac[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [prikaziNeaktivne, setPrikaziNeaktivne] = useState(false);
  const [jeAdmin, setJeAdmin] = useState(false);

  // Uloga iz auth_user cookieja. Citanje ide preko citajAuthUserKlijent jer je
  // cookie dvostruko kodiran (login kodira sam + NextResponse.cookies.set opet),
  // pa jedan decodeURIComponent nije dovoljan — raniji inline parse je uvijek
  // pucao i checkbox se nikad nije prikazivao ni adminu.
  // Sluzi SAMO za prikaz; pravu zastitu radi API (ne-admin ne dobije neaktivne).
  useEffect(() => {
    setJeAdmin(citajAuthUserKlijent()?.role === "ADMIN");
  }, []);

  useEffect(() => {
    async function ucitaj() {
      try {
        const res = await fetch("/api/putnik/kupci", { cache: "no-store" });
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
    const lista = kupci.filter((k) => {
      // Neaktivni se skrivaju po defaultu (povijest ostaje, vidljivi uz filtar).
      if (!prikaziNeaktivne && !k.aktivan) return false;
      if (!q) return true;
      return [k.nazivLokala, k.nazivFirme, k.grad, k.kontaktOsoba, k.vlasnik]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    // Najdulje neposjećeni prvi (oni koji "gore") — bez posjeta na vrh.
    return [...lista].sort((a, b) => {
      const da = daniOdPosjeta(a.zadnjiPosjetDatum);
      const db = daniOdPosjeta(b.zadnjiPosjetDatum);
      if (da == null && db == null) return a.nazivLokala.localeCompare(b.nazivLokala);
      if (da == null) return -1;
      if (db == null) return 1;
      return db - da;
    });
  }, [kupci, search, prikaziNeaktivne]);

  const brojNeaktivnih = kupci.filter((k) => !k.aktivan).length;
  const brojAktivnih = kupci.filter((k) => k.aktivan).length;

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />
      <PutnikIzbornik />

      <div className="mx-auto max-w-[1100px] space-y-4">
        {/* SLIM HEADER */}
        {/* pr- zdesna: da fiksni ☰ (gore desno) ne prekrije "+ Novi lokal" */}
        <div className="flex flex-wrap items-center justify-between gap-3 pr-16 xl:pr-0">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-stone-800">Moji lokali</h1>
            <div className="text-[13px] text-stone-500">
              {loading ? "Učitavam…" : `${brojAktivnih} aktivnih lokala`}
            </div>
          </div>
          <Link
            href="/putnik/novi"
            className="inline-flex items-center gap-1 border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
          >
            + Novi lokal
          </Link>
        </div>

        {/* PRETRAGA — glavno, veliko za tablet */}
        <div className="sticky top-2 z-10">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍  Traži lokal — naziv, grad, kontakt…"
            className="w-full border border-orange-300 bg-white py-3.5 pl-4 pr-[76px] text-[16px] shadow-sm outline-none focus:border-orange-500 xl:pr-4"
          />
          {jeAdmin ? (
            <label className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-stone-600">
              <input
                type="checkbox"
                checked={prikaziNeaktivne}
                onChange={(e) => setPrikaziNeaktivne(e.target.checked)}
                className="h-4 w-4 accent-orange-700"
              />
              Prikaži i neaktivne
              {brojNeaktivnih > 0 ? <span className="font-normal text-stone-400">({brojNeaktivnih})</span> : null}
            </label>
          ) : null}
        </div>

        {/* POPIS LOKALA — glavni sadržaj */}
        {loading ? (
          <div className="border border-orange-200 bg-white px-4 py-6 text-center text-[14px] text-stone-500">
            Učitavam lokale…
          </div>
        ) : filtriraniKupci.length === 0 ? (
          <div className="border border-orange-200 bg-white px-4 py-6 text-center text-[14px] text-stone-500">
            Nema pronađenih lokala.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtriraniKupci.map((kupac) => {
              const kartaUrl = googleKarteUrl(kupac);
              const mjesto = [kupac.grad, kupac.regija].filter(Boolean).join(", ");
              const kontakt = [kupac.kontaktOsoba, kupac.telefon].filter(Boolean).join(" · ");
              return (
                <div
                  key={kupac.id}
                  className={`group relative border p-4 transition hover:shadow-sm ${
                    kupac.aktivan
                      ? "border-orange-200 bg-white hover:border-orange-300"
                      : "border-stone-300 bg-stone-50 hover:border-stone-400"
                  }`}
                >
                  {/* Cijela kartica je klikabilna — overlay preko cijele plohe. */}
                  <Link
                    href={`/putnik/kupci/${kupac.id}`}
                    aria-label={`Otvori ${kupac.nazivLokala}`}
                    className="absolute inset-0"
                  />

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[17px] font-semibold leading-snug text-stone-800 group-hover:text-orange-900">
                        {kupac.nazivLokala}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-stone-500">
                        {mjesto || kupac.nazivFirme || "—"}
                      </div>
                      {kontakt ? (
                        <div className="mt-0.5 truncate text-[13px] text-stone-500">{kontakt}</div>
                      ) : null}
                    </div>

                    {/* Male, suptilne akcije — iznad overlaya (z-10) da rade neovisno o kliku kartice. */}
                    <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                      <form action={otvoriDanasnjiPosjet}>
                        <input type="hidden" name="kupacId" value={kupac.id} />
                        <button
                          type="submit"
                          title="Otvori današnji posjet + kamere"
                          aria-label="Posjet"
                          className="flex h-9 w-9 items-center justify-center border border-orange-200 bg-white text-[16px] text-stone-600 hover:border-orange-300 hover:bg-orange-50"
                        >
                          📷
                        </button>
                      </form>
                      {kartaUrl ? (
                        <a
                          href={kartaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Otvori u Google kartama"
                          aria-label="Google karte"
                          className="flex h-9 w-9 items-center justify-center border border-orange-200 bg-white text-[16px] text-stone-600 hover:border-orange-300 hover:bg-orange-50"
                        >
                          📍
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {/* Značke — mirne, uredne */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex border border-orange-100 bg-orange-50/60 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                      Kat {kupac.kategorija || "-"}
                    </span>
                    <DaniBadge datum={kupac.zadnjiPosjetDatum} />
                    {!kupac.aktivan ? (
                      <span className="inline-flex border border-stone-300 bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                        Neaktivan
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sve sekundarne stranice su u bocnom izborniku (☰ gore desno). */}
      </div>
    </main>
  );
}
