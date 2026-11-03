"use client";

/**
 * SIMULACIJA KUPAZE — samo stanje stranice, nista se ne sprema.
 *
 * Vino ostaje u simulaciji i kad ga filtar makne iz tablice: odabir je odluka
 * korisnika, a filtar samo pogled. Tezina su UPISANE litre.
 */

import { useMemo } from "react";
import { formatBroj } from "@/app/berba/tablica-berbe";
import {
  OZNAKA_SECERA,
  POLJA_PROSJEKA,
  POLJA_PREGLEDA,
  opisUdjela,
  simuliraj,
  uLitre,
  type VinoRedak,
} from "@/lib/statistika-vina";
import { BojaVrste, Vrijednost } from "./tablica-vina";

const DECIMALE_SECERA = POLJA_PREGLEDA.find((p) => p.kljuc === "secer")!.decimale;

export default function SimulacijaKupaze({
  odabir,
  prag,
  upisi,
  makni,
  ponisti,
}: {
  odabir: Array<{ vino: VinoRedak; upis: string }>;
  prag: number;
  upisi: (tankId: string, upis: string) => void;
  makni: (v: VinoRedak) => void;
  ponisti: () => void;
}) {
  const r = useMemo(() => simuliraj(odabir, prag), [odabir, prag]);
  const polja = POLJA_PROSJEKA.filter((p) => r.prosjeci[p.kljuc].pokrivenoMl > 0);

  return (
    <section className="mb-4 border-2 border-[#7f1d1d]/40 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold">Simulacija kupaže</h2>
        <button
          type="button"
          onClick={ponisti}
          className="border border-stone-300 bg-white px-3 py-1.5 text-[13px] text-stone-700 hover:bg-stone-50"
        >
          Poništi odabir
        </button>
      </div>

      <div className="relative max-w-full overflow-x-auto">
        <table className="min-w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-stone-100 text-left text-[11px] uppercase tracking-[0.06em] text-stone-600">
              <th className="border border-stone-200 px-2 py-2">Tank</th>
              <th className="border border-stone-200 px-2 py-2">Vino</th>
              <th className="border border-stone-200 px-2 py-2 text-right">U tanku</th>
              <th className="border border-stone-200 px-2 py-2">Litre u kupaži</th>
              <th className="border border-stone-200 px-2 py-2 text-right">Šećer, sirovo</th>
              <th className="border border-stone-200 px-2 py-2">
                <span className="sr-only">Makni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {r.stavke.map((s, i) => (
              <tr key={s.vino.tankId}>
                <td className="border border-stone-200 px-2 py-2 whitespace-nowrap">T{s.vino.broj}</td>
                <td className="border border-stone-200 px-2 py-2">
                  {s.vino.naziv}
                  {s.vino.sifra ? <span className="ml-2 text-[12px] text-stone-500">{s.vino.sifra}</span> : null}
                </td>
                <td className="border border-stone-200 px-2 py-2 text-right whitespace-nowrap">
                  {formatBroj(uLitre(s.vino.ml), 3)} L
                </td>
                <td className="border border-stone-200 px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={odabir[i].upis}
                    onChange={(e) => upisi(s.vino.tankId, e.target.value)}
                    aria-label={`Litre iz tanka ${s.vino.broj}`}
                    className={`w-28 border px-2 py-1 text-right outline-none ${
                      s.preko || s.neispravno
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-stone-300 focus:border-[#7f1d1d]"
                    }`}
                  />
                  {s.preko ? (
                    <div className="mt-1 text-[11px] whitespace-nowrap text-red-700">više nego u tanku</div>
                  ) : null}
                  {s.neispravno ? (
                    <div className="mt-1 text-[11px] whitespace-nowrap text-red-700">neispravan upis</div>
                  ) : null}
                </td>
                <td className="border border-stone-200 px-2 py-2 text-right whitespace-nowrap">
                  <Vrijednost p={s.vino.parametri.secer} decimale={DECIMALE_SECERA} />
                </td>
                <td className="border border-stone-200 px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => makni(s.vino)}
                    aria-label={`Makni tank ${s.vino.broj} iz simulacije`}
                    className="px-1 text-stone-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
        Šećer: {OZNAKA_SECERA}. Prosjek se ne računa.
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <div className="text-[22px] font-semibold">{formatBroj(uLitre(r.ukupnoMl), 3)} L</div>
            {r.ukupnoMl > 0 ? <BojaVrste vrsta={r.vrsta} /> : null}
          </div>

          {r.sastav.length === 0 ? (
            <div className="text-[13px] text-stone-500">Upiši litre za izračun sastava.</div>
          ) : (
            <ul className="space-y-1.5">
              {r.sastav.map((s) => (
                <li key={s.nazivSorte} className="text-[13px]">
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{s.nazivSorte}</span>
                    <span className="whitespace-nowrap">
                      {opisUdjela(s.postotak)} · {formatBroj(uLitre(s.ml), 0)} L
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 bg-stone-100">
                    <div className="h-full bg-[#7f1d1d]/70" style={{ width: `${Math.min(100, s.postotak)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-stone-500">
            Sortno je vino s jednom sortom preko {prag} %, inače cuvée.
          </p>
        </div>

        <div className="min-w-0">
          {polja.length === 0 ? (
            <div className="text-[13px] text-stone-500">Nema parametara za prosjek.</div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-stone-100 text-left text-[11px] uppercase tracking-[0.06em] text-stone-600">
                  <th className="border border-stone-200 px-2 py-2">Parametar</th>
                  <th className="border border-stone-200 px-2 py-2 text-right">Prosjek</th>
                  <th className="border border-stone-200 px-2 py-2 text-right">Pokriveno</th>
                </tr>
              </thead>
              <tbody>
                {polja.map((p) => {
                  const x = r.prosjeci[p.kljuc];
                  return (
                    <tr key={p.kljuc}>
                      <td className="border border-stone-200 px-2 py-2">
                        {p.naziv}
                        {p.kljuc === "ph" ? <span className="ml-1 text-[11px] text-stone-500">procjena</span> : null}
                      </td>
                      <td className="border border-stone-200 px-2 py-2 text-right font-semibold">
                        {formatBroj(x.vrijednost, p.decimale)}
                      </td>
                      <td className="border border-stone-200 px-2 py-2 text-right text-[12px] text-stone-600">
                        {formatBroj(uLitre(x.pokrivenoMl), 0)} od {formatBroj(uLitre(x.ukupnoMl), 0)} L
                        {x.neizmjerenoMl > 0 ? (
                          <div className="text-[11px] text-stone-500 italic">
                            neizmjereno {formatBroj(uLitre(x.neizmjerenoMl), 0)} L
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[12px] text-stone-500">
            Prosjek zadnjih vrijednosti, ponderiran upisanim litrama. Vino bez podatka ne ulazi u taj prosjek.
          </p>
        </div>
      </div>
    </section>
  );
}
