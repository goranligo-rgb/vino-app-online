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

/** Ciljni red je zrcalo izvornog — isti oblik, druga strana. */
type CiljRed = {
  tankId: string;
  kolicina: string;
};

/**
 * KAKO je pretok izveden. Neovisno o vrsti: cuvée se moze raditi kroz filtar i
 * bez njega.
 */
type Nacin = "BEZ" | "FILTRACIJA" | "FLOTACIJA";

/**
 * Prag iznad kojeg se kalo zuti — VEZAN UZ NACIN, ne konstanta.
 *
 * Talozenje kod korisnika normalno ima 10–15 % kala, pa bi ga jedan prag od 5 %
 * stalno zutio bez razloga. Ako se nacin ikad prosiri, prag se dodaje ovdje, a
 * ne u uvjet nize.
 */
const PRAG_KALA: Record<Nacin, number> = {
  BEZ: 5,
  FILTRACIJA: 5,
  FLOTACIJA: 15,
};

const NACINI: Array<{ id: Nacin; naziv: string }> = [
  { id: "BEZ", naziv: "Bez" },
  { id: "FILTRACIJA", naziv: "Filtracija" },
  { id: "FLOTACIJA", naziv: "Flotacija" },
];

const VRSTE: Array<{ id: TipPretoka; naziv: string }> = [
  { id: "OBICNI", naziv: "Obični" },
  { id: "CUVEE", naziv: "Cuvée" },
  { id: "BLEND_ISTE_SORTE", naziv: "Ista sorta" },
];

type TipPretoka = "OBICNI" | "CUVEE" | "BLEND_ISTE_SORTE";

type ZadnjiPretok = {
  id: string;
  createdAt: string;
  datum?: string;
  tip?: TipPretoka | string | null;
  napomena?: string | null;
  ciljTank?: {
    id: string;
    broj: number;
    sorta?: string | null;
    nazivVina?: string | null;
    tip?: string | null;
  } | null;
  ciljevi?: Array<{
    id: string;
    kolicina: number;
    tank?: {
      id: string;
      broj: number;
      sorta?: string | null;
      nazivVina?: string | null;
      tip?: string | null;
    } | null;
  }>;
  izvori: Array<{
    id: string;
    kolicina: number;
    tank?: {
      id: string;
      broj: number;
      sorta?: string | null;
      nazivVina?: string | null;
      tip?: string | null;
    } | null;
  }>;
};

function formatL(value: number) {
  return value.toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDatumVrijeme(v?: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("hr-HR");
  } catch {
    return v;
  }
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

function nazivTankaKratko(
  t:
    | Tank
    | {
        id?: string;
        broj: number;
        sorta?: string | null;
        nazivVina?: string | null;
        tip?: string | null;
      }
    | null
    | undefined
) {
  if (!t) return "-";
  return t.nazivVina?.trim() || t.sorta?.trim() || t.tip?.trim() || "bez naziva";
}

function nazivTipaPretoka(tip?: string | null) {
  if (tip === "CUVEE") return "Novo vino – cuvée";
  if (tip === "BLEND_ISTE_SORTE") return "Novo vino – ista sorta";
  return "Obični pretok";
}


function Oznaka({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-900">
      {children}
    </span>
  );
}

function ConfirmModal({
  open,
  title,
  description,
  confirmText,
  cancelText = "Odustani",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmText: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[560px] border border-orange-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[24px] font-semibold text-stone-800">{title}</div>

        <div className="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-stone-600">
          {description}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="border border-stone-300 bg-white px-4 py-2 text-[14px] font-semibold text-stone-700 disabled:opacity-60"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[14px] font-semibold text-orange-950 disabled:opacity-60"
          >
            {loading ? "Vraćam..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZadnjiPretociPanel({
  zadnjiPretoci,
  loadingPretoci,
  undoLoadingId,
  onVrati,
}: {
  zadnjiPretoci: ZadnjiPretok[];
  loadingPretoci: boolean;
  undoLoadingId: string | null;
  onVrati: (pretok: ZadnjiPretok) => void;
}) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold text-stone-800">Zadnji pretoci</h2>
        <Oznaka>{zadnjiPretoci.length}</Oznaka>
      </div>

      {loadingPretoci ? (
        <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
          Učitavam pretoke...
        </div>
      ) : zadnjiPretoci.length === 0 ? (
        <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
          Nema pretoka za prikaz.
        </div>
      ) : (
        <div className="space-y-3">
          {zadnjiPretoci.map((p) => {
            const ukupno = p.izvori.reduce(
              (sum, i) => sum + Number(i.kolicina || 0),
              0
            );

            return (
              <div
                key={p.id}
                className="border border-orange-200 bg-white p-4 text-[13px] text-stone-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-semibold text-stone-800">
                      {nazivTipaPretoka(p.tip)}
                    </div>
                    <div className="text-[12px] text-stone-500">
                      {formatDatumVrijeme(p.createdAt || p.datum)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onVrati(p)}
                    disabled={undoLoadingId === p.id}
                    className="border border-orange-300 bg-orange-50 px-3 py-2 text-[12px] font-semibold text-orange-950 hover:bg-orange-100 disabled:opacity-60"
                  >
                    {undoLoadingId === p.id ? "Vraćam..." : "Vrati"}
                  </button>
                </div>

                <div className="mt-3 grid gap-2">
                  <div>
                    <span className="text-stone-500">
                      {(p.ciljevi?.length ?? 0) > 1 ? "Ciljevi: " : "Cilj: "}
                    </span>
                    <strong>
                      {(p.ciljevi?.length ?? 0) > 0
                        ? p.ciljevi!
                            .map(
                              (c) =>
                                `Tank ${c.tank?.broj ?? "-"} — ${nazivTankaKratko(c.tank)}`
                            )
                            .join(" · ")
                        : `Tank ${p.ciljTank?.broj ?? "-"} — ${nazivTankaKratko(
                            p.ciljTank
                          )}`}
                    </strong>
                  </div>

                  <div>
                    <span className="text-stone-500">Ukupno: </span>
                    <strong>{formatL(ukupno)} L</strong>
                  </div>

                  <div>
                    <span className="text-stone-500">Izvori:</span>
                    <div className="mt-1 space-y-1">
                      {p.izvori.map((i) => (
                        <div key={i.id}>
                          Tank {i.tank?.broj ?? "-"} — {nazivTankaKratko(i.tank)} —{" "}
                          {formatL(Number(i.kolicina || 0))} L
                        </div>
                      ))}
                    </div>
                  </div>

                  {p.napomena ? (
                    <div className="border border-orange-100 bg-orange-50/40 px-3 py-2 text-[12px] text-stone-600">
                      {p.napomena}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Cip za izbor. Jedan dodir umjesto dva kao kod padajuceg izbornika — isto kao
 * filtri u kronologiji. Prelama se u vise redova umjesto da se stisne.
 */
function Cip({
  aktivan,
  onClick,
  children,
}: {
  aktivan: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktivan}
      className={`border px-4 py-2 text-[14px] transition ${
        aktivan
          ? "border-orange-500 bg-orange-100 font-semibold text-orange-900"
          : "border-orange-200 bg-white text-stone-600 hover:bg-orange-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function PretokPage() {
  const [tankovi, setTankovi] = useState<Tank[]>([]);
  const [zadnjiPretoci, setZadnjiPretoci] = useState<ZadnjiPretok[]>([]);
  const [tipPretoka, setTipPretoka] = useState<TipPretoka>("OBICNI");
  const [ciljevi, setCiljevi] = useState<CiljRed[]>([
    { tankId: "", kolicina: "" },
  ]);
  const [nacin, setNacin] = useState<Nacin>("BEZ");
  const [nacinNapomena, setNacinNapomena] = useState("");
  const [izvori, setIzvori] = useState<IzvorRed[]>([
    { tankId: "", kolicina: "" },
  ]);
  const [nazivNovogVina, setNazivNovogVina] = useState("");
  const [sortaNovogVina, setSortaNovogVina] = useState("");
  const [napomena, setNapomena] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPretoci, setLoadingPretoci] = useState(false);
  const [poruka, setPoruka] = useState("");
  const [undoLoadingId, setUndoLoadingId] = useState<string | null>(null);
  const [pretokZaUndo, setPretokZaUndo] = useState<ZadnjiPretok | null>(null);

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

  async function ucitajPretoke() {
    try {
      setLoadingPretoci(true);

      const res = await fetch("/api/pretok/list", { cache: "no-store" });
      const data = await res.json();

      const lista = Array.isArray(data)
        ? data
        : Array.isArray(data?.pretoci)
        ? data.pretoci
        : [];

      setZadnjiPretoci(lista);
    } catch (e) {
      console.error(e);
      setZadnjiPretoci([]);
    } finally {
      setLoadingPretoci(false);
    }
  }

  useEffect(() => {
    ucitajPretoke();
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

  function dodajCilj() {
    setCiljevi((prev) => [...prev, { tankId: "", kolicina: "" }]);
  }

  function obrisiCilj(index: number) {
    setCiljevi((prev) => {
      if (prev.length === 1) return [{ tankId: "", kolicina: "" }];
      return prev.filter((_, i) => i !== index);
    });
  }

  function updateCilj(index: number, field: keyof CiljRed, value: string) {
    setCiljevi((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function update(index: number, field: keyof IzvorRed, value: string) {
    setIzvori((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  const odabraniCiljevi = useMemo(() => {
    return ciljevi
      .map((row, index) => {
        const tank = tankovi.find((t) => t.id === row.tankId) ?? null;
        const kolicina = Number(row.kolicina || 0);
        return { index, tankId: row.tankId, tank, kolicina };
      })
      .filter((r) => r.tank && r.kolicina > 0);
  }, [ciljevi, tankovi]);

  /** Prvi odabrani cilj — sluzi predlaganju sorte i pregledu prije spremanja. */
  const prviCiljTank = useMemo(
    () => tankovi.find((t) => t.id === ciljevi[0]?.tankId) ?? null,
    [tankovi, ciljevi]
  );

  const odabraniCiljIds = useMemo(
    () => new Set(ciljevi.map((c) => c.tankId).filter(Boolean)),
    [ciljevi]
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

  const ukupnoUCiljeve = useMemo(() => {
    return odabraniCiljevi.reduce((sum, r) => sum + r.kolicina, 0);
  }, [odabraniCiljevi]);

  /**
   * KALO ispada iz razlike — nikad se ne upisuje. Da se upisuje, forma i server
   * mogli bi tvrditi razlicite brojke.
   */
  const kalo = useMemo(
    () => Number((ukupnoPretok - ukupnoUCiljeve).toFixed(3)),
    [ukupnoPretok, ukupnoUCiljeve]
  );

  const kaloPostotak = useMemo(
    () => (ukupnoPretok > 0 ? (kalo / ukupnoPretok) * 100 : 0),
    [kalo, ukupnoPretok]
  );

  /** Iznad praga se zuti; prag ovisi o nacinu, ne o konstanti. */
  const kaloVisok = kalo > 0 && kaloPostotak > PRAG_KALA[nacin];

  /** Koliko je od izaslog jos nerasporedjeno — sluzi gumbu ostatak. */
  const nerasporedjeno = useMemo(
    () => Number((ukupnoPretok - ukupnoUCiljeve).toFixed(3)),
    [ukupnoPretok, ukupnoUCiljeve]
  );

  const sorteIzvora = Array.from(
    new Set(
      odabraniIzvori
        .map((r) => r.tank?.sorta)
        .filter((s): s is string => Boolean(s))
    )
  );

  const sveSorte = Array.from(
    new Set(
      [prviCiljTank?.sorta, ...odabraniIzvori.map((r) => r.tank?.sorta)].filter(
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
            : prviCiljTank?.sorta || predlozenaSorta || "";
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
  }, [tipPretoka, sorteIzvora, prviCiljTank, predlozenaSorta, sortaNovogVina]);

  async function spremi() {
    setPoruka("");

    const cistiCiljevi = ciljevi
      .map((c) => ({ tankId: c.tankId, kolicina: Number(c.kolicina) }))
      .filter((c) => c.tankId && c.kolicina > 0);

    if (cistiCiljevi.length === 0) {
      setPoruka("Dodaj barem jedan ciljni tank i količinu.");
      return;
    }

    if (new Set(cistiCiljevi.map((c) => c.tankId)).size !== cistiCiljevi.length) {
      setPoruka("Isti ciljni tank ne može biti odabran više puta.");
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

    if (cistiIzvori.some((i) => cistiCiljevi.some((c) => c.tankId === i.tankId))) {
      setPoruka("Isti tank ne može biti i izvor i cilj.");
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

    for (const c of cistiCiljevi) {
      const tank = tankovi.find((t) => t.id === c.tankId);

      if (!tank) {
        setPoruka("Jedan od odabranih ciljnih tankova ne postoji.");
        return;
      }

      const slobodno =
        Number(tank.kapacitet ?? 0) - Number(tank.kolicinaVinaUTanku ?? 0);

      if (c.kolicina > slobodno) {
        setPoruka(
          `U tank ${tank.broj} ne stane ${formatL(c.kolicina)} L — slobodno je ${formatL(
            slobodno
          )} L.`
        );
        return;
      }
    }

    // Negativan kalo znaci da u ciljeve ulazi vise nego sto iz izvora izlazi —
    // vino niotkuda. Server to isto odbija; ovdje se samo kaze ranije i jasnije.
    const izlazUkupno = cistiIzvori.reduce((z, i) => z + i.kolicina, 0);
    const ulazUkupno = cistiCiljevi.reduce((z, c) => z + c.kolicina, 0);

    if (ulazUkupno > izlazUkupno) {
      setPoruka(
        `U ciljeve ulazi ${formatL(ulazUkupno)} L, a iz izvora izlazi samo ${formatL(
          izlazUkupno
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
      "Ciljevi:",
      ...cistiCiljevi.map((c) => {
        const t = tankovi.find((x) => x.id === c.tankId);
        const uTanku = Number(t?.kolicinaVinaUTanku ?? 0);
        return `- Tank ${t?.broj} — ${nazivTankaKratko(t)} — ulazi ${formatL(
          c.kolicina
        )} L, bit će ${formatL(uTanku + c.kolicina)} L`;
      }),
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
      `Izlazi: ${formatL(izlazUkupno)} L`,
      `Ulazi: ${formatL(ulazUkupno)} L`,
      `Kalo: ${formatL(izlazUkupno - ulazUkupno)} L`,
      `Način: ${NACINI.find((n) => n.id === nacin)?.naziv ?? "Bez"}${
        nacinNapomena.trim() ? ` — ${nacinNapomena.trim()}` : ""
      }`,
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
          // Glavni cilj se i dalje salje radi kompatibilnosti; pravi popis je
          // `ciljevi`.
          ciljTankId: cistiCiljevi[0].tankId,
          ciljevi: cistiCiljevi,
          nacin,
          nacinNapomena: nacinNapomena.trim() || null,
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

      await ucitajPretoke();
      alert("Pretok uspješan!");
      location.href = `/tankovi/${cistiCiljevi[0].tankId}`;
    } catch (e) {
      console.error(e);
      setPoruka("Greška kod pretoka.");
    } finally {
      setLoading(false);
    }
  }

  function otvoriUndoPretoka(pretok: ZadnjiPretok) {
    setPretokZaUndo(pretok);
  }

  async function potvrdiUndoPretoka() {
    if (!pretokZaUndo?.id) return;

    setUndoLoadingId(pretokZaUndo.id);
    setPoruka("");

    try {
      const res = await fetch("/api/pretok/undo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pretokId: pretokZaUndo.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Pretok nije moguće vratiti.");
        return;
      }

      setPoruka(data?.message || "Pretok je uspješno vraćen.");
      setPretokZaUndo(null);
      await ucitajPretoke();

      const tankRes = await fetch("/api/tank", { cache: "no-store" });
      const tankData = await tankRes.json();
      setTankovi(Array.isArray(tankData) ? tankData : []);
    } catch (e) {
      console.error(e);
      setPoruka("Greška kod vraćanja pretoka.");
    } finally {
      setUndoLoadingId(null);
    }
  }

  const panelPretoci = (
    <ZadnjiPretociPanel
      zadnjiPretoci={zadnjiPretoci}
      loadingPretoci={loadingPretoci}
      undoLoadingId={undoLoadingId}
      onVrati={otvoriUndoPretoka}
    />
  );

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <ConfirmModal
        open={!!pretokZaUndo}
        title="Vrati pretok"
        description={
          pretokZaUndo
            ? [
                "Jeste li sigurni da želite vratiti ovaj pretok?",
                "",
                `Tip: ${nazivTipaPretoka(pretokZaUndo.tip)}`,
                `Datum: ${formatDatumVrijeme(
                  pretokZaUndo.createdAt || pretokZaUndo.datum
                )}`,
                `Cilj: Tank ${pretokZaUndo.ciljTank?.broj ?? "-"} — ${nazivTankaKratko(
                  pretokZaUndo.ciljTank
                )}`,
                "",
                "Vino će biti vraćeno u prethodne tankove, a stanje ciljnog tanka vratit će se na trenutak prije pretoka.",
                "Ako postoje kasnije radnje na uključenim tankovima, vraćanje neće biti moguće.",
              ].join("\n")
            : ""
        }
        confirmText="Potvrdi vraćanje"
        loading={!!undoLoadingId}
        onConfirm={potvrdiUndoPretoka}
        onCancel={() => {
          if (undoLoadingId) return;
          setPretokZaUndo(null);
        }}
      />

      <NatragHome />

      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
            Pretoci / spajanja
          </h1>
          <div className="mt-1 text-[13px] text-stone-500">
            Odaberi vrstu i način, pa upiši iz kojih tankova vino izlazi i u
            koje ulazi. Kalo ispada iz razlike.
          </div>
        </div>

        {/* TRAKA S KALOM. Na mobitelu je ljepljiva na dnu, jer je to jedini
            broj koji se provjerava dok se tipka. */}
        <div className="sticky bottom-0 z-10 -mx-4 border-y border-orange-200 bg-white/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-none md:border">
          <div className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-1 text-[15px]">
            <span>
              <span className="text-stone-500">Izlazi </span>
              <strong className="text-stone-800">{formatL(ukupnoPretok)} L</strong>
            </span>
            <span className="text-stone-300">·</span>
            <span>
              <span className="text-stone-500">ulazi </span>
              <strong className="text-stone-800">{formatL(ukupnoUCiljeve)} L</strong>
            </span>
            <span className="text-stone-300">·</span>
            <span
              className={
                kalo < 0
                  ? "font-semibold text-red-700"
                  : kaloVisok
                    ? "font-semibold text-amber-800"
                    : "text-stone-700"
              }
            >
              <span className="text-stone-500">kalo </span>
              <strong>{formatL(kalo)} L</strong>
              {ukupnoPretok > 0 && (
                <span className="ml-1 text-[13px]">
                  ({kaloPostotak.toFixed(1).replace(".", ",")} %)
                </span>
              )}
            </span>
          </div>

          {kalo < 0 && (
            <div className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-center text-[13px] font-medium text-red-800">
              U ciljeve ulazi više nego što iz izvora izlazi.
            </div>
          )}

          {kaloVisok && (
            <div className="mt-2 border border-amber-300 bg-amber-50 px-3 py-2 text-center text-[13px] text-amber-900">
              Kalo je iznad {PRAG_KALA[nacin]} % — provjeri brojke. Ovo ne
              sprječava spremanje.
            </div>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
              <div className="grid gap-4">
                <div>
                  <label className="mb-2 block text-[13px] font-semibold text-stone-700">
                    Vrsta
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {VRSTE.map((v) => (
                      <Cip
                        key={v.id}
                        aktivan={tipPretoka === v.id}
                        onClick={() => setTipPretoka(v.id)}
                      >
                        {v.naziv}
                      </Cip>
                    ))}
                  </div>

                  <label className="mt-4 mb-2 block text-[13px] font-semibold text-stone-700">
                    Način
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {NACINI.map((n) => (
                      <Cip
                        key={n.id}
                        aktivan={nacin === n.id}
                        onClick={() => setNacin(n.id)}
                      >
                        {n.naziv}
                      </Cip>
                    ))}
                  </div>

                  {nacin !== "BEZ" && (
                    <input
                      value={nacinNapomena}
                      onChange={(e) => setNacinNapomena(e.target.value)}
                      placeholder={
                        nacin === "FILTRACIJA"
                          ? "npr. kroz pločasti filtar (neobavezno)"
                          : "npr. s bentonitom (neobavezno)"
                      }
                      className="mt-2 w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
                    />
                  )}
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
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="text-[13px] font-semibold text-stone-700">
                      Ciljni tankovi
                    </label>

                    <button
                      type="button"
                      onClick={dodajCilj}
                      className="border border-orange-300 bg-white px-3 py-2 text-[13px] font-medium text-stone-700 hover:bg-orange-50"
                    >
                      + Dodaj cilj
                    </button>
                  </div>

                  <div className="space-y-3">
                    {ciljevi.map((row, i) => {
                      const odabrani =
                        tankovi.find((t) => t.id === row.tankId) ?? null;

                      const uTanku = Number(odabrani?.kolicinaVinaUTanku ?? 0);
                      const kapacitet = Number(odabrani?.kapacitet ?? 0);
                      const slobodno = kapacitet - uTanku;
                      const trazeno = Number(row.kolicina || 0);
                      const nePrima = odabrani != null && trazeno > slobodno;

                      return (
                        <div
                          key={i}
                          className="grid gap-3 border border-orange-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_180px_110px]"
                        >
                          <div className="grid gap-2">
                            <select
                              value={row.tankId}
                              onChange={(e) => updateCilj(i, "tankId", e.target.value)}
                              className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
                            >
                              <option value="">Odaberi ciljni tank</option>
                              {tankovi.map((t) => {
                                const zauzetKaoIzvor = izvori.some(
                                  (r) => r.tankId === t.id
                                );
                                const zauzetKaoCilj = ciljevi.some(
                                  (r, idx) => idx !== i && r.tankId === t.id
                                );

                                return (
                                  <option
                                    key={t.id}
                                    value={t.id}
                                    disabled={zauzetKaoIzvor || zauzetKaoCilj}
                                  >
                                    {opisTanka(t)}
                                  </option>
                                );
                              })}
                            </select>

                            {odabrani && (
                              <div className="text-[13px] text-stone-500">
                                {formatL(uTanku)} / {formatL(kapacitet)} L ·
                                slobodno {formatL(slobodno)} L
                                {odabrani.nazivVina?.trim()
                                  ? ` · ${odabrani.nazivVina.trim()}`
                                  : " · prazan"}
                              </div>
                            )}

                            {nePrima && (
                              <div className="text-[12px] font-medium text-red-700">
                                Ne stane — slobodno je {formatL(slobodno)} L.
                              </div>
                            )}
                          </div>

                          <div className="grid gap-2">
                            <input
                              type="number"
                              step="0.01"
                              inputMode="decimal"
                              placeholder="L"
                              value={row.kolicina}
                              onChange={(e) => updateCilj(i, "kolicina", e.target.value)}
                              className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
                            />

                            {/* "Ostatak" radi i s jednim i s tri cilja: upises
                                prvom, drugom, a zadnji uzme sto je preostalo. */}
                            {odabrani && nerasporedjeno + trazeno > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateCilj(
                                    i,
                                    "kolicina",
                                    String(
                                      Math.min(
                                        Number((nerasporedjeno + trazeno).toFixed(3)),
                                        slobodno
                                      )
                                    )
                                  )
                                }
                                className="border border-orange-200 bg-orange-50 px-2 py-1 text-[12px] text-stone-600 hover:bg-orange-100"
                              >
                                ostatak
                              </button>
                            )}
                          </div>

                          <div className="flex items-start">
                            <button
                              type="button"
                              onClick={() => obrisiCilj(i)}
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
                              odabraniCiljIds.has(t.id) ||
                              kolicina <= 0 ||
                              zauzetUDrugomRedu;

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

            {odabraniCiljevi.length > 0 && (
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
                      Napomena: u blend iste sorte uključene su i druge sorte.
                      Provjeri željeni naziv i sastav vina.
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
                      <span className="text-stone-500">Način</span>
                      <strong>
                        {NACINI.find((n) => n.id === nacin)?.naziv ?? "Bez"}
                        {nacinNapomena.trim() ? ` — ${nacinNapomena.trim()}` : ""}
                      </strong>
                    </div>

                    {odabraniCiljevi.map((c) => {
                      const uTanku = Number(c.tank?.kolicinaVinaUTanku ?? 0);

                      return (
                        <div
                          key={c.tankId}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="text-stone-500">
                            U tank {c.tank?.broj} — {nazivTankaKratko(c.tank)}
                          </span>
                          <span>
                            {formatL(c.kolicina)} L → bit će{" "}
                            {formatL(uTanku + c.kolicina)} L
                          </span>
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between gap-4 border-t border-orange-200 pt-2">
                      <span className="text-stone-500">Izlazi / ulazi / kalo</span>
                      <strong>
                        {formatL(ukupnoPretok)} L / {formatL(ukupnoUCiljeve)} L /{" "}
                        {formatL(kalo)} L
                      </strong>
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
                          <span className="text-stone-500">Ukupno u ciljeve</span>
                          <strong>{formatL(ukupnoUCiljeve)} L</strong>
                        </div>

                        {odabraniCiljevi.some(
                          (c) =>
                            Number(c.tank?.kolicinaVinaUTanku ?? 0) + c.kolicina >
                            Number(c.tank?.kapacitet ?? 0)
                        ) && (
                          <div className="border border-orange-300 bg-orange-50 px-4 py-3 text-[13px] font-semibold text-orange-800">
                            Upozorenje: barem jedan ciljni tank prelazi kapacitet.
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

          <div className="hidden xl:block">{panelPretoci}</div>
        </div>

        <div className="xl:hidden">{panelPretoci}</div>
      </div>
    </main>
  );
}