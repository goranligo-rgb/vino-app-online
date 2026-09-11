"use client";

import { useState } from "react";

/**
 * Parametri vina — svaki sa SVOJOM najnovijom vrijednosti i datumom.
 *
 * JEDNA MREZA ZA SVIH OSAM POLJA. Po svakom polju zasebno:
 *   1. vlastito mjerenje tanka (lib/mjerenja.ts -> sloziPoPolju)
 *   2. ako ga nema -> ponderirani prosjek blenda (parametriBlenda)
 *   3. ako ni to -> crtica
 * Zato tank moze imati SO2 izmjeren, a alkohol iz blenda — to su dvije
 * razlicite tvrdnje i NE SMIJU izgledati isto.
 *
 * RAZLIKOVANJE (tri znaka odjednom, pa radi i crno-bijelo i za daltoniste):
 *   izmjereno   — crn broj, BEZ prefiksa, pun okvir, podnozje "izmjereno 21.05."
 *   izracunato  — broj u boji procjene s prefiksom "≈", ISCRTKAN okvir i blaga
 *                 podloga, podnozje kaze IZ CEGA je racunato + pokrivenost
 *
 * Klik na parametar otvara, ISPOD, ono sto tom broju daje smisao: za izmjereno
 * graf kroz vrijeme, za izracunato SAM RACUN (koja sastavnica, koliko litara,
 * koja vrijednost).
 */

export type TockaGrafa = {
  t: string; // ISO
  v: number;
  rucno: boolean;
  /**
   * Posuda u kojoj je tocka izmjerena — "tank 8". `null` za ovaj tank.
   *
   * Graf crta povijest VINA, ne posude: vino koje je pola zivota provelo
   * drugdje ondje je i mjereno. Oznaka kaze gdje, da se krivulja ne cita kao
   * da je sve mjereno ovdje.
   */
  posuda?: string | null;
};

/**
 * Odakle broj na plocici dolazi.
 *
 * `knjiga` je dodan 11.09.2026: vrijednost izmjerena na VINU koje je danas u
 * ovom tanku, ali u nekoj ranijoj posudi — nadjena kroz knjigu kretanja. Nije
 * mjerenje ovog tanka i ne predstavlja se kao takvo: podnozje kaze datum i
 * broj posude.
 */
export type Podrijetlo =
  | "mjereno"
  | "preneseno"
  | "blend"
  | "knjiga"
  | "nema";

/** Jedna sastavnica koja je za OVO polje usla u prosjek. */
export type DoprinosPrikaz = {
  naziv: string;
  kolicina: number;
  vrijednost: number;
  /** ISO datum kad je BAS TA vrijednost izmjerena na toj sastavnici. */
  izmjerenoAt: string | null;
};

export type ParametarPrikaz = {
  kljuc: string;
  naziv: string;
  jedinica: string;
  /** Vec razrijesena vrijednost — vlastita ili iz blenda. */
  vrijednost: number | null;
  podrijetlo: Podrijetlo;
  /** ISO datum vlastitog mjerenja tog polja; kod blenda null. */
  datum: string | null;
  niz: TockaGrafa[];
  /**
   * Zasto se vrijednost NE prikazuje iako postoji.
   *
   * Danas samo jedan razlog: vino fermentira, pa naslijedjena vrijednost
   * starija od dokaza o fermentaciji vise ne opisuje ovo vino. Prazno polje
   * bez objasnjenja citalo bi se kao "nema podatka", a podatak postoji —
   * samo je zastario za ovo stanje.
   */
  neprikazano?: string | null;

  /**
   * Vrijednost nadjena kroz KNJIGU — izmjerena na ovom vinu, u ranijoj posudi.
   * Postoji samo kad tank nema ni vlastito mjerenje ni procjenu iz blenda.
   */
  izKnjige?: {
    mjerenoAt: string | null;
    /** "T8" — gdje je mjereno. Vise posuda kad partije nisu iz istog mjesta. */
    posude: string[];
    /** Koliko je litara vina u tanku time pokriveno. */
    postotak: number;
  } | null;

  /** Sto blend kaze za ovo polje — i kad se prikazuje vlastito mjerenje. */
  blend: {
    vrijednost: number | null;
    /** Udio BLENDA koji je dao podatak. */
    postotak: number;
    /** Udio VINA U TANKU. Razlikuje se cim je blend manji od tanka. */
    postotakOdTanka: number | null;
    pokrivenoL: number;
    ukupnoL: number;
    /** Litre u tanku; `null` kad se ne zna. */
    kolicinaUTankuL: number | null;
    /** ISO datum najnovijeg mjerenja medju sastavnicama koje su dale ovu
     *  vrijednost. Prikaz po njemu istice staru procjenu. */
    mjerenoAt: string | null;
    /** Koliko dana stara smije biti prije nego se istakne. */
    pragDana: number;
    doprinosi: DoprinosPrikaz[];
  } | null;
};

/** Koliko je dana stara procjena, ili `null` kad se datum ne zna. */
function danaStaro(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function fDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const BOJA_RACUN = "#9a3412"; // izracunato — odvojeno od vinske crvene naslova
const BOJA_MJERENO = "#2f2f2f";

function fBroj(v: number | null | undefined, dec = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dec,
  });
}

function fDan(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fDanKratko(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit" });
}

function fDanVrijeme(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// `knjiga` je MJERENA vrijednost, samo u drugoj posudi — nije racun, pa ne ide
// u isti vizualni razred kao procjena iz blenda.
const jeIzracunato = (p: Podrijetlo) => p === "blend" || p === "preneseno";

/** Inline SVG, bez vanjske biblioteke — isti pristup kao hladjenje-graf.tsx. */
function Graf({ niz, jedinica }: { niz: TockaGrafa[]; jedinica: string }) {
  if (niz.length === 0) {
    return <div style={tihoStil}>Nema vrijednosti za graf.</div>;
  }

  if (niz.length === 1) {
    return (
      <div style={tihoStil}>
        Samo jedno mjerenje ({fBroj(niz[0].v)} {jedinica} ·{" "}
        {fDan(niz[0].t)}) — graf treba barem dva.
      </div>
    );
  }

  const S = 1000;
  const V = 220;
  const M = { gore: 16, dolje: 34, lijevo: 46, desno: 12 };

  const vrijednosti = niz.map((t) => t.v);
  let min = Math.min(...vrijednosti);
  let max = Math.max(...vrijednosti);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raspon = max - min;
  min -= raspon * 0.08;
  max += raspon * 0.08;

  const vremena = niz.map((t) => new Date(t.t).getTime());
  const tMin = Math.min(...vremena);
  const tMax = Math.max(...vremena);
  const tRaspon = tMax - tMin || 1;

  const x = (t: string) =>
    M.lijevo +
    ((new Date(t).getTime() - tMin) / tRaspon) * (S - M.lijevo - M.desno);
  const y = (v: number) =>
    M.gore + (1 - (v - min) / (max - min)) * (V - M.gore - M.dolje);

  const linija = niz.map((t) => x(t.t) + "," + y(t.v)).join(" ");

  // Tri vodoravne crte: min, sredina, max.
  const oznake = [max, (max + min) / 2, min];

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={"0 0 " + S + " " + V}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 200, display: "block" }}
        role="img"
      >
        {oznake.map((v, i) => (
          <g key={i}>
            <line
              x1={M.lijevo}
              x2={S - M.desno}
              y1={y(v)}
              y2={y(v)}
              stroke="#ececec"
              strokeWidth={1}
            />
            <text x={4} y={y(v) + 4} fontSize={11} fill="#6b7280">
              {fBroj(v, 1)}
            </text>
          </g>
        ))}

        <polyline
          points={linija}
          fill="none"
          stroke="#7f1d1d"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />

        {/* Bez kruzica na tockama — samo linija (vlasnikova odluka, 11.09.2026).
            Izmjereno i izracunato razlikuje popis mjerenja ispod grafa. */}

        <text x={M.lijevo} y={V - 10} fontSize={11} fill="#6b7280">
          {fDan(niz[0].t)}
        </text>
        <text
          x={S - M.desno}
          y={V - 10}
          fontSize={11}
          fill="#6b7280"
          textAnchor="end"
        >
          {fDan(niz[niz.length - 1].t)}
        </text>
      </svg>
    </div>
  );
}

/**
 * Racun iza izracunate vrijednosti — bez ovoga "11,63" i "34" izgledaju
 * jednako pouzdano, a nisu.
 */
function RacunBlenda({ p }: { p: ParametarPrikaz }) {
  const b = p.blend;

  if (!b || b.doprinosi.length === 0) {
    return (
      <div style={tihoStil}>
        Nijedna sastavnica nema izmjeren ovaj parametar, pa se prosjek ne može
        izračunati.
      </div>
    );
  }

  const dana = danaStaro(b.mjerenoAt);
  const staro = dana != null && dana > b.pragDana;

  return (
    <div>
      <div style={racunNaslov}>
        Ponderirani prosjek po količini — {b.doprinosi.length} od{" "}
        {fBroj(b.ukupnoL, 0)} L ukupno. Nijedno mjerenje ovog polja ne postoji
        na samom tanku.
      </div>

      {/* STAROST PROCJENE. Procjena je stara koliko i njezin NAJSVJEZIJI
          sastojak. Ne odbacuje se ni kad je stara: podatak star 84 dana nosi
          vise informacije nego prazno polje, a enolog sam prosudi vrijedi li
          jos. Ali ne smije stajati gol uz svjeza vlastita mjerenja. */}
      {b.mjerenoAt ? (
        <div style={staro ? racunUpozorenje : tihoStil}>
          {staro ? "⚠ " : ""}Iz sastavnice, mjereno {fDatum(b.mjerenoAt)}
          {dana != null ? ` — prije ${dana} ${dana === 1 ? "dan" : "dana"}` : ""}
          {staro ? `, starije od ${b.pragDana} dana` : ""}.
        </div>
      ) : null}

      <div style={racunTablica}>
        {b.doprinosi.map((d, i) => (
          <div key={i} style={racunRed}>
            <span>
              {d.naziv}
              {d.izmjerenoAt ? (
                <span style={racunSivo}> · {fDatum(d.izmjerenoAt)}</span>
              ) : null}
            </span>
            <span style={racunSivo}>{fBroj(d.kolicina, 0)} L</span>
            <span style={racunBrojStil}>
              {fBroj(d.vrijednost)}
              {p.jedinica ? " " + p.jedinica : ""}
            </span>
            <span style={racunSivo}>
              {fBroj((d.kolicina / b.pokrivenoL) * 100, 0)}% težine
            </span>
          </div>
        ))}

        <div style={{ ...racunRed, ...racunRedZbroj }}>
          <span style={{ fontWeight: 800 }}>≈ prosjek</span>
          <span style={racunSivo}>{fBroj(b.pokrivenoL, 0)} L</span>
          <span
            style={{ ...racunBrojStil, color: BOJA_RACUN, fontWeight: 800 }}
          >
            ≈{fBroj(b.vrijednost)}
            {p.jedinica ? " " + p.jedinica : ""}
          </span>
          <span style={racunSivo}>
            {b.postotak >= 99.5
              ? "cijeli blend"
              : "iz " + fBroj(b.postotak, 0) + "% blenda"}
          </span>
        </div>
      </div>

      {b.postotak < 99.5 ? (
        <div style={racunUpozorenje}>
          {fBroj(100 - b.postotak, 0)}% blenda ({fBroj(b.ukupnoL - b.pokrivenoL, 0)}{" "}
          L) nema izmjeren ovaj parametar i nije ušlo u prosjek.
        </div>
      ) : null}

      {/* DVA POSTOTKA, jer odgovaraju na dva pitanja. `postotak` je udio
          BLENDA, `postotakOdTanka` udio VINA U TANKU. Dok su isti, dovoljan je
          jedan. Cim se razidju — a razidju se kad je blend manji od tanka, jer
          punjenje grozdjem dodaje vino bez izvornog tanka — "100 %" tvrdi da
          je pokriveno cijelo vino, a pokriven je cijeli blend. T28: blend
          800 L na 3.650 L u tanku, dakle 100 % blenda je 22 % vina. */}
      {b.postotakOdTanka != null &&
      b.kolicinaUTankuL != null &&
      Math.abs(b.postotakOdTanka - b.postotak) > 0.5 ? (
        <div style={racunUpozorenje}>
          Prosjek pokriva {fBroj(b.pokrivenoL, 0)} L od{" "}
          {fBroj(b.kolicinaUTankuL, 0)} L u tanku —{" "}
          <strong>{fBroj(b.postotakOdTanka, 0)}% vina</strong>, iako{" "}
          {fBroj(b.postotak, 0)}% blenda. Ostatak je ušao punjenjem i nema
          izvorni tank, pa mu se parametri nemaju odakle pročitati.
        </div>
      ) : null}
    </div>
  );
}

export default function ParametriPoPolju({
  parametri,
}: {
  parametri: ParametarPrikaz[];
}) {
  const [otvoren, setOtvoren] = useState<string | null>(null);

  const aktivni = parametri.find((p) => p.kljuc === otvoren) ?? null;
  const imaIzracunatih = parametri.some((p) => jeIzracunato(p.podrijetlo));

  return (
    <div>
      <div style={mrezaStil}>
        {parametri.map((p) => {
          const prazan = p.vrijednost == null;
          const racunato = jeIzracunato(p.podrijetlo);
          const izBlenda = p.podrijetlo === "blend";
          const jeOtvoren = p.kljuc === otvoren;
          const moze = !prazan || p.niz.length > 0;

          return (
            <button
              key={p.kljuc}
              type="button"
              onClick={() => setOtvoren(jeOtvoren ? null : p.kljuc)}
              disabled={!moze}
              style={{
                ...plocicaStil,
                ...(racunato ? plocicaRacunataStil : {}),
                ...(jeOtvoren ? plocicaOtvorenaStil : {}),
                opacity: prazan ? 0.5 : 1,
                cursor: moze ? "pointer" : "default",
              }}
            >
              <div style={plocicaLabel}>{p.naziv}</div>

              {/* "≈" je nositelj poruke: broj nije izmjeren nego procijenjen.
                  Boja i iscrtkan okvir su pojacanje, ne jedini znak. */}
              <div
                style={{
                  ...plocicaVrijednost,
                  color: racunato ? BOJA_RACUN : BOJA_MJERENO,
                }}
              >
                {racunato && !prazan ? <span style={plocicaTilda}>≈</span> : null}
                {prazan ? "—" : fBroj(p.vrijednost)}
                {!prazan && p.jedinica ? (
                  <span style={plocicaJedinica}> {p.jedinica}</span>
                ) : null}
              </div>

              {/* Podnozje uvijek kaze STO je broj: izmjereno i kad, ili iz cega
                  je izracunat i koliko blenda pokriva. */}
              <div
                style={{
                  ...plocicaPodnozje,
                  color: racunato ? BOJA_RACUN : "#6b7280",
                  fontWeight: racunato ? 700 : 400,
                }}
              >
                {prazan
                  ? p.neprikazano
                    ? "ne prikazuje se — " + p.neprikazano
                    : "nije mjereno"
                  : p.podrijetlo === "mjereno"
                    ? "izmjereno " + fDanKratko(p.datum)
                    : p.podrijetlo === "knjiga"
                      ? "izmjereno " +
                        fDanKratko(p.izKnjige?.mjerenoAt ?? null) +
                        (p.izKnjige?.posude.length
                          ? " u " + p.izKnjige.posude.join(", ")
                          : "")
                    : p.podrijetlo === "preneseno"
                      ? "procjena · pretok " + fDanKratko(p.datum)
                      : p.blend && p.blend.postotak >= 99.5
                        ? "procjena · cijeli blend"
                        : "procjena · iz " +
                          fBroj(p.blend ? p.blend.postotak : 0, 0) +
                          "% blenda"}
              </div>

              {/* Traka pokrivenosti samo kod blenda — na uskom ekranu brza od
                  citanja postotka. */}
              {izBlenda && !prazan ? (
                <div style={trakaVani}>
                  <div
                    style={{
                      ...trakaUnutra,
                      width:
                        Math.min(p.blend ? p.blend.postotak : 0, 100) + "%",
                    }}
                  />
                </div>
              ) : null}

              {p.niz.length > 1 ? (
                <div style={plocicaBroj}>{p.niz.length} mjerenja ›</div>
              ) : izBlenda && !prazan ? (
                <div style={{ ...plocicaBroj, color: BOJA_RACUN }}>račun ›</div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Legenda stoji ODMAH ispod mreze, ne na dnu stranice — inace nitko ne
          spoji stil s njegovim znacenjem. Uzorak je ZNAK, nikad broj: izmisljen
          broj se cita kao stvarna vrijednost ovog tanka, a pravi broj bi samo
          ponovio mrezu. Sto je koja plocica pise u njezinom podnozju. */}
      {imaIzracunatih ? (
        <div style={legendaMreze}>
          <span style={legendaStavka}>
            <span
              style={{
                ...legendaUzorak,
                ...legendaUzorakRacun,
                color: BOJA_RACUN,
              }}
            >
              ≈
            </span>
            <span>
              znači procjenu — polje nije mjereno u ovom tanku, nego izračunato
              iz sastavnica blenda. Broj bez oznake je izmjeren.
            </span>
          </span>
        </div>
      ) : null}

      {aktivni ? (
        <div style={panelStil}>
          <div style={panelZaglavlje}>
            <span>
              {aktivni.podrijetlo === "blend"
                ? aktivni.naziv + " — odakle broj dolazi"
                : aktivni.naziv + " kroz vrijeme"}
              {aktivni.jedinica ? " (" + aktivni.jedinica + ")" : ""}
            </span>
            <button
              type="button"
              onClick={() => setOtvoren(null)}
              style={zatvoriStil}
            >
              Zatvori
            </button>
          </div>

          {aktivni.podrijetlo === "blend" ? (
            <RacunBlenda p={aktivni} />
          ) : (
            <>
              <Graf niz={aktivni.niz} jedinica={aktivni.jedinica} />

              {aktivni.niz.length > 0 ? (
                <div style={popisStil}>
                  {[...aktivni.niz]
                    .sort(
                      (a, b) => new Date(b.t).getTime() - new Date(a.t).getTime()
                    )
                    .map((t, i) => (
                      <div key={i} style={popisRed}>
                        <span style={popisDatum}>{fDanVrijeme(t.t)}</span>
                        <span style={popisVrijednost}>
                          {fBroj(t.v)}
                          {aktivni.jedinica ? " " + aktivni.jedinica : ""}
                        </span>
                        {/* Tocka iz ranije posude kaze GDJE je mjerena.
                            Vino je ondje stvarno bilo — graf crta njegovu
                            povijest, ne povijest ove posude. */}
                        <span
                          style={{
                            ...popisOznaka,
                            color: t.posuda
                              ? "#6b7280"
                              : t.rucno
                                ? "#6b7280"
                                : BOJA_RACUN,
                          }}
                        >
                          {t.posuda
                            ? "izmjereno u " + t.posuda
                            : t.rucno
                              ? "izmjereno"
                              : "≈ pretok"}
                        </span>
                      </div>
                    ))}
                </div>
              ) : null}

              {/* Kad tank IMA vlastito mjerenje, blend se gore ne prikazuje —
                  ali je posteno reci sto bi rekao, jer se brojke razilaze. */}
              {aktivni.blend && aktivni.blend.vrijednost != null ? (
                <div style={usporedbaStil}>
                  Blend bi za ovo polje dao{" "}
                  <strong>≈{fBroj(aktivni.blend.vrijednost)}</strong>
                  {aktivni.jedinica ? " " + aktivni.jedinica : ""} (iz{" "}
                  {fBroj(aktivni.blend.postotak, 0)}% količine). Prikazuje se
                  vlastito mjerenje tanka jer ono postoji.
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- STILOVI ---------------- */
/* Paleta aplikacije: vinska crvena #7f1d1d za naglasak, siva #6b7280 za
   neutralno, zelena #166534 za izvrseno. Bez plave. RAVNI KUTOVI — nigdje
   borderRadius. Izracunato nosi #9a3412, da se ne brka s naslovima. */

const mrezaStil: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
  gap: 8,
};

const plocicaStil: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#ffffff",
  padding: "9px 11px",
  textAlign: "left",
  font: "inherit",
  color: "#2f2f2f",
  minWidth: 0,
  minHeight: 62,
};

/** Iscrtkan okvir + topla podloga = "ovo nitko nije izmjerio". */
const plocicaRacunataStil: React.CSSProperties = {
  border: "1px dashed #d8a48f",
  background: "#fdf6f2",
};

const plocicaOtvorenaStil: React.CSSProperties = {
  borderColor: "#7f1d1d",
  boxShadow: "inset 0 -3px 0 #7f1d1d",
  background: "#fffafa",
};

const plocicaLabel: React.CSSProperties = {
  fontSize: 10,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 700,
};

const plocicaVrijednost: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 800,
  marginTop: 2,
  fontVariantNumeric: "tabular-nums",
  overflowWrap: "anywhere",
};

const plocicaTilda: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginRight: 1,
};

const plocicaJedinica: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
};

const plocicaPodnozje: React.CSSProperties = {
  fontSize: 10,
  marginTop: 3,
  lineHeight: 1.25,
};

const plocicaBroj: React.CSSProperties = {
  fontSize: 10,
  color: "#7f1d1d",
  fontWeight: 700,
  marginTop: 3,
};

const trakaVani: React.CSSProperties = {
  height: 3,
  background: "#f0e0d8",
  marginTop: 5,
};

const trakaUnutra: React.CSSProperties = {
  height: 3,
  background: BOJA_RACUN,
};

const legendaMreze: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 16px",
  marginTop: 8,
  fontSize: 11,
  color: "#6b7280",
};

const legendaStavka: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "flex-start",
  gap: 6,
  minWidth: 0,
};

const legendaUzorak: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
  border: "1px solid transparent",
  padding: "1px 5px",
};

const legendaUzorakRacun: React.CSSProperties = {
  border: "1px dashed #d8a48f",
  background: "#fdf6f2",
};

const panelStil: React.CSSProperties = {
  border: "1px solid #ececec",
  borderTop: "3px solid #7f1d1d",
  background: "#fffafa",
  padding: 12,
  marginTop: 10,
};

const panelZaglavlje: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#5b1e28",
  marginBottom: 10,
};

const zatvoriStil: React.CSSProperties = {
  border: "1px solid #ebd3d8",
  background: "#ffffff",
  color: "#7f1d1d",
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  textTransform: "none",
  letterSpacing: 0,
};

const racunNaslov: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  marginBottom: 8,
  lineHeight: 1.4,
};

const racunTablica: React.CSSProperties = {
  display: "grid",
  gap: 3,
};

const racunRed: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto auto auto",
  gap: 10,
  fontSize: 12,
  padding: "4px 0",
  alignItems: "baseline",
};

const racunRedZbroj: React.CSSProperties = {
  borderTop: "1px solid #ebd3d8",
  marginTop: 3,
  paddingTop: 7,
};

const racunSivo: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 11,
  whiteSpace: "nowrap",
};

const racunBrojStil: React.CSSProperties = {
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const racunUpozorenje: React.CSSProperties = {
  marginTop: 10,
  padding: "7px 9px",
  background: "#fdf6f2",
  border: "1px dashed #d8a48f",
  fontSize: 11,
  color: "#7c2d12",
  lineHeight: 1.4,
};

const usporedbaStil: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #ebd3d8",
  fontSize: 11,
  color: "#6b7280",
  lineHeight: 1.4,
};

const popisStil: React.CSSProperties = {
  display: "grid",
  gap: 3,
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #ebd3d8",
};

const popisRed: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
  gap: 8,
  fontSize: 12,
  padding: "3px 0",
  alignItems: "baseline",
};

const popisDatum: React.CSSProperties = { color: "#6b7280" };

const popisVrijednost: React.CSSProperties = {
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: "#2f2f2f",
};

const popisOznaka: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tihoStil: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  padding: "12px 0",
};
