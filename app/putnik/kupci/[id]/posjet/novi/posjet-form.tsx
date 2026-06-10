"use client";

import { useState } from "react";
import { spremiPosjet } from "./actions";

type Artikl = { id: string; naziv: string };
type Vino = { id: string; naziv: string; zadanaJedinica?: string | null };

type Stavka = {
  key: number;
  naziv: string;
  artiklId: string; // Faza 7 - id vina iz kataloga ("" = slobodan unos, ne prati se u zalihi)
  rucno: boolean;
  kolicina: string;
  jedinica: string;
  gratis: string;
  gratisRucno: boolean;
  status: string;
};

type Poklon = {
  key: number;
  artiklId: string;
  kolicina: string;
  status: string;
};

const OSTALO = "__OSTALO__";

let brojac = 0;
function novaStavka(): Stavka {
  brojac += 1;
  return {
    key: brojac,
    naziv: "",
    artiklId: "",
    rucno: false,
    kolicina: "",
    jedinica: "kom",
    gratis: "0",
    gratisRucno: false,
    status: "PRIPREMITI",
  };
}

let brojacP = 0;
function noviPoklon(): Poklon {
  brojacP += 1;
  return { key: brojacP, artiklId: "", kolicina: "", status: "PRIPREMITI" };
}

function predlozenGratis(kolicina: string, akcijaX: number, akcijaY: number): number {
  if (akcijaX <= 0) return 0;
  const k = parseFloat(kolicina.replace(",", "."));
  if (!Number.isFinite(k) || k <= 0) return 0;
  return Math.floor(k / akcijaX) * akcijaY;
}

export default function PosjetForm({
  kupacId,
  danas,
  akcijaX,
  akcijaY,
  vina,
  promoArtikli,
}: {
  kupacId: string;
  danas: string;
  akcijaX: number;
  akcijaY: number;
  vina: Vino[];
  promoArtikli: Artikl[];
}) {
  const [stavke, setStavke] = useState<Stavka[]>([novaStavka()]);
  const [pokloni, setPokloni] = useState<Poklon[]>([noviPoklon()]);

  const imaAkciju = akcijaX > 0;
  const vinoJedinica = new Map(vina.map((v) => [v.naziv, v.zadanaJedinica || "kom"]));
  // Faza 7 - naziv vina -> id iz kataloga (za vezu stavke na zalihu)
  const vinoId = new Map(vina.map((v) => [v.naziv, v.id]));

  function azuriraj(key: number, polje: "naziv" | "jedinica" | "status", vrijednost: string) {
    setStavke((prev) =>
      prev.map((s) => (s.key === key ? { ...s, [polje]: vrijednost } : s))
    );
  }

  // Odabir vina iz izbornika ili "Ostalo (ručno)". Jedinica se auto-popuni iz kataloga.
  function postaviVino(key: number, vrijednost: string) {
    setStavke((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        // "Ostalo (ručno)" = slobodan unos, bez veze na katalog (artiklId prazan)
        if (vrijednost === OSTALO) return { ...s, rucno: true, naziv: "", artiklId: "" };
        const jed = vinoJedinica.get(vrijednost) || s.jedinica;
        return { ...s, rucno: false, naziv: vrijednost, jedinica: jed, artiklId: vinoId.get(vrijednost) || "" };
      })
    );
  }

  function azurirajPoklon(
    key: number,
    polje: "artiklId" | "kolicina" | "status",
    vrijednost: string
  ) {
    setPokloni((prev) =>
      prev.map((p) => (p.key === key ? { ...p, [polje]: vrijednost } : p))
    );
  }
  function dodajPoklon() {
    setPokloni((prev) => [...prev, noviPoklon()]);
  }
  function obrisiPoklon(key: number) {
    setPokloni((prev) => (prev.length === 1 ? prev : prev.filter((p) => p.key !== key)));
  }

  // Promjena količine: ako gratis nije ručno mijenjan, osvježi prijedlog.
  function postaviKolicinu(key: number, vrijednost: string) {
    setStavke((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const next = { ...s, kolicina: vrijednost };
        if (!s.gratisRucno) {
          next.gratis = String(predlozenGratis(vrijednost, akcijaX, akcijaY));
        }
        return next;
      })
    );
  }

  // Ručni override gratisa — od tada ne diramo automatski (radi UVIJEK, i kad je prijedlog 0).
  function postaviGratis(key: number, vrijednost: string) {
    setStavke((prev) =>
      prev.map((s) =>
        s.key === key ? { ...s, gratis: vrijednost, gratisRucno: true } : s
      )
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

        <p className="mb-2 text-[12px] text-stone-500">
          {imaAkciju
            ? `Gratis se predlaže iz zadnjeg dogovora (${akcijaX}+${akcijaY}); možeš ga ručno promijeniti.`
            : "Lokal nema dogovorenu akciju — prijedlog gratisa je 0, ali ga možeš ručno upisati."}
        </p>

        <div className="space-y-2">
          {stavke.map((s, index) => (
            <div
              key={s.key}
              className="grid gap-2 border border-orange-100 bg-white p-2 md:grid-cols-[1fr_90px_72px_120px_120px_auto]"
            >
              <div className="space-y-1">
                <select
                  value={s.rucno ? OSTALO : s.naziv}
                  onChange={(e) => postaviVino(s.key, e.target.value)}
                  className="w-full border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
                >
                  <option value="">{`Vino ${index + 1}…`}</option>
                  {vina.map((v) => (
                    <option key={v.id} value={v.naziv}>
                      {v.naziv}
                    </option>
                  ))}
                  <option value={OSTALO}>Ostalo (ručno)</option>
                </select>
                {s.rucno ? (
                  <input
                    value={s.naziv}
                    onChange={(e) => azuriraj(s.key, "naziv", e.target.value)}
                    placeholder="Upiši naziv vina"
                    className="w-full border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
                  />
                ) : null}
                <input type="hidden" name="stavkaNaziv" value={s.naziv} />
                <input type="hidden" name="stavkaArtiklId" value={s.artiklId} />
              </div>
              <input
                name="stavkaKolicina"
                value={s.kolicina}
                onChange={(e) => postaviKolicinu(s.key, e.target.value)}
                type="number"
                step="any"
                placeholder="Količina"
                className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
              />
              <select
                name="stavkaJedinica"
                value={s.jedinica === "L" ? "L" : "kom"}
                onChange={(e) => azuriraj(s.key, "jedinica", e.target.value)}
                className="border border-orange-200 bg-white px-2 py-2 text-[14px] outline-none focus:border-orange-400"
              >
                <option value="kom">kom</option>
                <option value="L">L</option>
              </select>
              <label className="flex items-center gap-1 border border-amber-300 bg-amber-50 px-2 text-[12px] font-semibold text-amber-900">
                <span className="shrink-0">Gratis</span>
                <input
                  name="stavkaGratis"
                  value={s.gratis}
                  onChange={(e) => postaviGratis(s.key, e.target.value)}
                  type="number"
                  min="0"
                  className="w-full bg-transparent py-2 text-[14px] text-stone-800 outline-none"
                />
              </label>
              <select
                name="stavkaStatus"
                value={s.status}
                onChange={(e) => azuriraj(s.key, "status", e.target.value)}
                title="Dati odmah ili pripremiti u vinariji"
                className="border border-orange-200 bg-white px-2 py-2 text-[13px] outline-none focus:border-orange-400"
              >
                <option value="PRIPREMITI">Pripremiti</option>
                <option value="ODMAH">Dati odmah</option>
              </select>
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-stone-800">Pokloni / promo materijal</h2>
          <button
            type="button"
            onClick={dodajPoklon}
            className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-3 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
          >
            + Dodaj poklon
          </button>
        </div>

        <p className="mb-2 text-[12px] text-stone-500">
          Otpisuje se iz promo zalihe (skida sa stanja, isto kao na /putnik/promo). Prazni redovi se ne spremaju.
        </p>

        {promoArtikli.length === 0 ? (
          <div className="border border-orange-200 bg-white px-3 py-2 text-[13px] text-stone-500">
            Nema aktivnih promo artikala. Level 1/2 ih dodaje na /putnik/promo.
          </div>
        ) : (
          <div className="space-y-2">
            {pokloni.map((p) => (
              <div
                key={p.key}
                className="grid gap-2 border border-orange-100 bg-white p-2 md:grid-cols-[1fr_110px_120px_auto]"
              >
                <select
                  name="poklonArtiklId"
                  value={p.artiklId}
                  onChange={(e) => azurirajPoklon(p.key, "artiklId", e.target.value)}
                  className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
                >
                  <option value="">Odaberi promo artikl…</option>
                  {promoArtikli.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.naziv}
                    </option>
                  ))}
                </select>
                <input
                  name="poklonKolicina"
                  value={p.kolicina}
                  onChange={(e) => azurirajPoklon(p.key, "kolicina", e.target.value)}
                  type="number"
                  placeholder="Količina"
                  className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
                />
                <select
                  name="poklonStatus"
                  value={p.status}
                  onChange={(e) => azurirajPoklon(p.key, "status", e.target.value)}
                  title="Dati odmah ili pripremiti u vinariji"
                  className="border border-orange-200 bg-white px-2 py-2 text-[13px] outline-none focus:border-orange-400"
                >
                  <option value="PRIPREMITI">Pripremiti</option>
                  <option value="ODMAH">Dati odmah</option>
                </select>
                <button
                  type="button"
                  onClick={() => obrisiPoklon(p.key)}
                  disabled={pokloni.length === 1}
                  className="border border-orange-200 bg-white px-3 py-2 text-[13px] font-semibold text-stone-600 hover:bg-orange-50 disabled:opacity-40"
                >
                  Ukloni
                </button>
              </div>
            ))}
          </div>
        )}
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
