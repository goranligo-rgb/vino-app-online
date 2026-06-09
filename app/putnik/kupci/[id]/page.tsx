import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatHrDateTime } from "@/lib/datum";

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

function StatusDatum({ datum }: { datum?: Date | null }) {
  if (!datum) {
    return (
      <span className="inline-flex border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600">
        Nema datuma
      </span>
    );
  }

  const danas = new Date();
  danas.setHours(0, 0, 0, 0);

  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);

  const razlikaDana = Math.round((d.getTime() - danas.getTime()) / 86400000);

  if (razlikaDana < 0) {
    return (
      <span className="inline-flex border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
        Kasni: {formatDate(datum)}
      </span>
    );
  }

  if (razlikaDana === 0) {
    return (
      <span className="inline-flex border border-orange-300 bg-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-900">
        Danas: {formatDate(datum)}
      </span>
    );
  }

  if (razlikaDana <= 7) {
    return (
      <span className="inline-flex border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-800">
        Uskoro: {formatDate(datum)}
      </span>
    );
  }

  return (
    <span className="inline-flex border border-green-300 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
      {formatDate(datum)}
    </span>
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
        },
      },
      aktivnosti: {
        orderBy: { datum: "desc" },
      },
    },
  });

  if (!kupac) {
    notFound();
  }

  const ankete = kupac.ankete || [];
  const dogovori = kupac.dogovori || [];
  const posjeti = kupac.posjeti || [];
  const aktivnosti = kupac.aktivnosti || [];

  const zadnjaAnketa = ankete[ankete.length - 1] || null;
  const zadnjiDogovor = dogovori[dogovori.length - 1] || null;
  const zadnjiPosjet = posjeti[0] || null; // posjeti su sortirani datum desc
  const jePotencijalni = kupac.status === "POTENCIJALNI";

  const eur = (v?: number | null) =>
    v != null ? `${v.toLocaleString("hr-HR")} EUR` : "-";

  const anketaRedovi = [
    {
      label: "Razina lokala",
      get: (a: any) => label(a.razinaLokala),
    },
    {
      label: "Potencijal",
      get: (a: any) => label(a.potencijal),
    },
    {
      label: "Procjena boca mjesečno",
      get: (a: any) => a.procjenaBocaMjesecno || "-",
    },
    {
      label: "Preporučena akcija",
      get: (a: any) => label(a.preporucenaAkcija),
    },
    {
      label: "Sljedeći korak",
      get: (a: any) => label(a.sljedeciKorak),
    },
    {
      label: "Konkurentske vinarije",
      get: (a: any) => a.konkurentskeVinarije || "-",
    },
    {
      label: "Bilješka",
      get: (a: any) => a.biljeska || "-",
    },
  ];

  const daNe = (value?: boolean | null) => (value ? "Da" : "Ne");

  const dogovorRedovi = [
    {
      label: "Datum dogovora",
      get: (d: any) => formatDate(d.createdAt),
    },
    {
      label: "Status",
      get: (d: any) => d.status || "-",
    },
    {
      label: "Način kupnje",
      get: (d: any) => d.nacinKupnje || "-",
    },
    {
      label: "Kupuje direktno",
      get: (d: any) => daNe(d.kupujeDirektno),
    },
    {
      label: "Preko distributera",
      get: (d: any) => daNe(d.kupujePrekoDistributera),
    },
    {
      label: "Preko veletrgovca",
      get: (d: any) => daNe(d.kupujePrekoVeletrgovca),
    },
    {
      label: "Početna narudžba",
      get: (d: any) => d.pocetnaNarudzba || "-",
    },
    {
      label: "Dogovorena količina",
      get: (d: any) => d.dogovorenaKolicina || "-",
    },
    {
      label: "Dogovorena akcija",
      get: (d: any) => d.dogovorenaAkcija || "-",
    },
    {
      label: "Akcija 6 + 1",
      get: (d: any) => daNe(d.akcija6Plus1),
    },
    {
      label: "Akcija 12 + 2",
      get: (d: any) => daNe(d.akcija12Plus2),
    },
    {
      label: "Akcija 24 + 4",
      get: (d: any) => daNe(d.akcija24Plus4),
    },
    {
      label: "Posebna cijena",
      get: (d: any) => d.posebnaCijena || "-",
    },
    {
      label: "Rabat",
      get: (d: any) => d.rabat || "-",
    },
    {
      label: "Čaše dogovorene",
      get: (d: any) => daNe(d.caseDogovorene),
    },
    {
      label: "Broj čaša",
      get: (d: any) => d.brojCasa || "-",
    },
    {
      label: "Tip čaša",
      get: (d: any) => d.tipCasa || "-",
    },
    {
      label: "Promo dogovoren",
      get: (d: any) => daNe(d.promoDogovoren),
    },
    {
      label: "Vinska karta",
      get: (d: any) => daNe(d.vinskaKarta),
    },
    {
      label: "Plakati",
      get: (d: any) => daNe(d.plakati),
    },
    {
      label: "Letci",
      get: (d: any) => daNe(d.letci),
    },
    {
      label: "Stalci",
      get: (d: any) => daNe(d.stalci),
    },
    {
      label: "Uzorci",
      get: (d: any) => daNe(d.uzorciDogovoreni),
    },
    {
      label: "Edukacija",
      get: (d: any) => daNe(d.edukacijaDogovorena),
    },
    {
      label: "Degustacija",
      get: (d: any) => daNe(d.degustacijaDogovorena),
    },
    {
      label: "Wine party",
      get: (d: any) => daNe(d.winePartyDogovoren),
    },
    {
      label: "Posjet vinariji",
      get: (d: any) => daNe(d.posjetVinarijiDogovoren),
    },
    {
      label: "Uvjeti plaćanja",
      get: (d: any) => d.uvjetiPlacanja || "-",
    },
    {
      label: "Rok plaćanja",
      get: (d: any) => d.rokPlacanja || "-",
    },
    {
      label: "Dostava",
      get: (d: any) => d.dostava || "-",
    },
    {
      label: "Sljedeći kontakt",
      get: (d: any) => formatDate(d.datumSljedeceg),
    },
    {
      label: "Zaključak",
      get: (d: any) => d.zakljucak || "-",
    },
    {
      label: "Napomena",
      get: (d: any) => d.napomena || "-",
    },
  ];

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-orange-800/70">
                Putnik / teren CRM
              </div>

              <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-stone-800">
                {kupac.nazivLokala}
              </h1>

              <div className="mt-1 text-[13px] text-stone-500">
                Pregled kupca kroz vrijeme: ankete, dogovori, prodaja i ulaganje.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/putnik"
                className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
              >
                Natrag
              </Link>

              <Link
                href={`/putnik/kupci/${kupac.id}/uredi`}
                className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
              >
                Uredi kupca
              </Link>

              <Link
                href={`/putnik/kupci/${kupac.id}/anketa/nova`}
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
              >
                Nova anketa
              </Link>

              <Link
                href={`/putnik/kupci/${kupac.id}/dogovor/novi`}
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
              >
                Novi dogovor
              </Link>

              <Link
                href={`/putnik/kupci/${kupac.id}/posjet/novi`}
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
              >
                Novi posjet
              </Link>

              <Link
                href={`/putnik/kupci/${kupac.id}/aktivnost/nova`}
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
              >
                Nova aktivnost
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <MiniStat
            label="Status"
            value={label(kupac.status)}
            note={`Kategorija ${kupac.kategorija || "-"}`}
          />

          <MiniStat
            label="Tip kupca"
            value={label(kupac.tip)}
            note={kupac.grad || "-"}
          />

          <MiniStat
            label="Ankete"
            value={String(ankete.length)}
            note="usporedba stupac do stupca"
          />

          <MiniStat
            label="Dogovori"
            value={String(dogovori.length)}
            note={
              zadnjiDogovor?.datumSljedeceg
                ? `Sljedeće: ${formatDate(zadnjiDogovor.datumSljedeceg)}`
                : "nema sljedećeg obilaska"
            }
          />
        </section>

        <Card
          title="Usporedba anketa"
          desc="Svaka anketa je novi stupac. Tako se odmah vidi promjena kroz vrijeme."
        >
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
                      <th
                        key={a.id}
                        className="border-r border-orange-200 px-3 py-3 align-top text-stone-800"
                      >
                        <div className="text-[14px] font-semibold">
                          Anketa {index + 1}
                        </div>

                        <div className="text-[12px] font-normal text-stone-500">
                          {formatDate(a.createdAt)}
                        </div>

                        <Link
                          href={`/putnik/kupci/${kupac.id}/anketa/${a.id}`}
                          className="mt-2 inline-flex border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-50"
                        >
                          Otvori
                        </Link>
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
                        <td
                          key={`${a.id}-${row.label}`}
                          className="min-w-[240px] border-r border-orange-100 px-3 py-3 align-top text-stone-700"
                        >
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

        <Card
          title="Usporedba dogovora"
          desc="Svaki dogovor je novi stupac. Stari i novi dogovor se vide paralelno."
        >
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
                      <th
                        key={d.id}
                        className="border-r border-orange-200 px-3 py-3 align-top text-stone-800"
                      >
                        <div className="text-[14px] font-semibold">
                          Dogovor {index + 1}
                        </div>

                        <div className="text-[12px] font-normal text-stone-500">
                          {formatDate(d.createdAt)}
                        </div>

                        <Link
                          href={`/putnik/kupci/${kupac.id}/dogovor/${d.id}`}
                          className="mt-2 inline-flex border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-50"
                        >
                          Otvori
                        </Link>
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
                        <td
                          key={`${d.id}-${row.label}`}
                          className="min-w-[260px] border-r border-orange-100 px-3 py-3 align-top whitespace-pre-wrap text-stone-700"
                        >
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

        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card title="Osnovni podaci kupca">
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Naziv lokala" value={kupac.nazivLokala} />
              <Info label="Naziv firme" value={kupac.nazivFirme} />
              <Info label="Šifra kupca" value={kupac.sifraKupca} />
              <Info label="Vlasnik" value={kupac.vlasnik} />
              <Info label="Kontakt osoba" value={kupac.kontaktOsoba} />
              <Info label="Telefon" value={kupac.telefon} />
              <Info label="Email" value={kupac.email} />
              <Info label="Adresa" value={kupac.adresa} />
              <Info label="Grad" value={kupac.grad} />
              <Info label="Regija" value={kupac.regija} />
              <Info label="OIB" value={kupac.oib} />
            </div>

            <div className="mt-4 border-t border-orange-200 pt-4">
              <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                Odgovorne osobe i plaćanje
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Info
                  label="Narudžba"
                  value={[kupac.narudzbaOsoba, kupac.narudzbaTelefon, kupac.narudzbaEmail].filter(Boolean).join(" · ") || null}
                />
                <Info
                  label="Naplata"
                  value={[kupac.naplataOsoba, kupac.naplataTelefon, kupac.naplataEmail].filter(Boolean).join(" · ") || null}
                />
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

          <Card
            title="Prodaja i ulaganje u kupca"
            desc="Sažetak iz posjeta: zadnja narudžba, dug i broj obilazaka."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Broj posjeta" value={posjeti.length} />
              <Info
                label="Zadnji posjet"
                value={zadnjiPosjet ? formatDate(zadnjiPosjet.datum) : null}
              />
              <Info label="Ocjena kupca" value={label(kupac.kategorija)} />
              <Info
                label="Ukupan dug (zadnji posjet)"
                value={zadnjiPosjet ? eur(zadnjiPosjet.ukupanDug) : "-"}
              />
              <Info
                label="Dospjeli dug (zadnji posjet)"
                value={zadnjiPosjet ? eur(zadnjiPosjet.dospjeliDug) : "-"}
              />
              <Info
                label="Stavki u zadnjoj narudžbi"
                value={zadnjiPosjet ? zadnjiPosjet.stavke.length : "-"}
              />
            </div>

            {zadnjiPosjet && zadnjiPosjet.stavke.length > 0 ? (
              <div className="mt-4 border border-orange-100 bg-orange-50/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                  Zadnja narudžba ({formatDate(zadnjiPosjet.datum)})
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {zadnjiPosjet.stavke.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex border border-orange-200 bg-white px-2 py-1 text-[12px] text-stone-700"
                    >
                      {s.nazivProizvoda}
                      {s.kolicina != null
                        ? ` — ${s.kolicina} ${s.jedinica || "kom"}`
                        : ""}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 border border-orange-200 bg-white p-4 text-[13px] leading-6 text-stone-600">
                Još nema zabilježenih posjeta. Klikni <strong>Novi posjet</strong> za
                unos narudžbe, ostavljenog materijala i duga.
              </div>
            )}
          </Card>
        </section>

        <Card
          title="Povijest posjeta"
          desc="Svaki posjet po datumu: narudžba, ostavljen materijal, dug i zabilješke."
        >
          {posjeti.length === 0 ? (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
              Nema zabilježenih posjeta.
            </div>
          ) : (
            <div className="space-y-3">
              {posjeti.map((p) => (
                <div key={p.id} className="border border-orange-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100 pb-2">
                    <div className="text-[15px] font-semibold text-stone-800">
                      Datum posjeta: {formatDate(p.datum)}
                      {p.putnikIme ? (
                        <span className="ml-2 text-[12px] font-normal text-stone-500">
                          ({p.putnikIme})
                        </span>
                      ) : null}
                      <div className="text-[11px] font-normal text-stone-400">
                        Upisano: {formatHrDateTime(p.createdAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[12px]">
                      <span className="inline-flex border border-orange-200 bg-orange-50 px-2 py-1 font-semibold text-orange-900">
                        Ukupan dug: {eur(p.ukupanDug)}
                      </span>
                      <span className="inline-flex border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700">
                        Dospjelo: {eur(p.dospjeliDug)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                        Narudžba
                      </div>
                      {p.stavke.length === 0 ? (
                        <div className="mt-1 text-[13px] text-stone-500">
                          (bez narudžbe)
                        </div>
                      ) : (
                        <ul className="mt-1 space-y-1 text-[13px] text-stone-700">
                          {p.stavke.map((s) => (
                            <li key={s.id}>
                              • {s.nazivProizvoda}
                              {s.kolicina != null
                                ? ` — ${s.kolicina} ${s.jedinica || "kom"}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Info label="Ostavljen reklamni materijal" value={p.reklamniMaterijal} />
                      {p.biljeska ? (
                        <div className="border border-orange-100 bg-orange-50/40 px-3 py-2 text-[13px] whitespace-pre-wrap text-stone-700">
                          {p.biljeska}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Dnevnik aktivnosti praćenja"
          desc={
            jePotencijalni
              ? "Potencijalni kupac — praćenje aktivnosti do zaključenja."
              : "Praćenje aktivnosti (poglavito za potencijalne kupce)."
          }
        >
          {aktivnosti.length === 0 ? (
            <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
              Nema zabilježenih aktivnosti. Klikni <strong>Nova aktivnost</strong> za
              prvi unos.
            </div>
          ) : (
            <div className="space-y-3">
              {aktivnosti.map((a) => (
                <div key={a.id} className="border border-orange-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100 pb-2">
                    <div className="text-[15px] font-semibold text-stone-800">
                      Datum: {formatDate(a.datum)}
                      {a.tko ? (
                        <span className="ml-2 text-[12px] font-normal text-stone-500">
                          {a.tko}
                        </span>
                      ) : null}
                      {a.putnikIme ? (
                        <span className="ml-2 text-[12px] font-normal text-stone-400">
                          ({a.putnikIme})
                        </span>
                      ) : null}
                      <div className="text-[11px] font-normal text-stone-400">
                        Upisano: {formatHrDateTime(a.createdAt)}
                      </div>
                    </div>
                    {a.vjerojatnostZakljucenja != null ? (
                      <span className="inline-flex border border-green-200 bg-green-50 px-2 py-1 text-[12px] font-semibold text-green-700">
                        Vjerojatnost: {a.vjerojatnostZakljucenja}%
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Info label="Opis" value={a.opis} />
                    <Info label="Što nastaviti" value={a.stoNastaviti} />
                    <Info label="Sljedeća aktivnost" value={a.sljedecaAktivnost} />
                    <Info
                      label="Datum sljedeće"
                      value={a.datumSljedece ? formatDate(a.datumSljedece) : null}
                    />
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
              <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
                Nema ankete.
              </div>
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
              <div className="border border-orange-200 bg-white px-4 py-3 text-[13px] text-stone-500">
                Nema dogovora.
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}