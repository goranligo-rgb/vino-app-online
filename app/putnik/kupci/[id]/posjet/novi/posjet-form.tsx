"use client";

import { useState } from "react";
import { spremiPosjet } from "./actions";

type Stavka = {
  key: number;
  naziv: string;
  kolicina: string;
  jedinica: string;
};

let brojac = 0;
function novaStavka(): Stavka {
  brojac += 1;
  return { key: brojac, naziv: "", kolicina: "", jedinica: "kom" };
}

export default function PosjetForm({
  kupacId,
  danas,
}: {
  kupacId: string;
  danas: string;
}) {
  const [stavke, setStavke] = useState<Stavka[]>([novaStavka()]);

  function azuriraj(key: number, polje: keyof Stavka, vrijednost: string) {
    setStavke((prev) =>
      prev.map((s) => (s.key === key ? { ...s, [polje]: vrijednost } : s))
    );
  }

  function dodajRed() {
    setStavke((prev) => [...prev, novaStavka()]);
  }

  function obrisiRed(key: number) {
    setStavke((prev) =>
      prev.length === 1 ? prev : prev.filter((s) => s.key !== key)
    );
  }

  return (
    <form action={spremiPosjet} className="space-y-4">
      <input type="hidden" name="kupacId" value={kupacId} />

      <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
        <h2 className="mb-4 text-[18px] font-semibold text-stone-800">
          Osnovno
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
              Datum posjeta
            </label>
            <input
              name="datum"
              type="date"
              defaultValue={danas}
              className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
              Ostavljen reklamni materijal
            </label>
            <input
              name="reklamniMaterijal"
              placeholder="npr. plakat, stalak, letci, čaše..."
              className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            />
          </div>
        </div>
      </div>

      <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-stone-800">Narudžba</h2>
          <button
            type="button"
            onClick={dodajRed}
            className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-3 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
          >
            + Dodaj stavku
          </button>
        </div>

        <div className="space-y-2">
          {stavke.map((s, index) => (
            <div
              key={s.key}
              className="grid gap-2 border border-orange-100 bg-white p-2 md:grid-cols-[1fr_120px_110px_auto]"
            >
              <input
                name="stavkaNaziv"
                value={s.naziv}
                onChange={(e) => azuriraj(s.key, "naziv", e.target.value)}
                placeholder={`Proizvod ${index + 1}`}
                className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
              />
              <input
                name="stavkaKolicina"
                value={s.kolicina}
                onChange={(e) => azuriraj(s.key, "kolicina", e.target.value)}
                type="number"
                step="any"
                placeholder="Količina"
                className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
              />
              <input
                name="stavkaJedinica"
                value={s.jedinica}
                onChange={(e) => azuriraj(s.key, "jedinica", e.target.value)}
                placeholder="kom"
                className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
              />
              <button
                type="button"
                onClick={() => obrisiRed(s.key)}
                disabled={stavke.length === 1}
                className="border border-orange-200 bg-white px-3 py-2 text-[13px] font-semibold text-stone-600 hover:bg-orange-50 disabled:opacity-40"
              >
                Ukloni
              </button>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[12px] text-stone-500">
          Prazni redovi (bez naziva proizvoda) se ne spremaju.
        </p>
      </div>

      <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
        <h2 className="mb-4 text-[18px] font-semibold text-stone-800">
          Dug i zabilješke
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
              Ukupan dug (EUR)
            </label>
            <input
              name="ukupanDug"
              type="number"
              step="any"
              className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
              Dospjeli dug (EUR)
            </label>
            <input
              name="dospjeliDug"
              type="number"
              step="any"
              className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[13px] font-semibold text-stone-700">
            Zabilješke
          </label>
          <textarea
            name="biljeska"
            rows={5}
            className="w-full resize-y border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            placeholder="Što je dogovoreno, stanje na terenu, problemi..."
          />
        </div>
      </div>

      <details className="group border border-orange-200 bg-gradient-to-b from-white to-orange-50">
        <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-[18px] font-semibold text-stone-800 marker:content-['']">
          <span>Teren / dnevni izvještaj</span>
          <span className="text-[13px] font-normal text-orange-800/70 group-open:hidden">
            otvori ▾
          </span>
          <span className="hidden text-[13px] font-normal text-orange-800/70 group-open:inline">
            zatvori ▴
          </span>
        </summary>

        <div className="space-y-4 border-t border-orange-200 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Mjesto
              </label>
              <input
                name="mjesto"
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Vrijeme od
              </label>
              <input
                name="vrijemeOd"
                type="time"
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Vrijeme do
              </label>
              <input
                name="vrijemeDo"
                type="time"
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Tip obilaska (ritam)
              </label>
              <select
                name="tipObilaska"
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              >
                <option value="">—</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Premisa
              </label>
              <select
                name="tipPremise"
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              >
                <option value="">—</option>
                <option value="ON">ON premise (konzumacija na mjestu)</option>
                <option value="OFF">OFF premise (prodaja za van)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Stanje proizvoda
              </label>
              <select
                name="stanjeProizvoda"
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              >
                <option value="">—</option>
                <option value="DOVOLJNO">Dovoljno</option>
                <option value="MANJAK">Manjak</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-semibold text-stone-700">
              Aktivnosti na terenu
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { name: "aktDegustacija", label: "Degustacija" },
                { name: "aktVidljivost", label: "Vidljivost" },
                { name: "aktSlaganjeRobe", label: "Slaganje robe" },
                { name: "aktIstaknuteCijene", label: "Istaknute cijene" },
                { name: "aktAkcijskaCijena", label: "Akcijska cijena" },
              ].map((a) => (
                <label
                  key={a.name}
                  className="flex min-h-[48px] cursor-pointer items-center gap-3 border border-orange-200 bg-white px-3 py-3 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
                >
                  <input
                    name={a.name}
                    type="checkbox"
                    className="h-5 w-5 accent-orange-700"
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Cijena / cjenovne napomene
              </label>
              <input
                name="cijena"
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                Prijeđeni kilometri
              </label>
              <input
                name="kilometri"
                type="number"
                step="any"
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
              Napomene / problemi
            </label>
            <textarea
              name="problemi"
              rows={3}
              className="w-full resize-y border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            />
          </div>
        </div>
      </details>

      <div className="sticky bottom-4 z-40 flex justify-end border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4 shadow-2xl">
        <button
          type="submit"
          className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-3 text-[14px] font-semibold text-orange-950 transition hover:brightness-105"
        >
          Spremi posjet
        </button>
      </div>
    </form>
  );
}
