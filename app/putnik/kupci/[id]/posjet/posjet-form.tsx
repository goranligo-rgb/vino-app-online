"use client";

import { useState } from "react";

type Artikl = { id: string; naziv: string };
type Vino = { id: string; naziv: string; zadanaJedinica?: string | null };

// Tip stavke = JASAN izbor po redu (jedan klik). Ispod haube ostaje POSTOJEĆI
// model (statusPripreme + kolicina + gratis) — mijenja se samo UI, ne obračun:
//   NARUDZBA → statusPripreme=PRIPREMITI, kolicina=X, gratis=0  (ne dira stanje auta)
//   PRODAJA  → statusPripreme=ODMAH,      kolicina=X, gratis=0  (skida s auta, naplata)
//   POKLON   → statusPripreme=(status),   kolicina=0, gratis=X  (skida kao gratis, bez naplate)
// Kod POKLON reda `status` se PAMTI iz baze da legacy "PRIPREMITI + gratis"
// (gratis boce uz isporuku) ostane egzaktan; novi poklon je ODMAH (iz auta).
type Tip = "NARUDZBA" | "PRODAJA" | "POKLON";

type Stavka = {
  key: number;
  naziv: string;
  artiklId: string; // Faza 7 - id vina iz kataloga ("" = slobodan unos, ne prati se u zalihi)
  rucno: boolean;
  kolicina: string; // jedna količina po redu (za POKLON = broj gratis komada)
  jedinica: string;
  tip: Tip;
  status: string; // izvorni statusPripreme (round-trip PRIPREMLJENO/ISPORUCENO/PRIPREMITI/ODMAH)
};

type Poklon = {
  key: number;
  artiklId: string;
  kolicina: string;
  status: string;
};

// Postojeći posjet za predpopunu kod izmjene (serializabilni oblik iz stranice).
type InitialStavka = {
  nazivProizvoda: string;
  artiklId: string | null;
  kolicina: number | null;
  jedinica: string | null;
  gratis: number;
  statusPripreme: string;
};
type InitialOtpis = {
  artiklId: string | null;
  kolicina: number;
  statusPripreme: string | null;
};
export type InitialPosjet = {
  id: string;
  datum: string | Date;
  ukupanDug: number | null; // zadržano u tipu (ne prikazuje se više na formi), da uredi-stranica ne puca
  dospjeliDug: number | null;
  biljeska: string | null;
  mjesto: string | null;
  vrijemeOd: string | null;
  vrijemeDo: string | null;
  tipObilaska: string | null;
  tipPremise: string | null;
  stanjeProizvoda: string | null;
  kilometri: number | null;
  cijena: string | null;
  problemi: string | null;
  aktDegustacija: boolean;
  aktVidljivost: boolean;
  aktSlaganjeRobe: boolean;
  aktIstaknuteCijene: boolean;
  aktAkcijskaCijena: boolean;
  stavke: InitialStavka[];
  promoOtpisi: InitialOtpis[];
};

const OSTALO = "__OSTALO__";
const PREP_STATUSI = ["PRIPREMITI", "PRIPREMLJENO", "ISPORUCENO"];

function jePrep(status: string) {
  return PREP_STATUSI.includes(status);
}

// Status koji red dobije kad korisnik KLIKNE tip (svjesna reklasifikacija):
//  - NARUDZBA: zadrži prep-status ako već je prep (ne gubi PRIPREMLJENO/ISPORUCENO), inače PRIPREMITI
//  - PRODAJA / POKLON: ODMAH (iz auta)
function statusZaTip(tip: Tip, trenutni: string): string {
  if (tip === "NARUDZBA") return jePrep(trenutni) ? trenutni : "PRIPREMITI";
  return "ODMAH";
}

// Podaci koje red šalje serveru (ista polja kao dosad — server se NE mijenja).
function izlazStavke(s: Stavka) {
  const jePoklon = s.tip === "POKLON";
  return {
    kolicina: jePoklon ? "0" : s.kolicina,
    gratis: jePoklon ? s.kolicina || "0" : "0",
    status: s.status,
  };
}

function toDateInput(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

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
    tip: "NARUDZBA",
    status: "PRIPREMITI",
  };
}

// Stavke iz postojećeg posjeta. Red s kolicina>0 I gratis>0 se RAZDVAJA u dva
// reda (glavni + POKLON), oba čuvaju izvorni status → egzaktan round-trip.
function stavkeIzInitial(initial?: InitialPosjet): Stavka[] {
  if (!initial || initial.stavke.length === 0) return [novaStavka()];

  const redovi: Stavka[] = [];
  for (const st of initial.stavke) {
    const status = st.statusPripreme || "PRIPREMITI";
    const jedinica = st.jedinica === "L" ? "L" : "kom";
    const kol = st.kolicina ?? 0;
    const gratis = st.gratis ?? 0;
    const glavniTip: Tip = jePrep(status) ? "NARUDZBA" : "PRODAJA";

    // Glavni dio (prodaja/narudžba) — preskoči ako je red ČISTI poklon (kol 0, gratis>0).
    if (kol > 0 || gratis <= 0) {
      brojac += 1;
      redovi.push({
        key: brojac,
        naziv: st.nazivProizvoda,
        artiklId: st.artiklId || "",
        rucno: !st.artiklId,
        kolicina: st.kolicina != null ? String(st.kolicina) : "",
        jedinica,
        tip: glavniTip,
        status,
      });
    }

    // Poklon dio — zadrži izvorni status (legacy PRIPREMITI+gratis ostaje egzaktan).
    if (gratis > 0) {
      brojac += 1;
      redovi.push({
        key: brojac,
        naziv: st.nazivProizvoda,
        artiklId: st.artiklId || "",
        rucno: !st.artiklId,
        kolicina: String(gratis),
        jedinica,
        tip: "POKLON",
        status,
      });
    }
  }

  return redovi.length ? redovi : [novaStavka()];
}

let brojacP = 0;
function noviPoklon(): Poklon {
  brojacP += 1;
  return { key: brojacP, artiklId: "", kolicina: "", status: "PRIPREMITI" };
}

function pokloniIzInitial(initial?: InitialPosjet): Poklon[] {
  if (!initial || initial.promoOtpisi.length === 0) return [noviPoklon()];
  return initial.promoOtpisi.map((o) => {
    brojacP += 1;
    return {
      key: brojacP,
      artiklId: o.artiklId || "",
      kolicina: String(o.kolicina),
      status: o.statusPripreme || "PRIPREMITI",
    };
  });
}

function predlozenGratis(kolicina: string, akcijaX: number, akcijaY: number): number {
  if (akcijaX <= 0) return 0;
  const k = parseFloat(kolicina.replace(",", "."));
  if (!Number.isFinite(k) || k <= 0) return 0;
  return Math.floor(k / akcijaX) * akcijaY;
}

// Segmentirani izbornik tipa stavke (amber tema, jedan klik).
function TipIzbor({
  tip,
  onChange,
}: {
  tip: Tip;
  onChange: (t: Tip) => void;
}) {
  const opcije: { v: Tip; l: string; naslov: string }[] = [
    { v: "NARUDZBA", l: "Narudžba", naslov: "Dogovoreno za isporuku — ne dira stanje auta" },
    { v: "PRODAJA", l: "Prodaja", naslov: "Prodano odmah iz auta — skida sa stanja, naplaćuje se" },
    { v: "POKLON", l: "Poklon", naslov: "Dano besplatno — skida sa stanja kao gratis, bez naplate" },
  ];
  return (
    <div className="inline-flex overflow-hidden border border-orange-300 bg-white">
      {opcije.map((o, i) => {
        const aktivan = tip === o.v;
        return (
          <button
            key={o.v}
            type="button"
            title={o.naslov}
            onClick={() => onChange(o.v)}
            className={`px-3 py-2 text-[13px] font-semibold transition ${
              i > 0 ? "border-l border-orange-300" : ""
            } ${
              aktivan
                ? "bg-gradient-to-b from-orange-500 to-amber-600 text-white"
                : "bg-white text-stone-600 hover:bg-orange-50"
            }`}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

export default function PosjetForm({
  kupacId,
  danas,
  akcijaX,
  akcijaY,
  vina,
  promoArtikli,
  action,
  initial,
}: {
  kupacId: string;
  danas: string;
  akcijaX: number;
  akcijaY: number;
  vina: Vino[];
  promoArtikli: Artikl[];
  action: (formData: FormData) => void | Promise<void>;
  initial?: InitialPosjet;
}) {
  const jeUredi = Boolean(initial);
  const [stavke, setStavke] = useState<Stavka[]>(() => stavkeIzInitial(initial));
  const [pokloni, setPokloni] = useState<Poklon[]>(() => pokloniIzInitial(initial));

  const imaAkciju = akcijaX > 0;
  const vinoJedinica = new Map(vina.map((v) => [v.naziv, v.zadanaJedinica || "kom"]));
  // Faza 7 - naziv vina -> id iz kataloga (za vezu stavke na zalihu)
  const vinoId = new Map(vina.map((v) => [v.naziv, v.id]));

  // Teren panel otvori kad već ima unesenih podataka (izmjena).
  const terenImaPodatke = Boolean(
    initial &&
      (initial.mjesto ||
        initial.vrijemeOd ||
        initial.vrijemeDo ||
        initial.tipObilaska ||
        initial.tipPremise ||
        initial.stanjeProizvoda ||
        initial.kilometri != null ||
        initial.cijena ||
        initial.problemi ||
        initial.aktDegustacija ||
        initial.aktVidljivost ||
        initial.aktSlaganjeRobe ||
        initial.aktIstaknuteCijene ||
        initial.aktAkcijskaCijena)
  );

  function azuriraj(key: number, polje: "naziv" | "jedinica" | "kolicina", vrijednost: string) {
    setStavke((prev) =>
      prev.map((s) => (s.key === key ? { ...s, [polje]: vrijednost } : s))
    );
  }

  function postaviTip(key: number, tip: Tip) {
    setStavke((prev) =>
      prev.map((s) => (s.key === key ? { ...s, tip, status: statusZaTip(tip, s.status) } : s))
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

  function dodajRed() {
    setStavke((prev) => [...prev, novaStavka()]);
  }

  function obrisiRed(key: number) {
    setStavke((prev) =>
      prev.length === 1 ? prev : prev.filter((s) => s.key !== key)
    );
  }

  // Akcija X+Y: iz PRODAJA/NARUDŽBA reda dodaj zaseban POKLON red s predloženim gratisom.
  function dodajPoklonZaAkciju(izvor: Stavka, predlozeno: number) {
    setStavke((prev) => {
      const idx = prev.findIndex((s) => s.key === izvor.key);
      brojac += 1;
      const poklonRed: Stavka = {
        key: brojac,
        naziv: izvor.naziv,
        artiklId: izvor.artiklId,
        rucno: izvor.rucno,
        kolicina: String(predlozeno),
        jedinica: izvor.jedinica,
        tip: "POKLON",
        status: "ODMAH",
      };
      const kopija = [...prev];
      kopija.splice(idx + 1, 0, poklonRed);
      return kopija;
    });
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

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kupacId" value={kupacId} />
      {initial ? <input type="hidden" name="posjetId" value={initial.id} /> : null}

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
              defaultValue={initial ? toDateInput(initial.datum) : danas}
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

        <div className="mb-3 grid gap-1 text-[12px] text-stone-500 sm:grid-cols-3">
          <span><strong className="text-stone-700">Narudžba</strong> — dogovoreno za isporuku (ne dira auto)</span>
          <span><strong className="text-stone-700">Prodaja</strong> — prodano odmah iz auta (naplata)</span>
          <span><strong className="text-stone-700">Poklon</strong> — dano besplatno (gratis, bez naplate)</span>
        </div>

        <div className="space-y-2">
          {stavke.map((s, index) => {
            const predlozeno = predlozenGratis(s.kolicina, akcijaX, akcijaY);
            const prikaziAkciju = imaAkciju && s.tip !== "POKLON" && predlozeno > 0;
            const izlaz = izlazStavke(s);
            return (
              <div
                key={s.key}
                className="border border-orange-100 bg-white p-2"
              >
                <div className="grid gap-2 md:grid-cols-[1fr_auto_90px_72px_auto] md:items-start">
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
                    {/* Skrivena polja = POSTOJEĆI model (server nepromijenjen) */}
                    <input type="hidden" name="stavkaNaziv" value={s.naziv} />
                    <input type="hidden" name="stavkaArtiklId" value={s.artiklId} />
                    <input type="hidden" name="stavkaKolicina" value={izlaz.kolicina} />
                    <input type="hidden" name="stavkaGratis" value={izlaz.gratis} />
                    <input type="hidden" name="stavkaStatus" value={izlaz.status} />
                  </div>

                  <TipIzbor tip={s.tip} onChange={(t) => postaviTip(s.key, t)} />

                  <input
                    value={s.kolicina}
                    onChange={(e) => azuriraj(s.key, "kolicina", e.target.value)}
                    type="number"
                    step="any"
                    min="0"
                    placeholder={s.tip === "POKLON" ? "Gratis" : "Količina"}
                    className="border border-orange-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-orange-400"
                  />
                  <select
                    value={s.jedinica === "L" ? "L" : "kom"}
                    onChange={(e) => azuriraj(s.key, "jedinica", e.target.value)}
                    className="border border-orange-200 bg-white px-2 py-2 text-[14px] outline-none focus:border-orange-400"
                  >
                    <option value="kom">kom</option>
                    <option value="L">L</option>
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

                {prikaziAkciju ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-orange-100 pt-2 text-[12px] text-amber-900">
                    <span>
                      Akcija {akcijaX}+{akcijaY} → poklon <strong>{predlozeno}</strong> {s.jedinica}
                    </span>
                    <button
                      type="button"
                      onClick={() => dodajPoklonZaAkciju(s, predlozeno)}
                      className="border border-amber-300 bg-amber-50 px-2 py-1 font-semibold text-amber-900 hover:brightness-105"
                    >
                      + Dodaj poklon {predlozeno}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-[12px] text-stone-500">
          {imaAkciju
            ? `Lokal ima dogovorenu akciju ${akcijaX}+${akcijaY} — kod prodaje/narudžbe ponudi se dodavanje poklona jednim klikom.`
            : "Prazni redovi (bez naziva proizvoda) se ne spremaju."}
        </p>
      </div>

      <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-stone-800">Promo materijal (pokloni lokalu)</h2>
          <button
            type="button"
            onClick={dodajPoklon}
            className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-3 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
          >
            + Dodaj promo
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
                  {p.status === "PRIPREMLJENO" ? <option value="PRIPREMLJENO">Pripremljeno (zadrži)</option> : null}
                  {p.status === "ISPORUCENO" ? <option value="ISPORUCENO">Isporučeno (zadrži)</option> : null}
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
          Zabilješke
        </h2>

        <div>
          <label className="mb-1 block text-[13px] font-semibold text-stone-700">
            Zabilješke
          </label>
          <textarea
            name="biljeska"
            rows={5}
            defaultValue={initial?.biljeska ?? undefined}
            className="w-full resize-y border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            placeholder="Što je dogovoreno, stanje na terenu, problemi..."
          />
        </div>
      </div>

      <details
        open={terenImaPodatke}
        className="group border border-orange-200 bg-gradient-to-b from-white to-orange-50"
      >
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
                defaultValue={initial?.mjesto ?? undefined}
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
                defaultValue={initial?.vrijemeOd ?? undefined}
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
                defaultValue={initial?.vrijemeDo ?? undefined}
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
                defaultValue={initial?.tipObilaska ?? ""}
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
                defaultValue={initial?.tipPremise ?? ""}
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
                defaultValue={initial?.stanjeProizvoda ?? ""}
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
                { name: "aktDegustacija", label: "Degustacija", checked: !!initial?.aktDegustacija },
                { name: "aktVidljivost", label: "Vidljivost", checked: !!initial?.aktVidljivost },
                { name: "aktSlaganjeRobe", label: "Slaganje robe", checked: !!initial?.aktSlaganjeRobe },
                { name: "aktIstaknuteCijene", label: "Istaknute cijene", checked: !!initial?.aktIstaknuteCijene },
                { name: "aktAkcijskaCijena", label: "Akcijska cijena", checked: !!initial?.aktAkcijskaCijena },
              ].map((a) => (
                <label
                  key={a.name}
                  className="flex min-h-[48px] cursor-pointer items-center gap-3 border border-orange-200 bg-white px-3 py-3 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
                >
                  <input
                    name={a.name}
                    type="checkbox"
                    defaultChecked={a.checked}
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
                defaultValue={initial?.cijena ?? undefined}
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
                defaultValue={initial?.kilometri != null ? String(initial.kilometri) : undefined}
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
              defaultValue={initial?.problemi ?? undefined}
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
          {jeUredi ? "Spremi izmjene posjeta" : "Spremi posjet"}
        </button>
      </div>
    </form>
  );
}
