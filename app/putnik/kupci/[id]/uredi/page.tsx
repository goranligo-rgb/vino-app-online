import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

function text(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || null;
}

function num(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function spremiKupca(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "").trim();
  if (!id) return;

  await prisma.putnikKupac.update({
    where: { id },
    data: {
      nazivLokala: String(formData.get("nazivLokala") || "").trim(),
      nazivFirme: text(formData, "nazivFirme"),
      vlasnik: text(formData, "vlasnik"),
      kontaktOsoba: text(formData, "kontaktOsoba"),
      telefon: text(formData, "telefon"),
      email: text(formData, "email"),
      oib: text(formData, "oib"),
      adresa: text(formData, "adresa"),
      grad: text(formData, "grad"),
      regija: text(formData, "regija"),

      sifraKupca: text(formData, "sifraKupca"),
      narudzbaOsoba: text(formData, "narudzbaOsoba"),
      narudzbaTelefon: text(formData, "narudzbaTelefon"),
      narudzbaEmail: text(formData, "narudzbaEmail"),
      naplataOsoba: text(formData, "naplataOsoba"),
      naplataTelefon: text(formData, "naplataTelefon"),
      naplataEmail: text(formData, "naplataEmail"),
      nacinPlacanja: text(formData, "nacinPlacanja"),
      garancijaPlacanja: text(formData, "garancijaPlacanja"),
      kreditniLimit: num(formData, "kreditniLimit"),

      tip: String(formData.get("tip") || "OSTALO"),
      status: String(formData.get("status") || "POTENCIJALNI"),
      kategorija: String(formData.get("kategorija") || "C"),
      napomena: text(formData, "napomena"),
      aktivan: formData.get("aktivan") === "on",
    },
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${id}`);
  redirect(`/putnik/kupci/${id}`);
}

function Field({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
}) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-semibold text-stone-700">
        {label}
      </label>
      <input
        name={name}
        defaultValue={defaultValue || ""}
        className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-semibold text-stone-700">
        {label}
      </label>
      <select
        name={name}
        defaultValue={defaultValue || ""}
        className="w-full border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function UrediKupcaPage({ params }: { params: PageParams }) {
  const { id } = await params;

  const kupac = await prisma.putnikKupac.findUnique({
    where: { id },
  });

  if (!kupac) notFound();

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1200px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">
                Uredi kupca / lokal
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Ovdje se mijenjaju živi podaci lokala. Ankete i dogovori ostaju arhiva po datumima.
              </div>
            </div>

            <Link
              href={`/putnik/kupci/${kupac.id}`}
              className="border border-orange-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 hover:bg-orange-50"
            >
              Nazad na lokal
            </Link>
          </div>
        </div>

        <form action={spremiKupca} className="space-y-4">
          <input type="hidden" name="id" value={kupac.id} />

          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
            <h2 className="mb-4 text-[18px] font-semibold text-stone-800">
              Osnovni podaci
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <Field name="nazivLokala" label="Naziv lokala" defaultValue={kupac.nazivLokala} />
              <Field name="nazivFirme" label="Naziv firme" defaultValue={kupac.nazivFirme} />
              <Field name="sifraKupca" label="Šifra kupca" defaultValue={kupac.sifraKupca} />
              <Field name="vlasnik" label="Vlasnik" defaultValue={kupac.vlasnik} />
              <Field name="kontaktOsoba" label="Kontakt osoba" defaultValue={kupac.kontaktOsoba} />
              <Field name="telefon" label="Telefon" defaultValue={kupac.telefon} />
              <Field name="email" label="Email" defaultValue={kupac.email} />
              <Field name="oib" label="OIB" defaultValue={kupac.oib} />
              <Field name="adresa" label="Adresa" defaultValue={kupac.adresa} />
              <Field name="grad" label="Grad" defaultValue={kupac.grad} />
              <Field name="regija" label="Regija" defaultValue={kupac.regija} />
            </div>
          </div>

          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
            <h2 className="mb-1 text-[18px] font-semibold text-stone-800">
              Odgovorne osobe i plaćanje
            </h2>
            <p className="mb-4 text-[13px] text-stone-500">
              Tko naručuje, tko plaća i pod kojim uvjetima (Excel kartica kupca).
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              <Field name="narudzbaOsoba" label="Narudžba — osoba" defaultValue={kupac.narudzbaOsoba} />
              <Field name="narudzbaTelefon" label="Narudžba — telefon" defaultValue={kupac.narudzbaTelefon} />
              <Field name="narudzbaEmail" label="Narudžba — email" defaultValue={kupac.narudzbaEmail} />

              <Field name="naplataOsoba" label="Naplata — osoba" defaultValue={kupac.naplataOsoba} />
              <Field name="naplataTelefon" label="Naplata — telefon" defaultValue={kupac.naplataTelefon} />
              <Field name="naplataEmail" label="Naplata — email" defaultValue={kupac.naplataEmail} />

              <Field name="nacinPlacanja" label="Način plaćanja" defaultValue={kupac.nacinPlacanja} />
              <Field name="garancijaPlacanja" label="Garancija plaćanja" defaultValue={kupac.garancijaPlacanja} />
              <Field
                name="kreditniLimit"
                label="Kreditni limit (EUR)"
                defaultValue={kupac.kreditniLimit != null ? String(kupac.kreditniLimit) : ""}
              />
            </div>
          </div>

          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
            <h2 className="mb-4 text-[18px] font-semibold text-stone-800">
              Status i klasifikacija
            </h2>

            <div className="grid gap-4 md:grid-cols-3">
              <SelectField
                name="tip"
                label="Tip kupca"
                defaultValue={kupac.tip}
                options={[
                  { value: "RESTORAN", label: "Restoran" },
                  { value: "KAFIC", label: "Kafić" },
                  { value: "BEACH_BAR", label: "Beach bar" },
                  { value: "HOTEL", label: "Hotel" },
                  { value: "NOCNI_BAR", label: "Noćni bar" },
                  { value: "TRGOVINA", label: "Trgovina" },
                  { value: "VINSKI_BAR", label: "Vinski bar" },
                  { value: "DISTRIBUTER", label: "Distributer" },
                  { value: "VELETRGOVAC", label: "Veletrgovac" },
                  { value: "OSTALO", label: "Ostalo" },
                ]}
              />

              <SelectField
                name="status"
                label="Status"
                defaultValue={kupac.status}
                options={[
                  { value: "AKTIVAN", label: "Aktivan" },
                  { value: "NOVI", label: "Novi" },
                  { value: "POTENCIJALNI", label: "Potencijalni" },
                  { value: "BIVSI", label: "Bivši" },
                  { value: "IZGUBLJEN", label: "Izgubljen" },
                  { value: "SEZONSKI", label: "Sezonski" },
                ]}
              />

              <SelectField
                name="kategorija"
                label="Kategorija"
                defaultValue={kupac.kategorija}
                options={[
                  { value: "A", label: "A" },
                  { value: "B", label: "B" },
                  { value: "C", label: "C" },
                ]}
              />
            </div>

            <label className="mt-4 flex items-center gap-3 border border-orange-200 bg-white px-3 py-3 text-[13px] font-semibold text-stone-700">
              <input
                name="aktivan"
                type="checkbox"
                defaultChecked={kupac.aktivan}
                className="h-5 w-5 accent-orange-700"
              />
              Kupac je aktivan
            </label>
          </div>

          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
            <label className="mb-1 block text-[13px] font-semibold text-stone-700">
              Napomena
            </label>
            <textarea
              name="napomena"
              defaultValue={kupac.napomena || ""}
              rows={6}
              className="w-full resize-y border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
            />
          </div>

          <div className="flex justify-end border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
            <button
              type="submit"
              className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-3 text-[14px] font-semibold text-orange-950 transition hover:brightness-105"
            >
              Spremi promjene
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}