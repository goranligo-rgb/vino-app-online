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
import {
  sloziKartice,
  formatBrojKratko,
  type Kartica,
  type Sastavnica,
  type Stavka,
} from "./model";
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

/**
 * Blok SASTAV — sve sorte tanka, s udjelom.
 *
 * ZAMJENJUJE uski redak "Sastav: Grasevina 95,5 % · Muskat zuti 4,5 %" koji je
 * stajao u dnu bloka BERBA. Bio je najsitniji tekst na kartici (8,5px, siva),
 * pa je sastav — podatak koji se cita jednako cesto kao secer ili pH — izgledao
 * kao fusnota ispod pH.
 *
 * Sada je vlastiti blok, istog oblika kao TRENUTNI PARAMETRI i BERBA: naslov u
 * istom stilu, nazivi sorti u punoj velicini, postotak podebljan i poravnat
 * desno. Isti oblik kao blok SASTAV MJESAVINE na karticama mjesavina — samo bez
 * stupca s litrama, jer kod jednosortnog tanka litre po sorti ne kazu nista sto
 * kolicina u zaglavlju vec ne kaze.
 *
 * Stoji SAMO na karticama s berbom. Mjesavine imaju svoj SASTAV MJESAVINE i
 * dvaput im ne treba — vidi biljesku uz taj blok.
 *
 * Postotak dolazi iz `TankSortaUdio`, istog izvora koji cita pravilo >90 %.
 */
function BlokSastava({ sastav }: { sastav: Sastavnica[] }) {
  return (
    <section className="blok">
      <h3>Sastav</h3>
      {sastav.length === 0 ? (
        <div className="prazno">nije zapisan</div>
      ) : (
        <div className="sastav">
          {sastav.map((s, i) => (
            <div key={`${s.naziv}-${i}`} className="sastav-red sastav-red-udio">
              <span className="sastav-naziv">{s.naziv}</span>
              <span className="sastav-postotak">{broj(s.postotak, 1)} %</span>
            </div>
          ))}
        </div>
      )}
    </section>
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
          {/* JEDNO ime, ne dva. `nazivVina` kad postoji, inace `sorta`. Ime se
              NE izvodi iz sastava — kartica pokazuje ono sto u bazi pise, isto
              sto i monitor i stranica tanka. Sastav ima svoj redak nize. */}
          <div className="naziv-vina">{k.nazivVina || k.sorta || "—"}</div>
          <div className="podnaslov">
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
          {/* SOFT-OFF: kontroler nema registar za ON/OFF, pa se hladjenje gasi
              podizanjem set pointa na SOFT_OFF_TEMP (20,0 °C) — vidi
              lib/tank-komanda.ts. Tih 20 nije zeljena temperatura nego oznaka
              "ugaseno", pa se ne ispisuje kao zadana. Umjesto toga ide
              zapamcena vrijednost od prije gasenja, ista koju pokazuje i
              stranica tanka ("Zadana (zapamćena)"). Bez nje ostaje crtica. */}
          <span className="traka-vrijednost">
            {k.hladjenjeIskljuceno ? (
              k.tempZapamcena == null ? (
                "—"
              ) : (
                <>
                  {broj(k.tempZapamcena, 1)} °C{" "}
                  <span className="zamjena">(isključeno)</span>
                </>
              )
            ) : k.tempZadana == null ? (
              "—"
            ) : (
              `${broj(k.tempZadana, 1)} °C`
            )}
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
        {/* LIJEVI STUPAC nosi dva bloka na karticama s berbom.
            Mjereno 10.09.2026: sadrzaj bloka TRENUTNI PARAMETRI je 35,7 mm, a
            desnog bloka BERBA 42,0-46,2 mm — desni je taj koji diktira visinu
            reda, pa je lijevi stupac imao 6-10 mm neiskoristenog prostora.
            SASTAV ide onamo, a ne pod BERBU, da se ta praznina potrosi umjesto
            da se kartica produzi za punu visinu bloka. */}
        <div className="stupac-blokova">
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

          {/* Samo uz berbu: mjesavina svoj sastav ima u desnom bloku. */}
          {k.berba ? <BlokSastava sastav={k.sastavSvi} /> : null}
        </div>

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
              {/* ≈ jer je razmjerni izračun PROCJENA: `Berba.kolicinaKgGrozdja`
                  je vaga cijele partije, a partija ide u više tankova. Bez
                  oznake bi se čitalo kao izvagano. */}
              <Param
                oznaka="Grožđe ≈"
                vrijednost={k.berba.kolicinaKgGrozdja}
                jedinica="kg"
              />
              {/* Stupnjevi Oechsle. Dolaze IZ BERBE i stoje samo ovdje. */}
              <Param oznaka="Šećer" vrijednost={k.berba.secerOe} jedinica="°Oe" />
              <Param oznaka="Kiseline" vrijednost={k.berba.kiseline} jedinica="g/L" />
              <Param oznaka="pH" vrijednost={k.berba.ph} jedinica="" />
            </div>
            {/* Sastav je odselio u vlastiti blok SASTAV, u lijevi stupac. Ovdje
                je bio uski sivi redak od 8,5px — najsitniji tekst na kartici,
                fusnota ispod pH. */}
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
            {/* NEMA `RedakSastava`. Blok iznad JE popis sorti, redak po redak s
                litrama i postotkom; uski redak "Sastav: ..." ispod njega
                ponavljao je isti podatak drugim rijecima. Stoji samo pod
                "Berba", gdje ga inace ne bi bilo. */}
          </section>
        )}
      </div>

      {/* PRAZAN GRAF SE NE CRTA — ni cijeli, ni pojedini panel.

          Obje komponente same vracaju null kad nemaju sto pokazati, a graf
          secera i temperature se skupi na jedan panel kad drugi nema podataka.
          Ovdje ostaje samo odluka o samom okviru: kad nijedan graf ne bi nista
          nacrtao, nema ni reda `.grafovi`, pa biljeska dobiva cetiri linije
          umjesto dvije (to je jedino sto `bezGrafova` jos odlucuje).

          Mreza ostaje `1fr 1fr` i kad prezivi samo jedan graf: rastezanje na
          punu sirinu bilo bi kontraproduktivno, jer su grafovi SVG-ovi s
          `height: auto` pa bi siri graf bio i visi. */}
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
          {/*
            POPIS, ne jedan. Vino u tanku obicno nije fermentiralo jednim
            kvascem, a kartica je do sada pokazivala samo ono sto je dodano U
            TOM tanku — cesto nista, jer je vino fermentiralo drugdje.

            "bez zapisa" se ispisuje UVIJEK kad postoji: zbroj mora davati
            100 %, inace "34 % · 19 % · 9 %" izgleda kao da je racun negdje
            pojeo ostatak.
          */}
          {k.kvasci.length > 0 ? (
            <>
              {/* Retci dobiveni PRIPISIVANJEM PO PARTIJI nose ≈ i natpis, jer
                  im je nazivnik cijela berbena sarza pa su postotci sustavno
                  nizi od onih po trenutku pretoka. Bez oznake se dva pravila
                  ne bi smjela citati kao ista mjera. Popis je uvijek cijel po
                  jednom pravilu, pa natpis ide jednom, iznad. */}
              {k.kvasci[0].poPartiji && (
                <div className="kvasac-pravilo">≈ po berbenoj partiji</div>
              )}
              {k.kvasci.map((kv, i) => (
                <div className="stavka" key={`${kv.naziv}-${i}`}>
                  <span className="stavka-datum">{datum(kv.datum)}</span>
                  <span className="stavka-naslov">{kv.naziv}</span>
                  {kv.brojTanka !== null && (
                    <span className="kvasac-tank">T{kv.brojTanka}</span>
                  )}
                  <span className="stavka-detalj">
                    {kv.poPartiji ? "≈ " : ""}
                    {kv.postotak} %
                  </span>
                </div>
              ))}
              {k.kvasciBezZapisa > 0 && (
                <div className="stavka">
                  <span className="stavka-datum">—</span>
                  <span className="kvasac-rupa">bez zapisa</span>
                  <span className="stavka-detalj">{k.kvasciBezZapisa} %</span>
                </div>
              )}
            </>
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
/* MARGINA OSTAJE 10mm. Smanjivanje NE vraca dvije kartice po stranici —
 * izmjereno 10.09.2026, headless Chrome, svih 38 kartica:
 *
 *   margina | stranica | najmanja kartica | dvije traze | stranica s 2 kartice
 *   --------|----------|------------------|-------------|---------------------
 *     10mm  |  277mm   |     139,2mm      |   280,4mm   |   0  (38 stranica)
 *      8mm  |  281mm   |     140,0mm      |   282,0mm   |   0  (38 stranica)
 *      6mm  |  285mm   |     140,8mm      |   283,6mm   |   0  (38 stranica)
 *      5mm  |  287mm   |     141,2mm      |   284,4mm   |   1  (37 stranica)
 *
 * ZASTO SMANJIVANJE NE POMAZE: uza margina znaci siru karticu, a grafovi su
 * SVG-ovi sa "width: 100%; height: auto" — sira kartica ima VISE grafove, pa
 * kartica poraste zajedno sa stranicom. Dobitak od 2mm stranice pojede ~0,8mm
 * kartice, dvaput.
 *
 * A i kad racun prodje (6mm), stvarnih parova nema: kartice nisu poredane po
 * visini, pa se para susjedni par, a vecina ih je 140-167mm. Na 5mm — sto je
 * vec u nepisivom rubu vecine uredskih pisaca — dobije se JEDNA stranica manje
 * od 38.
 *
 * Jedina prava poluga je VISINA KARTICE: da se pouzdano paraju, moraju pasti
 * na ~137mm. To je oduzimanje sadrzaja, ne margine.
 *
 * Nista se pritom NE PREREZE ni na jednoj margini: najvisa kartica je 167,4mm,
 * daleko ispod visine stranice, a pravilo break-inside: avoid nize karticu
 * premjesta CIJELU. */
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

/* --- Kartica: pola A4 kao DONJA granica, ne kao strop. ---
 *
 * "height: 136mm" je rezao sadrzaj: izmjereno 09.09.2026 headless Chromeom,
 * 15 od 38 kartica prelijevalo se izvan okvira za 2,4-7,1 mm, a citatelj to na
 * papiru vidi kao odrezan red. "min-height" pusta karticu da naraste do svoje
 * visine; najvisa je danas 146,8 mm.
 *
 * NELOMLJIVOST je uvjet: "break-inside: avoid" (i stari "page-break-inside"
 * radi starijih preglednika) drzi karticu cijelom. Kad naraste preko pola A4,
 * na stranicu stane samo jedna i druga ide cijela na sljedecu — nikad pola
 * ovdje pola ondje. Zato kartica NE SMIJE imati fiksnu visinu: fiksna visina
 * ne sprjecava lom nego ga skriva, jer sadrzaj iscuri izvan okvira.
 *
 * Visinu tjera blok berbe (sest redaka parametara), ne broj sorti: cetiri
 * najvise kartice imaju po jednu sortu, a ona s pet sorti stane u 136 mm.
 */
.kartica {
  min-height: 136mm;
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

/* Unutarnji blokovi se ne smiju lomiti ni sami po sebi. Bez ovoga preglednik
   smije prelomiti npr. popis stupaca i onda "break-inside" na kartici vise
   nema sto cuvati. */
.kartica > * {
  break-inside: avoid;
  page-break-inside: avoid;
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
/* Lijevi stupac drzi dva bloka jedan ispod drugoga (TRENUTNI PARAMETRI +
   SASTAV). Pravilo align-content: start je namjerno: bez njega bi grid
   rastegnuo oba bloka na visinu stupca i SASTAV bi na nekim karticama bio
   dvostruko visi od svog sadrzaja. Ovako blokovi zadrze prirodnu visinu, a
   visak prostora ostaje ispod — ondje ga se i ne vidi, jer blokovi imaju
   vlastiti okvir.
   (Bez obrnutih navodnika: cijeli CSS je JS template literal.) */
.stupac-blokova { display: grid; gap: 2.4mm; align-content: start; min-width: 0; }
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
/* Isti redak, bez stupca s litrama — blok SASTAV na karticama s berbom.
   Kod jednosortnog tanka litre po sorti ne kazu nista sto kolicina u zaglavlju
   vec ne kaze, pa ostaju naziv i udio. */
.sastav-red-udio { grid-template-columns: 1fr auto; }

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
/* Oznaka izvornog tanka uz kvasac: "LALVIN SENSY T17". Prigusena je jer
   odgovara na drugo pitanje od naziva — gdje je fermentiralo, ne cime. */
.kvasac-tank { color: #8a8a85; margin-left: 1.2mm; font-variant-numeric: tabular-nums; }
/* Vino bez zapisa o kvascu. Kurziv, da se ne cita kao ime preparata. */
.kvasac-rupa { font-style: italic; color: #6f6e6a; }
/* Oznaka da popis dolazi od pripisivanja po berbenoj partiji, a ne po
   trenutku pretoka. Postotci ta dva pravila NISU usporedivi. */
.kvasac-pravilo {
  font-size: 8px; color: #7f1d1d; font-style: italic; margin-bottom: .4mm;
}
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
