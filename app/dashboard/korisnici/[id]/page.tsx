import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";

type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function spremiKorisnika(formData: FormData) {
  "use server";

  // Provjera UNUTAR akcije (ne oslanjaj se samo na middleware/page redirect):
  // uređivanje korisnika i mijenjanje šifre smije samo ADMIN (L1).
  const trenutni: AuthUser | null = await citajSesiju();

  if (!trenutni || trenutni.role !== "ADMIN") {
    redirect("/login");
  }

  const id = String(formData.get("id") || "");
  const ime = String(formData.get("ime") || "");
  const username = String(formData.get("username") || "");
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "").trim();
  const roleInput = String(formData.get("role") || "");
  const activeInput = String(formData.get("active") || "false");

  if (!id || !ime || !email || !roleInput) return;

  const role =
    roleInput === "ADMIN" ||
      roleInput === "PODRUM" ||
      roleInput === "ENOLOG" ||
      roleInput === "PREGLED"
      ? roleInput
      : "PREGLED";

  await prisma.user.update({
    where: { id },
    data: {
      ime,
      username: username || null,
      email,
      role,
      active: activeInput === "true",
      password: password !== "" ? password : undefined,
    },
  });

  revalidatePath("/dashboard/korisnici");
  revalidatePath(`/dashboard/korisnici/${id}`);
  redirect("/dashboard/korisnici");
}

function levelLabel(role: string) {
  if (role === "ADMIN") return "Level 1";
  if (role === "PODRUM") return "Level 2";
  if (role === "ENOLOG") return "Level 3";
  if (role === "PREGLED") return "Level 4";
  return role;
}

export default async function UrediKorisnikaPage({ params }: PageProps) {
  const { id } = await params;

  const user: AuthUser | null = await citajSesiju();

  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const korisnik = await prisma.user.findUnique({
    where: { id },
  });

  if (!korisnik) notFound();

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-gray-900">
              Uredi korisnika
            </h1>
            <p className="text-gray-600">
              Uređivanje podataka za korisnika: {korisnik.ime}
            </p>
          </div>

          <Link
            href="/dashboard/korisnici"
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
          >
            Natrag
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <form action={spremiKorisnika} className="grid gap-4">
            <input type="hidden" name="id" value={korisnik.id} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Ime</label>
                <input
                  type="text"
                  name="ime"
                  defaultValue={korisnik.ime ?? ""}
                  required
                  className="w-full rounded-none border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  defaultValue={korisnik.username ?? ""}
                  className="w-full rounded-none border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  name="email"
                  defaultValue={korisnik.email ?? ""}
                  required
                  className="w-full rounded-none border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">
                  Nova šifra
                </label>
                <input
                  type="password"
                  name="password"
                  placeholder="Ostavi prazno ako ne mijenjaš"
                  className="w-full rounded-none border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Level</label>
                <select
                  name="role"
                  defaultValue={korisnik.role}
                  className="w-full rounded-none border border-gray-300 px-3 py-2"
                >
                  <option value="ADMIN">Level 1 - sve + reset</option>
                  <option value="PODRUM">Level 2 - sve bez reseta</option>
                  <option value="ENOLOG">Level 3 - zadaci, monitor, putnik</option>
                  <option value="PREGLED">Level 4 - samo putnik</option>
                </select>
              </div>

              <div className="grid gap-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">
                  Aktivan
                </label>
                <select
                  name="active"
                  defaultValue={korisnik.active ? "true" : "false"}
                  className="w-full rounded-none border border-gray-300 px-3 py-2"
                >
                  <option value="true">DA</option>
                  <option value="false">NE</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="rounded-none bg-yellow-400 px-4 py-2 font-semibold text-black hover:bg-yellow-500"
              >
                Spremi promjene
              </button>

              <Link
                href="/dashboard/korisnici"
                className="rounded-none border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:bg-gray-50"
              >
                Odustani
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}