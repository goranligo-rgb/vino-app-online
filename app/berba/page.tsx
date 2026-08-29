"use client";

/**
 * IZVJESTAJ O BERBI — cita knjigu berbe (`/api/berba`), ne punjenja.
 *
 * SAMO ONO STO JE USLO
 * --------------------
 * Sorta, kilogrami, litre, datum berbe, polozaj, secer, kiseline, pH, oznaka i
 * tankovi u koje je usla — jedna berba smije uci u vise njih (samotok u jedan,
 * presovina u drugi). Sve su to podaci o TRENUTKU ULASKA u podrum i ne
 * mijenjaju se
 * nikad: berba 2026 je 15.650 L i nakon sto je pola prodano ili napunjeno u
 * boce.
 *
 * KAMO JE VINO POSLIJE OTISLO OVDJE NE PISE. To je stanje vina, ne podatak o
 * berbi, i vec ima svoje mjesto — monitor tanka i pracenje vina. Knjiga
 * kretanja (`gdjeJeSveBerbe` u lib/berba-model.ts) i dalje sve to zna; ova je
 * stranica samo ne pita.
 *
 * ZATECENO
 * --------
 * `vrstaUnosa = ZATECENO` nije berba nego rekonstrukcija: staro arhiviranje
 * brisalo je punjenja, pa knjiga za dio vina zna kolicinu ali ne i podrijetlo.
 * Takvi zapisi imaju vlastiti odjeljak i ZADANO NE ulaze u zbrojeve — inace bi
 * berba 2026 ispala 127.935 L umjesto 15.650 L, a najveca "sorta" u podrumu
 * zvala bi se "Nepoznato podrijetlo". Prekidac ih moze ukljuciti, i tada su
 * kartice vidljivo oznacene.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { opisMaceracije, hrvatskiOblik } from "@/lib/berba-polja";

type Berba = {
  id: string;
  vrstaUnosa: "BERBA" | "ZATECENO";
  nazivSorte: string;
  sortaId: string | null;

  datumBerbe: string | null;
  datumUlaska: string | null;

  godina: number | null;
  godinaUpisana: number | null;
  godinaIzvedena: boolean;

  kolicinaLitara: number;
  kolicinaKgGrozdja: number | null;

  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;

  secer: number | null;
  kiseline: number | null;
  ph: number | null;

  maceracija: boolean | null;
  maceracijaSati: number | null;

  napomena: string | null;
  ispravljenoAt: string | null;
  razlogIspravka: string | null;

  prviTankId: string | null;
  prviTankBroj: number | null;
  /**
   * SVI tankovi u koje je berba USLA, s litrama po tanku, od najveceg dijela.
   *
   * Jedna berba smije uci u vise tankova — samotok u jedan, presovina u drugi
   * — pa je `prviTankBroj` samo "jedan od". Filtri i ispis idu po ovom popisu.
   * Gdje je USLO, ne gdje JEST danas: pretok i izlaz ovo ne mijenjaju.
   */
  tankovi: Array<{ tankId: string; broj: number | null; litre: number }>;
  izvornaPunjenjeStavkaId: string | null;
};

/**
 * Prosjek uvijek nosi `n` — iz koliko je zapisa izracunat.
 *
 * Bez toga prosjek nad dva zapisa izgleda jednako pouzdano kao nad dvjesto, a
 * upravo je to stanje na terenu: secer/kiseline/pH postoje na dva od trideset
 * dva zapisa. Obican broj bez `n` bio bi tvrdnja koju podaci ne pokrivaju.
 */
type Prosjek = {
  vrijednost: number | null;
  /** Koliko zapisa ima taj podatak. */
  n: number;
  /** Koliko ih je ukupno u grupi. */
  od: number;
};

type SazetakGodine = {
  litara: number;
  kg: number;
  sorte: number;
  zapisa: number;
  secer: Prosjek;
  kiseline: Prosjek;
  ph: Prosjek;
};

type SortaPoGodinama = {
  sorta: string;
  poGodinama: Record<string, SazetakGodine>;
};

const BEZ_GODISTA = "bez-godista";

/**
 * Brojevi svih tankova u koje je berba usla.
 *
 * Rezerva na `prviTankBroj` je za zapise ciji ULAZ retci nemaju upisan tank —
 * takvih ima iz backfilla. Bez nje bi ispali iz filtra po tanku, koji je dosad
 * radio bas po tom polju.
 */
function brojeviTankova(b: Berba): number[] {
  const iz = b.tankovi
    .map((t) => t.broj)
    .filter((n): n is number => n !== null && n !== undefined);

  if (iz.length > 0) return iz;

  return b.prviTankBroj != null ? [b.prviTankBroj] : [];
}

function formatBroj(v?: number | null, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatDatum(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("hr-HR");
}

function uniqueSorted(values: (string | number | null | undefined)[]) {
  return [
    ...new Set(
      values
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(String)
    ),
  ].sort((a, b) => a.localeCompare(b, "hr"));
}

/** Kljuc godine za filtar. Zapis bez godine ima vlastitu ladicu, ne ispada. */
function kljucGodine(b: Berba): string {
  return b.godina == null ? BEZ_GODISTA : String(b.godina);
}

function izracunajProsjek(
  zapisi: Berba[],
  polje: "secer" | "kiseline" | "ph"
): Prosjek {
  const sVrijednoscu = zapisi.filter((z) => z[polje] != null);

  if (sVrijednoscu.length === 0) {
    return { vrijednost: null, n: 0, od: zapisi.length };
  }

  const zbroj = sVrijednoscu.reduce((s, z) => s + Number(z[polje]), 0);

  return {
    vrijednost: zbroj / sVrijednoscu.length,
    n: sVrijednoscu.length,
    od: zapisi.length,
  };
}

function izracunajSazetak(zapisi: Berba[]): SazetakGodine {
  return {
    litara: zapisi.reduce((s, z) => s + (z.kolicinaLitara || 0), 0),
    kg: zapisi.reduce((s, z) => s + (z.kolicinaKgGrozdja || 0), 0),
    sorte: new Set(zapisi.map((z) => z.nazivSorte).filter(Boolean)).size,
    zapisa: zapisi.length,
    secer: izracunajProsjek(zapisi, "secer"),
    kiseline: izracunajProsjek(zapisi, "kiseline"),
    ph: izracunajProsjek(zapisi, "ph"),
  };
}

function KarticaBroj({
  naslov,
  vrijednost,
  podnaslov,
}: {
  naslov: string;
  vrijednost: string;
  podnaslov?: string;
}) {
  return (
    <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/70 px-4 py-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
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

/** Prosjek s brojem zapisa ispod. "—" kad ga nema iz cega izracunati. */
function KarticaProsjek({
  naslov,
  p,
  digits = 2,
}: {
  naslov: string;
  p: Prosjek;
  digits?: number;
}) {
  return (
    <KarticaBroj
      naslov={naslov}
      vrijednost={p.vrijednost == null ? "—" : formatBroj(p.vrijednost, digits)}
      podnaslov={
        p.vrijednost == null
          ? `nema podatka ni na jednom od ${p.od}`
          : `iz ${p.n} od ${p.od} zapisa`
      }
    />
  );
}

function Oznaka({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "soft" | "strong" | "upozorenje";
}) {
  const cls =
    variant === "strong"
      ? "border-emerald-300 bg-gradient-to-b from-emerald-100 to-lime-100 text-emerald-950"
      : variant === "soft"
      ? "border-lime-200 bg-lime-50 text-lime-800"
      : variant === "upozorenje"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <span className={`inline-flex border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Polje({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-emerald-100 bg-white px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-stone-400">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-medium text-stone-700">
        {value || "-"}
      </div>
    </div>
  );
}

export default function BerbaPage() {
  const [sve, setSve] = useState<Berba[]>([]);
  const [loading, setLoading] = useState(true);
  const [greska, setGreska] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [aktivnaGodina, setAktivnaGodina] = useState("");
  const [otvoriUsporedbu, setOtvoriUsporedbu] = useState(false);
  const [godineUsporedba, setGodineUsporedba] = useState<string[]>([]);

  // ZADANO ISKLJUCEN. Vidi zaglavlje datoteke.
  const [ukljuciZateceno, setUkljuciZateceno] = useState(false);

  const [filterSorta, setFilterSorta] = useState("");
  const [filterTank, setFilterTank] = useState("");
  const [filterTekst, setFilterTekst] = useState("");

  async function ucitaj() {
    try {
      setLoading(true);
      setGreska("");

      const res = await fetch("/api/berba", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setGreska(json?.error || "Greška kod dohvaćanja podataka.");
        setSve([]);
        return;
      }

      setSve(Array.isArray(json?.berbe) ? json.berbe : []);
    } catch (error) {
      console.error(error);
      setGreska("Greška kod dohvaćanja podataka o berbi.");
      setSve([]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Brisanje ide na stavku punjenja iz koje je zapis nastao. Ruta poslije toga
   * povlaci BAS TU berbu iz knjige i oznaci je obrisanom — ali samo dok je jos
   * cijela u svom tanku. Ako je dio pretocen dalje, vraca 400 s uputom, i to se
   * pokazuje korisniku umjesto tihog neuspjeha.
   */
  async function obrisiBerbu(b: Berba) {
    if (!b.izvornaPunjenjeStavkaId) return;

    const potvrda = window.confirm(
      `Obrisati zapis berbe „${b.nazivSorte}” (${formatBroj(
        b.kolicinaLitara,
        0
      )} L)?\n\n` +
        "Ovo znači da unos NIJE BIO TOČAN — to vino se povlači iz knjige. " +
        "Ako je vino stvarno otišlo iz tanka, ovo nije prava radnja."
    );
    if (!potvrda) return;

    try {
      setDeletingId(b.id);

      const res = await fetch(
        `/api/punjenje-stavka/${b.izvornaPunjenjeStavkaId}`,
        { method: "DELETE" }
      );

      const json = await res.json();

      if (!res.ok) {
        alert(json?.error || "Greška kod brisanja stavke.");
        return;
      }

      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error(error);
      alert("Greška kod brisanja stavke.");
    } finally {
      setDeletingId("");
    }
  }

  useEffect(() => {
    ucitaj();
  }, [refreshKey]);

  // --- razdvajanje: berba vs zateceno -------------------------------------

  const berbe = useMemo(
    () => sve.filter((b) => b.vrstaUnosa === "BERBA"),
    [sve]
  );

  const zatecene = useMemo(
    () => sve.filter((b) => b.vrstaUnosa === "ZATECENO"),
    [sve]
  );

  /** Podloga za SVE zbrojeve. Zateceno ulazi samo ako je prekidac ukljucen. */
  const podloga = useMemo(
    () => (ukljuciZateceno ? sve : berbe),
    [sve, berbe, ukljuciZateceno]
  );

  // --- godine --------------------------------------------------------------

  const godine = useMemo(() => {
    const kljucevi = new Set(podloga.map(kljucGodine));
    const brojcane = [...kljucevi]
      .filter((k) => k !== BEZ_GODISTA)
      .sort((a, b) => Number(b) - Number(a));

    return kljucevi.has(BEZ_GODISTA) ? [...brojcane, BEZ_GODISTA] : brojcane;
  }, [podloga]);

  const nazivGodine = (k: string) =>
    k === BEZ_GODISTA ? "Bez godišta" : `Berba ${k}`;

  useEffect(() => {
    if (godine.length === 0) return;
    if (!aktivnaGodina || !godine.includes(aktivnaGodina)) {
      setAktivnaGodina(godine[0]);
    }
  }, [godine, aktivnaGodina]);

  useEffect(() => {
    if (aktivnaGodina && godineUsporedba.length === 0) {
      setGodineUsporedba([aktivnaGodina]);
    }
  }, [aktivnaGodina, godineUsporedba.length]);

  const uGodini = useMemo(() => {
    if (!aktivnaGodina) return podloga;
    return podloga.filter((b) => kljucGodine(b) === aktivnaGodina);
  }, [podloga, aktivnaGodina]);

  // --- filtri --------------------------------------------------------------

  const filtrirani = useMemo(() => {
    const tekst = filterTekst.trim().toLowerCase();

    return uGodini.filter((b) => {
      if (filterSorta && b.nazivSorte !== filterSorta) return false;
      // Filtar po tanku gleda SVE tankove berbe, ne samo prvi. Inace bi berba
      // razlivena u T5 i T7 ispala iz filtra "T7", iako je pola nje ondje.
      if (
        filterTank &&
        !brojeviTankova(b).some((n) => String(n) === filterTank)
      ) {
        return false;
      }

      if (tekst) {
        const haystack = [
          b.nazivSorte,
          b.polozaj,
          b.oznakaBerbe,
          b.vinograd,
          b.napomena,
          brojeviTankova(b).join(" "),
          String(b.godina ?? ""),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(tekst)) return false;
      }

      return true;
    });
  }, [uGodini, filterSorta, filterTank, filterTekst]);

  const sorte = useMemo(
    () => uniqueSorted(uGodini.map((b) => b.nazivSorte)),
    [uGodini]
  );

  const tankovi = useMemo(
    () => uniqueSorted(uGodini.flatMap((b) => brojeviTankova(b))),
    [uGodini]
  );

  // --- sazetak -------------------------------------------------------------

  const sazetak = useMemo(() => izracunajSazetak(filtrirani), [filtrirani]);

  const najzastupljenijaSorta = useMemo(() => {
    const poSorti = new Map<string, number>();
    for (const b of filtrirani) {
      poSorti.set(
        b.nazivSorte,
        (poSorti.get(b.nazivSorte) ?? 0) + (b.kolicinaLitara || 0)
      );
    }
    return [...poSorti.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
  }, [filtrirani]);

  // --- razrade -------------------------------------------------------------

  const poSorti = useMemo(() => {
    const grupe = new Map<string, Berba[]>();

    for (const b of filtrirani) {
      const k = b.nazivSorte || "Nepoznato";
      grupe.set(k, [...(grupe.get(k) ?? []), b]);
    }

    return [...grupe.entries()]
      .map(([sorta, zapisi]) => ({ sorta, ...izracunajSazetak(zapisi) }))
      .sort((a, b) => b.litara - a.litara);
  }, [filtrirani]);

  /**
   * Razrada po POLOZAJU. Jedna, ne dvije.
   *
   * `polozaj` i `parcela` nose isti broj — to je interna sifra polozaja. Dvije
   * razrade iz istog podatka bile bi dvije tablice s istim brojkama. `parcela`
   * ostaje u bazi i u odgovoru, samo se ne razradjuje zasebno.
   */
  const poPolozaju = useMemo(() => {
    const grupe = new Map<string, Berba[]>();

    for (const b of filtrirani) {
      const k = String(b.polozaj ?? "").trim() || "bez položaja";
      grupe.set(k, [...(grupe.get(k) ?? []), b]);
    }

    return [...grupe.entries()]
      .map(([polozaj, zapisi]) => ({
        polozaj,
        // Ne "sorte": `izracunajSazetak` vec vraca polje tog imena kao BROJ
        // razlicitih sorti, pa bi ga spread nize prepisao.
        naziviSorti: uniqueSorted(zapisi.map((z) => z.nazivSorte)),
        ...izracunajSazetak(zapisi),
      }))
      .sort((a, b) => {
        // "bez položaja" uvijek na dno — to je odsutnost podatka, ne položaj.
        if (a.polozaj === "bez položaja") return 1;
        if (b.polozaj === "bez položaja") return -1;
        return b.litara - a.litara;
      });
  }, [filtrirani]);

  // --- usporedba godina ----------------------------------------------------

  const usporedbaUkupno = useMemo<Record<string, SazetakGodine>>(() => {
    const r: Record<string, SazetakGodine> = {};
    for (const g of godineUsporedba) {
      r[g] = izracunajSazetak(podloga.filter((b) => kljucGodine(b) === g));
    }
    return r;
  }, [podloga, godineUsporedba]);

  const usporedbaPoSortama = useMemo<SortaPoGodinama[]>(() => {
    const sveSorte = uniqueSorted(
      podloga
        .filter((b) => godineUsporedba.includes(kljucGodine(b)))
        .map((b) => b.nazivSorte)
    );

    return sveSorte
      .map((sorta) => {
        const poGodinama: Record<string, SazetakGodine> = {};

        for (const g of godineUsporedba) {
          poGodinama[g] = izracunajSazetak(
            podloga.filter(
              (b) => kljucGodine(b) === g && b.nazivSorte === sorta
            )
          );
        }

        return { sorta, poGodinama };
      })
      .sort((a, b) => {
        const zbroj = (x: SortaPoGodinama) =>
          godineUsporedba.reduce((s, g) => s + (x.poGodinama[g]?.litara || 0), 0);
        return zbroj(b) - zbroj(a);
      });
  }, [podloga, godineUsporedba]);

  const detalji = useMemo(
    () =>
      [...filtrirani].sort((a, b) => {
        const da = a.datumBerbe ?? a.datumUlaska ?? "";
        const db = b.datumBerbe ?? b.datumUlaska ?? "";
        return db.localeCompare(da);
      }),
    [filtrirani]
  );

  const zateceneUGodini = useMemo(() => {
    if (!aktivnaGodina) return zatecene;
    return zatecene.filter((b) => kljucGodine(b) === aktivnaGodina);
  }, [zatecene, aktivnaGodina]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f6f2_0%,#eef5ef_45%,#eaf3ed_100%)] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1540px]">
        <div className="mb-4 border border-emerald-200 bg-gradient-to-r from-emerald-950/95 via-emerald-900/90 to-lime-900/80 px-5 py-6 text-white shadow-[0_18px_36px_rgba(22,101,52,0.14)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/65">
                VINOGRAD / BERBA
              </div>
              <h1 className="mt-1 text-[30px] font-semibold tracking-tight">
                Izvještaj o berbi
              </h1>
              <p className="mt-2 max-w-[860px] text-[14px] leading-6 text-white/80">
                Koliko je ubrano, po sortama i položajima. Količine su
                povijesna činjenica i ne mijenjaju se kad vino ode iz tanka.
                Kamo je poslije otišlo vidi se u monitoru tanka i praćenju
                vina — to je stanje vina, ne podatak o berbi.
              </p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/dashboard"
                className="border border-white/20 bg-white/90 px-4 py-2 text-[13px] font-medium text-stone-700 transition hover:bg-white"
              >
                Natrag
              </Link>

              <Link
                href="/punjenje"
                className="border border-lime-300/40 bg-gradient-to-b from-lime-200 to-emerald-100 px-4 py-2 text-[13px] font-semibold text-emerald-950 transition hover:brightness-105"
              >
                Novo punjenje
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-4 border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/70 p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                Aktivna berba
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <select
                  value={aktivnaGodina}
                  onChange={(e) => {
                    setAktivnaGodina(e.target.value);
                    setFilterSorta("");
                    setFilterTank("");
                    setFilterTekst("");
                  }}
                  className="border border-emerald-300 bg-white px-4 py-3 text-[18px] font-semibold text-stone-800 outline-none focus:border-emerald-500"
                >
                  {godine.map((g) => (
                    <option key={g} value={g}>
                      {nazivGodine(g)}
                    </option>
                  ))}
                </select>

                {aktivnaGodina === BEZ_GODISTA ? (
                  <Oznaka variant="upozorenje">Zapisi bez godišta</Oznaka>
                ) : aktivnaGodina ? (
                  <Oznaka variant="strong">Godina {aktivnaGodina}</Oznaka>
                ) : null}

                {uGodini.some((b) => b.godinaIzvedena) ? (
                  <Oznaka variant="soft">
                    {uGodini.filter((b) => b.godinaIzvedena).length} zapisa bez
                    upisanog godišta — godina izvedena iz datuma ulaska u podrum
                  </Oznaka>
                ) : null}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 border border-emerald-200 bg-white px-3 py-2 text-[13px] text-stone-700">
              <input
                type="checkbox"
                checked={ukljuciZateceno}
                onChange={(e) => setUkljuciZateceno(e.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
              Uključi zatečeno u zbrojeve
            </label>
          </div>

          {ukljuciZateceno ? (
            <div className="mb-3 border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Zbrojevi ispod uključuju i <strong>zatečeno vino</strong> — ono
              kojemu knjiga zna količinu ali ne i podrijetlo. To više nije
              statistika berbe.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
            <KarticaBroj
              naslov="Ubrano litara"
              vrijednost={`${formatBroj(sazetak.litara, 0)} L`}
              podnaslov="ne mijenja se kad vino ode"
            />
            <KarticaBroj
              naslov="Ubrano kg grožđa"
              vrijednost={`${formatBroj(sazetak.kg, 0)} kg`}
            />
            <KarticaBroj
              naslov="Zapisa berbe"
              vrijednost={String(sazetak.zapisa)}
            />
            <KarticaBroj naslov="Sorte" vrijednost={String(sazetak.sorte)} />
            <KarticaProsjek naslov="Prosječni šećer" p={sazetak.secer} />
            <KarticaProsjek naslov="Prosječne kiseline" p={sazetak.kiseline} />
            <KarticaBroj
              naslov="Prosječni pH"
              vrijednost={
                sazetak.ph.vrijednost == null
                  ? "—"
                  : formatBroj(sazetak.ph.vrijednost, 2)
              }
              podnaslov={
                najzastupljenijaSorta !== "-"
                  ? `glavna sorta: ${najzastupljenijaSorta}`
                  : undefined
              }
            />
          </div>
        </div>

        <div className="mb-4 border border-emerald-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                Usporedba berbi
              </div>
              <div className="mt-1 text-[14px] text-stone-700">
                Najprije ukupna usporedba godišta, a ispod detaljno po sortama.
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setOtvoriUsporedbu((prev) => {
                  const next = !prev;
                  if (!prev && aktivnaGodina && godineUsporedba.length === 0) {
                    setGodineUsporedba([aktivnaGodina]);
                  }
                  return next;
                });
              }}
              className="border border-emerald-300 bg-gradient-to-b from-emerald-100 to-lime-100 px-4 py-2 text-[13px] font-semibold text-emerald-950 transition hover:brightness-105"
            >
              {otvoriUsporedbu ? "Zatvori usporedbu" : "Usporedi berbe"}
            </button>
          </div>
        </div>

        {otvoriUsporedbu && (
          <div className="mb-4 border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
            <div className="mb-3 text-[16px] font-semibold text-stone-800">
              Odaberi godišta za usporedbu
            </div>

            {godine.length < 2 ? (
              <div className="mb-4 border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                Knjiga zasad ima samo jedno godište, pa usporedba pokazuje jedan
                stupac. Starije berbe nisu sačuvane — staro arhiviranje brisalo
                je punjenja.
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap gap-2">
              {godine.map((g) => {
                const aktivno = godineUsporedba.includes(g);

                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      setGodineUsporedba((prev) =>
                        prev.includes(g)
                          ? prev.filter((x) => x !== g)
                          : [...prev, g].sort((a, b) => {
                              if (a === BEZ_GODISTA) return 1;
                              if (b === BEZ_GODISTA) return -1;
                              return Number(b) - Number(a);
                            })
                      )
                    }
                    className={`border px-4 py-2 text-[13px] font-medium transition ${
                      aktivno
                        ? "border-emerald-400 bg-gradient-to-b from-emerald-100 to-lime-100 text-emerald-950"
                        : "border-emerald-200 bg-white text-stone-600 hover:bg-emerald-50"
                    }`}
                  >
                    {nazivGodine(g)}
                  </button>
                );
              })}
            </div>

            {godineUsporedba.length === 0 ? (
              <div className="text-[13px] text-stone-500">
                Odaberi barem jedno godište za usporedbu.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-emerald-200 bg-white">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-emerald-100/70 text-left text-[12px] uppercase tracking-[0.12em] text-emerald-900">
                        <th className="border border-emerald-200 px-3 py-2">
                          Ukupno
                        </th>
                        {godineUsporedba.map((g) => (
                          <th key={g} className="border border-emerald-200 px-3 py-2">
                            {nazivGodine(g)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Ubrano litara", (d: SazetakGodine) => `${formatBroj(d.litara, 0)} L`],
                          ["Ubrano kg grožđa", (d: SazetakGodine) => `${formatBroj(d.kg, 0)} kg`],
                          ["Zapisa berbe", (d: SazetakGodine) => String(d.zapisa)],
                          ["Sorti", (d: SazetakGodine) => String(d.sorte)],
                          [
                            "Prosječni šećer",
                            (d: SazetakGodine) =>
                              d.secer.vrijednost == null
                                ? "—"
                                : `${formatBroj(d.secer.vrijednost, 2)} (n=${d.secer.n})`,
                          ],
                          [
                            "Prosječne kiseline",
                            (d: SazetakGodine) =>
                              d.kiseline.vrijednost == null
                                ? "—"
                                : `${formatBroj(d.kiseline.vrijednost, 2)} (n=${d.kiseline.n})`,
                          ],
                          [
                            "Prosječni pH",
                            (d: SazetakGodine) =>
                              d.ph.vrijednost == null
                                ? "—"
                                : `${formatBroj(d.ph.vrijednost, 2)} (n=${d.ph.n})`,
                          ],
                        ] as Array<[string, (d: SazetakGodine) => string]>
                      ).map(([naslov, prikaz]) => (
                        <tr key={naslov} className="bg-white text-[13px] text-stone-700">
                          <td className="border border-emerald-100 px-3 py-2 font-semibold">
                            {naslov}
                          </td>
                          {godineUsporedba.map((g) => (
                            <td key={g} className="border border-emerald-100 px-3 py-2">
                              {usporedbaUkupno[g] ? prikaz(usporedbaUkupno[g]) : "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border border-emerald-200 bg-white">
                  <div className="border-b border-emerald-200 px-4 py-3 text-[15px] font-semibold text-stone-800">
                    Usporedba po sortama
                  </div>

                  {usporedbaPoSortama.length === 0 ? (
                    <div className="p-4 text-[13px] text-stone-500">
                      Nema podataka za odabrana godišta.
                    </div>
                  ) : (
                    <div className="space-y-4 p-4">
                      {usporedbaPoSortama.map((s) => (
                        <div key={s.sorta} className="border border-emerald-200">
                          <div className="border-b border-emerald-200 bg-emerald-50/60 px-4 py-2 text-[15px] font-semibold text-stone-800">
                            {s.sorta}
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse">
                              <thead>
                                <tr className="bg-emerald-100/50 text-left text-[12px] uppercase tracking-[0.12em] text-emerald-900">
                                  <th className="border border-emerald-100 px-3 py-2">
                                    Podatak
                                  </th>
                                  {godineUsporedba.map((g) => (
                                    <th
                                      key={g}
                                      className="border border-emerald-100 px-3 py-2"
                                    >
                                      {nazivGodine(g)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(
                                  [
                                    ["Litara", (d: SazetakGodine) => `${formatBroj(d?.litara, 0)} L`],
                                    ["Kg grožđa", (d: SazetakGodine) => `${formatBroj(d?.kg, 0)} kg`],
                                    ["Zapisa", (d: SazetakGodine) => String(d?.zapisa ?? 0)],
                                    [
                                      "Šećer",
                                      (d: SazetakGodine) =>
                                        d?.secer?.vrijednost == null
                                          ? "—"
                                          : formatBroj(d.secer.vrijednost, 2),
                                    ],
                                    [
                                      "Kiseline",
                                      (d: SazetakGodine) =>
                                        d?.kiseline?.vrijednost == null
                                          ? "—"
                                          : formatBroj(d.kiseline.vrijednost, 2),
                                    ],
                                    [
                                      "pH",
                                      (d: SazetakGodine) =>
                                        d?.ph?.vrijednost == null
                                          ? "—"
                                          : formatBroj(d.ph.vrijednost, 2),
                                    ],
                                  ] as Array<[string, (d: SazetakGodine) => string]>
                                ).map(([naslov, prikaz]) => (
                                  <tr
                                    key={naslov}
                                    className="bg-white text-[13px] text-stone-700"
                                  >
                                    <td className="border border-emerald-100 px-3 py-2 font-semibold">
                                      {naslov}
                                    </td>
                                    {godineUsporedba.map((g) => (
                                      <td
                                        key={g}
                                        className="border border-emerald-100 px-3 py-2"
                                      >
                                        {prikaz(s.poGodinama[g])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mb-4 grid gap-4 xl:grid-cols-2">
          <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
            <h2 className="mb-3 text-[16px] font-semibold text-stone-800">
              Pregled po sorti
            </h2>

            {poSorti.length === 0 ? (
              <p className="text-[13px] text-stone-500">Nema podataka.</p>
            ) : (
              <div className="space-y-3">
                {poSorti.map((r) => (
                  <div
                    key={r.sorta}
                    className="border border-emerald-200 bg-white px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[15px] font-semibold text-stone-800">
                        {r.sorta}
                      </div>
                      <Oznaka variant="soft">{r.zapisa} zapisa</Oznaka>
                    </div>

                    <div className="mt-2 text-[13px] text-stone-600">
                      {formatBroj(r.litara, 0)} L / {formatBroj(r.kg, 0)} kg
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <Polje
                        label={`Šećer${r.secer.n ? ` (n=${r.secer.n})` : ""}`}
                        value={
                          r.secer.vrijednost == null
                            ? "—"
                            : formatBroj(r.secer.vrijednost, 2)
                        }
                      />
                      <Polje
                        label={`Kiseline${r.kiseline.n ? ` (n=${r.kiseline.n})` : ""}`}
                        value={
                          r.kiseline.vrijednost == null
                            ? "—"
                            : formatBroj(r.kiseline.vrijednost, 2)
                        }
                      />
                      <Polje
                        label={`pH${r.ph.n ? ` (n=${r.ph.n})` : ""}`}
                        value={
                          r.ph.vrijednost == null
                            ? "—"
                            : formatBroj(r.ph.vrijednost, 2)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
            <h2 className="mb-1 text-[16px] font-semibold text-stone-800">
              Pregled po položaju
            </h2>
            <p className="mb-3 text-[12px] text-stone-500">
              Položaj je interna šifra; polje „parcela” nosi isti broj pa se ne
              razrađuje zasebno.
            </p>

            {poPolozaju.length === 0 ? (
              <p className="text-[13px] text-stone-500">Nema podataka.</p>
            ) : (
              <div className="space-y-3">
                {poPolozaju.map((r) => (
                  <div
                    key={r.polozaj}
                    className={`border px-4 py-4 ${
                      r.polozaj === "bez položaja"
                        ? "border-amber-200 bg-amber-50/60"
                        : "border-emerald-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[15px] font-semibold text-stone-800">
                        {r.polozaj === "bez položaja"
                          ? "Bez položaja"
                          : `Položaj ${r.polozaj}`}
                      </div>
                      <Oznaka variant="soft">{r.zapisa} zapisa</Oznaka>
                    </div>

                    <div className="mt-2 text-[13px] text-stone-600">
                      {formatBroj(r.litara, 0)} L / {formatBroj(r.kg, 0)} kg
                    </div>

                    <div className="mt-2 text-[12px] text-stone-500">
                      {r.naziviSorti.join(", ") || "—"}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <Polje
                        label={`Šećer${r.secer.n ? ` (n=${r.secer.n})` : ""}`}
                        value={
                          r.secer.vrijednost == null
                            ? "—"
                            : formatBroj(r.secer.vrijednost, 2)
                        }
                      />
                      <Polje
                        label={`Kiseline${r.kiseline.n ? ` (n=${r.kiseline.n})` : ""}`}
                        value={
                          r.kiseline.vrijednost == null
                            ? "—"
                            : formatBroj(r.kiseline.vrijednost, 2)
                        }
                      />
                      <Polje
                        label={`pH${r.ph.n ? ` (n=${r.ph.n})` : ""}`}
                        value={
                          r.ph.vrijednost == null
                            ? "—"
                            : formatBroj(r.ph.vrijednost, 2)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-stone-800">
              Detaljni izvještaji
            </h2>
            <div className="border border-emerald-200 bg-white px-3 py-1 text-[12px] text-stone-600">
              Zapisa berbe: {detalji.length}
            </div>
          </div>

          {loading ? (
            <div className="border border-dashed border-emerald-300 bg-white p-8 text-center text-[13px] text-stone-500">
              Učitavam podatke...
            </div>
          ) : greska ? (
            <div className="border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
              {greska}
            </div>
          ) : detalji.length === 0 ? (
            <div className="border border-dashed border-emerald-300 bg-white p-8 text-center text-[13px] text-stone-500">
              Nema podataka za odabranu godinu.
            </div>
          ) : (
            <div className="space-y-5">
              {detalji.map((b) => (
                <div
                  key={b.id}
                  className="border border-emerald-200 bg-gradient-to-b from-white via-emerald-50/35 to-lime-50/50 px-4 py-4 shadow-sm"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[20px] font-semibold text-stone-800">
                          {b.nazivSorte}
                        </h3>
                        {b.vrstaUnosa === "ZATECENO" ? (
                          <Oznaka variant="upozorenje">Zatečeno</Oznaka>
                        ) : null}
                        {b.godina != null ? (
                          <Oznaka variant="strong">
                            {b.godina}
                            {b.godinaIzvedena ? " (izvedeno)" : ""}
                          </Oznaka>
                        ) : (
                          <Oznaka variant="upozorenje">Bez godišta</Oznaka>
                        )}
                        {/* SVI tankovi u koje je berba usla. Jedna berba smije
                            uci u vise njih — samotok u jedan, presovina u drugi
                            — pa bi ispis samo prvoga precutio pola berbe. Uz
                            svaki tank stoje i litre, jer "T5 i T7" ne kaze je li
                            podjela 1800/1200 ili 2900/100. */}
                        {b.tankovi.length > 1 ? (
                          <>
                            <Oznaka variant="strong">
                              {b.tankovi.length}{" "}
                              {hrvatskiOblik(
                                b.tankovi.length,
                                "tank",
                                "tanka",
                                "tankova"
                              )}
                            </Oznaka>
                            {b.tankovi.map((t) => (
                              <Oznaka key={t.tankId}>
                                Tank {t.broj ?? "?"} — {formatBroj(t.litre)} L
                              </Oznaka>
                            ))}
                          </>
                        ) : b.tankovi.length === 1 ? (
                          <Oznaka>Tank {b.tankovi[0].broj ?? "?"}</Oznaka>
                        ) : b.prviTankBroj != null ? (
                          <Oznaka>Tank {b.prviTankBroj}</Oznaka>
                        ) : null}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-2 text-[13px] text-stone-600">
                        <span>Datum berbe: {formatDatum(b.datumBerbe)}</span>
                        <span>•</span>
                        <span>U podrum: {formatDatum(b.datumUlaska)}</span>
                        {b.oznakaBerbe ? (
                          <>
                            <span>•</span>
                            <span>Oznaka: {b.oznakaBerbe}</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Oznaka variant="strong">
                        {formatBroj(b.kolicinaLitara, 0)} L ubrano
                      </Oznaka>
                      <Oznaka>{formatBroj(b.kolicinaKgGrozdja, 0)} kg</Oznaka>

                      {b.izvornaPunjenjeStavkaId ? (
                        <button
                          type="button"
                          onClick={() => obrisiBerbu(b)}
                          disabled={deletingId === b.id}
                          className="border border-red-200 bg-gradient-to-b from-red-50 to-rose-50 px-3 py-2 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === b.id ? "Brišem..." : "Obriši"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Polje label="Položaj" value={b.polozaj || "-"} />
                    <Polje label="Vinograd" value={b.vinograd || "-"} />
                    <Polje label="Šećer" value={formatBroj(b.secer, 2)} />
                    <Polje label="Kiseline" value={formatBroj(b.kiseline, 2)} />
                    <Polje label="pH" value={formatBroj(b.ph, 2)} />
                    {/* Prazno je "nije se pitalo" i ostaje crtica — ne smije
                        izgledati kao "nije bilo". */}
                    <Polje
                      label="Maceracija"
                      value={opisMaceracije(b.maceracija, b.maceracijaSati) ?? "-"}
                    />
                  </div>

                  {b.napomena ? (
                    <div className="mt-3 border border-emerald-200 bg-white p-4">
                      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-emerald-800/70">
                        Napomena
                      </div>
                      <div className="text-[13px] text-stone-700">{b.napomena}</div>
                    </div>
                  ) : null}

                  {b.ispravljenoAt ? (
                    <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                      Ispravljeno {formatDatum(b.ispravljenoAt)}
                      {b.razlogIspravka ? ` — ${b.razlogIspravka}` : ""}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {zatecene.length > 0 && !ukljuciZateceno ? (
          <div className="mt-4 border border-amber-300 bg-gradient-to-b from-amber-50/70 to-white p-4 shadow-sm">
            <h2 className="text-[16px] font-semibold text-stone-800">
              Zatečeno u podrumu — vino bez zapisa o berbi
            </h2>
            <p className="mt-1 max-w-[900px] text-[13px] leading-6 text-stone-600">
              Knjiga za ovo vino zna količinu, ali ne i odakle je došlo. Staro
              arhiviranje brisalo je zapise punjenja, pa je količina
              rekonstruirana iz pretoka i izlaza. Ovo <strong>nije berba</strong> i
              ne ulazi u zbrojeve iznad. Broj ovih zapisa je mjera koliko
              povijesti nedostaje — što ih je manje, to je povijest cjelovitija.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Oznaka variant="upozorenje">
                {zatecene.length} zapisa ukupno
              </Oznaka>
              <Oznaka variant="upozorenje">
                {formatBroj(
                  zatecene.reduce((s, b) => s + b.kolicinaLitara, 0),
                  0
                )}{" "}
                L
              </Oznaka>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-amber-100/70 text-left text-[12px] uppercase tracking-[0.12em] text-amber-900">
                    <th className="border border-amber-200 px-3 py-2">Naziv</th>
                    <th className="border border-amber-200 px-3 py-2">Položaj</th>
                    <th className="border border-amber-200 px-3 py-2">U podrum</th>
                    <th className="border border-amber-200 px-3 py-2">Količina</th>
                    <th className="border border-amber-200 px-3 py-2">Akcija</th>
                  </tr>
                </thead>
                <tbody>
                  {(aktivnaGodina ? zateceneUGodini : zatecene).map((b) => (
                    <tr key={b.id} className="bg-white text-[13px] text-stone-700">
                      <td className="border border-amber-100 px-3 py-2 font-semibold">
                        {b.nazivSorte}
                      </td>
                      <td className="border border-amber-100 px-3 py-2">
                        {b.polozaj || "-"}
                      </td>
                      <td className="border border-amber-100 px-3 py-2">
                        {formatDatum(b.datumUlaska)}
                      </td>
                      <td className="border border-amber-100 px-3 py-2">
                        {formatBroj(b.kolicinaLitara, 0)} L
                      </td>
                      <td className="border border-amber-100 px-3 py-2">
                        {b.izvornaPunjenjeStavkaId ? (
                          <button
                            type="button"
                            onClick={() => obrisiBerbu(b)}
                            disabled={deletingId === b.id}
                            className="border border-red-200 bg-gradient-to-b from-red-50 to-rose-50 px-3 py-1.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingId === b.id ? "Brišem..." : "Obriši"}
                          </button>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="mt-4 border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-stone-800">
              Dodatni filteri
            </h2>
            <button
              type="button"
              onClick={() => {
                setFilterSorta("");
                setFilterTank("");
                setFilterTekst("");
              }}
              className="border border-emerald-200 bg-white px-3 py-2 text-[12px] font-medium text-stone-700 transition hover:bg-emerald-50"
            >
              Očisti filtere
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Sorta
              </label>
              <select
                value={filterSorta}
                onChange={(e) => setFilterSorta(e.target.value)}
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              >
                <option value="">Sve sorte</option>
                {sorte.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Prvi tank
              </label>
              <select
                value={filterTank}
                onChange={(e) => setFilterTank(e.target.value)}
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              >
                <option value="">Svi tankovi</option>
                {tankovi.map((t) => (
                  <option key={t} value={t}>
                    Tank {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-stone-700">
                Pretraga
              </label>
              <input
                value={filterTekst}
                onChange={(e) => setFilterTekst(e.target.value)}
                placeholder="sorta, položaj, oznaka, tank..."
                className="w-full border border-emerald-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-400"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
