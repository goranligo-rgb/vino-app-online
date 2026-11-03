"use client";

/**
 * TABLICA PREGLEDA VINA — jedan redak po tanku s vinom.
 *
 * Zbirni red je prosjek ponderiran litrama (`zbrojVina`), bez secera: ondje stoji
 * crtica jer jedinica nije zapisana. Stupac koji je prazan na svim prikazanim
 * vinima ne crta se, a vraca se s prvim podatkom.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatBroj } from "@/app/berba/tablica-berbe";
import { formatHrDate } from "@/lib/datum";
import {
  NAZIV_VRSTE,
  grupirajVina,
  opisUdjela,
  sortirajVina,
  stupciSPodacima,
  uLitre,
  zbrojVina,
  type Grupiranje,
  type PoljePregleda,
  type PoljeProsjeka,
  type Prosjek,
  type Smjer,
  type StupacSorta,
  type VinoRedak,
  type VrijednostPolja,
  type VrstaVina,
} from "@/lib/statistika-vina";

const OZNAKA_PODRIJETLA: Partial<Record<VrijednostPolja["podrijetlo"], { kratko: string; opis: string }>> = {
  preneseno: { kratko: "pren.", opis: "preneseno pretokom — na ovom vinu nije izmjereno" },
  knjiga: { kratko: "knj.", opis: "izmjereno na ovom vinu u ranijoj posudi" },
  blend: { kratko: "blend", opis: "procjena iz sastavnica blenda" },
};

export function BojaVrste({ vrsta }: { vrsta: VrstaVina }) {
  const klasa =
    vrsta === "SORTNO"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : vrsta === "CUVEE"
        ? "border-rose-300 bg-rose-50 text-rose-900"
        : "border-stone-300 bg-stone-100 text-stone-700";
  return (
    <span className={`inline-block border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${klasa}`}>
      {NAZIV_VRSTE[vrsta]}
    </span>
  );
}

/** Vrijednost monitora uz oznaku kad nije izmjerena na ovom vinu. */
export function Vrijednost({ p, decimale }: { p: VrijednostPolja; decimale: number }) {
  if (p.vrijednost == null) return <span className="text-stone-300">—</span>;

  const oznaka = OZNAKA_PODRIJETLA[p.podrijetlo];
  if (!oznaka) {
    return (
      <span title={p.izmjerenoAt ? `izmjereno ${formatHrDate(p.izmjerenoAt)}` : undefined}>
        {formatBroj(p.vrijednost, decimale)}
      </span>
    );
  }

  return (
    <span className="text-stone-500 italic" title={oznaka.opis}>
      {formatBroj(p.vrijednost, decimale)}
      <span className="ml-1 text-[10px] not-italic">{oznaka.kratko}</span>
    </span>
  );
}

function ProsjekCelija({ p, polje, decimale }: { p: Prosjek; polje: PoljeProsjeka; decimale: number }) {
  if (p.vrijednost == null) return <span className="text-stone-300">—</span>;
  const djelomicno = p.pokrivenoMl < p.ukupnoMl;
  return (
    <>
      {formatBroj(p.vrijednost, decimale)}
      {p.neizmjerenoMl > 0 ? <span title="uključuje vrijednosti koje nisu izmjerene na tom vinu">*</span> : null}
      {polje === "ph" ? <div className="text-[10px] font-normal text-stone-500">procjena</div> : null}
      {djelomicno ? (
        <div className="text-[10px] font-normal whitespace-nowrap text-stone-500">
          {formatBroj(uLitre(p.pokrivenoMl), 0)} od {formatBroj(uLitre(p.ukupnoMl), 0)} L
        </div>
      ) : null}
    </>
  );
}

function ZbirniRed({
  naziv,
  vina,
  stupci,
  glavni = false,
}: {
  naziv: string;
  vina: VinoRedak[];
  stupci: ReturnType<typeof stupciSPodacima>;
  glavni?: boolean;
}) {
  const z = useMemo(() => zbrojVina(vina), [vina]);
  const klasa = glavni ? "bg-stone-200 font-semibold" : "bg-stone-100 font-semibold";

  return (
    <tr className={klasa}>
      <td colSpan={6} className="border border-stone-200 px-2 py-2">
        {naziv} <span className="font-normal text-stone-500">· {vina.length}</span>
      </td>
      <td className="border border-stone-200 px-2 py-2 text-right whitespace-nowrap">
        {formatBroj(uLitre(z.ukupnoMl), 0)} L
      </td>
      {stupci.map((s) => (
        <td key={s.kljuc} className="border border-stone-200 px-2 py-2 text-right align-top">
          {s.kljuc === "secer" ? (
            <span className="text-stone-400" title="bez prosjeka: jedinica nije zapisana (°Oe ili g/L)">
              —
            </span>
          ) : (
            <ProsjekCelija p={z.prosjeci[s.kljuc]} polje={s.kljuc} decimale={s.decimale} />
          )}
        </td>
      ))}
      <td className="border border-stone-200 px-2 py-2" />
    </tr>
  );
}

function RedakVina({
  v,
  stupci,
  odabrano,
  prebaci,
}: {
  v: VinoRedak;
  stupci: ReturnType<typeof stupciSPodacima>;
  odabrano: boolean;
  prebaci: (v: VinoRedak) => void;
}) {
  const prve = v.sastav.slice(0, 3);
  const ostale = v.sastav.length - prve.length;
  const sastavTekst = v.sastav.map((s) => `${s.nazivSorte} ${opisUdjela(s.postotak)}`);

  return (
    <tr className={odabrano ? "bg-amber-50" : "hover:bg-stone-50"}>
      <td className="border border-stone-200 px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={odabrano}
          onChange={() => prebaci(v)}
          aria-label={`Odaberi tank ${v.broj} za simulaciju`}
          className="h-4 w-4 accent-[#7f1d1d]"
        />
      </td>
      <td className="border border-stone-200 px-2 py-2 whitespace-nowrap">
        <Link href={`/tankovi/${v.tankId}`} className="font-medium text-[#7f1d1d] hover:underline">
          T{v.broj}
        </Link>
      </td>
      <td className="border border-stone-200 px-2 py-2 whitespace-nowrap">{v.sifra ?? "—"}</td>
      <td className="border border-stone-200 px-2 py-2">{v.naziv}</td>
      <td className="min-w-[200px] border border-stone-200 px-2 py-2" title={sastavTekst.join(", ")}>
        <div className="mb-1">
          <BojaVrste vrsta={v.vrsta} />
        </div>
        {v.sastav.length === 0 ? (
          <span className="text-stone-400">sastav nepoznat</span>
        ) : (
          <span className="text-[12px] text-stone-600">
            {sastavTekst.slice(0, prve.length).join(", ")}
            {ostale > 0 ? ` +${ostale}` : ""}
          </span>
        )}
      </td>
      <td className="border border-stone-200 px-2 py-2 text-right">{v.godiste ?? ""}</td>
      <td className="border border-stone-200 px-2 py-2 text-right whitespace-nowrap">
        {formatBroj(uLitre(v.ml), 0)} L
      </td>
      {stupci.map((s) => (
        <td key={s.kljuc} className="border border-stone-200 px-2 py-2 text-right whitespace-nowrap">
          <Vrijednost p={v.parametri[s.kljuc]} decimale={s.decimale} />
        </td>
      ))}
      <td className="border border-stone-200 px-2 py-2 whitespace-nowrap">
        {v.zadnjeMjerenjeAt ? formatHrDate(v.zadnjeMjerenjeAt) : <span className="text-stone-300">—</span>}
      </td>
    </tr>
  );
}

function Zaglavlje({
  s,
  naziv,
  desno = false,
  stupac,
  smjer,
  klik,
}: {
  s: StupacSorta;
  naziv: string;
  desno?: boolean;
  stupac: StupacSorta;
  smjer: Smjer;
  klik: (s: StupacSorta) => void;
}) {
  return (
    <th
      className={`border border-stone-200 px-2 py-2 align-bottom ${desno ? "text-right" : ""}`}
      aria-sort={s === stupac ? (smjer === "asc" ? "ascending" : "descending") : "none"}
    >
      {/* Bez `uppercase`: pretvorio bi °Oe, g/L i pH u °OE, G/L i PH. */}
      <button type="button" onClick={() => klik(s)} className="font-semibold hover:text-[#7f1d1d]">
        {naziv}
        <span className="ml-1 text-[10px]">{s === stupac ? (smjer === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

export default function TablicaVina({
  vina,
  po,
  jeOdabrano,
  prebaci,
}: {
  /** Vec filtrirana vina. */
  vina: VinoRedak[];
  po: Grupiranje;
  jeOdabrano: (tankId: string) => boolean;
  prebaci: (v: VinoRedak) => void;
}) {
  const [stupac, setStupac] = useState<StupacSorta>("broj");
  const [smjer, setSmjer] = useState<Smjer>("asc");

  const sortirana = useMemo(() => sortirajVina(vina, stupac, smjer), [vina, stupac, smjer]);
  const grupe = useMemo(() => grupirajVina(sortirana, po), [sortirana, po]);
  const stupci = useMemo(() => stupciSPodacima(vina), [vina]);

  function klik(s: StupacSorta) {
    if (s === stupac) setSmjer((x) => (x === "asc" ? "desc" : "asc"));
    else {
      setStupac(s);
      setSmjer("asc");
    }
  }

  const zaglavlje = { stupac, smjer, klik };

  if (vina.length === 0) {
    return (
      <div className="border border-dashed border-stone-300 bg-white p-8 text-center text-[13px] text-stone-500">
        Nema vina za odabrane filtre.
      </div>
    );
  }

  return (
    <>
      <div className="relative max-w-full overflow-x-auto border border-stone-200 bg-white">
        <table className="min-w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-stone-100 text-left text-[11px] tracking-[0.06em] text-stone-600">
              <th className="w-8 border border-stone-200 px-2 py-2">
                <span className="sr-only">Odabir za simulaciju</span>
              </th>
              <Zaglavlje {...zaglavlje} s="broj" naziv="Tank" />
              <Zaglavlje {...zaglavlje} s="sifra" naziv="Šifra" />
              <Zaglavlje {...zaglavlje} s="vino" naziv="Vino" />
              <Zaglavlje {...zaglavlje} s="sastav" naziv="Tip i sastav" />
              <Zaglavlje {...zaglavlje} s="godina" naziv="Godina" desno />
              <Zaglavlje {...zaglavlje} s="litre" naziv="Litre" desno />
              {stupci.map((p) => (
                <Zaglavlje key={p.kljuc} {...zaglavlje} s={p.kljuc as PoljePregleda} naziv={p.naziv} desno />
              ))}
              <Zaglavlje {...zaglavlje} s="datum" naziv="Zadnje mjerenje" />
            </tr>
          </thead>

          <tbody>
            {grupe.map((g) => (
              <GrupaRedaka
                key={g.kljuc}
                naziv={g.naziv}
                vina={g.vina}
                stupci={stupci}
                jeOdabrano={jeOdabrano}
                prebaci={prebaci}
              />
            ))}
          </tbody>

          <tfoot>
            <ZbirniRed naziv="Ukupno prikazano" vina={sortirana} stupci={stupci} glavni />
          </tfoot>
        </table>
      </div>

      <p className="mt-2 text-[12px] leading-5 text-stone-500">
        Zbirni redovi su prosjek ponderiran litrama, a „X od Y L” kaže koliko vina ima taj podatak.{" "}
        <strong>pren.</strong> = preneseno pretokom, nije izmjereno na tom vinu; <strong>knj.</strong> =
        izmjereno u ranijoj posudi; <strong>*</strong> = prosjek uključuje takve vrijednosti. Datum stoji
        samo uz stvarno izmjerene vrijednosti. Šećer je sirov broj jer jedinica nije zapisana, pa nema
        prosjeka. Stupac bez ijednog podatka se ne prikazuje.
      </p>
    </>
  );
}

function GrupaRedaka({
  naziv,
  vina,
  stupci,
  jeOdabrano,
  prebaci,
}: {
  naziv: string;
  vina: VinoRedak[];
  stupci: ReturnType<typeof stupciSPodacima>;
  jeOdabrano: (tankId: string) => boolean;
  prebaci: (v: VinoRedak) => void;
}) {
  return (
    <>
      {naziv ? <ZbirniRed naziv={naziv} vina={vina} stupci={stupci} /> : null}
      {vina.map((v) => (
        <RedakVina key={v.tankId} v={v} stupci={stupci} odabrano={jeOdabrano(v.tankId)} prebaci={prebaci} />
      ))}
    </>
  );
}
