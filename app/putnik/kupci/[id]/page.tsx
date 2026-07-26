import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatHrDateTime, formatHrDate } from "@/lib/datum";
import { getAuthUser } from "@/lib/putnik-auth";
import { postaviAktivanKupca } from "./actions";
import { otvoriDanasnjiPosjet } from "./posjet/actions";
import PosjetGalerija from "./posjet/posjet-galerija";
import KupacTabovi, { type TabDef } from "./kupac-tabovi";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function label(value?: string | null) {
  return value ? value.replaceAll("_", " ") : "-";
}

function formatDate(value?: Date | string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Trajanje posjeta iz vrijemeOd/vrijemeDo ("HH:MM"). null ako fali bilo koje —
// tada se prikazuje samo datum (ne izmišlja se trajanje).
function trajanje(od?: string | null, doo?: string | null): string | null {
  if (!od || !doo) return null;
  const [oh, om] = od.split(":").map(Number);
  const [dh, dm] = doo.split(":").map(Number);
  if ([oh, om, dh, dm].some((n) => !Number.isFinite(n))) return null;
  let min = dh * 60 + dm - (oh * 60 + om);
  if (min < 0) min += 24 * 60; // rijetki prijelaz preko ponoći
  if (min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// Razvrstavanje stavki posjeta u tri skupine — SAMO za prikaz (ista polja,
// ne dira obračun): prodano = ODMAH+kolicina, dogovoreno = PRIPREMITI+kolicina,
// poklon = gratis (bilo kojeg statusa). Vraća i zbrojeve za brze značke.
type Redak = { naziv: string; kolicina: number; jedinica: string };
function razvrstajStavke(
  stavke: { nazivProizvoda: string; kolicina: number | null; jedinica: string | null; gratis: number; statusPripreme: string }[]
) {
  const prodano: Redak[] = [];
  const dogovoreno: Redak[] = [];
  const poklon: Redak[] = [];
  for (const s of stavke) {
    const kol = s.kolicina ?? 0;
    const jed = s.jedinica || "kom";
    const jeOdmah = s.statusPripreme === "ODMAH";
    if (kol > 0) {
      if (jeOdmah) prodano.push({ naziv: s.nazivProizvoda, kolicina: kol, jedinica: jed });
      else dogovoreno.push({ naziv: s.nazivProizvoda, kolicina: kol, jedinica: jed });
    }
    if (s.gratis > 0) poklon.push({ naziv: s.nazivProizvoda, kolicina: s.gratis, jedinica: jed });
  }
  return { prodano, dogovoreno, poklon };
}

// Mala značka (chip) za sažetak posjeta.
function Chip({ boja, children }: { boja: "green" | "amber" | "orange" | "stone"; children: React.ReactNode }) {
  const map = {
    green: "border-green-300 bg-green-50 text-green-800",
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    orange: "border-orange-300 bg-orange-50 text-orange-800",
    stone: "border-stone-300 bg-stone-50 text-stone-600",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[12px] font-semibold ${map[boja]}`}>
      {children}
    </span>
  );
}

// Skupina (Prodano / Poklon / Dogovoreno) unutar razgrnutog posjeta.
function SkupinaLista({
  naslov,
  boja,
  items,
}: {
  naslov: string;
  boja: "green" | "amber" | "orange";
  items: Redak[];
}) {
  const linija = {
    green: "text-green-800",
    amber: "text-amber-900",
    orange: "text-orange-800",
  } as const;
  return (
    <div className="border border-orange-100 bg-orange-50/30 p-2">
      <div className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${linija[boja]}`}>{naslov}</div>
      {items.length === 0 ? (
        <div className="mt-1 text-[13px] text-stone-400">—</div>
      ) : (
        <ul className="mt-1 space-y-0.5 text-[14px] text-stone-800">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{it.naziv}</span>
              <span className="shrink-0 font-semibold">
                {it.kolicina} {it.jedinica}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Broj dana od zadnjeg posjeta (null ako nema posjeta).
function daniOdPosjeta(datum?: Date | string | null): number | null {
  if (!datum) return null;
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const danas = new Date();
  danas.setHours(0, 0, 0, 0);
  return Math.round((danas.getTime() - d.getTime()) / 86400000);
}

// Vanjske Google karte (bez API ključa): koordinate ako ih ima, inače adresa+grad.
function googleKarteUrl(k: {
  gpsLat: number | null;
  gpsLng: number | null;
  adresa: string | null;
  grad: string | null;
}): string | null {
  if (k.gpsLat != null && k.gpsLng != null) {
    return `https://www.google.com/maps?q=${k.gpsLat},${k.gpsLng}`;
  }
  const adr = [k.adresa, k.grad].filter(Boolean).join(", ");
  if (adr) return `https://www.google.com/maps?q=${encodeURIComponent(adr)}`;
  return null;
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="border border-orange-100 bg-orange-50/40 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
        {label}
      </p>
      <p className="mt-1 text-[15px] font-semibold text-stone-800">
        {value || "-"}
      </p>
    </div>
  );
}

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
      <div className="border-b border-orange-200 pb-3">
        <h2 className="text-[20px] font-semibold text-stone-800">{title}</h2>
        {desc ? <p className="mt-1 text-[13px] text-stone-500">{desc}</p> : null}
      </div>

      <div className="mt-4">{children}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
        {label}
      </p>
      <p className="mt-1 text-[24px] leading-none font-semibold text-stone-800">
        {value}
      </p>
      {note ? <p className="mt-2 text-[12px] text-stone-500">{note}</p> : null}
    </div>
  );
}

export default async function KupacDetaljiPage({ params }: PageProps) {
  const { id } = await params;

  const kupac = await prisma.putnikKupac.findUnique({
    where: { id },
    include: {
      ankete: {
        orderBy: { createdAt: "asc" },
      },
      dogovori: {
        orderBy: { createdAt: "asc" },
      },
      posjeti: {
        orderBy: { datum: "desc" },
        include: {
          stavke: { orderBy: { createdAt: "asc" } },
          promoOtpisi: { include: { artikl: { select: { naziv: true } } } },
          _count: { select: { slike: true } },
        },
      },
      aktivnosti: {
        orderBy: { datum: "desc" },
      },
      promoMaterijali: {
        orderBy: { datumPredaje: "desc" },
        include: { artikl: { select: { naziv: true } } },
      },
    },
  });

  if (!kupac) {
    notFound();
  }

  const user = await getAuthUser();
  const jeAdmin = user?.role === "ADMIN";

  const ankete = kupac.ankete || [];
  const dogovori = kupac.dogovori || [];
  const posjeti = kupac.posjeti || [];
  const aktivnosti = kupac.aktivnosti || [];
  const promoMaterijali = kupac.promoMaterijali || [];
  const ukupnoGratisa = posjeti.reduce(
    (zbroj, p) => zbroj + p.stavke.reduce((a, st) => a + (st.gratis || 0), 0),
    0
  );

  const zadnjaAnketa = ankete[ankete.length - 1] || null;
  const zadnjiDogovor = dogovori[dogovori.length - 1] || null;
  const zadnjiPosjet = posjeti[0] || null; // posjeti su sortirani datum desc
  const jePotencijalni = kupac.status === "POTENCIJALNI";

  const daniOd = daniOdPosjeta(zadnjiPosjet?.datum);
  const kartaUrl = googleKarteUrl(kupac);

  // Za povijest posjeta: danasnji posjet ima galeriju otvorenu (putnik upravo
  // slika), prosli su slozeni. URL-ovi se potpisuju lazy u PosjetGalerija.
  const danasDatum = formatHrDate(new Date());
  const posjetiSaSlikama = posjeti.filter((p) => p._count.slike > 0);

  const eur = (v?: number | null) =>
    v != null ? `${v.toLocaleString("hr-HR")} EUR` : "-";

  const anketaRedovi = [
    { label: "Razina lokala", get: (a: any) => label(a.razinaLokala) },
    { label: "Potencijal", get: (a: any) => label(a.potencijal) },
    { label: "Procjena boca mjesečno", get: (a: any) => a.procjenaBocaMjesecno || "-" },
    { label: "Preporučena akcija", get: (a: any) => label(a.preporucenaAkcija) },
    { label: "Sljedeći korak", get: (a: any) => label(a.sljedeciKorak) },
    { label: "Konkurentske vinarije", get: (a: any) => a.konkurentskeVinarije || "-" },
    { label: "Bilješka", get: (a: any) => a.biljeska || "-" },
  ];

  const daNe = (value?: boolean | null) => (value ? "Da" : "Ne");

  const dogovorRedovi = [
    { label: "Datum dogovora", get: (d: any) => formatDate(d.createdAt) },
    { label: "Status", get: (d: any) => d.status || "-" },
    { label: "Način kupnje", get: (d: any) => d.nacinKupnje || "-" },
    { label: "Kupuje direktno", get: (d: any) => daNe(d.kupujeDirektno) },
    { label: "Preko distributera", get: (d: any) => daNe(d.kupujePrekoDistributera) },
    { label: "Preko veletrgovca", get: (d: any) => daNe(d.kupujePrekoVeletrgovca) },
    { label: "Početna narudžba", get: (d: any) => d.pocetnaNarudzba || "-" },
    { label: "Dogovorena količina", get: (d: any) => d.dogovorenaKolicina || "-" },
    { label: "Dogovorena akcija", get: (d: any) => d.dogovorenaAkcija || "-" },
    { label: "Akcija 6 + 1", get: (d: any) => daNe(d.akcija6Plus1) },
    { label: "Akcija 12 + 2", get: (d: any) => daNe(d.akcija12Plus2) },
    { label: "Akcija 24 + 4", get: (d: any) => daNe(d.akcija24Plus4) },
    { label: "Posebna cijena", get: (d: any) => d.posebnaCijena || "-" },
    { label: "Rabat", get: (d: any) => d.rabat || "-" },
    { label: "Čaše dogovorene", get: (d: any) => daNe(d.caseDogovorene) },
    { label: "Broj čaša", get: (d: any) => d.brojCasa || "-" },
    { label: "Tip čaša", get: (d: any) => d.tipCasa || "-" },
    { label: "Promo dogovoren", get: (d: any) => daNe(d.promoDogovoren) },
    { label: "Vinska karta", get: (d: any) => daNe(d.vinskaKarta) },
    { label: "Plakati", get: (d: any) => daNe(d.plakati) },
    { label: "Letci", get: (d: any) => daNe(d.letci) },
    { label: "Stalci", get: (d: any) => daNe(d.stalci) },
    { label: "Uzorci", get: (d: any) => daNe(d.uzorciDogovoreni) },
    { label: "Edukacija", get: (d: any) => daNe(d.edukacijaDogovorena) },
    { label: "Degustacija", get: (d: any) => daNe(d.degustacijaDogovorena) },
    { label: "Wine party", get: (d: any) => daNe(d.winePartyDogovoren) },
    { label: "Posjet vinariji", get: (d: any) => daNe(d.posjetVinarijiDogovoren) },
    { label: "Uvjeti plaćanja", get: (d: any) => d.uvjetiPlacanja || "-" },
    { label: "Rok plaćanja", get: (d: any) => d.rokPlacanja || "-" },
    { label: "Dostava", get: (d: any) => d.dostava || "-" },
    { label: "Sljedeći kontakt", get: (d: any) => formatDate(d.datumSljedeceg) },
    { label: "Zaključak", get: (d: any) => d.zakljucak || "-" },
    { label: "Napomena", get: (d: any) => d.napomena || "-" },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Općenito (identitet + prodaja/ulaganje + ankete/dogovori)
  // ─────────────────────────────────────────────────────────────────────────
  const opcenitoPanel = (
    <>
      <section className="grid gap-3 md:grid-cols-4">
        <MiniStat label="Status" value={label(kupac.status)} note={`Kategorija ${kupac.kategorija || "-"}`} />
        <MiniStat label="Tip kupca" value={label(kupac.tip)} note={kupac.grad || "-"} />
        <MiniStat label="Ankete" value={String(ankete.length)} note="usporedba stupac do stupca" />
        <MiniStat
          label="Dogovori"
          value={String(dogovori.length)}
          note={zadnjiDogovor?.datumSljedeceg ? `Sljedeće: ${formatDate(zadnjiDogovor.datumSljedeceg)}` : "nema sljedećeg obilaska"}
        />
      </section>

      <Card title="Osnovni podaci kupca">
        <div className="grid gap-3 md:grid-cols-2">
          <Info label="Naziv lokala" value={kupac.nazivLokala} />
          <Info label="Naziv firme" value={kupac.nazivFirme} />
          <Info label="Šifra kupca" value={kupac.sifraKupca} />
          <Info label="OIB" value={kupac.oib} />
          <Info label="Grad" value={kupac.grad} />
          <Info label="Regija" value={kupac.regija} />
        </div>

        <div className="mt-4 border-t border-orange-200 pt-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
            Plaćanje
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Info label="Način plaćanja" value={kupac.nacinPlacanja} />
            <Info label="Garancija plaćanja" value={kupac.garancijaPlacanja} />
            <Info
              label="Kreditni limit"
              value={kupac.kreditniLimit != null ? `${kupac.kreditniLimit.toLocaleString("hr-HR")} EUR` : null}
            />
          </div>
        </div>

        <div className="mt-4 border-t border-orange-200 pt-4">
          <Info label="Napomena" value={kupac.napomena} />
        </div>
      </Card>

      <Card title="Prodaja i ulaganje u kupca" desc="Sažetak iz posjeta: zadnja narudžba, dug i broj obilazaka.">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Broj posjeta" value={posjeti.length} />
          <Info label="Zadnji posjet" value={zadnjiPosjet ? formatDate(zadnjiPosjet.datum) : null} />
          <Info label="Ocjena kupca" value={label(kupac.kategorija)} />
          <Info label="Ukupan dug (zadnji posjet)" value={zadnjiPosjet ? eur(zadnjiPosjet.ukupanDug) : "-"} />
          <Info label="Dospjeli dug (zadnji posjet)" value={zadnjiPosjet ? eur(zadnjiPosjet.dospjeliDug) : "-"} />
          <Info label="Stavki u zadnjoj narudžbi" value={zadnjiPosjet ? zadnjiPosjet.stavke.length : "-"} />
          <Info label="Ukupno gratisa" value={ukupnoGratisa} />
        </div>

        {zadnjiPosjet && zadnjiPosjet.stavke.length > 0 ? (
          <div className="mt-4 border border-orange-100 bg-orange-50/40 p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
              Zadnja narudžba ({formatDate(zadnjiPosjet.datum)})
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {zadnjiPosjet.stavke.map((s) => (
                <span key={s.id} className="inline-flex border border-orange-200 bg-white px-2 py-1 text-[12px] text-stone-700">
                  {s.nazivProizvoda}
                  {s.kolicina != null ? ` — ${s.kolicina} ${s.jedinica || "kom"}` : ""}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 border border-orange-200 bg-white p-4 text-[13px] leading-6 text-stone-600">
            Još nema zabilježenih posjeta. Klikni <strong>📷 Posjet</strong> za unos narudžbe, poklona i zabilješki.
          </div>
        )}
      </Card>

      <Card title="Usporedba anketa" desc="Svaka anketa je novi stupac. Tako se odmah vidi promjena kroz vrijeme.">
        {ankete.length === 0 ? (
          <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
            Anketa još nije ispunjena.
          </div>
        ) : (
          <div className="overflow-x-auto border border-orange-200 bg-white">
            <table className="min-w-[1100px] w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-orange-100/70">
                  <th className="sticky left-0 z-10 border-r border-orange-200 bg-orange-100 px-3 py-3 text-[12px] uppercase tracking-[0.12em] text-orange-900">
                    Stavka
                  </th>
                  {ankete.map((a, index) => (
                    <th key={a.id} className="border-r border-orange-200 px-3 py-3 align-top text-stone-800">
                      <div className="text-[14px] font-semibold">Anketa {index + 1}</div>
                      <div className="text-[12px] font-normal text-stone-500">{formatDate(a.createdAt)}</div>
                      <div className="mt-2 flex gap-1">
                        <Link href={`/putnik/kupci/${kupac.id}/anketa/${a.id}`} className="inline-flex border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-50">
                          Otvori
                        </Link>
                        <Link href={`/putnik/kupci/${kupac.id}/anketa/${a.id}/uredi`} className="inline-flex border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-50">
                          Uredi
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {anketaRedovi.map((row) => (
                  <tr key={row.label} className="border-t border-orange-100">
                    <td className="sticky left-0 z-10 w-[230px] border-r border-orange-200 bg-orange-50 px-3 py-3 font-semibold text-stone-700">
                      {row.label}
                    </td>
                    {ankete.map((a) => (
                      <td key={`${a.id}-${row.label}`} className="min-w-[240px] border-r border-orange-100 px-3 py-3 align-top text-stone-700">
                        {row.get(a)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Usporedba dogovora" desc="Svaki dogovor je novi stupac. Stari i novi dogovor se vide paralelno.">
        {dogovori.length === 0 ? (
          <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
            Nema spremljenih dogovora.
          </div>
        ) : (
          <div className="overflow-x-auto border border-orange-200 bg-white">
            <table className="min-w-[1300px] w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-orange-100/70">
                  <th className="sticky left-0 z-10 border-r border-orange-200 bg-orange-100 px-3 py-3 text-[12px] uppercase tracking-[0.12em] text-orange-900">
                    Stavka
                  </th>
                  {dogovori.map((d, index) => (
                    <th key={d.id} className="border-r border-orange-200 px-3 py-3 align-top text-stone-800">
                      <div className="text-[14px] font-semibold">Dogovor {index + 1}</div>
                      <div className="text-[12px] font-normal text-stone-500">{formatDate(d.createdAt)}</div>
                      <div className="mt-2 flex gap-1">
                        <Link href={`/putnik/kupci/${kupac.id}/dogovor/${d.id}`} className="inline-flex border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-50">
                          Otvori
                        </Link>
                        <Link href={`/putnik/kupci/${kupac.id}/dogovor/${d.id}/uredi`} className="inline-flex border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-50">
                          Uredi
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dogovorRedovi.map((row) => (
                  <tr key={row.label} className="border-t border-orange-100">
                    <td className="sticky left-0 z-10 w-[240px] border-r border-orange-200 bg-orange-50 px-3 py-3 font-semibold text-stone-700">
                      {row.label}
                    </td>
                    {dogovori.map((d) => (
                      <td key={`${d.id}-${row.label}`} className="min-w-[260px] border-r border-orange-100 px-3 py-3 align-top whitespace-pre-wrap text-stone-700">
                        {row.get(d)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card title="Zadnja anketa">
          {zadnjaAnketa ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Datum ankete" value={formatDate(zadnjaAnketa.createdAt)} />
              <Info label="Razina lokala" value={label(zadnjaAnketa.razinaLokala)} />
              <Info label="Potencijal" value={label(zadnjaAnketa.potencijal)} />
              <Info label="Boca mjesečno" value={zadnjaAnketa.procjenaBocaMjesecno} />
              <Info label="Preporučena akcija" value={label(zadnjaAnketa.preporucenaAkcija)} />
              <Info label="Sljedeći korak" value={label(zadnjaAnketa.sljedeciKorak)} />
              <div className="md:col-span-2">
                <Info label="Bilješka" value={zadnjaAnketa.biljeska} />
              </div>
            </div>
          ) : (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">Nema ankete.</div>
          )}
        </Card>

        <Card title="Zadnji dogovor">
          {zadnjiDogovor ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Datum" value={formatDate(zadnjiDogovor.createdAt)} />
                <Info label="Status" value={zadnjiDogovor.status} />
                <Info label="Akcija" value={zadnjiDogovor.dogovorenaAkcija} />
                <Info label="Sljedeći kontakt" value={formatDate(zadnjiDogovor.datumSljedeceg)} />
              </div>
              <div className="border border-orange-100 bg-orange-50/40 p-3 text-[13px] leading-6 text-stone-700">
                <strong>Zaključak:</strong>
                <br />
                {zadnjiDogovor.zakljucak || zadnjiDogovor.napomena || "-"}
              </div>
            </div>
          ) : (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">Nema dogovora.</div>
          )}
        </Card>
      </section>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Povijest (GLAVNO — kronološki, prodano/poklon/dogovoreno, razgrni)
  // ─────────────────────────────────────────────────────────────────────────
  const povijestPanel = (
    <Card title="Povijest posjeta" desc="Kronološki — što je lokal kupio, dobio na poklon i dogovorio. Klikni posjet za detalje.">
      {posjeti.length === 0 ? (
        <div className="border border-orange-200 bg-white px-4 py-6 text-center text-[14px] text-stone-500">
          Nema zabilježenih posjeta. Klikni <strong>📷 Posjet</strong> za prvi unos.
        </div>
      ) : (
        <div className="space-y-2.5">
          {posjeti.map((p, idx) => {
            const traj = trajanje(p.vrijemeOd, p.vrijemeDo);
            const { prodano, dogovoreno, poklon } = razvrstajStavke(p.stavke);
            const promoPokloni: Redak[] = p.promoOtpisi.map((o) => ({
              naziv: o.artikl?.naziv || o.naziv || "promo",
              kolicina: o.kolicina,
              jedinica: "kom",
            }));
            const sviPokloni = [...poklon, ...promoPokloni];
            const imaSlika = p._count.slike > 0;
            const prazno = prodano.length + sviPokloni.length + dogovoreno.length === 0;
            return (
              <details key={p.id} open={idx === 0} className="group border border-orange-200 bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3 marker:content-['']">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold text-stone-800">
                      {formatDate(p.datum)}
                      {p.putnikIme ? <span className="ml-2 text-[12px] font-normal text-stone-400">({p.putnikIme})</span> : null}
                    </div>
                    {p.razlogPosjeta ? (
                      <div className="mt-0.5 text-[13px] text-stone-600">
                        <span className="font-semibold text-stone-500">Razlog:</span> {p.razlogPosjeta}
                      </div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {prodano.length ? <Chip boja="green">🛒 Prodano {prodano.length}</Chip> : null}
                      {sviPokloni.length ? <Chip boja="amber">🎁 Poklon {sviPokloni.length}</Chip> : null}
                      {dogovoreno.length ? <Chip boja="orange">📦 Dogovoreno {dogovoreno.length}</Chip> : null}
                      {prazno ? <span className="text-[13px] text-stone-400">bez narudžbe</span> : null}
                      {traj ? <Chip boja="stone">⏱ {traj}</Chip> : null}
                      {imaSlika ? <Chip boja="stone">📷 {p._count.slike}</Chip> : null}
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-orange-800/70">
                    <span className="group-open:hidden">otvori ▾</span>
                    <span className="hidden group-open:inline">zatvori ▴</span>
                  </span>
                </summary>

                <div className="space-y-3 border-t border-orange-100 p-3">
                  {p.razlogPosjeta ? (
                    <div className="border border-orange-200 bg-white px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
                        Razlog posjeta
                      </div>
                      <div className="mt-0.5 text-[14px] whitespace-pre-wrap text-stone-800">
                        {p.razlogPosjeta}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-3">
                    <SkupinaLista naslov="Prodano" boja="green" items={prodano} />
                    <SkupinaLista naslov="Poklon / gratis" boja="amber" items={sviPokloni} />
                    <SkupinaLista naslov="Dogovoreno (isporuka)" boja="orange" items={dogovoreno} />
                  </div>

                  {p.vrijemeOd || p.vrijemeDo ? (
                    <div className="text-[12px] text-stone-500">
                      Vrijeme: {p.vrijemeOd || "?"}–{p.vrijemeDo || "?"}
                      {traj ? ` · ${traj}` : ""}
                    </div>
                  ) : null}

                  {p.biljeska ? (
                    <div className="border border-orange-100 bg-orange-50/40 px-3 py-2 text-[13px] whitespace-pre-wrap text-stone-700">
                      {p.biljeska}
                    </div>
                  ) : null}

                  {imaSlika ? (
                    <PosjetGalerija posjetId={p.id} brojSlika={p._count.slike} defaultOpen={formatHrDate(p.datum) === danasDatum} />
                  ) : null}

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/putnik/kupci/${kupac.id}/posjet/${p.id}/uredi`}
                      className="inline-flex border border-orange-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-orange-900 hover:bg-orange-50"
                    >
                      Uredi posjet · 📷
                    </Link>
                    <span className="text-[11px] text-stone-400">Upisano: {formatHrDateTime(p.createdAt)}</span>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Aktivnosti (dnevnik praćenja + primljeni promo)
  // ─────────────────────────────────────────────────────────────────────────
  const aktivnostiPanel = (
    <>
      <Card
        title="Dnevnik aktivnosti praćenja"
        desc={jePotencijalni ? "Potencijalni kupac — praćenje aktivnosti do zaključenja." : "Praćenje aktivnosti (poglavito za potencijalne kupce)."}
      >
        {aktivnosti.length === 0 ? (
          <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
            Nema zabilježenih aktivnosti. Klikni <strong>Nova aktivnost</strong> za prvi unos.
          </div>
        ) : (
          <div className="space-y-3">
            {aktivnosti.map((a) => (
              <div key={a.id} className="border border-orange-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100 pb-2">
                  <div className="text-[15px] font-semibold text-stone-800">
                    Datum: {formatDate(a.datum)}
                    {a.tko ? <span className="ml-2 text-[12px] font-normal text-stone-500">{a.tko}</span> : null}
                    {a.putnikIme ? <span className="ml-2 text-[12px] font-normal text-stone-400">({a.putnikIme})</span> : null}
                    <div className="text-[11px] font-normal text-stone-400">Upisano: {formatHrDateTime(a.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.vjerojatnostZakljucenja != null ? (
                      <span className="inline-flex border border-green-200 bg-green-50 px-2 py-1 text-[12px] font-semibold text-green-700">
                        Vjerojatnost: {a.vjerojatnostZakljucenja}%
                      </span>
                    ) : null}
                    <Link href={`/putnik/kupci/${kupac.id}/aktivnost/${a.id}/uredi`} className="inline-flex border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-50">
                      Uredi
                    </Link>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Info label="Opis" value={a.opis} />
                  <Info label="Što nastaviti" value={a.stoNastaviti} />
                  <Info label="Sljedeća aktivnost" value={a.sljedecaAktivnost} />
                  <Info label="Datum sljedeće" value={a.datumSljedece ? formatDate(a.datumSljedece) : null} />
                </div>
                {a.zabiljeska ? (
                  <div className="mt-3 border border-orange-100 bg-orange-50/40 px-3 py-2 text-[13px] whitespace-pre-wrap text-stone-700">
                    {a.zabiljeska}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Promo materijal (dobiveno)" desc="Što je lokal dobio iz promo zalihe.">
        <div className="mb-3">
          <Link href={`/putnik/promo?kupac=${kupac.id}`} className="inline-flex border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105">
            Otpiši promo
          </Link>
        </div>
        {promoMaterijali.length === 0 ? (
          <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
            Još nema otpisanog promo materijala.
          </div>
        ) : (
          <div className="space-y-1 text-[13px]">
            {promoMaterijali.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border border-orange-100 bg-white px-3 py-2">
                <span>
                  <strong>{p.artikl?.naziv || p.naziv || "—"}</strong> ×{p.kolicina}
                  <span className="ml-2 text-stone-500">{formatDate(p.datumPredaje)}</span>
                  {p.otpisaoKorisnikIme ? <span className="ml-2 text-stone-400">({p.otpisaoKorisnikIme})</span> : null}
                </span>
                <span className="text-[11px] text-stone-400">Upisano: {formatHrDateTime(p.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Kontakti (osobe + adresa)
  // ─────────────────────────────────────────────────────────────────────────
  const kontaktiPanel = (
    <Card title="Kontakti" desc="Osobe i adresa lokala.">
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="Vlasnik" value={kupac.vlasnik} />
        <Info label="Kontakt osoba" value={kupac.kontaktOsoba} />
        <Info label="Telefon" value={kupac.telefon} />
        <Info label="Email" value={kupac.email} />
        <Info label="Adresa" value={kupac.adresa} />
        <Info label="Grad" value={kupac.grad} />
      </div>

      <div className="mt-4 border-t border-orange-200 pt-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
          Odgovorne osobe
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Info label="Narudžba — osoba" value={kupac.narudzbaOsoba} />
          <Info label="Narudžba — telefon" value={kupac.narudzbaTelefon} />
          <Info label="Narudžba — email" value={kupac.narudzbaEmail} />
          <Info label="Naplata — osoba" value={kupac.naplataOsoba} />
          <Info label="Naplata — telefon" value={kupac.naplataTelefon} />
          <Info label="Naplata — email" value={kupac.naplataEmail} />
        </div>
      </div>
    </Card>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Karta (vanjske Google karte, bez API ključa)
  // ─────────────────────────────────────────────────────────────────────────
  const kartaPanel = (
    <Card title="Lokacija i karta" desc="Otvori lokal u Google kartama (vanjska aplikacija, bez ugrađene karte).">
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="Adresa" value={kupac.adresa} />
        <Info label="Grad" value={kupac.grad} />
        <Info label="Koordinate" value={kupac.gpsLat != null && kupac.gpsLng != null ? `${kupac.gpsLat}, ${kupac.gpsLng}` : null} />
        <Info
          label="Dana od zadnjeg posjeta"
          value={daniOd == null ? "Bez posjeta" : daniOd === 0 ? "Danas" : `${daniOd} dana`}
        />
      </div>

      <div className="mt-4">
        {kartaUrl ? (
          <a
            href={kartaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-orange-500 bg-gradient-to-b from-orange-500 to-amber-600 px-5 py-3 text-[15px] font-bold text-white shadow-sm hover:brightness-105"
          >
            📍 Otvori u Google kartama
          </a>
        ) : (
          <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
            Nema koordinata ni adrese za ovaj lokal — dodaj ih preko <strong>Uredi kupca</strong>.
          </div>
        )}
        {kupac.gpsLat != null && kupac.gpsLng != null ? (
          <p className="mt-2 text-[12px] text-stone-500">Otvara koordinate lokala.</p>
        ) : kartaUrl ? (
          <p className="mt-2 text-[12px] text-stone-500">Nema koordinata — otvara pretragu po adresi.</p>
        ) : null}
      </div>
    </Card>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Slike (galerije svih posjeta koji imaju slike)
  // ─────────────────────────────────────────────────────────────────────────
  const slikePanel = (
    <Card title="Slike posjeta" desc="Fotografije s terena, grupirane po posjetu.">
      {posjetiSaSlikama.length === 0 ? (
        <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
          Još nema fotografija. Slikaj kod <strong>📷 Posjet</strong>.
        </div>
      ) : (
        <div className="space-y-3">
          {posjetiSaSlikama.map((p) => (
            <div key={p.id} className="border border-orange-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[15px] font-semibold text-stone-800">
                  {formatDate(p.datum)}
                  {p.putnikIme ? <span className="ml-2 text-[12px] font-normal text-stone-500">({p.putnikIme})</span> : null}
                </div>
                <span className="inline-flex border border-orange-200 bg-orange-50 px-2 py-1 text-[12px] font-semibold text-orange-800">
                  📷 {p._count.slike}
                </span>
              </div>
              <PosjetGalerija posjetId={p.id} brojSlika={p._count.slike} defaultOpen={formatHrDate(p.datum) === danasDatum} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const tabovi: TabDef[] = [
    { id: "povijest", label: "Povijest", ikona: "🗓️", panel: povijestPanel },
    { id: "opcenito", label: "Općenito", ikona: "📋", panel: opcenitoPanel },
    { id: "aktivnosti", label: "Aktivnosti", ikona: "📈", panel: aktivnostiPanel },
    { id: "kontakti", label: "Kontakti", ikona: "👤", panel: kontaktiPanel },
    { id: "karta", label: "Karta", ikona: "📍", panel: kartaPanel },
    { id: "slike", label: "Slike", ikona: "📷", panel: slikePanel },
  ];

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1200px] space-y-4">
        <header className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <Link href="/putnik" className="text-[12px] font-semibold text-orange-800/80 hover:underline">
                ← Moji lokali
              </Link>

              <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-stone-800">
                {kupac.nazivLokala}
              </h1>

              <div className="mt-1 text-[13px] text-stone-500">
                {[kupac.grad, kupac.nazivFirme].filter(Boolean).join(" · ") || "Lokal"}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!kupac.aktivan ? (
                  <span className="inline-flex border border-stone-400 bg-stone-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                    Neaktivan lokal
                  </span>
                ) : null}
                {daniOd != null ? (
                  <span
                    className={`inline-flex border px-2 py-1 text-[11px] font-semibold ${
                      daniOd > 30 ? "border-red-300 bg-red-50 text-red-700" : "border-orange-200 bg-orange-50 text-orange-800"
                    }`}
                  >
                    {daniOd === 0 ? "Danas posjećen" : `${daniOd} dana od zadnjeg posjeta`}
                  </span>
                ) : (
                  <span className="inline-flex border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-500">
                    Bez posjeta
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 md:items-end">
              {/* Brze akcije: Posjet (glavno, umjereno) + Karte + Uredi */}
              <div className="flex flex-wrap gap-2 md:justify-end">
                <form action={otvoriDanasnjiPosjet}>
                  <input type="hidden" name="kupacId" value={kupac.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 border border-orange-500 bg-gradient-to-b from-orange-500 to-amber-600 px-5 py-2.5 text-[15px] font-bold text-white shadow-sm hover:brightness-105"
                  >
                    📷 Posjet
                  </button>
                </form>
                {kartaUrl ? (
                  <a href={kartaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center border border-orange-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-stone-700 hover:bg-orange-50">
                    📍 Karte
                  </a>
                ) : null}
                <Link href={`/putnik/kupci/${kupac.id}/uredi`} className="inline-flex items-center border border-orange-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-stone-700 hover:bg-orange-50">
                  Uredi
                </Link>
              </div>

              {/* Sitne sekundarne akcije */}
              <div className="flex flex-wrap gap-1.5 md:justify-end">
                <Link href={`/putnik/kupci/${kupac.id}/anketa/nova`} className="border border-orange-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-stone-600 hover:bg-orange-50">
                  + Anketa
                </Link>
                <Link href={`/putnik/kupci/${kupac.id}/dogovor/novi`} className="border border-orange-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-stone-600 hover:bg-orange-50">
                  + Dogovor
                </Link>
                <Link href={`/putnik/kupci/${kupac.id}/aktivnost/nova`} className="border border-orange-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-stone-600 hover:bg-orange-50">
                  + Aktivnost
                </Link>
                {jeAdmin ? (
                  <form action={postaviAktivanKupca}>
                    <input type="hidden" name="id" value={kupac.id} />
                    <input type="hidden" name="aktivan" value={kupac.aktivan ? "false" : "true"} />
                    <button
                      type="submit"
                      className={
                        kupac.aktivan
                          ? "border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-stone-600 hover:bg-stone-100"
                          : "border border-green-500 bg-green-50 px-2.5 py-1 text-[12px] font-semibold text-green-800 hover:brightness-105"
                      }
                    >
                      {kupac.aktivan ? "Deaktiviraj" : "Aktiviraj"}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <KupacTabovi tabovi={tabovi} />
      </div>
    </main>
  );
}
