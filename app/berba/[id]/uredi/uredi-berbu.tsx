"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import {
  brojIliNull,
  datumIliNull,
  krajSPrelaskomPonoci,
  tekstIliNull,
  vrijemeIliNull,
} from "@/lib/berba-polja";
import { kljucGrupeBerbe } from "@/lib/berba-kljuc";

/**
 * OBRAZAC ZA ISPRAVAK BERBE.
 *
 * Upozorenja se racunaju OVDJE, dok se tipka, iz podataka koje je poslala
 * stranica — ne tek kad ruta odbije: promjena sorte (s popisom tankova i
 * izricitom potvrdom) i sudar s drugom grupom (samo upozorenje).
 *
 * Salju se sva polja obrasca; ruta sama nalazi sto se stvarno promijenilo i
 * samo to pise, u zapis i u dnevnik.
 */

export type PodaciZaObrazac = {
  id: string;
  vrstaUnosa: "BERBA" | "ZATECENO";
  nazivSorte: string;
  kolicinaLitara: number;
  kolicinaKgGrozdja: number | null;
  secer: number | null;
  kiseline: number | null;
  ph: number | null;
  polozaj: string | null;
  parcela: string | null;
  vinograd: string | null;
  oznakaBerbe: string | null;
  datumBerbe: string | null;
  datumUlaska: string | null;
  godinaBerbe: number | null;
  napomena: string | null;
  maceracija: boolean | null;
  maceracijaSati: number | null;
  vlastitaBerba: boolean | null;
  pocetakBranja: string | null;
  krajBranja: string | null;
  brojBeraca: number | null;
  ispravljenoAt: string | null;
  razlogIspravka: string | null;
  grupa: Array<{ id: string; kolicinaLitara: number }>;
  tankoviDanas: Array<{ broj: number | null; litre: number }>;
  kljuceviOstalih: string[];
  stavkiUGrupi: number;
  sorte: string[];
};

type Rezultat = {
  zapisa: number;
  stavki: number;
  polja: string[];
  upozorenja: { sorta: Array<{ broj: number | null; litre: number }> | null; sudarGrupe: boolean };
};

const tekstPolja = (v: string | number | null) => (v == null ? "" : String(v));

/** "da" / "ne" / "" — tri stanja: NULL znaci da se nije pitalo. */
const triStanja = (v: boolean | null) => (v === true ? "da" : v === false ? "ne" : "");
const izTriStanja = (v: string): boolean | null => (v === "da" ? true : v === "ne" ? false : null);

/** Lokalni sat "HH:MM" iz ISO trenutka — samo u pregledniku (zona korisnika). */
function satIzIso(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function litre(v: number) {
  return v.toLocaleString("hr-HR", { maximumFractionDigits: 0 });
}

export default function UrediBerbu({ podaci }: { podaci: PodaciZaObrazac }) {
  const router = useRouter();

  const [nazivSorte, setNazivSorte] = useState(podaci.nazivSorte);
  const [kg, setKg] = useState(tekstPolja(podaci.kolicinaKgGrozdja));
  const [secer, setSecer] = useState(tekstPolja(podaci.secer));
  const [kiseline, setKiseline] = useState(tekstPolja(podaci.kiseline));
  const [ph, setPh] = useState(tekstPolja(podaci.ph));
  const [polozaj, setPolozaj] = useState(tekstPolja(podaci.polozaj));
  const [parcela, setParcela] = useState(tekstPolja(podaci.parcela));
  const [vinograd, setVinograd] = useState(tekstPolja(podaci.vinograd));
  const [oznaka, setOznaka] = useState(tekstPolja(podaci.oznakaBerbe));
  // Datum berbe je UTC ponoc (kao pri punjenju), pa je kalendarski dan prvih 10 znakova.
  const [datum, setDatum] = useState(podaci.datumBerbe ? podaci.datumBerbe.slice(0, 10) : "");
  const [godina, setGodina] = useState(tekstPolja(podaci.godinaBerbe));
  const [napomena, setNapomena] = useState(tekstPolja(podaci.napomena));
  const [maceracija, setMaceracija] = useState(triStanja(podaci.maceracija));
  const [maceracijaSati, setMaceracijaSati] = useState(tekstPolja(podaci.maceracijaSati));
  const [vlastita, setVlastita] = useState(triStanja(podaci.vlastitaBerba));
  const [pocetak, setPocetak] = useState("");
  const [kraj, setKraj] = useState("");
  const [beraci, setBeraci] = useState(tekstPolja(podaci.brojBeraca));
  const [razlog, setRazlog] = useState("");
  const [potvrdaSorte, setPotvrdaSorte] = useState(false);

  const [salje, setSalje] = useState(false);
  const [greska, setGreska] = useState("");
  const [rezultat, setRezultat] = useState<Rezultat | null>(null);

  // Sati branja u zoni PREGLEDNIKA. Na posluzitelju bi se racunali u UTC-u i
  // obrazac bi pokazao sat pomaknut za dva sata.
  useEffect(() => {
    setPocetak(satIzIso(podaci.pocetakBranja));
    setKraj(satIzIso(podaci.krajBranja));
  }, [podaci.pocetakBranja, podaci.krajBranja]);

  const mijenjaSortu =
    nazivSorte.trim().toLocaleLowerCase("hr") !== podaci.nazivSorte.trim().toLocaleLowerCase("hr");

  const noviKljuc = kljucGrupeBerbe({
    datumBerbe: datumIliNull(datum),
    datumUlaska: podaci.datumUlaska,
    nazivSorte,
    parcela: tekstIliNull(parcela),
  });
  const sudar = podaci.vrstaUnosa === "BERBA" && podaci.kljuceviOstalih.includes(noviKljuc);

  const litreGrupe = podaci.grupa.reduce((z, g) => z + g.kolicinaLitara, 0);
  const jeVlastita = vlastita === "da";
  const mozeSpremiti =
    !salje && Boolean(tekstIliNull(razlog)) && Boolean(tekstIliNull(nazivSorte)) && (!mijenjaSortu || potvrdaSorte);

  async function spremi() {
    if (!mozeSpremiti) return;
    setSalje(true);
    setGreska("");
    setRezultat(null);

    const pocetakIso = jeVlastita ? vrijemeIliNull(datum, pocetak) : null;
    const krajIso = jeVlastita
      ? krajSPrelaskomPonoci(pocetakIso, vrijemeIliNull(datum, kraj))
      : null;

    try {
      const res = await fetch(`/api/berba/${podaci.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nazivSorte,
          kolicinaKgGrozdja: brojIliNull(kg),
          secer: brojIliNull(secer),
          kiseline: brojIliNull(kiseline),
          ph: brojIliNull(ph),
          polozaj: tekstIliNull(polozaj),
          parcela: tekstIliNull(parcela),
          vinograd: tekstIliNull(vinograd),
          oznakaBerbe: tekstIliNull(oznaka),
          datumBerbe: datumIliNull(datum),
          godinaBerbe: brojIliNull(godina),
          napomena: tekstIliNull(napomena),
          maceracija: izTriStanja(maceracija),
          maceracijaSati: maceracija === "da" ? brojIliNull(maceracijaSati) : null,
          vlastitaBerba: izTriStanja(vlastita),
          pocetakBranja: pocetakIso,
          krajBranja: krajIso,
          brojBeraca: jeVlastita ? brojIliNull(beraci) : null,
          razlog,
          potvrdaSorte: mijenjaSortu ? potvrdaSorte : undefined,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setGreska(data?.error || "Ispravak nije uspio.");
        return;
      }

      setRezultat(data as Rezultat);
      setRazlog("");
      setPotvrdaSorte(false);
      router.refresh();
    } catch (e) {
      console.error(e);
      setGreska("Ispravak nije uspio.");
    } finally {
      setSalje(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, color: "#7f1d1d" }}>Ispravak berbe</h1>
        <div style={prigusenoStyle}>
          Samo za grešku pri unosu. Svaka izmjena ostaje zapisana: tko, kada, zašto i što je bilo prije.
        </div>
      </div>

      <div style={okvirStyle}>
        <strong>
          {podaci.vrstaUnosa === "BERBA"
            ? podaci.grupa.length > 1
              ? `Ispravak mijenja cijelu berbu: ${podaci.grupa.length} zapisa`
              : "Ispravak mijenja ovaj zapis berbe"
            : "Zatečeni zapis — ispravlja se samo on"}
        </strong>
        <div style={prigusenoStyle}>
          {podaci.vrstaUnosa === "BERBA"
            ? "Ista berba = isti datum, sorta i parcela. "
            : ""}
          Ispravljaju se i stavke punjenja te berbe ({podaci.stavkiUGrupi}), jer ih stranica tanka čita.
        </div>
        {podaci.ispravljenoAt ? (
          <div style={prigusenoStyle}>
            Zadnji ispravak {new Date(podaci.ispravljenoAt).toLocaleString("hr-HR")}
            {podaci.razlogIspravka ? `: „${podaci.razlogIspravka}”` : ""}
          </div>
        ) : null}
      </div>

      {/* LITRE — zakljucane, s objasnjenjem zasto. */}
      <div style={zakljucanoStyle}>
        <div style={oznakaStyle}>Količina (litre) — zaključano</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{litre(litreGrupe)} L</div>
        <div style={prigusenoStyle}>
          Iz litara je nastao ulaz u knjigu i stanje tanka. Kriva količina se ispravlja brisanjem
          stavke punjenja i ponovnim upisom, ne ovdje.
        </div>
      </div>

      <Polje oznaka="Sorta">
        <input
          list="sorte-za-ispravak"
          value={nazivSorte}
          onChange={(e) => {
            setNazivSorte(e.target.value);
            setPotvrdaSorte(false);
          }}
          style={unosStyle}
        />
        <datalist id="sorte-za-ispravak">
          {podaci.sorte.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Polje>

      {mijenjaSortu ? (
        <div style={upozorenjeStyle}>
          <strong>Mijenja se sorta: „{podaci.nazivSorte}” → „{nazivSorte.trim() || "—"}”.</strong>
          <div>
            {podaci.tankoviDanas.length === 0
              ? "Ove berbe danas nema ni u jednom tanku."
              : `Berba je danas u: ${podaci.tankoviDanas
                  .map((t) => `T${t.broj ?? "?"} (${litre(t.litre)} L)`)
                  .join(", ")}. Tim tankovima se odmah mijenja sastav iz knjige.`}
          </div>
          <div>
            <strong>Ne mijenja se</strong> sorta upisana na tank (Tank.sorta) ni ime vina — to se
            ispravlja zasebno. Stavke punjenja te berbe dobivaju novu sortu.
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <input
              type="checkbox"
              checked={potvrdaSorte}
              onChange={(e) => setPotvrdaSorte(e.target.checked)}
            />
            Razumijem — promijeni sortu.
          </label>
        </div>
      ) : null}

      {sudar ? (
        <div style={upozorenjeStyle}>
          Nakon ispravka ova berba ima isti datum, sortu i parcelu kao druga, već upisana berba. Na
          popisima će se prikazivati kao jedna. Spremanje je dopušteno.
        </div>
      ) : null}

      <div style={mrezaStyle}>
        <Polje oznaka="Datum berbe">
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Godina berbe">
          <input inputMode="numeric" value={godina} onChange={(e) => setGodina(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Kilogrami grožđa">
          <input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Šećer">
          <input inputMode="decimal" value={secer} onChange={(e) => setSecer(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Kiseline">
          <input inputMode="decimal" value={kiseline} onChange={(e) => setKiseline(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="pH">
          <input inputMode="decimal" value={ph} onChange={(e) => setPh(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Položaj">
          <input value={polozaj} onChange={(e) => setPolozaj(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Parcela">
          <input value={parcela} onChange={(e) => setParcela(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Vinograd">
          <input value={vinograd} onChange={(e) => setVinograd(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Oznaka berbe">
          <input value={oznaka} onChange={(e) => setOznaka(e.target.value)} style={unosStyle} />
        </Polje>
        <Polje oznaka="Maceracija">
          <select value={maceracija} onChange={(e) => setMaceracija(e.target.value)} style={unosStyle}>
            <option value="">nije upisano</option>
            <option value="da">da</option>
            <option value="ne">ne</option>
          </select>
        </Polje>
        {maceracija === "da" ? (
          <Polje oznaka="Maceracija (sati)">
            <input inputMode="decimal" value={maceracijaSati} onChange={(e) => setMaceracijaSati(e.target.value)} style={unosStyle} />
          </Polje>
        ) : null}
        <Polje oznaka="Vlastita berba">
          <select value={vlastita} onChange={(e) => setVlastita(e.target.value)} style={unosStyle}>
            <option value="">nije upisano</option>
            <option value="da">da — naši berači</option>
            <option value="ne">ne — kooperant</option>
          </select>
        </Polje>
        {jeVlastita ? (
          <>
            <Polje oznaka="Početak branja">
              <input type="time" value={pocetak} onChange={(e) => setPocetak(e.target.value)} style={unosStyle} />
            </Polje>
            <Polje oznaka="Kraj branja">
              <input type="time" value={kraj} onChange={(e) => setKraj(e.target.value)} style={unosStyle} />
            </Polje>
            <Polje oznaka="Broj berača">
              <input inputMode="numeric" value={beraci} onChange={(e) => setBeraci(e.target.value)} style={unosStyle} />
            </Polje>
          </>
        ) : null}
      </div>

      {jeVlastita && !datumIliNull(datum) ? (
        <div style={prigusenoStyle}>Vrijeme branja se ne sprema bez datuma berbe.</div>
      ) : null}

      <Polje oznaka="Napomena">
        <textarea value={napomena} onChange={(e) => setNapomena(e.target.value)} rows={2} style={{ ...unosStyle, resize: "vertical" }} />
      </Polje>

      <Polje oznaka="Razlog ispravka (obavezno)">
        <textarea
          value={razlog}
          onChange={(e) => setRazlog(e.target.value)}
          rows={2}
          placeholder="npr. krivo upisana parcela, šećer s vage umjesto refraktometra"
          style={{ ...unosStyle, resize: "vertical" }}
        />
      </Polje>

      {greska ? <div style={greskaStyle}>{greska}</div> : null}

      {rezultat ? (
        <div style={uspjehStyle}>
          Ispravljeno: {rezultat.zapisa} {rezultat.zapisa === 1 ? "zapis" : "zapisa"} berbe,{" "}
          {rezultat.stavki} stavki punjenja. Polja: {rezultat.polja.join(", ")}.
          {rezultat.upozorenja.sudarGrupe ? " Berba se sada poklapa s drugom po datumu, sorti i parceli." : ""}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={spremi}
          disabled={!mozeSpremiti}
          style={{ ...gumbStyle, opacity: mozeSpremiti ? 1 : 0.5, cursor: mozeSpremiti ? "pointer" : "default" }}
        >
          {salje ? "Spremam..." : "Spremi ispravak"}
        </button>
      </div>
    </div>
  );
}

function Polje({ oznaka, children }: { oznaka: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <span style={oznakaStyle}>{oznaka}</span>
      {children}
    </label>
  );
}

const mrezaStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
  gap: 12,
};

const oznakaStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151" };
const prigusenoStyle: React.CSSProperties = { fontSize: 13, color: "#6b7280" };

const unosStyle: React.CSSProperties = {
  padding: "9px 10px",
  border: "1px solid #d1d5db",
  fontSize: 15,
  background: "#fff",
  color: "#111827",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const okvirStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e7e5e4",
  padding: 12,
  display: "grid",
  gap: 4,
};

const zakljucanoStyle: React.CSSProperties = {
  background: "#f3f4f6",
  border: "1px dashed #9ca3af",
  padding: 12,
  display: "grid",
  gap: 4,
};

const upozorenjeStyle: React.CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #f59e0b",
  color: "#78350f",
  padding: 12,
  display: "grid",
  gap: 4,
  fontSize: 14,
};

const greskaStyle: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  padding: 10,
  fontSize: 14,
};

const uspjehStyle: React.CSSProperties = {
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  color: "#065f46",
  padding: 10,
  fontSize: 14,
};

const gumbStyle: React.CSSProperties = {
  padding: "10px 16px",
  border: "1px solid #7f1d1d",
  background: "#7f1d1d",
  color: "#fff",
  fontWeight: 700,
};
