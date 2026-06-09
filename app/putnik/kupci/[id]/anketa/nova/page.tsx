import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

function text(formData: FormData, name: string) {
    const value = String(formData.get(name) || "").trim();
    return value || null;
}

function num(formData: FormData, name: string) {
    const value = String(formData.get(name) || "").trim();
    if (!value) return null;

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function checked(formData: FormData, name: string) {
    return formData.get(name) === "on";
}

function daNe(value: boolean) {
    return value ? "DA" : "NE";
}

function sloziBiljesku(formData: FormData) {
    const dijelovi: string[] = [];

    const osnovniDojam = text(formData, "osnovniDojamLokala");
    if (osnovniDojam) {
        dijelovi.push(`OSNOVNI DOJAM LOKALA:\n${osnovniDojam}`);
    }

    const vinskaKarta = [
        `Ima vinsku kartu: ${daNe(checked(formData, "vinskaKartaIma"))}`,
        `Ima vina na čaše: ${daNe(checked(formData, "vinskaKartaCase"))}`,
        `Broj etiketa: ${text(formData, "vinskaKartaBrojEtiketa") || "-"}`,
        `Broj vina na čaše: ${text(formData, "vinskaKartaBrojCasa") || "-"}`,
        `Cijena čaše: ${text(formData, "vinskaKartaCijenaCase") || "-"}`,
        `Cijena boce: ${text(formData, "vinskaKartaCijenaBoce") || "-"}`,
        `Napomena: ${text(formData, "vinskaKartaNapomena") || "-"}`,
    ].join("\n");

    dijelovi.push(`VINSKA KARTA:\n${vinskaKarta}`);

    const biljeska = text(formData, "biljeska");
    if (biljeska) {
        dijelovi.push(`BILJEŠKA PUTNIKA:\n${biljeska}`);
    }

    return dijelovi.join("\n\n");
}

async function spremiAnketu(formData: FormData) {
    "use server";

    const kupacId = String(formData.get("kupacId") || "").trim();
    if (!kupacId) return;

    await prisma.putnikAnketaKupca.create({
        data: {
            kupacId,

            tipLokala: text(formData, "tipLokala"),
            razinaLokala: text(formData, "razinaLokala"),
            brojSjedecihMjesta: num(formData, "brojSjedecihMjesta"),
            imaTerasu: checked(formData, "imaTerasu"),
            radiSezonski: checked(formData, "radiSezonski"),
            promet: text(formData, "promet"),
            najjaciDani: text(formData, "najjaciDani"),

            prodajeKucnoVino: checked(formData, "prodajeKucnoVino"),
            prodajeButelje: checked(formData, "prodajeButelje"),
            prodajeRinfuza: checked(formData, "prodajeRinfuza"),
            prodajePremium: checked(formData, "prodajePremium"),
            prodajeStranaVina: checked(formData, "prodajeStranaVina"),
            prodajePjenusce: checked(formData, "prodajePjenusce"),
            prodajeRose: checked(formData, "prodajeRose"),
            nemaPosebnuPonudu: checked(formData, "nemaPosebnuPonudu"),

            ideBijelo: checked(formData, "ideBijelo"),
            ideCrno: checked(formData, "ideCrno"),
            ideRose: checked(formData, "ideRose"),
            idePjenusci: checked(formData, "idePjenusci"),
            ideGrasevina: checked(formData, "ideGrasevina"),
            ideSauvignon: checked(formData, "ideSauvignon"),
            ideRizling: checked(formData, "ideRizling"),
            ideChardonnay: checked(formData, "ideChardonnay"),
            ideMuskat: checked(formData, "ideMuskat"),
            ideFrankovka: checked(formData, "ideFrankovka"),
            ideKupaza: checked(formData, "ideKupaza"),

            konkurentskeVinarije: text(formData, "konkurentskeVinarije"),
            glavniKonkurent: text(formData, "glavniKonkurent"),
            razlogCijena: checked(formData, "razlogCijena"),
            razlogPoznatost: checked(formData, "razlogPoznatost"),
            razlogKvaliteta: checked(formData, "razlogKvaliteta"),
            razlogRabat: checked(formData, "razlogRabat"),
            razlogDostava: checked(formData, "razlogDostava"),
            razlogOdnosDobavljac: checked(formData, "razlogOdnosDobavljac"),
            razlogGostiTraze: checked(formData, "razlogGostiTraze"),
            razlogKonobariProdaju: checked(formData, "razlogKonobariProdaju"),
            razlogCasePromo: checked(formData, "razlogCasePromo"),
            stoMuKodKonkurencijeOdgovara: text(
                formData,
                "stoMuKodKonkurencijeOdgovara"
            ),
            stoMuKodKonkurencijeSmeta: text(formData, "stoMuKodKonkurencijeSmeta"),

            nacinNabave: text(formData, "nacinNabave"),
            nazivVeletrgovca: text(formData, "nazivVeletrgovca"),
            kontaktVeletrgovca: text(formData, "kontaktVeletrgovca"),
            uvjetiNabave: text(formData, "uvjetiNabave"),
            tkoDogovaraNarudzbu: text(formData, "tkoDogovaraNarudzbu"),

            tkoOdlucuje: text(formData, "tkoOdlucuje"),
            stvarniDonositelj: checked(formData, "stvarniDonositelj"),
            trebaPricatiSVlasnikom: checked(formData, "trebaPricatiSVlasnikom"),
            trebaPoslatiPonudu: checked(formData, "trebaPoslatiPonudu"),

            vaznaCijena: checked(formData, "vaznaCijena"),
            vaznaKvaliteta: checked(formData, "vaznaKvaliteta"),
            vaznaMarza: checked(formData, "vaznaMarza"),
            vaznaDostava: checked(formData, "vaznaDostava"),
            vazanBrend: checked(formData, "vazanBrend"),
            vaznaLokalnaPrica: checked(formData, "vaznaLokalnaPrica"),
            vaznaPreporukaHrane: checked(formData, "vaznaPreporukaHrane"),
            vaznaEdukacijaKonobara: checked(formData, "vaznaEdukacijaKonobara"),
            vazneCase: checked(formData, "vazneCase"),
            vazanPromoMaterijal: checked(formData, "vazanPromoMaterijal"),
            vazneAkcije: checked(formData, "vazneAkcije"),
            vaznaSigurnostDobave: checked(formData, "vaznaSigurnostDobave"),
            vaznaJednostavnaNarudzba: checked(
                formData,
                "vaznaJednostavnaNarudzba"
            ),

            probaoNasaVina: text(formData, "probaoNasaVina"),
            misljenjeONama: text(formData, "misljenjeONama"),
            poznajeVinariju: checked(formData, "poznajeVinariju"),
            cuoZaNas: checked(formData, "cuoZaNas"),
            bioUVinariji: checked(formData, "bioUVinariji"),
            zanimaGaPricaVinarije: checked(formData, "zanimaGaPricaVinarije"),

            motiviraBoljaCijena: checked(formData, "motiviraBoljaCijena"),
            motiviraAkcija12Plus2: checked(formData, "motiviraAkcija12Plus2"),
            motiviraAkcija6Plus1: checked(formData, "motiviraAkcija6Plus1"),
            motivirajuProbneBoce: checked(formData, "motivirajuProbneBoce"),
            motivirajuCase: checked(formData, "motivirajuCase"),
            motiviraVinskaKarta: checked(formData, "motiviraVinskaKarta"),
            motiviraEdukacija: checked(formData, "motiviraEdukacija"),
            motiviraDegustacija: checked(formData, "motiviraDegustacija"),
            motiviraWineParty: checked(formData, "motiviraWineParty"),
            motiviraPosjetVinariji: checked(formData, "motiviraPosjetVinariji"),
            motiviraBoljaMarza: checked(formData, "motiviraBoljaMarza"),
            motiviraPreporukaUzHranu: checked(formData, "motiviraPreporukaUzHranu"),
            motiviraLokalnaPrica: checked(formData, "motiviraLokalnaPrica"),

            preprekaImaDobavljaca: checked(formData, "preprekaImaDobavljaca"),
            preprekaZadovoljanKonkurencijom: checked(
                formData,
                "preprekaZadovoljanKonkurencijom"
            ),
            preprekaCijenaPrevisoka: checked(formData, "preprekaCijenaPrevisoka"),
            preprekaNePoznaVino: checked(formData, "preprekaNePoznaVino"),
            preprekaNemaProstora: checked(formData, "preprekaNemaProstora"),
            preprekaKonobariNeZnaju: checked(formData, "preprekaKonobariNeZnaju"),
            preprekaMaliPromet: checked(formData, "preprekaMaliPromet"),
            preprekaVlasnikNeZeli: checked(formData, "preprekaVlasnikNeZeli"),
            preprekaTrebaProbati: checked(formData, "preprekaTrebaProbati"),
            preprekaTrebaPonudu: checked(formData, "preprekaTrebaPonudu"),
            preprekaNijeTrenutak: checked(formData, "preprekaNijeTrenutak"),
            dodatnePrepreke: text(formData, "dodatnePrepreke"),

            potencijal: text(formData, "potencijal"),
            procjenaBocaMjesecno: num(formData, "procjenaBocaMjesecno"),
            preporucenaAkcija: text(formData, "preporucenaAkcija"),
            preporucenaAktivacija: text(formData, "preporucenaAktivacija"),
            sljedeciKorak: text(formData, "sljedeciKorak"),
            zavrsnaOcjena: text(formData, "zavrsnaOcjena"),

            // Korak 19 - preporučena akcija / aktivacija (prije se tiho gubilo)
            akcija6Plus1: checked(formData, "akcija6Plus1"),
            akcija12Plus2: checked(formData, "akcija12Plus2"),
            akcija24Plus4: checked(formData, "akcija24Plus4"),
            probneBoce: checked(formData, "probneBoce"),
            gratisCase: checked(formData, "gratisCase"),
            edukacijaKonobara: checked(formData, "edukacijaKonobara"),
            degustacijaULokalu: checked(formData, "degustacijaULokalu"),
            winePartyAktivacija: checked(formData, "winePartyAktivacija"),
            posjetVinarijiAktivacija: checked(formData, "posjetVinarijiAktivacija"),
            vinskaKartaAktivacija: checked(formData, "vinskaKartaAktivacija"),
            promoMaterijalAktivacija: checked(formData, "promoMaterijalAktivacija"),
            stalciLetciAktivacija: checked(formData, "stalciLetciAktivacija"),
            posebnaCijenaAktivacija: checked(formData, "posebnaCijenaAktivacija"),
            preporukaHraneVina: checked(formData, "preporukaHraneVina"),
            lokalnaPricaAktivacija: checked(formData, "lokalnaPricaAktivacija"),
            premiumPozicioniranje: checked(formData, "premiumPozicioniranje"),
            preporucenaKolicina: num(formData, "preporucenaKolicina"),
            preporucenaCijena: text(formData, "preporucenaCijena"),
            preporuceniRok: text(formData, "preporuceniRok"),
            preporucenaAkcijaDetalji: text(formData, "preporucenaAkcijaDetalji"),

            biljeska: sloziBiljesku(formData),
            internaBiljeska: text(formData, "internaBiljeska"),
        },
    });

    revalidatePath("/putnik");
    revalidatePath(`/putnik/kupci/${kupacId}`);
    redirect(`/putnik/kupci/${kupacId}`);
}

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
}: {
    name: string;
    label: string;
    type?: string;
}) {
    return (
        <div>
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                {label}
            </label>
            <input
                name={name}
                type={type}
                className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            />
        </div>
    );
}

function TextArea({
    name,
    label,
    rows = 4,
}: {
    name: string;
    label: string;
    rows?: number;
}) {
    return (
        <div>
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                {label}
            </label>
            <textarea
                name={name}
                rows={rows}
                className="w-full resize-y border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            />
        </div>
    );
}

function SelectField({
    name,
    label,
    options,
}: {
    name: string;
    label: string;
    options: string[];
}) {
    return (
        <div>
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
                {label}
            </label>
            <select
                name={name}
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

function Check({ name, label }: { name: string; label: string }) {
    return (
        <label className="flex min-h-[48px] cursor-pointer items-center gap-3 border border-orange-200 bg-white px-3 py-3 text-[13px] font-semibold text-stone-700 hover:bg-orange-50">
            <input name={name} type="checkbox" className="h-5 w-5 accent-orange-700" />
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

export default async function NovaAnketaPage({ params }: { params: PageParams }) {
    const { id } = await params;

    const kupac = await prisma.putnikKupac.findUnique({
        where: { id },
    });

    if (!kupac) notFound();

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
                <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                                Detaljna anketa kupca
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
                    <Kartica naslov="Status" vrijednost="Nova anketa" podnaslov="spremanje na karticu kupca" />
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <form action={spremiAnketu} className="space-y-4">
                        <input type="hidden" name="kupacId" value={kupac.id} />

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

                            <TextArea name="osnovniDojamLokala" label="Prvi dojam lokala / napomena s terena" rows={4} />
                        </Section>

                        <Section broj={2} naslov="Tip lokala">
                            <SelectField
                                name="tipLokala"
                                label="Tip lokala"
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
                                <Field name="brojSjedecihMjesta" label="Broj sjedećih mjesta" type="number" />
                                <SelectField name="promet" label="Promet" options={["Mali", "Srednji", "Veliki", "Vrlo veliki"]} />
                                <SelectField name="najjaciDani" label="Najjači dani" options={["Vikend", "Tjedan", "Sezona", "Večeri", "Ručkovi", "Cijeli tjedan"]} />
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                                <Check name="imaTerasu" label="Ima terasu" />
                                <Check name="radiSezonski" label="Radi sezonski" />
                            </div>
                        </Section>

                        <Section broj={5} naslov="Trenutna vinska ponuda">
                            <div className="grid gap-3 md:grid-cols-4">
                                <Check name="prodajeKucnoVino" label="Kućno vino" />
                                <Check name="prodajeButelje" label="Buteljirano vino" />
                                <Check name="prodajeRinfuza" label="Rinfuza" />
                                <Check name="prodajePremium" label="Premium vina" />
                                <Check name="prodajeStranaVina" label="Strana vina" />
                                <Check name="prodajePjenusce" label="Pjenušci" />
                                <Check name="prodajeRose" label="Rose" />
                                <Check name="nemaPosebnuPonudu" label="Ništa posebno" />
                            </div>
                        </Section>

                        <Section broj={6} naslov="Koja vina najbolje idu">
                            <div className="grid gap-3 md:grid-cols-4">
                                <Check name="ideBijelo" label="Bijelo" />
                                <Check name="ideCrno" label="Crno" />
                                <Check name="ideRose" label="Rose" />
                                <Check name="idePjenusci" label="Pjenušci" />
                                <Check name="ideGrasevina" label="Graševina" />
                                <Check name="ideSauvignon" label="Sauvignon" />
                                <Check name="ideRizling" label="Rajnski rizling" />
                                <Check name="ideChardonnay" label="Chardonnay" />
                                <Check name="ideMuskat" label="Muškat" />
                                <Check name="ideFrankovka" label="Frankovka" />
                                <Check name="ideKupaza" label="Kupaža" />
                            </div>
                        </Section>

                        <Section broj={7} naslov="Vinska karta">
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
                        </Section>

                        <Section broj={8} naslov="Konkurencija">
                            <div className="grid gap-4 md:grid-cols-2">
                                <TextArea name="konkurentskeVinarije" label="Koje vinarije trenutno drže" rows={5} />
                                <Field name="glavniKonkurent" label="Glavni konkurent" />
                            </div>
                        </Section>

                        <Section broj={9} naslov="Zašto drži konkurenciju">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Check name="razlogCijena" label="Cijena" />
                                <Check name="razlogPoznatost" label="Poznatost" />
                                <Check name="razlogKvaliteta" label="Kvaliteta" />
                                <Check name="razlogRabat" label="Bolji rabat" />
                                <Check name="razlogDostava" label="Bolja dostava" />
                                <Check name="razlogOdnosDobavljac" label="Odnos s dobavljačem" />
                                <Check name="razlogGostiTraze" label="Gosti ih traže" />
                                <Check name="razlogKonobariProdaju" label="Konobari ih lakše prodaju" />
                                <Check name="razlogCasePromo" label="Čaše / promo materijal" />
                            </div>

                            <TextArea name="stoMuKodKonkurencijeOdgovara" label="Što mu kod konkurencije odgovara" rows={5} />
                        </Section>

                        <Section broj={10} naslov="Što mu kod konkurencije smeta">
                            <TextArea name="stoMuKodKonkurencijeSmeta" label="Što mu smeta kod sadašnjeg dobavljača / vinarije" rows={6} />
                        </Section>

                        <Section broj={11} naslov="Način nabave">
                            <div className="grid gap-4 md:grid-cols-2">
                                <SelectField name="nacinNabave" label="Način nabave" options={["Direktno od vinarije", "Preko distributera", "Preko veletrgovca", "Preko više dobavljača"]} />
                                <Field name="nazivVeletrgovca" label="Naziv veletrgovca / distributera" />
                                <Field name="kontaktVeletrgovca" label="Kontakt veletrgovca" />
                                <Field name="tkoDogovaraNarudzbu" label="Tko dogovara narudžbu" />
                            </div>

                            <TextArea name="uvjetiNabave" label="Uvjeti nabave" rows={4} />
                        </Section>

                        <Section broj={12} naslov="Tko odlučuje">
                            <SelectField name="tkoOdlucuje" label="Tko odlučuje o vinu" options={["Vlasnik", "Direktor", "Voditelj lokala", "Manager", "Šef sale", "Konobar", "Nabava", "Netko drugi"]} />

                            <div className="grid gap-3 md:grid-cols-3">
                                <Check name="stvarniDonositelj" label="Stvarni donositelj odluke" />
                                <Check name="trebaPricatiSVlasnikom" label="Treba pričati s vlasnikom" />
                                <Check name="trebaPoslatiPonudu" label="Treba poslati ponudu" />
                            </div>
                        </Section>

                        <Section broj={13} naslov="Što mu je najvažnije kod vina">
                            <div className="grid gap-3 md:grid-cols-4">
                                <Check name="vaznaCijena" label="Cijena" />
                                <Check name="vaznaKvaliteta" label="Kvaliteta" />
                                <Check name="vaznaMarza" label="Marža" />
                                <Check name="vaznaDostava" label="Dostava" />
                                <Check name="vazanBrend" label="Poznatost brenda" />
                                <Check name="vaznaLokalnaPrica" label="Lokalna priča" />
                                <Check name="vaznaPreporukaHrane" label="Preporuka hrane" />
                                <Check name="vaznaEdukacijaKonobara" label="Edukacija konobara" />
                                <Check name="vazneCase" label="Čaše" />
                                <Check name="vazanPromoMaterijal" label="Promo materijal" />
                                <Check name="vazneAkcije" label="Posebne akcije" />
                                <Check name="vaznaSigurnostDobave" label="Sigurnost dobave" />
                                <Check name="vaznaJednostavnaNarudzba" label="Jednostavna narudžba" />
                            </div>
                        </Section>

                        <Section broj={14} naslov="Je li probao naša vina">
                            <SelectField name="probaoNasaVina" label="Je li probao naša vina" options={["Da", "Ne", "Djelomično", "Ne sjećaju se"]} />
                        </Section>

                        <Section broj={15} naslov="Što misli o Vinariji Kostanjevec">
                            <SelectField name="misljenjeONama" label="Mišljenje o nama" options={["Sviđa mu se", "Dobro je", "Prosječno", "Preskupo", "Treba bolja prezentacija", "Nije siguran"]} />

                            <div className="grid gap-3 md:grid-cols-4">
                                <Check name="poznajeVinariju" label="Poznaje vinariju" />
                                <Check name="cuoZaNas" label="Čuo je za nas" />
                                <Check name="bioUVinariji" label="Bio je u vinariji" />
                                <Check name="zanimaGaPricaVinarije" label="Zanima ga priča vinarije" />
                            </div>
                        </Section>

                        <Section broj={16} naslov="Što bi ga motiviralo">
                            <div className="grid gap-3 md:grid-cols-4">
                                <Check name="motiviraBoljaCijena" label="Bolja cijena" />
                                <Check name="motiviraAkcija12Plus2" label="12 + 2 akcija" />
                                <Check name="motiviraAkcija6Plus1" label="6 + 1 akcija" />
                                <Check name="motivirajuProbneBoce" label="Probne boce" />
                                <Check name="motivirajuCase" label="Čaše" />
                                <Check name="motiviraVinskaKarta" label="Vinska karta" />
                                <Check name="motiviraEdukacija" label="Edukacija" />
                                <Check name="motiviraDegustacija" label="Degustacija" />
                                <Check name="motiviraWineParty" label="Wine party" />
                                <Check name="motiviraPosjetVinariji" label="Posjet vinariji" />
                                <Check name="motiviraBoljaMarza" label="Bolja marža" />
                                <Check name="motiviraPreporukaUzHranu" label="Preporuka uz hranu" />
                                <Check name="motiviraLokalnaPrica" label="Lokalna priča" />
                            </div>
                        </Section>

                        <Section broj={17} naslov="Zašto ne bi uzeo vino">
                            <div className="grid gap-3 md:grid-cols-4">
                                <Check name="preprekaImaDobavljaca" label="Ima dobavljača" />
                                <Check name="preprekaZadovoljanKonkurencijom" label="Zadovoljan konkurencijom" />
                                <Check name="preprekaCijenaPrevisoka" label="Cijena previsoka" />
                                <Check name="preprekaNePoznaVino" label="Ne poznaje vino" />
                                <Check name="preprekaNemaProstora" label="Nema prostora" />
                                <Check name="preprekaKonobariNeZnaju" label="Konobari ne znaju prodavati" />
                                <Check name="preprekaMaliPromet" label="Mali promet vina" />
                                <Check name="preprekaVlasnikNeZeli" label="Vlasnik ne želi" />
                                <Check name="preprekaTrebaProbati" label="Treba probati" />
                                <Check name="preprekaTrebaPonudu" label="Treba ponudu" />
                                <Check name="preprekaNijeTrenutak" label="Nije pravi trenutak" />
                            </div>

                            <TextArea name="dodatnePrepreke" label="Dodatne prepreke" rows={5} />
                        </Section>

                        <Section broj={18} naslov="Potencijal kupca">
                            <div className="grid gap-4 md:grid-cols-3">
                                <SelectField name="potencijal" label="Potencijal" options={["Mali", "Srednji", "Veliki", "Premium"]} />
                                <Field name="procjenaBocaMjesecno" label="Procjena boca mjesečno" type="number" />
                                <SelectField name="zavrsnaOcjena" label="Završna ocjena" options={["Jako dobar potencijal", "Dobar potencijal", "Treba raditi na kupcu", "Slab potencijal", "Ne isplati se trenutno"]} />
                            </div>
                        </Section>

                        <Section broj={19} naslov="Preporučena akcija / aktivacija">
                            <div className="grid gap-3 md:grid-cols-4">
                                <Check name="akcija6Plus1" label="6 + 1 gratis" />
                                <Check name="akcija12Plus2" label="12 + 2 gratis" />
                                <Check name="akcija24Plus4" label="24 + 4 gratis" />
                                <Check name="probneBoce" label="Probne boce" />

                                <Check name="gratisCase" label="Gratis čaše" />
                                <Check name="edukacijaKonobara" label="Edukacija konobara" />
                                <Check name="degustacijaULokalu" label="Degustacija u lokalu" />
                                <Check name="winePartyAktivacija" label="Wine party" />

                                <Check name="posjetVinarijiAktivacija" label="Posjet vinariji" />
                                <Check name="vinskaKartaAktivacija" label="Vinska karta" />
                                <Check name="promoMaterijalAktivacija" label="Promo materijal" />
                                <Check name="stalciLetciAktivacija" label="Stalci / letci" />

                                <Check name="posebnaCijenaAktivacija" label="Posebna cijena" />
                                <Check name="preporukaHraneVina" label="Preporuka hrane i vina" />
                                <Check name="lokalnaPricaAktivacija" label="Lokalna priča" />
                                <Check name="premiumPozicioniranje" label="Premium pozicioniranje" />
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <Field
                                    name="preporucenaKolicina"
                                    label="Preporučena količina boca"
                                    type="number"
                                />

                                <Field
                                    name="preporucenaCijena"
                                    label="Dogovorena cijena / rabat"
                                />

                                <Field
                                    name="preporuceniRok"
                                    label="Rok za realizaciju"
                                />
                            </div>

                            <TextArea
                                name="preporucenaAkcijaDetalji"
                                label="Detalji preporučene akcije i aktivacije"
                                rows={5}
                            />
                        </Section>

                        <Section broj={20} naslov="Sljedeći korak i bilješka putnika">
                            <SelectField name="sljedeciKorak" label="Sljedeći korak" options={["Poslati ponudu", "Donijeti uzorke", "Nazvati vlasnika", "Dogovoriti edukaciju", "Dogovoriti posjet vinariji", "Dogovoriti event", "Ponovno obići za 7 dana", "Ponovno obići za 14 dana", "Ponovno obići za 30 dana", "Nema potencijala"]} />
                            <TextArea name="biljeska" label="Bilješka putnika" rows={7} />
                            <TextArea name="internaBiljeska" label="Interna bilješka" rows={5} />
                        </Section>

                        <div className="sticky bottom-4 z-40 flex justify-end border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4 shadow-2xl">
                            <button
                                type="submit"
                                className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-3 text-[14px] font-semibold text-orange-950 transition hover:brightness-105"
                            >
                                Spremi kompletnu anketu
                            </button>
                        </div>
                    </form>

                    <div className="hidden xl:block">
                        <div className="sticky top-4 space-y-4">
                            <KoraciPanel steps={steps} />

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
                    <KoraciPanel steps={steps} />
                </div>
            </div>
        </main>
    );
}