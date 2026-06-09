import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function createKupac(formData: FormData) {
    "use server";

    const nazivLokala = String(formData.get("nazivLokala") || "").trim();

    if (!nazivLokala) {
        throw new Error("Naziv lokala je obavezan.");
    }

    const text = (name: string) =>
        String(formData.get(name) || "").trim() || null;

    const num = (name: string) => {
        const raw = String(formData.get(name) || "").trim();
        if (!raw) return null;
        const parsed = Number(raw.replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
    };

    await prisma.putnikKupac.create({
        data: {
            nazivLokala,
            nazivFirme: text("nazivFirme"),
            vlasnik: text("vlasnik"),
            kontaktOsoba: text("kontaktOsoba"),
            telefon: text("telefon"),
            email: text("email"),
            oib: text("oib"),
            adresa: text("adresa"),
            grad: text("grad"),
            regija: text("regija"),

            sifraKupca: text("sifraKupca"),
            narudzbaOsoba: text("narudzbaOsoba"),
            narudzbaTelefon: text("narudzbaTelefon"),
            narudzbaEmail: text("narudzbaEmail"),
            naplataOsoba: text("naplataOsoba"),
            naplataTelefon: text("naplataTelefon"),
            naplataEmail: text("naplataEmail"),
            nacinPlacanja: text("nacinPlacanja"),
            garancijaPlacanja: text("garancijaPlacanja"),
            kreditniLimit: num("kreditniLimit"),

            tip: String(formData.get("tip") || "OSTALO") as any,
            status: String(formData.get("status") || "POTENCIJALNI") as any,
            kategorija: String(formData.get("kategorija") || "C") as any,
            napomena: text("napomena"),
        },
    });

    redirect("/putnik");
}

function Field({
    label,
    name,
    placeholder,
    type = "text",
}: {
    label: string;
    name: string;
    placeholder?: string;
    type?: string;
}) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase tracking-widest text-[#7b6338]">
                {label}
            </span>
            <input
                name={name}
                type={type}
                placeholder={placeholder}
                className="mt-2 w-full border border-[#d8c8aa] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#9c7a3a]"
            />
        </label>
    );
}

function SelectField({
    label,
    name,
    children,
}: {
    label: string;
    name: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase tracking-widest text-[#7b6338]">
                {label}
            </span>
            <select
                name={name}
                className="mt-2 w-full border border-[#d8c8aa] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#9c7a3a]"
            >
                {children}
            </select>
        </label>
    );
}

export default function NoviKupacPage() {
    return (
        <main className="min-h-screen bg-[#eee3cf] px-4 py-6 text-[#2b2118] md:px-8">
            <div className="mx-auto max-w-5xl">
                <header className="border border-[#5b452c] bg-[#2b2118] p-6 text-white">
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#d6b46a]">
                        Putnik / Teren CRM
                    </p>
                    <h1 className="mt-3 text-4xl font-black">Novi kupac</h1>
                    <p className="mt-3 text-sm text-[#eadfc9]">
                        Unos osnovnih podataka kupca za terenski rad. Ovo ne dira račune,
                        skladište ni proizvodnju.
                    </p>
                </header>

                <form action={createKupac} className="mt-6 border border-[#d8c8aa] bg-white p-5">
                    <div className="border-b border-[#d8c8aa] pb-4">
                        <h2 className="text-2xl font-black">Podaci kupca</h2>
                        <p className="mt-1 text-sm text-[#776650]">
                            Dovoljno je upisati naziv lokala, ostalo se može dopuniti kasnije.
                        </p>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <Field label="Naziv lokala *" name="nazivLokala" placeholder="npr. Restoran Stari Grad" />
                        <Field label="Naziv firme" name="nazivFirme" placeholder="npr. Primjer d.o.o." />
                        <Field label="Šifra kupca" name="sifraKupca" />
                        <Field label="Vlasnik" name="vlasnik" />
                        <Field label="Kontakt osoba" name="kontaktOsoba" />
                        <Field label="Telefon" name="telefon" />
                        <Field label="Email" name="email" type="email" />
                        <Field label="OIB" name="oib" />
                        <Field label="Adresa" name="adresa" />
                        <Field label="Grad" name="grad" />
                        <Field label="Regija" name="regija" />

                        <SelectField label="Tip kupca" name="tip">
                            <option value="RESTORAN">Restoran</option>
                            <option value="KAFIC">Kafić</option>
                            <option value="BEACH_BAR">Beach bar</option>
                            <option value="HOTEL">Hotel</option>
                            <option value="NOCNI_BAR">Noćni bar</option>
                            <option value="TRGOVINA">Trgovina</option>
                            <option value="VINSKI_BAR">Vinski bar</option>
                            <option value="DISTRIBUTER">Distributer</option>
                            <option value="VELETRGOVAC">Veletrgovac</option>
                            <option value="OSTALO">Ostalo</option>
                        </SelectField>

                        <SelectField label="Status" name="status">
                            <option value="POTENCIJALNI">Potencijalni</option>
                            <option value="NOVI">Novi</option>
                            <option value="AKTIVAN">Aktivan</option>
                            <option value="BIVSI">Bivši</option>
                            <option value="IZGUBLJEN">Izgubljen</option>
                            <option value="SEZONSKI">Sezonski</option>
                        </SelectField>

                        <SelectField label="Kategorija" name="kategorija">
                            <option value="C">C</option>
                            <option value="B">B</option>
                            <option value="A">A</option>
                        </SelectField>
                    </div>

                    <div className="mt-6 border-t border-[#d8c8aa] pt-5">
                        <h2 className="text-xl font-black">Odgovorne osobe i plaćanje</h2>
                        <p className="mt-1 text-sm text-[#776650]">
                            Podaci s Excel kartice kupca: tko naručuje, tko plaća i pod kojim uvjetima.
                        </p>

                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                            <Field label="Narudžba — osoba" name="narudzbaOsoba" />
                            <Field label="Narudžba — telefon" name="narudzbaTelefon" />
                            <Field label="Narudžba — email" name="narudzbaEmail" type="email" />

                            <Field label="Naplata — osoba" name="naplataOsoba" />
                            <Field label="Naplata — telefon" name="naplataTelefon" />
                            <Field label="Naplata — email" name="naplataEmail" type="email" />

                            <Field label="Način plaćanja" name="nacinPlacanja" />
                            <Field label="Garancija plaćanja" name="garancijaPlacanja" />
                            <Field label="Kreditni limit (EUR)" name="kreditniLimit" type="number" />
                        </div>
                    </div>

                    <label className="mt-4 block">
                        <span className="text-xs font-black uppercase tracking-widest text-[#7b6338]">
                            Napomena
                        </span>
                        <textarea
                            name="napomena"
                            rows={4}
                            className="mt-2 w-full border border-[#d8c8aa] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#9c7a3a]"
                            placeholder="Kratka napomena s terena..."
                        />
                    </label>

                    <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-[#d8c8aa] pt-5">
                        <Link
                            href="/putnik"
                            className="border border-[#d8c8aa] px-5 py-3 text-sm font-black hover:bg-[#fffaf0]"
                        >
                            Odustani
                        </Link>

                        <button
                            type="submit"
                            className="cursor-pointer bg-[#d6a640] px-6 py-3 text-sm font-black text-[#21170e] hover:bg-[#e6bc62]"
                        >
                            Spremi kupca
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}