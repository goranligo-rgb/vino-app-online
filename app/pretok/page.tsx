"use client";

import NatragHome from "@/components/NatragHome";
import { useEffect, useMemo, useState } from "react";

type Tank = {
  id: string;
  broj: number;
  sorta: string | null;
  nazivVina?: string | null;
  kolicinaVinaUTanku: number | null;
  kapacitet: number;
  tip: string | null;
};

type IzvorRed = {
  tankId: string;
  kolicina: string;
};

type TipPretoka = "OBICNI" | "CUVEE" | "BLEND_ISTE_SORTE";

function formatL(value: number) {
  return value.toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function opisTanka(t: Tank) {
  const sorta = t.sorta?.trim() || t.nazivVina?.trim() || null;
  const tip = t.tip?.trim() || "tank";
  const opis = sorta ? sorta : tip;

  const kapacitet = Number(t.kapacitet ?? 0);
  const trenutno = Number(t.kolicinaVinaUTanku ?? 0);
  const slobodno = Math.max(kapacitet - trenutno, 0);

  return `Tank ${t.broj} — ${opis} — kapacitet ${formatL(
    kapacitet
  )} L — trenutno ${formatL(trenutno)} L — slobodno ${formatL(slobodno)} L`;
}

function nazivTankaKratko(t: Tank | null | undefined) {
  if (!t) return "-";
  return t.nazivVina?.trim() || t.sorta?.trim() || t.tip?.trim() || "bez naziva";
}

function Kartica({
  naslov,
  vrijednost,
  podnaslov,
}: {
  naslov: string;
  vrijednost: string;
  podnaslov?: string;
}) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-4">
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

function Oznaka({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-900">
      {children}
    </span>
  );
}

export default function PretokPage() {
  const [tankovi, setTankovi] = useState<Tank[]>([]);
  const [tipPretoka, setTipPretoka] = useState<TipPretoka>("OBICNI");
  const [cilj, setCilj] = useState("");
  const [izvori, setIzvori] = useState<IzvorRed[]>([
    { tankId: "", kolicina: "" },
  ]);
  const [nazivNovogVina, setNazivNovogVina] = useState("");
  const [sortaNovogVina, setSortaNovogVina] = useState("");
  const [napomena, setNapomena] = useState("");
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");

  useEffect(() => {
    async function ucitaj() {
      try {
        const res = await fetch("/api/tank", { cache: "no-store" });
        const data = await res.json();
        setTankovi(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setPoruka("Greška kod učitavanja tankova.");
      }
    }

    ucitaj();
  }, []);

  function addRow() {
    setIzvori((prev) => [...prev, { tankId: "", kolicina: "" }]);
  }

  function removeRow(index: number) {
    setIzvori((prev) => {
      if (prev.length === 1) {
        return [{ tankId: "", kolicina: "" }];
      }

      return prev.filter((_, i) => i !== index);
    });
  }

  function update(index: number, field: keyof IzvorRed, value: string) {
    setIzvori((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  const ciljTank = useMemo(
    () => tankovi.find((t) => t.id === cilj) ?? null,
    [tankovi, cilj]
  );

  const odabraniIzvori = useMemo(() => {
    return izvori
      .map((row, index) => {
        const tank = tankovi.find((t) => t.id === row.tankId) ?? null;
        const kolicina = Number(row.kolicina || 0);

        return {
          index,
          tankId: row.tankId,
          tank,
          kolicina,
        };
      })
      .filter((r) => r.tank && r.kolicina > 0);
  }, [izvori, tankovi]);

  const ukupnoPretok = useMemo(() => {
    return odabraniIzvori.reduce((sum, r) => sum + r.kolicina, 0);
  }, [odabraniIzvori]);

  const novoStanjeCilja = useMemo(() => {
    return Number(ciljTank?.kolicinaVinaUTanku ?? 0) + ukupnoPretok;
  }, [ciljTank, ukupnoPretok]);

  const slobodnoUCilju = useMemo(() => {
    return (
      Number(ciljTank?.kapacitet ?? 0) -
      Number(ciljTank?.kolicinaVinaUTanku ?? 0)
    );
  }, [ciljTank]);

  const sorteIzvora = Array.from(
    new Set(
      odabraniIzvori
        .map((r) => r.tank?.sorta)
        .filter((s): s is string => Boolean(s))
    )
  );

  const sveSorte = Array.from(
    new Set(
      [ciljTank?.sorta, ...odabraniIzvori.map((r) => r.tank?.sorta)].filter(
        (s): s is string => Boolean(s)
      )
    )
  );

  const predlozenaSorta =
    sveSorte.length <= 1 ? (sveSorte[0] ?? "") : "Mješavina";

  const mijesanjeRazlicitihSorti = sorteIzvora.length > 1;

  const trebaNovoVino =
    tipPretoka === "CUVEE" || tipPretoka === "BLEND_ISTE_SORTE";

  useEffect(() => {
    if (tipPretoka === "BLEND_ISTE_SORTE") {
      if (!sortaNovogVina.trim()) {
        const jedinaSorta =
          sorteIzvora.length === 1
            ? sorteIzvora[0]
            : ciljTank?.sorta || predlozenaSorta || "";
        if (jedinaSorta) {
          setSortaNovogVina(jedinaSorta);
        }
      }
    }

    if (tipPretoka === "CUVEE") {
      if (!sortaNovogVina.trim()) {
        setSortaNovogVina(predlozenaSorta || "Cuvée");
      }
    }
  }, [tipPretoka, sorteIzvora, ciljTank, predlozenaSorta, sortaNovogVina]);

  async function spremi() {
    setPoruka("");

    if (!cilj) {
      setPoruka("Odaberi ciljni tank.");
      return;
    }

    const cistiIzvori = izvori
      .map((i) => ({
        tankId: i.tankId,
        kolicina: Number(i.kolicina),
      }))
      .filter((i) => i.tankId && i.kolicina > 0);

    if (cistiIzvori.length === 0) {
      setPoruka("Dodaj barem jedan izvorni tank i količinu.");
      return;
    }

    if (cistiIzvori.some((i) => i.tankId === cilj)) {
      setPoruka("Ciljni tank ne može biti ujedno i izvorni tank.");
      return;
    }

    const sviTankoviRazliciti = new Set(cistiIzvori.map((i) => i.tankId));
    if (sviTankoviRazliciti.size !== cistiIzvori.length) {
      setPoruka("Isti izvorni tank ne može biti odabran više puta.");
      return;
    }

    for (const izvor of cistiIzvori) {
      const tank = tankovi.find((t) => t.id === izvor.tankId);
      const stanje = Number(tank?.kolicinaVinaUTanku ?? 0);

      if (!tank) {
        setPoruka("Jedan od odabranih izvornih tankova ne postoji.");
        return;
      }

      if (izvor.kolicina > stanje) {
        setPoruka(
          `Tank ${tank.broj} nema dovoljno vina. Dostupno: ${formatL(stanje)} L.`
        );
        return;
      }
    }

    if (ciljTank && novoStanjeCilja > ciljTank.kapacitet) {
      setPoruka(
        `Ciljni tank nema dovoljno kapaciteta. Maksimalno slobodno: ${formatL(
          slobodnoUCilju
        )} L.`
      );
      return;
    }

    if (trebaNovoVino && !nazivNovogVina.trim()) {
      setPoruka("Upiši naziv novog vina.");
      return;
    }

    if (trebaNovoVino && !sortaNovogVina.trim()) {
      setPoruka("Upiši sortu novog vina.");
      return;
    }

    const potvrdaTekst = [
      "Potvrdi pretok / spajanje",
      "",
      `Tip: ${
        tipPretoka === "OBICNI"
          ? "Obični pretok"
          : tipPretoka === "CUVEE"
          ? "Novo vino – cuvée"
          : "Novo vino – ista sorta"
      }`,
      "",
      ciljTank
        ? `Cilj: Tank ${ciljTank.broj} — ${nazivTankaKratko(
            ciljTank
          )} — trenutno ${formatL(Number(ciljTank.kolicinaVinaUTanku ?? 0))} L`
        : "",
      "",
      ...(trebaNovoVino
        ? [
            `Naziv novog vina: ${nazivNovogVina}`,
            `Sorta novog vina: ${sortaNovogVina}`,
            "",
          ]
        : []),
      "Izvori:",
      ...odabraniIzvori.map((r) => {
        const dostupno = Number(r.tank?.kolicinaVinaUTanku ?? 0);
        return `- Tank ${r.tank?.broj} — ${nazivTankaKratko(
          r.tank
        )} — pretok ${formatL(r.kolicina)} L od ${formatL(dostupno)} L`;
      }),
      "",
      `Ukupno za pretok: ${formatL(ukupnoPretok)} L`,
      `Novo stanje ciljnog tanka: ${formatL(novoStanjeCilja)} L`,
      `Napomena: ${napomena || "-"}`,
    ].join("\n");

    const ok = window.confirm(potvrdaTekst);
    if (!ok) return;

    setLoading(true);

    try {
      const res = await fetch("/api/pretok", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipPretoka,
          ciljTankId: cilj,
          nazivNovogVina: trebaNovoVino ? nazivNovogVina.trim() : null,
          sortaNovogVina: trebaNovoVino ? sortaNovogVina.trim() : null,
          napomena: napomena.trim() || null,
          izvori: cistiIzvori,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška kod pretoka.");
        return;
      }

      alert("Pretok uspješan!");
      location.href = `/tankovi/${cilj}`;
    } catch (e) {
      console.error(e);
      setPoruka("Greška kod pretoka.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[1200px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
            Pretoci / spajanja
          </h1>
          <div className="mt-1 text-[13px] text-stone-500">
            Odaberi tip pretoka, ciljni tank i izvore iz kojih pretačeš vino.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Kartica
            naslov="Tip pretoka"
            vrijednost={
              tipPretoka === "OBICNI"
                ? "Obični"
                : tipPretoka === "CUVEE"
                ? "Cuvée"
                : "Ista sorta"
            }
          />
          <Kartica
            naslov="Ukupno za pretok"
            vrijednost={`${formatL(ukupnoPretok)} L`}
          />
          <Kartica
            naslov="Novo stanje cilja"
            vrijednost={ciljTank ? `${formatL(novoStanjeCilja)} L` : "-"}
          />
        </div>

        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Tip pretoka
              </label>
              <select
                value={tipPretoka}
                onChange={(e) => setTipPretoka(e.target.value as TipPretoka)}
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              >
                <option value="OBICNI">Obični pretok</option>
                <option value="CUVEE">Novo vino – cuvée</option>
                <option value="BLEND_ISTE_SORTE">Novo vino – ista sorta</option>
              </select>
            </div>

            {trebaNovoVino && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                    Naziv novog vina
                  </label>
                  <input
                    value={nazivNovogVina}
                    onChange={(e) => setNazivNovogVina(e.target.value)}
                    placeholder={
                      tipPretoka === "CUVEE"
                        ? "npr. Bijeli cuvée 2026"
                        : "npr. Sauvignon Lukovec"
                    }
                    className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                    Sorta novog vina
                  </label>
                  <input
                    value={sortaNovogVina}
                    onChange={(e) => setSortaNovogVina(e.target.value)}
                    placeholder={
                      tipPretoka === "CUVEE" ? "npr. Cuvée" : "npr. Sauvignon"
                    }
                    className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Ciljni tank
              </label>

              <select
                value={cilj}
                onChange={(e) => setCilj(e.target.value)}
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              >
                <option value="">Odaberi ciljni tank</option>
                {tankovi.map((t) => (
                  <option key={t.id} value={t.id}>
                    {opisTanka(t)}
                  </option>
                ))}
              </select>

              {ciljTank && (
                <div className="mt-3 border border-orange-200 bg-white p-4">
                  <div className="mb-3 text-[14px] font-semibold text-stone-800">
                    Podaci o ciljnom tanku
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div className="border border-orange-100 bg-orange-50/40 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Tank
                      </div>
                      <div className="mt-1 text-[16px] font-semibold text-stone-800">
                        {ciljTank.broj}
                      </div>
                    </div>

                    <div className="border border-orange-100 bg-orange-50/40 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Kapacitet
                      </div>
                      <div className="mt-1 text-[16px] font-semibold text-stone-800">
                        {formatL(Number(ciljTank.kapacitet ?? 0))} L
                      </div>
                    </div>

                    <div className="border border-orange-100 bg-orange-50/40 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Trenutno unutra
                      </div>
                      <div className="mt-1 text-[16px] font-semibold text-stone-800">
                        {formatL(Number(ciljTank.kolicinaVinaUTanku ?? 0))} L
                      </div>
                    </div>

                    <div className="border border-orange-100 bg-orange-50/40 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Slobodno
                      </div>
                      <div className="mt-1 text-[16px] font-semibold text-stone-800">
                        {formatL(slobodnoUCilju)} L
                      </div>
                    </div>

                    <div className="border border-orange-100 bg-orange-50/40 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Tip
                      </div>
                      <div className="mt-1 text-[16px] font-semibold text-stone-800">
                        {ciljTank.tip || "-"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="border border-orange-100 bg-orange-50/30 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Naziv vina
                      </div>
                      <div className="mt-1 text-[15px] font-semibold text-stone-800">
                        {ciljTank.nazivVina?.trim() || "-"}
                      </div>
                    </div>

                    <div className="border border-orange-100 bg-orange-50/30 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Sorta
                      </div>
                      <div className="mt-1 text-[15px] font-semibold text-stone-800">
                        {ciljTank.sorta || "-"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-stone-800">
              Izvorni tankovi
            </h2>

            <button
              type="button"
              onClick={addRow}
              className="border border-orange-300 bg-white px-3 py-2 text-[13px] font-medium text-stone-700 hover:bg-orange-50"
            >
              + Dodaj izvor
            </button>
          </div>

          <div className="space-y-3">
            {izvori.map((row, i) => {
              const odabraniTank =
                tankovi.find((t) => t.id === row.tankId) ?? null;

              const vecOdabraniDrugdje = izvori.some(
                (r, idx) => idx !== i && r.tankId && r.tankId === row.tankId
              );

              return (
                <div
                  key={i}
                  className="grid gap-3 border border-orange-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_180px_110px]"
                >
                  <div className="grid gap-2">
                    <label className="text-[13px] font-semibold text-stone-700">
                      Tank
                    </label>
                    <select
                      value={row.tankId}
                      onChange={(e) => update(i, "tankId", e.target.value)}
                      className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
                    >
                      <option value="">Odaberi izvorni tank</option>
                      {tankovi.map((t) => {
                        const kolicina = Number(t.kolicinaVinaUTanku ?? 0);

                        const zauzetUDrugomRedu = izvori.some(
                          (r, idx) => idx !== i && r.tankId === t.id
                        );

                        const disabled =
                          t.id === cilj || kolicina <= 0 || zauzetUDrugomRedu;

                        return (
                          <option
                            key={t.id}
                            value={t.id}
                            disabled={disabled}
                          >
                            {opisTanka(t)}
                          </option>
                        );
                      })}
                    </select>

                    {odabraniTank && (
                      <div className="text-[13px] text-stone-500">
                        {opisTanka(odabraniTank)}
                      </div>
                    )}

                    {vecOdabraniDrugdje && (
                      <div className="text-[12px] font-medium text-orange-700">
                        Ovaj tank je već odabran u drugom redu.
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <label className="text-[13px] font-semibold text-stone-700">
                      Količina za pretok
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="L"
                      value={row.kolicina}
                      onChange={(e) => update(i, "kolicina", e.target.value)}
                      className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="w-full border border-red-200 bg-red-50 px-3 py-3 text-[13px] font-semibold text-red-700 hover:bg-red-100"
                    >
                      Obriši
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
          <label className="mb-1 block text-[13px] font-semibold text-stone-700">
            Napomena
          </label>
          <textarea
            value={napomena}
            onChange={(e) => setNapomena(e.target.value)}
            placeholder="npr. Miješanje tri sauvignona u novi tank"
            className="min-h-[100px] w-full resize-y border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
          />
        </div>

        {ciljTank && (
          <div className="border border-orange-300 bg-gradient-to-b from-orange-50 to-amber-50 p-4">
            <div className="mb-3 text-[18px] font-semibold text-stone-800">
              Pregled pretoka prije spremanja
            </div>

            <div className="space-y-3">
              {tipPretoka === "CUVEE" && mijesanjeRazlicitihSorti && (
                <div className="border border-orange-300 bg-white px-4 py-3 text-[13px] font-semibold text-orange-800">
                  Upozorenje: miješaju se različite sorte vina.
                </div>
              )}

              {tipPretoka === "BLEND_ISTE_SORTE" && sorteIzvora.length > 1 && (
                <div className="border border-orange-300 bg-white px-4 py-3 text-[13px] font-semibold text-orange-800">
                  Napomena: u blend iste sorte uključene su i druge sorte. Provjeri
                  željeni naziv i sastav vina.
                </div>
              )}

              <div className="grid gap-2 border border-orange-200 bg-white p-4 text-[14px] text-stone-700">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Tip pretoka</span>
                  <strong>
                    {tipPretoka === "OBICNI"
                      ? "Obični pretok"
                      : tipPretoka === "CUVEE"
                      ? "Novo vino – cuvée"
                      : "Novo vino – ista sorta"}
                  </strong>
                </div>

                {trebaNovoVino && (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-stone-500">Naziv novog vina</span>
                      <strong>{nazivNovogVina || "-"}</strong>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-stone-500">Sorta novog vina</span>
                      <strong>{sortaNovogVina || "-"}</strong>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Ciljni tank</span>
                  <span>
                    Tank {ciljTank.broj} — {nazivTankaKratko(ciljTank)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Trenutno u ciljnom tanku</span>
                  <span>{formatL(Number(ciljTank.kolicinaVinaUTanku ?? 0))} L</span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Kapacitet ciljnog tanka</span>
                  <span>{formatL(Number(ciljTank.kapacitet ?? 0))} L</span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Slobodno mjesta</span>
                  <span>{formatL(slobodnoUCilju)} L</span>
                </div>
              </div>

              {odabraniIzvori.length > 0 ? (
                <div className="space-y-3">
                  {odabraniIzvori.map((r) => {
                    const stanje = Number(r.tank?.kolicinaVinaUTanku ?? 0);
                    const ostaje = stanje - r.kolicina;

                    return (
                      <div
                        key={r.index}
                        className="grid gap-2 border border-orange-200 bg-white p-4 text-[13px] text-stone-700"
                      >
                        <div>
                          <strong>Izvor:</strong> Tank {r.tank?.broj} —{" "}
                          {nazivTankaKratko(r.tank)}
                        </div>
                        <div>Dostupno: {formatL(stanje)} L</div>
                        <div>Pretok: {formatL(r.kolicina)} L</div>
                        <div>Ostaje: {formatL(ostaje)} L</div>

                        {trebaNovoVino && ostaje <= 0 && (
                          <div className="font-semibold text-green-700">
                            Ovaj izvor će se arhivirati.
                          </div>
                        )}

                        {trebaNovoVino && ostaje > 0 && (
                          <div className="font-medium text-stone-600">
                            Ovaj izvor ostaje aktivan i linkat će se na tank.
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="grid gap-2 border border-orange-200 bg-white p-4 text-[14px] text-stone-700">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-stone-500">Ukupno za pretok</span>
                      <strong>{formatL(ukupnoPretok)} L</strong>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-stone-500">Novo stanje cilja</span>
                      <strong>{formatL(novoStanjeCilja)} L</strong>
                    </div>

                    {novoStanjeCilja > ciljTank.kapacitet && (
                      <div className="border border-orange-300 bg-orange-50 px-4 py-3 text-[13px] font-semibold text-orange-800">
                        Upozorenje: nakon pretoka ciljni tank prelazi kapacitet.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
                  Dodaj izvorne tankove i količine za pregled.
                </div>
              )}
            </div>
          </div>
        )}

        {poruka && (
          <div className="border border-orange-300 bg-orange-50 px-4 py-3 text-[13px] font-semibold text-orange-800">
            {poruka}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={spremi}
            disabled={loading}
            className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-3 text-[14px] font-semibold text-orange-950 transition hover:brightness-105 disabled:opacity-70"
          >
            {loading ? "Spremam..." : "Spremi pretok"}
          </button>
        </div>
      </div>
    </main>
  );
}