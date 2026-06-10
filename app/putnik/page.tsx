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

// Kompaktna statistička kartica (gornji red).
function Statistika({ naslov, vrijednost, podnaslov }: { naslov: string; vrijednost: string; podnaslov?: string }) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">{naslov}</div>
      <div className="mt-1 text-[26px] leading-none font-semibold text-stone-800">{vrijednost}</div>
      {podnaslov ? <div className="mt-1.5 text-[12px] text-stone-500">{podnaslov}</div> : null}
    </div>
  );
}

// Minimalne linijske ikone (stroke = currentColor, prate amber temu).
function Ikona({ glif }: { glif: string }) {
  const putevi: Record<string, React.ReactNode> = {
    ljudi: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 6.5a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    ruta: (
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="18" r="2" />
        <path d="M8 6h6a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8" transform="translate(0 -4)" />
      </>
    ),
    kalendar: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="1.5" />
        <path d="M4 9h16M8 3v4M16 3v4" />
      </>
    ),
    izvjestaj: (
      <>
        <path d="M7 3h7l5 5v13H7z" transform="translate(-1 0)" />
        <path d="M13 3v5h5" transform="translate(-1 0)" />
        <path d="M9 13h6M9 17h6" />
      </>
    ),
    kamion: (
      <>
        <path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z" />
        <circle cx="6" cy="18" r="1.6" />
        <circle cx="17" cy="18" r="1.6" />
      </>
    ),
    poklon: (
      <>
        <rect x="3.5" y="9" width="17" height="11" rx="1" />
        <path d="M3.5 13h17M12 9v11" />
        <path d="M12 9S10.5 4 8 5.5 9.5 9 12 9zM12 9s1.5-5 4-3.5S14.5 9 12 9z" />
      </>
    ),
    kutija: (
      <>
        <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
        <path d="M4 8l8 4 8-4M12 12v8" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      {putevi[glif]}
    </svg>
  );
}

// Navigacijska kartica: ikona + naslov + jednorečenični opis.
function NavKartica({ href, glif, naslov, opis, istaknuto }: { href: string; glif: string; naslov: string; opis: string; istaknuto?: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-2 border p-4 transition hover:shadow-sm ${
        istaknuto
          ? "border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 hover:brightness-[1.02]"
          : "border-orange-200 bg-white hover:border-orange-400"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-orange-200 bg-orange-50 text-orange-800">
          <Ikona glif={glif} />
        </span>
        <span className="text-[16px] font-semibold leading-tight text-stone-800 group-hover:text-orange-900">{naslov}</span>
      </div>
      <p className="text-[13px] leading-snug text-stone-500">{opis}</p>
    </Link>
  );
}

// Grupa kartica s naslovom toka rada.
function Grupa({ naslov, podnaslov, children }: { naslov: string; podnaslov: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-orange-800/80">{naslov}</h2>
        <span className="text-[12px] text-stone-400">{podnaslov}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function nazivStatusa(status?: string | null) {
  if (!status) return "-";
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

function nazivTipa(tip?: string | null) {
  if (!tip) return "-";
  return tip.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function PutnikPage() {
  const [kupci, setKupci] = useState<Kupac[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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
    if (!q) return kupci;
    return kupci.filter((k) =>
      [k.nazivLokala, k.nazivFirme, k.grad, k.kontaktOsoba, k.vlasnik]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [kupci, search]);

  // Brzi pregled — sve izvedeno iz već učitanih kupaca (bez novih upita).
  const brojAktivnih = kupci.filter((k) => k.aktivan).length;
  const brojKatA = kupci.filter((k) => k.kategorija === "A").length;
  const brojPotencijalnih = kupci.filter((k) => k.status === "POTENCIJALNI").length;

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-5">
        {/* HEADER */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">Putnik / teren CRM</h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Početna modula — terenski rad, ruta i plan, te roba u vozilu i vinariji.
              </div>
            </div>
            <Link
              href="/putnik/novi"
              className="inline-flex items-center gap-2 self-start border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
            >
              <Ikona glif="plus" /> Novi lokal
            </Link>
          </div>
        </div>

        {/* BRZI PREGLED */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Statistika naslov="Ukupno lokala" vrijednost={loading ? "…" : String(kupci.length)} />
          <Statistika naslov="Aktivni" vrijednost={loading ? "…" : String(brojAktivnih)} podnaslov="trenutno kupuju" />
          <Statistika naslov="Kategorija A" vrijednost={loading ? "…" : String(brojKatA)} podnaslov="mjesečni obilazak" />
          <Statistika naslov="Potencijalni" vrijednost={loading ? "…" : String(brojPotencijalnih)} podnaslov="još ne kupuju" />
        </div>

        {/* NAVIGACIJA — grupe po toku rada */}
        <div className="space-y-5">
          <Grupa naslov="Teren" podnaslov="svakodnevni rad kod kupca">
            <NavKartica
              href="#lokali"
              glif="ljudi"
              naslov="Lokali i kupci"
              opis="Pretraga i pregled lokala. Otvori lokal za posjet, anketu ili dogovor."
            />
            <NavKartica
              href="/putnik/novi"
              glif="plus"
              naslov="Novi lokal"
              opis="Dodaj novi lokal / kupca u bazu."
            />
          </Grupa>

          <Grupa naslov="Ruta i plan" podnaslov="organizacija i pregled dana">
            <NavKartica
              href="/putnik/ruta"
              glif="ruta"
              naslov="Prodajna ruta"
              opis="Plan obilaska po ABC(D) kadenci — tko je danas na redu."
            />
            <NavKartica
              href="/putnik/dnevni-rad"
              glif="kalendar"
              naslov="Dnevni rad"
              opis="Što je putnik taj dan odradio: prodaja, dogovori, gratis, promo."
            />
            <NavKartica
              href="/putnik/dnevni-izvjestaj"
              glif="izvjestaj"
              naslov="Dnevni izvještaj"
              opis="Zbirni izvještaj posjeta — kilometri, aktivnosti, dug."
            />
          </Grupa>

          <Grupa naslov="Roba" podnaslov="što putnik nosi i što vinarija sprema">
            <NavKartica
              href="/putnik/zaduzenje"
              glif="kamion"
              naslov="Zaduženje vozila"
              opis="Vino za prodaju (zaliha po putniku) + roba pripremljena za isporuku."
            />
            <NavKartica
              href="/putnik/promo"
              glif="poklon"
              naslov="Promo"
              opis="Zaliha promo materijala — ulaz (L1/2) i otpis po lokalu."
            />
            <NavKartica
              href="/putnik/priprema"
              glif="kutija"
              naslov="Priprema"
              opis="Što vinarija treba pripremiti za isporuku putniku."
            />
          </Grupa>
        </div>

        {/* PRETRAGA + POPIS LOKALA */}
        <div id="lokali" className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4 scroll-mt-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">Pretraga lokala</label>
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
                <div className="mt-1 text-[24px] font-semibold text-stone-800">{filtriraniKupci.length}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-stone-800">Lokali / kupci</h2>
            <Oznaka>{filtriraniKupci.length}</Oznaka>
          </div>

          {loading ? (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">Učitavam kupce...</div>
          ) : filtriraniKupci.length === 0 ? (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">Nema pronađenih lokala.</div>
          ) : (
            <div className="space-y-3">
              {filtriraniKupci.map((kupac) => (
                <div key={kupac.id} className="border border-orange-200 bg-white p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">Lokal</div>
                        <div className="mt-1 text-[18px] font-semibold text-stone-800">{kupac.nazivLokala}</div>
                        <div className="mt-1 text-[13px] text-stone-500">{kupac.nazivFirme || "-"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">Kontakt</div>
                        <div className="mt-1 text-[15px] font-semibold text-stone-800">{kupac.kontaktOsoba || "-"}</div>
                        <div className="mt-1 text-[13px] text-stone-500">{kupac.telefon || "-"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">Lokacija</div>
                        <div className="mt-1 text-[15px] font-semibold text-stone-800">{kupac.grad || "-"}</div>
                        <div className="mt-1 text-[13px] text-stone-500">{kupac.regija || "-"}</div>
                      </div>
                      <div className="space-y-2">
                        <div><Oznaka>{nazivTipa(kupac.tip)}</Oznaka></div>
                        <div><Oznaka>{nazivStatusa(kupac.status)}</Oznaka></div>
                        <div><Oznaka>Kategorija {kupac.kategorija || "-"}</Oznaka></div>
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
