import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import AdminResetForm from "./reset-form";

type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export default async function DashboardResetPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("auth_user")?.value;

  if (!raw) redirect("/login");

  let user: AuthUser | null = null;

  try {
    user = JSON.parse(decodeURIComponent(raw));
  } catch {
    redirect("/login");
  }

  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <main
      className="min-h-screen p-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "radial-gradient(circle at top left, #5a1a3f 0%, #1f1526 25%, #14111c 50%, #0f0d14 100%)",
      }}
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Reset sustava</h1>
            <p className="mt-2 text-sm text-white/70">
              Ova stranica je dostupna samo administratoru. Jedinice se nikada ne brišu.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="rounded-xl border border-white/20 px-4 py-2 text-white transition hover:bg-white/10"
          >
            Natrag
          </Link>
        </div>

        <AdminResetForm />
      </div>
    </main>
  );
}