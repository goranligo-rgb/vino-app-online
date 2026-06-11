import Link from "next/link";
import type { ReactNode } from "react";
import type { PutnikDogovor, PutnikKupac } from "@prisma/client";

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
    <section className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-orange-200 pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-orange-800/70">
            Dogovor {broj.toString().padStart(2, "0")}
          </div>
          <h2 className="mt-1 text-[20px] font-semibold text-stone-800">
            {naslov}
          </h2>
          {opis ? <div className="mt-1 text-[13px] text-stone-500">{opis}</div> : null}
        </div>
        <Oznaka>{broj}</Oznaka>
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

// Zajednička forma za novi i izmjenu dogovora. `initial` zadano = popuni i šalji
// skriveni dogovorId (update); inače create.
export default function DogovorForm({
  kupac,
  action,
  initial,
}: {
  kupac: PutnikKupac;
  action: (formData: FormData) => void | Promise<void>;
  initial?: PutnikDogovor;
}) {
  const jeUredi = Boolean(initial);

  // Pomoćnici za predpopunu (imena polja == ključevi modela).
  const s = (k: keyof PutnikDogovor) => {
    const v = initial?.[k];
    return v == null ? undefined : String(v);
  };
  const d = (k: keyof PutnikDogovor) => {
    const v = initial?.[k];
    return v ? new Date(v as Date).toISOString().slice(0, 10) : undefined;
  };
  const c = (k: keyof PutnikDogovor) => Boolean(initial?.[k]);

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                {jeUredi ? "Uredi dogovor" : "Novi dogovor"} / komercijalni plan
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Upis dogovora s lokalom: kupnja, akcija, čaše, promo, edukacija,
                degustacija i zaključak.
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
                Nazad na lokal
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Kartica naslov="Lokal" vrijednost={kupac.nazivLokala} podnaslov={kupac.grad || "-"} />
          <Kartica naslov="Tip zapisa" vrijednost="Dogovor" podnaslov="komercijalni plan" />
          <Kartica naslov="Kupnja" vrijednost="Direktno / posrednik" podnaslov="način nabave" />
          <Kartica naslov="Zaključak" vrijednost="Obavezan" podnaslov="na kraju dogovora" />
        </div>

        <form action={action} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <input type="hidden" name="kupacId" value={kupac.id} />
          {initial ? <input type="hidden" name="dogovorId" value={initial.id} /> : null}

          <div className="space-y-4">
            <Section broj={1} naslov="Podaci lokala" opis="Podaci se povlače iz kartice kupca. Ne upisuju se ponovno.">
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
            </Section>

            <Section broj={2} naslov="Način kupnje" opis="Dogovoriti kako će lokal kupovati vino.">
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  name="nacinKupnje"
                  label="Način kupnje"
                  defaultValue={s("nacinKupnje")}
                  options={[
                    "Direktno od vinarije",
                    "Preko distributera",
                    "Preko veletrgovca",
                    "Kombinirano",
                    "Još nije dogovoreno",
                  ]}
                />

                <Field name="minimalnaNarudzba" label="Minimalna narudžba / uvjet" defaultValue={s("minimalnaNarudzba")} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Check name="kupujeDirektno" label="Želi kupovati direktno" defaultChecked={c("kupujeDirektno")} />
                <Check name="kupujePrekoDistributera" label="Želi preko distributera" defaultChecked={c("kupujePrekoDistributera")} />
                <Check name="kupujePrekoVeletrgovca" label="Želi preko veletrgovca" defaultChecked={c("kupujePrekoVeletrgovca")} />
              </div>
            </Section>

            <Section broj={3} naslov="Početna narudžba" opis="Koliko bi mogao uzeti za početak.">
              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  name="pocetnaNarudzba"
                  label="Početna narudžba"
                  defaultValue={s("pocetnaNarudzba")}
                  options={["6 boca", "12 boca", "24 boce", "36 boca", "60+ boca", "Po dogovoru"]}
                />

                <Field name="dogovorenaKolicina" label="Dogovorena količina" type="number" defaultValue={s("dogovorenaKolicina")} />

                <SelectField
                  name="dogovorenaAkcija"
                  label="Dogovorena akcija"
                  defaultValue={s("dogovorenaAkcija")}
                  options={["Bez akcije", "6 + 1", "12 + 2", "24 + 4", "Posebna cijena", "Probni paket", "Po dogovoru"]}
                />
              </div>
            </Section>

            <Section broj={4} naslov="Akcija i cijena" opis="Što je ponuđeno ili dogovoreno.">
              <div className="grid gap-3 md:grid-cols-4">
                <Check name="akcija6Plus1" label="6 + 1" defaultChecked={c("akcija6Plus1")} />
                <Check name="akcija12Plus2" label="12 + 2" defaultChecked={c("akcija12Plus2")} />
                <Check name="akcija24Plus4" label="24 + 4" defaultChecked={c("akcija24Plus4")} />
                <Check name="posebnaCijenaDogovorena" label="Posebna cijena" defaultChecked={c("posebnaCijenaDogovorena")} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field name="posebnaCijena" label="Posebna cijena / dogovorena cijena" defaultValue={s("posebnaCijena")} />
                <Field name="rabat" label="Rabat / popust" defaultValue={s("rabat")} />
              </div>
            </Section>

            <Section broj={5} naslov="Čaše" opis="Što je dogovoreno oko čaša.">
              <div className="grid gap-3 md:grid-cols-3">
                <Check name="caseDogovorene" label="Čaše dogovorene" defaultChecked={c("caseDogovorene")} />
                <Check name="caseLogo" label="Čaše s logom" defaultChecked={c("caseLogo")} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field name="brojCasa" label="Broj čaša" type="number" defaultValue={s("brojCasa")} />
                <SelectField name="tipCasa" label="Tip čaša" defaultValue={s("tipCasa")} options={["Obične", "Premium", "Logo", "Miješano", "Po dogovoru"]} />
                <Field name="caseNapomena" label="Napomena za čaše" defaultValue={s("caseNapomena")} />
              </div>
            </Section>

            <Section broj={6} naslov="Promo materijal" opis="Sve što smo ponudili ili ostavili.">
              <div className="grid gap-3 md:grid-cols-4">
                <Check name="promoDogovoren" label="Promo dogovoren" defaultChecked={c("promoDogovoren")} />
                <Check name="vinskaKarta" label="Vinska karta" defaultChecked={c("vinskaKarta")} />
                <Check name="plakati" label="Plakati" defaultChecked={c("plakati")} />
                <Check name="letci" label="Letci" defaultChecked={c("letci")} />
                <Check name="stalci" label="Stalci" defaultChecked={c("stalci")} />
                <Check name="menuHolder" label="Menu holder" defaultChecked={c("menuHolder")} />
                <Check name="promoPolice" label="Promo police" defaultChecked={c("promoPolice")} />
                <Check name="ledReklama" label="LED reklama" defaultChecked={c("ledReklama")} />
              </div>

              <TextArea name="promoNapomena" label="Napomena za promo materijal" rows={4} defaultValue={s("promoNapomena")} />
            </Section>

            <Section broj={7} naslov="Uzorci" opis="Koje uzorke treba donijeti ili su već dogovoreni.">
              <div className="grid gap-3 md:grid-cols-3">
                <Check name="uzorciDogovoreni" label="Uzorci dogovoreni" defaultChecked={c("uzorciDogovoreni")} />
                <Check name="trebaDostavitiUzorke" label="Treba dostaviti uzorke" defaultChecked={c("trebaDostavitiUzorke")} />
              </div>

              <TextArea name="uzorciDetalji" label="Detalji uzoraka" rows={4} defaultValue={s("uzorciDetalji")} />
            </Section>

            <Section broj={8} naslov="Edukacija konobara">
              <div className="grid gap-3 md:grid-cols-3">
                <Check name="edukacijaDogovorena" label="Edukacija dogovorena" defaultChecked={c("edukacijaDogovorena")} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field name="datumEdukacije" label="Datum edukacije" type="date" defaultValue={d("datumEdukacije")} />
                <Field name="edukacijaDetalji" label="Detalji edukacije" defaultValue={s("edukacijaDetalji")} />
              </div>
            </Section>

            <Section broj={9} naslov="Degustacija u lokalu">
              <div className="grid gap-3 md:grid-cols-3">
                <Check name="degustacijaDogovorena" label="Degustacija dogovorena" defaultChecked={c("degustacijaDogovorena")} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field name="datumDegustacije" label="Datum degustacije" type="date" defaultValue={d("datumDegustacije")} />
                <Field name="degustacijaDetalji" label="Detalji degustacije" defaultValue={s("degustacijaDetalji")} />
              </div>
            </Section>

            <Section broj={10} naslov="Wine party / event">
              <div className="grid gap-3 md:grid-cols-3">
                <Check name="winePartyDogovoren" label="Wine party dogovoren" defaultChecked={c("winePartyDogovoren")} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field name="datumWineParty" label="Datum wine partyja" type="date" defaultValue={d("datumWineParty")} />
                <Field name="winePartyDetalji" label="Detalji eventa" defaultValue={s("winePartyDetalji")} />
              </div>
            </Section>

            <Section broj={11} naslov="Posjet vinariji">
              <div className="grid gap-3 md:grid-cols-3">
                <Check name="posjetVinarijiDogovoren" label="Posjet vinariji dogovoren" defaultChecked={c("posjetVinarijiDogovoren")} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field name="datumPosjetaVinariji" label="Datum posjeta vinariji" type="date" defaultValue={d("datumPosjetaVinariji")} />
                <Field name="posjetVinarijiDetalji" label="Detalji posjeta" defaultValue={s("posjetVinarijiDetalji")} />
              </div>
            </Section>

            <Section broj={12} naslov="Uvjeti plaćanja i dostava">
              <div className="grid gap-4 md:grid-cols-3">
                <Field name="uvjetiPlacanja" label="Uvjeti plaćanja" defaultValue={s("uvjetiPlacanja")} />
                <Field name="rokPlacanja" label="Rok plaćanja" defaultValue={s("rokPlacanja")} />
                <Field name="dostava" label="Dostava" defaultValue={s("dostava")} />
              </div>
            </Section>

            <Section broj={13} naslov="Potvrda dogovora">
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="tkoPotvrduje" label="Tko potvrđuje dogovor" defaultValue={s("tkoPotvrduje")} />
                <Field name="kontaktZaPotvrdu" label="Kontakt za potvrdu" defaultValue={s("kontaktZaPotvrdu")} />
                <Field name="rokPotvrde" label="Rok potvrde" type="date" defaultValue={d("rokPotvrde")} />
                <Field name="datumSljedeceg" label="Datum sljedećeg kontakta / obilaska" type="date" defaultValue={d("datumSljedeceg")} />
              </div>
            </Section>

            <Section broj={14} naslov="Što dalje treba napraviti">
              <div className="grid gap-3 md:grid-cols-5">
                <Check name="trebaPonudu" label="Treba ponudu" defaultChecked={c("trebaPonudu")} />
                <Check name="trebaPredracun" label="Treba predračun" defaultChecked={c("trebaPredracun")} />
                <Check name="trebaNazvati" label="Treba nazvati" defaultChecked={c("trebaNazvati")} />
                <Check name="trebaPonovnoObici" label="Treba ponovno obići" defaultChecked={c("trebaPonovnoObici")} />
                <Check name="trebaDostavitiUzorke" label="Treba uzorke" defaultChecked={c("trebaDostavitiUzorke")} />
              </div>
            </Section>

            <Section broj={15} naslov="Status i zaključak" opis="Najvažniji dio dogovora.">
              <SelectField
                name="status"
                label="Status dogovora"
                defaultValue={s("status")}
                options={[
                  "Dogovoreno",
                  "Čeka potvrdu",
                  "Ponuda poslati",
                  "Uzorci dogovoreni",
                  "Treba ponovno obići",
                  "Odbijeno",
                  "Nema potencijala trenutno",
                ]}
              />

              <TextArea name="zakljucak" label="Zaključak dogovora" rows={7} defaultValue={s("zakljucak")} />
              <TextArea name="napomena" label="Detalji, datumi, posebni uvjeti i sve što ne smijemo zaboraviti" rows={8} defaultValue={s("napomena")} />
            </Section>

            <div className="sticky bottom-4 z-40 flex justify-end border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4 shadow-2xl">
              <button
                type="submit"
                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-3 text-[14px] font-semibold text-orange-950 transition hover:brightness-105"
              >
                {jeUredi ? "Spremi izmjene" : "Spremi dogovor"}
              </button>
            </div>
          </div>

          <div className="hidden xl:block">
            <div className="sticky top-4 space-y-4">
              <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-[18px] font-semibold text-stone-800">
                    Dogovor
                  </h2>
                  <Oznaka>15</Oznaka>
                </div>

                <div className="space-y-2 text-[13px] text-stone-700">
                  <div className="border border-orange-200 bg-white px-3 py-2">Način kupnje</div>
                  <div className="border border-orange-200 bg-white px-3 py-2">Narudžba i akcija</div>
                  <div className="border border-orange-200 bg-white px-3 py-2">Čaše i promo</div>
                  <div className="border border-orange-200 bg-white px-3 py-2">Uzorci, edukacija, event</div>
                  <div className="border border-orange-200 bg-white px-3 py-2">Uvjeti, potvrda i zaključak</div>
                </div>
              </div>

              <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
                <h2 className="text-[18px] font-semibold text-stone-800">
                  Napomena
                </h2>
                <div className="mt-3 border border-orange-200 bg-white px-4 py-3 text-[13px] leading-6 text-stone-600">
                  Ovdje se zapisuje sve što je komercijalno dogovoreno s lokalom:
                  direktna kupnja ili posrednik, akcije 6+1 / 12+2, čaše,
                  promo materijal, edukacija, degustacija, datumi i završni
                  zaključak.
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
