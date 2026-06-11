import Link from "next/link";
import type { ReactNode } from "react";
import type { PutnikAnketaKupca, PutnikKupac } from "@prisma/client";

function Oznaka({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-900">
      {children}
    </span>
  );
}

function Kartica({
  naslov,
  vrijednost,
  podnaslov,
}: {
  naslov: string;
  vrijednost: string;
  podnaslov?: string;
}) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
        {naslov}
      </div>
      <div className="mt-1 text-[24px] leading-none font-semibold text-stone-800">
        {vrijednost}
      </div>
      {podnaslov ? (
        <div className="mt-2 text-[12px] text-stone-500">{podnaslov}</div>
      ) : null}
    </div>
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
          {opis ? <div className="mt-1 text-[13px] text-stone-500">{opis}</div> : null}
        </div>

        <Oznaka>{broj}/20</Oznaka>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-semibold text-stone-700">
        {label}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
      />
    </div>
  );
}

function TextArea({
  name,
  label,
  rows = 4,
  defaultValue,
}: {
  name: string;
  label: string;
  rows?: number;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-semibold text-stone-700">
        {label}
      </label>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="w-full resize-y border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-semibold text-stone-700">
        {label}
      </label>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
      >
        <option value="">Odaberi</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-[48px] cursor-pointer items-center gap-3 border border-orange-200 bg-white px-3 py-3 text-[13px] font-semibold text-stone-700 hover:bg-orange-50">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-5 w-5 accent-orange-700" />
      <span>{label}</span>
    </label>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border border-orange-100 bg-orange-50/40 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-orange-800/70">
        {label}
      </div>
      <div className="mt-1 text-[15px] font-semibold text-stone-800">
        {value || "-"}
      </div>
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

const STEPS = [
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

// Zajednička forma za novu i izmjenu ankete. `initial` zadano = update.
// Prvi dojam (korak 1), vinska karta (korak 7) i bilješka putnika (korak 20)
// nemaju zasebne kolone — spremaju se kao jedan 'biljeska' tekst. Zato:
//  - NOVA: tri odvojena polja koja se slijepe na serveru.
//  - UREDI: jedan editabilni 'biljeska' tekst (1:1), strukturirana polja se ne
//    prikazuju (ne mogu se cisto rastaviti natrag bez gubitka).
export default function AnketaForm({
  kupac,
  action,
  initial,
}: {
  kupac: PutnikKupac;
  action: (formData: FormData) => void | Promise<void>;
  initial?: PutnikAnketaKupca;
}) {
  const jeUredi = Boolean(initial);

  const s = (k: keyof PutnikAnketaKupca) => {
    const v = initial?.[k];
    return v == null ? undefined : String(v);
  };
  const c = (k: keyof PutnikAnketaKupca) => Boolean(initial?.[k]);

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                {jeUredi ? "Uredi anketu kupca" : "Detaljna anketa kupca"}
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Putnik / teren CRM — anketa kroz 20 koraka, bez duplog unosa
                podataka kupca.
              </div>
            </div>

            <div className="flex gap-2">
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
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Kartica naslov="Kupac" vrijednost={kupac.nazivLokala} podnaslov={kupac.grad || "-"} />
          <Kartica naslov="Broj koraka" vrijednost="20" podnaslov="detaljna terenska anketa" />
          <Kartica
            naslov="Status"
            vrijednost={jeUredi ? "Izmjena ankete" : "Nova anketa"}
            podnaslov="spremanje na karticu kupca"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form action={action} className="space-y-4">
            <input type="hidden" name="kupacId" value={kupac.id} />
            {initial ? <input type="hidden" name="anketaId" value={initial.id} /> : null}

            <Section broj={1} naslov="Osnovni podaci lokala" opis="Podaci se povlače iz kartice kupca. Ne upisuju se ponovno.">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Info label="Naziv lokala" value={kupac.nazivLokala} />
                <Info label="Naziv firme" value={kupac.nazivFirme} />
                <Info label="Vlasnik" value={kupac.vlasnik} />
                <Info label="Kontakt osoba" value={kupac.kontaktOsoba} />
                <Info label="Telefon" value={kupac.telefon} />
                <Info label="Email" value={kupac.email} />
                <Info label="OIB" value={kupac.oib} />
                <Info label="Adresa" value={kupac.adresa} />
                <Info label="Grad" value={kupac.grad} />
                <Info label="Regija" value={kupac.regija} />
              </div>

              {jeUredi ? (
                <div className="border border-orange-100 bg-orange-50/40 px-3 py-3 text-[13px] text-stone-600">
                  Prvi dojam, vinska karta i bilješka putnika ureduju se zajedno u
                  <strong> koraku 20</strong> (jedan tekst).
                </div>
              ) : (
                <TextArea name="osnovniDojamLokala" label="Prvi dojam lokala / napomena s terena" rows={4} />
              )}
            </Section>

            <Section broj={2} naslov="Tip lokala">
              <SelectField
                name="tipLokala"
                label="Tip lokala"
                defaultValue={s("tipLokala")}
                options={[
                  "Restoran",
                  "Kafić",
                  "Beach bar",
                  "Hotel",
                  "Noćni bar",
                  "Trgovina",
                  "Vinski bar",
                  "Distributer",
                  "Veletrgovac",
                  "Kušaonica",
                  "Ostalo",
                ]}
              />
            </Section>

            <Section broj={3} naslov="Razina lokala">
              <SelectField
                name="razinaLokala"
                label="Razina lokala"
                defaultValue={s("razinaLokala")}
                options={[
                  "Običan lokal",
                  "Dobar lokal",
                  "Premium lokal",
                  "Turistički lokal",
                  "Sezonski lokal",
                  "Lokal s velikim prometom",
                  "Lokal s malim prometom",
                ]}
              />
            </Section>

            <Section broj={4} naslov="Kapacitet i promet">
              <div className="grid gap-4 md:grid-cols-3">
                <Field name="brojSjedecihMjesta" label="Broj sjedećih mjesta" type="number" defaultValue={s("brojSjedecihMjesta")} />
                <SelectField name="promet" label="Promet" defaultValue={s("promet")} options={["Mali", "Srednji", "Veliki", "Vrlo veliki"]} />
                <SelectField name="najjaciDani" label="Najjači dani" defaultValue={s("najjaciDani")} options={["Vikend", "Tjedan", "Sezona", "Večeri", "Ručkovi", "Cijeli tjedan"]} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Check name="imaTerasu" label="Ima terasu" defaultChecked={c("imaTerasu")} />
                <Check name="radiSezonski" label="Radi sezonski" defaultChecked={c("radiSezonski")} />
              </div>
            </Section>

            <Section broj={5} naslov="Trenutna vinska ponuda">
              <div className="grid gap-3 md:grid-cols-4">
                <Check name="prodajeKucnoVino" label="Kućno vino" defaultChecked={c("prodajeKucnoVino")} />
                <Check name="prodajeButelje" label="Buteljirano vino" defaultChecked={c("prodajeButelje")} />
                <Check name="prodajeRinfuza" label="Rinfuza" defaultChecked={c("prodajeRinfuza")} />
                <Check name="prodajePremium" label="Premium vina" defaultChecked={c("prodajePremium")} />
                <Check name="prodajeStranaVina" label="Strana vina" defaultChecked={c("prodajeStranaVina")} />
                <Check name="prodajePjenusce" label="Pjenušci" defaultChecked={c("prodajePjenusce")} />
                <Check name="prodajeRose" label="Rose" defaultChecked={c("prodajeRose")} />
                <Check name="nemaPosebnuPonudu" label="Ništa posebno" defaultChecked={c("nemaPosebnuPonudu")} />
              </div>
            </Section>

            <Section broj={6} naslov="Koja vina najbolje idu">
              <div className="grid gap-3 md:grid-cols-4">
                <Check name="ideBijelo" label="Bijelo" defaultChecked={c("ideBijelo")} />
                <Check name="ideCrno" label="Crno" defaultChecked={c("ideCrno")} />
                <Check name="ideRose" label="Rose" defaultChecked={c("ideRose")} />
                <Check name="idePjenusci" label="Pjenušci" defaultChecked={c("idePjenusci")} />
                <Check name="ideGrasevina" label="Graševina" defaultChecked={c("ideGrasevina")} />
                <Check name="ideSauvignon" label="Sauvignon" defaultChecked={c("ideSauvignon")} />
                <Check name="ideRizling" label="Rajnski rizling" defaultChecked={c("ideRizling")} />
                <Check name="ideChardonnay" label="Chardonnay" defaultChecked={c("ideChardonnay")} />
                <Check name="ideMuskat" label="Muškat" defaultChecked={c("ideMuskat")} />
                <Check name="ideFrankovka" label="Frankovka" defaultChecked={c("ideFrankovka")} />
                <Check name="ideKupaza" label="Kupaža" defaultChecked={c("ideKupaza")} />
              </div>
            </Section>

            <Section broj={7} naslov="Vinska karta">
              {jeUredi ? (
                <div className="border border-orange-100 bg-orange-50/40 px-3 py-3 text-[13px] text-stone-600">
                  Vinska karta je dio bilješke (jedan tekst) — uredi je u
                  <strong> koraku 20</strong>.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Check name="vinskaKartaIma" label="Ima vinsku kartu" />
                    <Check name="vinskaKartaCase" label="Ima vina na čaše" />
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <Field name="vinskaKartaBrojEtiketa" label="Broj etiketa" type="number" />
                    <Field name="vinskaKartaBrojCasa" label="Broj vina na čaše" type="number" />
                    <Field name="vinskaKartaCijenaCase" label="Cijena čaše" />
                    <Field name="vinskaKartaCijenaBoce" label="Cijena boce" />
                  </div>

                  <TextArea name="vinskaKartaNapomena" label="Napomena o vinskoj karti" rows={4} />
                </>
              )}
            </Section>

            <Section broj={8} naslov="Konkurencija">
              <div className="grid gap-4 md:grid-cols-2">
                <TextArea name="konkurentskeVinarije" label="Koje vinarije trenutno drže" rows={5} defaultValue={s("konkurentskeVinarije")} />
                <Field name="glavniKonkurent" label="Glavni konkurent" defaultValue={s("glavniKonkurent")} />
              </div>
            </Section>

            <Section broj={9} naslov="Zašto drži konkurenciju">
              <div className="grid gap-3 md:grid-cols-3">
                <Check name="razlogCijena" label="Cijena" defaultChecked={c("razlogCijena")} />
                <Check name="razlogPoznatost" label="Poznatost" defaultChecked={c("razlogPoznatost")} />
                <Check name="razlogKvaliteta" label="Kvaliteta" defaultChecked={c("razlogKvaliteta")} />
                <Check name="razlogRabat" label="Bolji rabat" defaultChecked={c("razlogRabat")} />
                <Check name="razlogDostava" label="Bolja dostava" defaultChecked={c("razlogDostava")} />
                <Check name="razlogOdnosDobavljac" label="Odnos s dobavljačem" defaultChecked={c("razlogOdnosDobavljac")} />
                <Check name="razlogGostiTraze" label="Gosti ih traže" defaultChecked={c("razlogGostiTraze")} />
                <Check name="razlogKonobariProdaju" label="Konobari ih lakše prodaju" defaultChecked={c("razlogKonobariProdaju")} />
                <Check name="razlogCasePromo" label="Čaše / promo materijal" defaultChecked={c("razlogCasePromo")} />
              </div>

              <TextArea name="stoMuKodKonkurencijeOdgovara" label="Što mu kod konkurencije odgovara" rows={5} defaultValue={s("stoMuKodKonkurencijeOdgovara")} />
            </Section>

            <Section broj={10} naslov="Što mu kod konkurencije smeta">
              <TextArea name="stoMuKodKonkurencijeSmeta" label="Što mu smeta kod sadašnjeg dobavljača / vinarije" rows={6} defaultValue={s("stoMuKodKonkurencijeSmeta")} />
            </Section>

            <Section broj={11} naslov="Način nabave">
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField name="nacinNabave" label="Način nabave" defaultValue={s("nacinNabave")} options={["Direktno od vinarije", "Preko distributera", "Preko veletrgovca", "Preko više dobavljača"]} />
                <Field name="nazivVeletrgovca" label="Naziv veletrgovca / distributera" defaultValue={s("nazivVeletrgovca")} />
                <Field name="kontaktVeletrgovca" label="Kontakt veletrgovca" defaultValue={s("kontaktVeletrgovca")} />
                <Field name="tkoDogovaraNarudzbu" label="Tko dogovara narudžbu" defaultValue={s("tkoDogovaraNarudzbu")} />
              </div>

              <TextArea name="uvjetiNabave" label="Uvjeti nabave" rows={4} defaultValue={s("uvjetiNabave")} />
            </Section>

            <Section broj={12} naslov="Tko odlučuje">
              <SelectField name="tkoOdlucuje" label="Tko odlučuje o vinu" defaultValue={s("tkoOdlucuje")} options={["Vlasnik", "Direktor", "Voditelj lokala", "Manager", "Šef sale", "Konobar", "Nabava", "Netko drugi"]} />

              <div className="grid gap-3 md:grid-cols-3">
                <Check name="stvarniDonositelj" label="Stvarni donositelj odluke" defaultChecked={c("stvarniDonositelj")} />
                <Check name="trebaPricatiSVlasnikom" label="Treba pričati s vlasnikom" defaultChecked={c("trebaPricatiSVlasnikom")} />
                <Check name="trebaPoslatiPonudu" label="Treba poslati ponudu" defaultChecked={c("trebaPoslatiPonudu")} />
              </div>
            </Section>

            <Section broj={13} naslov="Što mu je najvažnije kod vina">
              <div className="grid gap-3 md:grid-cols-4">
                <Check name="vaznaCijena" label="Cijena" defaultChecked={c("vaznaCijena")} />
                <Check name="vaznaKvaliteta" label="Kvaliteta" defaultChecked={c("vaznaKvaliteta")} />
                <Check name="vaznaMarza" label="Marža" defaultChecked={c("vaznaMarza")} />
                <Check name="vaznaDostava" label="Dostava" defaultChecked={c("vaznaDostava")} />
                <Check name="vazanBrend" label="Poznatost brenda" defaultChecked={c("vazanBrend")} />
                <Check name="vaznaLokalnaPrica" label="Lokalna priča" defaultChecked={c("vaznaLokalnaPrica")} />
                <Check name="vaznaPreporukaHrane" label="Preporuka hrane" defaultChecked={c("vaznaPreporukaHrane")} />
                <Check name="vaznaEdukacijaKonobara" label="Edukacija konobara" defaultChecked={c("vaznaEdukacijaKonobara")} />
                <Check name="vazneCase" label="Čaše" defaultChecked={c("vazneCase")} />
                <Check name="vazanPromoMaterijal" label="Promo materijal" defaultChecked={c("vazanPromoMaterijal")} />
                <Check name="vazneAkcije" label="Posebne akcije" defaultChecked={c("vazneAkcije")} />
                <Check name="vaznaSigurnostDobave" label="Sigurnost dobave" defaultChecked={c("vaznaSigurnostDobave")} />
                <Check name="vaznaJednostavnaNarudzba" label="Jednostavna narudžba" defaultChecked={c("vaznaJednostavnaNarudzba")} />
              </div>
            </Section>

            <Section broj={14} naslov="Je li probao naša vina">
              <SelectField name="probaoNasaVina" label="Je li probao naša vina" defaultValue={s("probaoNasaVina")} options={["Da", "Ne", "Djelomično", "Ne sjećaju se"]} />
            </Section>

            <Section broj={15} naslov="Što misli o Vinariji Kostanjevec">
              <SelectField name="misljenjeONama" label="Mišljenje o nama" defaultValue={s("misljenjeONama")} options={["Sviđa mu se", "Dobro je", "Prosječno", "Preskupo", "Treba bolja prezentacija", "Nije siguran"]} />

              <div className="grid gap-3 md:grid-cols-4">
                <Check name="poznajeVinariju" label="Poznaje vinariju" defaultChecked={c("poznajeVinariju")} />
                <Check name="cuoZaNas" label="Čuo je za nas" defaultChecked={c("cuoZaNas")} />
                <Check name="bioUVinariji" label="Bio je u vinariji" defaultChecked={c("bioUVinariji")} />
                <Check name="zanimaGaPricaVinarije" label="Zanima ga priča vinarije" defaultChecked={c("zanimaGaPricaVinarije")} />
              </div>
            </Section>

            <Section broj={16} naslov="Što bi ga motiviralo">
              <div className="grid gap-3 md:grid-cols-4">
                <Check name="motiviraBoljaCijena" label="Bolja cijena" defaultChecked={c("motiviraBoljaCijena")} />
                <Check name="motiviraAkcija12Plus2" label="12 + 2 akcija" defaultChecked={c("motiviraAkcija12Plus2")} />
                <Check name="motiviraAkcija6Plus1" label="6 + 1 akcija" defaultChecked={c("motiviraAkcija6Plus1")} />
                <Check name="motivirajuProbneBoce" label="Probne boce" defaultChecked={c("motivirajuProbneBoce")} />
                <Check name="motivirajuCase" label="Čaše" defaultChecked={c("motivirajuCase")} />
                <Check name="motiviraVinskaKarta" label="Vinska karta" defaultChecked={c("motiviraVinskaKarta")} />
                <Check name="motiviraEdukacija" label="Edukacija" defaultChecked={c("motiviraEdukacija")} />
                <Check name="motiviraDegustacija" label="Degustacija" defaultChecked={c("motiviraDegustacija")} />
                <Check name="motiviraWineParty" label="Wine party" defaultChecked={c("motiviraWineParty")} />
                <Check name="motiviraPosjetVinariji" label="Posjet vinariji" defaultChecked={c("motiviraPosjetVinariji")} />
                <Check name="motiviraBoljaMarza" label="Bolja marža" defaultChecked={c("motiviraBoljaMarza")} />
                <Check name="motiviraPreporukaUzHranu" label="Preporuka uz hranu" defaultChecked={c("motiviraPreporukaUzHranu")} />
                <Check name="motiviraLokalnaPrica" label="Lokalna priča" defaultChecked={c("motiviraLokalnaPrica")} />
              </div>
            </Section>

            <Section broj={17} naslov="Zašto ne bi uzeo vino">
              <div className="grid gap-3 md:grid-cols-4">
                <Check name="preprekaImaDobavljaca" label="Ima dobavljača" defaultChecked={c("preprekaImaDobavljaca")} />
                <Check name="preprekaZadovoljanKonkurencijom" label="Zadovoljan konkurencijom" defaultChecked={c("preprekaZadovoljanKonkurencijom")} />
                <Check name="preprekaCijenaPrevisoka" label="Cijena previsoka" defaultChecked={c("preprekaCijenaPrevisoka")} />
                <Check name="preprekaNePoznaVino" label="Ne poznaje vino" defaultChecked={c("preprekaNePoznaVino")} />
                <Check name="preprekaNemaProstora" label="Nema prostora" defaultChecked={c("preprekaNemaProstora")} />
                <Check name="preprekaKonobariNeZnaju" label="Konobari ne znaju prodavati" defaultChecked={c("preprekaKonobariNeZnaju")} />
                <Check name="preprekaMaliPromet" label="Mali promet vina" defaultChecked={c("preprekaMaliPromet")} />
                <Check name="preprekaVlasnikNeZeli" label="Vlasnik ne želi" defaultChecked={c("preprekaVlasnikNeZeli")} />
                <Check name="preprekaTrebaProbati" label="Treba probati" defaultChecked={c("preprekaTrebaProbati")} />
                <Check name="preprekaTrebaPonudu" label="Treba ponudu" defaultChecked={c("preprekaTrebaPonudu")} />
                <Check name="preprekaNijeTrenutak" label="Nije pravi trenutak" defaultChecked={c("preprekaNijeTrenutak")} />
              </div>

              <TextArea name="dodatnePrepreke" label="Dodatne prepreke" rows={5} defaultValue={s("dodatnePrepreke")} />
            </Section>

            <Section broj={18} naslov="Potencijal kupca">
              <div className="grid gap-4 md:grid-cols-3">
                <SelectField name="potencijal" label="Potencijal" defaultValue={s("potencijal")} options={["Mali", "Srednji", "Veliki", "Premium"]} />
                <Field name="procjenaBocaMjesecno" label="Procjena boca mjesečno" type="number" defaultValue={s("procjenaBocaMjesecno")} />
                <SelectField name="zavrsnaOcjena" label="Završna ocjena" defaultValue={s("zavrsnaOcjena")} options={["Jako dobar potencijal", "Dobar potencijal", "Treba raditi na kupcu", "Slab potencijal", "Ne isplati se trenutno"]} />
              </div>
            </Section>

            <Section broj={19} naslov="Preporučena akcija / aktivacija">
              <div className="grid gap-3 md:grid-cols-4">
                <Check name="akcija6Plus1" label="6 + 1 gratis" defaultChecked={c("akcija6Plus1")} />
                <Check name="akcija12Plus2" label="12 + 2 gratis" defaultChecked={c("akcija12Plus2")} />
                <Check name="akcija24Plus4" label="24 + 4 gratis" defaultChecked={c("akcija24Plus4")} />
                <Check name="probneBoce" label="Probne boce" defaultChecked={c("probneBoce")} />

                <Check name="gratisCase" label="Gratis čaše" defaultChecked={c("gratisCase")} />
                <Check name="edukacijaKonobara" label="Edukacija konobara" defaultChecked={c("edukacijaKonobara")} />
                <Check name="degustacijaULokalu" label="Degustacija u lokalu" defaultChecked={c("degustacijaULokalu")} />
                <Check name="winePartyAktivacija" label="Wine party" defaultChecked={c("winePartyAktivacija")} />

                <Check name="posjetVinarijiAktivacija" label="Posjet vinariji" defaultChecked={c("posjetVinarijiAktivacija")} />
                <Check name="vinskaKartaAktivacija" label="Vinska karta" defaultChecked={c("vinskaKartaAktivacija")} />
                <Check name="promoMaterijalAktivacija" label="Promo materijal" defaultChecked={c("promoMaterijalAktivacija")} />
                <Check name="stalciLetciAktivacija" label="Stalci / letci" defaultChecked={c("stalciLetciAktivacija")} />

                <Check name="posebnaCijenaAktivacija" label="Posebna cijena" defaultChecked={c("posebnaCijenaAktivacija")} />
                <Check name="preporukaHraneVina" label="Preporuka hrane i vina" defaultChecked={c("preporukaHraneVina")} />
                <Check name="lokalnaPricaAktivacija" label="Lokalna priča" defaultChecked={c("lokalnaPricaAktivacija")} />
                <Check name="premiumPozicioniranje" label="Premium pozicioniranje" defaultChecked={c("premiumPozicioniranje")} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field name="preporucenaKolicina" label="Preporučena količina boca" type="number" defaultValue={s("preporucenaKolicina")} />
                <Field name="preporucenaCijena" label="Dogovorena cijena / rabat" defaultValue={s("preporucenaCijena")} />
                <Field name="preporuceniRok" label="Rok za realizaciju" defaultValue={s("preporuceniRok")} />
              </div>

              <TextArea name="preporucenaAkcijaDetalji" label="Detalji preporučene akcije i aktivacije" rows={5} defaultValue={s("preporucenaAkcijaDetalji")} />
            </Section>

            <Section broj={20} naslov="Sljedeći korak i bilješka putnika">
              <SelectField name="sljedeciKorak" label="Sljedeći korak" defaultValue={s("sljedeciKorak")} options={["Poslati ponudu", "Donijeti uzorke", "Nazvati vlasnika", "Dogovoriti edukaciju", "Dogovoriti posjet vinariji", "Dogovoriti event", "Ponovno obići za 7 dana", "Ponovno obići za 14 dana", "Ponovno obići za 30 dana", "Nema potencijala"]} />

              {jeUredi ? (
                <TextArea
                  name="biljeska"
                  label="Bilješka (prvi dojam lokala + vinska karta + bilješka putnika) — uredi kao jedan tekst"
                  rows={14}
                  defaultValue={s("biljeska")}
                />
              ) : (
                <TextArea name="biljeska" label="Bilješka putnika" rows={7} />
              )}

              <TextArea name="internaBiljeska" label="Interna bilješka" rows={5} defaultValue={s("internaBiljeska")} />
            </Section>

            <div className="sticky bottom-4 z-40 flex justify-end border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4 shadow-2xl">
              <button
                type="submit"
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-3 text-[14px] font-semibold text-orange-950 transition hover:brightness-105"
              >
                {jeUredi ? "Spremi izmjene ankete" : "Spremi kompletnu anketu"}
              </button>
            </div>
          </form>

          <div className="hidden xl:block">
            <div className="sticky top-4 space-y-4">
              <KoraciPanel steps={STEPS} />

              <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
                <h2 className="text-[18px] font-semibold text-stone-800">
                  Napomena
                </h2>
                <div className="mt-3 border border-orange-200 bg-white px-4 py-3 text-[13px] leading-6 text-stone-600">
                  Naziv lokala, kontakt, telefon, OIB i adresa ne upisuju se u
                  anketi. Ti podaci ostaju samo na kartici kupca da ne nastanu
                  duplikati zbog jednog slova razlike.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:hidden">
          <KoraciPanel steps={STEPS} />
        </div>
      </div>
    </main>
  );
}
