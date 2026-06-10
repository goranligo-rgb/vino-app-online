import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { formatHrDateTime } from "@/lib/datum";

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

// Zbroji u mapu naziv -> količina (radi zbirnog prikaza po artiklu)
function uMapu(m: Map<string, number>, kljuc: string, kol: number) {
  if (kol <= 0) return;
  m.set(kljuc, (m.get(kljuc) || 0) + kol);
}

function Lista({ naslov, boja, m }: { naslov: string; boja: string; m: Map<string, number> }) {
  return (
    <div className="border border-orange-200 bg-white p-3">
      <div className={`mb-2 text-[13px] font-semibold ${boja}`}>{naslov}</div>
      {m.size === 0 ? (
        <div className="text-[12px] text-stone-400">—</div>
      ) : (
        <ul className="space-y-1 text-[13px] text-stone-700">
          {[...m.entries()].map(([naziv, kol]) => (
            <li key={naziv} className="flex justify-between gap-2">
              <span>{naziv}</span>
              <strong>{kol}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function DnevniRadPage({
  searchParams,
}: {
  searchParams: Promise<{ putnik?: string; datum?: string }>;
}) {
  const sp = await searchParams;
  const danas = new Date().toISOString().slice(0, 10);
  const datum = sp.datum || danas;
  const filterPutnik = sp.putnik || "";

  const where: { putnikIme?: string; datum: { gte: Date; lte: Date } } = {
    datum: {
      gte: new Date(`${datum}T00:00:00`),
      lte: new Date(`${datum}T23:59:59.999`),
    },
  };
  if (filterPutnik) where.putnikIme = filterPutnik;

  const [posjeti, putnici] = await Promise.all([
    prisma.putnikPosjet.findMany({
      where,
      include: {
        kupac: { select: { id: true, nazivLokala: true } },
        stavke: true,
        promoOtpisi: { include: { artikl: { select: { naziv: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, select: { ime: true }, orderBy: { ime: "asc" } }),
  ]);

  // Zbirno (svi posjeti odabranog dana/putnika) — 4 kategorije iz postojećih podataka
  const zbProdano = new Map<string, number>();        // ODMAH stavke (prodaja iz auta)
  const zbDogovoreno = new Map<string, number>();      // PRIPREMITI stavke (za isporuku)
  const zbGratis = new Map<string, number>();          // vino gratis + promo dano (ODMAH)
  const zbPromoPriprema = new Map<string, number>();   // promo poklon PRIPREMITI (obećano)

  // Po posjetu (lokalu) — detaljan prikaz što je gdje odrađeno
  type Detalj = { prodano: Map<string, number>; dogovoreno: Map<string, number>; gratis: Map<string, number>; promoPriprema: Map<string, number> };

  for (const p of posjeti) {
    for (const s of p.stavke) {
      const naziv = s.nazivProizvoda;
      const jed = s.jedinica || "kom";
      const kljuc = `${naziv} (${jed})`;
      const kol = s.kolicina || 0;
      if (s.statusPripreme === "ODMAH") uMapu(zbProdano, kljuc, kol);
      else uMapu(zbDogovoreno, kljuc, kol); // PRIPREMITI/PRIPREMLJENO/ISPORUCENO = dogovoreno za isporuku
      uMapu(zbGratis, kljuc, s.gratis);
    }
    for (const o of p.promoOtpisi) {
      const naziv = o.artikl?.naziv || o.naziv || "—";
      if (o.statusPripreme === "ODMAH") uMapu(zbGratis, naziv, o.kolicina);
      else uMapu(zbPromoPriprema, naziv, o.kolicina);
    }
  }

  const polje = "w-full border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400";

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">Dnevni rad putnika</h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Što je putnik taj dan odradio: prodao iz vozila, dogovorio za isporuku, dao gratis, obećao promo za pripremu.
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
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">Datum</label>
              <input name="datum" type="date" defaultValue={datum} className={polje} />
            </div>
            <button type="submit" className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105">
              Prikaži
            </button>
          </form>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Kartica naslov="Posjeta" vrijednost={String(posjeti.length)} podnaslov="taj dan" />
          <Kartica naslov="Prodano (vrsta)" vrijednost={String(zbProdano.size)} podnaslov="iz vozila (ODMAH)" />
          <Kartica naslov="Za isporuku (vrsta)" vrijednost={String(zbDogovoreno.size)} podnaslov="dogovoreno (PRIPREMITI)" />
          <Kartica naslov="Gratis (vrsta)" vrijednost={String(zbGratis.size)} podnaslov="vino + promo" />
        </div>

        {/* ZBIRNO */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Lista naslov="PRODAO iz vozila" boja="text-green-800" m={zbProdano} />
          <Lista naslov="DOGOVORIO za isporuku" boja="text-orange-800" m={zbDogovoreno} />
          <Lista naslov="DAO GRATIS (vino + promo)" boja="text-amber-800" m={zbGratis} />
          <Lista naslov="OBEĆAO promo za pripremu" boja="text-blue-800" m={zbPromoPriprema} />
        </div>

        {/* PO LOKALU */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <h2 className="mb-3 text-[18px] font-semibold text-stone-800">Po lokalu / posjetu</h2>
          {posjeti.length === 0 ? (
            <div className="text-[13px] text-stone-500">Nema posjeta za odabrani dan/putnika.</div>
          ) : (
            <div className="space-y-3">
              {posjeti.map((p) => {
                const d: Detalj = { prodano: new Map(), dogovoreno: new Map(), gratis: new Map(), promoPriprema: new Map() };
                for (const s of p.stavke) {
                  const kljuc = `${s.nazivProizvoda} (${s.jedinica || "kom"})`;
                  if (s.statusPripreme === "ODMAH") uMapu(d.prodano, kljuc, s.kolicina || 0);
                  else uMapu(d.dogovoreno, kljuc, s.kolicina || 0);
                  uMapu(d.gratis, kljuc, s.gratis);
                }
                for (const o of p.promoOtpisi) {
                  const naziv = o.artikl?.naziv || o.naziv || "—";
                  if (o.statusPripreme === "ODMAH") uMapu(d.gratis, naziv, o.kolicina);
                  else uMapu(d.promoPriprema, naziv, o.kolicina);
                }
                return (
                  <div key={p.id} className="border border-orange-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/putnik/kupci/${p.kupac.id}`} className="text-[15px] font-semibold text-orange-900 hover:underline">
                        {p.kupac.nazivLokala}
                      </Link>
                      <span className="text-[12px] text-stone-400">
                        {p.putnikIme || "—"} · upisano {formatHrDateTime(p.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <Lista naslov="Prodao" boja="text-green-800" m={d.prodano} />
                      <Lista naslov="Dogovorio" boja="text-orange-800" m={d.dogovoreno} />
                      <Lista naslov="Gratis" boja="text-amber-800" m={d.gratis} />
                      <Lista naslov="Promo za pripremu" boja="text-blue-800" m={d.promoPriprema} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
