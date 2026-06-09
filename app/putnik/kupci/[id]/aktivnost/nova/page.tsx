import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

function text(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || null;
}

function intVal(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function spremiAktivnost(formData: FormData) {
  "use server";

  const user = await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  if (!kupacId) return;

  await prisma.putnikAktivnost.create({
    data: {
      kupacId,
      putnikIme: user.ime || null,
      datum: dateValue(formData, "datum") ?? new Date(),

      opis: text(formData, "opis"),
      tko: text(formData, "tko"),
      stoNastaviti: text(formData, "stoNastaviti"),
      sljedecaAktivnost: text(formData, "sljedecaAktivnost"),
      datumSljedece: dateValue(formData, "datumSljedece"),
      vjerojatnostZakljucenja: intVal(formData, "vjerojatnostZakljucenja"),
      zabiljeska: text(formData, "zabiljeska"),
    },
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(`/putnik/kupci/${kupacId}`);
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
  placeholder,
}: {
  name: string;
  label: string;
  rows?: number;
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

export default async function NovaAktivnostPage({ params }: { params: PageParams }) {
  const { id } = await params;

  const kupac = await prisma.putnikKupac.findUnique({ where: { id } });
  if (!kupac) notFound();

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
                Nova aktivnost — {kupac.nazivLokala}
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

        <form action={spremiAktivnost} className="space-y-4">
          <input type="hidden" name="kupacId" value={kupac.id} />

          <Card title="Aktivnost">
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="datum" label="Datum" type="date" defaultValue={danas} />
              <Field name="tko" label="Tko (osoba / kontakt)" />
            </div>

            <div className="mt-4">
              <TextArea
                name="opis"
                label="Opis aktivnosti"
                rows={4}
                placeholder="Što je napravljeno (poziv, posjet, ponuda, uzorci...)"
              />
            </div>
          </Card>

          <Card title="Nastavak i potencijal">
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="sljedecaAktivnost" label="Sljedeća aktivnost" />
              <Field name="datumSljedece" label="Datum sljedeće aktivnosti" type="date" />
              <Field
                name="vjerojatnostZakljucenja"
                label="Vjerojatnost zaključenja (%)"
                type="number"
              />
            </div>

            <div className="mt-4">
              <TextArea
                name="stoNastaviti"
                label="Što nastaviti"
                rows={3}
                placeholder="Što treba dovršiti / na čemu nastaviti raditi"
              />
            </div>

            <div className="mt-4">
              <TextArea name="zabiljeska" label="Zabilješke" rows={4} />
            </div>
          </Card>

          <div className="sticky bottom-4 z-40 flex justify-end border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4 shadow-2xl">
            <button
              type="submit"
              className="border border-orange-300 bg-gradient-to-b from-orange-100 to-amber-100 px-5 py-3 text-[14px] font-semibold text-orange-950 transition hover:brightness-105"
            >
              Spremi aktivnost
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
