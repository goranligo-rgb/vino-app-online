import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import { formatHrDate, formatHrDateTime } from "@/lib/datum";
import { dodajArtikl, toggleArtikl, ulazZalihe, otpisiPromo } from "./actions";

export const dynamic = "force-dynamic";

function Kartica({ naslov, vrijednost, podnaslov }: { naslov: string; vrijednost: string; podnaslov?: string }) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">{naslov}</div>
      <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">{vrijednost}</div>
      {podnaslov ? <div className="mt-2 text-[12px] text-stone-500">{podnaslov}</div> : null}
    </div>
  );
}

export default async function PromoPage({
  searchParams,
}: {
  searchParams: Promise<{ kupac?: string }>;
}) {
  const sp = await searchParams;
  const user = await getAuthUser();
  const jeL12 = user?.role === "ADMIN" || user?.role === "PODRUM";

  const danas = new Date().toISOString().slice(0, 10);

  const [artikli, ulazi, otpisi, kupci] = await Promise.all([
    prisma.putnikPromoArtikl.findMany({ orderBy: [{ aktivan: "desc" }, { naziv: "asc" }] }),
    prisma.putnikPromoUlaz.findMany({
      orderBy: { datum: "desc" },
      include: { artikl: { select: { naziv: true } } },
    }),
    prisma.putnikPromoKupca.findMany({
      where: { artiklId: { not: null } },
      orderBy: { datumPredaje: "desc" },
      include: {
        kupac: { select: { id: true, nazivLokala: true } },
        artikl: { select: { naziv: true } },
      },
    }),
    prisma.putnikKupac.findMany({
      where: { aktivan: true },
      select: { id: true, nazivLokala: true },
      orderBy: { nazivLokala: "asc" },
    }),
  ]);

  // Agregati po artiklu
  const usloPo = new Map<string, number>();
  for (const u of ulazi) usloPo.set(u.artiklId, (usloPo.get(u.artiklId) || 0) + u.kolicina);

  const dobiliPo = new Map<string, number>();
  for (const o of otpisi) {
    if (!o.artiklId) continue;
    dobiliPo.set(o.artiklId, (dobiliPo.get(o.artiklId) || 0) + o.kolicina);
  }

  // Po lokalu: kupac -> (artikl naziv -> kolicina)
  const poLokalu = new Map<string, { naziv: string; po: Map<string, number> }>();
  for (const o of otpisi) {
    const kid = o.kupac.id;
    if (!poLokalu.has(kid)) poLokalu.set(kid, { naziv: o.kupac.nazivLokala, po: new Map() });
    const rec = poLokalu.get(kid)!;
    const art = o.artikl?.naziv || o.naziv || "—";
    rec.po.set(art, (rec.po.get(art) || 0) + o.kolicina);
  }

  const aktivniArtikli = artikli.filter((a) => a.aktivan);

  const ulazInput =
    "w-full border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400";

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                Promo materijal — zaliha
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Ulaz zalihe (Level 1/2), otpis po lokalu (svi). Minus zaliha je dopušten i označen crveno.
              </div>
            </div>
            <Link
              href="/putnik"
              className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
            >
              Natrag na putnik
            </Link>
          </div>
        </div>

        {/* STANJE PO STAVCI */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Stanje po stavci</h2>
          {artikli.length === 0 ? (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
              Nema artikala. {jeL12 ? "Dodaj prvi artikl ispod." : "Level 1/2 mora dodati artikle."}
            </div>
          ) : (
            <div className="overflow-x-auto border border-orange-200 bg-white">
              <table className="w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="bg-orange-100/70 text-[12px] uppercase tracking-[0.1em] text-orange-900">
                    <th className="px-3 py-2">Artikl</th>
                    <th className="px-3 py-2 text-right">Ušlo</th>
                    <th className="px-3 py-2 text-right">Dobili lokali</th>
                    <th className="px-3 py-2 text-right">Ostalo</th>
                  </tr>
                </thead>
                <tbody>
                  {artikli.map((a) => {
                    const uslo = usloPo.get(a.id) || 0;
                    const dobili = dobiliPo.get(a.id) || 0;
                    const ostalo = uslo - dobili;
                    return (
                      <tr key={a.id} className="border-t border-orange-100">
                        <td className="px-3 py-2 font-semibold text-stone-800">
                          {a.naziv}
                          {!a.aktivan ? (
                            <span className="ml-2 text-[11px] font-normal text-stone-400">(neaktivan)</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right">{uslo}</td>
                        <td className="px-3 py-2 text-right">{dobili}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            ostalo < 0 ? "text-red-600" : "text-stone-800"
                          }`}
                        >
                          {ostalo}
                          {ostalo < 0 ? (
                            <span className="ml-2 inline-flex border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                              minus zaliha
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* OTPIS PO LOKALU (svi) */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Otpis po lokalu</h2>
          {aktivniArtikli.length === 0 ? (
            <div className="text-[13px] text-stone-500">Nema aktivnih artikala za otpis.</div>
          ) : (
            <form action={otpisiPromo} className="grid gap-3 md:grid-cols-5">
              <select name="kupacId" defaultValue={sp.kupac || ""} required className={ulazInput}>
                <option value="">Odaberi lokal…</option>
                {kupci.map((k) => (
                  <option key={k.id} value={k.id}>{k.nazivLokala}</option>
                ))}
              </select>
              <select name="artiklId" required className={ulazInput}>
                <option value="">Odaberi artikl…</option>
                {aktivniArtikli.map((a) => (
                  <option key={a.id} value={a.id}>{a.naziv}</option>
                ))}
              </select>
              <input name="kolicina" type="number" placeholder="Količina" required className={ulazInput} />
              <input name="datum" type="date" defaultValue={danas} className={ulazInput} />
              <button
                type="submit"
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
              >
                Otpiši
              </button>
            </form>
          )}
        </div>

        {/* KATALOG + ULAZ (samo L1/L2) */}
        {jeL12 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
              <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Katalog artikala (L1/L2)</h2>
              <form action={dodajArtikl} className="mb-3 flex gap-2">
                <input name="naziv" placeholder="npr. čaša ABC, pregača, upaljač" required className={ulazInput} />
                <button
                  type="submit"
                  className="shrink-0 border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
                >
                  Dodaj
                </button>
              </form>
              <div className="space-y-1">
                {artikli.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border border-orange-100 bg-white px-3 py-2 text-[14px]">
                    <span className={a.aktivan ? "text-stone-800" : "text-stone-400 line-through"}>{a.naziv}</span>
                    <form action={toggleArtikl}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="aktivan" value={a.aktivan ? "false" : "true"} />
                      <button type="submit" className="border border-orange-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-orange-50">
                        {a.aktivan ? "Ugasi" : "Aktiviraj"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
              <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Ulazna zaliha (L1/L2)</h2>
              {aktivniArtikli.length === 0 ? (
                <div className="text-[13px] text-stone-500">Prvo dodaj artikl u katalog.</div>
              ) : (
                <form action={ulazZalihe} className="mb-3 grid gap-2 md:grid-cols-2">
                  <select name="artiklId" required className={ulazInput}>
                    <option value="">Odaberi artikl…</option>
                    {aktivniArtikli.map((a) => (
                      <option key={a.id} value={a.id}>{a.naziv}</option>
                    ))}
                  </select>
                  <input name="kolicina" type="number" placeholder="Količina" required className={ulazInput} />
                  <input name="datum" type="date" defaultValue={danas} className={ulazInput} />
                  <input name="napomena" placeholder="Napomena (opc.)" className={ulazInput} />
                  <button
                    type="submit"
                    className="md:col-span-2 border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
                  >
                    Dodaj ulaz
                  </button>
                </form>
              )}
              <div className="space-y-1 text-[13px]">
                {ulazi.slice(0, 8).map((u) => (
                  <div key={u.id} className="flex justify-between border border-orange-100 bg-white px-3 py-1.5">
                    <span>{u.artikl?.naziv} — <strong>+{u.kolicina}</strong></span>
                    <span className="text-stone-500">{formatHrDate(u.datum)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* PO LOKALU - DOBIVENO */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Po lokalu — što je dobio</h2>
          {poLokalu.size === 0 ? (
            <div className="text-[13px] text-stone-500">Još nema otpisa.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[...poLokalu.entries()].map(([kid, rec]) => (
                <div key={kid} className="border border-orange-100 bg-white p-3">
                  <Link href={`/putnik/kupci/${kid}`} className="text-[14px] font-semibold text-orange-900 hover:underline">
                    {rec.naziv}
                  </Link>
                  <ul className="mt-1 text-[13px] text-stone-700">
                    {[...rec.po.entries()].map(([art, kol]) => (
                      <li key={art}>• {art}: <strong>{kol}</strong></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ZADNJI OTPISI */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Zadnji otpisi</h2>
          {otpisi.length === 0 ? (
            <div className="text-[13px] text-stone-500">Nema otpisa.</div>
          ) : (
            <div className="space-y-1 text-[13px]">
              {otpisi.slice(0, 15).map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border border-orange-100 bg-white px-3 py-2">
                  <span>
                    <strong>{o.kupac.nazivLokala}</strong> — {o.artikl?.naziv || o.naziv} ×{o.kolicina}
                    <span className="ml-2 text-stone-500">{formatHrDate(o.datumPredaje)}</span>
                    {o.otpisaoKorisnikIme ? <span className="ml-2 text-stone-400">({o.otpisaoKorisnikIme})</span> : null}
                  </span>
                  <span className="text-[11px] text-stone-400">Upisano: {formatHrDateTime(o.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
