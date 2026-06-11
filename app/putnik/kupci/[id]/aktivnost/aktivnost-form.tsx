import Link from "next/link";
import type { ReactNode } from "react";
import type { PutnikAktivnost, PutnikKupac } from "@prisma/client";

function toDateInput(value?: Date | null) {
  if (!value) return undefined;
  return new Date(value).toISOString().slice(0, 10);
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
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
        placeholder={placeholder}
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
  placeholder,
}: {
  name: string;
  label: string;
  rows?: number;
  defaultValue?: string;
  placeholder?: string;
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
        placeholder={placeholder}
        className="w-full resize-y border border-orange-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-orange-400"
      />
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
      <h2 className="mb-4 text-[18px] font-semibold text-stone-800">{title}</h2>
      {children}
    </div>
  );
}

// Zajednička forma za novu i izmjenu aktivnosti. Kad je `initial` zadan,
// polja se popune i šalje se skriveni aktivnostId (update); inače je create.
export default function AktivnostForm({
  kupac,
  action,
  initial,
}: {
  kupac: PutnikKupac;
  action: (formData: FormData) => void | Promise<void>;
  initial?: PutnikAktivnost;
}) {
  const jeUredi = Boolean(initial);
  const danas = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1000px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-orange-800/70">
                Putnik / teren CRM — potencijalni kupac
              </div>
              <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-stone-800">
                {jeUredi ? "Uredi aktivnost" : "Nova aktivnost"} — {kupac.nazivLokala}
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Dnevnik praćenja: što je napravljeno, što nastaviti i vjerojatnost zaključenja.
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

        <form action={action} className="space-y-4">
          <input type="hidden" name="kupacId" value={kupac.id} />
          {initial ? <input type="hidden" name="aktivnostId" value={initial.id} /> : null}

          <Card title="Aktivnost">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                name="datum"
                label="Datum"
                type="date"
                defaultValue={toDateInput(initial?.datum) ?? danas}
              />
              <Field name="tko" label="Tko (osoba / kontakt)" defaultValue={initial?.tko ?? undefined} />
            </div>

            <div className="mt-4">
              <TextArea
                name="opis"
                label="Opis aktivnosti"
                rows={4}
                defaultValue={initial?.opis ?? undefined}
                placeholder="Što je napravljeno (poziv, posjet, ponuda, uzorci...)"
              />
            </div>
          </Card>

          <Card title="Nastavak i potencijal">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                name="sljedecaAktivnost"
                label="Sljedeća aktivnost"
                defaultValue={initial?.sljedecaAktivnost ?? undefined}
              />
              <Field
                name="datumSljedece"
                label="Datum sljedeće aktivnosti"
                type="date"
                defaultValue={toDateInput(initial?.datumSljedece)}
              />
              <Field
                name="vjerojatnostZakljucenja"
                label="Vjerojatnost zaključenja (%)"
                type="number"
                defaultValue={
                  initial?.vjerojatnostZakljucenja != null
                    ? String(initial.vjerojatnostZakljucenja)
                    : undefined
                }
              />
            </div>

            <div className="mt-4">
              <TextArea
                name="stoNastaviti"
                label="Što nastaviti"
                rows={3}
                defaultValue={initial?.stoNastaviti ?? undefined}
                placeholder="Što treba dovršiti / na čemu nastaviti raditi"
              />
            </div>

            <div className="mt-4">
              <TextArea name="zabiljeska" label="Zabilješke" rows={4} defaultValue={initial?.zabiljeska ?? undefined} />
            </div>
          </Card>

          <div className="sticky bottom-4 z-40 flex justify-end border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4 shadow-2xl">
            <button
              type="submit"
              className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-3 text-[14px] font-semibold text-orange-950 transition hover:brightness-105"
            >
              {jeUredi ? "Spremi izmjene" : "Spremi aktivnost"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
