import Link from "next/link";
import type React from "react";
import { prisma } from "@/lib/prisma";
import Kronologija, { type Dogadaj } from "./kronologija";
import { notFound, redirect } from "next/navigation";
import { citajSesiju } from "@/lib/auth-sesija";
import { unstable_noStore as noStore } from "next/cache";
import TankSwitcher from "./tank-switcher";
import { Card } from "./kartica";
import BerbaPrekidac from "./berba-prekidac";
import NatragNaPrethodnu from "@/components/NatragNaPrethodnu";
import TankRoleActions from "./tank-role-actions";
import TankRoleSastavModal from "./tank-role-sastav-modal";
import TankRoleDokumentiUpload from "./tank-role-dokumenti-upload";
import HladjenjeGraf from "./hladjenje-graf";
import FermentacijaGumb from "./fermentacija-gumb";
import { smijeUPodrumu } from "@/lib/auth-role";
import { jeHladjenjeIskljuceno } from "@/lib/tank-komanda";
import { opisMaceracije, hrvatskiOblik } from "@/lib/berba-polja";
import {
  berbaKrozLanac,
  usporediPoBerbi,
  PRAZAN_LANAC,
  type KarikaLanca,
  type StavkaBerbe,
  type StavkaULancu,
} from "@/lib/berba-lanac";
import {
  sloziPoPolju,
  POLJA_MJERENJA,
  type SastavnicaBlenda,
  nizPolja,
  parametriBlenda,
  zadnjiBentotest,
  mjerenjaTrenutnogVina,
  type RedakMjerenja,
} from "@/lib/mjerenja";
import ParametriPoPolju, { type ParametarPrikaz } from "./parametri-po-polju";
import {
  izracunajStatus,
  stilZaStatus,
  formatTemp,
  prijeKoliko,
  stvarnaZadana,
} from "@/lib/temperatura";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatBroj(value: number | null | undefined, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatDatum(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("hr-HR");
}

function formatDatumBezVremena(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("hr-HR");
}


function prikaziKorisnika(
  korisnik:
    | {
        ime?: string | null;
        name?: string | null;
        naziv?: string | null;
        email?: string | null;
      }
    | null
    | undefined
) {
  if (!korisnik) return "—";
  return (
    korisnik.ime ??
    korisnik.name ??
    korisnik.naziv ??
    korisnik.email ??
    "—"
  );
}

function tipZadatkaLabel(z: {
  stavke?: Array<any>;
  preparatId?: string | null;
}) {
  if (z.stavke && z.stavke.length > 0) return "Vezani zadatak";
  return "Standardni zadatak";
}

function preporucenaDozaText(preparat?: {
  dozaOd?: number | null;
  dozaDo?: number | null;
  unit?: { naziv?: string | null } | null;
} | null) {
  if (!preparat) return "—";

  const od = preparat.dozaOd;
  const do_ = preparat.dozaDo;
  const jedinica = preparat.unit?.naziv ?? "";

  if (od != null && do_ != null) {
    return `${formatBroj(od)} – ${formatBroj(do_)} ${jedinica}`.trim();
  }

  if (od != null) {
    return `${formatBroj(od)} ${jedinica}`.trim();
  }

  if (do_ != null) {
    return `${formatBroj(do_)} ${jedinica}`.trim();
  }

  return "—";
}

function sazetakZadatka(z: {
  stavke?: Array<{
    preparat?: { naziv?: string | null } | null;
    izracunataKolicina?: number | null;
    izlaznaJedinica?: { naziv?: string | null } | null;
  }>;
  preparat?: { naziv?: string | null } | null;
  izracunataKolicina?: number | null;
  izlaznaJedinica?: { naziv?: string | null } | null;
}) {
  const tip = tipZadatkaLabel(z);

  if (z.stavke && z.stavke.length > 0) {
    const nazivi = z.stavke
      .map((s) => s.preparat?.naziv)
      .filter(Boolean)
      .join(", ");

    const ukupno = z.stavke
      .map((s) =>
        s.izracunataKolicina != null
          ? `${formatBroj(s.izracunataKolicina)} ${s.izlaznaJedinica?.naziv ?? ""}`.trim()
          : null
      )
      .filter(Boolean)
      .join(" + ");

    return `${tip} • ${nazivi || "više preparata"}${ukupno ? ` • ukupno: ${ukupno}` : ""}`;
  }

  const sredstvo = z.preparat?.naziv ?? "Bez preparata";
  const ukupno =
    z.izracunataKolicina != null
      ? `${formatBroj(z.izracunataKolicina)} ${z.izlaznaJedinica?.naziv ?? ""}`.trim()
      : "—";

  return `${tip} • ${sredstvo} • ukupno: ${ukupno}`;
}

function statusBadge(status: string) {
  if (status === "OTVOREN") {
    return {
      background: "#fff5f5",
      color: "#991b1b",
      border: "1px solid #dc2626",
    };
  }

  if (status === "IZVRSEN") {
    return {
      background: "#fafafa",
      color: "#44403c",
      border: "1px solid rgba(127,29,29,0.12)",
    };
  }

  if (status === "OTKAZAN") {
    return {
      background: "#fdf7f7",
      color: "#7f1d1d",
      border: "1px solid rgba(127,29,29,0.18)",
    };
  }

  return {
    background: "#fafafa",
    color: "#44403c",
    border: "1px solid rgba(127,29,29,0.10)",
  };
}

function ParamTop({
  label,
  value,
  unit,
  tone,
  emphasize = false,
}: {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  tone?: "default" | "green" | "red";
  emphasize?: boolean;
}) {
  const hasValue =
    value !== null &&
    value !== undefined &&
    !(typeof value === "string" && value.trim() === "");

  const boja =
    tone === "green" ? "#166534" : tone === "red" ? "#9f1239" : "#222";

  return (
    <div
      style={{
        ...paramCardStyle,
        ...(emphasize ? paramCardStrongStyle : null),
      }}
    >
      <div
        style={{
          ...paramLabelStyle,
          ...(emphasize ? paramLabelStrongStyle : null),
        }}
      >
        {label}
      </div>
      <div
        style={{
          ...paramValueStyle,
          ...(emphasize ? paramValueStrongStyle : null),
          color: boja,
        }}
      >
        {hasValue ? value : "—"}
        {hasValue && unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={detailRowStyle}>
      <div style={detailLabelStyle}>{label}</div>
      <div style={detailValueStyle}>{value}</div>
    </div>
  );
}

function jeAutomatskoMjerenje(napomena: string | null | undefined) {
  const tekst = (napomena ?? "").toLowerCase();

  return (
    tekst.includes("automatski izračunato novo mjerenje nakon običnog pretoka") ||
    tekst.includes("automatski izračunato novo mjerenje nakon cuvéea") ||
    tekst.includes("automatski izračunato novo mjerenje nakon blenda iste sorte") ||
    tekst.includes("automatski izracunato novo mjerenje nakon običnog pretoka") ||
    tekst.includes("automatski izracunato novo mjerenje nakon cuvéea") ||
    tekst.includes("automatski izracunato novo mjerenje nakon blenda iste sorte") ||
    tekst.includes("automatski izracunato")
  );
}

function imaVrijednost(v: any) {
  return v !== null && v !== undefined && v !== "";
}

function bojaAktivnogPolja(v: any) {
  return imaVrijednost(v) ? "#16a34a" : "#9ca3af";
}

function jeSamoBentotestZapis(m: {
  alkohol: number | null;
  ukupneKiseline: number | null;
  hlapiveKiseline: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  secer: number | null;
  ph: number | null;
  temperatura: number | null;
  bentotestDatum?: Date | string | null;
  bentotestStatus?: string | null;
}) {
  const imaKlasicno =
    m.alkohol != null ||
    m.ukupneKiseline != null ||
    m.hlapiveKiseline != null ||
    m.slobodniSO2 != null ||
    m.ukupniSO2 != null ||
    m.secer != null ||
    m.ph != null ||
    m.temperatura != null;

  const imaBentotest = !!(m.bentotestDatum || m.bentotestStatus);

  return !imaKlasicno && imaBentotest;
}

function bentotestLabel(status?: string | null) {
  if (status === "STABILNO") return "Stabilno";
  if (status === "NESTABILNO") return "Nestabilno";
  return "—";
}

function sloziZadnjeMjerenjePoPoljima(
  mjerenja: Array<{
    alkohol: number | null;
    ukupneKiseline: number | null;
    hlapiveKiseline: number | null;
    slobodniSO2: number | null;
    ukupniSO2: number | null;
    secer: number | null;
    ph: number | null;
    temperatura: number | null;
    bentotestDatum: Date | string | null;
    bentotestStatus: string | null;
    izmjerenoAt: Date | string;
    napomena: string | null;
  }>
) {
  if (!mjerenja.length) return null;

  function zadnjaVrijednost<K extends keyof (typeof mjerenja)[number]>(key: K) {
    for (const m of mjerenja) {
      const value = m[key];
      if (
        !jeAutomatskoMjerenje(m.napomena) &&
        value !== null &&
        value !== undefined &&
        value !== ""
      ) {
        return value;
      }
    }

    for (const m of mjerenja) {
      const value = m[key];
      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }

    return null;
  }

  const zadnjeRucnoIliOpce =
    mjerenja.find((m) => !jeAutomatskoMjerenje(m.napomena)) ??
    mjerenja[0] ??
    null;

  const zadnjiBentotest =
    mjerenja.find((m) => m.bentotestDatum || m.bentotestStatus) ?? null;

  return {
    temperatura: zadnjaVrijednost("temperatura"),
    ph: zadnjaVrijednost("ph"),
    secer: zadnjaVrijednost("secer"),
    alkohol: zadnjaVrijednost("alkohol"),
    ukupneKiseline: zadnjaVrijednost("ukupneKiseline"),
    hlapiveKiseline: zadnjaVrijednost("hlapiveKiseline"),
    slobodniSO2: zadnjaVrijednost("slobodniSO2"),
    ukupniSO2: zadnjaVrijednost("ukupniSO2"),

    bentotestDatum: zadnjiBentotest?.bentotestDatum ?? null,
    bentotestStatus: zadnjiBentotest?.bentotestStatus ?? null,
    bentotestIzmjerenoAt: zadnjiBentotest?.izmjerenoAt ?? null,

    izmjerenoAt: zadnjeRucnoIliOpce?.izmjerenoAt ?? null,
    napomena: zadnjeRucnoIliOpce?.napomena ?? null,
  };
}

/**
 * Jedan redak koji kaze da kartica pokazuje samo ono poslije zadnjeg
 * arhiviranja. Bez njega prazna kartica izgleda kao da povijesti nema, a
 * zapravo pripada prethodnom vinu i vidi se u arhivi.
 */
function OdZadnjeArhive({ granica }: { granica: Date | null }) {
  if (!granica) return null;
  return (
    <div style={odArhiveStyle}>
      Prikazano od zadnjeg arhiviranja ({formatDatumBezVremena(granica)})
      nadalje — starije pripada prethodnom vinu i vidi se u arhivi.
    </div>
  );
}

/**
 * "tank 12" ili "tankove 12, 14" — pretok od faze 4 moze imati vise ciljeva.
 * Dok ih ima jedan, ispis je isti kao prije.
 */
function opisiCiljeve(ciljevi: Array<{ tank: { broj: number } }>) {
  if (ciljevi.length === 0) return "tank —";
  if (ciljevi.length === 1) return `tank ${ciljevi[0].tank.broj}`;
  return `tankove ${ciljevi.map((c) => c.tank.broj).join(", ")}`;
}

/** Jedno polje berbe. Prazno se prikazuje blijedo, ne skriva se. */
function BerbaPolje({ label, value }: { label: string; value?: string | null }) {
  const prazno = !value;
  return (
    <div style={{ ...berbaPoljeStyle, opacity: prazno ? 0.45 : 1 }}>
      <div style={berbaLabelStyle}>{label}</div>
      <div style={berbaVrijednostStyle}>{prazno ? "—" : value}</div>
    </div>
  );
}

/**
 * Maceracija u mrezi berbe.
 *
 * Ima vlastitu komponentu, a ne obicni BerbaPolje, zbog kvacice: "da" i "ne"
 * su dvije tvrdnje koje se moraju razlikovati na prvi pogled, a prazno polje
 * je treca stvar ("nije se pitalo") i ostaje blijedo kao i svako drugo.
 * Tekst slaze lib/berba-polja (opisMaceracije) — isti koji koristi i pregled
 * berbe, da se dva prikaza ne raziidju.
 */
function MaceracijaPolje({
  maceracija,
  sati,
}: {
  maceracija: boolean | null;
  sati: number | null;
}) {
  const tekst = opisMaceracije(maceracija, sati);

  if (tekst === null) {
    return <BerbaPolje label="Maceracija" value={null} />;
  }

  return (
    <div style={berbaPoljeStyle}>
      <div style={berbaLabelStyle}>Maceracija</div>
      <div
        style={{
          ...berbaVrijednostStyle,
          color: maceracija ? "#166534" : "#4b4b4b",
        }}
      >
        <span style={{ fontWeight: 800, marginRight: 4 }}>
          {maceracija ? "✓" : "✕"}
        </span>
        {tekst}
      </div>
    </div>
  );
}

/**
 * Jedna stavka berbe — zaglavlje sa sortom i litrama, pa mreza polja.
 *
 * ZAJEDNICKA je vlastitim stavkama ovog tanka i onima naslijedjenima kroz
 * lanac blenda. Prije je ovaj blok postojao samo jednom, ugradjen u karticu;
 * naslijedjene stavke bi ga morale prepisati, a dvije bi se kopije razisle
 * prvom izmjenom (maceracija je vec jednom tako ispala iz jednog prikaza).
 */
function BerbaStavkaKartica({
  s,
  podnaslov,
  podrijetlo,
  rub,
}: {
  s: StavkaBerbe;
  podnaslov: React.ReactNode;
  /** Put kojim je stavka dosla — stoji uz stavku, ne iznad grupe. */
  podrijetlo?: React.ReactNode;
  rub?: string;
}) {
  return (
    <div
      style={rub ? { ...berbaKarticaStyle, borderLeftColor: rub } : berbaKarticaStyle}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>
        {s.nazivSorte} — {formatBroj(s.kolicinaLitara, 0)} L
        {s.kolicinaKgGrozdja != null
          ? ` · ${formatBroj(s.kolicinaKgGrozdja, 0)} kg`
          : ""}
      </div>
      {podrijetlo}
      <div style={mutedTextStyle}>{podnaslov}</div>

      <div style={berbaMrezaStyle}>
        <BerbaPolje label="Vinograd" value={s.vinograd} />
        <BerbaPolje label="Parcela" value={s.parcela} />
        <BerbaPolje label="Položaj" value={s.polozaj} />
        <BerbaPolje label="Oznaka berbe" value={s.oznakaBerbe} />
        <BerbaPolje
          label="Datum berbe"
          value={s.datumBerbe ? formatDatumBezVremena(s.datumBerbe) : null}
        />
        <BerbaPolje
          label="Godina berbe"
          value={s.godinaBerbe != null ? String(s.godinaBerbe) : null}
        />
        <BerbaPolje
          label="Šećer pri berbi"
          value={s.secer != null ? formatBroj(s.secer) : null}
        />
        <BerbaPolje
          label="Kiseline pri berbi"
          value={s.kiseline != null ? formatBroj(s.kiseline) : null}
        />
        <BerbaPolje
          label="pH pri berbi"
          value={s.ph != null ? formatBroj(s.ph) : null}
        />
        <MaceracijaPolje maceracija={s.maceracija} sati={s.maceracijaSati} />
      </div>

      {s.opis ? <div style={mutedTextStyle}>Opis kvalitete: {s.opis}</div> : null}
      {s.napomenaBerbe ? (
        <div style={mutedTextStyle}>Napomena: {s.napomenaBerbe}</div>
      ) : null}
    </div>
  );
}

/**
 * "prešlo 4.800 L od 5.200 L" za jednu kariku lanca.
 *
 * Bez nazivnika ("od 5.200 L") broj ne kaze nista: 4.800 L moze biti cijeli
 * izvor ili njegova cetvrtina, a o tome ovisi koliko ovdje prikazana berba
 * uopce opisuje ovaj tank. Kad izvor nema svojih punjenja, nazivnika nema i
 * ne izmislja se.
 */
function opisPrijelaza(k: KarikaLanca): string {
  const preslo = `prešlo ${formatBroj(k.presloL, 0)} L`;
  return k.odUkupnoL > 0
    ? `${preslo} od ${formatBroj(k.odUkupnoL, 0)} L`
    : preslo;
}

/**
 * Put od ovog tanka do izvora berbe, karika po karika — UZ SVAKU STAVKU.
 *
 * Stoji uz stavku, a ne kao zaglavlje grupe, jer su stavke poredane po datumu
 * berbe: dvije susjedne obicno dolaze iz razlicitih bacvi. Bez oznake na svakoj
 * bi popis izgledao kao da je sve iz jednog izvora, i "samo dio" bi nestalo.
 */
function PutLanca({ put, sumnjiv }: { put: KarikaLanca[]; sumnjiv: boolean }) {
  return (
    <div style={lanacPutStyle}>
      <span style={{ color: "#6b7280" }}>kroz </span>
      {put.map((k, i) => (
        <span key={k.blendIzvorId}>
          {i > 0 ? <span style={{ opacity: 0.5 }}> ← </span> : null}
          <strong>{k.naziv}</strong>
          <span style={{ fontWeight: 400, color: "#6b7280" }}>
            {" "}
            ({opisPrijelaza(k)})
          </span>
        </span>
      ))}
      {sumnjiv ? <span style={sumnjivoZnakStyle}>SUMNJIVO</span> : null}
    </div>
  );
}

/**
 * Koliko naslijedjenih zapisa stoji otvoreno prije "prikazi sve".
 *
 * Sest, jer je to otprilike jedan ekran na mobitelu. Bacva u koju idu zadnji
 * dijelovi mosta zna imati deset i vise izvora, a svaki od njih vise od jedne
 * stavke — bez granice kartica preraste u beskrajno listanje i sakrije sve
 * ispod sebe (temperaturu, zadatke, kronologiju).
 */
const NASLIJEDENO_ODMAH = 6;

/** Jedan naslijedjeni zapis berbe, s putem i omjerom uza se. */
function NaslijedenaStavka({ x }: { x: StavkaULancu }) {
  return (
    <BerbaStavkaKartica
      s={x.stavka}
      rub="#9ca3af"
      podrijetlo={<PutLanca put={x.put} sumnjiv={x.sumnjiv} />}
      podnaslov={
        <>
          {x.punjenje.nazivVina ?? "bez naziva vina"} · punjeno{" "}
          {formatDatumBezVremena(x.punjenje.datumPunjenja)}
        </>
      }
    />
  );
}

/**
 * Zadnje mjerenje JEDNE sastavnice blenda.
 *
 * Vrijednosti dolaze iz `parametriBlenda` (lib/mjerenja.ts), koji ih ionako
 * cita da bi izracunao prosjek — pa ovaj blok ne kosta nijedan dodatni upit.
 * Prije se za isto povlacilo `mjerenja: take 30` po sastavnici, ugnijezdjeno u
 * glavni upit stranice.
 *
 * Vrijednost je slozena PO POLJU, ne "zadnji redak": izvor koji je alkohol
 * mjerio prije tri tjedna, a SO2 jucer, pokazuje oboje.
 */
function IzvorMjerenjeBlock({
  sastavnica,
}: {
  sastavnica: SastavnicaBlenda | undefined;
}) {
  // Sastavnica bez ijednog popunjenog polja NIJE isto sto i sastavnica s
  // praznim vrijednostima — prva se ne smije prikazati kao osam crtica, jer to
  // izgleda kao da je mjereno pa ispalo prazno.
  const zadnje =
    sastavnica && sastavnica.polja.length === 0 && !sastavnica.bentotest
      ? null
      : sastavnica
    ? {
        ...sastavnica.vrijednosti,
        bentotestDatum: sastavnica.bentotest?.datum ?? null,
        bentotestStatus: sastavnica.bentotest?.status ?? null,
      }
    : null;

  // S VREMENOM, ne samo datum: u podrumu se zna mjeriti dvaput u istom danu,
  // pa je sat jedino sto razlikuje dva mjerenja. Razliciti trenuci se nabrajaju,
  // isti se pojavljuje jednom — polja izmjerena zajedno i jesu jedno mjerenje.
  const datumiPoPolju = sastavnica
    ? Array.from(
        new Map(
          POLJA_MJERENJA.map((polje) => sastavnica.izvorPolja[polje])
            .filter(Boolean)
            .map((izv) => [
              izv!.izmjerenoAt.getTime(),
              formatDatum(izv!.izmjerenoAt),
            ])
        ).values()
      )
    : [];

  if (!zadnje) {
    return (
      <div style={sourceMeasurementWrapStyle}>
        <div style={sourceMeasurementTitleStyle}>Zadnje mjerenje izvora</div>
        <div style={mutedTextStyle}>Nema mjerenja za ovaj izvorni tank.</div>
      </div>
    );
  }

  return (
    <div style={sourceMeasurementWrapStyle}>
      <div style={sourceMeasurementTitleStyle}>Zadnje mjerenje izvora</div>

      <div style={sourceMeasurementPrimaryGridStyle}>
        <div style={sourceMeasurementPrimaryItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Alkohol</span>
          <strong>
            {zadnje.alkohol != null ? `${formatBroj(zadnje.alkohol)} %` : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementPrimaryItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Šećer</span>
          <strong>{zadnje.secer != null ? formatBroj(zadnje.secer) : "—"}</strong>
        </div>

        <div style={sourceMeasurementPrimaryItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Uk. kiseline</span>
          <strong>
            {zadnje.ukupneKiseline != null
              ? formatBroj(zadnje.ukupneKiseline)
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementPrimaryItemStyle}>
          <span style={sourceMeasurementLabelStyle}>SO2 uk.</span>
          <strong>
            {zadnje.ukupniSO2 != null ? formatBroj(zadnje.ukupniSO2) : "—"}
          </strong>
        </div>
      </div>

      <div style={sourceMeasurementSecondaryGridStyle}>
        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>pH</span>
          <strong>{zadnje.ph != null ? formatBroj(zadnje.ph) : "—"}</strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Temp.</span>
          <strong>
            {zadnje.temperatura != null
              ? `${formatBroj(zadnje.temperatura)} °C`
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Hlapive</span>
          <strong>
            {zadnje.hlapiveKiseline != null
              ? formatBroj(zadnje.hlapiveKiseline)
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>SO2 slob.</span>
          <strong>
            {zadnje.slobodniSO2 != null
              ? formatBroj(zadnje.slobodniSO2)
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Bentotest datum</span>
          <strong>
            {zadnje.bentotestDatum
              ? formatDatumBezVremena(zadnje.bentotestDatum)
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Bentotest status</span>
          <strong>
            {zadnje.bentotestStatus === "STABILNO"
              ? "Stabilno"
              : zadnje.bentotestStatus === "NESTABILNO"
                ? "Nestabilno"
                : "—"}
          </strong>
        </div>
      </div>

      {/* Datum PO POLJU, ne jedan za sve — izvor koji je alkohol mjerio prije
          tri tjedna, a SO2 jucer, ima dva datuma i oba su tocna. */}
      <div style={sourceMeasurementMetaStyle}>
        {datumiPoPolju.length === 0
          ? "Mjereno: —"
          : "Mjereno: " + datumiPoPolju.join(" · ")}
      </div>
    </div>
  );
}

export default async function TankPregledPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  noStore();

  const prijavljeni = await citajSesiju();
  if (!prijavljeni) redirect("/login");

  const resolvedParams = await params;
  const id = resolvedParams?.id;

  if (!id) return notFound();

  const tank = await prisma.tank.findUnique({
    where: { id },
    include: {
      udjeliSorti: {
        orderBy: {
          postotak: "desc",
        },
      },
      blendIzvori: {
        orderBy: {
          createdAt: "asc",
        },
        // BEZ ugnijezdjenih mjerenja. Prije se uz svaku sastavnicu povlacilo
        // `mjerenja: take 30` — ista ona koja `parametriBlenda` ionako cita da
        // bi izracunao prosjek. Sada dolaze odande (SastavnicaBlenda.vrijednosti),
        // pa ovaj upit ne nosi ni jedan redak mjerenja.
        include: {
          izvorTank: {
            select: { id: true, broj: true },
          },
          izvorArhivaVina: {
            select: { id: true, brojTanka: true, arhiviranoAt: true },
          },
        },
      },
      documents: {
        orderBy: [{ datumDokumenta: "desc" }, { createdAt: "desc" }],
      },
      izlaziVina: {
        orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
        take: 50,
      },
    },
  });

  if (!tank) return notFound();

  // Izvedeno iz vec ucitanog tanka, prije upita.
  const udjeliSorti = tank.udjeliSorti ?? [];
  const ukupnoPostotak = udjeliSorti.reduce(
    (sum, u) => sum + Number(u.postotak ?? 0),
    0
  );
  const ukupnoPostotakRounded = Number(ukupnoPostotak.toFixed(2));
  const sastavIspravan = Math.abs(ukupnoPostotakRounded - 100) < 0.01;

  const oznakaSastava =
    udjeliSorti.length === 0
      ? "Nije upisano"
      : udjeliSorti.length === 1
        ? udjeliSorti[0].nazivSorte
        : "Cuvée / blend";

  const tankJePrazan =
    Number(tank.kolicinaVinaUTanku ?? 0) <= 0 &&
    !tank.sorta &&
    !tank.nazivVina &&
    !tank.godiste &&
    udjeliSorti.length === 0;

  // Prazan tank NE skriva povijest: izlazi, punjenja, zadaci i radnje postoje
  // i kad u tanku trenutno nema vina, i upravo su tada najzanimljiviji.
  // (Izlazi se filtriraju granicom arhive nize, kad je granica poznata.)

  // Upiti idu u DVA VALA umjesto sest uzastopnih koraka.
  //
  // Prije: tri temperaturna paralelno, pa mjerenja, pa jos jednom mjerenja, pa
  // punjenja, pa otvoreni zadaci, pa izvrseni — sest odlazaka do baze jedan za
  // drugim, iako nijedan ne treba rezultat prethodnog.
  //
  // ZASTO NE SVE ODJEDNOM: pooler drzi `pool_size: 15` za cijelu
  // aplikaciju — produkciju, dev i skripte zajedno. Sedam usporednih citanja po
  // prikazu znaci da dva istovremena posjetitelja pojedu budzet i baza pocne
  // odbijati veze (EMAXCONNSESSION -> 500). Izmjereno, ne pretpostavljeno.
  // Cetiri po valu daju gotovo istu dobit uz upola manji vrsni pritisak.
  const prviVal = await Promise.all([
    prisma.ocitanjeTemperature.findFirst({
      where: { tankId: id },
      orderBy: { mjerenoU: "desc" },
    }),
    prisma.tankAlarm.findMany({
      where: { tankId: id, aktivan: true },
      orderBy: { nastaoU: "desc" },
    }),

    // JEDAN upit nad mjerenjima umjesto dva. Prije su stajala dva ista upita
    // (take 200 za parametre, take 100 za popis) — isti `where` i isti
    // `orderBy`, pa je drugi bio doslovan prefiks prvoga.
    prisma.mjerenje.findMany({
      where: { tankId: id },
      orderBy: { izmjerenoAt: "desc" },
      take: 200,
    }),

    // Arhive u PRVOM valu, iako se prikazuju medju povijesnim karticama:
    // iz njih dolazi granica arhive, a po njoj se filtriraju svi upiti u
    // drugom i trecem valu.
    prisma.arhivaVina.findMany({
      where: { tankId: id },
      orderBy: { arhiviranoAt: "desc" },
      select: {
        id: true,
        nazivVina: true,
        sorta: true,
        kolicinaVina: true,
        arhiviranoAt: true,
      },
    }),

    // Otvorena fermentacija ovog tanka — odredjuje koji se gumb prikazuje.
    // NAMJERNO bez granice arhive: fermentacija se zatvara ondje gdje je i
    // otvorena, pa i kad je tank u meduvremenu ispraznjen ili arhiviran.
    // Skrivanje bi ostavilo zapis zauvijek otvoren, bez ijednog gumba.
    prisma.fermentacija.findFirst({
      where: { tankId: id, krajAt: null, obrisano: false },
      orderBy: { pocetakAt: "desc" },
      select: { id: true, pocetakAt: true, kvasacNaziv: true },
    }),
  ]);

  const [zadnjeOcitanje, aktivniAlarmi, mjerenja, arhive, otvorenaFermentacija] =
    prviVal;

  // GRANICA ARHIVE — jedna crta za cijelu stranicu.
  //
  // Arhiviranje znaci da je u tanku bilo DRUGO vino. Mjerenja, zadatke,
  // punjenja i izlaze arhiviranje i brise, pa oni ionako ne mogu biti stariji.
  // ALI Radnja se ne arhivira ni ne brise, a Pretok i ZadatakTankStavka zive
  // na drugim tankovima — pa bi bez ove granice monitor novog vina pokazivao
  // radnje i pretoke prethodnoga. Izmjereno 23.08.2026: 71 takva radnja na 12
  // tankova.
  //
  // Filtar se stavlja i na ono sto se danas ionako brise (punjenja, izlazi,
  // mjerenja), da prikaz ostane tocan i ako se to ponasanje promijeni.
  const granicaArhive = arhive[0]?.arhiviranoAt ?? null;
  const odGranice = granicaArhive ? { gte: granicaArhive } : undefined;

  // Izlazi dolaze ugnijezdjeni iz glavnog upita, prije nego je granica poznata,
  // pa se filtriraju ovdje. Danas je to prazan hod jer arhiviranje brise
  // IzlazVina — ali ostaje tocno ako se to promijeni.
  const izlaziZaPrikaz = (tank.izlaziVina ?? []).filter(
    (x) => !granicaArhive || x.datum >= granicaArhive
  );

  // Ne cekaj — samo pokreni. Ceka se nize, kad rezultat stvarno zatreba.
  const blendUTijeku =
    tank.blendIzvori.length > 0
      ? parametriBlenda(prisma, id, { sirina: 2 })
      : Promise.resolve(null);

  // Drugi val. Prazan tank i dalje NE cita punjenja ni zadatke — uvjet je isti,
  // samo je preseljen u izraz; `Promise.all` prima i obicne vrijednosti, pa
  // `[]` prolazi bez upita.
  const [punjenja, otvoreniZadaci, izvrseniZadaci] = await Promise.all([
    prisma.punjenjeTanka.findMany({
      where: {
        tankId: id,
        datumPunjenja: odGranice,
        stavke: {
          some: {
            obrisano: false,
          },
        },
      },
      // SVA punjenja, ne samo najnovije — tank zna imati vise punjenja i
      // starija su jedini zapis o berbi koja je u njega usla.
      orderBy: { datumPunjenja: "desc" },
      include: {
        stavke: {
          where: {
            obrisano: false,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    }),

    prisma.zadatak.findMany({
      where: { tankId: id, status: "OTVOREN" },
      include: {
        preparat: {
          select: {
            id: true,
            naziv: true,
            dozaOd: true,
            dozaDo: true,
            unit: {
              select: {
                naziv: true,
              },
            },
          },
        },
        jedinica: true,
        izlaznaJedinica: true,
        zadaoKorisnik: true,
        izvrsioKorisnik: true,
        stavke: {
          include: {
            preparat: {
              select: {
                id: true,
                naziv: true,
                dozaOd: true,
                dozaDo: true,
                unit: {
                  select: {
                    naziv: true,
                  },
                },
              },
            },
            jedinica: true,
            izlaznaJedinica: true,
          },
          orderBy: {
            redoslijed: "asc",
          },
        },
      },
      orderBy: { zadanoAt: "desc" },
    }),

    prisma.zadatak.findMany({
      // Granica arhive, istim rezonom kao na punjenjima i izlazima u fazi 0:
      // arhiviranje danas brise zadatke, pa je filtar prazan hod — ali ostaje
      // tocan i kad se to promijeni, a promijenit ce se (brisanje originala je
      // vec na popisu).
      where: {
        tankId: id,
        status: { in: ["IZVRSEN", "OTKAZAN"] },
        izvrsenoAt: odGranice,
      },
      include: {
        preparat: {
          select: {
            id: true,
            naziv: true,
            dozaOd: true,
            dozaDo: true,
            unit: {
              select: {
                naziv: true,
              },
            },
          },
        },
        jedinica: true,
        izlaznaJedinica: true,
        zadaoKorisnik: true,
        izvrsioKorisnik: true,
        // Ciljni tankovi prijenosa. Bez njih se ne zna je li zadatak premjestio
        // vino ni kamo — a o tome ovisi je li u kronologiji ZADATAK ili
        // PRIJENOS_IZLAZ.
        tankStavke: {
          include: {
            ciljTank: { select: { broj: true } },
          },
          orderBy: { redoslijed: "asc" },
        },
        stavke: {
          include: {
            preparat: {
              select: {
                id: true,
                naziv: true,
                dozaOd: true,
                dozaDo: true,
                unit: {
                  select: {
                    naziv: true,
                  },
                },
              },
            },
            jedinica: true,
            izlaznaJedinica: true,
          },
          orderBy: {
            redoslijed: "asc",
          },
        },
      },
      orderBy: [{ izvrsenoAt: "desc" }, { zadanoAt: "desc" }],
      take: 30,
    }),

  ]);

  // Treci val — cetiri tablice koje postojeci monitor uopce nije citao.
  const [radnje, pretociUlaz, pretociIzlaz, dolasciPrijenosom] =
    await Promise.all([
      prisma.radnja.findMany({
        // Radnja se pri arhiviranju NE brise, pa bez granice ovdje vise radnji
        // prethodnog vina. To je bio vidljiv bug na produkciji.
        where: { tankId: id, createdAt: odGranice },
        orderBy: { createdAt: "desc" },
        include: {
          korisnik: { select: { ime: true, email: true } },
          preparat: { select: { naziv: true } },
          jedinica: { select: { naziv: true } },
        },
      }),
      // Pretok se dosad nije citao ni s jedne strane.
      prisma.pretok.findMany({
        // Kroz `ciljevi`, ne kroz `ciljTankId`: pretok od faze 4 moze imati vise
        // ciljeva. Dok ih ima tocno jedan, oba upita vracaju isti skup.
        where: { ciljevi: { some: { tankId: id } }, datum: odGranice },
        orderBy: { datum: "desc" },
        include: { izvori: { include: { tank: { select: { broj: true } } } } },
      }),
      prisma.pretokIzvor.findMany({
        where: { tankId: id, pretok: { datum: odGranice } },
        include: {
          pretok: {
            include: { ciljevi: { include: { tank: { select: { broj: true } } } } },
          },
        },
      }),
      // Prijenos vina zivi na IZVORNOM tanku; ciljni ga vidi samo ovuda.
      prisma.zadatakTankStavka.findMany({
        where: { ciljTankId: id, zadatak: { izvrsenoAt: odGranice } },
        include: {
          zadatak: {
            include: {
              tank: { select: { broj: true } },
              izvrsioKorisnik: { select: { ime: true, email: true } },
            },
          },
        },
      }),
    ]);

  // Parametri blenda cekali su svoj red iza svih valova, pa je stranica bila
  // duboka cetiri kruga. Sada se POKRECU ODMAH i teku USPOREDNO s drugim i
  // trecim valom, a ceka se tek ovdje. Sirina im je snizena na 2 da zbroj
  // istovremenih veza (val 4 + blend 2) ostane daleko od granice od 15.
  const blend = await blendUTijeku;

  // BERBA KROZ LANAC BLENDA — namjerno TEK OVDJE, a ne usporedno s valovima.
  //
  // Punjenja nastaju samo na `/api/punjenje`; pretok, filtracija, flotacija i
  // talozenje vino premjestaju i punjenja ne diraju. Tank napunjen pretokom
  // zato o svojoj berbi nema nijedan vlastiti zapis, a onaj koji postoji stoji
  // na tanku iz kojeg je vino doslo. `berbaKrozLanac` ga dohvaca istim putem
  // kojim `parametriBlenda` dohvaca mjerenja.
  //
  // ZASTO NE USPOREDNO: mjereno 23.08.2026, sedam istovremenih upita ove
  // stranice uz jos jedan proces na bazi vec je probilo pooler (`pool_size: 15`
  // za CIJELU aplikaciju) i vratilo 500. Vrsak je danas 6 (val od 4 + blend
  // sirine 2); pokretanjem ovoga uz njih bio bi 8, po istoj mjeri preblizu.
  // Ovako se placa jedan krug latencije, a ne rizik od EMAXCONNSESSION.
  //
  // Tank bez sastavnica nema odakle nasljedjivati — ni jedan upit.
  const berbaLanca =
    tank.blendIzvori.length > 0
      ? await berbaKrozLanac(prisma, id, { dubina: 2, sirina: 2 })
      : PRAZAN_LANAC;

  // Spoj sastavnice iz `parametriBlenda` na redak u popisu izvora. Ovdje je
  // sortirano po kolicini, ondje po vremenu upisa — pa ide po id-u.
  // Sumnjiv izvor koji NEMA nijedno polje ne ulazi u prosjek, pa nema o cemu
  // upozoravati — upozorava se samo na one koji stvarno doprinose vrijednosti.
  const blendSumnjive =
    blend?.sastavnice.filter((x) => x.sumnjiv && x.polja.length > 0) ?? [];

  const sastavnicaPoId = new Map(
    (blend?.sastavnice ?? []).map((s) => [s.id, s])
  );

  // ---------------------------------------------------------------------
  // Parametri vina — po polju, s povratkom na blend
  // ---------------------------------------------------------------------
  // Ne postoji "zadnji redak mjerenja" kao smislena stvar: secer se u
  // fermentaciji mjeri svaki dan, alkohol i kiseline svakih pet, SO2 tjedno.
  // Zato ide vrijednost PO SVAKOM POLJU zasebno (lib/mjerenja.ts), a polje bez
  // vlastitog mjerenja popunjava prosjek blenda i tada nosi oznaku procjene.
  //
  // Brana na arhiviranju: ne poseze se ispred zadnjeg `arhiviranoAt`, jer
  // starija mjerenja pripadaju PRETHODNOM vinu u istom tanku.
  // Pocetna mjerenja punjenja koja su SAMA nakon granice arhive. `punjenja` je
  // vec filtrirano granicom (`datumPunjenja: odGranice`), pa je svako punjenje
  // u ovom popisu po definiciji dio trenutnog vina — a s njim i njegovo
  // pocetno mjerenje, bez obzira sto ono nosi datum berbe (UTC ponoc) koji zna
  // biti raniji od sata arhiviranja. Vidi `mjerenjaTrenutnogVina`.
  const pocetnaMjerenjaNovogVina = new Set(
    punjenja
      .map((p) => p.pocetnoMjerenjeId)
      .filter((x): x is string => x !== null)
  );

  const mjerenjaZaParametre = mjerenjaTrenutnogVina(
    mjerenja,
    granicaArhive,
    pocetnaMjerenjaNovogVina
  ) as unknown as RedakMjerenja[];

  const poPolju = sloziPoPolju(mjerenjaZaParametre);

  const OPIS_POLJA: Array<{
    kljuc: keyof typeof poPolju.vrijednosti;
    naziv: string;
    jedinica: string;
  }> = [
    { kljuc: "alkohol", naziv: "Alkohol", jedinica: "%" },
    { kljuc: "secer", naziv: "Šećer", jedinica: "" },
    { kljuc: "ukupneKiseline", naziv: "Ukupne kiseline", jedinica: "" },
    { kljuc: "hlapiveKiseline", naziv: "Hlapive kiseline", jedinica: "" },
    { kljuc: "slobodniSO2", naziv: "Slobodni SO₂", jedinica: "" },
    { kljuc: "ukupniSO2", naziv: "Ukupni SO₂", jedinica: "" },
    { kljuc: "ph", naziv: "pH", jedinica: "" },
    { kljuc: "temperatura", naziv: "Temperatura", jedinica: "°C" },
  ];

  const parametri: ParametarPrikaz[] = OPIS_POLJA.map((o) => {
    const izvor = poPolju.izvorPolja[o.kljuc];
    const vlastita = poPolju.vrijednosti[o.kljuc];
    const b = blend?.poPolju[o.kljuc] ?? null;

    // "preneseno" = vlastiti redak koji je upisao pretok (jeRucno = false).
    // Ni to nitko nije izmjerio, pa ide u isti vizualni razred kao blend.
    const podrijetlo: ParametarPrikaz["podrijetlo"] =
      vlastita != null
        ? izvor?.jeRucno === false
          ? "preneseno"
          : "mjereno"
        : b?.vrijednost != null
          ? "blend"
          : "nema";

    return {
      kljuc: o.kljuc,
      naziv: o.naziv,
      jedinica: o.jedinica,
      vrijednost: vlastita != null ? vlastita : (b?.vrijednost ?? null),
      podrijetlo,
      datum: izvor?.izmjerenoAt.toISOString() ?? null,
      niz: nizPolja(mjerenjaZaParametre, o.kljuc).map((t) => ({
        t: t.izmjerenoAt.toISOString(),
        v: t.vrijednost,
        rucno: t.jeRucno,
      })),
      blend: b
        ? {
            vrijednost: b.vrijednost,
            postotak: b.postotak,
            pokrivenoL: b.pokrivenoL,
            ukupnoL: b.ukupnoL,
            doprinosi: b.doprinosi,
          }
        : null,
    };
  });

  const brojIzmjerenih = parametri.filter(
    (p) => p.podrijetlo === "mjereno"
  ).length;
  const brojProcjena = parametri.filter(
    (p) => p.podrijetlo === "blend" || p.podrijetlo === "preneseno"
  ).length;
  const brojPopunjenih = brojIzmjerenih + brojProcjena;
  const poljaIzBlenda = parametri
    .filter((p) => p.podrijetlo === "blend")
    .map((p) => p.naziv);

  // Bentotest NIJE brojka koja se ponderira — zaseban je postupak s vlastitim
  // datumom, pa stoji u podnozju kartice, izvan mreze pocica.
  const bentotest = zadnjiBentotest(mjerenjaZaParametre);

  // Podaci o berbi stoje GORE, otvoreno: fiksni su i ne mijesaju se s tekucim
  // mjerenjima. Sam dogadaj punjenja ostaje dolje, u sklopljenoj kartici.
  // Poredane po DATUMU BERBE, istim pravilom kao naslijedjene (usporediPoBerbi).
  //
  // Ne po datumu punjenja: bacva u koju ide zadnji, mutniji dio mosta puni se
  // IZRAVNO IZ PRESE kroz vise dana i vise berbi, pa i vlastitih stavki zna
  // imati desetak. Poredane po punjenju one stoje obrnuto i izmijesano, a
  // popis odmah ispod njih (naslijedjene) ide kronoloski — dva poretka u istoj
  // kartici citaju se kao greska. Kronologija punjenja se time ne gubi: sam
  // dogadaj punjenja i dalje stoji u kartici Kronologija.
  const stavkeBerbe = punjenja
    .flatMap((p) => p.stavke.map((s) => ({ punjenje: p, s })))
    .sort((a, b) =>
      usporediPoBerbi(
        {
          datumBerbe: a.s.datumBerbe,
          datumPunjenja: a.punjenje.datumPunjenja,
          tezina: Number(a.s.kolicinaLitara ?? 0),
          kljuc: a.s.id,
        },
        {
          datumBerbe: b.s.datumBerbe,
          datumPunjenja: b.punjenje.datumPunjenja,
          tezina: Number(b.s.kolicinaLitara ?? 0),
          kljuc: b.s.id,
        }
      )
    );

  const imaPodatakaOBerbi = stavkeBerbe.some(
    ({ s }) =>
      s.parcela ||
      s.vinograd ||
      s.oznakaBerbe ||
      s.datumBerbe ||
      s.godinaBerbe != null ||
      s.secer != null ||
      s.kiseline != null ||
      s.ph != null ||
      s.polozaj ||
      s.napomenaBerbe ||
      s.maceracija != null
  );

  // Naslijedjeno kroz blend. Vlastite stavke idu GORE, naslijedjene ispod —
  // ono sto je u ovaj tank stvarno uslo nije isto sto i ono sto je uslo u
  // njegov izvor, pa se ne smiju izmijesati u jedan popis.
  const naslijedenoStavki = berbaLanca.stavke.length;

  // Kartica se prikazuje i kad tank NEMA nijedno svoje punjenje — to je i bio
  // cijeli problem: tank napunjen pretokom nije pokazivao nikakvu berbu.
  //
  // Od 28.08.2026 kartica nosi i gumb granice fermentacije, pa se prikazuje i
  // kad zapisa berbe uopce nema: bez toga bi tank bez berbe ostao bez ijednog
  // nacina da se fermentacija otvori ili zatvori. Gumb se ionako prikazuje
  // samo roli koja ga smije koristiti (FermentacijaGumb vraca null inace).
  const smijeFermentaciju = smijeUPodrumu(prijavljeni.role);
  const prikaziBerbu =
    imaPodatakaOBerbi || naslijedenoStavki > 0 || smijeFermentaciju;

  const ukupnoZapisa =
    mjerenja.length +
    otvoreniZadaci.length +
    izvrseniZadaci.length +
    radnje.length +
    pretociUlaz.length +
    pretociIzlaz.length +
    punjenja.length +
    izlaziZaPrikaz.length +
    arhive.length +
    dolasciPrijenosom.length;

  const mjerenjaZaTop = mjerenja;
  // Popis mjerenja poštuje istu granicu kao mreža parametara. Ne koristi
  // mjerenjaZaParametre jer je ono suženo na tip RedakMjerenja, bez napomene.
  const svaMjerenja = (
    granicaArhive
      ? mjerenja.filter((m) => m.izmjerenoAt >= granicaArhive)
      : mjerenja
  ).slice(0, 100);

  // ---------------------------------------------------------------------------
  // KRONOLOGIJA
  //
  // Jedan slijed umjesto sest kartica. Sve se slaze OVDJE, na posluzitelju —
  // kronologija.tsx je klijentska samo zbog filtra i ne racuna nista.
  //
  // Svi izvori su vec dohvaceni gore i vec filtrirani granicom arhive, pa
  // kronologija ne dodaje nijedan upit.
  //
  // MJERENJA NISU OVDJE: ostaju vlastita kartica sa svojim grafom po parametru.
  // ---------------------------------------------------------------------------
  const dogadaji: Dogadaj[] = [];

  for (const p of punjenja) {
    const kg = p.stavke.reduce(
      (zbroj, s) => zbroj + Number(s.kolicinaKgGrozdja ?? 0),
      0
    );

    dogadaji.push({
      id: `pun-${p.id}`,
      vrsta: "PUNJENJE",
      vrijeme: p.datumPunjenja.toISOString(),
      naslov: p.nazivVina || "Punjenje tanka",
      podnaslov: p.stavke.map((s) => s.nazivSorte).join(", ") || null,
      // PunjenjeTanka nema polje korisnika — vidi fazu 3b. Radije nista nego
      // pogadjanje.
      iznos: `${formatBroj(p.ukupnoLitara, 0)} L`,
      detalji: [
        { label: "Ukupno litara", value: `${formatBroj(p.ukupnoLitara)} L` },
        { label: "Ukupno kg grožđa", value: kg > 0 ? `${formatBroj(kg)} kg` : "—" },
        { label: "Napomena", value: p.napomena || "—" },
        ...p.stavke.flatMap((s) => [
          { label: `— ${s.nazivSorte}`, value: `${formatBroj(s.kolicinaLitara)} L` },
          {
            label: "   Kg grožđa",
            value: s.kolicinaKgGrozdja != null ? `${formatBroj(s.kolicinaKgGrozdja)} kg` : "—",
          },
          { label: "   Vinograd", value: s.vinograd || "—" },
          { label: "   Parcela", value: s.parcela || "—" },
          { label: "   Položaj", value: s.polozaj || "—" },
          { label: "   Oznaka berbe", value: s.oznakaBerbe || "—" },
          { label: "   Datum berbe", value: s.datumBerbe ? formatDatumBezVremena(s.datumBerbe) : "—" },
          { label: "   Šećer", value: s.secer != null ? formatBroj(s.secer) : "—" },
          { label: "   Kiseline", value: s.kiseline != null ? formatBroj(s.kiseline) : "—" },
          { label: "   pH", value: s.ph != null ? formatBroj(s.ph) : "—" },
          { label: "   Napomena berbe", value: s.napomenaBerbe || "—" },
        ]),
      ],
    });
  }

  for (const z of izvrseniZadaci) {
    const preparati =
      z.stavke.length > 0
        ? z.stavke
            .map((s) =>
              `${s.preparat?.naziv ?? "?"} ${formatBroj(s.izracunataKolicina)} ${
                s.izlaznaJedinica?.naziv ?? s.jedinica?.naziv ?? ""
              }`.trim()
            )
            .join(" · ")
        : z.preparat?.naziv ?? null;

    const ciljevi =
      z.tankStavke.length > 0
        ? z.tankStavke
            .map((s) => `tank ${s.ciljTank.broj}: ${formatBroj(s.kolicina)} L`)
            .join(" · ")
        : null;

    dogadaji.push({
      id: `zad-${z.id}`,
      // Zadatak koji je premjestio vino je prijenos, ne obican zadatak — inace
      // se u filtru ne razlikuje "dodali smo preparat" od "vino je otislo".
      vrsta: z.tankStavke.length > 0 ? "PRIJENOS_IZLAZ" : "ZADATAK",
      vrijeme: (z.izvrsenoAt ?? z.zadanoAt).toISOString(),
      naslov: `${z.naslov?.trim() || String(z.vrsta)}${
        z.status === "OTKAZAN" ? " (otkazan)" : ""
      }`,
      podnaslov: [preparati, ciljevi].filter(Boolean).join(" → ") || null,
      tko: z.izvrsenoAt
        ? `Izvršio: ${prikaziKorisnika(z.izvrsioKorisnik)}`
        : `Zadao: ${prikaziKorisnika(z.zadaoKorisnik)}`,
      iznos: z.kolicinaIzlaz != null ? `−${formatBroj(z.kolicinaIzlaz, 0)} L` : null,
      detalji: [
        { label: "Vrsta", value: String(z.vrsta) },
        { label: "Status", value: String(z.status) },
        {
          label: "Zadao",
          value: `${prikaziKorisnika(z.zadaoKorisnik)} · ${formatDatum(z.zadanoAt)}`,
        },
        {
          label: "Izvršio",
          value: z.izvrsenoAt
            ? `${prikaziKorisnika(z.izvrsioKorisnik)} · ${formatDatum(z.izvrsenoAt)}`
            : "—",
        },
        ...(z.kolicinaIzlaz != null
          ? [{ label: "Izašlo", value: `${formatBroj(z.kolicinaIzlaz)} L` }]
          : []),
        ...(z.gubitakLitara != null
          ? [{ label: "Gubitak", value: `${formatBroj(z.gubitakLitara)} L` }]
          : []),
        ...(z.maceracija != null
          ? [
              {
                label: "Maceracija",
                value: z.maceracija
                  ? `da${z.maceracijaOpis ? ` — ${z.maceracijaOpis}` : ""}`
                  : "ne",
              },
            ]
          : []),
        ...z.tankStavke.map((s) => ({
          label: `→ tank ${s.ciljTank.broj}`,
          value: `${formatBroj(s.kolicina)} L`,
        })),
        ...z.stavke.map((s) => ({
          label: s.preparat?.naziv ?? "preparat",
          value: `${formatBroj(s.izracunataKolicina)} ${
            s.izlaznaJedinica?.naziv ?? s.jedinica?.naziv ?? ""
          }`.trim(),
        })),
        { label: "Napomena", value: z.napomena || "—" },
      ],
    });
  }

  for (const s of dolasciPrijenosom) {
    dogadaji.push({
      id: `dol-${s.id}`,
      vrsta: "PRIJENOS_ULAZ",
      vrijeme: (s.zadatak.izvrsenoAt ?? s.zadatak.zadanoAt).toISOString(),
      naslov: `Dolazak vina iz tanka ${s.zadatak.tank.broj}`,
      podnaslov: `${String(s.zadatak.vrsta)} — ${
        s.zadatak.naslov?.trim() || "bez naslova"
      }`,
      tko: s.zadatak.izvrsenoAt
        ? `Izvršio: ${prikaziKorisnika(s.zadatak.izvrsioKorisnik)}`
        : null,
      iznos: `+${formatBroj(s.kolicina, 0)} L`,
      detalji: [
        { label: "Iz tanka", value: String(s.zadatak.tank.broj) },
        { label: "Količina", value: `${formatBroj(s.kolicina)} L` },
        { label: "Vrsta prijenosa", value: String(s.zadatak.vrsta) },
        { label: "Izvršeno", value: formatDatum(s.zadatak.izvrsenoAt) },
      ],
    });
  }

  // Radnja koja pripada zadatku vec je prikazana kao zadatak — inace bi svaki
  // izvrsen zadatak stajao dvaput. Prikazuju se samo samostalne radnje.
  for (const r of radnje) {
    if (r.zadatakId !== null) continue;

    dogadaji.push({
      id: `rad-${r.id}`,
      vrsta: "RADNJA",
      vrijeme: r.createdAt.toISOString(),
      naslov: r.opis || String(r.vrsta),
      podnaslov: r.preparat?.naziv
        ? `${r.preparat.naziv}${
            r.kolicina != null
              ? ` — ${formatBroj(r.kolicina)} ${r.jedinica?.naziv ?? ""}`.trimEnd()
              : ""
          }`
        : String(r.vrsta),
      tko: `Upisao: ${prikaziKorisnika(r.korisnik)}`,
      // Litre samo kad radnja NIJE o preparatu — inace bi "12,5" iz doze
      // preparata izgledalo kao litre vina.
      iznos: r.kolicina != null && !r.preparatId ? `${formatBroj(r.kolicina, 0)} L` : null,
      detalji: [
        { label: "Vrsta", value: String(r.vrsta) },
        { label: "Preparat", value: r.preparat?.naziv || "—" },
        {
          label: "Količina",
          value:
            r.kolicina != null
              ? `${formatBroj(r.kolicina)} ${r.jedinica?.naziv ?? ""}`.trim()
              : "—",
        },
        { label: "Napomena", value: r.napomena || "—" },
      ],
    });
  }

  for (const p of pretociUlaz) {
    const ukupno = p.izvori.reduce((zbroj, i) => zbroj + Number(i.kolicina ?? 0), 0);

    dogadaji.push({
      id: `pu-${p.id}`,
      vrsta: "PRETOK_ULAZ",
      vrijeme: p.datum.toISOString(),
      naslov: `Pretok u ovaj tank (${p.tip})`,
      podnaslov:
        p.izvori
          .map((i) => `tank ${i.tank.broj}: ${formatBroj(i.kolicina)} L`)
          .join(" · ") || null,
      // Pretok nema polje korisnika — vidi fazu 3b.
      iznos: `+${formatBroj(ukupno, 0)} L`,
      detalji: [
        { label: "Tip pretoka", value: String(p.tip) },
        ...p.izvori.map((i) => ({
          label: `iz tanka ${i.tank.broj}`,
          value: `${formatBroj(i.kolicina)} L`,
        })),
        { label: "Napomena", value: p.napomena || "—" },
      ],
    });
  }

  for (const i of pretociIzlaz) {
    dogadaji.push({
      id: `pi-${i.id}`,
      vrsta: "PRETOK_IZLAZ",
      vrijeme: i.pretok.datum.toISOString(),
      naslov: `Pretok iz ovog tanka u ${opisiCiljeve(i.pretok.ciljevi)}`,
      podnaslov: `Tip: ${i.pretok.tip}`,
      iznos: `−${formatBroj(i.kolicina, 0)} L`,
      detalji: [
        ...i.pretok.ciljevi.map((c) => ({
          label: "U tank",
          value: `${c.tank.broj} — ${formatBroj(c.kolicina)} L`,
        })),
        { label: "Količina", value: `${formatBroj(i.kolicina)} L` },
        { label: "Tip pretoka", value: String(i.pretok.tip) },
        { label: "Napomena", value: i.pretok.napomena || "—" },
      ],
    });
  }

  for (const x of izlaziZaPrikaz) {
    dogadaji.push({
      id: `iz-${x.id}`,
      vrsta: "IZLAZ",
      vrijeme: x.datum.toISOString(),
      naslov: x.tip === "PUNJENJE" ? "Punjenje u boce" : "Prodaja / rinfuza",
      podnaslov: x.brojBoca
        ? `${x.brojBoca} boca × ${formatBroj(x.volumenBoce)} L`
        : null,
      // IzlazVina nema polje korisnika — vidi fazu 3b.
      iznos: `−${formatBroj(x.kolicinaLitara, 0)} L`,
      detalji: [
        { label: "Tip", value: String(x.tip) },
        { label: "Litara", value: `${formatBroj(x.kolicinaLitara)} L` },
        { label: "Broj boca", value: x.brojBoca != null ? String(x.brojBoca) : "—" },
        { label: "Napomena", value: x.napomena || "—" },
      ],
    });
  }

  // Arhiva ostaje i kao vlastita kartica (ondje je poveznica "Otvori arhivu"),
  // a ovdje stoji zato sto objasnjava zasto povijest iznad nje prestaje.
  for (const a of arhive) {
    dogadaji.push({
      id: `ar-${a.id}`,
      vrsta: "ARHIVA",
      vrijeme: a.arhiviranoAt.toISOString(),
      naslov: `Arhivirano: ${a.nazivVina ?? "bez naziva"}`,
      podnaslov: `${a.sorta ?? "—"} · ${formatBroj(
        a.kolicinaVina,
        0
      )} L — tank je tada ispražnjen`,
      iznos: `${formatBroj(a.kolicinaVina, 0)} L`,
      detalji: [
        { label: "Naziv vina", value: a.nazivVina || "—" },
        { label: "Sorta", value: a.sorta || "—" },
        { label: "Količina", value: `${formatBroj(a.kolicinaVina)} L` },
        { label: "Arhivirano", value: formatDatum(a.arhiviranoAt) },
      ],
    });
  }

  dogadaji.sort(
    (a, b) => new Date(b.vrijeme).getTime() - new Date(a.vrijeme).getTime()
  );


  // Zadana koja se prikazuje je STVARNA - ona koju je gateway zadnji put procitao
  // s kontrolera. Tank.zadanaTemp je samo zelja i moze zaostati ako komanda propadne.
  // Soft-OFF: zadana = SOFT_OFF_TEMP (20,0 C) znaci "hladjenje iskljuceno" -
  // kontroler nema Modbus registar za ON/OFF (vidi lib/tank-komanda.ts).
  const zadanaStvarna = stvarnaZadana(
    zadnjeOcitanje?.zadanaTemperatura,
    tank.zadanaTemp
  );
  const hladjenjeIskljuceno = jeHladjenjeIskljuceno(zadanaStvarna);
  const tempStatus = izracunajStatus({
    mjerenoU: zadnjeOcitanje?.mjerenoU ?? null,
    imaAktivanAlarm: aktivniAlarmi.length > 0,
    hladjenjeIskljuceno,
  });
  const tempStil = stilZaStatus(tempStatus);
  const hladiSad = hladjenjeIskljuceno ? false : (zadnjeOcitanje?.hladjenjeAktivno ?? null);

  const zadnje = sloziZadnjeMjerenjePoPoljima(mjerenjaZaTop);
  const from = `/tankovi/${tank.id}`;

  // PONUDA POCETKA — zadnje izvrseno DODAVANJE na ovom tanku.
  //
  // Bez ijednog novog upita: `izvrseniZadaci` su vec procitani, sa stavkama i
  // nazivima preparata. Racuna se samo kad tank NEMA otvorenu fermentaciju,
  // jer se pri zatvaranju ne nudi nista.
  //
  // Filtar po `jeKvasac` dolazi OVDJE — i samo ovdje. Danas ga nema jer
  // nijedan od 76 preparata nije oznacen, pa bi uvijek dao prazno; nudi se
  // ZADNJE DODAVANJE i imenuju se preparati iz njega, a covjek prosudi je li
  // to inokulacija. Cim katalog bude oznacen, ovdje se doda uvjet i ponuda
  // postane uza — forma se ne mijenja.
  //
  // TAJ FILTAR NE SMIJE POBJECI NA ISPIS. Dnevnik fermentacije prikazuje SVE
  // sto je islo u most — kvasac, hranu, enzime, zastitne pripravke — iz
  // Zadatak/ZadatakStavka bez ijednog filtra. `jeKvasac` odgovara samo na
  // "sto forma smije ponuditi kao pocetak".
  const ponudaKvasca = otvorenaFermentacija
    ? null
    : (() => {
        const kandidat = izvrseniZadaci
          .filter((z) => z.vrsta === "DODAVANJE" && z.status === "IZVRSEN" && z.izvrsenoAt)
          .sort(
            (a, b) =>
              new Date(b.izvrsenoAt as Date).getTime() -
              new Date(a.izvrsenoAt as Date).getTime()
          )[0];

        if (!kandidat?.izvrsenoAt) return null;

        const nazivi = [
          ...(kandidat.preparat?.naziv ? [kandidat.preparat.naziv] : []),
          ...kandidat.stavke.map((x) => x.preparat?.naziv).filter((x): x is string => !!x),
        ];

        return {
          zadatakId: kandidat.id,
          izvrsenoAt: kandidat.izvrsenoAt.toISOString(),
          preparati: [...new Set(nazivi)],
        };
      })();

  const slobodno =
    Number(tank.kapacitet ?? 0) - Number(tank.kolicinaVinaUTanku ?? 0);

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <h1 style={titleStyle}>Tank {tank.broj}</h1>
            <div style={subtitleStyle}>Pregled tanka, vina i radnji</div>
          </div>

          <div style={headerBadgesWrapStyle}>
            <div style={headerBadgeStyle}>Sastav: {oznakaSastava}</div>
            <div style={headerBadgeStyle}>Tip: {tank.tip ?? "-"}</div>
            <div style={headerBadgeStyle}>
              Ukupno sastav: {ukupnoPostotakRounded}%
            </div>
          </div>

          <div style={headerActionsStyle}>
            <NatragNaPrethodnu />
            <TankRoleActions
              rola={prijavljeni.role}
              tankId={tank.id}
              brojTanka={tank.broj}
              primaryStyle={linkButtonPrimaryStyle}
              secondaryStyle={linkButtonSecondaryStyle}
            />
          </div>
        </div>

        <TankSwitcher currentId={id} />
      </div>

      <Link
        href={`/tankovi/${tank.id}/izvjestaj`}
        style={linkButtonPrimaryStyle}
      >
        Izvještaj
      </Link>

      {tank.nazivVina?.trim() ? (
        <div style={nazivVinaStyle}>{tank.nazivVina}</div>
      ) : null}

      <div style={topParamsGridStyle}>
        <ParamTop
          label="Količina vina"
          value={formatBroj(tank.kolicinaVinaUTanku)}
          unit="L"
        />
        <ParamTop
          label="Kapacitet"
          value={formatBroj(tank.kapacitet)}
          unit="L"
        />
        <ParamTop label="Slobodno" value={formatBroj(slobodno)} unit="L" />
      </div>

      {/* Prazan tank NE skriva povijest — samo kaze da je prazan. */}
      {tankJePrazan && ukupnoZapisa > 0 ? (
        <div style={obavijestPrazanStyle}>
          Tank je trenutno prazan, ali ima <strong>{ukupnoZapisa}</strong> zapisa
          u povijesti — svi su ispod, u sklopljenim karticama.
        </div>
      ) : null}

      <Card
        title="Parametri vina"
        pod={
          brojPopunjenih === 0
            ? "nema podataka"
            : `${brojPopunjenih}/8 popunjeno · ${brojIzmjerenih} izmjereno${
                brojProcjena > 0 ? ` · ${brojProcjena} procjena` : ""
              }`
        }
      >
        <div style={measurementWrapStyle}>
          {/* Mreza od osam polja: svako nosi VLASTITU najnoviju vrijednost i
              vlastiti datum, a polje bez vlastitog mjerenja popunjava prosjek
              blenda i tada nosi "≈". Klik otvara graf tog parametra kroz
              vrijeme, odnosno racun iz kojeg je procjena nastala. */}
          <ParametriPoPolju parametri={parametri} />

          {/* Bentotest NIJE brojka koja se ponderira nego zaseban postupak s
              vlastitim datumom — zato stoji ispod mreze, ne u njoj. */}
          <div style={measurementSecondaryGridStyle}>
            <ParamTop
              label="Bentotest datum"
              value={
                bentotest?.datum
                  ? formatDatumBezVremena(bentotest.datum)
                  : "—"
              }
            />
            <ParamTop
              label="Bentotest status"
              value={
                bentotest?.status === "STABILNO"
                  ? "Stabilno"
                  : bentotest?.status === "NESTABILNO"
                    ? "Nestabilno"
                    : "—"
              }
              tone={
                bentotest?.status === "STABILNO"
                  ? "green"
                  : bentotest?.status === "NESTABILNO"
                    ? "red"
                    : "default"
              }
            />
          </div>
        </div>

        <div style={metaBlockStyle}>
          <div>
            Svaki parametar nosi vlastiti datum — šećer se mjeri svakodnevno, a
            alkohol i kiseline rjeđe, pa ne pripadaju istom mjerenju.
          </div>
          <div>
            Zadnje klasično mjerenje:{" "}
            {zadnje?.izmjerenoAt ? formatDatum(zadnje.izmjerenoAt) : "nema mjerenja"}
          </div>
          <div>
            Zadnji bentotest:{" "}
            {bentotest?.izmjerenoAt
              ? formatDatum(bentotest.izmjerenoAt)
              : "nema bentotesta"}
          </div>
          {zadnje?.napomena ? <div>Napomena: {zadnje.napomena}</div> : null}
          {granicaArhive ? (
            <div>
              Prikazana su mjerenja od zadnjeg arhiviranja (
              {formatDatumBezVremena(granicaArhive)}) nadalje — starija pripadaju
              prethodnom vinu.
            </div>
          ) : null}
        </div>
      </Card>

      {/* --- BERBA: fiksni podaci o grozdju koje je uslo u tank. Stoje GORE,
              otvoreno, i ne mijesaju se s tekucim mjerenjima. --- */}
      {prikaziBerbu ? (
        <BerbaPrekidac
          broj={stavkeBerbe.length + naslijedenoStavki}
          pod={
            naslijedenoStavki > 0
              ? `${stavkeBerbe.length} s ovog tanka · ${naslijedenoStavki} kroz blend`
              : "stavki punjenja"
          }
          akcija={
            // Fermentacija je svojstvo VINA, ne posude — zato stoji ovdje, uz
            // berbu, a ne medu radnjama nad tankom (Arhiviraj, Sastav).
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FermentacijaGumb
                tankId={tank.id}
                brojTanka={tank.broj}
                smije={smijeFermentaciju}
                otvorena={
                  otvorenaFermentacija
                    ? {
                        id: otvorenaFermentacija.id,
                        pocetakAt: otvorenaFermentacija.pocetakAt.toISOString(),
                        kvasacNaziv: otvorenaFermentacija.kvasacNaziv,
                      }
                    : null
                }
                ponuda={ponudaKvasca}
                tankJePrazan={tankJePrazan}
                style={linkButtonPrimaryStyle}
              />

              {/* Dnevnik se nudi samo kad fermentacija postoji — prazan papir
                  nikome ne treba. */}
              {otvorenaFermentacija ? (
                <Link
                  href={`/fermentacija/${otvorenaFermentacija.id}`}
                  style={linkButtonSecondaryStyle}
                >
                  Dnevnik fermentacije
                </Link>
              ) : (
                <Link href="/fermentacija" style={linkButtonSecondaryStyle}>
                  Fermentacije
                </Link>
              )}
            </div>
          }
        >
          <div style={{ display: "grid", gap: 10, padding: 10 }}>
            {stavkeBerbe.length === 0 && naslijedenoStavki === 0 ? (
              <div style={mutedTextStyle}>
                Za ovaj tank nema zapisa berbe — ni vlastitog punjenja ni
                naslijeđenog kroz blend.
              </div>
            ) : null}

            {stavkeBerbe.map(({ punjenje, s }) => (
              <BerbaStavkaKartica
                key={s.id}
                s={s}
                podnaslov={
                  <>
                    {punjenje.nazivVina ?? "bez naziva vina"} · punjeno{" "}
                    {formatDatumBezVremena(punjenje.datumPunjenja)}
                  </>
                }
              />
            ))}

            {/* --- NASLIJEDJENO KROZ BLEND ---
                Litre i kilogrami su IZVORNI, onakvi kakvi su zapisani pri
                punjenju izvora — ne skaliraju se na udio koji je presao. Kg
                grozdja i secer opisuju berbenu partiju, ne sadrzaj tanka;
                skaliranje bi izmislilo kilograme koje nitko nije izvagao.
                Omjer stoji u zaglavlju puta ("preslo 4.800 L od 5.200 L"). */}
            {naslijedenoStavki > 0 ? (
              <>
                <div style={naslijedenoZaglavljeStyle}>
                  Naslijeđeno kroz blend
                </div>

                {/* SAZETAK — namjerno BEZ zbroja kilograma. Iz svake berbe je
                    dosao samo dio, pa bi zbrojeni kilogrami tvrdili grozdje
                    koje u ovaj tank nikad nije uslo. Litre se smiju zbrojiti
                    jer se za njih zna koliko ih je stvarno preslo. */}
                <div style={sazetakLancaStyle}>
                  <strong>
                    {berbaLanca.sazetak.zapisa}{" "}
                    {hrvatskiOblik(
                      berbaLanca.sazetak.zapisa,
                      "zapis berbe",
                      "zapisa berbe",
                      "zapisa berbe"
                    )}
                  </strong>{" "}
                  iz {berbaLanca.sazetak.izravnihIzvora}{" "}
                  {hrvatskiOblik(
                    berbaLanca.sazetak.izravnihIzvora,
                    "izvora",
                    "izvora",
                    "izvora"
                  )}{" "}
                  · ukupno prešlo{" "}
                  <strong>
                    {formatBroj(berbaLanca.sazetak.presloUkupnoL, 0)} L
                  </strong>
                  {berbaLanca.sazetak.odDatuma && berbaLanca.sazetak.doDatuma ? (
                    <>
                      {" · berba "}
                      {formatDatumBezVremena(berbaLanca.sazetak.odDatuma)}
                      {berbaLanca.sazetak.odDatuma.getTime() !==
                      berbaLanca.sazetak.doDatuma.getTime()
                        ? ` – ${formatDatumBezVremena(berbaLanca.sazetak.doDatuma)}`
                        : ""}
                    </>
                  ) : null}
                </div>

                <div style={mutedTextStyle}>
                  Berba se upisuje na tank u koji je grožđe ušlo. Ovo je berba
                  izvora ovog vina, poredana po datumu berbe. Litre i kilogrami
                  su onakvi kakvi su ondje zapisani — iz svakog izvora prešao je
                  samo dio, pa se <strong>kilogrami ne zbrajaju</strong>.
                </div>

                {berbaLanca.stavke.slice(0, NASLIJEDENO_ODMAH).map((x) => (
                  <NaslijedenaStavka key={x.kljuc} x={x} />
                ))}

                {/* Ostatak iza <details> — bez JS-a, radi i na posluzitelju. */}
                {berbaLanca.stavke.length > NASLIJEDENO_ODMAH ? (
                  <details style={{ display: "grid", gap: 10 }}>
                    <summary style={prikaziSveStyle}>
                      Prikaži još{" "}
                      {berbaLanca.stavke.length - NASLIJEDENO_ODMAH}{" "}
                      {hrvatskiOblik(
                        berbaLanca.stavke.length - NASLIJEDENO_ODMAH,
                        "zapis berbe",
                        "zapisa berbe",
                        "zapisa berbe"
                      )}
                    </summary>
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      {berbaLanca.stavke.slice(NASLIJEDENO_ODMAH).map((x) => (
                        <NaslijedenaStavka key={x.kljuc} x={x} />
                      ))}
                    </div>
                  </details>
                ) : null}

                {berbaLanca.staloNaDubini ? (
                  <div style={mutedTextStyle}>
                    Lanac se čita dvije razine duboko. Ispod zadnje prikazane
                    razine može biti još izvora — oni se ne čitaju.
                  </div>
                ) : null}
                {berbaLanca.preskocenoCiklusa > 0 ? (
                  <div style={mutedTextStyle}>
                    Preskočeno izvora jer su se već pojavili u lancu:{" "}
                    {berbaLanca.preskocenoCiklusa}.
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </BerbaPrekidac>
      ) : null}

      <div id="hladjenje" style={{ scrollMarginTop: 16 }} />

      <Card title="Temperatura" pod="samo prikaz">
        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.4px",
                background: tempStil.bg,
                border: `1px solid ${tempStil.border}`,
                color: tempStil.text,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  background: tempStil.dot,
                }}
              />
              {tempStil.label}
            </span>
            <span style={{ fontSize: 12, color: "#777" }}>
              Zadnje očitanje:{" "}
              {zadnjeOcitanje
                ? `${formatDatum(zadnjeOcitanje.mjerenoU)} (${prijeKoliko(
                    zadnjeOcitanje.mjerenoU
                  )})`
                : "nema očitanja"}
            </span>
          </div>

          <div style={topParamsGridStyle}>
            <ParamTop
              label="Trenutna temperatura"
              value={formatTemp(zadnjeOcitanje?.temperatura)}
              unit="°C"
              emphasize
              tone={tempStatus === "ALARM" ? "red" : "default"}
            />
            <ParamTop
              label={hladjenjeIskljuceno ? "Zadana (zapamćena)" : "Zadana temperatura"}
              value={formatTemp(
                hladjenjeIskljuceno ? tank.zadnjaZadanaTemp ?? tank.zadanaTemp : zadanaStvarna
              )}
              unit="°C"
            />
            <ParamTop
              label="Hlađenje"
              value={
                hladjenjeIskljuceno
                  ? "Isključeno"
                  : hladiSad == null
                    ? "—"
                    : hladiSad
                      ? "Hladi (ON)"
                      : "Ne hladi (OFF)"
              }
              tone={hladiSad ? "green" : "default"}
            />
          </div>

          <div style={topParamsGridStyle}>
            <ParamTop
              label="Alarm −"
              value={formatTemp(tank.alarmMinus)}
              unit="°C"
            />
            <ParamTop
              label="Alarm +"
              value={formatTemp(tank.alarmPlus)}
              unit="°C"
            />
            <ParamTop
              label="Modbus adresa"
              value={tank.modbusAdresa ?? "—"}
            />
          </div>

          {aktivniAlarmi.length > 0 ? (
            <div
              style={{
                border: "1px solid #e0776f",
                background: "#fdecec",
                padding: 12,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 700, color: "#a11d1d", fontSize: 13 }}>
                Aktivni alarmi
              </div>
              {aktivniAlarmi.map((a) => (
                <div key={a.id} style={{ fontSize: 13, color: "#a11d1d" }}>
                  <strong>{a.tip}</strong> — {a.poruka}{" "}
                  <span style={{ color: "#c06a63" }}>
                    ({formatDatum(a.nastaoU)})
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <HladjenjeGraf tankId={tank.id} zadanaPocetna={zadanaStvarna} />

          <div style={{ fontSize: 11, color: "#999" }}>
            Zadana temperatura i pragovi alarma mijenjaju se na{" "}
            <Link href="/dashboard/hladjenje" style={{ color: "#1f6f8b" }}>
              dashboardu hlađenja
            </Link>
            .
          </div>
        </div>
      </Card>

      <Card title="Otvoreni zadaci" broj={otvoreniZadaci.length}>
        {otvoreniZadaci.length === 0 ? (
          <div style={mutedTextStyle}>Nema otvorenih zadataka.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {otvoreniZadaci.map((z) => {
              const imaStavke = z.stavke && z.stavke.length > 0;

              return (
                <details key={z.id} style={openTaskDetailsStyle}>
                  <summary style={openTaskSummaryStyle}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={summaryMainTextStyle}>
                        {z.naslov || z.vrsta || "Zadatak"}
                      </div>
                      <div style={summarySubTextStyle}>
                        {sazetakZadatka(z)}
                      </div>
                    </div>

                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div style={summaryRightStyle}>
                        {formatDatum(z.zadanoAt)}
                      </div>
                      <span
                        style={{ ...statusPillStyle, ...statusBadge(z.status) }}
                      >
                        {z.status}
                      </span>
                    </div>
                  </summary>

                  <div style={detailsContentStyle}>
                    <DetailRow label="Vrsta" value={z.vrsta ?? "—"} />
                    <DetailRow label="Tip zadatka" value={tipZadatkaLabel(z)} />
                    <DetailRow
                      label="Zadao"
                      value={prikaziKorisnika(z.zadaoKorisnik)}
                    />
                    <DetailRow
                      label="Izvršio"
                      value={prikaziKorisnika(z.izvrsioKorisnik)}
                    />
                    <DetailRow label="Zadano" value={formatDatum(z.zadanoAt)} />
                    <DetailRow
                      label="Napomena"
                      value={z.napomena?.trim() ? z.napomena : "—"}
                    />

                    {imaStavke ? (
                      <>
                        <DetailRow
                          label="Broj preparata"
                          value={String(z.stavke.length)}
                        />
                        <div style={innerSectionTitleStyle}>Stavke zadatka</div>

                        <div style={{ display: "grid", gap: 8 }}>
                          {z.stavke.map((s, index) => (
                            <div key={s.id} style={subBoxStyle}>
                              <div style={subBoxTopStyle}>
                                <strong style={{ fontWeight: 600 }}>
                                  {index + 1}. {s.preparat?.naziv ?? "—"}
                                </strong>
                                <span style={{ fontSize: 12, color: "#7f1d1d" }}>
                                  Vezana stavka
                                </span>
                              </div>

                              <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                                <div style={subMetaTextStyle}>
                                  Preporučena doza: {preporucenaDozaText(s.preparat)}
                                </div>
                                <div style={subMetaTextStyle}>
                                  Odabrana doza:{" "}
                                  {s.doza != null
                                    ? `${formatBroj(s.doza)} ${s.jedinica?.naziv ?? ""}`.trim()
                                    : "—"}
                                </div>
                                <div style={subMetaTextStyle}>
                                  Volumen u tanku:{" "}
                                  {s.volumenUTanku != null
                                    ? `${formatBroj(s.volumenUTanku)} L`
                                    : "—"}
                                </div>
                                <div style={subMetaTextStyle}>
                                  Ukupno za dodati:{" "}
                                  {s.izracunataKolicina != null
                                    ? `${formatBroj(s.izracunataKolicina)} ${
                                        s.izlaznaJedinica?.naziv ?? ""
                                      }`.trim()
                                    : "—"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <DetailRow
                          label="Sredstvo"
                          value={z.preparat?.naziv ?? "—"}
                        />
                        <DetailRow
                          label="Preporučena doza"
                          value={preporucenaDozaText(z.preparat)}
                        />
                        <DetailRow
                          label="Odabrana doza"
                          value={
                            z.doza != null
                              ? `${formatBroj(z.doza)} ${z.jedinica?.naziv ?? ""}`.trim()
                              : "—"
                          }
                        />
                        <DetailRow
                          label="Volumen u tanku"
                          value={
                            z.volumenUTanku != null
                              ? `${formatBroj(z.volumenUTanku)} L`
                              : "—"
                          }
                        />
                        <DetailRow
                          label="Ukupno za dodati"
                          value={
                            z.izracunataKolicina != null
                              ? `${formatBroj(z.izracunataKolicina)} ${
                                  z.izlaznaJedinica?.naziv ?? ""
                                }`.trim()
                              : "—"
                          }
                        />
                      </>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>
      {/* --- KRONOLOGIJA: jedan slijed umjesto sest kartica (Radnje, Pretoci,
              Dolasci, Punjenja, Izlazi, Izvrseni zadaci). Mjerenja NISU ovdje
              — ostaju vlastita kartica, vidi kronologija.tsx. --- */}
      <Card
        title="Kronologija"
        broj={dogadaji.length}
        pod="sve što se s ovim vinom radilo"
      >
        <OdZadnjeArhive granica={granicaArhive} />
        <div style={{ padding: 10 }}>
          <Kronologija dogadaji={dogadaji} />
        </div>
      </Card>


      <Card
        title="Porijeklo vina / sastavnice blenda"
        broj={tank.blendIzvori.length}
        sklopljena
      >
        {/* Same VRIJEDNOSTI iz blenda stoje gore u mrezi parametara, oznacene
            s ≈. Ovdje je objasnjenje odakle dolaze i tko rusi pokrivenost. */}
        {blend ? (
          <div style={{ display: "grid", gap: 8, padding: 10 }}>
            <div style={izBlendaSazetakStyle}>
              {poljaIzBlenda.length > 0 ? (
                <>
                  Gore {poljaIzBlenda.length === 1 ? "je" : "su"}{" "}
                  <strong>{poljaIzBlenda.join(", ")}</strong> označen
                  {poljaIzBlenda.length === 1 ? "" : "i"} s <strong>≈</strong> —
                  tank {poljaIzBlenda.length === 1 ? "ga" : "ih"} nema izmjeren
                  {poljaIzBlenda.length === 1 ? "" : "e"}, pa se računa
                  {poljaIzBlenda.length === 1 ? "" : "ju"} odavde, ponderirano po
                  količini. Klik na takav parametar pokazuje sam račun.
                </>
              ) : (
                <>
                  Za svako popunjeno polje tank ima vlastito mjerenje, pa se gore
                  ništa ne računa iz blenda.
                </>
              )}
            </div>

            {blend.bezPodataka.length > 0 ? (
              <div style={blendUpozorenjeStyle}>
                Prosjek ne pokriva cijeli blend —{" "}
                <strong>{blend.bezPodataka.map((x) => x.naziv).join(" i ")}</strong>{" "}
                {blend.bezPodataka.length === 1 ? "nema" : "nemaju"} nijedno
                mjerenje (
                {formatBroj(
                  (blend.bezPodataka.reduce((a, x) => a + x.kolicina, 0) /
                    blend.ukupnoL) *
                    100,
                  0
                )}
                % količine).
              </div>
            ) : null}

            {blendSumnjive.length > 0 ? (
              <div style={blendUpozorenjeStyle}>
                ⚠ {blendSumnjive.map((x) => x.naziv).join(", ")} u međuvremenu
                {blendSumnjive.length === 1 ? " drži" : " drže"} drugo vino, pa su
                njihovi parametri ovdje tuđi.
              </div>
            ) : null}

            <div style={mutedTextStyle}>
              Prosjek se računa PRI PRIKAZU iz trenutnih sastavnica — ne iz zapisa
              koji je prijenos ostavio. Izmjeri li se neka sastavnica, ovdje se
              vidi odmah.
            </div>
          </div>
        ) : null}

        {tank.blendIzvori.length === 0 ? (
          <div style={mutedTextStyle}>Nema zapisanih izvora za ovo vino.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {tank.blendIzvori.map((izvor) => {
              const href = izvor.izvorTankId
                ? `/tankovi/${izvor.izvorTankId}?from=${encodeURIComponent(from)}`
                : izvor.izvorArhivaVinaId
                  ? `/arhiva/${izvor.izvorArhivaVinaId}?from=${encodeURIComponent(
                      from
                    )}`
                  : null;

              return (
                <details key={izvor.id} style={detailsStyle}>
                  <summary style={summaryStyle}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={summaryMainTextStyle}>
                        {izvor.nazivVina ?? izvor.sorta ?? "Nepoznato vino"}
                      </div>
                      <div style={summarySubTextStyle}>
                        {formatBroj(izvor.postotak)}% · {formatBroj(izvor.kolicina)}{" "}
                        L
                      </div>
                    </div>

                    <div style={summaryRightStyle}>{izvor.sorta ?? "-"}</div>
                  </summary>

                  <div style={detailsContentStyle}>
                    <DetailRow label="Sorta" value={izvor.sorta ?? "-"} />
                    <DetailRow
                      label="Datum"
                      value={formatDatumBezVremena(izvor.createdAt)}
                    />
                    <DetailRow
                      label="Količina"
                      value={`${formatBroj(izvor.kolicina)} L`}
                    />

                    {izvor.izvorTank || izvor.izvorArhivaVina ? (
                      <IzvorMjerenjeBlock
                        sastavnica={sastavnicaPoId.get(izvor.id)}
                      />
                    ) : (
                      <div style={sourceMeasurementWrapStyle}>
                        <div style={sourceMeasurementTitleStyle}>
                          Zadnje mjerenje izvora
                        </div>
                        <div style={mutedTextStyle}>
                          Parametri nisu dostupni jer izvor nije pronađen ni u
                          aktivnim tankovima ni u arhivi.
                        </div>
                      </div>
                    )}

                    {href ? (
                      <Link href={href} style={linkButtonPrimaryStyle}>
                        Otvori izvor
                      </Link>
                    ) : (
                      <div style={mutedTextStyle}>
                        Nema dostupne poveznice na izvor.
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Sastav" broj={udjeliSorti.length} pod="sorti" sklopljena>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={sectionToolbarStyle}>
            <div style={mutedTextStyle}>Trenutni sastav vina u tanku</div>

            <TankRoleSastavModal
              rola={prijavljeni.role}
              tankId={tank.id}
              stavke={udjeliSorti.map((u) => ({
                id: u.id,
                nazivSorte: u.nazivSorte,
                postotak: u.postotak,
              }))}
            />
          </div>

          <div style={infoStripStyle}>
            <div>Ukupno upisano: {ukupnoPostotakRounded}%</div>
            <div>
              {sastavIspravan
                ? "Sastav je ispravno zbrojen"
                : "Upozorenje: sastav nije 100%"}
            </div>
          </div>

          {udjeliSorti.length === 0 ? (
            <div style={mutedTextStyle}>Nema podataka o sastavu vina.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {udjeliSorti.map((u) => (
                <div key={u.id} style={compositionRowStyle}>
                  <div style={compositionHeaderStyle}>
                    <strong style={{ fontWeight: 600 }}>{u.nazivSorte}</strong>
                    <span>{formatBroj(u.postotak)}%</span>
                  </div>

                  <div style={progressTrackStyle}>
                    <div
                      style={{
                        ...progressFillStyle,
                        width: `${Math.max(
                          0,
                          Math.min(100, Number(u.postotak))
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>



      {/* --- ARHIVE: s monitora dosad nije bilo puta do arhive. --- */}
      <Card
        title="Arhive"
        broj={arhive.length}
        pod="NOVO — dosad nije bilo puta do arhive"
        sklopljena
      >
        {arhive.length === 0 ? (
          <div style={mutedTextStyle}>Nema arhiviranih vina.</div>
        ) : (
          <div style={{ display: "grid", gap: 6, padding: 10 }}>
            {arhive.map((a) => (
              <div key={a.id} style={zapisKarticaStyle}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {a.nazivVina ?? "bez naziva"} — {formatBroj(a.kolicinaVina, 0)} L
                </div>
                <div style={mutedTextStyle}>
                  {a.sorta ?? "—"} · arhivirano {formatDatum(a.arhiviranoAt)}
                </div>
                <Link
                  href={`/arhiva/${a.id}?from=${encodeURIComponent(from)}`}
                  style={linkButtonSecondaryStyle}
                >
                  Otvori arhivu
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Dokumenti"
        broj={tank.documents.length}
        sklopljena
      >
        <div style={{ padding: 10 }}>
          <TankRoleDokumentiUpload rola={prijavljeni.role} tankId={tank.id} />
        </div>

        {tank.documents.length === 0 ? (
          <div style={mutedTextStyle}>Nema spremljenih dokumenata.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {tank.documents.map((d) => (
              <details key={d.id} style={detailsStyle}>
                <summary style={summaryStyle}>
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={summaryMainTextStyle}>{d.naziv}</div>
                    <div style={summarySubTextStyle}>
                      {d.datumDokumenta
                        ? new Date(d.datumDokumenta).toLocaleDateString("hr-HR")
                        : "-"}
                    </div>
                  </div>

                  <div style={summaryRightStyle}>{d.vrsta}</div>
                </summary>

                <div style={detailsContentStyle}>
                  <DetailRow
                    label="Datum dokumenta"
                    value={
                      d.datumDokumenta
                        ? new Date(d.datumDokumenta).toLocaleDateString("hr-HR")
                        : "-"
                    }
                  />
                  <DetailRow label="Dodao" value={d.uploadedByIme ?? "-"} />
                  <DetailRow label="Napomena" value={d.napomena ?? "-"} />

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={linkButtonPrimaryStyle}
                    >
                      Otvori
                    </a>

                    <a href={d.fileUrl} download style={linkButtonSecondaryStyle}>
                      Preuzmi
                    </a>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Sva mjerenja"
        broj={svaMjerenja.length}
        pod="napomena i bentotest po zapisu"
        sklopljena
      >
        <OdZadnjeArhive granica={granicaArhive} />
        {svaMjerenja.length === 0 ? (
          <div style={mutedTextStyle}>Nema mjerenja.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {svaMjerenja.map((m, index) => {
              const samoBentotest = jeSamoBentotestZapis(m as any);

              return (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid #ececec",
                    background: index % 2 === 0 ? "#ffffff" : "#fcfcfc",
                    padding: "8px 9px",
                    borderRadius: 0,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#2f2f2f" }}>
                      {samoBentotest ? "Bentotest" : "Mjerenje"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {formatDatum(m.izmjerenoAt)}
                    </div>
                  </div>

                  {samoBentotest ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: 4,
                      }}
                    >
                      <div style={mjerenjeMiniCardStyle}>
                        <div style={mjerenjeMiniLabelStyle}>Bentotest datum</div>
                        <div
                          style={{
                            ...mjerenjeMiniValueStyle,
                            color: bojaAktivnogPolja(m.bentotestDatum),
                          }}
                        >
                          {m.bentotestDatum
                            ? formatDatumBezVremena(m.bentotestDatum)
                            : "—"}
                        </div>
                      </div>

                      <div style={mjerenjeMiniCardStyle}>
                        <div style={mjerenjeMiniLabelStyle}>Bentotest status</div>
                        <div
                          style={{
                            ...mjerenjeMiniValueStyle,
                            color:
                              m.bentotestStatus === "NESTABILNO"
                                ? "#9f1239"
                                : m.bentotestStatus === "STABILNO"
                                  ? "#166534"
                                  : "#9ca3af",
                          }}
                        >
                          {bentotestLabel(m.bentotestStatus)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={mjerenjeWrapStyle}>
                      <div style={mjerenjePrimaryGridStyle}>
                        <div style={mjerenjeMiniCardStrongStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Alkohol</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStrongStyle,
                              color: bojaAktivnogPolja(m.alkohol),
                            }}
                          >
                            {m.alkohol != null ? formatBroj(m.alkohol) : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStrongStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Šećer</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStrongStyle,
                              color: bojaAktivnogPolja(m.secer),
                            }}
                          >
                            {m.secer != null ? formatBroj(m.secer) : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStrongStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Uk. kiseline</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStrongStyle,
                              color: bojaAktivnogPolja(m.ukupneKiseline),
                            }}
                          >
                            {m.ukupneKiseline != null
                              ? formatBroj(m.ukupneKiseline)
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStrongStyle}>
                          <div style={mjerenjeMiniLabelStyle}>SO2 uk.</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStrongStyle,
                              color: bojaAktivnogPolja(m.ukupniSO2),
                            }}
                          >
                            {m.ukupniSO2 != null ? formatBroj(m.ukupniSO2) : "—"}
                          </div>
                        </div>
                      </div>

                      <div style={mjerenjeSecondaryGridStyle}>
                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>pH</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.ph),
                            }}
                          >
                            {m.ph != null ? formatBroj(m.ph) : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Temperatura</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.temperatura),
                            }}
                          >
                            {m.temperatura != null
                              ? `${formatBroj(m.temperatura)} °C`
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Hlapive</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.hlapiveKiseline),
                            }}
                          >
                            {m.hlapiveKiseline != null
                              ? formatBroj(m.hlapiveKiseline)
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>SO2 slob.</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.slobodniSO2),
                            }}
                          >
                            {m.slobodniSO2 != null
                              ? formatBroj(m.slobodniSO2)
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Bentotest datum</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.bentotestDatum),
                            }}
                          >
                            {m.bentotestDatum
                              ? formatDatumBezVremena(m.bentotestDatum)
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Bentotest status</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color:
                                m.bentotestStatus === "NESTABILNO"
                                  ? "#9f1239"
                                  : m.bentotestStatus === "STABILNO"
                                    ? "#166534"
                                    : "#9ca3af",
                            }}
                          >
                            {bentotestLabel(m.bentotestStatus)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    <span style={{ fontWeight: 600, color: "#44403c" }}>Napomena:</span>{" "}
                    {m.napomena ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const pageStyle: React.CSSProperties = {
  background: "#f4f4f5",
  padding: 16,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  fontSize: 13,
  color: "#2f2f2f",
  minHeight: "100vh",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 10,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.1,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 3,
  color: "#6b7280",
  fontSize: 13,
};

const headerBadgesWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const headerBadgeStyle: React.CSSProperties = {
  padding: "5px 8px",
  border: "1px solid rgba(127,29,29,0.18)",
  background: "#ffffff",
  fontSize: 12,
  borderRadius: 0,
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const nazivVinaStyle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 10,
  textAlign: "center",
  fontSize: 24,
  fontWeight: 800,
  color: "#7f1d1d",
  lineHeight: 1.15,
  letterSpacing: 0.2,
};

const topParamsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 6,
};

const measurementWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 8,
};

const measurementSecondaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 4,
};

const paramCardStyle: React.CSSProperties = {
  padding: "7px 8px",
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
  borderRadius: 0,
};

const paramCardStrongStyle: React.CSSProperties = {
  background: "#fffafa",
  border: "1px solid rgba(127,29,29,0.26)",
};

const paramLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 11,
  marginBottom: 3,
};

const paramLabelStrongStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.2,
  color: "#7f1d1d",
};

const paramValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#222",
};

const paramValueStrongStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
};

const izBlendaSazetakStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "#7c2d12",
  background: "#fdf6f2",
  border: "1px dashed #d8a48f",
  padding: "8px 10px",
};

const blendUpozorenjeStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "#9a3412",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  padding: "8px 10px",
};

const obavijestPrazanStyle: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#7f1d1d",
  padding: "9px 11px",
  fontSize: 13,
  lineHeight: 1.5,
};

const odArhiveStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  padding: "6px 10px 0 10px",
  lineHeight: 1.45,
};

const berbaKarticaStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  borderLeft: "3px solid #7f1d1d",
  padding: 10,
  display: "grid",
  gap: 6,
};

const berbaMrezaStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 6,
  marginTop: 4,
};

const berbaPoljeStyle: React.CSSProperties = {
  border: "1px solid #f0f0f0",
  padding: "5px 7px",
  minWidth: 0,
};

const berbaLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 700,
};

const berbaVrijednostStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  overflowWrap: "anywhere",
};

const lanacPutStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.6,
  // Bez ovoga se dugi put (dvije karike s dva omjera) na mobitelu razvlaci i
  // gura karticu u vodoravno listanje.
  overflowWrap: "anywhere",
};

const sumnjivoZnakStyle: React.CSSProperties = {
  display: "inline-block",
  marginLeft: 8,
  padding: "1px 6px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  color: "#7f1d1d",
  border: "1px solid rgba(127,29,29,0.35)",
  background: "rgba(127,29,29,0.06)",
};

const sazetakLancaStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  padding: "6px 10px",
  border: "1px solid #ececec",
  background: "#fafafa",
  overflowWrap: "anywhere",
};

const prikaziSveStyle: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  color: "#7f1d1d",
  padding: "6px 10px",
  border: "1px dashed #d4d4d4",
  listStyle: "none",
};

const naslijedenoZaglavljeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#6b7280",
  padding: "6px 0 0 0",
  borderTop: "1px solid #ececec",
  marginTop: 4,
};

const zapisKarticaStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  borderLeft: "3px solid #6b7280",
  padding: 9,
  display: "grid",
  gap: 3,
};

const metaBlockStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderTop: "1px solid #e5e7eb",
  display: "grid",
  gap: 4,
  color: "#6b7280",
};

const detailRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "170px minmax(0, 1fr)",
  gap: 10,
  padding: "4px 0",
};

const detailLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
};

const detailValueStyle: React.CSSProperties = {
  color: "#2f2f2f",
  fontSize: 13,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const detailsStyle: React.CSSProperties = {
  borderBottom: "1px solid #ececec",
  borderRadius: 0,
};

const openTaskDetailsStyle: React.CSSProperties = {
  border: "2px solid #dc2626",
  background: "#fffaf9",
  borderRadius: 0,
};

const summaryStyle: React.CSSProperties = {
  listStyle: "none",
  cursor: "pointer",
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  borderRadius: 0,
};

const openTaskSummaryStyle: React.CSSProperties = {
  ...summaryStyle,
  background: "#fff5f5",
  fontWeight: 700,
};

const summaryMainTextStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "#2f2f2f",
};

const summarySubTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const summaryRightStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#7f1d1d",
};

const detailsContentStyle: React.CSSProperties = {
  padding: "0 10px 10px 10px",
  display: "grid",
  gap: 6,
};

const innerSectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#44403c",
  borderTop: "1px solid #ececec",
  paddingTop: 8,
  marginTop: 4,
};

const subBoxStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  padding: "8px 10px",
  background: "#fcfcfc",
  borderRadius: 0,
};

const subBoxTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const subMetaTextStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  marginTop: 3,
};

const statusPillStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 0,
};

const compositionRowStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  padding: "8px 10px",
  background: "#fcfcfc",
  borderRadius: 0,
};

const compositionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 6,
};

const progressTrackStyle: React.CSSProperties = {
  width: "100%",
  height: 8,
  background: "#ececec",
  borderRadius: 0,
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "rgba(127,29,29,0.72)",
  borderRadius: 0,
};

const sectionToolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const infoStripStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  padding: "8px 10px",
  border: "1px solid #ececec",
  background: "#fcfcfc",
  borderRadius: 0,
};

const mutedTextStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  padding: "8px 10px",
};

const linkButtonPrimaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  border: "1px solid rgba(127,29,29,0.25)",
  background: "#ffffff",
  color: "#7f1d1d",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 0,
};

const linkButtonSecondaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  border: "1px solid #d1d5db",
  background: "#fafafa",
  color: "#44403c",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 0,
};

const sourceMeasurementWrapStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#fcfcfc",
  padding: "8px 10px",
  display: "grid",
  gap: 8,
  marginTop: 4,
  borderRadius: 0,
};

const sourceMeasurementTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#44403c",
};

const sourceMeasurementPrimaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 4,
};

const sourceMeasurementSecondaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 4,
};

const sourceMeasurementPrimaryItemStyle: React.CSSProperties = {
  border: "1px solid rgba(127,29,29,0.22)",
  background: "#ffffff",
  padding: "7px 8px",
  display: "grid",
  gap: 2,
  borderRadius: 0,
};

const sourceMeasurementItemStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#ffffff",
  padding: "6px 8px",
  display: "grid",
  gap: 2,
  borderRadius: 0,
};

const sourceMeasurementLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
};

const sourceMeasurementMetaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const mjerenjeWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const mjerenjePrimaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 4,
};

const mjerenjeSecondaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 4,
};

const mjerenjeMiniCardStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#ffffff",
  padding: "6px 7px",
  display: "grid",
  gap: 2,
  borderRadius: 0,
};

const mjerenjeMiniCardStrongStyle: React.CSSProperties = {
  border: "1px solid rgba(127,29,29,0.22)",
  background: "#fffafa",
  padding: "6px 7px",
  display: "grid",
  gap: 2,
  borderRadius: 0,
};

const mjerenjeMiniLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#6b7280",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

const mjerenjeMiniValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#2f2f2f",
};

const mjerenjeMiniValueStrongStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#2f2f2f",
};

