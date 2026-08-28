/**
 * DNEVNIK JEDNE FERMENTACIJE — jedan papir, spreman za ispis.
 *
 * Cita i prikazuje. Nista se ne upisuje.
 *
 * SVE SE RACUNA, NISTA SE NE PREPISUJE. `Fermentacija` u bazi nosi samo
 * granicu (tank, pocetak, kraj, kvasac). Koje vino, kroz koje tankove, s kojim
 * preparatima i na kojoj temperaturi — sve se slaze pri prikazu:
 *   put vina    -> lib/fermentacija-prozor.ts (knjiga kretanja)
 *   mjerenja    -> lib/mjerenja-berba.ts (ziva tablica UNIJA arhiva)
 *   preparati   -> Zadatak + ZadatakStavka
 *   temperatura -> OcitanjeTemperature, agregirano po danu
 * Zato nema tablice koja moze odlutati od izvora.
 *
 * PREPARATI SE NE FILTRIRAJU PO `jeKvasac` — I NIKAD SE NECE
 * ----------------------------------------------------------
 * Dnevnik mora pokazati SVE sto je islo u most: kvasac, hranu, enzime,
 * zastitne pripravke, kiseline, sve. Cita se iz `Zadatak`/`ZadatakStavka` BEZ
 * ijednog filtra. `Preparation.jeKvasac` odgovara na jedno jedino pitanje —
 * "koji preparat forma smije ponuditi kao pocetak fermentacije" — i nikamo
 * drugdje ne ulazi. Od 76 preparata u katalogu 53 NISU kvasci, i svih 53 imaju
 * jednako pravo na ovaj papir. Filtar po `jeKvasac` ovdje pojeo bi pola
 * dnevnika. Isto pise uz stupac u schema.prisma, u scripts/oznaci-kvasce.ts i
 * uz racun ponude u app/tankovi/[id]/page.tsx.
 *
 * KILOGRAMI SE NE ZBRAJAJU
 * ------------------------
 * Kod blenda zaglavlje daje REDAK PO BERBI, bez ukupnog zbroja kilograma.
 * Kilogrami opisuju cijelu berbenu partiju, a u ovaj tank je doslo samo dio —
 * zbroj bi tvrdio grozde koje vecina nikad nije ni vidjela. Isto pravilo vec
 * drze lib/berba-lanac.ts i lib/berba-model.ts. Litre se smiju zbrojiti, jer
 * se za njih zna koliko ih je stvarno uslo.
 *
 * RUPE U TEMPERATURI OSTAJU RUPE
 * ------------------------------
 * Gateway NE pise redak kad kontroler ne odgovori (`temperatura` je NOT NULL —
 * vidi gateway/README.md). Zato se nabrajaju SVI dani prozora, a dan bez
 * ocitanja dobiva svoj redak s oznakom da ga nema. Uz svaki dan ide i broj
 * ocitanja (pun dan je 720, ciklus je 2 min), pa se vidi i djelomicna
 * pokrivenost, ne samo potpuni prekid. Prije 09.06.2026 temperature nema uopce.
 *
 * BROJ UPITA JE OGRANICEN
 * -----------------------
 * Tri fiksna vala po najvise cetiri upita, plus temperatura po tanku kroz
 * `uValovima` sirine 2. Pooler drzi 15 veza za CIJELU aplikaciju
 * (lib/paralelno.ts). Broj tankova je ogranicen na MAX_TANKOVA i visak se
 * IZRICITO prijavljuje na papiru — tiho rezanje bi izgledalo kao potpun podatak.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { uValovima } from "@/lib/paralelno";
import PrintButton from "@/components/PrintButton";
import { prozorFermentacije, type Boravak } from "@/lib/fermentacija-prozor";
import { citajMjerenja, type Redak as RedakMjerenja } from "@/lib/mjerenja-berba";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Gornja granica tankova za temperaturu. Visak se prijavljuje, ne presucuje. */
const MAX_TANKOVA = 12;

/** Pun dan gatewaya: ciklus 120 s -> 720 ocitanja (gateway/gateway.py). */
const OCITANJA_PUN_DAN = 720;

const ZONA = "Europe/Zagreb";

function broj(v: number | null | undefined, decimala = 1): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimala,
  });
}

function datum(v: Date | string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("hr-HR");
}

function datumSat(v: Date | string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "YYYY-MM-DD" po lokalnoj zoni — isti kljuc koji vraca SQL nize. */
function danKljuc(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function trajanjeDana(od: Date, doK: Date): number {
  return Math.max(0, Math.round((doK.getTime() - od.getTime()) / 86400000));
}

type RedTemperature = {
  dan: string;
  ocitanja: number;
  min: number;
  prosjek: number;
  max: number;
  hladilo: boolean;
};

export default async function DnevnikFermentacijePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  noStore();

  const p = await params;
  const id = p?.id;
  if (!id) return notFound();

  // --- Val 1 -------------------------------------------------------------
  const [fermentacija, tankovi] = await Promise.all([
    prisma.fermentacija.findUnique({ where: { id } }),
    prisma.tank.findMany({ select: { id: true, broj: true } }),
  ]);

  if (!fermentacija || fermentacija.obrisano) return notFound();

  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));
  const T = (tankId: string) => `T${brojTanka.get(tankId) ?? "?"}`;

  const sada = new Date();
  const prozor = await prozorFermentacije(
    prisma,
    {
      tankId: fermentacija.tankId,
      pocetakAt: fermentacija.pocetakAt,
      krajAt: fermentacija.krajAt,
    },
    sada
  );

  const prozorOd = fermentacija.pocetakAt;
  const prozorDo = prozor.prozorDo;

  // Tankovi kroz koje je vino proslo, s rasponom po tanku. Boravci istog tanka
  // spajaju se u JEDAN raspon — inace bi tri berbe u istom tanku dale tri
  // jednaka upita za temperaturu.
  const rasponPoTanku = new Map<string, { od: Date; do: Date }>();
  for (const b of prozor.boravci) {
    const stari = rasponPoTanku.get(b.tankId);
    if (!stari) {
      rasponPoTanku.set(b.tankId, { od: b.od, do: b.do });
      continue;
    }
    if (b.od < stari.od) stari.od = b.od;
    if (b.do > stari.do) stari.do = b.do;
  }

  const sviTankIds = [...rasponPoTanku.keys()];
  const tankIds = sviTankIds.slice(0, MAX_TANKOVA);
  const odrezanoTankova = sviTankIds.length - tankIds.length;

  // --- Val 2 -------------------------------------------------------------
  const [berbe, zadaci, korisnici] = await Promise.all([
    prozor.berbaIds.length > 0
      ? prisma.berba.findMany({
          where: { id: { in: prozor.berbaIds } },
          select: {
            id: true,
            nazivSorte: true,
            datumBerbe: true,
            godinaBerbe: true,
            oznakaBerbe: true,
            vinograd: true,
            parcela: true,
            kolicinaLitara: true,
            kolicinaKgGrozdja: true,
            secer: true,
            kiseline: true,
            ph: true,
          },
        })
      : Promise.resolve([]),

    // PREPARATI — BEZ IJEDNOG FILTRA PO `jeKvasac`. Vidi zaglavlje datoteke.
    tankIds.length > 0
      ? prisma.zadatak.findMany({
          where: {
            tankId: { in: tankIds },
            status: "IZVRSEN",
            izvrsenoAt: { gte: prozorOd, lt: prozorDo },
          },
          orderBy: { izvrsenoAt: "asc" },
          include: {
            preparat: { select: { naziv: true } },
            jedinica: { select: { naziv: true } },
            izlaznaJedinica: { select: { naziv: true } },
            izvrsioKorisnik: { select: { ime: true } },
            stavke: {
              orderBy: { redoslijed: "asc" },
              include: {
                preparat: { select: { naziv: true } },
                jedinica: { select: { naziv: true } },
                izlaznaJedinica: { select: { naziv: true } },
              },
            },
          },
        })
      : Promise.resolve([]),

    // Korisnici se citaju posebno: Fermentacija namjerno nema strani kljuc na
    // User (vidi migration.sql), pa relacije nema ni za `include`.
    prisma.user.findMany({
      where: {
        id: {
          in: [fermentacija.korisnikId, fermentacija.zatvorioKorisnikId].filter(
            (x): x is string => !!x
          ),
        },
      },
      select: { id: true, ime: true },
    }),
  ]);

  const imeKorisnika = new Map(korisnici.map((k) => [k.id, k.ime]));
  const berbaPoId = new Map(berbe.map((b) => [b.id, b]));

  // --- Mjerenja: ziva tablica UNIJA arhive -------------------------------
  // Mjerenja se BRISU iz `Mjerenje` cim se tank isprazni (izlaz-vina,
  // tank/arhiviraj, pretok-arhiviranje), a to se dogodi bas kad fermentacija
  // zavrsi. Citanje samo zive tablice pojelo bi dnevnik u trenutku kad postane
  // konacan.
  const mjerenja =
    tankIds.length > 0
      ? await citajMjerenja(prisma, { tankIds, od: prozorOd, do: prozorDo })
      : [];

  const secerTocke = mjerenja
    .filter((m) => m.vrijednosti.secer != null)
    .sort((a, b) => a.izmjerenoAt.getTime() - b.izmjerenoAt.getTime());

  // --- Temperatura: jedan upit po tanku, kroz uValovima -------------------
  const temperatureRedci = await uValovima(
    tankIds.map((tankId) => async () => {
      const raspon = rasponPoTanku.get(tankId)!;
      const redci = await prisma.$queryRaw<
        Array<{
          dan: string;
          ocitanja: bigint | number;
          min: number;
          prosjek: number;
          max: number;
          hladilo: boolean;
        }>
      >`
        SELECT to_char("mjerenoU" AT TIME ZONE ${ZONA}, 'YYYY-MM-DD') AS dan,
               count(*)                              AS ocitanja,
               min("temperatura")::float8            AS min,
               avg("temperatura")::float8            AS prosjek,
               max("temperatura")::float8            AS max,
               bool_or("hladjenjeAktivno")           AS hladilo
        FROM "OcitanjeTemperature"
        WHERE "tankId" = ${tankId}
          AND "mjerenoU" >= ${raspon.od}
          AND "mjerenoU" <  ${raspon.do}
        GROUP BY 1
        ORDER BY 1
      `;

      const poDanu = new Map<string, RedTemperature>(
        redci.map((r) => [
          r.dan,
          {
            dan: r.dan,
            ocitanja: Number(r.ocitanja),
            min: Number(r.min),
            prosjek: Number(r.prosjek),
            max: Number(r.max),
            hladilo: r.hladilo,
          },
        ])
      );

      // Nabroji SVE dane raspona. Dan bez ocitanja ostaje kao rupa, ne
      // preskace se — vidi zaglavlje datoteke.
      const dani: Array<{ dan: string; red: RedTemperature | null }> = [];
      const kraj = danKljuc(raspon.do);
      const hod = new Date(raspon.od);
      for (let i = 0; i < 400; i++) {
        const k = danKljuc(hod);
        dani.push({ dan: k, red: poDanu.get(k) ?? null });
        if (k >= kraj) break;
        hod.setDate(hod.getDate() + 1);
      }

      return { tankId, raspon, dani };
    }),
    2
  );

  const otvorena = !fermentacija.krajAt;
  const trajanje = trajanjeDana(prozorOd, prozorDo);
  const ukupnoLitara = [...prozor.pocetneLitre.values()].reduce((s, x) => s + x, 0);
  const danas = new Date().toLocaleString("hr-HR");

  return (
    <div style={pageStyle}>
      <style>{`
        @media print {
          html, body {
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          a[href] { text-decoration: none !important; color: #000 !important; }
          .no-print { display: none !important; }
          .lomi-stranicu { break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>

      <div className="no-print" style={topActionsStyle}>
        <Link href={`/tankovi/${fermentacija.tankId}`} style={actionButtonStyle}>
          Natrag na tank
        </Link>
        <Link href="/fermentacija" style={actionButtonStyle}>
          Sve fermentacije
        </Link>
        <PrintButton />
        <div style={infoButtonStyle}>Za PDF: Ctrl+P → Save as PDF</div>
      </div>

      <div style={reportWrapStyle}>
        <div style={reportHeaderStyle}>
          <div>
            <h1 style={reportTitleStyle}>
              Dnevnik fermentacije — {T(fermentacija.tankId)}
            </h1>
            <div style={reportSubStyle}>
              {datum(fermentacija.pocetakAt)} –{" "}
              {fermentacija.krajAt ? datum(fermentacija.krajAt) : "u tijeku"} ·{" "}
              {trajanje} {trajanje === 1 ? "dan" : "dana"}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#6b7280" }}>
            Ispisano {danas}
          </div>
        </div>

        {/* ---------------- VINO ---------------- */}
        <Sekcija naslov="Vino">
          {prozor.berbaIds.length === 0 ? (
            <Prazno>
              Knjiga kretanja za ovaj tank u trenutku početka ne zna ništa. To ne
              znači da vina nije bilo — znači da knjiga taj ulaz ne pokriva.
            </Prazno>
          ) : (
            <>
              <table style={tabelaStyle}>
                <thead>
                  <tr>
                    <Th>Sorta</Th>
                    <Th>Berba</Th>
                    <Th desno>Ubrano L</Th>
                    <Th desno>Ubrano kg</Th>
                    <Th desno>U fermentaciji L</Th>
                    <Th>Vinograd / parcela</Th>
                  </tr>
                </thead>
                <tbody>
                  {prozor.berbaIds.map((bId) => {
                    const b = berbaPoId.get(bId);
                    return (
                      <tr key={bId}>
                        <Td>{b?.nazivSorte ?? "(zapis berbe ne postoji)"}</Td>
                        <Td>{datum(b?.datumBerbe)}</Td>
                        <Td desno>{broj(b?.kolicinaLitara, 0)}</Td>
                        <Td desno>{broj(b?.kolicinaKgGrozdja, 0)}</Td>
                        <Td desno>{broj(prozor.pocetneLitre.get(bId), 0)}</Td>
                        <Td>
                          {[b?.vinograd, b?.parcela].filter(Boolean).join(" / ") || "—"}
                        </Td>
                      </tr>
                    );
                  })}
                  {prozor.berbaIds.length > 1 ? (
                    <tr>
                      <Td colSpan={4}>
                        <strong>Ukupno u fermentaciji</strong>
                      </Td>
                      <Td desno>
                        <strong>{broj(ukupnoLitara, 0)}</strong>
                      </Td>
                      <Td />
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {prozor.berbaIds.length > 1 ? (
                <Biljeska>
                  Kilogrami se <strong>ne zbrajaju</strong>. Oni opisuju cijelu
                  berbenu partiju, a u ovu je fermentaciju iz svake ušao samo dio —
                  zbroj bi tvrdio grožđe koje većina nikad nije ni vidjela. Litre se
                  smiju zbrojiti jer se za njih zna koliko ih je stvarno ušlo.
                </Biljeska>
              ) : null}
            </>
          )}
        </Sekcija>

        {/* ---------------- GRANICA ---------------- */}
        <Sekcija naslov="Granica fermentacije">
          <Redak oznaka="Početak" vrijednost={datumSat(fermentacija.pocetakAt)} />
          <Redak
            oznaka="Kraj"
            vrijednost={
              fermentacija.krajAt ? datumSat(fermentacija.krajAt) : "još traje"
            }
          />
          <Redak
            oznaka="Trajanje"
            vrijednost={`${trajanje} ${trajanje === 1 ? "dan" : "dana"}${
              otvorena ? " (do danas)" : ""
            }`}
          />
          <Redak oznaka="Kvasac" vrijednost={fermentacija.kvasacNaziv ?? "nije upisan"} />
          <Redak
            oznaka="Datum početka"
            vrijednost={
              fermentacija.pocetakIzvor === "IZ_ZADATKA"
                ? "potvrđen iz zadatka dodavanja preparata"
                : "upisan ručno"
            }
          />
          <Redak
            oznaka="Otvorio"
            vrijednost={
              fermentacija.korisnikId
                ? imeKorisnika.get(fermentacija.korisnikId) ?? "—"
                : "—"
            }
          />
          <Redak
            oznaka="Zatvorio"
            vrijednost={
              fermentacija.zatvorioKorisnikId
                ? imeKorisnika.get(fermentacija.zatvorioKorisnikId) ?? "—"
                : otvorena
                ? "—"
                : "—"
            }
          />
          {fermentacija.napomena ? (
            <Redak oznaka="Napomena" vrijednost={fermentacija.napomena} />
          ) : null}
        </Sekcija>

        {/* ---------------- GDJE JE VINO BILO ---------------- */}
        <Sekcija naslov="Gdje je vino bilo">
          {prozor.boravci.length === 0 ? (
            <Prazno>Nema zapisa o kretanju u ovom razdoblju.</Prazno>
          ) : (
            <table style={tabelaStyle}>
              <thead>
                <tr>
                  <Th>Tank</Th>
                  <Th>Od</Th>
                  <Th>Do</Th>
                  <Th desno>Litara</Th>
                  <Th>Sorta</Th>
                </tr>
              </thead>
              <tbody>
                {prozor.boravci.map((b: Boravak, i) => (
                  <tr key={`${b.berbaId}-${b.tankId}-${i}`}>
                    <Td>{T(b.tankId)}</Td>
                    <Td>{datumSat(b.od)}</Td>
                    <Td>{b.otvoren ? "još traje" : datumSat(b.do)}</Td>
                    <Td desno>
                      {b.mijenjalaSe
                        ? `${broj(b.litreOd, 0)} → ${broj(b.litreDo, 0)}`
                        : broj(b.litreOd, 0)}
                    </Td>
                    <Td>{berbaPoId.get(b.berbaId)?.nazivSorte ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sekcija>

        {/* ---------------- PREPARATI ---------------- */}
        <Sekcija naslov="Preparati">
          {zadaci.length === 0 ? (
            <Prazno>
              U ovom razdoblju nema izvršenih zadataka dodavanja na tankovima kroz
              koje je vino prošlo.
            </Prazno>
          ) : (
            <table style={tabelaStyle}>
              <thead>
                <tr>
                  <Th>Datum</Th>
                  <Th>Tank</Th>
                  <Th>Vrsta</Th>
                  <Th>Preparat</Th>
                  <Th desno>Doza</Th>
                  <Th desno>Količina</Th>
                  <Th>Izvršio</Th>
                </tr>
              </thead>
              <tbody>
                {zadaci.flatMap((z) => {
                  const stavke =
                    z.stavke.length > 0
                      ? z.stavke.map((s) => ({
                          naziv: s.preparat?.naziv ?? "—",
                          doza: s.doza,
                          jed: s.jedinica?.naziv ?? "",
                          kol: s.izracunataKolicina,
                          izl: s.izlaznaJedinica?.naziv ?? "",
                        }))
                      : [
                          {
                            naziv: z.preparat?.naziv ?? "—",
                            doza: z.doza,
                            jed: z.jedinica?.naziv ?? "",
                            kol: z.izracunataKolicina,
                            izl: z.izlaznaJedinica?.naziv ?? "",
                          },
                        ];

                  return stavke.map((s, i) => (
                    <tr key={`${z.id}-${i}`}>
                      <Td>{i === 0 ? datum(z.izvrsenoAt) : ""}</Td>
                      <Td>{i === 0 ? T(z.tankId) : ""}</Td>
                      <Td>{i === 0 ? z.vrsta : ""}</Td>
                      <Td>{s.naziv}</Td>
                      <Td desno>
                        {s.doza != null ? `${broj(s.doza, 3)} ${s.jed}` : "—"}
                      </Td>
                      <Td desno>
                        {s.kol != null ? `${broj(s.kol, 2)} ${s.izl}` : "—"}
                      </Td>
                      <Td>{i === 0 ? z.izvrsioKorisnik?.ime ?? "—" : ""}</Td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          )}
          <Biljeska>
            Popis je <strong>potpun</strong> — kvasac, hrana, enzimi i zaštitni
            pripravci, sve što je ušlo u mošt. Ništa se ne filtrira.
          </Biljeska>
        </Sekcija>

        {/* ---------------- ŠEĆER ---------------- */}
        <Sekcija naslov="Šećer">
          {secerTocke.length === 0 ? (
            <Prazno>U ovom razdoblju nema izmjerenog šećera.</Prazno>
          ) : (
            <table style={tabelaStyle}>
              <thead>
                <tr>
                  <Th>Datum</Th>
                  <Th>Tank</Th>
                  <Th desno>Šećer</Th>
                  <Th>Zapis</Th>
                </tr>
              </thead>
              <tbody>
                {secerTocke.map((m: RedakMjerenja) => (
                  <tr key={`${m.izvor}-${m.id}`}>
                    <Td>{datumSat(m.izmjerenoAt)}</Td>
                    <Td>{m.tankId ? T(m.tankId) : "—"}</Td>
                    <Td desno>{broj(m.vrijednosti.secer, 2)}</Td>
                    <Td>
                      {m.izvor === "ARHIVA"
                        ? "arhiva"
                        : m.jeRucno === false
                        ? "preneseno pretokom"
                        : "ručno"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Biljeska>
            Točke, ne krivulja — između dva mjerenja se ništa ne pretpostavlja.
            Zapisi označeni <em>preneseno pretokom</em> nisu mjerenja nego
            vrijednosti koje je pretok prepisao s izvora.
          </Biljeska>
        </Sekcija>

        {/* ---------------- TEMPERATURA ---------------- */}
        <Sekcija naslov="Temperatura po danu">
          {temperatureRedci.length === 0 ? (
            <Prazno>Nema tankova s očitanjima u ovom razdoblju.</Prazno>
          ) : (
            temperatureRedci.map((t) => (
              <div key={t.tankId} className="lomi-stranicu" style={{ marginBottom: 14 }}>
                <div style={podnaslovStyle}>
                  {T(t.tankId)} · {datum(t.raspon.od)} – {datum(t.raspon.do)}
                </div>
                <table style={tabelaStyle}>
                  <thead>
                    <tr>
                      <Th>Dan</Th>
                      <Th desno>Očitanja</Th>
                      <Th desno>Min</Th>
                      <Th desno>Prosjek</Th>
                      <Th desno>Max</Th>
                      <Th>Hlađenje</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.dani.map((d) => (
                      <tr key={d.dan}>
                        <Td>{d.dan}</Td>
                        {d.red ? (
                          <>
                            <Td desno>
                              {d.red.ocitanja}
                              {d.red.ocitanja < OCITANJA_PUN_DAN ? " ⚠" : ""}
                            </Td>
                            <Td desno>{broj(d.red.min)}</Td>
                            <Td desno>{broj(d.red.prosjek)}</Td>
                            <Td desno>{broj(d.red.max)}</Td>
                            <Td>{d.red.hladilo ? "da" : "ne"}</Td>
                          </>
                        ) : (
                          <Td colSpan={5} style={{ color: "#9a3412" }}>
                            bez očitanja — kontroler se nije javljao
                          </Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
          <Biljeska>
            Pun dan je {OCITANJA_PUN_DAN} očitanja (ciklus 2 min). Manji broj je
            označen s ⚠ — gateway ne upisuje redak kad se kontroler ne javi, pa je
            rupa stvarna rupa, a ne ravna crta. Temperatura postoji tek od
            09.06.2026.
          </Biljeska>
          {odrezanoTankova > 0 ? (
            <Biljeska>
              <strong>Nije prikazano {odrezanoTankova} tankova.</strong> Vino je
              prošlo kroz {sviTankIds.length} tankova, a ispis ih čita najviše{" "}
              {MAX_TANKOVA}.
            </Biljeska>
          ) : null}
        </Sekcija>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prikaz
// ---------------------------------------------------------------------------

function Sekcija({ naslov, children }: { naslov: string; children: React.ReactNode }) {
  return (
    <section className="lomi-stranicu" style={sectionStyle}>
      <div style={sectionTitleStyle}>{naslov}</div>
      <div style={sectionBodyStyle}>{children}</div>
    </section>
  );
}

function Redak({ oznaka, vrijednost }: { oznaka: string; vrijednost: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={rowLabelStyle}>{oznaka}</div>
      <div style={rowValueStyle}>{vrijednost}</div>
    </div>
  );
}

function Th({ children, desno }: { children?: React.ReactNode; desno?: boolean }) {
  return <th style={{ ...thStyle, textAlign: desno ? "right" : "left" }}>{children}</th>;
}

function Td({
  children,
  desno,
  colSpan,
  style,
}: {
  children?: React.ReactNode;
  desno?: boolean;
  colSpan?: number;
  style?: React.CSSProperties;
}) {
  return (
    <td colSpan={colSpan} style={{ ...tdStyle, textAlign: desno ? "right" : "left", ...style }}>
      {children}
    </td>
  );
}

function Prazno({ children }: { children: React.ReactNode }) {
  return <div style={praznoStyle}>{children}</div>;
}

function Biljeska({ children }: { children: React.ReactNode }) {
  return <div style={biljeskaStyle}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Stilovi — preuzeti iz app/tankovi/[id]/izvjestaj/page.tsx da papir izgleda
// kao dio iste aplikacije.
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  padding: 20,
  background: "#f7f7f5",
  minHeight: "100vh",
};

const topActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 14,
};

const actionButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "10px 16px",
  background: "#ffffff",
  border: "1px solid #d6d3d1",
  borderRadius: 10,
  color: "#44403c",
  textDecoration: "none",
  fontSize: 14,
};

const infoButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 13,
  color: "#78716c",
};

const reportWrapStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e7e5e4",
  borderRadius: 12,
  padding: 24,
  maxWidth: 980,
  margin: "0 auto",
};

const reportHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  borderBottom: "2px solid #1c1917",
  paddingBottom: 12,
  marginBottom: 18,
};

const reportTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: "#1c1917",
};

const reportSubStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#57534e",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 18,
  border: "1px solid #e7e5e4",
  borderRadius: 8,
  overflow: "hidden",
};

const sectionTitleStyle: React.CSSProperties = {
  background: "#fafaf9",
  borderBottom: "1px solid #e7e5e4",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#57534e",
};

const sectionBodyStyle: React.CSSProperties = {
  padding: 12,
};

const podnaslovStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#1c1917",
  marginBottom: 6,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px 1fr",
  gap: 8,
  padding: "4px 0",
  borderBottom: "1px dotted #e7e5e4",
  fontSize: 13,
};

const rowLabelStyle: React.CSSProperties = {
  color: "#78716c",
};

const rowValueStyle: React.CSSProperties = {
  color: "#1c1917",
  fontWeight: 500,
};

const tabelaStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12.5,
};

const thStyle: React.CSSProperties = {
  borderBottom: "1px solid #d6d3d1",
  padding: "6px 8px",
  color: "#57534e",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f5f5f4",
  padding: "5px 8px",
  color: "#1c1917",
  verticalAlign: "top",
};

const praznoStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#78716c",
  fontStyle: "italic",
};

const biljeskaStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 11.5,
  color: "#78716c",
  lineHeight: 1.45,
};
