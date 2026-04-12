import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import DodajKorisnikaForm from "./dodaj-korisnika-form";

type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

function levelLabel(role: string) {
  if (role === "ADMIN") return "Level 1";
  if (role === "PODRUM") return "Level 2";
  if (role === "ENOLOG") return "Enolog";
  if (role === "PREGLED") return "Pregled";
  return role;
}

async function obrisiKorisnika(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "");
  if (!id) return;

  await prisma.user.delete({
    where: { id },
  });

  revalidatePath("/dashboard/korisnici");
}

export default async function KorisniciPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("auth_user")?.value;

  if (!raw) redirect("/login");

  let user: AuthUser | null = null;

  try {
    user = JSON.parse(decodeURIComponent(raw));
  } catch {
    redirect("/login");
  }

  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const korisnici = await prisma.user.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  return (
    <main className="min-h-screen bg-gradient-to-br from-stone-100 via-emerald-50/35 to-stone-200 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-800">
              Korisnici
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Pregled i dodavanje korisnika aplikacije.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center border border-emerald-200 bg-white px-4 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-emerald-50"
          >
            Natrag
          </Link>
        </div>

        <div className="border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/40 to-stone-50 p-5 shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-stone-800">
              Novi korisnik
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Dodaj novog korisnika i odredi razinu pristupa aplikaciji.
            </p>
          </div>

          <DodajKorisnikaForm />
        </div>

        <div className="overflow-hidden border border-emerald-200/80 bg-white shadow-[0_16px_35px_rgba(21,128,61,0.08)]">
          <table className="min-w-full">
            <thead className="bg-emerald-50/60">
              <tr className="text-left text-sm text-stone-600">
                <th className="px-4 py-3">Ime</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Aktivan</th>
                <th className="px-4 py-3">Akcije</th>
              </tr>
            </thead>

            <tbody>
              {korisnici.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-stone-500"
                  >
                    Nema unesenih korisnika.
                  </td>
                </tr>
              ) : (
                korisnici.map((k) => (
                  <tr key={k.id} className="border-t border-emerald-100 text-sm">
                    <td className="px-4 py-3 font-medium text-stone-800">
                      {k.ime}
                    </td>

                    <td className="px-4 py-3 text-stone-700">
                      {k.username ?? "-"}
                    </td>

                    <td className="px-4 py-3 text-stone-700">{k.email}</td>

                    <td className="px-4 py-3 text-stone-700">
                      {levelLabel(k.role)}
                    </td>

                    <td className="px-4 py-3 text-stone-700">
                      {k.active ? "DA" : "NE"}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/korisnici/${k.id}`}
                          className="inline-flex h-10 items-center justify-center border border-amber-300 bg-gradient-to-r from-amber-200 to-yellow-100 px-3 text-xs font-semibold text-stone-800 transition hover:brightness-105"
                        >
                          Uredi
                        </Link>

                        <form action={obrisiKorisnika}>
                          <input type="hidden" name="id" value={k.id} />
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
                          >
                            Obriši
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}