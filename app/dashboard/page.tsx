import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

type AuthUser = {
  id: string;
  ime: string;
  role: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

function DashboardCard({
  href,
  title,
  description,
  monitor = false,
}: {
  href: string;
  title: string;
  description: string;
  monitor?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="block p-5 transition-all duration-200 hover:-translate-y-[3px]"
      style={{
        background: "#14131c",
        border: monitor ? "2px solid #ff2f92" : "2px solid #5b6b88",
        boxShadow: monitor
          ? "0 6px 18px rgba(0,0,0,0.45), 0 0 18px rgba(255,47,146,0.25)"
          : "0 6px 18px rgba(0,0,0,0.35)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        textDecoration: "none",
      }}
    >
      <h2
        className="text-[20px] font-semibold tracking-[0.05em]"
        style={{ color: "#ffffff" }}
      >
        {title}
      </h2>

      <p
        className="mt-3 text-[14px] leading-relaxed"
        style={{
          color: "#f2f2f2",
          opacity: 0.95,
        }}
      >
        {description}
      </p>
    </Link>
  );
}

export default async function DashboardPage() {
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

  const isAdmin = user.role === "ADMIN";
  const isLevel1 = user.role === "ADMIN" || user.role === "ENOLOG";
  const isLevel2 = user.role === "PODRUM" || user.role === "PREGLED";

  if (!isLevel1 && !isLevel2) {
    redirect("/login");
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
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-4xl font-semibold text-white">
              Pozdrav, {user.ime}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.72)" }}>
              Odaberi kamo želiš ući.
            </p>
          </div>

          <LogoutButton />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <DashboardCard
            href="/zadaci"
            title="Zadaci"
            description="Pregled i izvršavanje zadataka"
          />

          <DashboardCard
            href="/monitor"
            title="MONITOR"
            description="Glavni pregled svih tankova"
            monitor
          />

          {isLevel1 && (
            <>
              <DashboardCard
                href="/tankovi"
                title="Tankovi"
                description="Pregled svih tankova i stanja vina"
              />

              <DashboardCard
                href="/tankovi/qr"
                title="QR kodovi"
                description="Ispis QR naljepnica za tankove"
              />

              <DashboardCard
                href="/mjerenje"
                title="Mjerenja"
                description="Unos i pregled mjerenja"
              />

              <DashboardCard
                href="/preparat"
                title="Preparati"
                description="Baza preparata i preporučenih doza"
              />

              <DashboardCard
                href="/pretok"
                title="Pretoci / spajanja"
                description="Pretakanje vina, spajanje tankova i sastav vina"
              />

              <DashboardCard
                href="/punjenje"
                title="Punjenje / berba"
                description="Unos punjenja, berbe, sorti i količina"
              />

              <DashboardCard
                href="/berba"
                title="Berba"
                description="Statistika grožđa i ulaza"
              />

              <DashboardCard
                href="/arhiva"
                title="Arhiva vina"
                description="Pregled arhiviranih vina i povijesti"
              />

              {isAdmin && (
                <DashboardCard
                  href="/dashboard/korisnici"
                  title="Korisnici"
                  description="Upravljanje korisnicima"
                />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}