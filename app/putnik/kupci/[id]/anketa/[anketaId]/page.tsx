import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
    anketaId: string;
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
  return String(value).replaceAll("_", " ");
}

function daNe(value?: boolean | null) {
  return value ? "Da" : "Ne";
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
    <section
      id={`korak-${broj}`}
      className="scroll-mt-4 border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4"
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-orange-200 pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
            Korak {broj.toString().padStart(2, "0")}
          </div>

          <h2 className="mt-1 text-[20px] font-semibold text-stone-800">
            {naslov}
          </h2>

          {opis ? (
            <div className="mt-1 text-[13px] text-stone-500">{opis}</div>
          ) : null}
        </div>

        <Oznaka>{broj}/20</Oznaka>
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

function CheckInfo({
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

function KoraciPanel({ steps }: { steps: string[] }) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold text-stone-800">
          Koraci ankete
        </h2>
        <Oznaka>{steps.length}</Oznaka>
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => (
          <a
            key={step}
            href={`#korak-${index + 1}`}
            className="flex gap-3 border border-orange-200 bg-white px-3 py-2 text-[13px] text-stone-700 hover:bg-orange-50"
          >
            <span className="w-7 shrink-0 font-semibold text-orange-800">
              {(index + 1).toString().padStart(2, "0")}
            </span>
            <span>{step}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default async function AnketaDetaljiPage({ params }: PageProps) {
  const { id, anketaId } = await params;

  const anketa = await prisma.putnikAnketaKupca.findUnique({
    where: { id: anketaId },
    include: {
      kupac: true,
    },
  });

  if (!anketa || anketa.kupacId !== id) {
    notFound();
  }

  const a = anketa as any;
  const kupac = anketa.kupac;

  const steps = [
    "Osnovni podaci lokala",
    "Tip lokala",
    "Razina lokala",
    "Kapacitet i promet",
    "Trenutna vinska ponuda",
    "Koja vina najbolje idu",
    "Vinska karta",
    "Konkurencija",
    "Zašto drži konkurenciju",
    "Što mu kod konkurencije smeta",
    "Način nabave",
    "Tko odlučuje",
    "Što mu je najvažnije kod vina",
    "Je li probao naša vina",
    "Što misli o Vinariji Kostanjevec",
    "Što bi ga motiviralo",
    "Zašto ne bi uzeo vino",
    "Potencijal kupca",
    "Preporučena akcija / aktivacija",
    "Sljedeći korak i bilješka putnika",
  ];

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-orange-800/70">
                Arhiva ankete
              </div>

              <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-stone-800">
                {kupac.nazivLokala}
              </h1>

              <div className="mt-1 text-[13px] text-stone-500">
                Anketa od {formatDate(anketa.createdAt)} — prikaz kao ispunjeni obrazac kroz 20 koraka
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
                Nazad na kupca
              </Link>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Section broj={1} naslov="Osnovni podaci lokala">
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

              <Info label="Prvi dojam lokala / napomena s terena">
                {value(a.osnovniDojamLokala)}
              </Info>
            </Section>

            <Section broj={2} naslov="Tip lokala">
              <Info label="Tip lokala">{value(a.tipLokala)}</Info>
            </Section>

            <Section broj={3} naslov="Razina lokala">
              <Info label="Razina lokala">{value(a.razinaLokala)}</Info>
            </Section>

            <Section broj={4} naslov="Kapacitet i promet">
              <div className="grid gap-3 md:grid-cols-3">
                <Info label="Broj sjedećih mjesta">{value(a.brojSjedecihMjesta)}</Info>
                <Info label="Promet">{value(a.promet)}</Info>
                <Info label="Najjači dani">{value(a.najjaciDani)}</Info>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <CheckInfo label="Ima terasu" checked={a.imaTerasu} />
                <CheckInfo label="Radi sezonski" checked={a.radiSezonski} />
              </div>
            </Section>

            <Section broj={5} naslov="Trenutna vinska ponuda">
              <div className="grid gap-3 md:grid-cols-4">
                <CheckInfo label="Kućno vino" checked={a.prodajeKucnoVino} />
                <CheckInfo label="Buteljirano vino" checked={a.prodajeButelje} />
                <CheckInfo label="Rinfuza" checked={a.prodajeRinfuza} />
                <CheckInfo label="Premium vina" checked={a.prodajePremium} />
                <CheckInfo label="Strana vina" checked={a.prodajeStranaVina} />
                <CheckInfo label="Pjenušci" checked={a.prodajePjenusce} />
                <CheckInfo label="Rose" checked={a.prodajeRose} />
                <CheckInfo label="Ništa posebno" checked={a.nemaPosebnuPonudu} />
              </div>
            </Section>

            <Section broj={6} naslov="Koja vina najbolje idu">
              <div className="grid gap-3 md:grid-cols-4">
                <CheckInfo label="Bijelo" checked={a.ideBijelo} />
                <CheckInfo label="Crno" checked={a.ideCrno} />
                <CheckInfo label="Rose" checked={a.ideRose} />
                <CheckInfo label="Pjenušci" checked={a.idePjenusci} />
                <CheckInfo label="Graševina" checked={a.ideGrasevina} />
                <CheckInfo label="Sauvignon" checked={a.ideSauvignon} />
                <CheckInfo label="Rajnski rizling" checked={a.ideRizling} />
                <CheckInfo label="Chardonnay" checked={a.ideChardonnay} />
                <CheckInfo label="Muškat" checked={a.ideMuskat} />
                <CheckInfo label="Frankovka" checked={a.ideFrankovka} />
                <CheckInfo label="Kupaža" checked={a.ideKupaza} />
              </div>
            </Section>

            <Section broj={7} naslov="Vinska karta">
              <div className="grid gap-3 md:grid-cols-3">
                <CheckInfo label="Ima vinsku kartu" checked={a.vinskaKartaIma} />
                <CheckInfo label="Ima vina na čaše" checked={a.vinskaKartaCase} />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Info label="Broj etiketa">{value(a.vinskaKartaBrojEtiketa)}</Info>
                <Info label="Broj vina na čaše">{value(a.vinskaKartaBrojCasa)}</Info>
                <Info label="Cijena čaše">{value(a.vinskaKartaCijenaCase)}</Info>
                <Info label="Cijena boce">{value(a.vinskaKartaCijenaBoce)}</Info>
              </div>

              <Info label="Napomena o vinskoj karti">
                {value(a.vinskaKartaNapomena)}
              </Info>

              <div className="border border-orange-200 bg-white p-4 text-[13px] leading-6 text-stone-600">
                Ako je ovo polje prazno, moguće je da je stara verzija ankete
                spremala vinsku kartu samo unutar glavne bilješke.
              </div>
            </Section>

            <Section broj={8} naslov="Konkurencija">
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Koje vinarije trenutno drže">
                  {value(a.konkurentskeVinarije)}
                </Info>
                <Info label="Glavni konkurent">{value(a.glavniKonkurent)}</Info>
              </div>
            </Section>

            <Section broj={9} naslov="Zašto drži konkurenciju">
              <div className="grid gap-3 md:grid-cols-3">
                <CheckInfo label="Cijena" checked={a.razlogCijena} />
                <CheckInfo label="Poznatost" checked={a.razlogPoznatost} />
                <CheckInfo label="Kvaliteta" checked={a.razlogKvaliteta} />
                <CheckInfo label="Bolji rabat" checked={a.razlogRabat} />
                <CheckInfo label="Bolja dostava" checked={a.razlogDostava} />
                <CheckInfo label="Odnos s dobavljačem" checked={a.razlogOdnosDobavljac} />
                <CheckInfo label="Gosti ih traže" checked={a.razlogGostiTraze} />
                <CheckInfo label="Konobari ih lakše prodaju" checked={a.razlogKonobariProdaju} />
                <CheckInfo label="Čaše / promo materijal" checked={a.razlogCasePromo} />
              </div>

              <Info label="Što mu kod konkurencije odgovara">
                {value(a.stoMuKodKonkurencijeOdgovara)}
              </Info>
            </Section>

            <Section broj={10} naslov="Što mu kod konkurencije smeta">
              <Info label="Što mu smeta kod sadašnjeg dobavljača / vinarije">
                {value(a.stoMuKodKonkurencijeSmeta)}
              </Info>
            </Section>

            <Section broj={11} naslov="Način nabave">
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Način nabave">{value(a.nacinNabave)}</Info>
                <Info label="Naziv veletrgovca / distributera">{value(a.nazivVeletrgovca)}</Info>
                <Info label="Kontakt veletrgovca">{value(a.kontaktVeletrgovca)}</Info>
                <Info label="Tko dogovara narudžbu">{value(a.tkoDogovaraNarudzbu)}</Info>
              </div>

              <Info label="Uvjeti nabave">{value(a.uvjetiNabave)}</Info>
            </Section>

            <Section broj={12} naslov="Tko odlučuje">
              <Info label="Tko odlučuje o vinu">{value(a.tkoOdlucuje)}</Info>

              <div className="grid gap-3 md:grid-cols-3">
                <CheckInfo label="Stvarni donositelj odluke" checked={a.stvarniDonositelj} />
                <CheckInfo label="Treba pričati s vlasnikom" checked={a.trebaPricatiSVlasnikom} />
                <CheckInfo label="Treba poslati ponudu" checked={a.trebaPoslatiPonudu} />
              </div>
            </Section>

            <Section broj={13} naslov="Što mu je najvažnije kod vina">
              <div className="grid gap-3 md:grid-cols-4">
                <CheckInfo label="Cijena" checked={a.vaznaCijena} />
                <CheckInfo label="Kvaliteta" checked={a.vaznaKvaliteta} />
                <CheckInfo label="Marža" checked={a.vaznaMarza} />
                <CheckInfo label="Dostava" checked={a.vaznaDostava} />
                <CheckInfo label="Poznatost brenda" checked={a.vazanBrend} />
                <CheckInfo label="Lokalna priča" checked={a.vaznaLokalnaPrica} />
                <CheckInfo label="Preporuka hrane" checked={a.vaznaPreporukaHrane} />
                <CheckInfo label="Edukacija konobara" checked={a.vaznaEdukacijaKonobara} />
                <CheckInfo label="Čaše" checked={a.vazneCase} />
                <CheckInfo label="Promo materijal" checked={a.vazanPromoMaterijal} />
                <CheckInfo label="Posebne akcije" checked={a.vazneAkcije} />
                <CheckInfo label="Sigurnost dobave" checked={a.vaznaSigurnostDobave} />
                <CheckInfo label="Jednostavna narudžba" checked={a.vaznaJednostavnaNarudzba} />
              </div>
            </Section>

            <Section broj={14} naslov="Je li probao naša vina">
              <Info label="Je li probao naša vina">{value(a.probaoNasaVina)}</Info>
            </Section>

            <Section broj={15} naslov="Što misli o Vinariji Kostanjevec">
              <Info label="Mišljenje o nama">{value(a.misljenjeONama)}</Info>

              <div className="grid gap-3 md:grid-cols-4">
                <CheckInfo label="Poznaje vinariju" checked={a.poznajeVinariju} />
                <CheckInfo label="Čuo je za nas" checked={a.cuoZaNas} />
                <CheckInfo label="Bio je u vinariji" checked={a.bioUVinariji} />
                <CheckInfo label="Zanima ga priča vinarije" checked={a.zanimaGaPricaVinarije} />
              </div>
            </Section>

            <Section broj={16} naslov="Što bi ga motiviralo">
              <div className="grid gap-3 md:grid-cols-4">
                <CheckInfo label="Bolja cijena" checked={a.motiviraBoljaCijena} />
                <CheckInfo label="12 + 2 akcija" checked={a.motiviraAkcija12Plus2} />
                <CheckInfo label="6 + 1 akcija" checked={a.motiviraAkcija6Plus1} />
                <CheckInfo label="Probne boce" checked={a.motivirajuProbneBoce} />
                <CheckInfo label="Čaše" checked={a.motivirajuCase} />
                <CheckInfo label="Vinska karta" checked={a.motiviraVinskaKarta} />
                <CheckInfo label="Edukacija" checked={a.motiviraEdukacija} />
                <CheckInfo label="Degustacija" checked={a.motiviraDegustacija} />
                <CheckInfo label="Wine party" checked={a.motiviraWineParty} />
                <CheckInfo label="Posjet vinariji" checked={a.motiviraPosjetVinariji} />
                <CheckInfo label="Bolja marža" checked={a.motiviraBoljaMarza} />
                <CheckInfo label="Preporuka uz hranu" checked={a.motiviraPreporukaUzHranu} />
                <CheckInfo label="Lokalna priča" checked={a.motiviraLokalnaPrica} />
              </div>
            </Section>

            <Section broj={17} naslov="Zašto ne bi uzeo vino">
              <div className="grid gap-3 md:grid-cols-4">
                <CheckInfo label="Ima dobavljača" checked={a.preprekaImaDobavljaca} />
                <CheckInfo label="Zadovoljan konkurencijom" checked={a.preprekaZadovoljanKonkurencijom} />
                <CheckInfo label="Cijena previsoka" checked={a.preprekaCijenaPrevisoka} />
                <CheckInfo label="Ne poznaje vino" checked={a.preprekaNePoznaVino} />
                <CheckInfo label="Nema prostora" checked={a.preprekaNemaProstora} />
                <CheckInfo label="Konobari ne znaju prodavati" checked={a.preprekaKonobariNeZnaju} />
                <CheckInfo label="Mali promet vina" checked={a.preprekaMaliPromet} />
                <CheckInfo label="Vlasnik ne želi" checked={a.preprekaVlasnikNeZeli} />
                <CheckInfo label="Treba probati" checked={a.preprekaTrebaProbati} />
                <CheckInfo label="Treba ponudu" checked={a.preprekaTrebaPonudu} />
                <CheckInfo label="Nije pravi trenutak" checked={a.preprekaNijeTrenutak} />
              </div>

              <Info label="Dodatne prepreke">{value(a.dodatnePrepreke)}</Info>
            </Section>

            <Section broj={18} naslov="Potencijal kupca">
              <div className="grid gap-3 md:grid-cols-3">
                <Info label="Potencijal">{value(a.potencijal)}</Info>
                <Info label="Procjena boca mjesečno">{value(a.procjenaBocaMjesecno)}</Info>
                <Info label="Završna ocjena">{value(a.zavrsnaOcjena)}</Info>
              </div>
            </Section>

            <Section broj={19} naslov="Preporučena akcija / aktivacija">
              <div className="grid gap-3 md:grid-cols-4">
                <CheckInfo label="6 + 1 gratis" checked={a.akcija6Plus1} />
                <CheckInfo label="12 + 2 gratis" checked={a.akcija12Plus2} />
                <CheckInfo label="24 + 4 gratis" checked={a.akcija24Plus4} />
                <CheckInfo label="Probne boce" checked={a.probneBoce} />
                <CheckInfo label="Gratis čaše" checked={a.gratisCase} />
                <CheckInfo label="Edukacija konobara" checked={a.edukacijaKonobara} />
                <CheckInfo label="Degustacija u lokalu" checked={a.degustacijaULokalu} />
                <CheckInfo label="Wine party" checked={a.winePartyAktivacija} />
                <CheckInfo label="Posjet vinariji" checked={a.posjetVinarijiAktivacija} />
                <CheckInfo label="Vinska karta" checked={a.vinskaKartaAktivacija} />
                <CheckInfo label="Promo materijal" checked={a.promoMaterijalAktivacija} />
                <CheckInfo label="Stalci / letci" checked={a.stalciLetciAktivacija} />
                <CheckInfo label="Posebna cijena" checked={a.posebnaCijenaAktivacija} />
                <CheckInfo label="Preporuka hrane i vina" checked={a.preporukaHraneVina} />
                <CheckInfo label="Lokalna priča" checked={a.lokalnaPricaAktivacija} />
                <CheckInfo label="Premium pozicioniranje" checked={a.premiumPozicioniranje} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Info label="Preporučena akcija">{value(a.preporucenaAkcija)}</Info>
                <Info label="Preporučena aktivacija">{value(a.preporucenaAktivacija)}</Info>
                <Info label="Preporučena količina boca">{value(a.preporucenaKolicina)}</Info>
                <Info label="Dogovorena cijena / rabat">{value(a.preporucenaCijena)}</Info>
                <Info label="Rok za realizaciju">{value(a.preporuceniRok)}</Info>
              </div>

              <Info label="Detalji preporučene akcije i aktivacije">
                {value(a.preporucenaAkcijaDetalji)}
              </Info>
            </Section>

            <Section broj={20} naslov="Sljedeći korak i bilješka putnika">
              <Info label="Sljedeći korak">{value(a.sljedeciKorak)}</Info>

              <div className="border border-orange-100 bg-white p-4">
                <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
                  Bilješka putnika
                </div>

                <div className="mt-2 whitespace-pre-wrap text-[17px] font-semibold leading-8 text-stone-800">
                  {value(a.biljeska)}
                </div>
              </div>

              <Info label="Interna bilješka">{value(a.internaBiljeska)}</Info>

              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Datum upisa">{formatDate(a.createdAt)}</Info>
                <Info label="Zadnja izmjena">{formatDate(a.updatedAt)}</Info>
              </div>
            </Section>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-4 space-y-4">
              <KoraciPanel steps={steps} />

              <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
                <h2 className="text-[18px] font-semibold text-stone-800">
                  Napomena
                </h2>

                <div className="mt-3 border border-orange-200 bg-white px-4 py-3 text-[13px] leading-6 text-stone-600">
                  Ovo je arhivska anketa. Prikazuje se kao ispunjeni obrazac,
                  po istom redoslijedu kao unos ankete. Ako su neka polja prazna,
                  znači da nisu bila spremljena u bazu u trenutku unosa.
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="xl:hidden">
          <KoraciPanel steps={steps} />
        </div>
      </div>
    </main>
  );
}