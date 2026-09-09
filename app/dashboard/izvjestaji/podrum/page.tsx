/**
 * Tiskani izvjestaj podruma — jedna kartica po punom tanku, dvije po stranici A4.
 *
 * CITA, NE PISE. Nijedna ruta odavde ne mijenja bazu.
 *
 * NE UVOZI nista iz `app/tankovi/[id]/page.tsx` ni iz `app/monitor`. Dohvat je
 * vlastit i drukcije oblikovan — vidi biljesku u `podaci.ts`.
 */

import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { citajSesiju } from "@/lib/auth-sesija";
import { smijeUPodrumu } from "@/lib/auth-role";
import { dohvatiPodrum, DANA_GRAF } from "./podaci";
import { sloziKartice, formatBrojKratko, type Kartica, type Stavka } from "./model";
import { GrafSO2, GrafSecerITemperature } from "./grafovi";

export const dynamic = "force-dynamic";

function datum(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function broj(x: number | null | undefined, dec = 1): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toLocaleString("hr-HR", { maximumFractionDigits: dec });
}

/** Vrijednost s jedinicom, ili sama crtica kad podatka nema. */
function Param({ oznaka, vrijednost, jedinica }: {
  oznaka: string;
  vrijednost: number | null;
  jedinica: string;
}) {
  return (
    <div className="param">
      <span className="param-oznaka">{oznaka}</span>
      <span className="param-vrijednost">
        {vrijednost == null ? (
          "—"
        ) : jedinica ? (
          <>
            {broj(vrijednost, 2)} <span className="jedinica">{jedinica}</span>
          </>
        ) : (
          // pH je bezdimenzionalan — prazna oznaka jedinice ostavlja visecu
          // prazninu iza broja, pa se span uopce ne ispisuje.
          broj(vrijednost, 2)
        )}
      </span>
    </div>
  );
}

function PopisStavki({ naslov, stavke }: { naslov: string; stavke: Stavka[] }) {
  return (
    <div className="stupac">
      <div className="stupac-naslov">{naslov}</div>
      {stavke.length === 0 ? (
        <div className="prazno">—</div>
      ) : (
        stavke.map((s, i) => (
          <div key={i} className="stavka">
            <span className="stavka-datum">{datum(s.datum)}</span>
            <span className="stavka-naslov">{s.naslov}</span>
            {s.detalj ? <span className="stavka-detalj">{s.detalj}</span> : null}
          </div>
        ))
      )}
    </div>
  );
}

function KarticaTanka({ k, odMs, doMs }: { k: Kartica; odMs: number; doMs: number }) {
  const popunjenost =
    k.kapacitet > 0 ? Math.round((k.kolicina / k.kapacitet) * 100) : 0;

  const stanjeHladjenja = k.hladjenjeIskljuceno
    ? "isključeno"
    : k.hladjenjeAktivno
      ? "hladi"
      : "miruje";

  return (
    <article className="kartica">
      <header className="zaglavlje">
        <div className="tank-broj">T{k.broj}</div>
        <div className="zaglavlje-tekst">
          <div className="naziv-vina">{k.nazivVina || "—"}</div>
          <div className="podnaslov">
            {k.sorta || "—"}
            {k.grana ? <span className="grana">grana {k.grana}</span> : null}
          </div>
        </div>
        <div className="kolicina">
          <strong>{broj(k.kolicina, 0)}</strong> / {broj(k.kapacitet, 0)} L
          <span className="popunjenost">{popunjenost} %</span>
        </div>
      </header>

      <div className="traka">
        <div className="traka-polje">
          <span className="traka-oznaka">T trenutna</span>
          <span className="traka-vrijednost">
            {k.tempTrenutna == null ? "—" : `${broj(k.tempTrenutna, 1)} °C`}
          </span>
        </div>
        <div className="traka-polje">
          <span className="traka-oznaka">T zadana</span>
          {/* Broj se pokazuje UVIJEK kad postoji, i kod soft-OFF-a (zadana
              20,0 °C). Prije je tu stajala crtica, pa je kartica tvrdila da
              zadane nema iako je kontroler ima — a to je stanje govori polje
              "Hlađenje: isključeno" pokraj, ne prazno polje ovdje. */}
          <span className="traka-vrijednost">
            {k.tempZadana == null ? "—" : `${broj(k.tempZadana, 1)} °C`}
          </span>
        </div>
        <div className={`traka-polje stanje-${stanjeHladjenja.replace("č", "c")}`}>
          <span className="traka-oznaka">Hlađenje</span>
          <span className="traka-vrijednost">{stanjeHladjenja}</span>
        </div>
        <div className="traka-polje">
          <span className="traka-oznaka">Fermentacija</span>
          <span className="traka-vrijednost">
            {k.danFermentacije != null ? (
              `${k.danFermentacije}. dan`
            ) : k.dolazakDatum ? (
              <span className="zamjena">
                {k.dolazakVrsta === "PRETOK" ? "pretok" : "punjenje"}{" "}
                {datum(k.dolazakDatum)}
              </span>
            ) : (
              "—"
            )}
          </span>
        </div>
      </div>

      <div className="sredina">
        <section className="blok">
          <h3>Trenutni parametri</h3>
          <div className="parametri">
            {/* Zaostali secer u g/L. NIKAD u istom stupcu sa °Oe iz berbe. */}
            <Param oznaka="Zaostali šećer" vrijednost={k.secerGL} jedinica="g/L" />
            <Param oznaka="Uk. kiselina" vrijednost={k.ukupneKiseline} jedinica="g/L" />
            <Param oznaka="pH" vrijednost={k.ph} jedinica="" />
            <Param oznaka="SO₂ slobodni" vrijednost={k.slobodniSO2} jedinica="mg/L" />
            <Param oznaka="SO₂ ukupni" vrijednost={k.ukupniSO2} jedinica="mg/L" />
          </div>
          <div className="meta">Mjereno {datum(k.mjerenoU)}</div>
        </section>

        {k.berba ? (
          <section className="blok">
            {/* Blok pokazuje NAJVECU partiju po litrama. Kad ih tank drzi vise,
                zaglavlje to kaze — inace ispis tvrdi da je tank jedna berba. */}
            <h3>
              Berba
              {k.berba.ukupnoPartija > 1 ? (
                <span className="podnaslov-bloka">
                  {" · 1 od "}
                  {k.berba.ukupnoPartija} partija
                </span>
              ) : null}
            </h3>
            <div className="parametri">
              <div className="param">
                <span className="param-oznaka">Sorta</span>
                <span className="param-vrijednost">{k.berba.nazivSorte}</span>
              </div>
              <div className="param">
                <span className="param-oznaka">Datum berbe</span>
                <span className="param-vrijednost">{datum(k.berba.datumBerbe)}</span>
              </div>
              <Param oznaka="Grožđe" vrijednost={k.berba.kolicinaKgGrozdja} jedinica="kg" />
              {/* Stupnjevi Oechsle. Dolaze IZ BERBE i stoje samo ovdje. */}
              <Param oznaka="Šećer" vrijednost={k.berba.secerOe} jedinica="°Oe" />
              <Param oznaka="Kiseline" vrijednost={k.berba.kiseline} jedinica="g/L" />
              <Param oznaka="pH" vrijednost={k.berba.ph} jedinica="" />
            </div>
            {k.berba.manjinski.length > 0 ? (
              <div className="manjinski">
                {k.berba.manjinski
                  .map((m) => `+ ${broj(m.postotak, 1)} % ${m.naziv}`)
                  .join(" · ")}
              </div>
            ) : null}
            {k.berba.vinograd || k.berba.oznakaBerbe ? (
              <div className="meta">
                {[k.berba.vinograd, k.berba.oznakaBerbe].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </section>
        ) : (
          <section className="blok">
            <h3>Sastav mješavine</h3>
            <div className="sastav">
              {(k.sastav ?? []).slice(0, 6).map((s, i) => (
                <div key={i} className="sastav-red">
                  <span className="sastav-naziv">
                    {s.naziv}
                    {s.izvor ? <span className="sastav-izvor">{s.izvor}</span> : null}
                  </span>
                  <span className="sastav-litre">{broj(s.litre, 0)} L</span>
                  <span className="sastav-postotak">{broj(s.postotak, 1)} %</span>
                </div>
              ))}
              {(k.sastav?.length ?? 0) > 6 ? (
                <div className="meta">
                  + još {(k.sastav?.length ?? 0) - 6} sastavnica
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>

      {/* Kartica bez ijednog podatka za grafove ne crta prazne osi — to je
          trecina visine potrosena na recenicu "nema mjerenja". Mjesto ide
          biljesci, koja tada dobiva cetiri linije umjesto dvije. */}
      {k.bezGrafova ? null : (
        <div className="grafovi">
          <GrafSecerITemperature
            secer={k.grafSecer}
            temp={k.grafTemp}
            zadana={k.hladjenjeIskljuceno ? null : k.tempZadana}
            odMs={odMs}
            doMs={doMs}
          />
          <GrafSO2 tjedni={k.grafSO2} ima={k.imaSO2} />
        </div>
      )}

      <div className="stupci">
        <div className="stupac">
          <div className="stupac-naslov">Kvasac</div>
          {k.kvasacNaziv ? (
            <div className="stavka">
              <span className="stavka-datum">{datum(k.kvasacDatum)}</span>
              <span className="stavka-naslov">{k.kvasacNaziv}</span>
            </div>
          ) : (
            <div className="prazno">nije zapisan</div>
          )}
        </div>
        <PopisStavki naslov="Zadnji dodaci" stavke={k.zadnjiDodaci} />
        <PopisStavki naslov="Zadnje radnje" stavke={k.zadnjeRadnje} />
      </div>

      <div className="biljeska">
        <div className="biljeska-oznaka">Bilješka enologa</div>
        {Array.from({ length: k.bezGrafova ? 4 : 2 }, (_, i) => (
          <div key={i} className="crta" />
        ))}
      </div>
    </article>
  );
}

export default async function IzvjestajPodrumaPage() {
  noStore();

  // Vlastita provjera na ruti. Allow-lista u `proxy.ts` je prva brana, ali se
  // na nju ne oslanjamo — sto nije provjereno ovdje, nije provjereno.
  const prijavljeni = await citajSesiju();
  if (!prijavljeni) redirect("/login");
  if (!smijeUPodrumu(prijavljeni.role)) redirect("/dashboard");

  const podaci = await dohvatiPodrum();
  const sada = new Date();
  const kartice = sloziKartice(podaci, sada);

  const doMs = sada.getTime();
  const odMs = doMs - DANA_GRAF * 24 * 3600 * 1000;

  return (
    <div className="izvjestaj">
      <style>{CSS}</style>

      <div className="alatna-traka">
        <Link href="/dashboard" className="natrag">
          ← Natrag
        </Link>
        <span className="alatna-info">
          {kartice.length} punih tankova · {podaci.prazni.length} praznih ·{" "}
          {podaci.brojUpita} upita · {podaci.trajanjeMs} ms
        </span>
      </div>

      <h1 className="naslov-ispisa">
        Izvještaj podruma — {datum(sada)}
      </h1>

      {kartice.map((k) => (
        <KarticaTanka key={k.id} k={k} odMs={odMs} doMs={doMs} />
      ))}

      {podaci.prazni.length > 0 ? (
        <section className="prazni">
          <h2>Prazni tankovi</h2>
          <div className="prazni-mreza">
            {podaci.prazni.map((t) => (
              <div key={t.id} className="prazni-polje">
                <strong>T{t.broj}</strong>
                <span>prazan</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

const CSS = `
@page { size: A4 portrait; margin: 10mm; }

.izvjestaj {
  font-family: Calibri, "Segoe UI", sans-serif;
  color: #1a1a18;
  background: #ffffff;
  max-width: 190mm;
  margin: 0 auto;
  padding: 4mm 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.alatna-traka {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; margin-bottom: 6mm; font-size: 11px;
}
.natrag {
  border: 1px solid #cfcfcf; background: #f8f9fa; padding: 6px 10px;
  color: #222; text-decoration: none; font-weight: 700;
}
.alatna-info { color: #6b7280; }

.naslov-ispisa {
  font-size: 15px; font-weight: 700; margin: 0 0 4mm; letter-spacing: .3px;
}

/* --- Kartica: pola A4. Dvije stanu na stranicu, i nijedna se ne lomi. --- */
.kartica {
  height: 136mm;
  box-sizing: border-box;
  border: 1px solid #b9b4a8;
  padding: 3mm 3.5mm;
  margin-bottom: 3mm;
  display: flex;
  flex-direction: column;
  gap: 1.6mm;
  page-break-inside: avoid;
  break-inside: avoid;
  background: #ffffff;
}

.zaglavlje {
  display: flex; align-items: center; gap: 3mm;
  border-bottom: 1.5px solid #7f1d1d; padding-bottom: 1.4mm;
}
.tank-broj {
  font-size: 20px; font-weight: 800; letter-spacing: .5px;
  background: #7f1d1d; color: #ffffff; padding: 1mm 2.4mm; line-height: 1.1;
}
.zaglavlje-tekst { flex: 1; min-width: 0; }
.naziv-vina {
  font-size: 13px; font-weight: 700; line-height: 1.15;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.podnaslov { font-size: 9px; color: #52514e; display: flex; gap: 3mm; }
.grana { color: #8a8a85; }
.kolicina { font-size: 10px; text-align: right; white-space: nowrap; }
.kolicina strong { font-size: 13px; }
.popunjenost { display: block; color: #6b7280; font-size: 9px; }

.traka {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.6mm;
}
.traka-polje {
  border: 1px solid #ddd9cf; background: #faf9f6; padding: 1.2mm 1.6mm;
  display: flex; flex-direction: column; gap: .4mm; min-width: 0;
}
.traka-oznaka {
  font-size: 7.5px; text-transform: uppercase; letter-spacing: .4px; color: #6b7280;
}
.traka-vrijednost {
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.zamjena { font-size: 9px; font-weight: 600; color: #52514e; }
.stanje-hladi { background: #eaf3fb; border-color: #a9cbe8; }
.stanje-iskljuceno { background: #f3f3f1; border-color: #cfcfcb; }

.sredina { display: grid; grid-template-columns: 1fr 1fr; gap: 2.4mm; }
.blok { border: 1px solid #e4e0d6; padding: 1.4mm 1.8mm; min-width: 0; }
.blok h3 {
  margin: 0 0 1mm; font-size: 8.5px; text-transform: uppercase;
  letter-spacing: .5px; color: #7f1d1d; font-weight: 700;
}
.parametri { display: grid; gap: .5mm; }
.param {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 2mm; font-size: 11px; min-width: 0;
}
.param-oznaka { color: #52514e; white-space: nowrap; }
.param-vrijednost {
  font-weight: 700; font-variant-numeric: tabular-nums; text-align: right;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* Jedinica je uvijek uz broj i uvijek slabija od njega — broj bez jedinice
   na ovoj kartici ne postoji (g/L zaostalog secera i °Oe iz berbe zive u
   odvojenim blokovima i ne smiju se citati kao ista mjera). */
.jedinica { font-weight: 600; color: #6b7280; font-size: 8.5px; }

.manjinski {
  margin-top: 1mm; padding-top: 1mm; border-top: 1px dotted #ddd9cf;
  font-size: 8.5px; color: #52514e;
}
.meta { margin-top: 1mm; font-size: 8px; color: #8a8a85; }

.sastav { display: grid; gap: .5mm; }
.sastav-red {
  display: grid; grid-template-columns: 1fr auto auto; gap: 2mm;
  font-size: 9px; align-items: baseline;
}
.sastav-naziv { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Oznaka izvora stoji uz naziv, slabija od njega — razlikuje retke koji se
   inace zovu isto, a ne natjece se s nazivom vina za paznju. */
.sastav-izvor { color: #8a8a85; font-size: 8px; margin-left: 1.4mm; }
.podnaslov-bloka { color: #8a8a85; font-weight: 600; text-transform: none; letter-spacing: 0; }
.sastav-litre { font-variant-numeric: tabular-nums; color: #52514e; }
.sastav-postotak { font-variant-numeric: tabular-nums; font-weight: 700; min-width: 11mm; text-align: right; }

.grafovi { display: grid; grid-template-columns: 1fr 1fr; gap: 2.4mm; }
.graf { width: 100%; height: auto; display: block; }

.stupci { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2.4mm; }
.stupac { border-top: 1px solid #e4e0d6; padding-top: 1mm; min-width: 0; }
.stupac-naslov {
  font-size: 7.5px; text-transform: uppercase; letter-spacing: .4px;
  color: #6b7280; margin-bottom: .8mm;
}
.stavka { font-size: 11px; line-height: 1.25; margin-bottom: .6mm; min-width: 0; }
.stavka-datum { color: #8a8a85; margin-right: 1.4mm; font-variant-numeric: tabular-nums; }
.stavka-naslov { font-weight: 600; }
.stavka-detalj { color: #52514e; margin-left: 1.4mm; font-variant-numeric: tabular-nums; }
.prazno { font-size: 11px; color: #8a8a85; }

.biljeska { margin-top: auto; }
.biljeska-oznaka {
  font-size: 7.5px; text-transform: uppercase; letter-spacing: .4px;
  color: #6b7280; margin-bottom: 1.4mm;
}
.crta { border-bottom: 1px solid #c9c4b8; height: 7mm; }

.prazni { page-break-inside: avoid; break-inside: avoid; margin-top: 4mm; }
.prazni h2 {
  font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
  color: #6b7280; margin: 0 0 2mm; font-weight: 700;
}
.prazni-mreza { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2mm; }
.prazni-polje {
  border: 1px solid #ddd9cf; background: #f5f5f2; padding: 1.6mm 2mm;
  display: flex; justify-content: space-between; align-items: baseline; font-size: 10px;
}
.prazni-polje span { color: #8a8a85; font-size: 9px; }

@media print {
  .alatna-traka { display: none; }
  .izvjestaj { padding: 0; max-width: none; }
  .naslov-ispisa { margin-bottom: 3mm; }
  .kartica { margin-bottom: 2mm; }
}

@media screen {
  .izvjestaj { background: #ffffff; }
  body { background: #e9ecef; }
}
`;
