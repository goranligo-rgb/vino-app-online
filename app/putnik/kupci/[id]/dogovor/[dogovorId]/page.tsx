import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
    dogovorId: string;
  }>;
};

function formatDate(value?: Date | string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function value(value?: string | number | boolean | Date | null) {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "boolean") return value ? "Da" : "Ne";
  return String(value);
}

function Oznaka({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-900">
      {children}
    </span>
  );
}

function Section({
  broj,
  naslov,
  opis,
  children,
}: {
  broj: number;
  naslov: string;
  opis?: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-orange-200 pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
            Dogovor {broj.toString().padStart(2, "0")}
          </div>

          <h2 className="mt-1 text-[20px] font-semibold text-stone-800">
            {naslov}
          </h2>

          {opis ? (
            <div className="mt-1 text-[13px] text-stone-500">{opis}</div>
          ) : null}
        </div>

        <Oznaka>{broj}</Oznaka>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border border-orange-100 bg-orange-50/40 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
        {label}
      </div>

      <div className="mt-1 whitespace-pre-wrap text-[15px] font-semibold leading-6 text-stone-800">
        {children || "-"}
      </div>
    </div>
  );
}

function DaNe({
  label,
  checked,
}: {
  label: string;
  checked?: boolean | null;
}) {
  return (
    <div
      className={`flex min-h-[48px] items-center justify-between gap-3 border px-3 py-3 text-[13px] font-semibold ${
        checked
          ? "border-green-300 bg-green-50 text-green-800"
          : "border-orange-200 bg-white text-stone-500"
      }`}
    >
      <span>{label}</span>
      <span>{checked ? "Da" : "Ne"}</span>
    </div>
  );
}

export default async function DogovorDetaljiPage({ params }: PageProps) {
  const { id, dogovorId } = await params;

  const dogovor = await prisma.putnikDogovor.findUnique({
    where: { id: dogovorId },
    include: {
      kupac: true,
    },
  });

  if (!dogovor || dogovor.kupacId !== id) {
    notFound();
  }

  const kupac = dogovor.kupac;

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-orange-800/70">
                Arhiva dogovora
              </div>

              <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-stone-800">
                {kupac.nazivLokala}
              </h1>

              <div className="mt-1 text-[13px] text-stone-500">
                Dogovor od {formatDate(dogovor.createdAt)} — prikaz kao ispunjeni obrazac
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/putnik"
                className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
              >
                Putnik
              </Link>

              <Link
                href={`/putnik/kupci/${kupac.id}`}
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-2 text-[13px] font-semibold text-orange-950 hover:brightness-105"
              >
                Nazad na lokal
              </Link>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          <Section
            broj={1}
            naslov="Podaci lokala"
            opis="Podaci povučeni iz kartice kupca."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Info label="Naziv lokala">{value(kupac.nazivLokala)}</Info>
              <Info label="Naziv firme">{value(kupac.nazivFirme)}</Info>
              <Info label="Vlasnik">{value(kupac.vlasnik)}</Info>
              <Info label="Kontakt osoba">{value(kupac.kontaktOsoba)}</Info>
              <Info label="Telefon">{value(kupac.telefon)}</Info>
              <Info label="Email">{value(kupac.email)}</Info>
              <Info label="OIB">{value(kupac.oib)}</Info>
              <Info label="Adresa">{value(kupac.adresa)}</Info>
              <Info label="Grad">{value(kupac.grad)}</Info>
              <Info label="Regija">{value(kupac.regija)}</Info>
            </div>
          </Section>

          <Section broj={2} naslov="Način kupnje">
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Način kupnje">{value(dogovor.nacinKupnje)}</Info>
              <Info label="Minimalna narudžba / uvjet">
                {value(dogovor.minimalnaNarudzba)}
              </Info>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <DaNe label="Želi kupovati direktno" checked={dogovor.kupujeDirektno} />
              <DaNe label="Želi preko distributera" checked={dogovor.kupujePrekoDistributera} />
              <DaNe label="Želi preko veletrgovca" checked={dogovor.kupujePrekoVeletrgovca} />
            </div>
          </Section>

          <Section broj={3} naslov="Početna narudžba">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Početna narudžba">{value(dogovor.pocetnaNarudzba)}</Info>
              <Info label="Dogovorena količina">{value(dogovor.dogovorenaKolicina)}</Info>
              <Info label="Dogovorena akcija">{value(dogovor.dogovorenaAkcija)}</Info>
            </div>
          </Section>

          <Section broj={4} naslov="Akcija i cijena">
            <div className="grid gap-3 md:grid-cols-4">
              <DaNe label="6 + 1" checked={dogovor.akcija6Plus1} />
              <DaNe label="12 + 2" checked={dogovor.akcija12Plus2} />
              <DaNe label="24 + 4" checked={dogovor.akcija24Plus4} />
              <DaNe label="Posebna cijena" checked={dogovor.posebnaCijenaDogovorena} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Posebna cijena / dogovorena cijena">
                {value(dogovor.posebnaCijena)}
              </Info>
              <Info label="Rabat / popust">{value(dogovor.rabat)}</Info>
            </div>
          </Section>

          <Section broj={5} naslov="Čaše">
            <div className="grid gap-3 md:grid-cols-3">
              <DaNe label="Čaše dogovorene" checked={dogovor.caseDogovorene} />
              <DaNe label="Čaše s logom" checked={dogovor.caseLogo} />
              <Info label="Broj čaša">{value(dogovor.brojCasa)}</Info>
              <Info label="Tip čaša">{value(dogovor.tipCasa)}</Info>
              <div className="md:col-span-2">
                <Info label="Napomena za čaše">{value(dogovor.caseNapomena)}</Info>
              </div>
            </div>
          </Section>

          <Section broj={6} naslov="Promo materijal">
            <div className="grid gap-3 md:grid-cols-4">
              <DaNe label="Promo dogovoren" checked={dogovor.promoDogovoren} />
              <DaNe label="Vinska karta" checked={dogovor.vinskaKarta} />
              <DaNe label="Plakati" checked={dogovor.plakati} />
              <DaNe label="Letci" checked={dogovor.letci} />
              <DaNe label="Stalci" checked={dogovor.stalci} />
              <DaNe label="Menu holder" checked={dogovor.menuHolder} />
              <DaNe label="Promo police" checked={dogovor.promoPolice} />
              <DaNe label="LED reklama" checked={dogovor.ledReklama} />
            </div>

            <Info label="Napomena za promo materijal">
              {value(dogovor.promoNapomena)}
            </Info>
          </Section>

          <Section broj={7} naslov="Uzorci">
            <div className="grid gap-3 md:grid-cols-3">
              <DaNe label="Uzorci dogovoreni" checked={dogovor.uzorciDogovoreni} />
              <DaNe label="Treba dostaviti uzorke" checked={dogovor.trebaDostavitiUzorke} />
            </div>

            <Info label="Detalji uzoraka">{value(dogovor.uzorciDetalji)}</Info>
          </Section>

          <Section broj={8} naslov="Edukacija konobara">
            <div className="grid gap-3 md:grid-cols-3">
              <DaNe label="Edukacija dogovorena" checked={dogovor.edukacijaDogovorena} />
              <Info label="Datum edukacije">{formatDate(dogovor.datumEdukacije)}</Info>
              <Info label="Detalji edukacije">{value(dogovor.edukacijaDetalji)}</Info>
            </div>
          </Section>

          <Section broj={9} naslov="Degustacija u lokalu">
            <div className="grid gap-3 md:grid-cols-3">
              <DaNe label="Degustacija dogovorena" checked={dogovor.degustacijaDogovorena} />
              <Info label="Datum degustacije">{formatDate(dogovor.datumDegustacije)}</Info>
              <Info label="Detalji degustacije">{value(dogovor.degustacijaDetalji)}</Info>
            </div>
          </Section>

          <Section broj={10} naslov="Wine party / event">
            <div className="grid gap-3 md:grid-cols-3">
              <DaNe label="Wine party dogovoren" checked={dogovor.winePartyDogovoren} />
              <Info label="Datum wine partyja">{formatDate(dogovor.datumWineParty)}</Info>
              <Info label="Detalji eventa">{value(dogovor.winePartyDetalji)}</Info>
            </div>
          </Section>

          <Section broj={11} naslov="Posjet vinariji">
            <div className="grid gap-3 md:grid-cols-3">
              <DaNe label="Posjet vinariji dogovoren" checked={dogovor.posjetVinarijiDogovoren} />
              <Info label="Datum posjeta vinariji">
                {formatDate(dogovor.datumPosjetaVinariji)}
              </Info>
              <Info label="Detalji posjeta">{value(dogovor.posjetVinarijiDetalji)}</Info>
            </div>
          </Section>

          <Section broj={12} naslov="Uvjeti plaćanja i dostava">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Uvjeti plaćanja">{value(dogovor.uvjetiPlacanja)}</Info>
              <Info label="Rok plaćanja">{value(dogovor.rokPlacanja)}</Info>
              <Info label="Dostava">{value(dogovor.dostava)}</Info>
            </div>
          </Section>

          <Section broj={13} naslov="Potvrda dogovora">
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Tko potvrđuje dogovor">{value(dogovor.tkoPotvrduje)}</Info>
              <Info label="Kontakt za potvrdu">{value(dogovor.kontaktZaPotvrdu)}</Info>
              <Info label="Rok potvrde">{formatDate(dogovor.rokPotvrde)}</Info>
              <Info label="Datum sljedećeg kontakta / obilaska">
                {formatDate(dogovor.datumSljedeceg)}
              </Info>
            </div>
          </Section>

          <Section broj={14} naslov="Što dalje treba napraviti">
            <div className="grid gap-3 md:grid-cols-5">
              <DaNe label="Treba ponudu" checked={dogovor.trebaPonudu} />
              <DaNe label="Treba predračun" checked={dogovor.trebaPredracun} />
              <DaNe label="Treba nazvati" checked={dogovor.trebaNazvati} />
              <DaNe label="Treba ponovno obići" checked={dogovor.trebaPonovnoObici} />
              <DaNe label="Treba uzorke" checked={dogovor.trebaDostavitiUzorke} />
            </div>
          </Section>

          <Section broj={15} naslov="Status i zaključak">
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Status dogovora">{value(dogovor.status)}</Info>
              <Info label="Datum zapisa">{formatDate(dogovor.createdAt)}</Info>
            </div>

            <div className="border border-orange-100 bg-white p-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                Zaključak dogovora
              </div>

              <div className="mt-2 whitespace-pre-wrap text-[17px] font-semibold leading-8 text-stone-800">
                {value(dogovor.zakljucak)}
              </div>
            </div>

            <div className="border border-orange-100 bg-white p-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                Detalji, datumi, posebni uvjeti i sve što ne smijemo zaboraviti
              </div>

              <div className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-stone-700">
                {value(dogovor.napomena)}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}