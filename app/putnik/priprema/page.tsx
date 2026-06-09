import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import { oznaciPripremu } from "./actions";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PRIPREMITI: "border-orange-300 bg-orange-50 text-orange-800",
    PRIPREMLJENO: "border-blue-300 bg-blue-50 text-blue-800",
    ISPORUCENO: "border-green-300 bg-green-50 text-green-800",
  };
  return (
    <span className={`inline-flex border px-2 py-0.5 text-[11px] font-semibold ${map[status] || ""}`}>
      {status}
    </span>
  );
}

function Kartica({ naslov, vrijednost, podnaslov }: { naslov: string; vrijednost: string; podnaslov?: string }) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">{naslov}</div>
      <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">{vrijednost}</div>
      {podnaslov ? <div className="mt-2 text-[12px] text-stone-500">{podnaslov}</div> : null}
    </div>
  );
}

// Gumbi za pomicanje statusa (samo L1/2). Status NE dira zalihu.
function StatusGumbi({ id, tip, status, jeL12 }: { id: string; tip: "stavka" | "promo"; status: string; jeL12: boolean }) {
  if (!jeL12) return <StatusBadge status={status} />;

  const Gumb = ({ noviStatus, label, boja }: { noviStatus: string; label: string; boja: string }) => (
    <form action={oznaciPripremu} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tip" value={tip} />
      <input type="hidden" name="status" value={noviStatus} />
      <button type="submit" className={`border px-2 py-1 text-[11px] font-semibold ${boja}`}>
        {label}
      </button>
    </form>
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge status={status} />
      {status === "PRIPREMITI" ? (
        <Gumb noviStatus="PRIPREMLJENO" label="Pripremljeno" boja="border-blue-300 bg-blue-50 text-blue-800 hover:brightness-105" />
      ) : null}
      {status === "PRIPREMLJENO" ? (
        <>
          <Gumb noviStatus="ISPORUCENO" label="Isporučeno" boja="border-green-300 bg-green-50 text-green-800 hover:brightness-105" />
          <Gumb noviStatus="PRIPREMITI" label="Vrati" boja="border-stone-300 bg-white text-stone-600 hover:bg-stone-50" />
        </>
      ) : null}
      {status === "ISPORUCENO" ? (
        <Gumb noviStatus="PRIPREMLJENO" label="Vrati" boja="border-stone-300 bg-white text-stone-600 hover:bg-stone-50" />
      ) : null}
    </div>
  );
}

export default async function PripremaPage({
  searchParams,
}: {
  searchParams: Promise<{ putnik?: string; datum?: string; sve?: string }>;
}) {
  const sp = await searchParams;
  const user = await getAuthUser();
  const jeL12 = user?.role === "ADMIN" || user?.role === "PODRUM";

  const prikaziIsporucene = sp.sve === "1";
  const statusi = prikaziIsporucene
    ? ["PRIPREMITI", "PRIPREMLJENO", "ISPORUCENO"]
    : ["PRIPREMITI", "PRIPREMLJENO"];

  // Filter na posjet (putnikIme / datum)
  const posjetCond: { putnikIme?: string; datum?: { gte: Date; lte: Date } } = {};
  if (sp.putnik) posjetCond.putnikIme = sp.putnik;
  if (sp.datum) {
    posjetCond.datum = {
      gte: new Date(`${sp.datum}T00:00:00`),
      lte: new Date(`${sp.datum}T23:59:59.999`),
    };
  }

  const [stavke, promo, putnici] = await Promise.all([
    prisma.putnikPosjetStavka.findMany({
      where: { statusPripreme: { in: statusi }, posjet: posjetCond },
      include: {
        posjet: {
          select: {
            id: true,
            datum: true,
            createdAt: true,
            putnikIme: true,
            kupac: { select: { id: true, nazivLokala: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.putnikPromoKupca.findMany({
      where: { statusPripreme: { in: statusi }, posjetId: { not: null }, posjet: posjetCond },
      include: {
        artikl: { select: { naziv: true } },
        kupac: { select: { id: true, nazivLokala: true } },
        posjet: { select: { id: true, datum: true, createdAt: true, putnikIme: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.putnikPosjet.findMany({
      where: { putnikIme: { not: null } },
      distinct: ["putnikIme"],
      select: { putnikIme: true },
      orderBy: { putnikIme: "asc" },
    }),
  ]);

  // Zbirno po artiklu — vino (naziv + jedinica zasebno) i promo
  const vinoZbir = new Map<string, { naziv: string; jedinica: string; kolicina: number }>();
  for (const s of stavke) {
    const jed = s.jedinica || "kom";
    const key = `${s.nazivProizvoda}||${jed}`;
    const rec = vinoZbir.get(key) || { naziv: s.nazivProizvoda, jedinica: jed, kolicina: 0 };
    rec.kolicina += s.kolicina || 0;
    vinoZbir.set(key, rec);
  }

  const promoZbir = new Map<string, number>();
  for (const p of promo) {
    const naziv = p.artikl?.naziv || p.naziv || "—";
    promoZbir.set(naziv, (promoZbir.get(naziv) || 0) + p.kolicina);
  }

  // Po lokalu
  type Red = { kind: "vino" | "promo"; id: string; naziv: string; kolicina: number; jedinica?: string; status: string };
  const poLokalu = new Map<string, { naziv: string; redovi: Red[] }>();
  function dodaj(kid: string, kupacNaziv: string, red: Red) {
    if (!poLokalu.has(kid)) poLokalu.set(kid, { naziv: kupacNaziv, redovi: [] });
    poLokalu.get(kid)!.redovi.push(red);
  }
  for (const s of stavke) {
    dodaj(s.posjet.kupac.id, s.posjet.kupac.nazivLokala, {
      kind: "vino",
      id: s.id,
      naziv: s.nazivProizvoda,
      kolicina: s.kolicina || 0,
      jedinica: s.jedinica || "kom",
      status: s.statusPripreme,
    });
  }
  for (const p of promo) {
    dodaj(p.kupac.id, p.kupac.nazivLokala, {
      kind: "promo",
      id: p.id,
      naziv: p.artikl?.naziv || p.naziv || "—",
      kolicina: p.kolicina,
      status: p.statusPripreme,
    });
  }

  const ukupnoStavki = stavke.length + promo.length;

  const polje = "border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400";

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                Popis za pripremu
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Što vinarija treba pripremiti za putnika (vino, čaše, pokloni, promo). Ovo nije otpremnica.
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
              <select name="putnik" defaultValue={sp.putnik || ""} className={polje}>
                <option value="">Svi putnici</option>
                {putnici.map((p) => (
                  <option key={p.putnikIme || ""} value={p.putnikIme || ""}>{p.putnikIme}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">Datum posjeta</label>
              <input name="datum" type="date" defaultValue={sp.datum || ""} className={polje} />
            </div>
            <label className="flex items-center gap-2 border border-orange-200 bg-white px-3 py-2 text-[13px] font-semibold text-stone-700">
              <input type="checkbox" name="sve" value="1" defaultChecked={prikaziIsporucene} className="h-4 w-4 accent-orange-700" />
              Prikaži i isporučeno
            </label>
            <button type="submit" className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105">
              Prikaži
            </button>
          </form>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Kartica naslov="Stavki za pripremu" vrijednost={String(ukupnoStavki)} podnaslov={prikaziIsporucene ? "uključujući isporučeno" : "PRIPREMITI + PRIPREMLJENO"} />
          <Kartica naslov="Različitih vina" vrijednost={String(vinoZbir.size)} />
          <Kartica naslov="Lokala" vrijednost={String(poLokalu.size)} />
        </div>

        {/* ZBIRNO PO ARTIKLU */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
            <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Zbirno — vino</h2>
            {vinoZbir.size === 0 ? (
              <div className="text-[13px] text-stone-500">Nema vina za pripremu.</div>
            ) : (
              <div className="space-y-1 text-[14px]">
                {[...vinoZbir.values()].map((v) => (
                  <div key={`${v.naziv}-${v.jedinica}`} className="flex justify-between border border-orange-100 bg-white px-3 py-2">
                    <span>{v.naziv}</span>
                    <strong>{v.kolicina} {v.jedinica}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
            <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Zbirno — čaše / pokloni / promo</h2>
            {promoZbir.size === 0 ? (
              <div className="text-[13px] text-stone-500">Nema promo materijala za pripremu.</div>
            ) : (
              <div className="space-y-1 text-[14px]">
                {[...promoZbir.entries()].map(([naziv, kol]) => (
                  <div key={naziv} className="flex justify-between border border-orange-100 bg-white px-3 py-2">
                    <span>{naziv}</span>
                    <strong>{kol}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PO LOKALU */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Po lokalu</h2>
          {poLokalu.size === 0 ? (
            <div className="text-[13px] text-stone-500">Nema stavki za odabrane filtere.</div>
          ) : (
            <div className="space-y-3">
              {[...poLokalu.entries()].map(([kid, rec]) => (
                <div key={kid} className="border border-orange-200 bg-white p-3">
                  <Link href={`/putnik/kupci/${kid}`} className="text-[15px] font-semibold text-orange-900 hover:underline">
                    {rec.naziv}
                  </Link>
                  <div className="mt-2 space-y-1">
                    {rec.redovi.map((r) => (
                      <div key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 border border-orange-100 bg-orange-50/30 px-3 py-2 text-[14px]">
                        <span>
                          <span className="mr-2 text-[11px] uppercase tracking-wide text-stone-400">{r.kind === "vino" ? "vino" : "promo"}</span>
                          <strong>{r.naziv}</strong> — {r.kolicina}{r.jedinica ? ` ${r.jedinica}` : ""}
                        </span>
                        <StatusGumbi id={r.id} tip={r.kind === "vino" ? "stavka" : "promo"} status={r.status} jeL12={jeL12} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!jeL12 ? (
          <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
            Napomena: pomicanje statusa (Pripremljeno / Isporučeno) može samo vinarija (Level 1/2).
          </div>
        ) : null}
      </div>
    </main>
  );
}
