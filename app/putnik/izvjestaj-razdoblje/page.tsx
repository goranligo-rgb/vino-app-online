import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { requireLevel12User } from "@/lib/putnik-auth";

export const dynamic = "force-dynamic";

// ── Pomoćne ──────────────────────────────────────────────────────────────────

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function iso(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

// Brojevi: bez decimala kad su cijeli, inače najviše dvije.
function broj(n: number) {
  return n.toLocaleString("hr-HR", { maximumFractionDigits: 2 });
}

// Hrvatska množina: 1 radnja, 2-4 radnje, 5+ radnji (11-14 idu na "radnji").
function radnjeRijec(n: number) {
  const zadnja = n % 10;
  const zadnjeDvije = n % 100;
  if (zadnja === 1 && zadnjeDvije !== 11) return "radnja";
  if (zadnja >= 2 && zadnja <= 4 && (zadnjeDvije < 12 || zadnjeDvije > 14)) return "radnje";
  return "radnji";
}

function prviUMjesecu() {
  const d = new Date();
  d.setDate(1);
  return iso(d);
}

const polje =
  "border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400";

function Kartica({
  naslov,
  vrijednost,
  podnaslov,
  jako,
}: {
  naslov: string;
  vrijednost: string;
  podnaslov?: string;
  jako?: boolean;
}) {
  return (
    <div
      className={`border px-4 py-4 ${
        jako
          ? "border-orange-300 bg-gradient-to-b from-orange-50 to-amber-100"
          : "border-orange-200 bg-gradient-to-b from-white to-orange-50"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
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

function TipBadge({ tip }: { tip: string }) {
  const map: Record<string, string> = {
    Posjet: "border-orange-300 bg-orange-50 text-orange-900",
    Aktivnost: "border-blue-200 bg-blue-50 text-blue-800",
    Dogovor: "border-green-300 bg-green-50 text-green-800",
    Anketa: "border-purple-200 bg-purple-50 text-purple-800",
    Promo: "border-amber-300 bg-amber-50 text-amber-900",
  };
  return (
    <span
      className={`inline-flex shrink-0 border px-2 py-0.5 text-[11px] font-semibold ${
        map[tip] || "border-stone-300 bg-white text-stone-600"
      }`}
    >
      {tip}
    </span>
  );
}

// ── Tipovi za kronologiju ────────────────────────────────────────────────────

type Redak = {
  naziv: string;
  jedinica: string;
  prodano: number;
  gratis: number;
  dogovoreno: number;
};

type Dogadaj = {
  kljuc: string;
  datum: Date;
  tip: "Posjet" | "Aktivnost" | "Dogovor" | "Anketa" | "Promo";
  kupacId: string;
  lokal: string;
  grad: string | null;
  // Posjet
  prodano?: { naziv: string; kolicina: number; jedinica: string }[];
  gratis?: { naziv: string; kolicina: number; jedinica: string }[];
  dogovoreno?: { naziv: string; kolicina: number; jedinica: string; status: string }[];
  promo?: { naziv: string; kolicina: number }[];
  biljeska?: string | null;
  // Aktivnost / dogovor / anketa
  tekst?: string | null;
  izvedeno?: boolean;
};

// ── Stranica ─────────────────────────────────────────────────────────────────

export default async function IzvjestajRazdobljePage({
  searchParams,
}: {
  searchParams: Promise<{ putnik?: string; od?: string; do?: string }>;
}) {
  // Samo L1 (ADMIN) i L2 (PODRUM) — L3/L4 se preusmjeravaju na /putnik.
  await requireLevel12User();

  const sp = await searchParams;
  const danas = iso(new Date());

  const odStr = sp.od || prviUMjesecu();
  const doStr = sp.do || danas;
  const putnik = (sp.putnik || "").trim();

  const start = new Date(`${odStr}T00:00:00`);
  const end = new Date(`${doStr}T23:59:59.999`);
  const rasponValjan =
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start.getTime() <= end.getTime();

  // Popis putnika = svi aktivni korisnici (sve razine smiju biti putnik),
  // isti izvor kao /putnik/zaduzenje i /putnik/vozilo.
  const putnici = await prisma.user.findMany({
    where: { active: true },
    select: { ime: true },
    orderBy: { ime: "asc" },
  });

  const prikazi = Boolean(putnik) && rasponValjan;

  // ── Dohvat (samo kad je putnik odabran i raspon valjan) ──
  const posjeti = prikazi
    ? await prisma.putnikPosjet.findMany({
        where: { putnikIme: putnik, datum: { gte: start, lte: end } },
        include: {
          kupac: { select: { id: true, nazivLokala: true, grad: true } },
          stavke: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { datum: "asc" },
      })
    : [];

  // Promo otpisi atribuirani putniku preko otpisaoKorisnikIme (isti obrazac kao
  // /putnik/vozilo). Hvata i otpise s posjeta i samostalne s /putnik/promo, pa
  // se NE smije dodatno zbrajati preko posjet.promoOtpisi (dvostruko brojanje).
  const promoOtpisi = prikazi
    ? await prisma.putnikPromoKupca.findMany({
        where: {
          otpisaoKorisnikIme: putnik,
          datumPredaje: { gte: start, lte: end },
        },
        include: {
          artikl: { select: { naziv: true } },
          kupac: { select: { id: true, nazivLokala: true, grad: true } },
        },
        orderBy: { datumPredaje: "asc" },
      })
    : [];

  const aktivnosti = prikazi
    ? await prisma.putnikAktivnost.findMany({
        where: { putnikIme: putnik, datum: { gte: start, lte: end } },
        include: { kupac: { select: { id: true, nazivLokala: true, grad: true } } },
        orderBy: { datum: "asc" },
      })
    : [];

  // Dogovori i ankete NEMAJU putnikIme — vežu se izvedeno, preko lokala koje je
  // taj putnik posjetio u istom razdoblju. Označeno na prikazu kao izvedena veza.
  const posjeceniKupacIds = [...new Set(posjeti.map((p) => p.kupacId))];

  const dogovori =
    prikazi && posjeceniKupacIds.length
      ? await prisma.putnikDogovor.findMany({
          where: {
            kupacId: { in: posjeceniKupacIds },
            datum: { gte: start, lte: end },
          },
          include: { kupac: { select: { id: true, nazivLokala: true, grad: true } } },
          orderBy: { datum: "asc" },
        })
      : [];

  // Anketa nema polje `datum` u shemi — koristi se createdAt (kad je upisana).
  const ankete =
    prikazi && posjeceniKupacIds.length
      ? await prisma.putnikAnketaKupca.findMany({
          where: {
            kupacId: { in: posjeceniKupacIds },
            createdAt: { gte: start, lte: end },
          },
          include: { kupac: { select: { id: true, nazivLokala: true, grad: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [];

  // ── Sažetak: po artiklu ──
  // ODMAH = roba koja je stvarno izašla iz auta (prodano + gratis).
  // Sve ostalo (PRIPREMITI/PRIPREMLJENO/ISPORUCENO) = dogovoreno za isporuku.
  const poArtiklu = new Map<string, Redak>();
  function redak(naziv: string, jedinica: string) {
    const k = naziv.toLowerCase();
    let r = poArtiklu.get(k);
    if (!r) {
      r = { naziv, jedinica, prodano: 0, gratis: 0, dogovoreno: 0 };
      poArtiklu.set(k, r);
    }
    return r;
  }

  const poStatusuDogovoreno = new Map<string, number>();

  for (const p of posjeti) {
    for (const s of p.stavke) {
      const r = redak(s.nazivProizvoda, s.jedinica || "kom");
      if (s.statusPripreme === "ODMAH") {
        r.prodano += s.kolicina || 0;
        r.gratis += s.gratis || 0;
      } else {
        r.dogovoreno += s.kolicina || 0;
        poStatusuDogovoreno.set(
          s.statusPripreme,
          (poStatusuDogovoreno.get(s.statusPripreme) || 0) + (s.kolicina || 0)
        );
      }
    }
  }

  const artikli = [...poArtiklu.values()].sort((a, b) =>
    a.naziv.localeCompare(b.naziv, "hr")
  );

  const ukProdano = artikli.reduce((s, r) => s + r.prodano, 0);
  const ukGratis = artikli.reduce((s, r) => s + r.gratis, 0);
  const ukDogovoreno = artikli.reduce((s, r) => s + r.dogovoreno, 0);
  const ukPromo = promoOtpisi.reduce((s, o) => s + o.kolicina, 0);

  const statusOpis = [...poStatusuDogovoreno.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([st, k]) => `${st} ${broj(k)}`)
    .join(" · ");

  // ── Kronologija ──
  const promoPoPosjetu = new Map<string, { naziv: string; kolicina: number }[]>();
  for (const o of promoOtpisi) {
    if (!o.posjetId) continue;
    const lista = promoPoPosjetu.get(o.posjetId) || [];
    lista.push({ naziv: o.artikl?.naziv || o.naziv || "—", kolicina: o.kolicina });
    promoPoPosjetu.set(o.posjetId, lista);
  }

  const dogadaji: Dogadaj[] = [];

  for (const p of posjeti) {
    dogadaji.push({
      kljuc: `posjet-${p.id}`,
      datum: p.datum,
      tip: "Posjet",
      kupacId: p.kupac.id,
      lokal: p.kupac.nazivLokala,
      grad: p.kupac.grad,
      prodano: p.stavke
        .filter((s) => s.statusPripreme === "ODMAH" && (s.kolicina || 0) > 0)
        .map((s) => ({
          naziv: s.nazivProizvoda,
          kolicina: s.kolicina || 0,
          jedinica: s.jedinica || "kom",
        })),
      gratis: p.stavke
        .filter((s) => s.statusPripreme === "ODMAH" && (s.gratis || 0) > 0)
        .map((s) => ({
          naziv: s.nazivProizvoda,
          kolicina: s.gratis || 0,
          jedinica: s.jedinica || "kom",
        })),
      dogovoreno: p.stavke
        .filter((s) => s.statusPripreme !== "ODMAH")
        .map((s) => ({
          naziv: s.nazivProizvoda,
          kolicina: s.kolicina || 0,
          jedinica: s.jedinica || "kom",
          status: s.statusPripreme,
        })),
      promo: promoPoPosjetu.get(p.id) || [],
      biljeska: p.biljeska || p.dogovoreno || null,
    });
  }

  // Promo otpisan izvan posjeta (npr. na /putnik/promo) ide kao zaseban događaj.
  for (const o of promoOtpisi) {
    if (o.posjetId) continue;
    dogadaji.push({
      kljuc: `promo-${o.id}`,
      datum: o.datumPredaje,
      tip: "Promo",
      kupacId: o.kupac.id,
      lokal: o.kupac.nazivLokala,
      grad: o.kupac.grad,
      promo: [{ naziv: o.artikl?.naziv || o.naziv || "—", kolicina: o.kolicina }],
      tekst: o.napomena,
    });
  }

  for (const a of aktivnosti) {
    dogadaji.push({
      kljuc: `akt-${a.id}`,
      datum: a.datum,
      tip: "Aktivnost",
      kupacId: a.kupac.id,
      lokal: a.kupac.nazivLokala,
      grad: a.kupac.grad,
      tekst: a.opis || a.zabiljeska || a.stoNastaviti,
    });
  }

  for (const d of dogovori) {
    const detalji = [
      d.nacinKupnje,
      d.dogovorenaKolicina ? `količina ${d.dogovorenaKolicina}` : null,
      d.dogovorenaAkcija,
      d.posebnaCijena ? `cijena ${d.posebnaCijena}` : null,
      d.rabat ? `rabat ${d.rabat}` : null,
    ].filter(Boolean);
    dogadaji.push({
      kljuc: `dog-${d.id}`,
      datum: d.datum,
      tip: "Dogovor",
      kupacId: d.kupac.id,
      lokal: d.kupac.nazivLokala,
      grad: d.kupac.grad,
      tekst: detalji.length ? detalji.join(" · ") : d.zakljucak || d.napomena,
      izvedeno: true,
    });
  }

  for (const a of ankete) {
    dogadaji.push({
      kljuc: `ank-${a.id}`,
      datum: a.createdAt,
      tip: "Anketa",
      kupacId: a.kupac.id,
      lokal: a.kupac.nazivLokala,
      grad: a.kupac.grad,
      tekst: [a.tipLokala, a.razinaLokala, a.promet].filter(Boolean).join(" · ") || null,
      izvedeno: true,
    });
  }

  dogadaji.sort((a, b) => a.datum.getTime() - b.datum.getTime());

  // Grupiranje kronologije po danu.
  const poDanu = new Map<string, Dogadaj[]>();
  for (const d of dogadaji) {
    const k = iso(d.datum);
    if (!poDanu.has(k)) poDanu.set(k, []);
    poDanu.get(k)!.push(d);
  }
  const dani = [...poDanu.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-4">
        {/* ── Zaglavlje ── */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                Izvještaj po razdoblju
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Što je jedan putnik odradio u odabranom razdoblju — sažetak brojki i
                popis radnji po danima. Samo pregled, ništa se ne mijenja.
              </div>
            </div>

            <Link
              href="/putnik"
              className="shrink-0 self-start border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
            >
              Natrag na putnik
            </Link>
          </div>
        </div>

        {/* ── Filtar ── */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Putnik
              </label>
              <select
                name="putnik"
                defaultValue={putnik}
                className={`${polje} min-w-[220px]`}
              >
                <option value="">— odaberi putnika —</option>
                {putnici.map((p) => (
                  <option key={p.ime} value={p.ime}>
                    {p.ime}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Datum od
              </label>
              <input name="od" type="date" defaultValue={odStr} className={polje} />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Datum do
              </label>
              <input name="do" type="date" defaultValue={doStr} className={polje} />
            </div>

            <button
              type="submit"
              className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
            >
              Prikaži
            </button>

            {putnik ? (
              <Link
                href="/putnik/izvjestaj-razdoblje"
                className="text-[12px] text-orange-800 hover:underline"
              >
                Očisti
              </Link>
            ) : null}
          </form>
        </div>

        {!rasponValjan ? (
          <div className="border border-red-300 bg-red-50 px-4 py-4 text-[14px] font-semibold text-red-800">
            Datum &bdquo;od&ldquo; je nakon datuma &bdquo;do&ldquo;. Ispravi raspon.
          </div>
        ) : null}

        {!putnik ? (
          <div className="border border-orange-200 bg-white px-4 py-8 text-center text-[14px] text-stone-500">
            Odaberi putnika i razdoblje pa klikni &bdquo;Prikaži&ldquo;.
          </div>
        ) : null}

        {prikazi ? (
          <>
            {/* ── SAŽETAK ── */}
            <div>
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="text-[20px] font-semibold text-stone-800">Sažetak</h2>
                <span className="text-[13px] text-stone-500">
                  {putnik} · {formatDate(start)} – {formatDate(end)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Kartica
                  naslov="Broj posjeta"
                  vrijednost={String(posjeti.length)}
                  podnaslov={`lokala: ${posjeceniKupacIds.length}`}
                  jako
                />
                <Kartica
                  naslov="Prodano (vino)"
                  vrijednost={broj(ukProdano)}
                  podnaslov="odmah iz auta"
                  jako
                />
                <Kartica
                  naslov="Poklonjeno (gratis)"
                  vrijednost={broj(ukGratis)}
                  podnaslov="uz prodane stavke"
                />
                <Kartica
                  naslov="Dogovoreno za isporuku"
                  vrijednost={broj(ukDogovoreno)}
                  podnaslov={statusOpis || "nema narudžbi"}
                />
                <Kartica
                  naslov="Promo dano lokalima"
                  vrijednost={broj(ukPromo)}
                  podnaslov={`stavki: ${promoOtpisi.length}`}
                />
              </div>
            </div>

            {/* ── Po artiklu ── */}
            <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
              <h2 className="mb-1 text-[18px] font-semibold text-stone-800">
                Vino po artiklu
              </h2>
              <p className="mb-3 text-[12px] text-stone-500">
                Prodano i gratis = stavke izdane odmah iz auta. Dogovoreno = stavke za
                kasniju isporuku.
              </p>

              {artikli.length === 0 ? (
                <div className="border border-orange-200 bg-white px-4 py-4 text-[13px] text-stone-500">
                  Nema stavki vina u ovom razdoblju.
                </div>
              ) : (
                <div className="overflow-x-auto border border-orange-200 bg-white">
                  <table className="w-full min-w-[560px] border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-orange-50 text-left text-[11px] uppercase tracking-[0.1em] text-orange-800/80">
                        <th className="border-b border-orange-200 px-3 py-2">Artikl</th>
                        <th className="border-b border-orange-200 px-3 py-2 text-right">
                          Prodano
                        </th>
                        <th className="border-b border-orange-200 px-3 py-2 text-right">
                          Gratis
                        </th>
                        <th className="border-b border-orange-200 px-3 py-2 text-right">
                          Dogovoreno
                        </th>
                        <th className="border-b border-orange-200 px-3 py-2">Jed.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {artikli.map((r) => (
                        <tr key={r.naziv} className="odd:bg-white even:bg-orange-50/30">
                          <td className="border-b border-orange-100 px-3 py-2 font-semibold text-stone-800">
                            {r.naziv}
                          </td>
                          <td className="border-b border-orange-100 px-3 py-2 text-right font-semibold text-stone-800">
                            {r.prodano ? broj(r.prodano) : "—"}
                          </td>
                          <td className="border-b border-orange-100 px-3 py-2 text-right text-green-700">
                            {r.gratis ? broj(r.gratis) : "—"}
                          </td>
                          <td className="border-b border-orange-100 px-3 py-2 text-right text-orange-800">
                            {r.dogovoreno ? broj(r.dogovoreno) : "—"}
                          </td>
                          <td className="border-b border-orange-100 px-3 py-2 text-stone-500">
                            {r.jedinica}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-amber-50 font-semibold">
                        <td className="px-3 py-2 text-stone-800">Ukupno</td>
                        <td className="px-3 py-2 text-right text-stone-800">
                          {broj(ukProdano)}
                        </td>
                        <td className="px-3 py-2 text-right text-green-700">
                          {broj(ukGratis)}
                        </td>
                        <td className="px-3 py-2 text-right text-orange-800">
                          {broj(ukDogovoreno)}
                        </td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── POPIS RADNJI ── */}
            <div className="border-2 border-orange-300 bg-gradient-to-b from-white to-amber-50 p-4">
              <h2 className="text-[20px] font-semibold text-stone-800">
                Popis radnji po danima
              </h2>
              <p className="mb-3 mt-1 text-[12px] text-stone-500">
                Posjeti, aktivnosti, dogovori, ankete i promo — kronološki.
                <span className="ml-1 text-stone-400">
                  Dogovori i ankete nemaju putnika u bazi, pa se vežu preko lokala koje
                  je putnik posjetio u razdoblju (označeno).
                </span>
              </p>

              {dani.length === 0 ? (
                <div className="border border-orange-200 bg-white px-4 py-6 text-center text-[14px] text-stone-500">
                  Nema zabilježenih radnji za {putnik} u razdoblju {formatDate(start)} –{" "}
                  {formatDate(end)}.
                </div>
              ) : (
                <div className="space-y-3">
                  {dani.map(([dk, stavke]) => (
                    <div key={dk} className="border border-orange-200 bg-white p-3">
                      <div className="mb-2 border-b border-orange-100 pb-1.5 text-[14px] font-semibold text-stone-700">
                        {formatDate(dk)}
                        <span className="ml-2 text-[12px] font-normal text-stone-400">
                          {stavke.length} {radnjeRijec(stavke.length)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {stavke.map((d) => (
                          <div
                            key={d.kljuc}
                            className="border border-orange-100 bg-orange-50/30 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <TipBadge tip={d.tip} />
                              <Link
                                href={`/putnik/kupci/${d.kupacId}`}
                                className="text-[14px] font-semibold text-stone-800 hover:underline"
                              >
                                {d.lokal}
                              </Link>
                              <span className="text-[12px] text-stone-500">
                                {d.grad || ""}
                              </span>
                              {d.izvedeno ? (
                                <span
                                  className="text-[11px] text-stone-400"
                                  title="Vezano preko lokala, ne izravno preko putnika"
                                >
                                  (preko lokala)
                                </span>
                              ) : null}
                            </div>

                            {d.tip === "Posjet" ? (
                              <div className="mt-1.5 grid gap-2 md:grid-cols-4">
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.1em] text-orange-800/70">
                                    Prodano
                                  </div>
                                  {d.prodano && d.prodano.length ? (
                                    <ul className="mt-0.5 space-y-0.5 text-[13px] text-stone-700">
                                      {d.prodano.map((s, i) => (
                                        <li key={i}>
                                          • {s.naziv}{" "}
                                          <strong>
                                            {broj(s.kolicina)} {s.jedinica}
                                          </strong>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="mt-0.5 text-[13px] text-stone-400">
                                      —
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.1em] text-orange-800/70">
                                    Poklonjeno
                                  </div>
                                  {d.gratis && d.gratis.length ? (
                                    <ul className="mt-0.5 space-y-0.5 text-[13px] text-green-700">
                                      {d.gratis.map((s, i) => (
                                        <li key={i}>
                                          • {s.naziv}{" "}
                                          <strong>
                                            {broj(s.kolicina)} {s.jedinica}
                                          </strong>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="mt-0.5 text-[13px] text-stone-400">
                                      —
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.1em] text-orange-800/70">
                                    Dogovoreno
                                  </div>
                                  {d.dogovoreno && d.dogovoreno.length ? (
                                    <ul className="mt-0.5 space-y-0.5 text-[13px] text-orange-800">
                                      {d.dogovoreno.map((s, i) => (
                                        <li key={i}>
                                          • {s.naziv}{" "}
                                          <strong>
                                            {broj(s.kolicina)} {s.jedinica}
                                          </strong>
                                          <span className="ml-1 text-[11px] text-stone-500">
                                            {s.status}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="mt-0.5 text-[13px] text-stone-400">
                                      —
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.1em] text-orange-800/70">
                                    Promo
                                  </div>
                                  {d.promo && d.promo.length ? (
                                    <ul className="mt-0.5 space-y-0.5 text-[13px] text-amber-900">
                                      {d.promo.map((s, i) => (
                                        <li key={i}>
                                          • {s.naziv} <strong>×{s.kolicina}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="mt-0.5 text-[13px] text-stone-400">
                                      —
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {d.tip === "Promo" && d.promo ? (
                              <div className="mt-1 text-[13px] text-amber-900">
                                {d.promo.map((s, i) => (
                                  <span key={i} className="mr-3">
                                    {s.naziv} <strong>×{s.kolicina}</strong>
                                  </span>
                                ))}
                              </div>
                            ) : null}

                            {d.tekst ? (
                              <div className="mt-1 text-[13px] whitespace-pre-wrap text-stone-600">
                                {d.tekst}
                              </div>
                            ) : null}

                            {d.tip === "Posjet" && d.biljeska ? (
                              <div className="mt-1.5 border-t border-orange-100 pt-1.5 text-[13px] whitespace-pre-wrap text-stone-600">
                                {d.biljeska}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
