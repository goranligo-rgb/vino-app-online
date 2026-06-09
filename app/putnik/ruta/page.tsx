import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { generirajPlan, oznaciStatus } from "./actions";

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

export default async function RutaPage() {
  const stavke = await prisma.putnikPlanObilaska.findMany({
    include: {
      kupac: {
        select: { id: true, nazivLokala: true, grad: true, kategorija: true },
      },
    },
    orderBy: [{ datum: "asc" }],
  });

  // Grupiranje: tjedan -> datum (dan) -> stavke
  const poTjednu = new Map<number, Map<string, typeof stavke>>();
  for (const s of stavke) {
    const t = s.tjedan ?? 0;
    const dk = new Date(s.datum).toISOString().slice(0, 10);
    if (!poTjednu.has(t)) poTjednu.set(t, new Map());
    const dani = poTjednu.get(t)!;
    if (!dani.has(dk)) dani.set(dk, []);
    dani.get(dk)!.push(s);
  }

  const tjedni = [...poTjednu.entries()].sort((a, b) => a[0] - b[0]);

  const brObavljeno = stavke.filter((s) => s.status === "OBAVLJENO").length;
  const brPlanirano = stavke.filter((s) => s.status === "PLANIRANO").length;

  const danas = new Date().toISOString().slice(0, 10);

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
                Plan obilaska za 3 mjeseca po ABC(D) kadenci: A=mjesečno, B=svaka 2,
                C=svaka 3 mjeseca, D=povremeno.
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

        <div className="grid gap-3 md:grid-cols-4">
          <Kartica naslov="Ukupno u planu" vrijednost={String(stavke.length)} />
          <Kartica naslov="Planirano" vrijednost={String(brPlanirano)} />
          <Kartica naslov="Obavljeno" vrijednost={String(brObavljeno)} />
          <Kartica naslov="Tjedana" vrijednost={String(tjedni.length)} />
        </div>

        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <form action={generirajPlan} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Početni datum plana
              </label>
              <input
                name="pocetniDatum"
                type="date"
                defaultValue={danas}
                className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
              />
            </div>
            <button
              type="submit"
              className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
            >
              Generiraj plan
            </button>
            <span className="text-[12px] text-stone-500">
              Generira plan za sve aktivne kupce s kategorijom. Zamjenjuje postojeći
              neobavljeni plan (obavljeni/preskočeni ostaju).
            </span>
          </form>
        </div>

        {tjedni.length === 0 ? (
          <div className="border border-orange-200 bg-white px-4 py-6 text-center text-[14px] text-stone-500">
            Plan još nije generiran. Odaberi početni datum i klikni "Generiraj plan".
          </div>
        ) : (
          <div className="space-y-4">
            {tjedni.map(([tjedan, dani]) => (
              <div
                key={tjedan}
                className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4"
              >
                <h2 className="mb-3 border-b border-orange-200 pb-2 text-[18px] font-semibold text-stone-800">
                  Tjedan {tjedan}
                </h2>

                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {[...dani.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([dk, items]) => (
                      <div key={dk} className="border border-orange-200 bg-white p-3">
                        <div className="mb-2 text-[13px] font-semibold text-stone-700">
                          {danUTjednu(items[0].datum)} — {formatDate(items[0].datum)}
                        </div>

                        <div className="space-y-2">
                          {items.map((s) => (
                            <div
                              key={s.id}
                              className="flex flex-wrap items-center justify-between gap-2 border border-orange-100 bg-orange-50/40 px-2 py-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <KatBadge kat={s.kupac.kategorija} />
                                  <StatusBadge status={s.status} />
                                </div>
                                <Link
                                  href={`/putnik/kupci/${s.kupac.id}`}
                                  className="mt-1 block truncate text-[14px] font-semibold text-stone-800 hover:underline"
                                >
                                  {s.kupac.nazivLokala}
                                </Link>
                                <div className="text-[12px] text-stone-500">
                                  {s.kupac.grad || "-"}
                                </div>
                              </div>

                              <div className="flex shrink-0 gap-1">
                                {s.status !== "OBAVLJENO" ? (
                                  <form action={oznaciStatus}>
                                    <input type="hidden" name="id" value={s.id} />
                                    <input type="hidden" name="status" value="OBAVLJENO" />
                                    <button
                                      type="submit"
                                      className="border border-green-300 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-800 hover:brightness-105"
                                    >
                                      Obavljeno
                                    </button>
                                  </form>
                                ) : null}

                                {s.status === "PLANIRANO" ? (
                                  <form action={oznaciStatus}>
                                    <input type="hidden" name="id" value={s.id} />
                                    <input type="hidden" name="status" value="PRESKOCENO" />
                                    <button
                                      type="submit"
                                      className="border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50"
                                    >
                                      Preskoči
                                    </button>
                                  </form>
                                ) : null}

                                {s.status !== "PLANIRANO" ? (
                                  <form action={oznaciStatus}>
                                    <input type="hidden" name="id" value={s.id} />
                                    <input type="hidden" name="status" value="PLANIRANO" />
                                    <button
                                      type="submit"
                                      className="border border-orange-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-orange-50"
                                    >
                                      Vrati
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
