import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { formatHrDateTime } from "@/lib/datum";

export const dynamic = "force-dynamic";

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="border border-orange-100 bg-orange-50/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">{label}</div>
      <div className="mt-0.5 text-[14px] font-semibold text-stone-800">{value || value === 0 ? value : "-"}</div>
    </div>
  );
}

export default async function DnevniIzvjestajPage({
  searchParams,
}: {
  searchParams: Promise<{ datum?: string }>;
}) {
  const sp = await searchParams;
  const danas = new Date().toISOString().slice(0, 10);
  const datumStr = sp.datum || danas;

  const start = new Date(`${datumStr}T00:00:00`);
  const end = new Date(`${datumStr}T23:59:59.999`);

  const posjeti = await prisma.putnikPosjet.findMany({
    where: { datum: { gte: start, lte: end } },
    include: {
      kupac: { select: { id: true, nazivLokala: true, grad: true } },
      stavke: { orderBy: { createdAt: "asc" } },
      promoOtpisi: { include: { artikl: { select: { naziv: true } } } },
    },
    orderBy: [{ vrijemeOd: "asc" }],
  });

  const ukupnoKm = posjeti.reduce((s, p) => s + (p.kilometri || 0), 0);
  const ukupnoStavki = posjeti.reduce((s, p) => s + p.stavke.length, 0);
  const brManjak = posjeti.filter((p) => p.stanjeProizvoda === "MANJAK").length;

  const aktivnostLabele: { key: keyof (typeof posjeti)[number]; label: string }[] = [
    { key: "aktDegustacija", label: "Degustacija" },
    { key: "aktVidljivost", label: "Vidljivost" },
    { key: "aktSlaganjeRobe", label: "Slaganje robe" },
    { key: "aktIstaknuteCijene", label: "Istaknute cijene" },
    { key: "aktAkcijskaCijena", label: "Akcijska cijena" },
  ];

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1400px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                Dnevni izvještaj
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Svi posjeti za odabrani dan: narudžba, materijal, aktivnosti, dug i prijeđeni kilometri.
              </div>
            </div>

            <div className="flex items-end gap-2">
              <form method="GET" className="flex items-end gap-2">
                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                    Datum
                  </label>
                  <input
                    name="datum"
                    type="date"
                    defaultValue={datumStr}
                    className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
                  />
                </div>
                <button
                  type="submit"
                  className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
                >
                  Prikaži
                </button>
              </form>

              <Link
                href="/putnik"
                className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
              >
                Putnik
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Kartica naslov="Datum" vrijednost={formatDate(start)} />
          <Kartica naslov="Broj posjeta" vrijednost={String(posjeti.length)} />
          <Kartica naslov="Prijeđeno km" vrijednost={ukupnoKm.toLocaleString("hr-HR")} podnaslov="zbroj po etapama" />
          <Kartica naslov="Manjak proizvoda" vrijednost={String(brManjak)} podnaslov={`stavki narudžbe: ${ukupnoStavki}`} />
        </div>

        {posjeti.length === 0 ? (
          <div className="border border-orange-200 bg-white px-4 py-6 text-center text-[14px] text-stone-500">
            Nema zabilježenih posjeta za {formatDate(start)}.
          </div>
        ) : (
          <div className="space-y-3">
            {posjeti.map((p) => {
              const aktivne = aktivnostLabele.filter((a) => p[a.key]);
              return (
                <div key={p.id} className="border border-orange-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100 pb-2">
                    <div className="text-[16px] font-semibold text-stone-800">
                      {p.vrijemeOd || "—"}
                      {p.vrijemeDo ? `–${p.vrijemeDo}` : ""}
                      <Link
                        href={`/putnik/kupci/${p.kupac.id}`}
                        className="ml-3 text-[15px] font-semibold text-orange-900 hover:underline"
                      >
                        {p.kupac.nazivLokala}
                      </Link>
                      <span className="ml-2 text-[12px] font-normal text-stone-500">
                        {p.mjesto || p.kupac.grad || "-"}
                      </span>
                      <div className="text-[11px] font-normal text-stone-400">
                        Upisano: {formatHrDateTime(p.createdAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[12px]">
                      {p.tipObilaska ? (
                        <span className="inline-flex border border-orange-200 bg-orange-50 px-2 py-1 font-semibold text-orange-900">
                          Ritam {p.tipObilaska}
                        </span>
                      ) : null}
                      {p.tipPremise ? (
                        <span className="inline-flex border border-stone-300 bg-stone-50 px-2 py-1 font-semibold text-stone-700">
                          {p.tipPremise} premise
                        </span>
                      ) : null}
                      {p.stanjeProizvoda ? (
                        <span
                          className={`inline-flex border px-2 py-1 font-semibold ${
                            p.stanjeProizvoda === "MANJAK"
                              ? "border-red-300 bg-red-50 text-red-700"
                              : "border-green-300 bg-green-50 text-green-800"
                          }`}
                        >
                          {p.stanjeProizvoda}
                        </span>
                      ) : null}
                      {p.kilometri != null ? (
                        <span className="inline-flex border border-orange-200 bg-white px-2 py-1 font-semibold text-stone-700">
                          {p.kilometri} km
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Narudžba
                      </div>
                      {p.stavke.length === 0 ? (
                        <div className="mt-1 text-[13px] text-stone-500">(bez narudžbe)</div>
                      ) : (
                        <ul className="mt-1 space-y-1 text-[13px] text-stone-700">
                          {p.stavke.map((s) => (
                            <li key={s.id}>
                              • {s.nazivProizvoda}
                              {s.kolicina != null ? ` — ${s.kolicina} ${s.jedinica || "kom"}` : ""}
                              {s.gratis ? (
                                <span className="text-green-700"> (+{s.gratis} gratis)</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                          Pokloni / promo
                        </div>
                        {p.promoOtpisi.length === 0 ? (
                          <div className="mt-0.5 text-[13px] text-stone-500">
                            {p.reklamniMaterijal || "—"}
                          </div>
                        ) : (
                          <ul className="mt-0.5 space-y-0.5 text-[13px] text-stone-700">
                            {p.promoOtpisi.map((o) => (
                              <li key={o.id}>
                                • {o.artikl?.naziv || o.naziv} ×{o.kolicina}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Info label="Cijena" value={p.cijena} />
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                          Aktivnosti
                        </div>
                        {aktivne.length === 0 ? (
                          <div className="mt-1 text-[13px] text-stone-500">-</div>
                        ) : (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {aktivne.map((a) => (
                              <span
                                key={a.key as string}
                                className="inline-flex border border-green-200 bg-green-50 px-2 py-0.5 text-[12px] font-semibold text-green-800"
                              >
                                {a.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Info label="Dug (ukupno / dospjelo)" value={`${p.ukupanDug ?? "-"} / ${p.dospjeliDug ?? "-"}`} />
                    </div>
                  </div>

                  {p.problemi ? (
                    <div className="mt-3 border border-orange-100 bg-orange-50/40 px-3 py-2 text-[13px] whitespace-pre-wrap text-stone-700">
                      <strong>Napomene / problemi:</strong> {p.problemi}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
