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
import PovijestPrekidac from "./povijest-prekidac";
import KronologijaPrekidac from "./kronologija-prekidac";
import NatragNaPrethodnu from "@/components/NatragNaPrethodnu";
import TankRoleActions from "./tank-role-actions";
import TankRoleSastavModal from "./tank-role-sastav-modal";
import TankRoleDokumentiUpload from "./tank-role-dokumenti-upload";
import HladjenjeGraf from "./hladjenje-graf";
import FermentacijaGumb from "./fermentacija-gumb";
import { jeL12, smijeUPodrumu } from "@/lib/auth-role";
import ImenujVino from "./imenuj-vino";
import { jeHladjenjeIskljuceno, smijeUpravljati } from "@/lib/tank-komanda";
import { popisKvasacaSDopunom } from "@/lib/kvasci";
import { kvasciPoPartiji } from "@/lib/kvasac-partija";
import { granicaVina, odGraniceVina } from "@/lib/granica-vina";
import { punjenjaTrenutnogVina } from "@/lib/punjenje-vina";
import { imeVina, jeBezImena, usporediSaSastavom } from "@/lib/ime-vina";
import { sifraZaPrikaz } from "@/lib/sifra-vina";
import { parametriVinaIzKnjige } from "@/lib/parametri-vina";
import { vrijednostiMonitora } from "@/lib/monitor-vina";
import {
  podrijetloTanka,
  sastavIzPodrijetla,
  nepoznatiDio,
  razlikaSastava,
  vinoUTrenucimaVise,
  type VinoUTrenutku,
  type ZapisPodrijetla,
  SORTA_NEPOZNATA,
} from "@/lib/berba-model";
import {
  citajUlazneCine,
  vinoUTanku,
  skrati,
  imenujOdljev,
  DUBINA_KLIKA,
  type VinoCvor,
} from "@/lib/identitet-vina";
import {
  povijestVina,
  type RedakRadnje,
  type RedakArhivskeRadnje,
  type RedakMjerenjaPosude,
  type PovijestVina,
  type StavkaPovijesti,
} from "@/lib/povijest-vina";
import {
  dogadajiVina,
  prozoriVina,
  prozoriPrijePrezivljavanja,
  PREZIVLJAVA_OD,
} from "@/lib/kronologija-vina";
import {
  sastavVina,
  skratiSastav,
  nazivStavke,
  nazivVinaBezSastava,
  type StavkaVina,
} from "@/lib/sastav-vina";
import { imeKucice, type ImeKucice } from "@/lib/ime-kucice";
import { uValovima } from "@/lib/paralelno";
import { opisMaceracije, hrvatskiOblik } from "@/lib/berba-polja";
// `berbaKrozLanac` se od 11.09.2026. vise ne zove s ove stranice — berbu daje
// knjiga (`podrijetloTanka`). Modul ostaje i dalje se koristi drugdje.
import { usporediPoBerbi, type StavkaBerbe } from "@/lib/berba-lanac";
import {
  sloziPoPolju,
  POLJA_MJERENJA,
  type SastavnicaBlenda,
  nizPolja,
  parametriBlenda,
  zadnjiBentotest,
  mjerenjaTrenutnogVina,
  type RedakMjerenja,
  DANA_ZA_STARU_PROCJENU,
} from "@/lib/mjerenja";
import ParametriPoPolju, {
  type ParametarPrikaz,
  type TockaGrafa,
} from "./parametri-po-polju";
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
  velika = false,
}: {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  tone?: "default" | "green" | "red";
  emphasize?: boolean;
  /** Glavna brojka stranice (kolicina vina) — krupno, cita se s udaljenosti. */
  velika?: boolean;
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
          ...(velika ? paramValueVelikaStyle : null),
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
/**
 * Crta ispod koje pocinje povijest vina koje je u tanku SADA.
 *
 * Do faze D je pisalo „od zadnjeg arhiviranja" — jer je crta i dolazila iz
 * arhive. Sada dolazi iz knjige (zadnji put kad je tank bio prazan), pa i
 * natpis govori o vinu, ne o zapisu o vinu.
 */
function OdPocetkaVina({
  granica,
  lanac,
}: {
  granica: Date | null;
  /**
   * Posude kroz koje je vino proslo prije ove, s prozorom (vidi `lanacVina`).
   * Od 28.09.2026. popis mjerenja i kronologija citaju i njih, pa natpis ne
   * smije tvrditi da prikaz pocinje granicom.
   */
  lanac: Array<{ broj: number | null; odAt: Date; doAt: Date }>;
}) {
  if (!granica) return null;
  if (lanac.length === 0) {
    return (
      <div style={odArhiveStyle}>
        Prikazano otkad je ovo vino u tanku ({formatDatumBezVremena(granica)})
        nadalje — starije pripada prethodnom vinu.
      </div>
    );
  }
  return (
    <div style={odArhiveStyle}>
      Prikazano ovo vino: u ovom tanku od {formatDatumBezVremena(granica)}, a
      prije toga{" "}
      {lanac
        .map(
          (k) =>
            `u tanku ${k.broj ?? "?"} (${formatDatumBezVremena(k.odAt)} – ${formatDatumBezVremena(k.doAt)})`
        )
        .join(", ")}
      . Ostalo iz tih posuda pripada drugim vinima.
    </div>
  );
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
  izvorneLitre,
}: {
  s: StavkaBerbe;
  podnaslov: React.ReactNode;
  /** Put kojim je stavka dosla — stoji uz stavku, ne iznad grupe. */
  podrijetlo?: React.ReactNode;
  rub?: string;
  /**
   * Stavka je NASLIJEDJENA: litre i kilogrami su onakvi kakvi su zapisani pri
   * punjenju IZVORNOG tanka, a ne koliko ih je doslo ovamo. Bez te oznake se
   * zbroj stavki cita kao da bi morao dati kolicinu u ovom tanku — a redovito
   * je veci (T10: zapisi 5.100 L, u tank uslo 4.400 L).
   */
  izvorneLitre?: boolean;
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
        {izvorneLitre ? (
          <span style={{ ...mutedTextStyle, fontWeight: 400, marginLeft: 6 }}>
            zapisano pri punjenju izvornog tanka
          </span>
        ) : null}
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
 * Koliko naslijedjenih zapisa stoji otvoreno prije "prikazi sve".
 *
 * Sest, jer je to otprilike jedan ekran na mobitelu. Bacva u koju idu zadnji
 * dijelovi mosta zna imati deset i vise izvora, a svaki od njih vise od jedne
 * stavke — bez granice kartica preraste u beskrajno listanje i sakrije sve
 * ispod sebe (temperaturu, zadatke, kronologiju).
 */
const NASLIJEDENO_ODMAH = 6;

/**
 * Spoji vlastita mjerenja i ona naslijedjena iz ranijih posuda u jedan niz.
 *
 * Isti trenutak iz oba izvora je ISTO mjerenje vidjeno dvaput: vlastiti redak
 * i njegova kopija u arhivi posude kroz koju je vino proslo. Pobjedjuje
 * vlastiti — on zna je li mjerenje rucno.
 */
function spojiNiz(vlastiti: TockaGrafa[], naslijedeni: TockaGrafa[]): TockaGrafa[] {
  const poVremenu = new Map<string, TockaGrafa>();

  for (const x of naslijedeni) poVremenu.set(x.t, x);
  for (const x of vlastiti) poVremenu.set(x.t, x);

  return [...poVremenu.values()].sort((a, b) => a.t.localeCompare(b.t));
}

/**
 * Koliko sastavnica vina stane u jedan redak uz mjerenje prije nego se ostatak
 * skrati. Cetiri, jer peta vec prelama redak na mobitelu — a tank zna imati
 * i sesnaest razlicitih berbi.
 */
const VINA_U_REDAK = 4;

/**
 * CIJE JE VINO JEDNO MJERENJE MJERILO — jedan redak, izveden iz knjige.
 *
 * Mjerenje ostaje na svojoj adresi: ovaj tank, ovo vrijeme. Ovdje se ne
 * prepisuje nijedna vrijednost i nista se ne dijeli po udjelima — mjerenje je
 * stanje smjese, ne svojstvo berbe. Knjiga odgovara samo na "sto je tada bilo
 * u tanku", ponderirano po litrama.
 *
 * Prazno nije greska: knjiga za rani dio sezone ne postoji, a za trenutak
 * prije prvog ULAZ retka posteno je reci da ne zna, umjesto pokazati nulu.
 */
function VinoUTrenutkuRedak({ vino }: { vino: VinoUTrenutku | undefined }) {
  if (!vino || vino.stavke.length === 0) {
    return (
      <div style={vinoTadaStyle}>
        Knjiga za taj trenutak ne zna što je bilo u tanku.
      </div>
    );
  }

  const prikazane = vino.stavke.slice(0, VINA_U_REDAK);
  const ostatak = vino.stavke.length - prikazane.length;

  return (
    <div style={vinoTadaStyle}>
      <span style={{ color: "#6b7280" }}>Vino tada:</span>{" "}
      {prikazane.map((s, i) => (
        <span key={s.berbaId}>
          {i > 0 ? " · " : ""}
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatBroj(s.postotak, 0)}%
          </strong>{" "}
          {s.nazivSorte}
          {/* Oznaka berbe razlikuje dva zapisa iste sorte. Kad je nema —
              a zatecene je nemaju — sluzi datum berbe; bez oboje bi tank 42
              imao tri retka "Grasevina" koja se ne razlikuju. */}
          {s.oznakaBerbe
            ? ` ${s.oznakaBerbe}`
            : s.datumBerbe
              ? ` (${formatDatumBezVremena(s.datumBerbe)})`
              : ""}
        </span>
      ))}
      {ostatak > 0 ? (
        <span style={{ color: "#6b7280" }}> · i još {ostatak}</span>
      ) : null}
      <span style={{ color: "#6b7280" }}>
        {" "}
        — ukupno {formatBroj(vino.ukupnoL, 0)} L
      </span>
    </div>
  );
}

/**
 * Jedna PARTIJA iz knjige kretanja.
 *
 * Zamjenjuje `NaslijedenaStavka`, koja je isti podatak dohvacala kroz lanac
 * `BlendIzvor` pokazivaca. Razlika nije kozmeticka:
 *
 *   - lanac je isao kroz POSUDE („kroz tank 14 <- arhiva tanka 7") i donosio
 *     berbu tanka kroz koji je vino nekad proslo, cak i kad ta posuda danas
 *     drzi tude vino — zato je 61 od 147 zapisa bio oznacen SUMNJIVO;
 *   - knjiga ide po VINU: za svaku partiju zna koliko je je u ovom tanku sada,
 *     do litre, i taj se broj racuna iz zapisa koji se samo dopisuju.
 *
 * Zato ovdje nema ni `sumnjiv`, ni puta, ni dubine — nema sto biti sumnjivo
 * kad se ne pogadja nego cita.
 *
 * Dobiva SAMO prave zapise berbe. Zateceno vino nema berbu i ne prolazi ovuda
 * — ono se prikazuje jednim retkom s kolicinom (vidi `zatecenoRedakStyle`).
 *
 * LITRE SU DVIJE I OBJE SE PISU: `uTankuL` je koliko te partije ima OVDJE
 * (pravi broj, zbrojiv), `kolicinaLitara` koliko je cijela partija imala.
 * Kilogrami stoje uz drugu, neskalirani — vidi pravilo u lib/berba-model.ts.
 */
function PartijaIzKnjige({ x }: { x: ZapisPodrijetla }) {
  return (
    <BerbaStavkaKartica
      s={{
        id: x.berbaId,
        nazivSorte: x.nazivSorte,
        // U naslovu stoje litre KOJE SU OVDJE — to je ono sto se zbraja i ono
        // sto pise u sazetku iznad.
        kolicinaLitara: x.uTankuL,
        kolicinaKgGrozdja: x.kolicinaKgGrozdja,
        opis: null,
        datumBerbe: x.datumBerbe,
        godinaBerbe: x.godinaBerbe,
        polozaj: x.polozaj,
        parcela: x.parcela,
        vinograd: x.vinograd,
        oznakaBerbe: x.oznakaBerbe,
        secer: x.secer,
        kiseline: x.kiseline,
        ph: x.ph,
        napomenaBerbe: x.napomena,
        maceracija: x.maceracija,
        maceracijaSati: x.maceracijaSati,
      }}
      podnaslov={
        <>
          {formatBroj(x.postotak)} % ovog tanka
          {x.kolicinaLitara > 0 && Math.abs(x.kolicinaLitara - x.uTankuL) > 0.5
            ? ` · od ${formatBroj(x.kolicinaLitara, 0)} L cijele partije`
            : ""}
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
      // Izlazi vise ne dolaze odavde: kronologiju slaze lib/kronologija-vina.ts
      // po prozorima vina, bez `take` (T43 ima 49 izlaza jednog vina).
    },
  });

  if (!tank) return notFound();

  // Izvedeno iz vec ucitanog tanka, prije upita.
  const udjeliSorti = tank.udjeliSorti ?? [];
  const ukupnoPostotak = udjeliSorti.reduce(
    (sum, u) => sum + Number(u.postotak ?? 0),
    0
  );
  // Zbroj UPISANOG sastava. Od faze E se ne prikazuje kao mjera ispravnosti
  // — glavni sastav dolazi iz knjige i uvijek se zbraja na 100 — nego sluzi
  // samo usporedbi u kartici Sastav.
  const ukupnoPostotakRounded = Number(ukupnoPostotak.toFixed(2));

  // `Tank.nazivVina` NIJE u uvjetu (faza 5): stupac se vise ne pise, pa bi na
  // ispraznjenom tanku ostalo ime vina koje je otislo i tank nikad ne bi bio
  // "prazan". Svi putovi koji prazne tank i dalje brisu sortu i godiste.
  const tankJePrazan =
    Number(tank.kolicinaVinaUTanku ?? 0) <= 0 &&
    !tank.sorta &&
    !tank.godiste &&
    udjeliSorti.length === 0;

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

    // ARHIVE SE OVDJE VISE NE CITAJU (vlasnik, 09.10.2026.): tank je posuda,
    // a arhiva pripada vinu. Vino kojeg vise nema u podrumu nalazi se samo u
    // arhivi (/arhiva), ne u zadnjem tanku u kojem je bilo. Kartica "Arhive"
    // i dogadaj ARHIVA u kronologiji su maknuti.

    // Otvorena fermentacija ovog tanka — odredjuje koji se gumb prikazuje.
    // NAMJERNO bez granice arhive: fermentacija se zatvara ondje gdje je i
    // otvorena, pa i kad je tank u meduvremenu ispraznjen ili arhiviran.
    // Skrivanje bi ostavilo zapis zauvijek otvoren, bez ijednog gumba.
    prisma.fermentacija.findFirst({
      where: { tankId: id, krajAt: null, obrisano: false },
      orderBy: { pocetakAt: "desc" },
      select: { id: true, pocetakAt: true, kvasacNaziv: true },
    }),

    // GRANICA VINA iz knjige — zamjenjuje granicu arhive (faza D).
    // Dva upita u nizu, pa u valu drzi jednu vezu kao i svaki drugi clan.
    granicaVina(prisma, id),
  ]);

  const [
    zadnjeOcitanje,
    aktivniAlarmi,
    mjerenja,
    otvorenaFermentacija,
    granica,
  ] = prviVal;

  // GRANICA VINA — jedna crta za cijelu stranicu.
  //
  // FAZA D. Prije je crta bila trenutak zadnjeg ARHIVIRANJA. To je radilo samo
  // zato sto se pri svakom pretoku koji isprazni tank stvarala arhiva — dakle
  // zato sto je posuda dobivala zapis o tudem vinu. Dvije rupe su bile odmah
  // vidljive: filtracija prazni tank BEZ arhiviranja (cetiri tanka bez crte),
  // a tank 32 je nakon filtracije 18.08. i pretoka 19.08. i dalje pokazivao
  // mjerenja vina koje je otislo.
  //
  // Sada crta dolazi IZ KNJIGE: zadnji trenutak u kojem je tank bio prazan.
  // Sve poslije toga pripada vinu koje je u njemu danas. Vidi lib/granica-vina.ts.
  //
  // Filtar se i dalje stavlja i na ono sto arhiviranje danas brise (punjenja,
  // izlazi, mjerenja) — da prikaz ostane tocan kad se to prestane brisati.
  const granicaVinaAt = granica.odAt;
  const odGranice = odGraniceVina(granica);

  // PRAZAN TANK NE POKAZUJE NISTA (vlasnikova odluka, 28.09.2026). Povijest
  // putuje s vinom: kad je vino otislo, s njim su otisla i njegova mjerenja.
  // `granicaVinaAt` je tada null, a null u filtrima ispod znaci "bez reza" —
  // prazan tank bi pokazao SVA svoja mjerenja (T1 17, T38 16, T23 13, T35 1).
  // Zato izricita oznaka, isto pravilo kao `odGraniceVina`: PRAZAN, ne
  // NEMA_KNJIGE (ondje knjiga nema sto reci, pa se ne smije praviti da zna).
  const tankBezVina = granica.razlog === "PRAZAN";

  // IME VINA (faza 4) — cin imenovanja unutar prozora koji je granica upravo
  // odredila, a ne `Tank.nazivVina`. Cita se TEK OVDJE jer mu treba granica:
  // zapis stariji od nje pripada vinu kojeg u posudi vise nema.
  //
  // Jedan upit, i to tek nakon prvog vala — isti razlog kao podrijetlo nize.
  const ime = await imeVina(prisma, id, granica);
  const sifraPrikaz = sifraZaPrikaz(ime);

  // Ne cekaj — samo pokreni. Ceka se nize, kad rezultat stvarno zatreba.
  const blendUTijeku =
    tank.blendIzvori.length > 0
      ? parametriBlenda(prisma, id, { sirina: 2 })
      : Promise.resolve(null);

  // Drugi val. Prazan tank i dalje NE cita punjenja ni zadatke — uvjet je isti,
  // samo je preseljen u izraz; `Promise.all` prima i obicne vrijednosti, pa
  // `[]` prolazi bez upita.
  const [svaPunjenja, otvoreniZadaci, izvrseniZadaci] = await Promise.all([
    prisma.punjenjeTanka.findMany({
      where: {
        tankId: id,
        // GRANICA SE VISE NE STAVLJA OVDJE. Rezanje po `datumPunjenja` sakrilo
        // je punjenja cije je vino po knjizi stiglo nakon granice, a datum iz
        // obrasca nosi raniji dan. Odabir je nize, po knjizi — vidi
        // `punjenjaTrenutnogVina`.
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

  // TRECI VAL JE MAKNUT (09.10.2026.): `Radnja`, pretoci i dolasci
  // prijenosom citali su se samo za kronologiju, a nju sada slaze
  // lib/kronologija-vina.ts po prozorima vina — vidi `dogadaji` nize.

  // RADNJE KOJE JE VINO DONIJELO SA SOBOM.
  //
  // Jedan upit, bez granice arhive — i to je bitno. `VinoRadnja` se pri
  // praznjenju tanka BRISE, pa tudjih redaka nema; granica bi ovdje odrezala
  // kvasac dodan u tanku 11 u srpnju, koji je stariji od arhiviranja tanka 5 a
  // opisuje bas ono vino koje je danas u tanku 5.
  const vinoRadnje = await prisma.vinoRadnja.findMany({
    where: { tankId: id },
    orderBy: { dogodenoAt: "desc" },
  });

  // Kvasci danasnjeg vina — POPIS, ne jedan. Racun je zajednicki s izvjestajem
  // podruma (lib/kvasci.ts); dva ekrana ne smiju racunati postotke svaki za
  // sebe.
  //
  // DOPUNA PO PARTIJI ide samo kad glavno pravilo ne da nista, i tada su svi
  // retci oznaceni. Upit se salje SAMO u tom slucaju — tank koji ima kvasac ne
  // placa nista.
  const imaKvasac = vinoRadnje.some(
    (v) => v.jeKvasac && v.vrsta === "DODAVANJE"
  );

  const kvasci = popisKvasacaSDopunom(
    vinoRadnje,
    imaKvasac ? [] : (await kvasciPoPartiji(prisma, [id])).get(id) ?? []
  );

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
  // BERBA VISE NE IDE KROZ LANAC POKAZIVACA (11.09.2026).
  //
  // `berbaKrozLanac` je berbu trazio kroz `BlendIzvor` — dakle kroz POSUDE
  // kroz koje je vino proslo. Na tanku 6 je to davalo 21 zapis berbe iz 2026,
  // svih 21 oznacenih SUMNJIVO, putem „tank 14 <- arhiva tanka 7", dok knjiga
  // za isti tank kaze sest partija zatecenog vina. Preko cijelog podruma: 147
  // zapisa kroz lanac, od toga 61 sumnjiv.
  //
  // Sada karticu hrani `podrijetloKnjige` (racuna se nize, bez novog upita).
  // `lib/berba-lanac.ts` ostaje u kodu — `izvorJeSumnjiv` i `usporediPoBerbi`
  // jos se koriste — ali ga ova stranica vise ne zove.

  // FAZA B — ISTI ODGOVOR, IZVEDEN IZ KNJIGE.
  //
  // `TankSortaUdio` i `BlendIzvor` su SPREMLJENA stanja: netko ih je upisao ili
  // ih je pretok izracunao i ostavio, i od tada mogu odlutati a nista ih ne
  // vraca natrag (tank 43: blend tvrdi 585 L, u tanku 565). Knjiga isti podatak
  // IZVODI iz redaka koji se samo dopisuju, pa ne moze biti u neskladu sama sa
  // sobom.
  //
  // Ne zamjenjuje nista — prikazuju se OBA broja i razlika medju njima, da se
  // vidi gdje spremljeno stanje vise ne odgovara knjizi.
  //
  // TEK OVDJE, ne usporedno: isti razlog kao `berbaKrozLanac` odmah iznad —
  // vrsak istovremenih veza vec je 6, a pooler drzi 15 za cijelu aplikaciju.
  // Tri upita u nizu (stanje, tank, berbe) placaju jedan krug latencije.
  const podrijetloKnjige = await podrijetloTanka(prisma, id);
  const sastavKnjige = sastavIzPodrijetla(podrijetloKnjige);
  const nepoznatoUKnjizi = nepoznatiDio(sastavKnjige);

  // ODAKLE JE VINO — stablo kucica, do berbe.
  //
  // SVIM TANKOVIMA, ne samo ovome: stablo se spusta u posude iz kojih je vino
  // doslo, pa su mu potrebni i NJIHOVI ulazni cinovi. Bez toga lanac stane na
  // prvoj razini.
  //
  // CIJENA. `citajUlazneCine` cita knjigu jednim upitom, ali volumen prije
  // svakog ulaza uzima iz `vinoUTrenucima` — pozivom po tanku, u valovima po
  // cetiri. Zasto nema vlastiti SQL pise u zaglavlju lib/identitet-vina.ts:
  // isti je racun vec jednom prepisan i tiho dao krive sate.
  //
  // Ide TEK OVDJE, u nizu, a ne usporedno s necim: vrsak istovremenih veza
  // vec je 6, a `citajUlazneCine` i sam trosi cetiri.
  const sviTankovi = await prisma.tank.findMany({
    select: { id: true, broj: true },
  });
  const brojeviTankova = new Map(sviTankovi.map((t) => [t.id, t.broj]));
  const knjigaIdentiteta = await citajUlazneCine(
    prisma,
    sviTankovi.map((t) => t.id)
  );
  // Oznaka partije ide u ISTI upit: naziv stavke sastava ("Graševina, partija
  // 020/2026") ne smije placati vlastiti.
  const sveBerbe = await prisma.berba.findMany({
    select: { id: true, nazivSorte: true, oznakaBerbe: true },
  });
  const sorteBerbi = new Map(sveBerbe.map((b) => [b.id, b.nazivSorte] as const));
  const oznakaPartije = new Map(sveBerbe.map((b) => [b.id, b.oznakaBerbe] as const));

  // DUBOKO, pa rez na `DUBINA_KLIKA` razina; ispod toga prikaz kaze "jos N".
  // Neskraceno stablo treba i lanac radnji nize, pa se cuva zasebno.
  // Jedan trenutak za stablo i za prozore vina, da govore o istom vinu.
  const sada = new Date();
  const vinoDanas = vinoUTanku(
    knjigaIdentiteta.cini,
    sorteBerbi,
    id,
    sada.getTime(),
    {},
    [],
    podrijetloKnjige.ukupnoL
  );
  const stabloVina = skrati(vinoDanas, DUBINA_KLIKA);
  // Prazan tank nema kucica: `vinoUTanku` cita samo ulaze, pa bi "Odakle je
  // vino" pokazalo ZADNJE vino (T35: T40) — vino koje vise nije ondje.
  //
  // Prva razina PUNOG stabla ostaje za odljev (`imenujOdljev`): zbroj litara
  // je isti i u sazetom sastavu, ali odljev se racuna iz modela, ne prikaza.
  const kucicePrveRazine =
    !tankBezVina && stabloVina.vino.vrsta === "spoj"
      ? stabloVina.vino.sastavnice
      : [];

  // SASTAV ZA PRIKAZ — vina, ne posude (vlasnik, 09.10.2026.). Prijenosi istog
  // vina u praznu posudu sazimaju se u stavku vina koje kroz njih prolazi;
  // vidi lib/sastav-vina.ts. Rez na `DUBINA_KLIKA` razina STAVKI, ne cvorova.
  const sastavPrikaz = tankBezVina
    ? { stavke: [] as StavkaVina[], jos: 0 }
    : skratiSastav(sastavVina(vinoDanas), DUBINA_KLIKA);

  // IME I SIFRA KUCICA PRVE RAZINE (vlasnik, 09.10.2026.) — kako se vino
  // zvalo kad je uslo ovamo; vidi lib/ime-kucice.ts. Samo prva razina: cetiri
  // upita po kucici, dublje razine nose naziv iz sastava. U valovima, ne
  // `Promise.all` (lib/paralelno.ts).
  const imenaKucica = new Map<StavkaVina["sastavnica"], ImeKucice | null>(
    await uValovima(
      sastavPrikaz.stavke.map(
        (st) => async () =>
          [st.sastavnica, await imeKucice(prisma, st.sastavnica, st.roditeljTankId)] as const
      )
    )
  );

  // PROZORI VINA — posude kroz koje je CIJELO danasnje vino proslo, s prozorom
  // u kojem je ondje stajalo (lib/kronologija-vina.ts, `prozoriVina`). JEDAN
  // racun za kronologiju, graf, popis mjerenja i natpis — isti koji slaze i
  // /prosli-tank?snimka=. Do 09.10.2026. stranica je imala vlastitu kopiju
  // (`lanacVina`). Lanac sada ide istim pravilom kao sazimanje sastava, pa
  // posuda koja je iz sastava nestala kao prijenos stoji ovdje kao karika
  // (T7, T17, T21, T22, T38 dobili su karike; vidi `prozoriVina`).
  //
  // Prvi prozor je ova posuda od granice; ostali su KARIKE: prethodne posude,
  // svaka od svoje granice (racunate na trenutak kad je vino otamo otislo) do
  // tog trenutka. Lanac staje na prvom spoju vise izvora — ondje "od cega je
  // slozeno" preuzima kartica "Odakle je vino". Karika bez granice se
  // preskace: pogadjati se ne smije.
  //
  // PRAZAN TANK NEMA PROZORA i modul se ne zove. `prozoriVina` sa
  // `zadnjeVino: true` za prazan tank vraca vino koje je OTISLO (T21: 12
  // redaka tudjeg vina), a prazan tank ne pokazuje nista (vlasnik, 28.09.2026).
  //
  // CIJENA: dva upita po prozoru, u nizu — prvi ponavlja granicu ove posude.
  const prozori = tankBezVina
    ? []
    : (
        await prozoriVina(prisma, {
          tankId: id,
          trenutak: sada,
          doAt: sada,
          vino: vinoDanas,
        })
      ).prozori;
  const lanacVina = prozori.slice(1).map((p) => ({ tankId: p.tankId, odAt: p.od, doAt: p.do }));

  // Je li mjerenje iz LANCA palo u prozor neke karike. Zajednicko za graf i
  // popis mjerenja, pa o lancu oba sude isto.
  //
  // KARIKA U ISTOJ POSUDI SE VISE NE PRESKACE (09.10.2026.). Vino koje se
  // vratilo u isti tank (T12 <- T7 <- T12) prvi boravak ima PRIJE granice, pa
  // ga vlastiti rez nikad ne vidi; do sada ga nije pokazivao ni graf ni popis
  // (T12: 4 mjerenja, T10: 11, T41: 13). Prvi boravak i danasnji prozor
  // dodiruju se na pojasu [granica 00:00, odlazak], pa se dvojnici uklanjaju:
  // graf po trenutku (`spojiNiz`), popis po id-u i po `izvornoMjerenjeId`.
  const uProzoruLanca = (tankId: string, trenutak: Date) =>
    lanacVina.some(
      (k) =>
        k.tankId === tankId &&
        k.odAt != null &&
        trenutak >= k.odAt &&
        trenutak <= k.doAt
    );
  const tankPoBroju = new Map(sviTankovi.map((t) => [t.broj, t.id]));
  const lanacZaNatpis = lanacVina
    .filter((k): k is { tankId: string; odAt: Date; doAt: Date } => k.odAt != null)
    .map((k) => ({
      tankId: k.tankId,
      broj: brojeviTankova.get(k.tankId) ?? null,
      odAt: k.odAt,
      doAt: k.doAt,
    }));
  // Natpis navodi SVE karike, i onu u ovoj posudi: od 09.10.2026. kronologija,
  // graf i popis mjerenja pokazuju i prvi boravak u istom tanku.

  // IME KUCICE NE DOLAZI IZ `BlendIzvor.nazivVina`. S ovim se stablom ne da
  // spojiti: od 41 retka samo 7 uopce ima `izvorTankId`, a presjek tih sedam
  // s `tankId` kucica prve razine je NULA na svih 17 tankova koji blend imaju
  // (mjereno 17.09.2026). `BlendIzvor` su zamrznuti pokazivaci iz ranijeg
  // pretoka i pokazuju na drugu generaciju vina nego knjiga. Od 09.10.2026.
  // ime se izvodi preko granice izvorne posude na `usloAt` — vidi
  // `imenaKucica` gore i lib/ime-kucice.ts.

  // MJERENJA SVIH POSUDA U STABLU — jedan upit, i jedini koji povijest kucica
  // uopce kosta.
  //
  // Kvasci, preparati i radnje ne kostaju nista: `VinoRadnja` danasnjeg tanka
  // nosi `izvorniTankId`, pa se povijest svakog pretka izdvaja iz vec
  // dohvacenih redaka (vidi lib/povijest-vina.ts). Mjerenja su jedino sto
  // `VinoRadnja` ne nosi, a stoje po posudi i prezive praznjenje.
  const posudeUStablu = new Set<string>();
  const skupiPosude = (v: VinoCvor) => {
    if (v.vrsta === "partija") return;
    posudeUStablu.add(v.tankId);
    if (v.vrsta === "spoj") for (const s of v.sastavnice) skupiPosude(s.vino);
  };
  // Prazan tank nema kucica, pa ni njihove povijesti — bez upita.
  //
  // IZ PUNOG STABLA, ne iz odrezanog: sazeti sastav do sest razina STAVKI
  // seze dublje od sest razina cvorova, a povijest stavke treba i posude
  // prijenosa kroz koje je njezino vino proslo (vidi lib/sastav-vina.ts).
  if (!tankBezVina) skupiPosude(vinoDanas);

  const mjerenjaStabla: RedakMjerenjaPosude[] =
    posudeUStablu.size > 0
      ? await prisma.mjerenje.findMany({
          where: { tankId: { in: [...posudeUStablu] } },
          select: {
            tankId: true,
            izmjerenoAt: true,
            alkohol: true,
            secer: true,
            ukupneKiseline: true,
            ph: true,
            slobodniSO2: true,
            ukupniSO2: true,
          },
        })
      : [];
  // ARHIVA — bez nje je povijest predaka LAZNO PRAZNA.
  //
  // Arhiviranje SELI mjerenja i radnje, ne kopira ih: `Mjerenje` i `Radnja` su
  // prazne za svaku posudu koja je u medjuvremenu arhivirana, a u stablima
  // porijekla takve su gotovo sve. Bez ovoga je detektor rupa 14.09.2026 na
  // stranici tanka prijavio 36 rupa, od kojih su sve bile lazne — T3 je bio
  // oznacen kao 83 dana bez ijednog zapisa, a imao je sest mjerenja u tom
  // prozoru. Vidi AGENTS.md.
  //
  // `brojTanka` je rezerva za arhive kojima `tankId` nije popunjen.
  const brojeviUStablu = [...posudeUStablu]
    .map((x) => brojeviTankova.get(x))
    .filter((x): x is number => x != null);

  const arhiveStabla =
    posudeUStablu.size > 0
      ? await prisma.arhivaVina.findMany({
          where: {
            OR: [
              { tankId: { in: [...posudeUStablu] } },
              { brojTanka: { in: brojeviUStablu } },
            ],
          },
          select: { id: true },
        })
      : [];

  const arhivaIds = arhiveStabla.map((a) => a.id);
  const gdje = {
    OR: [
      { arhivaVinaId: { in: arhivaIds } },
      { tankId: { in: [...posudeUStablu] } },
    ],
  };

  // Dva upita, ne petlja po posudama — ista brana kao svugdje.
  const [sirovaArhMjerenja, sirovaArhRadnje] =
    posudeUStablu.size > 0
      ? await Promise.all([
          prisma.arhivaVinaMjerenje.findMany({
            where: gdje,
            select: {
              tankId: true,
              izmjerenoAt: true,
              alkohol: true,
              secer: true,
              ukupneKiseline: true,
              ph: true,
              slobodniSO2: true,
              ukupniSO2: true,
            },
          }),
          prisma.arhivaVinaRadnja.findMany({
            where: gdje,
            select: {
              tankId: true,
              createdAt: true,
              vrsta: true,
              opis: true,
              preparatNaziv: true,
              jedinicaNaziv: true,
              kolicina: true,
              izvornaRadnjaId: true,
            },
          }),
        ])
      : [[], []];

  const arhivskaMjerenjaStabla: RedakMjerenjaPosude[] = sirovaArhMjerenja
    .filter((m) => m.tankId != null)
    .map((m) => ({ ...m, tankId: m.tankId as string }));

  const arhivskeRadnjeStabla: RedakArhivskeRadnje[] = sirovaArhRadnje;

  const odljevVina = imenujOdljev(
    knjigaIdentiteta.odljevi.get(id) ?? [],
    stabloVina.vino.vrsta === "spoj" ? stabloVina.vino.kada.getTime() : 0,
    kucicePrveRazine.reduce((z, s) => z + s.litre, 0) || stabloVina.vino.litre,
    podrijetloKnjige.ukupnoL
  );

  // OZNAKA U ZAGLAVLJU dolazi iz knjige, ne iz upisanog sastava.
  const poznateSorte = sastavKnjige.filter((x) => !x.nepoznata);
  const oznakaSastava =
    sastavKnjige.length === 0
      ? "Nije poznat"
      : poznateSorte.length === 1 && sastavKnjige.length === 1
        ? poznateSorte[0].nazivSorte
        : poznateSorte.length === 0
          ? "Zatečeno vino"
          : "Cuvée / blend";

  // KNJIGA PROTIV TANKA. `Tank.kolicinaVinaUTanku` je od faze E predmemorija,
  // pa se uz nju pokazuje sto knjiga kaze. Razlika je uredno nula; kad nije,
  // to se mora vidjeti, a ne tiho progutati.
  const razlikaKnjigaTank = podrijetloKnjige.razlikaOdTankaL;
  const razlikeSastava = razlikaSastava(udjeliSorti, sastavKnjige);

  // DEKLARIRANA SORTA NAPRAMA ONOME STO KNJIGA POKAZUJE.
  //
  // Dvije razlicite tvrdnje o istom vinu: deklarirana sorta je ono sto bi
  // pisalo na etiketi i upisuje ju cin imenovanja, a sastav se izvodi iz
  // knjige pri svakom prikazu. SMIJU se razlikovati — cuvée se zove „Cuvée
  // bijeli" i to nije greska — pa se obje pokazuju, a nesklad se tvrdi samo
  // kad je nedvojben (jedna sorta drzi gotovo cijeli tank, a deklarirano je
  // nesto drugo). Vidi `usporediSaSastavom`.
  const usporedbaSorte = usporediSaSastavom(ime.deklariranaSorta, sastavKnjige);

  // PARAMETRI IZ KNJIGE — zadnja mjerena vrijednost koja pripada OVOM vinu, u
  // kojoj god posudi bila izmjerena.
  //
  // Zadnja mreza ispod vlastitog mjerenja i procjene iz blenda. Tankovi 15 i
  // 32 nisu imali ni alkohol ni kiseline iako su ta vina mjerena: vrijednost
  // stoji u arhivi tanka 8 od 18.06., a do nje ne dolazi ni citac ovog tanka
  // (gleda samo ovaj tank) ni blend (pokazivaci vode na tank 5). Knjiga zna da
  // je bas to vino bilo u tanku 8 do 18.08.
  //
  // Cita se TEK OVDJE, u nizu — isti razlog kao podrijetlo iznad.
  const parametriVina = await parametriVinaIzKnjige(prisma, id);

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
  // KOJA PUNJENJA PRIPADAJU OVOM VINU — sudi KNJIGA, ne `datumPunjenja`.
  //
  // Dosad je upit gore rezao punjenja granicom po datumu iz obrasca. Otkad sat
  // knjige ima donju branu (lib/sat-knjige.ts), datum i ULAZ redak se razilaze:
  // punjenje tanka 27 nosi datum 09.09., a vino je po knjizi uslo 10.09., pa je
  // filtar po datumu sakrio i samo punjenje i njegovo pocetno mjerenje.
  // Izmjereno 12.09.2026: T27, T33 i T45 tako gube secer, kiseline i pH s
  // grozdja, a T2 jedno punjenje; nijedan tank ne gubi nista.
  //
  // Racun je u lib/punjenje-vina.ts, isti koji koristi `vrijednostiTankaPoPolju`
  // — dva ekrana ne smiju suditi razlicito o istom vinu.
  const kretanjaTanka = await prisma.berbaKretanje.findMany({
    where: { OR: [{ uTankId: id }, { izTankId: id }] },
    select: {
      id: true,
      uTankId: true,
      izTankId: true,
      berbaId: true,
      litre: true,
      vrsta: true,
      dogodenoAt: true,
      createdAt: true,
      punjenjeId: true,
    },
  });

  const pripadnost = punjenjaTrenutnogVina(
    id,
    svaPunjenja,
    kretanjaTanka,
    granicaVinaAt
  );
  const uVinu = new Set(pripadnost.ids);
  const punjenja = svaPunjenja.filter((p) => uVinu.has(p.id));

  // Pocetno mjerenje punjenja nosi DATUM BERBE (secer, kiseline i pH izmjereni
  // su na grozdju), dakle UTC ponoc, pa redovno pada ispred granice. Pripadnost
  // vinu utvrdjuje PUNJENJE, ne sat mjerenja. Vidi `mjerenjaTrenutnogVina`.
  const pocetnaMjerenjaNovogVina = pripadnost.pocetnaMjerenja;

  // Prazan tank nema vlastitih parametara, bentotesta ni tocaka grafa: null
  // granica bi ovdje znacila "sva mjerenja" (vidi `tankBezVina`).
  const mjerenjaZaParametre = (
    tankBezVina
      ? []
      : mjerenjaTrenutnogVina(mjerenja, granicaVinaAt, pocetnaMjerenjaNovogVina)
  ) as unknown as RedakMjerenja[];

  const poPolju = sloziPoPolju(mjerenjaZaParametre);

  // IZBOR VRIJEDNOSTI PO POLJU — lib/monitor-vina.ts. Isti izbor sprema i
  // snimka vina kad napusta posudu, pa ne smije postojati druga kopija ovdje.
  // Stranica dodaje samo ono sto je prikaz: graf i detalje blenda.
  const izbor = vrijednostiMonitora({
    poPolju,
    blend,
    parametriVina,
    tankBezVina,
  });

  const parametri: ParametarPrikaz[] = izbor.map((o) => {
    const izvor = o.vlastito;
    const b = o.blend;
    const izKnjige = o.izKnjige;

    return {
      kljuc: o.kljuc,
      naziv: o.naziv,
      jedinica: o.jedinica,
      vrijednost: o.vrijednost,
      podrijetlo: o.podrijetlo,
      neprikazano: o.neprikazano,
      izKnjige: izKnjige
        ? {
            mjerenoAt: izKnjige.najnovijeAt.toISOString(),
            posude: [
              ...new Set(
                izKnjige.izvori.map((x) =>
                  x.brojTanka != null ? `tank ${x.brojTanka}` : "nepoznatoj posudi"
                )
              ),
            ],
            postotak: izKnjige.postotak,
          }
        : null,
      datum: izvor?.izmjerenoAt.toISOString() ?? null,
      // GRAF IDE KROZ LANAC VINA (28.09.2026), ne vise od granice.
      //
      // Vlastita mjerenja ovog tanka + mjerenja istog vina iz ranijih posuda,
      // spojena u jedan niz po vremenu. Vlastita granicu postuju kroz
      // `mjerenjaTrenutnogVina` (s iznimkom pocetnog mjerenja punjenja,
      // datiranog danom berbe), pa se ovdje ne rezu.
      //
      // Naslijedena tocka prolazi samo ako je izmjerena u posudi koja je karika
      // `lanacVina`, unutar prozora te karike. Obicni pretok nije prekid u
      // zivotu vina: mijenja se posuda, vino ostaje isto — a granica vina je
      // trenutak ulaska u POSUDU, ne nastanak vina. Do 28.09. je ovdje stajala
      // granica, pa je T21 (isto vino od 09.09., u tank dosao 25.09.) crtao
      // secer od 25.09. i gubio dvanaest mjerenja iz T11.
      //
      // Lanac staje na prvom spoju vise izvora (cuvee), pa tocke iz posuda s
      // druge strane cuveea ne ulaze — to je drugo vino.
      //
      // KARTICE IZNAD OSTAJU NA GRANICI: ovo je samo krivulja.
      //
      // Vlastito ima prednost: kad su oba niza imala isti trenutak, na grafu
      // ostaje redak ovog tanka (ima `jeRucno`, naslijedeni nema).
      niz: spojiNiz(
        nizPolja(mjerenjaZaParametre, o.kljuc).map((t) => ({
          t: t.izmjerenoAt.toISOString(),
          v: t.vrijednost,
          rucno: t.jeRucno,
          posuda: null,
        })),
        (parametriVina?.niz[o.kljuc] ?? [])
          // Samo tocke koje opisuju VECINU vina u tanku. Vino je obicno spoj
          // desetak partija, svaka je prosla svojim putem, pa bi bez ovoga graf
          // tanka 5 dobio 91 tocku iz 16 posuda — paralelne krivulje tudih
          // mostova, ne povijest ovog vina. Ovo NIJE prag na vrijednosti (te se
          // prikazuju bez obzira na pokrivenost) nego na tome sto se CRTA.
          // Vlastita tocka (izmjerena u OVOJ posudi) ulazi samo ako je PRIJE
          // granice — prvi boravak vina koje se vratilo u isti tank. Ono od
          // granice nadalje vec je u vlastitom nizu iznad.
          .filter(
            (x) =>
              x.postotak >= 50 &&
              (!x.vlastito || (granicaVinaAt != null && x.izmjerenoAt < granicaVinaAt))
          )
          .filter((x) => {
            const posuda =
              x.brojTanka != null ? tankPoBroju.get(x.brojTanka) : undefined;
            return posuda != null && uProzoruLanca(posuda, x.izmjerenoAt);
          })
          .map((x) => ({
            t: x.izmjerenoAt.toISOString(),
            v: x.vrijednost,
            rucno: false,
            posuda: x.brojTanka != null ? `tank ${x.brojTanka}` : "ranija posuda",
          }))
      ),
      blend: b
        ? {
            vrijednost: b.vrijednost,
            postotak: b.postotak,
            // Udio VINA U TANKU, uz udio blenda — dva pitanja, dva broja.
            postotakOdTanka: b.postotakOdTanka,
            pokrivenoL: b.pokrivenoL,
            ukupnoL: b.ukupnoL,
            kolicinaUTankuL: blend?.kolicinaUTankuL ?? null,
            // Datum najnovijeg mjerenja medju sastavnicama koje su dale ovu
            // vrijednost — po njemu prikaz istice staru procjenu.
            mjerenoAt: b.najnovijeMjerenoAt?.toISOString() ?? null,
            pragDana: DANA_ZA_STARU_PROCJENU,
            doprinosi: b.doprinosi.map((d) => ({
              naziv: d.naziv,
              kolicina: d.kolicina,
              vrijednost: d.vrijednost,
              izmjerenoAt: d.izmjerenoAt?.toISOString() ?? null,
            })),
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

  // Partije koje su u tanku SADA, po knjizi. Vlastita punjenja stoje GORE i
  // odgovaraju na drugo pitanje („sto je u ovaj tank usuto"), pa se ne mijesaju
  // u isti popis.
  //
  // ZATECENO VINO NEMA BERBU — i ne smije je glumiti.
  //
  // Vino zateceno u podrumu kad je knjiga pocela (2025. i ranije) nema nijedan
  // zapis berbe: ni datum, ni parcelu, ni kilograme — sve je prazno. Sest
  // praznih kartica na tanku 6 nije podatak nego suma. Zato zatecene partije
  // ne dobivaju karticu berbe nego JEDAN redak s kolicinom.
  const NISTA = 0.5;

  // Partija ispod pola litre se ne prikazuje: to je zaostatak zaokruzivanja
  // pretoka, a ne vino o kojem se ima sto reci.
  const svePartije = podrijetloKnjige.stavke.filter((x) => x.uTankuL >= NISTA);

  // Zapis berbe ima samo ono sto je u podrum stvarno uslo kao grozdje.
  const partijeKnjige = svePartije.filter((x) => x.vrstaUnosa === "BERBA");
  const zateceneP = svePartije.filter((x) => x.vrstaUnosa !== "BERBA");
  const zatecenoL = Number(
    zateceneP.reduce((z, x) => z + x.uTankuL, 0).toFixed(3)
  );

  // Dio zatecenog vina ipak ima poznatu sortu (netko ju je upisao pri
  // pocetnom popisu); to je jedino sto se o njemu zna i vrijedi reci.
  const sorteZatecenog = [
    ...new Set(
      zateceneP
        .filter((x) => x.nazivSorte !== SORTA_NEPOZNATA)
        .map((x) => x.nazivSorte)
    ),
  ];

  const naslijedenoStavki = partijeKnjige.length + (zatecenoL > 0 ? 1 : 0);

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

  // "Zadnje klasicno mjerenje" — prazan tank ga nema (vidi `tankBezVina`).
  const mjerenjaZaTop = tankBezVina ? [] : mjerenja;

  // POPIS MJERENJA — vlastita od granice vina, plus mjerenja istog vina iz
  // posuda LANCA, u prozoru karike. Isti rez kao naslijedeni dio grafa.
  // Mreza parametara i bentotest i dalje stoje na granici; ovo je samo popis.
  //
  // Svaki redak nosi posudu u kojoj je izmjeren: mjerenje ne mijenja adresu,
  // i "cije je vino tada bilo" pita knjigu TE posude, ne ove.
  type RedakPopisa = Pick<
    (typeof mjerenja)[number],
    | "id"
    | "izmjerenoAt"
    | "alkohol"
    | "ukupneKiseline"
    | "hlapiveKiseline"
    | "slobodniSO2"
    | "ukupniSO2"
    | "secer"
    | "ph"
    | "temperatura"
    | "bentotestDatum"
    | "bentotestStatus"
    | "napomena"
  > & { posudaId: string };

  // ARHIVA SE CITA OBAVEZNO (vidi AGENTS.md): arhiviranje SELI mjerenja, pa
  // je `Mjerenje` prazna za svaku posudu lanca koja je u medjuvremenu
  // arhivirana. Spaja se preko `ArhivaVina` po `tankId`, uz `brojTanka` kao
  // rezervu — isti obrazac kao `mjerenjaStabla` gore.
  //
  // CIJENA: tri upita, samo kad lanac postoji — `ArhivaVina`, pa zivo i
  // arhivsko usporedno.
  //
  // Karika u samom ovom tanku (prvi boravak) od 09.10.2026. ulazi kao i svaka
  // druga — vidi `uProzoruLanca`.
  const mjerenjaLanca: RedakPopisa[] = [];
  const kariceSProzorom = lanacVina.filter(
    (k): k is { tankId: string; odAt: Date; doAt: Date } => k.odAt != null
  );
  if (kariceSProzorom.length > 0) {
    const posudeLanca = [...new Set(kariceSProzorom.map((k) => k.tankId))];
    const brojeviLanca = posudeLanca
      .map((x) => brojeviTankova.get(x))
      .filter((x): x is number => x != null);

    const arhiveLanca = await prisma.arhivaVina.findMany({
      where: {
        OR: [
          { tankId: { in: posudeLanca } },
          { brojTanka: { in: brojeviLanca } },
        ],
      },
      select: { id: true, tankId: true, brojTanka: true },
    });
    // Arhivski redak kojem `tankId` nije upisan dobiva posudu iz svoje arhive.
    const posudaArhive = new Map(
      arhiveLanca.map((a) => [
        a.id,
        a.tankId ?? (a.brojTanka != null ? tankPoBroju.get(a.brojTanka) : undefined),
      ])
    );

    const [zivaLanca, arhivskaLanca] = await Promise.all([
      prisma.mjerenje.findMany({
        where: {
          OR: kariceSProzorom.map((k) => ({
            tankId: k.tankId,
            izmjerenoAt: { gte: k.odAt, lte: k.doAt },
          })),
        },
      }),
      // PROZOR KARIKE U SAMOM UPITU, ne tek u JS-u: posuda lanca nosi i
      // mjerenja vina koja su ondje stajala prije i poslije ovoga (T32:
      // 16 od 21 arhivskog retka bilo je izvan prozora).
      prisma.arhivaVinaMjerenje.findMany({
        where: {
          OR: kariceSProzorom.flatMap((k) => {
            const prozor = { gte: k.odAt, lte: k.doAt };
            const arhiveKarike = arhiveLanca
              .filter((a) => posudaArhive.get(a.id) === k.tankId)
              .map((a) => a.id);
            return [
              { tankId: k.tankId, izmjerenoAt: prozor },
              ...(arhiveKarike.length > 0
                ? [{ arhivaVinaId: { in: arhiveKarike }, izmjerenoAt: prozor }]
                : []),
            ];
          }),
        },
      }),
    ]);

    for (const m of zivaLanca) mjerenjaLanca.push({ ...m, posudaId: m.tankId });

    // Isto mjerenje ne smije stajati dvaput, zivo i kao arhivska kopija — ni
    // kopija vlastitog mjerenja od granice, koje je u popisu kao vlastito
    // (karika u istoj posudi dodiruje danasnji prozor).
    const zivaIds = new Set(zivaLanca.map((m) => m.id));
    const vlastitaIds = new Set(
      granicaVinaAt ? mjerenja.filter((m) => m.izmjerenoAt >= granicaVinaAt).map((m) => m.id) : []
    );
    for (const m of arhivskaLanca) {
      if (m.izvornoMjerenjeId && (zivaIds.has(m.izvornoMjerenjeId) || vlastitaIds.has(m.izvornoMjerenjeId))) continue;
      const posuda = m.tankId ?? posudaArhive.get(m.arhivaVinaId);
      if (!posuda || !uProzoruLanca(posuda, m.izmjerenoAt)) continue;
      mjerenjaLanca.push({ ...m, posudaId: posuda });
    }
  }

  // Prazan tank nema ni vlastitih redaka (vidi `tankBezVina`).
  const vlastitaOdGranice: RedakPopisa[] = (
    tankBezVina
      ? []
      : granicaVinaAt
        ? mjerenja.filter((m) => m.izmjerenoAt >= granicaVinaAt)
        : mjerenja
  ).map((m) => ({ ...m, posudaId: id }));
  // Redak po id-u se ne ponavlja. Od 09.10.2026. ovo je stvarna brana, ne
  // pricuva: karika u istoj posudi (prvi boravak) dodiruje danasnji prozor na
  // pojasu [granica 00:00, odlazak], pa isto zivo mjerenje dolazi iz oba upita.
  const vecUPopisu = new Set(vlastitaOdGranice.map((m) => m.id));
  const svaMjerenja: RedakPopisa[] = [
    ...vlastitaOdGranice,
    ...mjerenjaLanca.filter((m) => !vecUPopisu.has(m.id)),
  ]
    .sort((a, b) => b.izmjerenoAt.getTime() - a.izmjerenoAt.getTime())
    // REZ NA 100 TEK NAKON SPAJANJA, namjerno ostavljeno: kod dugog lanca
    // retci iz lanca mogu potisnuti starija VLASTITA mjerenja s popisa.
    // Najdulji popis 28.09.2026. je 33 retka (T26), pa se to jos ne dogadja.
    .slice(0, 100);

  // FAZA C — CIJE JE VINO SVAKO MJERENJE MJERILO.
  //
  // Mjerenje ZADRZAVA svoju adresu: tank i vrijeme. Ono je stanje SMJESE u
  // trenutku, a ne svojstvo nijedne berbe — vino od cetrnaest berbi ima jedan
  // pH, ne cetrnaest — pa se ne seli nikamo i ne dijeli se po udjelima. Iz
  // knjige se izvodi samo odgovor na pitanje CIJE je to vino tada bilo.
  //
  // Zasto to uopce treba: tank je posuda. Mjerenje od 21.08. na tanku 5 ne
  // govori o vinu koje je u tanku 5 danas, nego o onome sto je tada bilo u
  // njemu — a to je moglo otici u tri druga tanka.
  //
  // JEDAN UPIT ZA SVA MJERENJA, ne jedan po mjerenju: knjiga tanka se povuce
  // odjednom i preklopi u JS-u za svaki trenutak. Sto mjerenja inace znaci sto
  // odlazaka do baze (lib/paralelno.ts, pooler drzi 15 veza).
  //
  // PO POSUDI U KOJOJ JE MJERENO, ne po ovom tanku: mjerenje iz tanka 11 od
  // 12.09. pita sto je tada bilo u tanku 11. `vinoUTrenucimaVise` to radi za
  // sve posude odjednom, istim brojem upita kao dosadasnji poziv za jednu.
  const vinoPoMjerenju = new Map<string, VinoUTrenutku>();

  if (svaMjerenja.length > 0) {
    const poPosudi = new Map<string, RedakPopisa[]>();
    for (const m of svaMjerenja) {
      const popis = poPosudi.get(m.posudaId) ?? [];
      popis.push(m);
      poPosudi.set(m.posudaId, popis);
    }
    const vina = await vinoUTrenucimaVise(
      prisma,
      [...poPosudi].map(([tankId, redci]) => ({
        tankId,
        trenuci: redci.map((m) => m.izmjerenoAt),
      }))
    );
    for (const [tankId, redci] of poPosudi) {
      const zaPosudu = vina.get(tankId);
      redci.forEach((m, i) => {
        const v = zaPosudu?.[i];
        if (v) vinoPoMjerenju.set(m.id, v);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // KRONOLOGIJA — lib/kronologija-vina.ts, ista kao /prosli-tank?snimka=.
  //
  // Od 09.10.2026. stranica ne slaze kronologiju sama. Modul cita svih sest
  // izvora (punjenja, zadaci, radnje, pretoci, dolasci prijenosom, izlazi) PO
  // PROZORIMA VINA, uz obavezne arhivske tablice, pa vino koje se vratilo u isti
  // tank ne gubi prvi boravak, a karike lanca daju i svoje punjenja, pretoke i
  // zadatke — dosad je lanac davao samo `VinoRadnja`.
  //
  // MIJESANJE IZVORA NE DOLAZI U OBZIR: vlastiti izvori stranice (od granice)
  // i prvi prozor modula pokrivaju isto razdoblje iste posude, pa bi svaki
  // vlastiti dogadaj stajao dvaput, s istim React kljucem.
  //
  // Nema `take`: prozor vina je prirodna granica. Stranica je imala `take: 50`
  // za izlaze, a T43 ih ima 49 — prva sljedeca prodaja sakrila bi najstariji.
  //
  // Prazan tank: modul se ne zove (vidi `prozori`). Dogadaj ARHIVA ne postoji:
  // arhivirano vino vise nije u posudi.
  //
  // MJERENJA NISU OVDJE: ostaju vlastita kartica sa svojim grafom po parametru.
  // ---------------------------------------------------------------------------
  const dogadaji: Dogadaj[] = tankBezVina
    ? []
    : await dogadajiVina(prisma, {
        prozori,
        tankIzlazaId: id,
        brojTanka: brojeviTankova as Map<string, number>,
        trenutnaSnimkaId: null,
      });
  // Prozori koji pocinju prije 11.09.2026.: praznina u njima ne znaci da nista
  // nije radjeno — vidi `PREZIVLJAVA_OD`.
  const nepotpuniProzori = prozoriPrijePrezivljavanja(prozori);


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
      <div style={omotacStyle}>
      <div style={headerStyle}>
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <h1 style={titleStyle}>Tank {tank.broj}</h1>
            <div style={subtitleStyle}>Pregled tanka, vina i radnji</div>
          </div>

          <div style={headerBadgesWrapStyle}>
            <div style={headerBadgeStyle}>Sastav: {oznakaSastava}</div>
            <div style={headerBadgeStyle}>Tip: {tank.tip ?? "-"}</div>
            {/* KNJIGA PROTIV TANKA. `Tank.kolicinaVinaUTanku` je od faze E
                predmemorija, pa uz nju stoji sto knjiga kaze. Razlika je
                uredno nula; kad nije, mora se vidjeti. */}
            <div style={headerBadgeStyle}>
              {Math.abs(razlikaKnjigaTank) > 0.5
                ? "Knjiga: " +
                  formatBroj(podrijetloKnjige.ukupnoL, 0) +
                  " L (razlika " +
                  formatBroj(razlikaKnjigaTank, 0) +
                  " L)"
                : "Knjiga se slaže: " +
                  formatBroj(podrijetloKnjige.ukupnoL, 0) +
                  " L"}
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

      {/* IME VINA (faza 4) — iz cina imenovanja, ne s `Tank.nazivVina`.
          ======================================================================
          Tri retka, svaki s vlastitom tvrdnjom i vlastitim izvorom:

            1. IME — kako se vino zove. Bezimeno se kaze rijecima, jer prazno
               mjesto izgleda kao podatak koji nedostaje, a rijec je o poslu
               koji ceka covjeka (osam tankova, faza 5).
            2. DEKLARIRANA SORTA — ono sto bi pisalo na etiketi.
            3. NESKLAD — samo kad deklarirano i knjiga nedvojbeno ne govore
               isto. Ne bira se pobjednik: stoje obje tvrdnje, imenovane.

          Stvarni sastav ima svoju karticu nize i ne ponavlja se ovdje. */}
      {ime.razlog === "PRAZAN" ? null : (
        // `minWidth: 0` iz istog razloga kao na kartici monitora: element
        // rešetke se inace ne smije stisnuti ispod min-content sirine svog
        // sadrzaja, a ovdje sadrzaj ukljucuje i recenicu o neskladu.
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <div style={ime.naziv ? nazivVinaStyle : nazivVinaBezimenoStyle}>
            {ime.naziv ?? "Bez imena"}
          </div>

          {ime.deklariranaSorta ? (
            <div style={deklariranaSortaStyle}>
              Deklarirana sorta: {ime.deklariranaSorta}
            </div>
          ) : null}

          {/* SIFRA — zaseban redak, ne dio imena. Bez nje pise „bez sifre":
              to je posao koji ceka covjeka (unos unatrag), ne podatak koji
              se nije ucitao. */}
          <div style={deklariranaSortaStyle}>
            Šifra:{" "}
            {sifraPrikaz.bezSifre ? (
              <span style={bezSifreStyle}>{sifraPrikaz.tekst}</span>
            ) : (
              <strong style={{ color: "#111827" }}>{sifraPrikaz.tekst}</strong>
            )}
          </div>

          {usporedbaSorte.razilazi &&
          usporedbaSorte.deklarirana &&
          usporedbaSorte.glavna ? (
            <div style={sortaNeskladStyle}>
              Deklarirano „{usporedbaSorte.deklarirana}”, a knjiga kaže{" "}
              {usporedbaSorte.glavna}{" "}
              {formatBroj(usporedbaSorte.glavniPostotak ?? 0, 1)} %.
            </div>
          ) : null}

          {/* `jeBezImena`, ne `razlog === "BEZIMENO"`: osam tankova IMA zapis o
              imenovanju, ali u njemu stoji samo deklarirana sorta. Vino je i
              dalje bezimeno i to mora pisati. */}
          {jeBezImena(ime) ? (
            <div style={sortaNeskladStyle}>
              Vino je u tanku, ali ga nitko nije imenovao.
            </div>
          ) : null}

          {/* IMENOVANJE (faza 5). Samo L1/L2 i samo uz vino u tanku — prazan
              tank ovaj blok ionako ne crta. Sastav ide iz knjige, isti popis
              kao u kartici Sastav, da se ne imenuje naslijepo. */}
          {jeL12(prijavljeni.role) ? (
            <ImenujVino
              tankId={tank.id}
              brojTanka={tank.broj}
              naziv={ime.naziv}
              deklariranaSorta={ime.deklariranaSorta}
              sifra={ime.sifra}
              sastav={sastavKnjige.map((s) => ({
                nazivSorte: s.nazivSorte,
                litre: s.litre,
                postotak: s.postotak,
                nepoznata: s.nepoznata,
              }))}
            />
          ) : null}
        </div>
      )}

      <div style={topParamsGridStyle}>
        <ParamTop
          label="Količina vina"
          value={formatBroj(tank.kolicinaVinaUTanku)}
          unit="L"
          velika
        />
        <ParamTop
          label="Kapacitet"
          value={formatBroj(tank.kapacitet)}
          unit="L"
          velika
        />
        <ParamTop label="Slobodno" value={formatBroj(slobodno)} unit="L" velika />
      </div>


      {/* KVACICA "POVIJEST VINA".

          Gornji blok (`uvijek`) odgovara na pitanje STO JE U TANKU SADA i
          uvijek se vidi. Donji odgovara KAKO JE DOSLO DOVDE i kvacica ga
          skuplja: kad se vino slije u veliki tank pa razdijeli u male, svi
          mali imaju istu povijest pa ona prestaje razlikovati tankove.

          Grafovi u Parametrima ostaju u gornjem bloku — zatvoreni su dok se
          plocica ne klikne, pa ne trose ekran. */}
      <PovijestPrekidac
        uvijek={
          <>
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
          {/* Vrijednosti i bentotest stoje na granici vina; graf od 28.09.2026.
              ide kroz lanac. Jedna recenica za oboje vise ne bi bila tocna. */}
          {granicaVinaAt && lanacZaNatpis.length === 0 ? (
            <div>
              Prikazana su mjerenja otkad je ovo vino u tanku (
              {formatDatumBezVremena(granicaVinaAt)}) nadalje — starija pripadaju
              prethodnom vinu.
            </div>
          ) : null}
          {granicaVinaAt && lanacZaNatpis.length > 0 ? (
            <div>
              Vrijednosti i bentotest su iz mjerenja otkad je ovo vino u tanku (
              {formatDatumBezVremena(granicaVinaAt)}). Graf uz to pokazuje i
              mjerenja istog vina dok je stajalo u{" "}
              {[...new Set(lanacZaNatpis.map((k) => `tanku ${k.broj ?? "?"}`))].join(" i ")} —
              uz svaku takvu točku piše posuda.
            </div>
          ) : null}
        </div>
      </Card>

      {/* MREZA: Kvasci, Sastav i Odakle je vino jedan do drugoga, a ne jedan
          ispod drugoga (app/globals.css, .tank-mreza). "Odakle" zauzima dva
          stupca: stablo do sest razina u stupcu od 290 px se lomi. */}
      <div className="tank-mreza">

      {/* --- KVASCI: sto je vino fermentiralo, ma gdje se to dogodilo. ---

          Stranica je do sada o kvascu sutjela, jer je kvasac zapisan kao
          `Radnja` na tanku u kojem je DODAN — a vino je odavno drugdje.
          Ovdje se cita `VinoRadnja`, koja putuje s vinom, pa uz svaki kvasac
          stoji i tank u kojem je posao.

          "bez zapisa" se ispisuje UVIJEK kad postoji: zbroj mora davati 100 %,
          inace popis izgleda kao da je racun negdje pojeo ostatak. */}
      <Card
        title="Kvasci ovog vina"
        broj={kvasci.stavke.length}
        pod={
          kvasci.stavke[0]?.poPartiji
            ? "≈ pripisano po berbenoj partiji, ne po trenutku pretoka"
            : "udio današnjeg volumena koji je fermentirao s tim kvascem"
        }
      >
        {kvasci.stavke.length === 0 ? (
          <div style={mutedTextStyle}>
            Za vino u ovom tanku nema zapisa o kvascu.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6, padding: 10 }}>
            {/* PRIPISANO PO PARTIJI — obavezna oznaka. Nazivnik je cijela
                berbena šarža, pa su postotci sustavno niži od onih po trenutku
                pretoka i ta se dva pravila ne smiju čitati kao ista mjera.
                Popis je uvijek cijel po jednom pravilu, pa natpis ide jednom. */}
            {kvasci.stavke[0]?.poPartiji && (
              <div style={{ ...mutedTextStyle, fontStyle: "italic" }}>
                ≈ pripisano po berbenoj partiji — vino je iz tanka izašlo prije
                nego što je kvasac dodan, pa je to ista šarža koja je s njim
                fermentirala. Postotci nisu usporedivi s tankovima gdje kvasac
                stoji uz sam pretok.
              </div>
            )}
            {kvasci.stavke.map((kv, i) => (
              <div key={`${kv.naziv}-${i}`} style={{ display: "grid", gap: 2 }}>
                {/* Postotak odmah uz naziv, detalj u drugom redu. */}
                <div style={nazivBrojRedStyle}>
                  <strong>{kv.naziv}</strong>
                  <strong style={brojUzNazivStyle}>
                    {kv.poPartiji ? "≈ " : ""}
                    {kv.postotak} %
                  </strong>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {kv.brojTanka !== null && (
                    <span style={mutedTextStyle}>tank {kv.brojTanka}</span>
                  )}
                  <span style={mutedTextStyle}>{formatDatum(kv.datum)}</span>
                </div>
              </div>
            ))}
            {kvasci.bezZapisaPostotak > 0 && (
              <div
                style={{
                  ...nazivBrojRedStyle,
                  fontStyle: "italic",
                  ...mutedTextStyle,
                }}
              >
                <span>bez zapisa</span>
                <strong style={brojUzNazivStyle}>
                  {kvasci.bezZapisaPostotak} %
                </strong>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* SASTAV — IZVEDEN IZ KNJIGE (faza E).
          Do sada je glavni popis bio `TankSortaUdio`: spremljeno stanje koje
          je netko upisao ili ga je pretok izracunao i ostavio, i koje od tada
          moze odlutati a nista ga ne vraca natrag. Sada je glavni popis onaj
          koji se racuna iz knjige kretanja pri svakom prikazu, ponderiran po
          LITRAMA (tri berbe od 100 L i jedna od 3.000 L nisu 75:25 nego 9:91).
          Upisani sastav se i dalje pise i cuva, ali se prikazuje samo kad se
          razide od knjige — i tada kao sporedan. */}
      <Card title="Sastav" broj={sastavKnjige.length} pod="sorti" sklopljena>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={sectionToolbarStyle}>
            <div style={mutedTextStyle}>
              Sastav vina u tanku — iz knjige kretanja
            </div>

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

          {sastavKnjige.length === 0 ? (
            <div style={mutedTextStyle}>
              Knjiga za ovaj tank ne zna nijednu berbu — vino je u njega ušlo
              prije nego je knjiga počela, ili je tank prazan.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {sastavKnjige.map((s) => (
                <div key={s.nazivSorte} style={compositionRowStyle}>
                  <div style={compositionHeaderStyle}>
                    <div style={nazivBrojRedStyle}>
                      <strong
                        style={{
                          fontWeight: 600,
                          color: s.nepoznata ? "#6b7280" : undefined,
                        }}
                      >
                        {s.nazivSorte}
                      </strong>
                      <strong style={brojUzNazivStyle}>
                        {formatBroj(s.postotak)}%
                      </strong>
                    </div>
                    <span style={{ color: "#6b7280" }}>
                      {formatBroj(s.litre, 0)} L
                    </span>
                  </div>

                  <div style={progressTrackStyle}>
                    <div
                      style={{
                        ...progressFillStyle,
                        background: s.nepoznata ? "#c8c8c8" : undefined,
                        width: `${Math.max(
                          0,
                          Math.min(100, Number(s.postotak))
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* NEPOZNATO NIJE NESLAGANJE nego rupa u znanju: vino zateceno prije
              nego je knjiga pocela. Imenuje se posebno, a usporedba s upisanim
              sastavom gleda samo poznati dio. */}
          {nepoznatoUKnjizi.litre > 0 ? (
            <div style={mutedTextStyle}>
              Za {formatBroj(nepoznatoUKnjizi.litre, 0)} L (
              {formatBroj(nepoznatoUKnjizi.postotak, 0)}%) knjiga ne zna sortu —
              to je vino zatečeno u podrumu prije nego je knjiga počela.
            </div>
          ) : null}

          {/* UPISANI SASTAV se prikazuje SAMO kad se razide od knjige. Dok se
              slazu, dva ista popisa jedan ispod drugoga samo zauzimaju ekran. */}
          {razlikeSastava.length > 0 ? (
            <div style={izKnjigeOkvirStyle}>
              <div style={izKnjigeNaslovStyle}>
                Upisano u tank — razilazi se s knjigom
              </div>

              <div style={{ display: "grid", gap: 4 }}>
                {udjeliSorti.map((u) => (
                  <div key={u.id} style={izKnjigeRedStyle}>
                    <span>{u.nazivSorte}</span>
                    <strong style={brojUzNazivStyle}>
                      {formatBroj(u.postotak)}%
                    </strong>
                  </div>
                ))}
              </div>

              <div style={blendUpozorenjeStyle}>
                {razlikeSastava
                  .map(
                    (r) =>
                      `${r.nazivSorte}: upisano ${
                        r.spremljeno == null ? "—" : `${formatBroj(r.spremljeno)}%`
                      }, knjiga ${
                        r.izKnjige == null ? "ne poznaje" : `${formatBroj(r.izKnjige)}%`
                      }`
                  )
                  .join("; ")}
                . Prikazuje se knjiga — ona se samo dopisuje i ne može odlutati.
                Upisani sastav se mijenja rukom i ovdje stoji samo da se vidi
                razlika.
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {/* ODAKLE JE VINO — kucica po SVAKOM izvoru, do berbe.
          Odgovara na drugo pitanje od kartice "Sastav": ne koje su sorte u
          tanku, nego iz kojih je posuda vino doteklo i sto je s njim usput
          bilo. Klik otvara razinu po razinu.

          ZADANO OTVORENA od 17.09.2026. Dotad je stajala sklopljena, a
          kronologija je istu stvar pokazivala retkom po redkom (vrsta
          "NASLIJEDENO", 120 od 127 redaka na T42). Kad su ti redci maknuti,
          ovo je jedino mjesto koje odgovara na "od cega je ovo vino" — pa se
          ne smije prvo morati otvoriti. */}
      <div className="tank-mreza-siroka">
      <Card title="Odakle je vino" broj={sastavPrikaz.stavke.length} pod="u sastavu">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={mutedTextStyle}>
            Vina od kojih je ovo vino sastavljeno, do berbe: komponente kupaže i
            dolijevanja. Pretok istog vina u drugu posudu nije sastav nego
            kretanje i stoji u kronologiji. Litre su ono što je UŠLO u ovaj
            tank; kalo stoji uz njih kad ga ima.
          </div>

          {tankBezVina ? (
            <div style={mutedTextStyle}>Tank je prazan.</div>
          ) : sastavPrikaz.stavke.length === 0 ? (
            <div style={mutedTextStyle}>
              Knjiga za ovaj tank ne zna nijedan ulaz.
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {slozPrikazSastava(sastavPrikaz.stavke, {
                brojevi: brojeviTankova,
                oznakaPartije,
                korijenId: id,
                radnje: vinoRadnje,
                mjerenja: mjerenjaStabla,
                arhivskeRadnje: arhivskeRadnjeStabla,
                arhivskaMjerenja: arhivskaMjerenjaStabla,
                imena: imenaKucica,
              }).map((p, i) => (
                <StavkaSastavaVina key={i} p={p} />
              ))}
            </div>
          )}

          {!tankBezVina && sastavPrikaz.jos > 0 && (
            <div style={josRazinaStyle}>još {sastavPrikaz.jos} razina</div>
          )}

          {!tankBezVina && odljevVina.length > 0 && (
            <div style={odljevTrakaStyle}>
              <span style={izKnjigeNaslovStyle}>Otišlo od nastanka</span>
              {odljevVina.map((o, i) => {
                // KVAR je samo "neobjašnjeno" — ono sto ni jedno ime ne
                // pokriva. Ostalo su uredne stavke: prodano, odliveno, kalo,
                // ispravak stanja.
                const kvar = o.vrsta === "neobjasnjeno";
                return (
                  <span key={i} style={kvar ? odljevKvarStyle : odljevStavkaStyle}>
                    {kvar ? "⚠ " : ""}
                    {IME_ODLJEVA[o.vrsta] ?? o.vrsta} {formatBroj(o.litre, 0)} L
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </Card>
      </div>
      </div>

      {/* Precac na obrazac /zadaci s vec odabranim tankom. Samo ADMIN i
          PODRUM: obrazac se ondje ionako prikazuje samo njima. */}
      <Card
        title="Otvoreni zadaci"
        broj={otvoreniZadaci.length}
        kontrola={
          jeL12(prijavljeni.role) ? (
            <Link href={`/zadaci?tank=${tank.id}`} style={linkButtonSecondaryStyle}>
              Dodaj zadatak
            </Link>
          ) : null
        }
      >
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

      <div id="hladjenje" style={{ scrollMarginTop: 16 }} />

      {/* Precac na /dashboard/hladjenje, gdje se hladjenje podesava. Samo uz
          isti uvjet kao `where` te stranice (modbus adresa I nadzor): tanka bez
          njih ondje nema, pa bi gumb vodio u prazno. Tank ide kao parametar
          upita, ne kao podstranica — ENOLOG smije samo tocnu adresu. */}
      <Card
        title="Temperatura"
        pod="samo prikaz"
        kontrola={
          smijeUpravljati(prijavljeni.role) &&
          tank.nadzorHladjenja &&
          tank.modbusAdresa != null ? (
            <Link
              href={`/dashboard/hladjenje?tank=${tank.id}`}
              style={linkButtonSecondaryStyle}
            >
              Podesi hlađenje
            </Link>
          ) : null
        }
      >
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

          </>
        }
      >
      {/* --- BERBA: fiksni podaci o grozdju koje je uslo u tank. Kvacica za
              berbu OSTAJE unutar ove — berba se zna gledati i kad je ostalo
              skriveno. --- */}
      {prikaziBerbu ? (
        <BerbaPrekidac
          broj={stavkeBerbe.length + naslijedenoStavki}
          pod={
            naslijedenoStavki > 0
              ? `${stavkeBerbe.length} s ovog tanka · ${naslijedenoStavki} iz knjige`
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
                partije u knjizi kretanja.
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

            {/* --- PARTIJE IZ KNJIGE ---
                Vlastita punjenja idu GORE (ono sto je u OVAJ tank fizicki
                usuto), partije iz knjige ispod (ono sto je u njemu SADA, bez
                obzira kojim putem je doslo). Litre su stvarne i zbrojive; kg
                grozdja i secer opisuju cijelu berbenu partiju i ne zbrajaju
                se — iz svake je ovamo doslo samo onoliko koliko pise uz nju. */}
            {partijeKnjige.length > 0 || zatecenoL > 0 ? (
              <>
                <div style={naslijedenoZaglavljeStyle}>Iz knjige kretanja</div>

                {/* SAZETAK. Litre se smiju zbrojiti jer knjiga za svaku partiju
                    zna koliko je STVARNO u ovom tanku. Kilogrami se NE zbrajaju
                    — oni opisuju cijelu berbenu partiju, a ovamo je doslo samo
                    dio. Isto pravilo koje knjiga vec ima zapisano uz sebe. */}
                <div style={sazetakLancaStyle}>
                  <strong>
                    {partijeKnjige.length}{" "}
                    {hrvatskiOblik(
                      partijeKnjige.length,
                      "zapis berbe",
                      "zapisa berbe",
                      "zapisa berbe"
                    )}
                  </strong>{" "}
                  · u tanku{" "}
                  <strong>{formatBroj(podrijetloKnjige.ukupnoL, 0)} L</strong>
                  {Math.abs(podrijetloKnjige.razlikaOdTankaL) > 0.5 ? (
                    <>
                      {" "}
                      · knjiga i tank se razilaze za{" "}
                      {formatBroj(podrijetloKnjige.razlikaOdTankaL, 0)} L
                    </>
                  ) : null}
                </div>

                <div style={mutedTextStyle}>
                  Ovo je ono što knjiga kretanja kaže da je <strong>sada</strong>{" "}
                  u tanku — računa se iz zapisa koji se samo dopisuju, pa ne može
                  odlutati od stvarnog stanja. Litre su stvarne, u ovom tanku.
                  Kilogrami i šećer opisuju cijelu berbenu partiju i{" "}
                  <strong>ne zbrajaju se</strong>: ovamo je iz svake došlo samo
                  onoliko koliko piše uz nju.
                </div>

                {/* ZATECENO — jedan redak, bez kartice berbe. */}
                {zatecenoL > 0 ? (
                  <div style={zatecenoRedakStyle}>
                    <strong>Zatečeno vino — {formatBroj(zatecenoL, 0)} L</strong>
                    {zateceneP.length > 1 ? ` · ${zateceneP.length} partije` : ""}
                    <div style={{ ...mutedTextStyle, marginTop: 2 }}>
                      Podrijetlo se ne zna — vino je bilo u podrumu prije nego je
                      knjiga počela, pa za njega nema zapisa berbe.
                      {sorteZatecenog.length > 0 ? (
                        <> Poznato je samo: {sorteZatecenog.join(", ")}.</>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {partijeKnjige.slice(0, NASLIJEDENO_ODMAH).map((x) => (
                  <PartijaIzKnjige key={x.berbaId} x={x} />
                ))}

                {/* Ostatak iza <details> — bez JS-a, radi i na posluzitelju. */}
                {partijeKnjige.length > NASLIJEDENO_ODMAH ? (
                  <details style={{ display: "grid", gap: 10 }}>
                    <summary style={prikaziSveStyle}>
                      Prikaži još {partijeKnjige.length - NASLIJEDENO_ODMAH}{" "}
                      {hrvatskiOblik(
                        partijeKnjige.length - NASLIJEDENO_ODMAH,
                        "partiju",
                        "partije",
                        "partija"
                      )}
                    </summary>
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      {partijeKnjige.slice(NASLIJEDENO_ODMAH).map((x) => (
                        <PartijaIzKnjige key={x.berbaId} x={x} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
          </div>
        </BerbaPrekidac>
      ) : null}
      {/* --- KRONOLOGIJA: jedan slijed umjesto sest kartica (Radnje, Pretoci,
              Dolasci, Punjenja, Izlazi, Izvrseni zadaci). Mjerenja NISU ovdje
              — ostaju vlastita kartica, vidi kronologija.tsx. --- */}
      {/* KVACICA, ZADANO ISKLJUCENA. Kronologija zna biti 53 stavke i zatrpa
          sve ispod sebe; stanje se pamti u localStorage, kao i kod kvacice
          "Povijest vina" (vlasnik, 14.09.2026). */}
      <KronologijaPrekidac
        broj={dogadaji.length}
        pod="sve što se s ovim vinom radilo"
      >
        <OdPocetkaVina granica={granicaVinaAt} lanac={lanacZaNatpis} />
        {nepotpuniProzori.length > 0 ? (
          // Praznina prije 11.09. nije "nista se nije radilo" — vidi
          // `PREZIVLJAVA_OD` (lib/kronologija-vina.ts). Isti tekst kao na
          // /prosli-tank?snimka=.
          <div style={odArhiveStyle}>
            Zadaci i radnje prije {formatDatumBezVremena(PREZIVLJAVA_OD)} sačuvani
            su samo djelomično: arhiviranje ih je tada brisalo s posude, a
            kopiralo nepotpuno. Praznina u tom razdoblju ne znači da zadataka
            nije bilo. Odnosi se na:{" "}
            {nepotpuniProzori
              .map(
                (p) =>
                  `tank ${brojeviTankova.get(p.tankId) ?? "?"} (${
                    p.od ? formatDatumBezVremena(p.od) : "od početka"
                  } – ${formatDatumBezVremena(p.do < PREZIVLJAVA_OD ? p.do : PREZIVLJAVA_OD)})`
              )
              .join(", ")}
            . Zapisi iz arhive označeni su „iz arhive”.
          </div>
        ) : null}
        <div style={{ padding: 10 }}>
          <Kronologija dogadaji={dogadaji} />
        </div>
      </KronologijaPrekidac>


      <Card
        title="Porijeklo vina / sastavnice blenda"
        broj={tank.blendIzvori.length}
        sklopljena
      >
        {/* POKRIVENOST: koliko od vina u tanku blend uopce objasnjava.

            Blend SMIJE biti manji od tanka i to nije greska. Punjenje grozdjem
            dodaje vino koje nema izvorni tank; dopisati mu redak znacilo bi
            izmisliti porijeklo, pa se ne dopisuje. Ali dok kartica to nije
            govorila, T28 je tiho tvrdio da mu je porijeklo poznato, a blend mu
            je pokrivao 800 od 3.650 L.

            Veci blend od tanka je DRUGA prica — to je zaostatak, i od sada ga
            ne bi smjelo biti: izlaz vina blend skalira zajedno s tankom. */}
        {(() => {
          const blendL = tank.blendIzvori.reduce(
            (z, b) => z + Number(b.kolicina ?? 0),
            0
          );
          const uTanku = Number(tank.kolicinaVinaUTanku ?? 0);

          if (tank.blendIzvori.length === 0 || uTanku <= 0) return null;

          const razlika = uTanku - blendL;
          if (Math.abs(razlika) <= 0.5) return null;

          const postotak = Math.round((blendL / uTanku) * 100);

          return (
            <div style={blendUpozorenjeStyle}>
              {razlika > 0 ? (
                <>
                  Porijeklo je poznato za <strong>{formatBroj(blendL, 0)}</strong>{" "}
                  od <strong>{formatBroj(uTanku, 0)} L</strong> ({postotak} %).
                  Preostalih {formatBroj(razlika, 0)} L ušlo je punjenjem —
                  grožđe nema izvorni tank, pa mu se redak porijekla ne izmišlja.
                </>
              ) : (
                <>
                  ⚠ Blend tvrdi <strong>{formatBroj(blendL, 0)} L</strong>, a u
                  tanku je <strong>{formatBroj(uTanku, 0)} L</strong> — zaostatak
                  od {formatBroj(-razlika, 0)} L iz vremena kad izlaz vina nije
                  smanjivao blend.
                </>
              )}
            </div>
          );
        })()}

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

        {/* IZ KNJIGE — porijeklo koje se ne pamti nego izvodi.
            Popis ispod su `BlendIzvor` retci: pokazivaci na POSUDE (tank ili
            arhiva), upisani u trenutku pretoka i od tada nepromijenjeni. Knjiga
            na isto pitanje odgovara BERBAMA — sto je ubrano, kad i gdje — i
            racuna se pri svakom prikazu. Dva razlicita rjecnika za isto vino,
            pa stoje jedan uz drugi, a ne umjesto. */}
        <div style={izKnjigeOkvirStyle}>
          <div style={izKnjigeNaslovStyle}>
            Iz knjige kretanja — po berbama (izvedeno)
          </div>

          {podrijetloKnjige.stavke.length === 0 ? (
            <div style={mutedTextStyle}>
              Knjiga za ovaj tank ne zna nijednu berbu.
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 4 }}>
                {podrijetloKnjige.stavke.map((s) => (
                  <div key={s.berbaId} style={{ display: "grid", gap: 2 }}>
                    {/* Postotak uz naziv, litre u drugom redu. */}
                    <div style={izKnjigeRedStyle}>
                      <span>
                        {s.nazivSorte}
                        {s.oznakaBerbe ? ` · ${s.oznakaBerbe}` : ""}
                        {s.vrstaUnosa === "ZATECENO" ? " · zatečeno" : ""}
                      </span>
                      <strong style={brojUzNazivStyle}>
                        {formatBroj(s.postotak)}%
                      </strong>
                    </div>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>
                      {formatBroj(s.uTankuL, 0)} L
                    </span>
                  </div>
                ))}
              </div>

              <div style={mutedTextStyle}>
                Knjiga objašnjava{" "}
                <strong>{formatBroj(podrijetloKnjige.ukupnoL, 0)} L</strong>
                {Math.abs(podrijetloKnjige.razlikaOdTankaL) > 0.5 ? (
                  <>
                    {" "}
                    od {formatBroj(tank.kolicinaVinaUTanku, 0)} L u tanku —
                    razlika {formatBroj(podrijetloKnjige.razlikaOdTankaL, 0)} L.
                  </>
                ) : (
                  <>, točno koliko tank i ima.</>
                )}
              </div>
            </>
          )}
        </div>

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



      {/* KARTICA "ARHIVE" JE MAKNUTA (vlasnik, 09.10.2026.): tank je posuda,
          a arhiva pripada vinu. Vino kojeg vise nema u podrumu nalazi se samo
          u arhivi (/arhiva), ne u zadnjem tanku u kojem je bilo. */}

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
        <OdPocetkaVina granica={granicaVinaAt} lanac={lanacZaNatpis} />
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
                      {/* Mjerenje iz posude lanca: isto vino, druga posuda.
                          Bez oznake bi se citalo kao mjerenje ovog tanka. */}
                      {m.posudaId !== id ? (
                        <span style={{ fontWeight: 400, color: "#6b7280" }}>
                          {" "}
                          · u tanku {brojeviTankova.get(m.posudaId) ?? "?"}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {formatDatum(m.izmjerenoAt)}
                    </div>
                  </div>

                  {/* CIJE JE VINO OVO MJERENO — izvedeno iz knjige za trenutak
                      mjerenja. Mjerenje ostaje na svojoj adresi (ovaj tank,
                      ovo vrijeme); knjiga samo kaze sto je tada bilo unutra.
                      Tank je posuda, pa mjerenje od prije mjesec dana ne mora
                      govoriti o vinu koje je danas u njemu. */}
                  <VinoUTrenutkuRedak vino={vinoPoMjerenju.get(m.id)} />

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
      </PovijestPrekidac>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const pageStyle: React.CSSProperties = {
  background: "#f4f4f5",
  // Razmak raste sa sirinom ekrana: 24 px na stolu, 12 px na mobitelu — bez
  // media upita, koji se inline ne da napisati.
  padding: "clamp(12px, 3vw, 24px)",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  fontSize: 13,
  color: "#2f2f2f",
  minHeight: "100vh",
};

// BROJKA UZ NAZIV, ne na suprotnom kraju retka. Podebljana i odmah iza
// naziva; detalj ide u drugi red ispod.
const nazivBrojRedStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  flexWrap: "wrap",
};

const brojUzNazivStyle: React.CSSProperties = {
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
};

// OGRANICENJE SIRINE — isti obrazac kao /statistika (containerStyle). Bez
// njega se na 1920 px redak "naziv lijevo, brojka desno" razvuce preko 1888 px.
const omotacStyle: React.CSSProperties = {
  maxWidth: 1240,
  margin: "0 auto",
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
  marginBottom: 2,
  textAlign: "center",
  fontSize: 34,
  fontWeight: 800,
  color: "#7f1d1d",
  lineHeight: 1.15,
  letterSpacing: 0.2,
  // 34 px i dugacko ime („Bijeli pinot, sivi pinot, zeleni silvanac") na uskom
  // prozoru ili uz zum od 150 % lako premase sirinu — neka se prelomi.
  overflowWrap: "anywhere",
};

/**
 * Bezimeno vino — isto mjesto i ista velicina kao ime, ali sivo i u kurzivu.
 *
 * NAMJERNO ZAUZIMA MJESTO IMENA. Prazan prostor bi izgledao kao da se podatak
 * nije ucitao; ovako se vidi da vino postoji i da mu ime tek treba dati.
 */
const nazivVinaBezimenoStyle: React.CSSProperties = {
  ...nazivVinaStyle,
  fontWeight: 500,
  fontStyle: "italic",
  color: "#9ca3af",
};

/** „Ono sto bi pisalo na etiketi" — stoji pod imenom, ne umjesto sastava. */
const deklariranaSortaStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 2,
};

const bezSifreStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontStyle: "italic",
};

/**
 * Nesklad deklarirane sorte i knjige, i biljeska o bezimenom vinu.
 *
 * Nije greska nego dvije tvrdnje koje se ne poklapaju — boja je zato jantarna
 * (paznja), a ne crvena (kvar). Odluku donosi covjek.
 */
const sortaNeskladStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: "#92400e",
  marginBottom: 10,
  lineHeight: 1.3,
  // Ovo je RECENICA, ne naziv — smije se prelomiti u dva retka, ali ne smije
  // gurati sirinu. Nazivi sorti znaju biti dugacki i bez razmaka za prijelom.
  overflowWrap: "anywhere",
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

const paramValueVelikaStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  lineHeight: 1.1,
  fontVariantNumeric: "tabular-nums",
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

/* Redak "Vino tada" uz mjerenje: tise od samog mjerenja, jer je izvedeno, a
   ne izmjereno. */
const vinoTadaStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "#2f2f2f",
  background: "#fafafa",
  borderLeft: "2px solid #e5e7eb",
  padding: "4px 8px",
};

/* IZVEDENO IZ KNJIGE — vizualno odvojeno od spremljenog stanja iznad, da se
   dva odgovora na isto pitanje ne citaju kao jedan popis. */
const izKnjigeOkvirStyle: React.CSSProperties = {
  borderTop: "1px solid #ececec",
  paddingTop: 10,
  display: "grid",
  gap: 6,
};

const izKnjigeNaslovStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "#6b7280",
};

const izKnjigeRedStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 13,
  color: "#2f2f2f",
};

/* Zateceno vino — jedan redak umjesto praznih kartica berbe. Sivo, jer je to
   ono sto se NE zna. */
const zatecenoRedakStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  borderLeft: "3px solid #9ca3af",
  background: "#fafafa",
  padding: "8px 10px",
  fontSize: 13,
  color: "#2f2f2f",
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

// Postotak uz naziv sorte, litre u drugom redu — ne na suprotnom kraju retka.
const compositionHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
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

/** Imena odljeva na ekranu. "neobjasnjeno" je jedino koje je kvar. */
const IME_ODLJEVA: Record<string, string> = {
  izdano: "izdano",
  odliveno: "odliveno dalje",
  kalo: "kalo",
  ispravak: "ispravak stanja",
  neobjasnjeno: "neobjašnjeno",
};

/**
 * Naziv cvora kad ga sastav ne zna: sorta za berbu, za posudu bez
 * razmotavanja `nazivVinaBezSastava`. Broj posude NIJE naziv (vlasnik,
 * 09.10.2026.) — stoji sitno u sivom retku.
 */
function nazivCvoraVina(v: VinoCvor): string {
  if (v.vrsta === "partija") return v.nazivSorte;
  if (v.vrsta === "posuda") return nazivVinaBezSastava(v.razlog);
  return "Vino";
}

/**
 * Jedna STAVKA SASTAVA, s razinama ispod sebe — vino, ne posuda.
 *
 * Od 09.10.2026. (vlasnik): sastav pokazuje vina. Prijenos istog vina u praznu
 * posudu ne stoji ovdje kao kucica; sazet je u stavku vina koje kroz njega
 * prolazi (lib/sastav-vina.ts). Put kroz posude se NE ispisuje — posuda nije
 * podatak o vinu, a kretanje stoji u kronologiji.
 *
 * KOMPONENTA DOBIVA SAMO PRIPREMLJEN PRIKAZ (`PrikazStavke`), ne stavku.
 * Stavka nosi cijelu sastavnicu s punim podstablom (do 13 razina na T42), a
 * dosad su uz svaku isle i sve radnje i mjerenja stabla. React u razvojnom
 * nacinu svojstva svake serverske komponente serijalizira za alate; na T42
 * (~200 stavki) to je 09.10.2026. srusilo dev server na 16 GB. Prikaz se zato
 * slaze unaprijed, u `slozPrikazSastava`, a ovdje stoje samo brojevi, tekst i
 * poveznice.
 *
 * BEZ JS-a: ugnijezdjeni `<details>`, isti uzorak kao sastavnice blenda nize.
 * Posluzitelj iscrta cijelo stablo, preglednik otvara razinu po razinu.
 *
 * NASLOV JE VINO, NE POSUDA (vlasnik, 09.10.2026.). Prva razina nosi ime
 * vina iz trenutka ulaska i sifru (lib/ime-kucice.ts); bezimeno pada na sortu
 * i partiju iz sastava. Dublje razine samo naziv iz sastava. Broj tanka stoji
 * sitno u sivom retku uz litre ("iz tanka 7"), bez poveznice: kad nesto ne
 * stima treba znati gdje je fizicki, ali to nije ono sto se prati. Poveznica
 * "otvori posudu" je maknuta — vodila je na posudu KAKVA JE DANAS, cesto s
 * tudjim vinom; ostaje "prošlost vina".
 *
 * TRI KRAJA LANCA se MORAJU razlikovati (vlasnik, 14.09.2026):
 *   "neotvoreno" — ima jos, dalje vodi "prošlost vina";
 *   "bez_knjige" — zateceno vino, uredan kraj;
 *   "prekinuto"  — lanac bi trebao ici dalje a ne moze. To je KVAR i tako
 *                  izgleda, jer bi uredan redak zamaskirao rupu u knjizi.
 *
 * Progutano dolijevanje (prag ga nije priznao kao novo vino) prigusuje se i NE
 * razmotava — pravilo 3. Poveznicu na proslost vina ipak ima: i dolijevanje
 * od 1 % je vino s poviscu (vlasnik, 28.09.2026).
 *
 * KALO: na sazetoj stavci zbroj svega izgubljenog na putu, "kalo ukupno",
 * jer put kroz posude nije prikazan; na obicnoj, kao do sada, otpusteno i kalo.
 */
type PrikazStavke = {
  naziv: string;
  /** Sifra vina, samo prva razina i samo kad je upisana. */
  sifra: string | null;
  /** Posuda iz koje je vino stiglo, za sivi redak; `null` za berbu i prethodno vino. */
  izTanka: number | null;
  progutano: boolean;
  /** Kraj lanca za stavku-posudu bez razmotavanja; `null` za vino i berbu. */
  krajLanca: "neotvoreno" | "bez_knjige" | "prekinuto" | null;
  /** Berba: poveznica na njezinu stranicu. */
  berbaId: string | null;
  litre: number;
  udio: number;
  otpusteno: number;
  kalo: number;
  sazeta: boolean;
  odrezano: boolean;
  hrefProslosti: string | null;
  /** Povijest po svim posudama u kojima je vino stavke stajalo prije ulaska. */
  povijest: PovijestVina[];
  djeca: PrikazStavke[];
};

/** Priprema prikaza stavki — vidi `StavkaSastavaVina`. Cisti racun, bez upita. */
function slozPrikazSastava(
  stavke: StavkaVina[],
  u: {
    brojevi: Map<string, number>;
    oznakaPartije: Map<string, string | null>;
    /** Tank ove stranice — /prosli-tank u njegovom stablu trazi kucicu i kvasce. */
    korijenId: string;
    /** `VinoRadnja` DANASNJEG tanka, sve; izbor po posudi radi `povijestVina`. */
    radnje: RedakRadnje[];
    mjerenja: RedakMjerenjaPosude[];
    /** Arhivski redci — bez njih je povijest arhivirane posude lazno prazna. */
    arhivskeRadnje: RedakArhivskeRadnje[];
    arhivskaMjerenja: RedakMjerenjaPosude[];
    /** Ime i sifra kucica PRVE razine (lib/ime-kucice.ts); dublje ih nemaju. */
    imena?: Map<StavkaVina["sastavnica"], ImeKucice | null>;
  }
): PrikazStavke[] {
  return stavke.map((stavka) => {
    const s = stavka.sastavnica;
    const v = s.vino;
    const roditeljTankId = stavka.roditeljTankId;
    const prethodno = v.vrsta !== "partija" && v.tankId === roditeljTankId;
    const ime = u.imena?.get(s) ?? null;
    // Ime vina kad je poznato; bezimeno pada na sortu i partiju iz sastava.
    const nazivVina = ime?.naziv ?? nazivStavke(s, u.oznakaPartije);
    const razmotava = stavka.djeca.length > 0 && !s.progutano;

    return {
      naziv: prethodno
        ? `prethodno vino${nazivVina ? ` — ${nazivVina}` : ""}`
        : nazivVina ?? nazivCvoraVina(v),
      sifra: ime?.sifra ?? null,
      izTanka:
        v.vrsta !== "partija" && !prethodno ? u.brojevi.get(v.tankId) ?? null : null,
      progutano: s.progutano,
      krajLanca: v.vrsta === "posuda" ? v.razlog : null,
      berbaId: v.vrsta === "partija" ? v.berbaId : null,
      litre: stavka.litre,
      udio: stavka.udio,
      otpusteno: stavka.otpusteno,
      kalo: stavka.kalo,
      sazeta: stavka.sazeta,
      odrezano: stavka.odrezano,
      // POVEZNICA NA PROSLOST VINA — na SVAKU stavku koja je vino iz posude, po
      // adresi PRAVE sastavnice u punom stablu: ista adresa kao do sada, pa
      // /prosli-tank kucicu nalazi u stablu ovog tanka. Praga nema (vlasnik,
      // 28.09.2026). Vodi na vino kakvo je bilo u trenutku ulaska ovamo.
      hrefProslosti:
        v.vrsta !== "partija"
          ? `/prosli-tank?korijen=${encodeURIComponent(u.korijenId)}` +
            `&iz=${encodeURIComponent(v.tankId)}` +
            `&cin=${encodeURIComponent(s.kljucCina)}`
          : null,
      // Po SVIM posudama u kojima je vino stavke stajalo prije ulaska ovamo —
      // i onima kroz koje je samo prolazilo, jer prijenos vise nije zasebna
      // stavka sa svojom povijescu. Prozor posude je [rodjenje vina u njoj,
      // cas odlaska dalje].
      povijest: razmotava
        ? stavka.prozori.map((p) =>
            povijestVina({
              tankId: p.tankId,
              od: p.od,
              do: p.do,
              radnje: u.radnje,
              mjerenja: u.mjerenja,
              arhivskeRadnje: u.arhivskeRadnje,
              arhivskaMjerenja: u.arhivskaMjerenja,
            })
          )
        : [],
      // Imena se trazila samo za prvu razinu; djeci se ne predaju.
      djeca: slozPrikazSastava(stavka.djeca, { ...u, imena: undefined }),
    };
  });
}

function StavkaSastavaVina({ p }: { p: PrikazStavke }) {
  const prekinuto = p.krajLanca === "prekinuto";

  const poveznicaProslosti = p.hrefProslosti ? (
    <Link href={p.hrefProslosti} style={{ color: "#1f6f8b" }}>
      prošlost vina
    </Link>
  ) : null;

  const zaglavlje = (
    <div style={{ display: "grid", gap: 2 }}>
      <div
        style={{
          ...summaryMainTextStyle,
          ...(p.progutano ? { color: "#6b7280", fontWeight: 400 } : null),
          ...(prekinuto ? { color: "#7f1d1d", fontWeight: 700 } : null),
        }}
      >
        {prekinuto ? "⚠ " : ""}
        {p.naziv}
        {/* SIFRA UZ IME: sest kucica "Cuvee 2026" bez nje izgleda kao sest
            puta isto vino (vlasnik, 09.10.2026.). */}
        {p.sifra ? <span style={sifraKuciceStyle}> · {p.sifra}</span> : null}
      </div>
      <div style={summarySubTextStyle}>
        {formatBroj(p.litre, 0)} L · {formatBroj(p.udio * 100, 0)} %
        {p.izTanka != null ? ` · iz tanka ${p.izTanka}` : ""}
        {p.progutano ? " · dolijevanje, nije novo vino" : ""}
      </div>
      {/* OTPUSTENO NIJE RAVNOPRAVNO S ULAZOM — sitno, i samo kad kala ima. */}
      {p.kalo > 0.5 && (
        <div style={kaloTekstStyle}>
          {p.sazeta ? (
            <>
              kalo ukupno {formatBroj(p.kalo, 0)} L (
              {formatBroj((p.kalo / p.otpusteno) * 100, 1)} %)
            </>
          ) : (
            <>
              otpušteno {formatBroj(p.otpusteno, 0)} L · kalo{" "}
              {formatBroj(p.kalo, 0)} L (
              {formatBroj((p.kalo / p.otpusteno) * 100, 1)} %)
            </>
          )}
        </div>
      )}
    </div>
  );

  // Kraj lanca. Dalje od "još razina" vodi "prošlost vina", ne posuda.
  const krajLanca =
    p.krajLanca === "prekinuto" ? (
      <div style={{ ...summaryRightStyle, fontWeight: 700 }}>lanac prekinut</div>
    ) : p.krajLanca === "bez_knjige" ? (
      <div style={summarySubTextStyle}>knjiga dalje ne zna</div>
    ) : p.krajLanca === "neotvoreno" || p.odrezano ? (
      // ODREZANA GRANA NIJE KRAJ LANCA. Rez na `DUBINA_KLIKA` ostavlja stavku
      // bez djece; bez ove oznake izgledala bi kao uredan zavrsetak, a ispod
      // nje ima jos razina.
      <div style={summarySubTextStyle}>još razina</div>
    ) : null;

  const desno = p.berbaId ? (
    <div style={summaryRightStyle}>
      <Link href={`/berba/${p.berbaId}`} style={{ color: "#1f6f8b" }}>
        berba
      </Link>
    </div>
  ) : (
    <div style={{ display: "grid", gap: 2, justifyItems: "end", textAlign: "right" }}>
      {krajLanca}
      {poveznicaProslosti}
    </div>
  );

  // Razmotano dalje: otvorivi `<details>`. Progutano se ne otvara.
  if (p.djeca.length > 0 && !p.progutano) {
    return (
      <details style={detailsStyle}>
        <summary style={summaryStyle}>
          {zaglavlje}
          <div style={summaryRightStyle}>
            {p.djeca.length} {p.djeca.length === 1 ? "stavka" : "stavki"}
            {/* Poveznica stoji i na razmotanoj stavci: klik na redak otvara
                razinu ispod, a ovo vodi na proslost vina. Dvije razlicite
                radnje pa moraju biti dvije razlicite mete. */}
            {poveznicaProslosti ? (
              <>
                {" · "}
                {poveznicaProslosti}
              </>
            ) : null}
          </div>
        </summary>
        <div style={detailsContentStyle}>
          {/* POVIJEST PRVA, PORIJEKLO ISPOD — vlasnikov redoslijed (14.09.2026). */}
          <PovijestStavke dijelovi={p.povijest} />

          <div style={{ ...izKnjigeNaslovStyle, marginTop: 12 }}>
            Odakle je to vino
          </div>
          {p.djeca.map((d, i) => (
            <StavkaSastavaVina key={i} p={d} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <div style={prekinuto ? kucicaPrekinutaStyle : kucicaRedakStyle}>
      {zaglavlje}
      {desno}
    </div>
  );
}

/**
 * Povijest stavke kroz vise posuda. Zapisi iz svih posuda idu u jedan popis
 * po datumu; rupa u evidenciji ostaje vidljiva i kad druge posude zapise
 * imaju — rupa je kvar i ne smije se utopiti u tudim retcima.
 */
function PovijestStavke({ dijelovi }: { dijelovi: PovijestVina[] }) {
  if (dijelovi.length === 0) return null;
  const poDatumu = (x: StavkaPovijesti[]) =>
    [...x].sort((a, b) => a.datum.getTime() - b.datum.getTime());

  const sZapisima = dijelovi.filter((p) => p.stanje === "ima");
  const rupe = dijelovi.filter((p) => p.stanje === "rupa");

  if (sZapisima.length === 0 && rupe.length === 0) {
    // Sve prolazno — "nista radeno" je istina; inace se ne tvrdi nista.
    const sve = dijelovi.every((p) => p.stanje === "prolazna");
    return <PovijestKucice povijest={{ ...dijelovi[0], stanje: sve ? "prolazna" : "nema_zapisa" }} />;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {sZapisima.length > 0 ? (
        <PovijestKucice
          povijest={{
            ...sZapisima[0],
            kvasci: poDatumu(sZapisima.flatMap((p) => p.kvasci)),
            dodaci: poDatumu(sZapisima.flatMap((p) => p.dodaci)),
            mjerenja: poDatumu(sZapisima.flatMap((p) => p.mjerenja)),
            radnje: poDatumu(sZapisima.flatMap((p) => p.radnje)),
            stanje: "ima",
          }}
        />
      ) : null}
      {rupe.map((p, i) => (
        <PovijestKucice key={i} povijest={p} />
      ))}
    </div>
  );
}

/** Datum bez sata — povijest kucice ide u retke, ne u tablicu. */
function datumKratko(d: Date): string {
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function SkupinaPovijesti({
  naslov,
  stavke,
}: {
  naslov: string;
  stavke: StavkaPovijesti[];
}) {
  if (stavke.length === 0) return null;

  return (
    <div>
      <div style={izKnjigeNaslovStyle}>{naslov}</div>
      {stavke.map((x, i) => (
        <div key={i} style={povijestRedakStyle}>
          <span style={povijestDatumStyle}>{datumKratko(x.datum)}</span>
          <span>{x.naslov}</span>
          {x.detalj ? <span style={povijestDetaljStyle}>{x.detalj}</span> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * STO JE S TIM VINOM RADENO dok je bilo u toj posudi.
 *
 * Prazan popis ima TRI razlicita znacenja i sva tri se moraju razlikovati
 * (vlasnik, 14.09.2026):
 *   prolazna     — vino je uslo i odmah otislo; "nista radeno" je ISTINA;
 *   nema_zapisa  — prozor je prekratak da bi se tvrdilo ijedno od toga;
 *   rupa         — vino je dugo stajalo a nista nije zapisano. To je KVAR i
 *                  ne smije izgledati kao uredan kraj.
 * Granice su izmjerene, ne odabrane od oka — vidi lib/povijest-vina.ts.
 */
function PovijestKucice({ povijest }: { povijest: PovijestVina }) {
  if (povijest.stanje === "prolazna") {
    return (
      <div style={summarySubTextStyle}>
        Vino je ušlo i odmah otišlo — ništa nije rađeno.
      </div>
    );
  }

  if (povijest.stanje === "rupa") {
    const dana = Math.round(
      (povijest.do.getTime() - povijest.od.getTime()) / 86_400_000
    );
    return (
      <div style={rupaEvidencijeStyle}>
        ⚠ Nema nijednog zapisa, a vino je u toj posudi stajalo {dana} dana —
        rupa u evidenciji, ne uredan kraj.
      </div>
    );
  }

  if (povijest.stanje === "nema_zapisa") {
    return <div style={summarySubTextStyle}>Nema zapisa.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SkupinaPovijesti naslov="Kvasci" stavke={povijest.kvasci} />
      <SkupinaPovijesti naslov="Dodaci i preparati" stavke={povijest.dodaci} />
      <SkupinaPovijesti naslov="Mjerenja" stavke={povijest.mjerenja} />
      <SkupinaPovijesti naslov="Pretoci i radnje" stavke={povijest.radnje} />
    </div>
  );
}

const povijestRedakStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  fontSize: 12,
  lineHeight: 1.5,
  flexWrap: "wrap",
};

const povijestDatumStyle: React.CSSProperties = {
  color: "#6b7280",
  fontVariantNumeric: "tabular-nums",
  minWidth: 74,
};

const povijestDetaljStyle: React.CSSProperties = {
  color: "#52514e",
  fontVariantNumeric: "tabular-nums",
};

/* Rupa u evidenciji je kvar i tako izgleda — ista crvena kao prekinut lanac. */
const rupaEvidencijeStyle: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#7f1d1d",
  padding: "8px 10px",
  fontSize: 12,
  lineHeight: 1.5,
};

const kucicaRedakStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderBottom: "1px solid #ececec",
};

/* Prekinut lanac nije uredan kraj i ne smije tako izgledati. */
const kucicaPrekinutaStyle: React.CSSProperties = {
  ...kucicaRedakStyle,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#7f1d1d",
};

const kaloTekstStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#8a8a85",
};

/** Sifra uz ime kucice — dio naslova, ali tise od imena. */
const sifraKuciceStyle: React.CSSProperties = {
  fontWeight: 400,
  color: "#4b5563",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const josRazinaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  fontStyle: "italic",
  padding: "0 10px",
};

const odljevTrakaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  padding: "8px 10px",
  border: "1px solid #ececec",
  background: "#fcfcfc",
};

const odljevStavkaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#52514e",
};

/* "Neobjašnjeno" je rupa u knjizi, ne stavka — i tako mora izgledati. */
const odljevKvarStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#7f1d1d",
  fontWeight: 700,
  border: "1px solid #7f1d1d",
  padding: "1px 5px",
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

