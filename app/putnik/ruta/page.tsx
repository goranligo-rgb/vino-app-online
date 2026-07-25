import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";
import { oznaciStatus, dodajRucnuRutu, obrisiStavku } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function danUTjednu(value: Date) {
  return new Date(value).toLocaleDateString("hr-HR", { weekday: "long" });
}

function iso(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function KatBadge({ kat }: { kat?: string | null }) {
  const boje: Record<string, string> = {
    A: "border-green-300 bg-green-50 text-green-800",
    B: "border-amber-300 bg-amber-50 text-amber-800",
    C: "border-orange-300 bg-orange-50 text-orange-800",
    D: "border-stone-300 bg-stone-50 text-stone-600",
  };
  const cls = boje[kat || ""] || "border-stone-300 bg-white text-stone-600";
  return (
    <span className={`inline-flex border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      Kat {kat || "-"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PLANIRANO: "border-orange-300 bg-orange-50 text-orange-800",
    OBAVLJENO: "border-green-300 bg-green-50 text-green-800",
    PRESKOCENO: "border-stone-300 bg-stone-100 text-stone-600",
  };
  return (
    <span className={`inline-flex border px-2 py-0.5 text-[11px] font-semibold ${map[status] || ""}`}>
      {status}
    </span>
  );
}

function Kartica({ naslov, vrijednost }: { naslov: string; vrijednost: string }) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
        {naslov}
      </div>
      <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">
        {vrijednost}
      </div>
    </div>
  );
}

// Gumbi za status + (samo ručno) Ukloni. Reuse oznaciStatus za oboje.
function StatusGumbi({ id, status, rucno }: { id: string; status: string; rucno?: boolean }) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1">
      {status !== "OBAVLJENO" ? (
        <form action={oznaciStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="OBAVLJENO" />
          <button type="submit" className="border border-green-300 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-800 hover:brightness-105">
            Obavljeno
          </button>
        </form>
      ) : null}
      {status === "PLANIRANO" ? (
        <form action={oznaciStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="PRESKOCENO" />
          <button type="submit" className="border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50">
            Preskoči
          </button>
        </form>
      ) : null}
      {status !== "PLANIRANO" ? (
        <form action={oznaciStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="PLANIRANO" />
          <button type="submit" className="border border-orange-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-orange-50">
            Vrati
          </button>
        </form>
      ) : null}
      {rucno ? (
        <form action={obrisiStavku}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:brightness-105">
            Ukloni
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function RutaPage({
  searchParams,
}: {
  searchParams: Promise<{ datum?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePutnikUser();
  const danas = new Date().toISOString().slice(0, 10);

  const [mojaRuta, kupci] = await Promise.all([
    // MOJA ručna ruta: po putniku, ručni redci (tjedan = null)
    prisma.putnikPlanObilaska.findMany({
      where: { putnikIme: user.ime, tjedan: null },
      include: { kupac: { select: { id: true, nazivLokala: true, grad: true, kategorija: true } } },
      orderBy: [{ datum: "asc" }],
    }),
    // Aktivni kupci za odabir (model nema vlasnika; putnik sam bira svoje)
    prisma.putnikKupac.findMany({
      where: { aktivan: true },
      select: { id: true, nazivLokala: true, grad: true, kategorija: true },
      orderBy: { nazivLokala: "asc" },
    }),
  ]);

  const brObavljeno = mojaRuta.filter((s) => s.status === "OBAVLJENO").length;
  const brPlanirano = mojaRuta.filter((s) => s.status === "PLANIRANO").length;

  // ── MOJA RUČNA RUTA: opcionalni filtar po danu, grupiranje po datumu ──
  const filterDatum = sp.datum || "";
  const mojiPrikaz = filterDatum ? mojaRuta.filter((s) => iso(s.datum) === filterDatum) : mojaRuta;
  const mojiPoDanu = new Map<string, typeof mojaRuta>();
  for (const s of mojiPrikaz) {
    const dk = iso(s.datum);
    if (!mojiPoDanu.has(dk)) mojiPoDanu.set(dk, []);
    mojiPoDanu.get(dk)!.push(s);
  }
  const mojiDani = [...mojiPoDanu.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const polje = "border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400";

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                Prodajna ruta
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Ručna ruta po danu — odaberi datum i lokale koje obilaziš (putnik: {user.ime}).
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

        <div className="grid gap-3 md:grid-cols-3">
          <Kartica naslov="Moja ručna ruta" vrijednost={String(mojaRuta.length)} />
          <Kartica naslov="Planirano" vrijednost={String(brPlanirano)} />
          <Kartica naslov="Obavljeno" vrijednost={String(brObavljeno)} />
        </div>

        {/* ── MOJA RUČNA RUTA (po putniku, po danu) ── */}
        <div className="border-2 border-orange-300 bg-gradient-to-b from-white to-amber-50 p-4">
          <h2 className="text-[20px] font-semibold text-stone-800">Moja ručna ruta</h2>
          <p className="mt-1 text-[13px] text-stone-500">
            Odaberi datum i lokale koje taj dan obilaziš. Ruta se vodi samo za tebe.
          </p>

          {/* Forma: složi rutu za datum */}
          <form action={dodajRucnuRutu} className="mt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[13px] font-semibold text-stone-700">Datum</label>
                <input name="datum" type="date" defaultValue={filterDatum || danas} className={polje} />
              </div>
              <button type="submit" className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105">
                Spremi rutu za datum
              </button>
              <span className="text-[12px] text-stone-500">Označi lokale ispod pa spremi. Već dodani za taj dan se preskaču.</span>
            </div>

            {kupci.length === 0 ? (
              <div className="text-[13px] text-stone-500">Nema aktivnih kupaca.</div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto border border-orange-200 bg-white p-2">
                <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
                  {kupci.map((k) => (
                    <label key={k.id} className="flex cursor-pointer items-center gap-2 border border-orange-100 bg-orange-50/30 px-2 py-2 text-[13px] hover:bg-orange-50">
                      <input type="checkbox" name="kupacId" value={k.id} className="h-4 w-4 accent-orange-700" />
                      <KatBadge kat={k.kategorija} />
                      <span className="min-w-0 truncate">
                        <strong>{k.nazivLokala}</strong>
                        <span className="ml-1 text-stone-500">{k.grad || ""}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </form>

          {/* Pregled moje rute po danu (opcionalni filtar datuma) */}
          <div className="mt-4 border-t border-orange-200 pt-3">
            <form method="GET" className="mb-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[13px] font-semibold text-stone-700">Prikaži dan</label>
                <input name="datum" type="date" defaultValue={filterDatum} className={polje} />
              </div>
              <button type="submit" className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50">
                Filtriraj
              </button>
              {filterDatum ? (
                <Link href="/putnik/ruta" className="text-[12px] text-orange-800 hover:underline">
                  Prikaži sve dane
                </Link>
              ) : null}
            </form>

            {mojiDani.length === 0 ? (
              <div className="border border-orange-200 bg-white px-4 py-4 text-[13px] text-stone-500">
                {filterDatum ? "Nema lokala u tvojoj ruti za taj dan." : "Još nemaš ručno složenu rutu. Odaberi datum i lokale gore."}
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {mojiDani.map(([dk, items]) => (
                  <div key={dk} className="border border-orange-200 bg-white p-3">
                    <div className="mb-2 text-[13px] font-semibold text-stone-700">
                      {danUTjednu(items[0].datum)} — {formatDate(items[0].datum)}
                    </div>
                    <div className="space-y-2">
                      {items.map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border border-orange-100 bg-amber-50/40 px-2 py-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <KatBadge kat={s.kupac.kategorija} />
                              <StatusBadge status={s.status} />
                            </div>
                            <Link href={`/putnik/kupci/${s.kupac.id}`} className="mt-1 block truncate text-[14px] font-semibold text-stone-800 hover:underline">
                              {s.kupac.nazivLokala}
                            </Link>
                            <div className="text-[12px] text-stone-500">{s.kupac.grad || "-"}</div>
                          </div>
                          <StatusGumbi id={s.id} status={s.status} rucno />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
