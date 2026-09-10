/**
 * Grafovi kartice — inline SVG, renderiran na POSLUZITELJU.
 *
 * ZASTO NE BIBLIOTEKA I NE KLIJENT: ovo se tiska. Ispis mora biti gotov u
 * trenutku kad se stranica pojavi; graf koji se docrta nakon `useEffect`-a na
 * papiru zna izaci prazan. Zato nema ni "use client", ni `fetch`, ni <canvas>.
 *
 * ZASTO DVA PANELA, A NE DVIJE OSI: secer (g/L) i temperatura (°C) su razlicite
 * mjere razlicitog raspona. Graf s dvije y-osi cini njihov odnos stvari koju
 * crta razmjer osi, a ne podaci — dvije krivulje se "sijeku" ondje gdje autor
 * postavi nulu. Umjesto toga dva panela dijele istu x-os: usporedba kroz
 * vrijeme ostaje, lazni sjecista nema.
 */

import type { TjedanSO2, TockaSecera, TockaTemp } from "./model";
import { CILJ_SLOBODNI_SO2, TJEDANA_SO2 } from "./podaci";

// Paleta: prva tri slota referentne kategorijske palete + ljubicasta.
// Provjereno validatorom (light, all-pairs): najgori CVD ΔE 9.2, normalni 16.3.
const BOJA = {
  secer: "#2a78d6", // plava
  temp: "#eb6834", // narancasta
  so2Slobodni: "#1baf7a", // tirkizna — ispod 3:1 na bijeloj, pa nosi izravnu oznaku
  so2Ukupni: "#4a3aa7", // ljubicasta
  cilj: "#8a8a85", // ciljna crta i zadana temperatura — nikad boja serije
  os: "#c9c9c4",
  mreza: "#e8e8e4",
  tekst: "#52514e",
} as const;

const W = 300;
const H = 120;
const L = 26; // lijeva margina za oznake osi
const R = 6;
const T = 10;

function putanja(tocke: Array<{ x: number; y: number }>): string {
  return tocke.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/** Ljestvica s malim rubom, da krajnje tocke ne sjednu na os. */
function ljestvica(vrijednosti: number[], pod: number, visina: number) {
  const min = Math.min(...vrijednosti);
  const max = Math.max(...vrijednosti);
  const raspon = max - min;
  const rub = raspon === 0 ? Math.max(1, Math.abs(max) * 0.1) : raspon * 0.15;
  const lo = min - rub;
  const hi = max + rub;
  return {
    lo,
    hi,
    y: (v: number) => pod - ((v - lo) / (hi - lo)) * visina,
  };
}

/**
 * RASPORED PANELA. Panel koji nema podataka se NE CRTA, a SVG se skupi.
 *
 * Prije je prazan panel crtao os i recenicu "nema ocitanja temperature" —
 * trecina visine grafa potrosena na obavijest da podatka nema. Sada:
 *
 *   dva panela  -> H 120, osi na 54 i 112   (nepromijenjeno, znak za znak)
 *   jedan panel -> H  62, os na 54          (upola nizi graf)
 *   nijedan     -> komponenta vraca null
 *
 * Kad je panel jedini, dobiva mjesto PRVOGA, pa je puni raspored ostao
 * netaknut i kartice s oba podatka izgledaju tocno kao prije.
 */
const POD_PRVI = 54; // y osi prvog panela
const POD_DRUGI = 112; // y osi drugog panela
const VIS_PANELA = 36; // visina crtaceg podrucja
const DNO = 8; // prostor ispod zadnje osi, za natpise x-osi

/**
 * Graf 1: zaostali secer (g/L) i temperatura (°C) kroz 10 dana.
 * Dva panela, jedna zajednicka x-os.
 */
export function GrafSecerITemperature({
  secer,
  temp,
  zadana,
  odMs,
  doMs,
}: {
  secer: TockaSecera[];
  temp: TockaTemp[];
  zadana: number | null;
  odMs: number;
  doMs: number;
}) {
  const x = (t: number) => L + ((t - odMs) / (doMs - odMs)) * (W - L - R);

  const imaSecer = secer.length > 0;
  const imaTemp = temp.length > 0;

  // Nema se sto nacrtati — kartica ostaje bez ovog grafa i skupi se za
  // njegovu visinu. Pozivatelj zbog toga ne mora nista provjeravati.
  if (!imaSecer && !imaTemp) return null;

  // Panel gore: secer. Panel dolje: temperatura. Kad je samo jedan, on uzima
  // mjesto gornjega i graf je upola nizi — vidi RASPORED PANELA gore.
  const visS = VIS_PANELA;
  const visT = VIS_PANELA;
  const podS = POD_PRVI;
  const podT = imaSecer ? POD_DRUGI : POD_PRVI;

  // Zadnja os na kartici: do nje idu okomite crte mreze, ispod nje natpisi.
  const podZadnji = imaTemp ? podT : podS;
  // Ime NIJE H: modul vec ima H = 120 za puni graf, a ovaj se mijenja s brojem
  // panela. Sjena nad modulskom konstantom bila bi zamka pri sljedecoj izmjeni.
  const visinaSvg = podZadnji + DNO;

  const sS = imaSecer ? ljestvica(secer.map((p) => p.secerGL), podS, visS) : null;

  const tempVrijednosti = temp.flatMap((p) => [p.min, p.max]);
  if (zadana != null && imaTemp) tempVrijednosti.push(zadana);
  const sT = imaTemp ? ljestvica(tempVrijednosti, podT, visT) : null;

  // Dnevne crte mreze — po jedna na svaka dva dana, da se ne zamrsi.
  const dana = Math.round((doMs - odMs) / 86400000);
  const crte = Array.from({ length: dana + 1 }, (_, i) => odMs + i * 86400000).filter(
    (_, i) => i % 2 === 0
  );

  return (
    <svg viewBox={`0 0 ${W} ${visinaSvg}`} className="graf" role="img"
      aria-label="Zaostali šećer u gramima po litri i temperatura u Celzijevim stupnjevima kroz deset dana">
      {crte.map((t) => (
        <line key={t} x1={x(t)} y1={T} x2={x(t)} y2={podZadnji} stroke={BOJA.mreza} strokeWidth={1}
          vectorEffect="non-scaling-stroke" />
      ))}

      {/* --- Panel: secer g/L. Crta se samo kad ima mjerenja; inace panela
              nema, a graf je za njegovu visinu nizi. --- */}
      {sS ? (
        <>
          <text x={0} y={T - 3} fontSize={10} fill={BOJA.secer} fontWeight={700}>
            Šećer g/L
          </text>
          <line x1={L} y1={podS} x2={W - R} y2={podS} stroke={BOJA.os} strokeWidth={1}
            vectorEffect="non-scaling-stroke" />
          <text x={L - 3} y={sS.y(sS.hi) + 6} textAnchor="end" fontSize={9} fill={BOJA.tekst}>
            {Math.round(sS.hi)}
          </text>
          <text x={L - 3} y={podS} textAnchor="end" fontSize={9} fill={BOJA.tekst}>
            {Math.round(sS.lo)}
          </text>
          <path d={putanja(secer.map((p) => ({ x: x(p.t), y: sS.y(p.secerGL) })))}
            fill="none" stroke={BOJA.secer} strokeWidth={2} strokeLinejoin="round"
            strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {secer.map((p) => (
            <circle key={p.t} cx={x(p.t)} cy={sS.y(p.secerGL)} r={2.2} fill={BOJA.secer}
              stroke="#ffffff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {/* Izravna oznaka zadnje vrijednosti — brojka bez trazenja po osi. */}
          <text x={x(secer[secer.length - 1].t) - 3}
            y={sS.y(secer[secer.length - 1].secerGL) - 5}
            textAnchor="end" fontSize={10} fontWeight={700} fill={BOJA.secer}>
            {secer[secer.length - 1].secerGL.toLocaleString("hr-HR", { maximumFractionDigits: 1 })} g/L
          </text>
        </>
      ) : null}

      {/* --- Panel: temperatura °C. Crta se samo kad ima ocitanja. --- */}
      {/* "prosj." NIJE ukras: traka kartice pokazuje ZADNJE ocitanje, a ova
          krivulja DNEVNI PROSJEK, pa se brojevi zakonito razlikuju (T7: traka
          18,6 °C, graf 18,1 °C). Bez oznake to izgleda kao proturjecje. */}
      {sT ? (
        <>
          {/* Natpis se vezuje uz VLASTITU os (6 iznad vrha crtaceg podrucja),
              ne uz `podS`. U punom rasporedu daje 112-36-6 = 70, tocno gdje je
              i bio; u kompaktnom prati panel umjesto da visi nad tudjim
              mjestom. */}
          <text x={0} y={podT - visT - 6} fontSize={10} fill={BOJA.temp} fontWeight={700}>
            Temp. °C prosj.
          </text>
          <line x1={L} y1={podT} x2={W - R} y2={podT} stroke={BOJA.os} strokeWidth={1}
            vectorEffect="non-scaling-stroke" />
          <text x={L - 3} y={sT.y(sT.hi) + 6} textAnchor="end" fontSize={9} fill={BOJA.tekst}>
            {sT.hi.toFixed(0)}
          </text>
          <text x={L - 3} y={podT} textAnchor="end" fontSize={9} fill={BOJA.tekst}>
            {sT.lo.toFixed(0)}
          </text>

          {/* Raspon dana (min-max) kao blijedi pojas ispod prosjeka. */}
          <path
            d={`${putanja(temp.map((p) => ({ x: x(p.t), y: sT.y(p.max) })))} ${temp
              .slice()
              .reverse()
              .map((p) => `L${x(p.t)} ${sT.y(p.min)}`)
              .join(" ")} Z`}
            fill={BOJA.temp} fillOpacity={0.16} stroke="none" />

          {zadana != null ? (
            <>
              <line x1={L} y1={sT.y(zadana)} x2={W - R} y2={sT.y(zadana)} stroke={BOJA.cilj}
                strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              {/* Natpis referentne crte ide na LIJEVI rub, a vrijednost serije
                  ostaje na desnom. Oba su prije bila desno pa su se preklapala
                  cim je zadnji prosjek blizu zadane (T33: "14,3 °C" preko
                  "zadana 15 °C"). Razdvajanje po strani rjesava cijeli razred
                  sudara, ne samo taj jedan slucaj. */}
              <text x={L + 3} y={sT.y(zadana) - 3} fontSize={9} fill={BOJA.cilj}>
                zadana {zadana.toLocaleString("hr-HR", { maximumFractionDigits: 1 })} °C
              </text>
            </>
          ) : null}

          <path d={putanja(temp.map((p) => ({ x: x(p.t), y: sT.y(p.avg) })))}
            fill="none" stroke={BOJA.temp} strokeWidth={2} strokeLinejoin="round"
            strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <text x={x(temp[temp.length - 1].t) - 3} y={sT.y(temp[temp.length - 1].avg) - 5}
            textAnchor="end" fontSize={10} fontWeight={700} fill={BOJA.temp}>
            {temp[temp.length - 1].avg.toLocaleString("hr-HR", { maximumFractionDigits: 1 })} °C
          </text>
        </>
      ) : null}

      <text x={L} y={visinaSvg - 1} fontSize={9} fill={BOJA.tekst}>
        {new Date(odMs).toLocaleDateString("hr-HR", { day: "numeric", month: "numeric" })}
      </text>
      <text x={W - R} y={visinaSvg - 1} textAnchor="end" fontSize={9} fill={BOJA.tekst}>
        danas
      </text>
    </svg>
  );
}

/**
 * Graf 2: slobodni i ukupni SO2 po tjednu, s ciljnom crtom na 30 mg/L.
 *
 * BEZ MJERENJA SE NE CRTA. Prije su se crtale prazne osi, ciljna crta i
 * recenica "nema mjerenja" — obrazlozenje je bilo da kartica zadrzi raspored.
 * Raspored se u tiskanom izvjestaju ne cuva besplatno: taj prazan graf je
 * ~36 mm visine kartice potroseno na obavijest da podatka nema. Kartica se
 * sada skupi.
 *
 * Ciljna crta od 30 mg/L time nestaje s tankova bez mjerenja. To je u redu —
 * ona je pravilo, a pravilo bez ijedne izmjerene vrijednosti nema sto reci.
 */
export function GrafSO2({ tjedni, ima }: { tjedni: TjedanSO2[]; ima: boolean }) {
  if (!ima) return null;

  const pod = 98;
  const vis = 76;
  const x = (i: number) => L + (i / (TJEDANA_SO2 - 1)) * (W - L - R);

  const vrijednosti = tjedni.flatMap((t) =>
    [t.slobodni, t.ukupni].filter((v): v is number => v != null)
  );
  vrijednosti.push(CILJ_SLOBODNI_SO2, 0);
  const s = ljestvica(vrijednosti, pod, vis);

  const serija = (kljuc: "slobodni" | "ukupni") =>
    tjedni
      .map((t, i) => ({ i, v: t[kljuc] }))
      .filter((p): p is { i: number; v: number } => p.v != null);

  const slobodni = serija("slobodni");
  const ukupni = serija("ukupni");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="graf" role="img"
      aria-label="Slobodni i ukupni sumporni dioksid u miligramima po litri, po tjednu">
      <text x={0} y={T - 3} fontSize={10} fill={BOJA.tekst} fontWeight={700}>
        SO₂ mg/L
      </text>

      {/* Legenda: dvije serije, pa je legenda uvijek prisutna. */}
      <g>
        <line x1={W - 120} y1={T - 6} x2={W - 110} y2={T - 6} stroke={BOJA.so2Slobodni}
          strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <text x={W - 107} y={T - 3.5} fontSize={9} fill={BOJA.tekst}>slobodni</text>
        <line x1={W - 62} y1={T - 6} x2={W - 52} y2={T - 6} stroke={BOJA.so2Ukupni}
          strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <text x={W - 49} y={T - 3.5} fontSize={9} fill={BOJA.tekst}>ukupni</text>
      </g>

      <line x1={L} y1={pod} x2={W - R} y2={pod} stroke={BOJA.os} strokeWidth={1}
        vectorEffect="non-scaling-stroke" />
      <line x1={L} y1={T} x2={L} y2={pod} stroke={BOJA.os} strokeWidth={1}
        vectorEffect="non-scaling-stroke" />

      {/* Ciljna crta stoji i kad mjerenja nema — ona je pravilo, ne podatak. */}
      <line x1={L} y1={s.y(CILJ_SLOBODNI_SO2)} x2={W - R} y2={s.y(CILJ_SLOBODNI_SO2)}
        stroke={BOJA.cilj} strokeWidth={1} strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke" />
      {/* Isti razlog kao kod zadane temperature: natpis crte lijevo, izravne
          oznake serija desno, da se ne sudare kad je zadnja vrijednost blizu
          cilja od 30 mg/L. */}
      <text x={L + 3} y={s.y(CILJ_SLOBODNI_SO2) - 3} fontSize={9} fill={BOJA.cilj}>
        cilj {CILJ_SLOBODNI_SO2} mg/L slobodnog
      </text>

      {([
        ["slobodni", slobodni, BOJA.so2Slobodni],
        ["ukupni", ukupni, BOJA.so2Ukupni],
      ] as const).map(([ime, tocke, boja]) =>
        tocke.length === 0 ? null : (
          <g key={ime}>
            {tocke.length > 1 ? (
              <path d={putanja(tocke.map((p) => ({ x: x(p.i), y: s.y(p.v) })))}
                fill="none" stroke={boja} strokeWidth={2} strokeLinejoin="round"
                strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ) : null}
            {tocke.map((p) => (
              <circle key={p.i} cx={x(p.i)} cy={s.y(p.v)} r={2.6} fill={boja}
                stroke="#ffffff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {/* Izravna oznaka je OBAVEZNA: tirkizna je ispod 3:1 kontrasta
                na bijeloj podlozi, pa identitet ne smije ovisiti o boji. */}
            <text x={x(tocke[tocke.length - 1].i) - 4}
              y={s.y(tocke[tocke.length - 1].v) - 5} textAnchor="end" fontSize={10}
              fontWeight={700} fill={boja}>
              {tocke[tocke.length - 1].v.toLocaleString("hr-HR", { maximumFractionDigits: 0 })}
            </text>
          </g>
        )
      )}

      <text x={L} y={H - 1} fontSize={9} fill={BOJA.tekst}>
        prije {TJEDANA_SO2} tj.
      </text>
      <text x={W - R} y={H - 1} textAnchor="end" fontSize={9} fill={BOJA.tekst}>
        ovaj tjedan
      </text>
    </svg>
  );
}
