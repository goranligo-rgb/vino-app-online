import Link from "next/link";
import type React from "react";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";
import { jeL12 } from "@/lib/auth-role";
import { formatHrDate, formatHrDateTime } from "@/lib/datum";
import { hrvatskiOblik, opisMaceracije } from "@/lib/berba-polja";
import { ulazniTankoviBerbe } from "@/lib/berba-model";
import {
  IspravakBerbeGreska,
  TIP_ISPRAVAK_BERBE,
  stanjeZaUredjivanje,
} from "@/lib/berba-ispravak";
import ObrisiBerbuGumb from "./obrisi-berbu-gumb";

export const dynamic = "force-dynamic";

/**
 * ZAPIS BERBE — jedan zapis, za citanje.
 *
 * Ovdje vodi sorta iz tablice na /berba i kartica iz bocne trake na /punjenje.
 * Ispravak je na /berba/[id]/uredi (pravila u lib/berba-ispravak.ts), brisanje
 * ide kroz DELETE /api/punjenje-stavka/[id] — ova stranica ne upisuje nista.
 *
 * DVA RAZLICITA PITANJA O TANKOVIMA, namjerno odvojena:
 *  - gdje je berba USLA (ULAZ u knjizi, samo ovaj zapis) — povijesna cinjenica,
 *    ne mijenja se pretokom;
 *  - gdje je grupa DANAS — to mijenja promjena sorte, pa to ispravak i nabraja.
 *
 * FIKSAN BROJ UPITA, ne po zapisu u tablici: citanje grupe je isto ono koje
 * koristi ekran za ispravak, plus ULAZ, dnevnik i imena.
 */

const NAZIV_POLJA: Record<string, string> = {
  nazivSorte: "Sorta",
  kolicinaKgGrozdja: "Kg grožđa",
  secer: "Šećer (°Oe)",
  kiseline: "Kiseline",
  ph: "pH",
  polozaj: "Položaj",
  parcela: "Parcela",
  vinograd: "Vinograd",
  oznakaBerbe: "Oznaka berbe",
  datumBerbe: "Datum berbe",
  godinaBerbe: "Godište",
  napomena: "Napomena",
  maceracija: "Maceracija",
  maceracijaSati: "Maceracija (sati)",
  vlastitaBerba: "Vlastita berba",
  pocetakBranja: "Početak branja",
  krajBranja: "Kraj branja",
  brojBeraca: "Broj berača",
};

const POLJA_DATUM = new Set(["datumBerbe"]);
const POLJA_VRIJEME = new Set(["pocetakBranja", "krajBranja"]);
const POLJA_DA_NE = new Set(["maceracija", "vlastitaBerba"]);

/** Vrijednost iz dnevnika (uvijek tekst ili null) u citljiv oblik. */
function vrijednostDnevnika(polje: string, v: string | null): string {
  if (v == null) return "(prazno)";
  if (POLJA_DATUM.has(polje)) return formatHrDate(v);
  if (POLJA_VRIJEME.has(polje)) return formatHrDateTime(v);
  if (POLJA_DA_NE.has(polje)) return v === "true" ? "da" : v === "false" ? "ne" : v;
  return v;
}

function formatBroj(v?: number | null, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/** Tri stanja: NULL je "nije se pitalo" i ostaje crtica, ne "ne". */
function daNe(v: boolean | null): string {
  return v === true ? "da" : v === false ? "ne" : "-";
}

export default async function ZapisBerbePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();

  const sesija = await citajSesiju();
  if (!sesija) redirect("/login");

  const smijeMijenjati = jeL12(sesija.role);

  const { id } = await params;

  let stanje;
  try {
    stanje = await stanjeZaUredjivanje(prisma, id);
  } catch (e) {
    if (e instanceof IspravakBerbeGreska) notFound();
    throw e;
  }

  const g = stanje.glava;

  // Ono sto citanje za ispravak ne nosi: tko je upisao i tko je zadnji ispravio.
  const trag = await prisma.berba.findUnique({
    where: { id },
    select: { korisnikId: true, ispravioKorisnikId: true, createdAt: true },
  });

  const ulazni = await ulazniTankoviBerbe(prisma, id);
  const brojTanka = new Map(
    (
      await prisma.tank.findMany({
        where: { id: { in: ulazni.map((u) => u.tankId) } },
        select: { id: true, broj: true },
      })
    ).map((t) => [t.id, t.broj])
  );

  // Dnevnik SAMO ovog zapisa. Ispravak grupe pise redak po clanu, pa svaki
  // clan ima svoj trag; ostali clanovi su linkovi nize.
  const dnevnik = await prisma.activityLog.findMany({
    where: { tip: TIP_ISPRAVAK_BERBE, entityType: "Berba", entityId: id },
    orderBy: { datum: "desc" },
    select: {
      datum: true,
      payload: true,
      user: { select: { ime: true } },
    },
  });

  const idKorisnika = [trag?.korisnikId, trag?.ispravioKorisnikId].filter(
    (x): x is string => !!x
  );
  const imena = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: idKorisnika } },
        select: { id: true, ime: true },
      })
    ).map((u) => [u.id, u.ime])
  );

  // Jedan ispravak = svi retci s istim trenutkom (upisuju se jednim createMany).
  const ispravci = new Map<
    string,
    { datum: Date; ime: string; izmjene: { polje: string; staro: string | null; novo: string | null }[] }
  >();
  for (const r of dnevnik) {
    const k = r.datum.toISOString();
    const p = (r.payload ?? {}) as { polje?: string; staro?: string | null; novo?: string | null };
    if (!p.polje) continue;
    const zapis = ispravci.get(k) ?? { datum: r.datum, ime: r.user.ime, izmjene: [] };
    zapis.izmjene.push({ polje: p.polje, staro: p.staro ?? null, novo: p.novo ?? null });
    ispravci.set(k, zapis);
  }

  const litre = Number(g.kolicinaLitara);
  const kg = g.kolicinaKgGrozdja == null ? null : Number(g.kolicinaKgGrozdja);
  const randman = kg && kg > 0 ? (litre / kg) * 100 : null;
  const jeZateceno = g.vrstaUnosa === "ZATECENO";

  const godina = g.godinaBerbe ?? g.datumUlaska?.getUTCFullYear() ?? null;
  const godinaIzvedena = g.godinaBerbe == null && godina != null;

  const ostaliUGrupi = stanje.grupa.filter((c) => c.id !== g.id);

  // Kad se brisanje ne nudi, kaze se ZASTO — umjesto gumba koji bi tek na
  // klik rekao da ne moze.
  const razlogBezBrisanja = !g.izvornaPunjenjeStavkaId
    ? "Zapis nema izvornu stavku punjenja, pa se iz knjige nema što povući."
    : ulazni.length > 1
      ? `Berba je ušla u ${ulazni.length} ${hrvatskiOblik(ulazni.length, "tank", "tanka", "tankova")} (${ulazni
          .map((u) => `T${brojTanka.get(u.tankId) ?? "?"}`)
          .join(", ")}). Brisanje berbe iz više tankova još nije podržano: briše se cijela ili nikako.`
      : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f6f2_0%,#eef5ef_45%,#eaf3ed_100%)] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto grid max-w-[960px] gap-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/berba"
            className="border border-emerald-200 bg-white px-3 py-1.5 text-[13px] text-stone-700 hover:bg-emerald-50"
          >
            ← Izvještaj o berbi
          </Link>
        </div>

        {/* ZAGLAVLJE */}
        <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[26px] font-semibold tracking-tight">{g.nazivSorte}</h1>
                {jeZateceno ? <Oznaka variant="upozorenje">Zatečeno</Oznaka> : null}
                {godina != null ? (
                  <Oznaka variant="strong">
                    {godina}
                    {godinaIzvedena ? " (izvedeno)" : ""}
                  </Oznaka>
                ) : (
                  <Oznaka variant="upozorenje">Bez godišta</Oznaka>
                )}
                {g.oznakaBerbe ? <Oznaka>{g.oznakaBerbe}</Oznaka> : null}
              </div>
              <div className="mt-1 text-[13px] text-stone-600">
                Upisano {formatHrDateTime(trag?.createdAt)}
                {trag?.korisnikId ? ` — ${imena.get(trag.korisnikId) ?? "nepoznat korisnik"}` : ""}
              </div>
            </div>

            {smijeMijenjati ? (
              <div className="flex flex-wrap items-start gap-2">
                <Link
                  href={`/berba/${g.id}/uredi`}
                  className="border border-emerald-300 bg-white px-3 py-2 text-[13px] font-semibold text-emerald-900 hover:bg-emerald-50"
                >
                  Ispravi
                </Link>
                {razlogBezBrisanja == null && g.izvornaPunjenjeStavkaId ? (
                  <ObrisiBerbuGumb
                    stavkaId={g.izvornaPunjenjeStavkaId}
                    opis={`„${g.nazivSorte}” (${formatBroj(litre, 0)} L)`}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          {smijeMijenjati && razlogBezBrisanja ? (
            <div className="mt-3 border border-stone-200 bg-stone-50 px-3 py-2 text-[13px] text-stone-600">
              Brisanje nije dostupno: {razlogBezBrisanja}
            </div>
          ) : null}
        </div>

        {/* PODACI */}
        <div className="border border-emerald-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-[16px] font-semibold">Podaci berbe</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Polje label="Datum berbe" value={formatHrDate(g.datumBerbe)} />
            <Polje label="U podrum" value={formatHrDate(g.datumUlaska)} />
            <Polje label="Položaj" value={g.polozaj || "-"} />
            <Polje label="Parcela" value={g.parcela || "-"} />
            <Polje label="Vinograd" value={g.vinograd || "-"} />
            <Polje label="Kg grožđa" value={kg == null ? "-" : `${formatBroj(kg, 0)} kg`} />
            <Polje label="Ubrano" value={`${formatBroj(litre, 0)} L`} />
            <Polje
              label="Randman"
              value={randman == null ? "-" : `${formatBroj(randman, 1)} L/100 kg`}
            />
            <Polje label="Šećer" value={g.secer == null ? "-" : `${formatBroj(Number(g.secer))} °Oe`} />
            <Polje label="Kiseline" value={formatBroj(g.kiseline == null ? null : Number(g.kiseline))} />
            <Polje label="pH" value={formatBroj(g.ph == null ? null : Number(g.ph))} />
            <Polje
              label="Maceracija"
              value={
                opisMaceracije(
                  g.maceracija,
                  g.maceracijaSati == null ? null : Number(g.maceracijaSati)
                ) ?? "-"
              }
            />
          </div>

          <h3 className="mb-2 mt-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-emerald-800/70">
            Branje
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Polje label="Vlastita berba" value={daNe(g.vlastitaBerba)} />
            <Polje label="Početak" value={formatHrDateTime(g.pocetakBranja)} />
            <Polje label="Kraj" value={formatHrDateTime(g.krajBranja)} />
            <Polje label="Berača" value={g.brojBeraca ?? "-"} />
          </div>

          {g.napomena ? (
            <div className="mt-4 border border-emerald-200 bg-emerald-50/40 p-3">
              <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                Napomena
              </div>
              <div className="whitespace-pre-wrap text-[13px] text-stone-700">{g.napomena}</div>
            </div>
          ) : null}
        </div>

        {/* TANKOVI */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-emerald-200 bg-white p-4 shadow-sm">
            <h2 className="text-[16px] font-semibold">Ušlo u podrum</h2>
            <p className="mb-3 text-[12px] text-stone-500">
              Tankovi u koje je ova berba ušla. Pretok to ne mijenja.
            </p>
            {ulazni.length === 0 ? (
              <div className="text-[13px] text-stone-500">Knjiga nema ulaz za ovaj zapis.</div>
            ) : (
              <ul className="grid gap-1 text-[13px]">
                {ulazni.map((u) => (
                  <li key={u.tankId} className="flex justify-between border-b border-emerald-100 py-1">
                    <Link href={`/tankovi/${u.tankId}`} className="text-emerald-900 hover:underline">
                      Tank {brojTanka.get(u.tankId) ?? "?"}
                    </Link>
                    <span>{formatBroj(u.litre, 0)} L</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-emerald-200 bg-white p-4 shadow-sm">
            <h2 className="text-[16px] font-semibold">Gdje je danas</h2>
            <p className="mb-3 text-[12px] text-stone-500">
              {stanje.grupa.length > 1
                ? `Cijela grupa (${stanje.grupa.length} zapisa), po knjizi.`
                : "Po knjizi."}
            </p>
            {stanje.tankoviDanas.length === 0 ? (
              <div className="text-[13px] text-stone-500">Vino ove berbe više nije ni u jednom tanku.</div>
            ) : (
              <ul className="grid gap-1 text-[13px]">
                {stanje.tankoviDanas.map((t) => (
                  <li key={t.tankId} className="flex justify-between border-b border-emerald-100 py-1">
                    <Link href={`/tankovi/${t.tankId}`} className="text-emerald-900 hover:underline">
                      Tank {t.broj ?? "?"}
                    </Link>
                    <span>{formatBroj(t.litre, 0)} L</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* GRUPA */}
        {ostaliUGrupi.length > 0 ? (
          <div className="border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
            <h2 className="text-[16px] font-semibold">Ista berba, drugi zapisi</h2>
            <p className="mb-3 text-[12px] text-stone-600">
              Isti datum, sorta i parcela. Ispravak mijenja sve zapise grupe zajedno.
            </p>
            <ul className="grid gap-1 text-[13px]">
              {ostaliUGrupi.map((c) => (
                <li key={c.id}>
                  <Link href={`/berba/${c.id}`} className="text-emerald-900 hover:underline">
                    {c.nazivSorte} — {formatBroj(Number(c.kolicinaLitara), 0)} L, u podrum{" "}
                    {formatHrDate(c.datumUlaska)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ISPRAVCI */}
        <div className="border border-emerald-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-[16px] font-semibold">Ispravci</h2>

          {g.ispravljenoAt ? (
            <div className="mb-3 border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Zadnji ispravak {formatHrDateTime(g.ispravljenoAt)}
              {trag?.ispravioKorisnikId
                ? ` — ${imena.get(trag.ispravioKorisnikId) ?? "nepoznat korisnik"}`
                : ""}
              {g.razlogIspravka ? `. Razlog: ${g.razlogIspravka}` : ""}
            </div>
          ) : null}

          {ispravci.size === 0 ? (
            <div className="text-[13px] text-stone-500">
              {g.ispravljenoAt
                ? "Dnevnik nema pojedinosti ovog ispravka."
                : "Zapis nije ispravljan."}
            </div>
          ) : (
            <div className="grid gap-3">
              {[...ispravci.values()].map((isp) => (
                <div key={isp.datum.toISOString()} className="border border-emerald-100 p-3">
                  <div className="mb-2 text-[12px] text-stone-500">
                    {formatHrDateTime(isp.datum)} — {isp.ime}
                  </div>
                  <table className="w-full text-[13px]">
                    <tbody>
                      {isp.izmjene.map((i) => (
                        <tr key={i.polje} className="border-t border-emerald-50">
                          <td className="py-1 pr-3 font-semibold">{NAZIV_POLJA[i.polje] ?? i.polje}</td>
                          <td className="py-1 pr-3 text-stone-500 line-through">
                            {vrijednostDnevnika(i.polje, i.staro)}
                          </td>
                          <td className="py-1">{vrijednostDnevnika(i.polje, i.novo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Oznaka({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "strong" | "upozorenje";
}) {
  // Isti izgled kao oznake na /berba.
  const boja =
    variant === "strong"
      ? "border-emerald-300 bg-gradient-to-b from-emerald-100 to-lime-100 text-emerald-950"
      : variant === "upozorenje"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <span className={`inline-flex border px-2.5 py-1 text-[11px] font-medium ${boja}`}>{children}</span>
  );
}

function Polje({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-emerald-100 bg-emerald-50/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.12em] text-emerald-800/70">{label}</div>
      <div className="text-[14px] font-semibold text-stone-800">{value}</div>
    </div>
  );
}
