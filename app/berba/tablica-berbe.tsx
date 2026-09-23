"use client";

/**
 * TABLICA BERBE — jedan redak po zapisu, grupiranje, kvacice, izvoz.
 *
 * Racun je u lib/berba-tablica.ts, isti koji zove izvoz u Excel: stranica
 * ovdje samo crta. Tank namjerno nije stupac — gdje je berba usla i gdje je
 * danas stoji na /berba/[id], kamo vodi sorta.
 *
 * KVACICE: kad je ista oznaceno, podnozje I podzbrojevi grupa racunaju samo
 * oznacene. Oznaka koja ispadne iz prikaza (trazilica, druga godina) ne ulazi
 * u zbroj — zbroj uvijek odgovara onome sto je na ekranu.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { opisMaceracije } from "@/lib/berba-polja";
import { formatHrDate } from "@/lib/datum";
import {
  type Grupiranje,
  type PostavkeTablice,
  type Prosjek,
  type RedakBerbe,
  type Sazetak,
  type Smjer,
  type Stupac,
  danBerbe,
  grupiraj,
  izracunajSazetak,
  prikazDana,
  randmanRetka,
  sortiraj,
  zaZbroj,
} from "@/lib/berba-tablica";

export function formatBroj(v?: number | null, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

const NASLOVI: Record<Stupac, string> = {
  datum: "Datum berbe",
  sorta: "Sorta",
  polozaj: "Položaj",
  kg: "Kg",
  litre: "Litre",
  randman: "Randman L/100 kg",
  secer: "Šećer °Oe",
  kiseline: "Kiseline",
  ph: "pH",
  maceracija: "Maceracija",
  oznaka: "Oznaka berbe",
};

const BROJCANI = new Set<Stupac>(["kg", "litre", "randman", "secer", "kiseline", "ph"]);

const NAZIV_GRUPIRANJA: Record<Grupiranje, string> = {
  nista: "ništa",
  datum: "datum",
  sorta: "sorta",
  polozaj: "položaj",
};

const STUPCI_PRIKAZA: Stupac[] = [
  "datum",
  "sorta",
  "polozaj",
  "kg",
  "litre",
  "randman",
  "secer",
  "kiseline",
  "ph",
  "maceracija",
  "oznaka",
];

export default function TablicaBerbe({
  zapisi,
  tekst,
  setTekst,
  godina,
  zateceno,
}: {
  /** Prikazani zapisi, vec filtrirani po godini, zatecenom i trazilici. */
  zapisi: RedakBerbe[];
  tekst: string;
  setTekst: (t: string) => void;
  godina: string;
  zateceno: boolean;
}) {
  const [po, setPo] = useState<Grupiranje>("nista");
  const [stupac, setStupac] = useState<Stupac>("datum");
  const [smjer, setSmjer] = useState<Smjer>("desc");
  const [oznaceni, setOznaceni] = useState<Set<string>>(() => new Set());
  const [izvozi, setIzvozi] = useState(false);
  const [greskaIzvoza, setGreskaIzvoza] = useState("");

  // Sortiranje ovdje, ne u roditelju: roditelju za kartice treba samo skup.
  // Isti poredak kao `prikazaniZapisi` u izvozu — sortiraj je dio tog lanca.
  const sortirani = useMemo(() => sortiraj(zapisi, stupac, smjer), [zapisi, stupac, smjer]);

  const grupe = useMemo(() => grupiraj(sortirani, po, stupac, smjer), [sortirani, po, stupac, smjer]);

  const vidljiviOznaceni = useMemo(
    () => sortirani.filter((z) => oznaceni.has(z.id)).length,
    [sortirani, oznaceni]
  );
  const imaOznacenih = vidljiviOznaceni > 0;
  const sviOznaceni = sortirani.length > 0 && vidljiviOznaceni === sortirani.length;

  const podnozje = useMemo(
    () => izracunajSazetak(zaZbroj(sortirani, oznaceni, imaOznacenih)),
    [sortirani, oznaceni, imaOznacenih]
  );

  const glavnaKvacica = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (glavnaKvacica.current) {
      glavnaKvacica.current.indeterminate = imaOznacenih && !sviOznaceni;
    }
  }, [imaOznacenih, sviOznaceni]);

  function klikNaZaglavlje(s: Stupac) {
    if (s === stupac) {
      setSmjer((x) => (x === "asc" ? "desc" : "asc"));
    } else {
      setStupac(s);
      setSmjer("asc");
    }
  }

  function prebaci(id: string) {
    setOznaceni((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function oznaciSve() {
    setOznaceni((prev) => {
      const n = new Set(prev);
      if (sviOznaceni) for (const z of sortirani) n.delete(z.id);
      else for (const z of sortirani) n.add(z.id);
      return n;
    });
  }

  async function izveziExcel() {
    setIzvozi(true);
    setGreskaIzvoza("");

    const postavke: PostavkeTablice = {
      godina,
      zateceno,
      tekst,
      grupiraj: po,
      stupac,
      smjer,
      oznaceni: sortirani.filter((z) => oznaceni.has(z.id)).map((z) => z.id),
    };

    try {
      const res = await fetch("/api/berba/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postavke),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setGreskaIzvoza(data?.error || "Izvoz nije uspio.");
        return;
      }

      const blob = await res.blob();
      const naziv =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        "berba.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = naziv;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setGreskaIzvoza("Izvoz nije uspio.");
    } finally {
      setIzvozi(false);
    }
  }

  const brojStupaca = STUPCI_PRIKAZA.length + 1;

  return (
    <div className="min-w-0 border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
      {/* KONTROLE */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-[220px]">
          <label className="mb-1 block text-[12px] font-semibold text-stone-700">Traži</label>
          <input
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder="sorta ili položaj..."
            className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-semibold text-stone-700">Grupiraj po</label>
          <select
            value={po}
            onChange={(e) => setPo(e.target.value as Grupiranje)}
            className="border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
          >
            {(Object.keys(NAZIV_GRUPIRANJA) as Grupiranje[]).map((g) => (
              <option key={g} value={g}>
                {NAZIV_GRUPIRANJA[g]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 border border-emerald-200 bg-white px-3 py-2 text-[13px] text-stone-700">
          <input
            ref={glavnaKvacica}
            type="checkbox"
            checked={sviOznaceni}
            onChange={oznaciSve}
            className="h-4 w-4 accent-emerald-700"
          />
          Označi sve
        </label>

        {imaOznacenih ? (
          <button
            type="button"
            onClick={() => setOznaceni(new Set())}
            className="border border-emerald-200 bg-white px-3 py-2 text-[13px] text-stone-700 hover:bg-emerald-50"
          >
            Poništi oznake ({vidljiviOznaceni})
          </button>
        ) : null}

        <button
          type="button"
          onClick={izveziExcel}
          disabled={izvozi || sortirani.length === 0}
          className="border border-emerald-300 bg-gradient-to-b from-emerald-100 to-lime-100 px-4 py-2 text-[13px] font-semibold text-emerald-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {izvozi ? "Izvozim..." : imaOznacenih ? `Excel — označeni (${vidljiviOznaceni})` : "Excel"}
        </button>
      </div>

      {greskaIzvoza ? (
        <div className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {greskaIzvoza}
        </div>
      ) : null}

      {sortirani.length === 0 ? (
        <div className="border border-dashed border-emerald-300 bg-white p-8 text-center text-[13px] text-stone-500">
          Nema zapisa za odabranu godinu i pretragu.
        </div>
      ) : (
        <div className="max-w-full overflow-x-auto border border-emerald-200 bg-white">
          <table className="min-w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-emerald-100/70 text-left text-[11px] uppercase tracking-[0.1em] text-emerald-900">
                <th className="w-8 border border-emerald-200 px-2 py-2">
                  <span className="sr-only">Oznaka retka</span>
                </th>
                {STUPCI_PRIKAZA.map((s) => (
                  <th
                    key={s}
                    className={`border border-emerald-200 px-2 py-2 whitespace-nowrap ${BROJCANI.has(s) ? "text-right" : ""}`}
                    aria-sort={s === stupac ? (smjer === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      onClick={() => klikNaZaglavlje(s)}
                      className="inline-flex items-center gap-1 uppercase hover:text-emerald-700"
                    >
                      {NASLOVI[s]}
                      <span className="text-[10px]">{s === stupac ? (smjer === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {grupe.map((g) => {
                const zbrojGrupe =
                  po === "nista" ? null : izracunajSazetak(zaZbroj(g.zapisi, oznaceni, imaOznacenih));

                return (
                  <GrupaRedaka
                    key={g.kljuc}
                    naziv={g.naziv}
                    zapisi={g.zapisi}
                    zbroj={zbrojGrupe}
                    oznaceni={oznaceni}
                    imaOznacenih={imaOznacenih}
                    prebaci={prebaci}
                    brojStupaca={brojStupaca}
                  />
                );
              })}
            </tbody>

            <tfoot>
              <RedakZbroja
                oznaka={
                  imaOznacenih
                    ? `Označeno · ${vidljiviOznaceni} od ${sortirani.length}`
                    : `Ukupno · ${sortirani.length} ${sortirani.length === 1 ? "zapis" : "zapisa"}`
                }
                s={podnozje}
                glavni
              />
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-2 text-[12px] leading-5 text-stone-500">
        Šećer, kiseline i pH u zbrojevima su <strong>prosjek ponderiran kilogramima</strong>. Ulazi
        samo zapis koji ima i vrijednost i kilograme; „n/od” uz prosjek kaže koliko je takvih.
        Randman u zbroju je ΣL / Σkg nad zapisima s kilogramima, ne prosjek randmana.
        {imaOznacenih ? " Zbrojevi računaju samo označene retke." : ""}
      </p>
    </div>
  );
}

function GrupaRedaka({
  naziv,
  zapisi,
  zbroj,
  oznaceni,
  imaOznacenih,
  prebaci,
  brojStupaca,
}: {
  naziv: string;
  zapisi: RedakBerbe[];
  zbroj: Sazetak | null;
  oznaceni: ReadonlySet<string>;
  imaOznacenih: boolean;
  prebaci: (id: string) => void;
  brojStupaca: number;
}) {
  return (
    <>
      {zbroj ? (
        <tr className="bg-emerald-50">
          <td
            colSpan={brojStupaca}
            className="border border-emerald-200 px-2 py-1.5 text-[13px] font-semibold text-emerald-950"
          >
            {naziv} <span className="font-normal text-stone-500">· {zapisi.length}</span>
          </td>
        </tr>
      ) : null}

      {zapisi.map((z) => (
        <Redak key={z.id} z={z} oznacen={oznaceni.has(z.id)} prebaci={prebaci} />
      ))}

      {zbroj ? (
        <RedakZbroja
          oznaka={imaOznacenih ? `Podzbroj · označeni ${zbroj.zapisa}` : `Podzbroj · ${zbroj.zapisa}`}
          s={zbroj}
        />
      ) : null}
    </>
  );
}

function Redak({
  z,
  oznacen,
  prebaci,
}: {
  z: RedakBerbe;
  oznacen: boolean;
  prebaci: (id: string) => void;
}) {
  const dan = danBerbe(z);
  const jeZateceno = z.vrstaUnosa === "ZATECENO";

  const tdBroj = "border border-emerald-100 px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
  const td = "border border-emerald-100 px-2 py-1.5";

  return (
    <tr
      className={
        oznacen ? "bg-lime-50" : jeZateceno ? "bg-amber-50/60" : "bg-white hover:bg-emerald-50/40"
      }
    >
      <td className={`${td} text-center`}>
        <input
          type="checkbox"
          checked={oznacen}
          onChange={() => prebaci(z.id)}
          aria-label={`Označi ${z.nazivSorte}`}
          className="h-4 w-4 accent-emerald-700"
        />
      </td>
      <td className={`${td} whitespace-nowrap`}>{dan ? prikazDana(dan) : "-"}</td>
      <td className={td}>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Link href={`/berba/${z.id}`} className="font-semibold text-emerald-900 hover:underline">
            {z.nazivSorte}
          </Link>
          {jeZateceno ? (
            <span className="border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-900">
              zatečeno
            </span>
          ) : null}
          {z.napomena ? (
            <span
              title={`Napomena: ${z.napomena}`}
              aria-label={`Napomena: ${z.napomena}`}
              className="cursor-help text-[12px] text-emerald-700"
            >
              ⓘ
            </span>
          ) : null}
          {z.ispravljenoAt ? (
            <span
              title={`Ispravljeno ${formatHrDate(z.ispravljenoAt)}${z.razlogIspravka ? ` — ${z.razlogIspravka}` : ""}`}
              aria-label="Ispravljeno"
              className="cursor-help text-[12px] text-amber-700"
            >
              ✎
            </span>
          ) : null}
        </span>
      </td>
      <td className={td}>{z.polozaj || "-"}</td>
      <td className={tdBroj}>{formatBroj(z.kolicinaKgGrozdja, 0)}</td>
      <td className={tdBroj}>{formatBroj(z.kolicinaLitara, 0)}</td>
      <td className={tdBroj}>{formatBroj(randmanRetka(z), 1)}</td>
      <td className={tdBroj}>{formatBroj(z.secer, 1)}</td>
      <td className={tdBroj}>{formatBroj(z.kiseline, 2)}</td>
      <td className={tdBroj}>{formatBroj(z.ph, 2)}</td>
      <td className={`${td} whitespace-nowrap`}>{opisMaceracije(z.maceracija, z.maceracijaSati) ?? "-"}</td>
      <td className={td}>{z.oznakaBerbe || "-"}</td>
    </tr>
  );
}

/** Prosjek s pokrivenoscu kad nije potpuna: "78,4 (28/31)". */
function ProsjekCelija({ p, digits }: { p: Prosjek; digits: number }) {
  if (p.vrijednost == null) return <>—</>;
  return (
    <>
      {formatBroj(p.vrijednost, digits)}
      {p.n < p.od ? (
        <span className="ml-1 text-[11px] font-normal text-stone-500">
          ({p.n}/{p.od})
        </span>
      ) : null}
    </>
  );
}

function RedakZbroja({ oznaka, s, glavni = false }: { oznaka: string; s: Sazetak; glavni?: boolean }) {
  const cls = glavni
    ? "border border-emerald-300 bg-emerald-100/80 px-2 py-2 font-semibold text-emerald-950"
    : "border border-emerald-200 bg-emerald-50/70 px-2 py-1.5 font-semibold text-stone-700";
  const num = `${cls} text-right tabular-nums whitespace-nowrap`;

  return (
    <tr>
      <td className={cls} colSpan={4}>
        {oznaka}
      </td>
      <td className={num}>{formatBroj(s.kg, 0)}</td>
      <td className={num}>{formatBroj(s.litara, 0)}</td>
      <td className={num}>
        <ProsjekCelija p={s.randman} digits={1} />
      </td>
      <td className={num} title="ponderirano po kg">
        <ProsjekCelija p={s.secer} digits={1} />
      </td>
      <td className={num} title="ponderirano po kg">
        <ProsjekCelija p={s.kiseline} digits={2} />
      </td>
      <td className={num} title="ponderirano po kg">
        <ProsjekCelija p={s.ph} digits={2} />
      </td>
      <td className={cls} colSpan={2}>
        {glavni ? <span className="text-[11px] font-normal">prosjeci ponderirani po kg</span> : null}
      </td>
    </tr>
  );
}
