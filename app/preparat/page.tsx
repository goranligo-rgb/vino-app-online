"use client";

import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Unit = {
  id: string;
  naziv: string;
  tip?: string | null;
  faktor?: number | null;
};

type KorekcijaTip =
  | "SLOBODNI_SO2"
  | "SECER"
  | "UKUPNE_KISELINE"
  | "PH"
  | "ALKOHOL";

type StockEntry = {
  id: string;
  kolicina: number;
  datum: string;
  dobavljac?: string | null;
  brojDokumenta?: string | null;
  napomena?: string | null;
  unit?: {
    id: string;
    naziv: string;
  } | null;
  preparation?: {
    id: string;
    naziv: string;
  } | null;
};

type PrometPreparata = {
  id: string;
  tip: "ULAZ" | "IZLAZ";
  datum: string;
  kolicina: number | null;
  jedinicaNaziv?: string | null;
  tankBroj?: number | null;
  nazivVina?: string | null;
  sorta?: string | null;
  dobavljac?: string | null;
  brojDokumenta?: string | null;
  napomena?: string | null;
  opis?: string | null;
};

type Preparat = {
  id: string;
  naziv: string;
  opis?: string | null;
  strucnoIme?: string | null;

  dozaOd: number | null;
  dozaDo: number | null;

  unitId: string | null;
  unit?: Unit | null;

  stanjeNaSkladistu?: number | null;
  minimalnaKolicina?: number | null;
  skladisnaJedinicaId?: string | null;
  skladisnaJedinica?: Unit | null;
  aktivan?: boolean;

  isKorekcijski?: boolean;
  korekcijaTip?: KorekcijaTip | null;
  korekcijaJedinica?: string | null;

  referentnaKolicina?: number | null;
  referentnaKolicinaJedinica?: string | null;
  referentniVolumen?: number | null;
  referentniVolumenJedinica?: string | null;
  povecanjeParametra?: number | null;

  ucinakPoJedinici?: number | null;

  skladisniUlazi?: StockEntry[];
};

function broj(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "";
  return String(v);
}

function fmtBroj(v: number | null | undefined, dec = 2) {
  if (v == null || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dec,
  });
}

function fmtDatum(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString("hr-HR");
}

const jediniceKolicine = ["mg", "g", "dkg", "kg", "ml", "dl", "dcl", "l"];
const jediniceVolumena = ["l", "hl"];
const jediniceParametra = ["mg/l", "g/l", "Oe", "Brix", "pH", "% vol"];

function KarticaBroj({
  naslov,
  vrijednost,
  podnaslov,
  active = false,
  onClick,
}: {
  naslov: string;
  vrijednost: string;
  podnaslov?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-4 py-4 shadow-sm text-left transition ${
        active
          ? "border-emerald-400 bg-gradient-to-b from-emerald-100 to-lime-50"
          : "border-emerald-200 bg-gradient-to-b from-white to-emerald-50 hover:brightness-[1.02]"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
        {naslov}
      </div>
      <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">
        {vrijednost}
      </div>
      {podnaslov ? (
        <div className="mt-2 text-[12px] text-stone-500">{podnaslov}</div>
      ) : null}
    </button>
  );
}

export default function PreparatPage() {
  const [preparati, setPreparati] = useState<Preparat[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");

  const [pretraga, setPretraga] = useState("");
  const [brzaTrazi, setBrzaTrazi] = useState("");
  const [samoIspodMinimuma, setSamoIspodMinimuma] = useState(false);
  const [kolicineZaKupiti, setKolicineZaKupiti] = useState<
    Record<string, string>
  >({});

  const [novi, setNovi] = useState({
    naziv: "",
    opis: "",
    strucnoIme: "",
    dozaOd: "",
    dozaDo: "",
    unitId: "",
    stanjeNaSkladistu: "",
    minimalnaKolicina: "",
    skladisnaJedinicaId: "",
    aktivan: true,

    isKorekcijski: false,
    korekcijaTip: "",
    korekcijaJedinica: "mg/l",
    referentnaKolicina: "",
    referentnaKolicinaJedinica: "g",
    referentniVolumen: "",
    referentniVolumenJedinica: "l",
    povecanjeParametra: "",
  });

  const [ulaz, setUlaz] = useState({
    naziv: "",
    preparationId: "",
    kolicina: "",
    unitId: "",
    dobavljac: "",
    brojDokumenta: "",
    napomena: "",
  });

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [zadnjiUlazi, setZadnjiUlazi] = useState<StockEntry[]>([]);

  const [otvorenPrometId, setOtvorenPrometId] = useState<string | null>(null);
  const [prometLoading, setPrometLoading] = useState(false);
  const [prometMap, setPrometMap] = useState<Record<string, PrometPreparata[]>>(
    {}
  );

  const nazivRef = useRef<HTMLInputElement | null>(null);
  const dozaOdRef = useRef<HTMLInputElement | null>(null);
  const dozaDoRef = useRef<HTMLInputElement | null>(null);
  const unitRef = useRef<HTMLSelectElement | null>(null);
  const korekcijskiRef = useRef<HTMLInputElement | null>(null);
  const korekcijaTipRef = useRef<HTMLSelectElement | null>(null);
  const korekcijaJedinicaRef = useRef<HTMLSelectElement | null>(null);
  const refKolicinaRef = useRef<HTMLInputElement | null>(null);
  const refKolicinaJedRef = useRef<HTMLSelectElement | null>(null);
  const refVolumenRef = useRef<HTMLInputElement | null>(null);
  const refVolumenJedRef = useRef<HTMLSelectElement | null>(null);
  const povecanjeRef = useRef<HTMLInputElement | null>(null);
  const dodajRef = useRef<HTMLButtonElement | null>(null);

  const ulazNazivRef = useRef<HTMLInputElement | null>(null);
  const ulazKolicinaRef = useRef<HTMLInputElement | null>(null);
  const ulazDobavljacRef = useRef<HTMLInputElement | null>(null);
  const ulazDokumentRef = useRef<HTMLInputElement | null>(null);
  const ulazNapomenaRef = useRef<HTMLInputElement | null>(null);

  function fokusirajSljedece(
    e: React.KeyboardEvent,
    next?: HTMLElement | null
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    next?.focus();
  }

  async function ucitajPreparati() {
    try {
      const res = await fetch("/api/preparat", { cache: "no-store" });
      const data = await res.json();
      setPreparati(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setPreparati([]);
    }
  }

  async function ucitajZadnjeUlaze() {
    try {
      const res = await fetch("/api/preparat/ulaz", { cache: "no-store" });
      const data = await res.json();
      setZadnjiUlazi(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setZadnjiUlazi([]);
    }
  }

  async function ucitajUnits() {
    try {
      const res = await fetch("/api/unit", { cache: "no-store" });
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        setUnits(data);
        return;
      }

      const seedRes = await fetch("/api/unit/seed", {
        method: "POST",
        cache: "no-store",
      });

      const seedData = await seedRes.json();
      setUnits(Array.isArray(seedData?.units) ? seedData.units : []);
    } catch (err) {
      console.error(err);
      setUnits([]);
    }
  }

  async function ucitajPrometPreparata(preparatId: string) {
    try {
      setPrometLoading(true);

      const res = await fetch(
        `/api/preparat/promet?preparationId=${encodeURIComponent(preparatId)}`,
        {
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška kod dohvaćanja prometa preparata.");
        return;
      }

      setPrometMap((prev) => ({
        ...prev,
        [preparatId]: Array.isArray(data) ? data : [],
      }));
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod dohvaćanja prometa preparata.");
    } finally {
      setPrometLoading(false);
    }
  }

  async function togglePromet(preparatId: string) {
    if (otvorenPrometId === preparatId) {
      setOtvorenPrometId(null);
      return;
    }

    setOtvorenPrometId(preparatId);

    if (!prometMap[preparatId]) {
      await ucitajPrometPreparata(preparatId);
    }
  }

  useEffect(() => {
    void ucitajPreparati();
    void ucitajUnits();
    void ucitajZadnjeUlaze();
  }, []);

  const formulaPreview = useMemo(() => {
    if (!novi.isKorekcijski) return "";

    const povecanje =
      novi.povecanjeParametra === "" ? null : Number(novi.povecanjeParametra);
    const kolicina =
      novi.referentnaKolicina === "" ? null : Number(novi.referentnaKolicina);
    const volumen =
      novi.referentniVolumen === "" ? null : Number(novi.referentniVolumen);

    if (
      povecanje == null ||
      kolicina == null ||
      volumen == null ||
      Number.isNaN(povecanje) ||
      Number.isNaN(kolicina) ||
      Number.isNaN(volumen) ||
      povecanje <= 0 ||
      kolicina <= 0 ||
      volumen <= 0
    ) {
      return "";
    }

    return `${kolicina} ${novi.referentnaKolicinaJedinica} na ${novi.referentniVolumen} ${novi.referentniVolumenJedinica} diže ${novi.korekcijaTip || "parametar"} za ${povecanje} ${novi.korekcijaJedinica}`;
  }, [novi]);

  const prijedloziPreparataZaUlaz = useMemo(() => {
    const q = ulaz.naziv.trim().toLowerCase();
    if (!q) return [];
    return preparati
      .filter((p) => p.naziv.toLowerCase().includes(q))
      .slice(0, 8);
  }, [ulaz.naziv, preparati]);

  const odabraniPreparatZaUlaz = useMemo(() => {
    return preparati.find((p) => p.id === ulaz.preparationId) ?? null;
  }, [preparati, ulaz.preparationId]);

  async function dodaj() {
    if (!novi.naziv.trim()) {
      setPoruka("Naziv preparata je obavezan.");
      return;
    }

    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch("/api/preparat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          naziv: novi.naziv.trim(),
          opis: novi.opis.trim() || null,
          strucnoIme: novi.strucnoIme.trim() || null,
          dozaOd: novi.dozaOd === "" ? null : Number(novi.dozaOd),
          dozaDo: novi.dozaDo === "" ? null : Number(novi.dozaDo),
          unitId: novi.unitId || null,
          stanjeNaSkladistu:
            novi.stanjeNaSkladistu === ""
              ? 0
              : Number(novi.stanjeNaSkladistu),
          minimalnaKolicina:
            novi.minimalnaKolicina === ""
              ? 0
              : Number(novi.minimalnaKolicina),
          skladisnaJedinicaId: novi.skladisnaJedinicaId || null,
          aktivan: novi.aktivan,

          isKorekcijski: novi.isKorekcijski,
          korekcijaTip: novi.isKorekcijski ? novi.korekcijaTip || null : null,
          korekcijaJedinica: novi.isKorekcijski
            ? novi.korekcijaJedinica || null
            : null,
          referentnaKolicina:
            novi.isKorekcijski && novi.referentnaKolicina !== ""
              ? Number(novi.referentnaKolicina)
              : null,
          referentnaKolicinaJedinica: novi.isKorekcijski
            ? novi.referentnaKolicinaJedinica || null
            : null,
          referentniVolumen:
            novi.isKorekcijski && novi.referentniVolumen !== ""
              ? Number(novi.referentniVolumen)
              : null,
          referentniVolumenJedinica: novi.isKorekcijski
            ? novi.referentniVolumenJedinica || null
            : null,
          povecanjeParametra:
            novi.isKorekcijski && novi.povecanjeParametra !== ""
              ? Number(novi.povecanjeParametra)
              : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška.");
        return;
      }

      setNovi({
        naziv: "",
        opis: "",
        strucnoIme: "",
        dozaOd: "",
        dozaDo: "",
        unitId: "",
        stanjeNaSkladistu: "",
        minimalnaKolicina: "",
        skladisnaJedinicaId: "",
        aktivan: true,

        isKorekcijski: false,
        korekcijaTip: "",
        korekcijaJedinica: "mg/l",
        referentnaKolicina: "",
        referentnaKolicinaJedinica: "g",
        referentniVolumen: "",
        referentniVolumenJedinica: "l",
        povecanjeParametra: "",
      });

      setPoruka("Preparat dodan.");
      await ucitajPreparati();
      await ucitajUnits();
      nazivRef.current?.focus();
    } catch {
      setPoruka("Greška.");
    } finally {
      setLoading(false);
    }
  }

  async function dodajUlaz() {
    try {
      setPoruka("");

      if (!ulaz.preparationId) {
        setPoruka("Odaberi postojeći preparat iz prijedloga.");
        return;
      }

      if (!ulaz.kolicina || Number.isNaN(Number(ulaz.kolicina))) {
        setPoruka("Upiši količinu ulaza.");
        return;
      }

      const unitId =
        ulaz.unitId || odabraniPreparatZaUlaz?.skladisnaJedinicaId || "";

      if (!unitId) {
        setPoruka("Preparat nema skladišnu jedinicu.");
        return;
      }

      setLoading(true);

      const res = await fetch("/api/preparat/ulaz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preparationId: ulaz.preparationId,
          kolicina: Number(ulaz.kolicina),
          unitId,
          dobavljac: ulaz.dobavljac.trim() || null,
          brojDokumenta: ulaz.brojDokumenta.trim() || null,
          napomena: ulaz.napomena.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška kod unosa ulaza.");
        return;
      }

      setUlaz({
        naziv: "",
        preparationId: "",
        kolicina: "",
        unitId: "",
        dobavljac: ulaz.dobavljac,
        brojDokumenta: "",
        napomena: "",
      });
      setShowSuggestions(false);

      setPoruka("Ulaz preparata je upisan i pribrojen skladištu.");
      await ucitajPreparati();
      await ucitajZadnjeUlaze();

      ulazNazivRef.current?.focus();
    } catch (err) {
      console.error(err);
      setPoruka("Greška kod unosa ulaza.");
    } finally {
      setLoading(false);
    }
  }

  async function spremi(p: Preparat) {
    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch("/api/preparat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          naziv: p.naziv,
          opis: p.opis ?? null,
          strucnoIme: p.strucnoIme ?? null,
          dozaOd: p.dozaOd,
          dozaDo: p.dozaDo,
          unitId: p.unitId ?? null,
          stanjeNaSkladistu: p.stanjeNaSkladistu ?? 0,
          minimalnaKolicina: p.minimalnaKolicina ?? 0,
          skladisnaJedinicaId: p.skladisnaJedinicaId ?? null,
          aktivan: p.aktivan ?? true,

          isKorekcijski: p.isKorekcijski ?? false,
          korekcijaTip: p.isKorekcijski ? p.korekcijaTip ?? null : null,
          korekcijaJedinica: p.isKorekcijski
            ? p.korekcijaJedinica ?? null
            : null,
          referentnaKolicina: p.isKorekcijski
            ? p.referentnaKolicina ?? null
            : null,
          referentnaKolicinaJedinica: p.isKorekcijski
            ? p.referentnaKolicinaJedinica ?? null
            : null,
          referentniVolumen: p.isKorekcijski
            ? p.referentniVolumen ?? null
            : null,
          referentniVolumenJedinica: p.isKorekcijski
            ? p.referentniVolumenJedinica ?? null
            : null,
          povecanjeParametra: p.isKorekcijski
            ? p.povecanjeParametra ?? null
            : null,
        }),
      });

      if (res.ok) {
        setPoruka("Spremljeno.");
        await ucitajPreparati();
      } else {
        const data = await res.json().catch(() => null);
        setPoruka(data?.error || "Greška kod spremanja.");
      }
    } catch {
      setPoruka("Greška kod spremanja.");
    } finally {
      setLoading(false);
    }
  }

  async function obrisi(id: string) {
    if (!confirm("Obrisati preparat?")) return;

    try {
      setLoading(true);
      setPoruka("");

      const res = await fetch("/api/preparat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setPoruka(data?.error || "Greška kod brisanja.");
        return;
      }

      setPoruka("Obrisano.");
      await ucitajPreparati();
    } catch {
      setPoruka("Greška kod brisanja.");
    } finally {
      setLoading(false);
    }
  }

  function promijeniPreparat(
    id: string,
    polje: keyof Preparat,
    vrijednost: string | boolean
  ) {
    setPreparati((stari) =>
      stari.map((p) =>
        p.id === id
          ? {
              ...p,
              [polje]:
                polje === "dozaOd" ||
                polje === "dozaDo" ||
                polje === "referentnaKolicina" ||
                polje === "referentniVolumen" ||
                polje === "povecanjeParametra" ||
                polje === "stanjeNaSkladistu" ||
                polje === "minimalnaKolicina"
                  ? vrijednost === ""
                    ? null
                    : Number(vrijednost)
                  : vrijednost,
            }
          : p
      )
    );
  }

  const filtriraniPreparati = useMemo(() => {
    const q = pretraga.trim().toLowerCase();
    const qBrza = brzaTrazi.trim().toLowerCase();

    return preparati.filter((p) => {
      const ispodMinimuma =
        Number(p.stanjeNaSkladistu ?? 0) <= Number(p.minimalnaKolicina ?? 0);

      if (samoIspodMinimuma && !ispodMinimuma) return false;

      const nazivUnit = p.unit?.naziv ?? "";
      const nazivStockUnit = p.skladisnaJedinica?.naziv ?? "";
      const tekst =
        `${p.naziv} ${nazivUnit} ${nazivStockUnit} ${p.korekcijaTip ?? ""} ${p.korekcijaJedinica ?? ""}`.toLowerCase();

      if (qBrza && !tekst.includes(qBrza)) return false;
      if (q && !tekst.includes(q)) return false;

      return true;
    });
  }, [preparati, pretraga, brzaTrazi, samoIspodMinimuma]);

  const preparatiIspodMinimuma = useMemo(() => {
    return preparati.filter(
      (p) =>
        Number(p.stanjeNaSkladistu ?? 0) <= Number(p.minimalnaKolicina ?? 0)
    );
  }, [preparati]);

  const brojKorekcijskih = preparati.filter((p) => p.isKorekcijski).length;
  const brojStandardnih = preparati.length - brojKorekcijskih;
  const brojIspodMinimuma = preparatiIspodMinimuma.length;

  function promijeniKolicinuZaKupiti(id: string, value: string) {
    setKolicineZaKupiti((prev) => ({
      ...prev,
      [id]: value,
    }));
  }

  function generirajTxtZaKupnju() {
    const redovi = preparatiIspodMinimuma.map((p) => {
      const kolicinaZaKupiti =
        kolicineZaKupiti[p.id] ||
        String(
          Math.max(
            Number(p.minimalnaKolicina ?? 0) - Number(p.stanjeNaSkladistu ?? 0),
            0
          )
        );

      return [
        `Preparat: ${p.naziv}`,
        `Stanje: ${fmtBroj(p.stanjeNaSkladistu)} ${p.skladisnaJedinica?.naziv ?? ""}`,
        `Minimum: ${fmtBroj(p.minimalnaKolicina)} ${p.skladisnaJedinica?.naziv ?? ""}`,
        `Za kupiti: ${kolicinaZaKupiti} ${p.skladisnaJedinica?.naziv ?? ""}`,
        "",
      ].join("\n");
    });

    const sadrzaj =
      "POPIS PREPARATA ISPOD MINIMUMA\n\n" +
      (redovi.length > 0 ? redovi.join("\n") : "Nema stavki.");

    const blob = new Blob([sadrzaj], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "preparati-ispod-minimuma.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function printajPopisKupnje() {
    const redovi = preparatiIspodMinimuma
      .map((p) => {
        const kolicinaZaKupiti =
          kolicineZaKupiti[p.id] ||
          String(
            Math.max(
              Number(p.minimalnaKolicina ?? 0) -
                Number(p.stanjeNaSkladistu ?? 0),
              0
            )
          );

        return `
          <tr>
            <td style="border:1px solid #ccc;padding:8px;">${p.naziv}</td>
            <td style="border:1px solid #ccc;padding:8px;">${fmtBroj(
              p.stanjeNaSkladistu
            )} ${p.skladisnaJedinica?.naziv ?? ""}</td>
            <td style="border:1px solid #ccc;padding:8px;">${fmtBroj(
              p.minimalnaKolicina
            )} ${p.skladisnaJedinica?.naziv ?? ""}</td>
            <td style="border:1px solid #ccc;padding:8px;">${kolicinaZaKupiti} ${
          p.skladisnaJedinica?.naziv ?? ""
        }</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <title>Preparati ispod minimuma</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Preparati ispod minimuma</h2>
          <table style="border-collapse: collapse; width: 100%; margin-top: 16px;">
            <thead>
              <tr>
                <th style="border:1px solid #ccc;padding:8px;text-align:left;">Preparat</th>
                <th style="border:1px solid #ccc;padding:8px;text-align:left;">Stanje</th>
                <th style="border:1px solid #ccc;padding:8px;text-align:left;">Minimum</th>
                <th style="border:1px solid #ccc;padding:8px;text-align:left;">Za kupiti</th>
              </tr>
            </thead>
            <tbody>
              ${redovi || `<tr><td colspan="4" style="border:1px solid #ccc;padding:8px;">Nema stavki.</td></tr>`}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const prozor = window.open("", "_blank", "width=1000,height=700");
    if (!prozor) return;
    prozor.document.open();
    prozor.document.write(html);
    prozor.document.close();
    prozor.focus();
    setTimeout(() => {
      prozor.print();
    }, 300);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-emerald-50/35 to-stone-200">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <NatragHome />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-stone-800">
                Preparati
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                Uređivanje baze enoloških preparata, preporučenih doza i stanja
                skladišta.
              </p>
            </div>
  
            <Link
              href="/statistika/preparati"
              title="Pregled statistike potrošnje preparata"
              className="inline-flex h-11 items-center justify-center border border-emerald-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-emerald-50"
            >
              📊 Statistika
            </Link>
          </div>

         <div className="grid gap-3 sm:grid-cols-4">
            <KarticaBroj
              naslov="Ukupno"
              vrijednost={String(preparati.length)}
              active={!samoIspodMinimuma}
              onClick={() => setSamoIspodMinimuma(false)}
            />
            <KarticaBroj
              naslov="Standardni"
              vrijednost={String(brojStandardnih)}
            />
            <KarticaBroj
              naslov="Korekcijski"
              vrijednost={String(brojKorekcijskih)}
            />
            <KarticaBroj
              naslov="Ispod minimuma"
              vrijednost={String(brojIspodMinimuma)}
              active={samoIspodMinimuma}
              onClick={() => setSamoIspodMinimuma((s) => !s)}
              podnaslov="Klik za filter"
            />
          </div>
        </div>

        {poruka && (
          <div className="border border-emerald-200 bg-white/85 px-4 py-3 text-sm text-stone-700 shadow-sm">
            {poruka}
          </div>
        )}

        <div className="border border-emerald-200/80 bg-white/90 p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[320px_1fr] md:items-end">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Pronađi preparat
              </label>
              <input
                value={brzaTrazi}
                onChange={(e) => setBrzaTrazi(e.target.value)}
                placeholder="Upiši naziv preparata..."
                className="h-11 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
              />
            </div>

            <div className="text-sm text-stone-500">
              {brzaTrazi.trim()
                ? `Prikazano: ${filtriraniPreparati.length} preparata`
                : "Brza tražilica odmah pronađe karticu preparata i stanje skladišta."}
            </div>
          </div>
        </div>

        {samoIspodMinimuma && (
          <div className="border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-stone-800">
                  Popis za narudžbu
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  Preparati koji su ispod minimalnog stanja.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={printajPopisKupnje}
                  className="inline-flex h-10 items-center justify-center border border-emerald-300 bg-white px-4 text-sm font-semibold text-stone-800 transition hover:bg-emerald-50"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={generirajTxtZaKupnju}
                  className="inline-flex h-10 items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-4 text-sm font-semibold text-stone-800 transition hover:brightness-105"
                >
                  Spremi TXT
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {preparatiIspodMinimuma.length === 0 ? (
                <div className="border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-stone-500">
                  Trenutno nema preparata ispod minimuma.
                </div>
              ) : (
                preparatiIspodMinimuma.map((p) => {
                  const preporuka = Math.max(
                    Number(p.minimalnaKolicina ?? 0) -
                      Number(p.stanjeNaSkladistu ?? 0),
                    0
                  );

                  return (
                    <div
                      key={`kupnja_${p.id}`}
                      className="grid grid-cols-1 gap-3 border border-amber-200 bg-white p-4 md:grid-cols-12 md:items-center"
                    >
                      <div className="md:col-span-4">
                        <div className="text-sm font-semibold text-stone-800">
                          {p.naziv}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                          {p.skladisnaJedinica?.naziv ?? ""}
                        </div>
                      </div>

                      <div className="md:col-span-2 text-sm text-stone-700">
                        <strong>Stanje:</strong> {fmtBroj(p.stanjeNaSkladistu)}{" "}
                        {p.skladisnaJedinica?.naziv ?? ""}
                      </div>

                      <div className="md:col-span-2 text-sm text-stone-700">
                        <strong>Minimum:</strong> {fmtBroj(p.minimalnaKolicina)}{" "}
                        {p.skladisnaJedinica?.naziv ?? ""}
                      </div>

                      <div className="md:col-span-2 text-sm text-stone-700">
                        <strong>Preporuka:</strong> {fmtBroj(preporuka)}{" "}
                        {p.skladisnaJedinica?.naziv ?? ""}
                      </div>

                      <div className="md:col-span-2">
                        <input
                          value={kolicineZaKupiti[p.id] ?? String(preporuka)}
                          onChange={(e) =>
                            promijeniKolicinuZaKupiti(p.id, e.target.value)
                          }
                          type="number"
                          step="0.01"
                          placeholder="Koliko kupiti"
                          className="h-10 w-full border border-amber-300 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-amber-500"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/40 to-stone-50 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-stone-800">
                  Brzi unos skladišta
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Upiši postojeći preparat, količinu i dobavljača. Enter te vodi
                  dalje i ulaz se odmah pribraja postojećem stanju.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="relative md:col-span-5">
                  <input
                    ref={ulazNazivRef}
                    placeholder="Počni upisivati naziv preparata..."
                    value={ulaz.naziv}
                    onChange={(e) => {
                      setUlaz((s) => ({
                        ...s,
                        naziv: e.target.value,
                        preparationId: "",
                      }));
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) =>
                      fokusirajSljedece(e, ulazKolicinaRef.current)
                    }
                    className="h-11 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                  />

                  {showSuggestions && prijedloziPreparataZaUlaz.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto border border-emerald-200 bg-white shadow-lg">
                      {prijedloziPreparataZaUlaz.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setUlaz((s) => ({
                              ...s,
                              naziv: p.naziv,
                              preparationId: p.id,
                              unitId: p.skladisnaJedinicaId ?? "",
                            }));
                            setShowSuggestions(false);
                            ulazKolicinaRef.current?.focus();
                          }}
                          className="flex w-full flex-col items-start border-b border-stone-100 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                        >
                          <span className="font-medium text-stone-800">
                            {p.naziv}
                          </span>
                          <span className="text-xs text-stone-500">
                            Stanje: {fmtBroj(p.stanjeNaSkladistu)}{" "}
                            {p.skladisnaJedinica?.naziv ?? ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <input
                  ref={ulazKolicinaRef}
                  placeholder="Količina"
                  type="number"
                  step="0.01"
                  value={ulaz.kolicina}
                  onChange={(e) =>
                    setUlaz((s) => ({ ...s, kolicina: e.target.value }))
                  }
                  onKeyDown={(e) =>
                    fokusirajSljedece(e, ulazDobavljacRef.current)
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                />

                <select
                  value={ulaz.unitId}
                  onChange={(e) =>
                    setUlaz((s) => ({ ...s, unitId: e.target.value }))
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                >
                  <option value="">Jedinica</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.naziv}
                    </option>
                  ))}
                </select>

                <input
                  ref={ulazDobavljacRef}
                  placeholder="Dobavljač"
                  value={ulaz.dobavljac}
                  onChange={(e) =>
                    setUlaz((s) => ({ ...s, dobavljac: e.target.value }))
                  }
                  onKeyDown={(e) =>
                    fokusirajSljedece(e, ulazDokumentRef.current)
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                />

                <input
                  ref={ulazDokumentRef}
                  placeholder="Broj otpremnice / dokumenta"
                  value={ulaz.brojDokumenta}
                  onChange={(e) =>
                    setUlaz((s) => ({ ...s, brojDokumenta: e.target.value }))
                  }
                  onKeyDown={(e) =>
                    fokusirajSljedece(e, ulazNapomenaRef.current)
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-4"
                />

                <input
                  ref={ulazNapomenaRef}
                  placeholder="Napomena"
                  value={ulaz.napomena}
                  onChange={(e) =>
                    setUlaz((s) => ({ ...s, napomena: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void dodajUlaz();
                    }
                  }}
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-5"
                />

                <div className="md:col-span-3">
                  <button
                    onClick={dodajUlaz}
                    disabled={loading}
                    className="inline-flex h-11 w-full items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:brightness-105 disabled:opacity-50"
                  >
                    Dodaj ulaz
                  </button>
                </div>
              </div>

              {odabraniPreparatZaUlaz ? (
                <div className="mt-4 border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-stone-700">
                  Odabrani preparat:{" "}
                  <strong>{odabraniPreparatZaUlaz.naziv}</strong> · trenutno
                  stanje{" "}
                  <strong>
                    {fmtBroj(odabraniPreparatZaUlaz.stanjeNaSkladistu)}{" "}
                    {odabraniPreparatZaUlaz.skladisnaJedinica?.naziv ?? ""}
                  </strong>
                </div>
              ) : null}
            </div>

            <div className="border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/40 to-stone-50 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-stone-800">
                  Novi preparat
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Dodaj naziv, preporučeni raspon, jedinicu, stanje skladišta i
                  po potrebi formulu korekcije.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <input
                  ref={nazivRef}
                  placeholder="Naziv preparata"
                  value={novi.naziv}
                  onChange={(e) => setNovi({ ...novi, naziv: e.target.value })}
                  onKeyDown={(e) => fokusirajSljedece(e, dozaOdRef.current)}
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-5"
                />

                <input
                  ref={dozaOdRef}
                  placeholder="Doza od"
                  type="number"
                  step="0.01"
                  value={novi.dozaOd}
                  onChange={(e) => setNovi({ ...novi, dozaOd: e.target.value })}
                  onKeyDown={(e) => fokusirajSljedece(e, dozaDoRef.current)}
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                />

                <input
                  ref={dozaDoRef}
                  placeholder="Doza do"
                  type="number"
                  step="0.01"
                  value={novi.dozaDo}
                  onChange={(e) => setNovi({ ...novi, dozaDo: e.target.value })}
                  onKeyDown={(e) => fokusirajSljedece(e, unitRef.current)}
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                />

                <select
                  ref={unitRef}
                  value={novi.unitId}
                  onChange={(e) => setNovi({ ...novi, unitId: e.target.value })}
                  onKeyDown={(e) =>
                    fokusirajSljedece(e, korekcijskiRef.current)
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                >
                  <option value="">Jedinica doze</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.naziv}
                    </option>
                  ))}
                </select>

                <input
                  placeholder="Stanje na skladištu"
                  type="number"
                  step="0.01"
                  value={novi.stanjeNaSkladistu}
                  onChange={(e) =>
                    setNovi({ ...novi, stanjeNaSkladistu: e.target.value })
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                />

                <input
                  placeholder="Minimalna količina"
                  type="number"
                  step="0.01"
                  value={novi.minimalnaKolicina}
                  onChange={(e) =>
                    setNovi({ ...novi, minimalnaKolicina: e.target.value })
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                />

                <select
                  value={novi.skladisnaJedinicaId}
                  onChange={(e) =>
                    setNovi({ ...novi, skladisnaJedinicaId: e.target.value })
                  }
                  className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                >
                  <option value="">Skladišna jedinica</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.naziv}
                    </option>
                  ))}
                </select>

                <div className="md:col-span-12 flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                    <input
                      type="checkbox"
                      checked={novi.aktivan}
                      onChange={(e) =>
                        setNovi({ ...novi, aktivan: e.target.checked })
                      }
                    />
                    Aktivan preparat
                  </label>

                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                    <input
                      ref={korekcijskiRef}
                      type="checkbox"
                      checked={novi.isKorekcijski}
                      onChange={(e) =>
                        setNovi({
                          ...novi,
                          isKorekcijski: e.target.checked,
                        })
                      }
                      onKeyDown={(e) =>
                        fokusirajSljedece(
                          e,
                          novi.isKorekcijski
                            ? korekcijaTipRef.current
                            : dodajRef.current
                        )
                      }
                    />
                    Korekcijski preparat
                  </label>
                </div>

                {novi.isKorekcijski && (
                  <>
                    <select
                      ref={korekcijaTipRef}
                      value={novi.korekcijaTip}
                      onChange={(e) =>
                        setNovi({ ...novi, korekcijaTip: e.target.value })
                      }
                      onKeyDown={(e) =>
                        fokusirajSljedece(e, korekcijaJedinicaRef.current)
                      }
                      className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                    >
                      <option value="">Što korigira</option>
                      <option value="SLOBODNI_SO2">Slobodni SO2</option>
                      <option value="SECER">Šećer</option>
                      <option value="UKUPNE_KISELINE">Ukupne kiseline</option>
                      <option value="PH">pH</option>
                      <option value="ALKOHOL">Alkohol</option>
                    </select>

                    <select
                      ref={korekcijaJedinicaRef}
                      value={novi.korekcijaJedinica}
                      onChange={(e) =>
                        setNovi({
                          ...novi,
                          korekcijaJedinica: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        fokusirajSljedece(e, refKolicinaRef.current)
                      }
                      className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-3"
                    >
                      {jediniceParametra.map((j) => (
                        <option key={j} value={j}>
                          {j}
                        </option>
                      ))}
                    </select>

                    <input
                      ref={refKolicinaRef}
                      placeholder="Referentna količina"
                      type="number"
                      step="0.01"
                      value={novi.referentnaKolicina}
                      onChange={(e) =>
                        setNovi({
                          ...novi,
                          referentnaKolicina: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        fokusirajSljedece(e, refKolicinaJedRef.current)
                      }
                      className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                    />

                    <select
                      ref={refKolicinaJedRef}
                      value={novi.referentnaKolicinaJedinica}
                      onChange={(e) =>
                        setNovi({
                          ...novi,
                          referentnaKolicinaJedinica: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        fokusirajSljedece(e, refVolumenRef.current)
                      }
                      className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                    >
                      {jediniceKolicine.map((j) => (
                        <option key={j} value={j}>
                          {j}
                        </option>
                      ))}
                    </select>

                    <input
                      ref={refVolumenRef}
                      placeholder="Referentni volumen"
                      type="number"
                      step="0.01"
                      value={novi.referentniVolumen}
                      onChange={(e) =>
                        setNovi({
                          ...novi,
                          referentniVolumen: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        fokusirajSljedece(e, refVolumenJedRef.current)
                      }
                      className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                    />

                    <select
                      ref={refVolumenJedRef}
                      value={novi.referentniVolumenJedinica}
                      onChange={(e) =>
                        setNovi({
                          ...novi,
                          referentniVolumenJedinica: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        fokusirajSljedece(e, povecanjeRef.current)
                      }
                      className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                    >
                      {jediniceVolumena.map((j) => (
                        <option key={j} value={j}>
                          {j}
                        </option>
                      ))}
                    </select>

                    <input
                      ref={povecanjeRef}
                      placeholder="Povećanje parametra"
                      type="number"
                      step="0.01"
                      value={novi.povecanjeParametra}
                      onChange={(e) =>
                        setNovi({
                          ...novi,
                          povecanjeParametra: e.target.value,
                        })
                      }
                      onKeyDown={(e) => fokusirajSljedece(e, dodajRef.current)}
                      className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400 md:col-span-2"
                    />

                    {formulaPreview ? (
                      <div className="md:col-span-12 border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
                        Formula: {formulaPreview}
                      </div>
                    ) : null}
                  </>
                )}

                <div className="md:col-span-1">
                  <button
                    ref={dodajRef}
                    onClick={dodaj}
                    disabled={loading}
                    className="inline-flex h-11 w-full items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:brightness-105 disabled:opacity-50"
                  >
                    Dodaj
                  </button>
                </div>
              </div>
            </div>

            <div className="border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/35 to-stone-50 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-stone-800">
                    Pregled preparata
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Pretraži i uređuj postojeće preparate.
                  </p>
                </div>

                <input
                  value={pretraga}
                  onChange={(e) => setPretraga(e.target.value)}
                  placeholder="Dodatna pretraga..."
                  className="h-11 min-w-[220px] border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                />
              </div>

              <div className="space-y-3">
                {filtriraniPreparati.map((p) => {
                  const ispodMinimuma =
                    Number(p.stanjeNaSkladistu ?? 0) <=
                    Number(p.minimalnaKolicina ?? 0);

                  const promet = prometMap[p.id] ?? [];
                  const otvoren = otvorenPrometId === p.id;

                  return (
                    <div
                      key={p.id}
                      className="border border-emerald-200 bg-white/85 p-4 shadow-sm transition hover:bg-white"
                    >
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                        <div className="md:col-span-4">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Naziv
                          </label>
                          <input
                            value={p.naziv}
                            onChange={(e) =>
                              promijeniPreparat(p.id, "naziv", e.target.value)
                            }
                            className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Doza od
                          </label>
                          <input
                            value={broj(p.dozaOd)}
                            onChange={(e) =>
                              promijeniPreparat(p.id, "dozaOd", e.target.value)
                            }
                            type="number"
                            step="0.01"
                            className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Doza do
                          </label>
                          <input
                            value={broj(p.dozaDo)}
                            onChange={(e) =>
                              promijeniPreparat(p.id, "dozaDo", e.target.value)
                            }
                            type="number"
                            step="0.01"
                            className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Jedinica doze
                          </label>
                          <select
                            value={p.unitId ?? ""}
                            onChange={(e) =>
                              promijeniPreparat(p.id, "unitId", e.target.value)
                            }
                            className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                          >
                            <option value="">Jedinica</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.naziv}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Stanje skladišta
                          </label>
                          <input
                            value={broj(p.stanjeNaSkladistu)}
                            onChange={(e) =>
                              promijeniPreparat(
                                p.id,
                                "stanjeNaSkladistu",
                                e.target.value
                              )
                            }
                            type="number"
                            step="0.01"
                            className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Minimalno
                          </label>
                          <input
                            value={broj(p.minimalnaKolicina)}
                            onChange={(e) =>
                              promijeniPreparat(
                                p.id,
                                "minimalnaKolicina",
                                e.target.value
                              )
                            }
                            type="number"
                            step="0.01"
                            className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Skladišna jedinica
                          </label>
                          <select
                            value={p.skladisnaJedinicaId ?? ""}
                            onChange={(e) =>
                              promijeniPreparat(
                                p.id,
                                "skladisnaJedinicaId",
                                e.target.value
                              )
                            }
                            className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                          >
                            <option value="">Jedinica</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.naziv}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Status
                          </label>
                          <label className="flex h-10 items-center gap-2 border border-emerald-200 bg-white px-3 text-sm text-stone-700">
                            <input
                              type="checkbox"
                              checked={p.aktivan !== false}
                              onChange={(e) =>
                                promijeniPreparat(p.id, "aktivan", e.target.checked)
                              }
                            />
                            Aktivan
                          </label>
                        </div>

                        <div className="md:col-span-12 md:flex md:justify-end">
                          <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                            <button
                              type="button"
                              onClick={() => togglePromet(p.id)}
                              className="inline-flex h-10 items-center justify-center border border-blue-300 bg-blue-50 px-3 text-xs font-semibold text-blue-800 transition hover:bg-blue-100"
                            >
                              {otvoren ? "Sakrij promet" : "Prikaži promet"}
                            </button>

                            <button
                              onClick={() => spremi(p)}
                              disabled={loading}
                              className="inline-flex h-10 items-center justify-center border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-3 text-xs font-semibold text-stone-800 transition hover:brightness-105 disabled:opacity-50"
                            >
                              Spremi
                            </button>

                            <button
                              onClick={() => obrisi(p.id)}
                              disabled={loading}
                              className="inline-flex h-10 items-center justify-center border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                            >
                              Obriši
                            </button>
                          </div>
                        </div>
                      </div>

                      {otvoren && (
                        <div className="mt-4 border border-blue-200 bg-blue-50/50 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-stone-800">
                                Kratki promet preparata
                              </div>
                              <div className="text-xs text-stone-500">
                                Ulazi i izlazi po zadacima / skladištu
                              </div>
                            </div>

                            {prometLoading && otvorenPrometId === p.id ? (
                              <div className="text-xs text-stone-500">
                                Učitavam...
                              </div>
                            ) : null}
                          </div>

                          <div className="grid gap-2">
                            {promet.length === 0 ? (
                              <div className="border border-dashed border-blue-200 bg-white px-4 py-4 text-sm text-stone-500">
                                Nema prometa za prikaz.
                              </div>
                            ) : (
                              promet.map((stavka) => (
                                <div
                                  key={stavka.id}
                                  className="grid gap-1 border border-blue-100 bg-white px-4 py-3"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`inline-flex px-2.5 py-1 text-xs font-semibold ${
                                        stavka.tip === "ULAZ"
                                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border border-amber-200 bg-amber-50 text-amber-700"
                                      }`}
                                    >
                                      {stavka.tip}
                                    </span>

                                    <span className="text-sm font-semibold text-stone-800">
                                      {stavka.kolicina != null
                                        ? `${stavka.tip === "ULAZ" ? "+" : "-"}${fmtBroj(
                                            stavka.kolicina
                                          )} ${stavka.jedinicaNaziv ?? ""}`
                                        : "-"}
                                    </span>
                                  </div>

                                  <div className="text-xs text-stone-500">
                                    {fmtDatum(stavka.datum)}
                                  </div>

                                  {stavka.tip === "IZLAZ" && (
                                    <div className="text-sm text-stone-700">
                                      {stavka.tankBroj != null ? (
                                        <>
                                          Tank {stavka.tankBroj}
                                          {stavka.nazivVina
                                            ? ` — ${stavka.nazivVina}`
                                            : stavka.sorta
                                            ? ` — ${stavka.sorta}`
                                            : ""}
                                        </>
                                      ) : (
                                        stavka.opis ?? "Izlaz preparata"
                                      )}
                                    </div>
                                  )}

                                  {stavka.tip === "ULAZ" && (
                                    <div className="text-sm text-stone-700">
                                      {stavka.dobavljac
                                        ? `Dobavljač: ${stavka.dobavljac}`
                                        : "Ulaz u skladište"}
                                      {stavka.brojDokumenta
                                        ? ` · Dokument: ${stavka.brojDokumenta}`
                                        : ""}
                                    </div>
                                  )}

                                  {stavka.napomena ? (
                                    <div className="text-xs text-stone-500">
                                      {stavka.napomena}
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {p.isKorekcijski && (
                        <div className="mt-4 grid grid-cols-1 gap-3 border border-emerald-200 bg-emerald-50/60 p-4 md:grid-cols-12">
                          <div className="md:col-span-12">
                            <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                              <input
                                type="checkbox"
                                checked={p.isKorekcijski ?? false}
                                onChange={(e) =>
                                  promijeniPreparat(
                                    p.id,
                                    "isKorekcijski",
                                    e.target.checked
                                  )
                                }
                              />
                              Korekcijski preparat
                            </label>
                          </div>

                          <div className="md:col-span-3">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                              Što korigira
                            </label>
                            <select
                              value={p.korekcijaTip ?? ""}
                              onChange={(e) =>
                                promijeniPreparat(
                                  p.id,
                                  "korekcijaTip",
                                  e.target.value
                                )
                              }
                              className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                            >
                              <option value="">Odaberi</option>
                              <option value="SLOBODNI_SO2">Slobodni SO2</option>
                              <option value="SECER">Šećer</option>
                              <option value="UKUPNE_KISELINE">Ukupne kiseline</option>
                              <option value="PH">pH</option>
                              <option value="ALKOHOL">Alkohol</option>
                            </select>
                          </div>

                          <div className="md:col-span-3">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                              Jedinica parametra
                            </label>
                            <select
                              value={p.korekcijaJedinica ?? "mg/l"}
                              onChange={(e) =>
                                promijeniPreparat(
                                  p.id,
                                  "korekcijaJedinica",
                                  e.target.value
                                )
                              }
                              className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                            >
                              {jediniceParametra.map((j) => (
                                <option key={j} value={j}>
                                  {j}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                              Ref. količina
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={broj(p.referentnaKolicina)}
                              onChange={(e) =>
                                promijeniPreparat(
                                  p.id,
                                  "referentnaKolicina",
                                  e.target.value
                                )
                              }
                              className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                              Jed. količine
                            </label>
                            <select
                              value={p.referentnaKolicinaJedinica ?? "g"}
                              onChange={(e) =>
                                promijeniPreparat(
                                  p.id,
                                  "referentnaKolicinaJedinica",
                                  e.target.value
                                )
                              }
                              className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                            >
                              {jediniceKolicine.map((j) => (
                                <option key={j} value={j}>
                                  {j}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                              Ref. volumen
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={broj(p.referentniVolumen)}
                              onChange={(e) =>
                                promijeniPreparat(
                                  p.id,
                                  "referentniVolumen",
                                  e.target.value
                                )
                              }
                              className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                              Jed. volumena
                            </label>
                            <select
                              value={p.referentniVolumenJedinica ?? "l"}
                              onChange={(e) =>
                                promijeniPreparat(
                                  p.id,
                                  "referentniVolumenJedinica",
                                  e.target.value
                                )
                              }
                              className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                            >
                              {jediniceVolumena.map((j) => (
                                <option key={j} value={j}>
                                  {j}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                              Povećanje
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={broj(p.povecanjeParametra)}
                              onChange={(e) =>
                                promijeniPreparat(
                                  p.id,
                                  "povecanjeParametra",
                                  e.target.value
                                )
                              }
                              className="h-10 w-full border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-emerald-400"
                            />
                          </div>
                        </div>
                      )}

                      {!p.isKorekcijski && (
                        <div className="mt-4 border border-dashed border-stone-300 bg-stone-50/70 p-4">
                          <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                            <input
                              type="checkbox"
                              checked={p.isKorekcijski ?? false}
                              onChange={(e) =>
                                promijeniPreparat(
                                  p.id,
                                  "isKorekcijski",
                                  e.target.checked
                                )
                              }
                            />
                            Označi kao korekcijski preparat
                          </label>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {p.unit?.naziv ? (
                          <span className="inline-flex border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600">
                            Jedinica: {p.unit.naziv}
                          </span>
                        ) : null}

                        {p.skladisnaJedinica?.naziv ? (
                          <span className="inline-flex border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                            Skladišna jedinica: {p.skladisnaJedinica.naziv}
                          </span>
                        ) : null}

                        {p.aktivan !== false ? (
                          <span className="inline-flex border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Aktivan
                          </span>
                        ) : (
                          <span className="inline-flex border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                            Neaktivan
                          </span>
                        )}

                        {p.stanjeNaSkladistu != null ? (
                          <span className="inline-flex border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700">
                            Stanje: {p.stanjeNaSkladistu}{" "}
                            {p.skladisnaJedinica?.naziv ?? ""}
                          </span>
                        ) : null}

                        {p.minimalnaKolicina != null ? (
                          <span className="inline-flex border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700">
                            Minimum: {p.minimalnaKolicina}{" "}
                            {p.skladisnaJedinica?.naziv ?? ""}
                          </span>
                        ) : null}

                        {ispodMinimuma ? (
                          <span className="inline-flex border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                            Ispod minimalnog stanja
                          </span>
                        ) : (
                          <span className="inline-flex border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Dovoljno na skladištu
                          </span>
                        )}

                        {p.isKorekcijski ? (
                          <span className="inline-flex border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Korekcijski preparat
                          </span>
                        ) : null}

                        {p.korekcijaTip ? (
                          <span className="inline-flex border border-lime-200 bg-lime-50 px-2.5 py-1 text-xs font-medium text-lime-700">
                            Tip: {p.korekcijaTip}
                          </span>
                        ) : null}

                        {p.korekcijaJedinica ? (
                          <span className="inline-flex border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
                            Parametar: {p.korekcijaJedinica}
                          </span>
                        ) : null}

                        {p.referentnaKolicina != null ? (
                          <span className="inline-flex border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700">
                            Ref. količina: {p.referentnaKolicina}{" "}
                            {p.referentnaKolicinaJedinica ?? ""}
                          </span>
                        ) : null}

                        {p.referentniVolumen != null ? (
                          <span className="inline-flex border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700">
                            Ref. volumen: {p.referentniVolumen}{" "}
                            {p.referentniVolumenJedinica ?? ""}
                          </span>
                        ) : null}

                        {p.povecanjeParametra != null ? (
                          <span className="inline-flex border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Diže za: {p.povecanjeParametra}{" "}
                            {p.korekcijaJedinica ?? ""}
                          </span>
                        ) : null}

                        {p.ucinakPoJedinici != null ? (
                          <span className="inline-flex border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                            Učinak po jedinici: {p.ucinakPoJedinici}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {filtriraniPreparati.length === 0 && (
                  <div className="border border-dashed border-emerald-300 bg-white/70 px-4 py-10 text-center text-sm text-stone-500">
                    Nema preparata za prikaz.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="border border-emerald-200/80 bg-white/90 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
            <h2 className="text-base font-semibold text-stone-800">
              Zadnji ulazi
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Zadnji upisani ulazi preparata sa dobavljačem i dokumentom.
            </p>

            <div className="mt-4 space-y-3">
              {zadnjiUlazi.length === 0 ? (
                <div className="border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-6 text-sm text-stone-500">
                  Još nema upisanih ulaza.
                </div>
              ) : (
                zadnjiUlazi.map((u) => (
                  <div
                    key={u.id}
                    className="border border-emerald-100 bg-emerald-50/30 px-4 py-3"
                  >
                    <div className="text-sm font-semibold text-stone-800">
                      {u.preparation?.naziv ?? "-"}
                    </div>
                    <div className="mt-1 text-sm text-stone-700">
                      +{fmtBroj(u.kolicina)} {u.unit?.naziv ?? ""}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {fmtDatum(u.datum)}
                    </div>
                    {u.dobavljac ? (
                      <div className="mt-1 text-xs text-stone-600">
                        Dobavljač: {u.dobavljac}
                      </div>
                    ) : null}
                    {u.brojDokumenta ? (
                      <div className="mt-1 text-xs text-stone-600">
                        Dokument: {u.brojDokumenta}
                      </div>
                    ) : null}
                    {u.napomena ? (
                      <div className="mt-1 text-xs text-stone-500">
                        {u.napomena}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}