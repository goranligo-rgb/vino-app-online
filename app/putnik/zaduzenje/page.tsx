import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import { formatHrDate } from "@/lib/datum";
import { zaduziVino } from "./actions";
import { oznaciIsporuceno } from "../priprema/actions";

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

// Jedan red zalihe vina po putniku (zaduženo − prodano − gratis = ostalo)
type VinoRed = { artiklId: string; naziv: string; jedinica: string; zaduzeno: number; prodano: number; gratis: number };
type IspRed = { kind: "vino" | "promo"; id: string; naziv: string; kolicina: number; jedinica?: string };

export default async function ZaduzenjePage({
  searchParams,
}: {
  searchParams: Promise<{ putnik?: string; datum?: string }>;
}) {
  const sp = await searchParams;
  const user = await getAuthUser();
  const jeL12 = user?.role === "ADMIN" || user?.role === "PODRUM";

  const danas = new Date().toISOString().slice(0, 10);
  const filterPutnik = sp.putnik || "";

  // Uvjet za posjet (putnikIme za prodaju/isporuku; datum samo za isporuku)
  const posjetProdaja: { putnikIme?: string } = {};
  if (filterPutnik) posjetProdaja.putnikIme = filterPutnik;

  const posjetIsporuka: { putnikIme?: string; datum?: { gte: Date; lte: Date } } = {};
  if (filterPutnik) posjetIsporuka.putnikIme = filterPutnik;
  if (sp.datum) {
    posjetIsporuka.datum = {
      gte: new Date(`${sp.datum}T00:00:00`),
      lte: new Date(`${sp.datum}T23:59:59.999`),
    };
  }

  const [zaduzenja, prodajaStavke, isporukaStavke, isporukaPromo, vina, putnici, zadnjaZaduzenja] = await Promise.all([
    // ULAZ u zalihu (zaduženja vina po putniku)
    prisma.putnikVinoZaduzenje.findMany({
      where: filterPutnik ? { putnikIme: filterPutnik } : {},
      include: { artikl: { select: { naziv: true, zadanaJedinica: true } } },
    }),
    // IZLAZ: prodaja/gratis iz auta = ODMAH stavke vezane na katalog vina
    prisma.putnikPosjetStavka.findMany({
      where: { statusPripreme: "ODMAH", artiklId: { not: null }, posjet: posjetProdaja },
      include: {
        artikl: { select: { naziv: true, zadanaJedinica: true } },
        posjet: { select: { putnikIme: true } },
      },
    }),
    // ZA ISPORUKU: roba koju je vinarija pripremila (PRIPREMLJENO), vozi se lokalu
    prisma.putnikPosjetStavka.findMany({
      where: { statusPripreme: "PRIPREMLJENO", posjet: posjetIsporuka },
      include: {
        posjet: { select: { putnikIme: true, kupac: { select: { id: true, nazivLokala: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.putnikPromoKupca.findMany({
      where: { statusPripreme: "PRIPREMLJENO", posjetId: { not: null }, posjet: posjetIsporuka },
      include: {
        artikl: { select: { naziv: true } },
        kupac: { select: { id: true, nazivLokala: true } },
        posjet: { select: { putnikIme: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.putnikVinoArtikl.findMany({ where: { aktivan: true }, orderBy: { naziv: "asc" } }),
    // Popis putnika = svi aktivni korisnici (sve razine smiju biti putnik)
    prisma.user.findMany({ where: { active: true }, select: { ime: true }, orderBy: { ime: "asc" } }),
    prisma.putnikVinoZaduzenje.findMany({
      where: filterPutnik ? { putnikIme: filterPutnik } : {},
      include: { artikl: { select: { naziv: true } } },
      orderBy: { datum: "desc" },
      take: 10,
    }),
  ]);

  // ── ZA PRODAJU: zaliha vina po putniku (zaduženo − prodano − gratis) ──
  const poPutnikuProdaja = new Map<string, Map<string, VinoRed>>();
  function recZa(putnik: string, artiklId: string, naziv: string, jedinica: string): VinoRed {
    if (!poPutnikuProdaja.has(putnik)) poPutnikuProdaja.set(putnik, new Map());
    const m = poPutnikuProdaja.get(putnik)!;
    let r = m.get(artiklId);
    if (!r) {
      r = { artiklId, naziv, jedinica, zaduzeno: 0, prodano: 0, gratis: 0 };
      m.set(artiklId, r);
    }
    return r;
  }
  for (const z of zaduzenja) {
    const jed = z.artikl.zadanaJedinica || z.jedinica || "kom";
    recZa(z.putnikIme, z.artiklId, z.artikl.naziv, jed).zaduzeno += z.kolicina;
  }
  for (const s of prodajaStavke) {
    if (!s.artiklId) continue;
    const putnik = s.posjet.putnikIme || "—";
    const jed = s.artikl?.zadanaJedinica || s.jedinica || "kom";
    const r = recZa(putnik, s.artiklId, s.artikl?.naziv || s.nazivProizvoda, jed);
    r.prodano += s.kolicina || 0;
    r.gratis += s.gratis;
  }

  // ── ZA ISPORUKU: pripremljeno po putniku → po lokalu ──
  const poPutnikuIsporuka = new Map<string, Map<string, { naziv: string; redovi: IspRed[] }>>();
  function dodajIsp(putnik: string, kid: string, kupac: string, red: IspRed) {
    if (!poPutnikuIsporuka.has(putnik)) poPutnikuIsporuka.set(putnik, new Map());
    const m = poPutnikuIsporuka.get(putnik)!;
    if (!m.has(kid)) m.set(kid, { naziv: kupac, redovi: [] });
    m.get(kid)!.redovi.push(red);
  }
  for (const s of isporukaStavke) {
    dodajIsp(s.posjet.putnikIme || "—", s.posjet.kupac.id, s.posjet.kupac.nazivLokala, {
      kind: "vino",
      id: s.id,
      naziv: s.nazivProizvoda,
      kolicina: s.kolicina || 0,
      jedinica: s.jedinica || "kom",
    });
  }
  for (const p of isporukaPromo) {
    dodajIsp(p.posjet?.putnikIme || "—", p.kupac.id, p.kupac.nazivLokala, {
      kind: "promo",
      id: p.id,
      naziv: p.artikl?.naziv || p.naziv || "—",
      kolicina: p.kolicina,
    });
  }

  const brojIsporuka = isporukaStavke.length + isporukaPromo.length;
  const polje = "w-full border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400";

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">Zaduženje vozila</h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Što putnik nosi: vino za prodaju (zaliha po putniku) + roba pripremljena za isporuku lokalima. Ovo nije otpremnica.
              </div>
            </div>
            <Link href="/putnik" className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50">
              Natrag na putnik
            </Link>
          </div>
        </div>

        {/* FILTRI */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">Putnik</label>
              <select name="putnik" defaultValue={filterPutnik} className={`${polje} min-w-[200px]`}>
                <option value="">Svi putnici</option>
                {putnici.map((p) => (
                  <option key={p.ime} value={p.ime}>{p.ime}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">Datum (za isporuku)</label>
              <input name="datum" type="date" defaultValue={sp.datum || ""} className={polje} />
            </div>
            <button type="submit" className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105">
              Prikaži
            </button>
          </form>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Kartica naslov="Putnika sa zalihom" vrijednost={String(poPutnikuProdaja.size)} podnaslov="vino za prodaju" />
          <Kartica naslov="Za isporuku" vrijednost={String(brojIsporuka)} podnaslov="pripremljene stavke" />
          <Kartica naslov="Aktivnih vina" vrijednost={String(vina.length)} />
        </div>

        {/* ZADUŽI VINO (samo L1/2) */}
        {jeL12 ? (
          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
            <h2 className="mb-1 text-[18px] font-semibold text-stone-800">Zaduži vino putniku (L1/L2)</h2>
            <p className="mb-3 text-[12px] text-stone-500">
              Ovo je ULAZ u zalihu putnika (standardno punjenje za prodaju/gratis). Skida se na terenu kroz prodaju i gratis.
            </p>
            {vina.length === 0 ? (
              <div className="text-[13px] text-stone-500">Prvo dodaj vino u katalog na /putnik/promo.</div>
            ) : (
              <form action={zaduziVino} className="grid gap-2 md:grid-cols-6">
                <select name="putnikIme" required className={polje}>
                  <option value="">Putnik…</option>
                  {putnici.map((p) => (
                    <option key={p.ime} value={p.ime}>{p.ime}</option>
                  ))}
                </select>
                <select name="artiklId" required className={`${polje} md:col-span-2`}>
                  <option value="">Vino…</option>
                  {vina.map((v) => (
                    <option key={v.id} value={v.id}>{v.naziv}</option>
                  ))}
                </select>
                <input name="kolicina" type="number" step="any" placeholder="Količina" required className={polje} />
                <select name="jedinica" defaultValue="kom" className={polje}>
                  <option value="kom">kom</option>
                  <option value="L">L</option>
                </select>
                <input name="datum" type="date" defaultValue={danas} className={polje} />
                <input name="napomena" placeholder="Napomena (opc.)" className={`${polje} md:col-span-5`} />
                <button type="submit" className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105">
                  Zaduži
                </button>
              </form>
            )}
            {zadnjaZaduzenja.length ? (
              <div className="mt-3 space-y-1 text-[13px]">
                {zadnjaZaduzenja.map((z) => (
                  <div key={z.id} className="flex flex-wrap justify-between gap-2 border border-orange-100 bg-white px-3 py-1.5">
                    <span><strong>{z.putnikIme}</strong> — {z.artikl.naziv} <strong>+{z.kolicina} {z.jedinica || "kom"}</strong></span>
                    <span className="text-stone-500">{formatHrDate(z.datum)}{z.unioKorisnikIme ? ` · ${z.unioKorisnikIme}` : ""}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ZA PRODAJU — zaliha po putniku */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Za prodaju — zaliha vina po putniku</h2>
          {poPutnikuProdaja.size === 0 ? (
            <div className="text-[13px] text-stone-500">Nema zaduženog vina za odabrane filtere.</div>
          ) : (
            <div className="space-y-4">
              {[...poPutnikuProdaja.entries()].map(([putnik, vinaMap]) => (
                <div key={putnik} className="border border-orange-200 bg-white">
                  <div className="border-b border-orange-100 bg-orange-100/40 px-3 py-2 text-[15px] font-semibold text-orange-900">{putnik}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-[14px]">
                      <thead>
                        <tr className="bg-orange-50 text-[12px] uppercase tracking-[0.1em] text-orange-900">
                          <th className="px-3 py-2">Vino</th>
                          <th className="px-3 py-2 text-right">Zaduženo</th>
                          <th className="px-3 py-2 text-right">Prodano</th>
                          <th className="px-3 py-2 text-right">Gratis</th>
                          <th className="px-3 py-2 text-right">Ostalo u autu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...vinaMap.values()].map((r) => {
                          const ostalo = r.zaduzeno - r.prodano - r.gratis;
                          return (
                            <tr key={r.artiklId} className="border-t border-orange-100">
                              <td className="px-3 py-2 font-semibold text-stone-800">{r.naziv}</td>
                              <td className="px-3 py-2 text-right">{r.zaduzeno} {r.jedinica}</td>
                              <td className="px-3 py-2 text-right">{r.prodano}</td>
                              <td className="px-3 py-2 text-right">{r.gratis}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${ostalo < 0 ? "text-red-600" : "text-stone-800"}`}>
                                {ostalo} {r.jedinica}
                                {ostalo < 0 ? (
                                  <span className="ml-2 inline-flex border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] text-red-700">minus zaliha</span>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ZA ISPORUKU — pripremljeno po lokalu */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <h2 className="mb-1 text-[18px] font-semibold text-stone-800">Za isporuku — pripremljena roba po lokalu</h2>
          <p className="mb-3 text-[12px] text-stone-500">
            Roba koju je vinarija pripremila (PRIPREMLJENO). Predaja lokalu se potvrđuje gumbom „Isporučeno" (sve razine). Ne dira zalihu za prodaju.
          </p>
          {poPutnikuIsporuka.size === 0 ? (
            <div className="text-[13px] text-stone-500">Nema pripremljene robe za isporuku za odabrane filtere.</div>
          ) : (
            <div className="space-y-4">
              {[...poPutnikuIsporuka.entries()].map(([putnik, lokali]) => (
                <div key={putnik} className="space-y-2">
                  <div className="text-[15px] font-semibold text-orange-900">{putnik}</div>
                  {[...lokali.entries()].map(([kid, rec]) => (
                    <div key={kid} className="border border-orange-200 bg-white p-3">
                      <Link href={`/putnik/kupci/${kid}`} className="text-[15px] font-semibold text-orange-900 hover:underline">{rec.naziv}</Link>
                      <div className="mt-2 space-y-1">
                        {rec.redovi.map((r) => (
                          <div key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 border border-orange-100 bg-orange-50/30 px-3 py-2 text-[14px]">
                            <span>
                              <span className="mr-2 text-[11px] uppercase tracking-wide text-stone-400">{r.kind}</span>
                              <strong>{r.naziv}</strong> — {r.kolicina}{r.jedinica ? ` ${r.jedinica}` : ""}
                            </span>
                            <form action={oznaciIsporuceno} className="inline">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="tip" value={r.kind === "vino" ? "stavka" : "promo"} />
                              <button type="submit" className="border border-green-300 bg-green-50 px-3 py-1 text-[11px] font-semibold text-green-800 hover:brightness-105">
                                Isporučeno
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
