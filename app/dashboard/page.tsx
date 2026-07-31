import Link from "next/link";
import { redirect } from "next/navigation";
import { citajSesiju } from "@/lib/auth-sesija";
import LogoutButton from "@/components/LogoutButton";
import SignatureAnimation from "@/components/SignatureAnimation";
import DashboardTopActions from "@/components/DashboardTopActions";
import PrisutnostGumb from "@/components/PrisutnostGumb";
import { prisma } from "@/lib/prisma";
import { satMinutaHr } from "@/lib/prisutnost";

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
  const user: AuthUser | null = await citajSesiju();

  if (!user) redirect("/login");

  const isLevel1 = user.role === "ADMIN";
  const isLevel2 = user.role === "PODRUM";
  const isLevel3 = user.role === "ENOLOG";
  const isLevel4 = user.role === "PREGLED";

  const canSeeMainDashboard = isLevel1 || isLevel2;
  const canSeeZadaci = isLevel1 || isLevel2 || isLevel3;
  const canSeeMonitor = isLevel1 || isLevel2 || isLevel3;
  const canSeePutnik = isLevel1 || isLevel2 || isLevel3 || isLevel4;
  const canSeeUsers = isLevel1;
  const canSeeReset = isLevel1;
  // Hlađenje ide svima OSIM putnika (PREGLED = Level 4 "samo putnik").
  const canSeeHladjenje = isLevel1 || isLevel2 || isLevel3;

  if (
    !isLevel1 &&
    !isLevel2 &&
    !isLevel3 &&
    !isLevel4
  ) {
    redirect("/login");
  }

  // Prisutnost je za sve role: gumb na vrhu mijenja stanje prema otvorenom zapisu.
  // Zapis se trazi po korisniku iz sesije (nikad iz forme/parametra).
  const otvorenaPrijava = await prisma.radnaPrijava.findFirst({
    where: { userId: user.id, odlazakU: null },
    orderBy: { dolazakU: "desc" },
    select: { dolazakU: true },
  });

  return (
    <main
      className="relative min-h-screen p-8 pb-28"
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

          <div className="flex items-center gap-3">
            <DashboardTopActions />
            <LogoutButton />
          </div>
        </div>

        {/* Prijava/odjava s posla — na samom vrhu, prije svih kartica, za sve role. */}
        <div
          className="mb-8"
          style={{
            background: "#14131c",
            border: "2px solid #5b6b88",
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
            padding: 16,
          }}
        >
          <PrisutnostGumb
            prijavljen={Boolean(otvorenaPrijava)}
            odKad={otvorenaPrijava ? satMinutaHr(otvorenaPrijava.dolazakU) : undefined}
            tamnaPodloga
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {canSeeZadaci && (
            <DashboardCard
              href="/zadaci"
              title="Zadaci"
              description="Pregled i izvršavanje zadataka"
            />
          )}

          {canSeeMonitor && (
            <DashboardCard
              href="/monitor"
              title="MONITOR"
              description="Glavni pregled svih tankova"
              monitor
            />
          )}

          {canSeePutnik && (
            <DashboardCard
              href="/putnik"
              title="Putnik"
              description="CRM za teren: kupci, ankete, dogovori, ulaganja i rast prodaje"
            />
          )}

          {canSeeHladjenje && (
            <DashboardCard
              href="/dashboard/hladjenje"
              title="Hlađenje"
              description="Nadzor i upravljanje temperaturom tankova"
            />
          )}

          {/* Prisutnost je za SVE prijavljene role — svatko bilježi svoj dolazak/odlazak. */}
          <DashboardCard
            href="/dashboard/prisutnost"
            title="Prisutnost"
            description="Prijava i odjava s posla, ploča prisutnosti i evidencija radnog vremena"
          />

          {canSeeMainDashboard && (
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
                href="/izlaz-vina"
                title="Izlaz vina"
                description="Evidencija izlaza vina iz tankova, prodaje i punjenja u boce"
              />

              <DashboardCard
                href="/statistika"
                title="Statistika"
                description="Količine vina u podrumu po sortama, godištima, položajima i tankovima"
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

              {canSeeUsers && (
                <DashboardCard
                  href="/dashboard/korisnici"
                  title="Korisnici"
                  description="Upravljanje korisnicima"
                />
              )}

              {canSeeReset && (
                <DashboardCard
                  href="/dashboard/reset"
                  title="Reset"
                  description="Administratorsko brisanje podataka sustava"
                />
              )}
            </>
          )}
        </div>
      </div>

      <SignatureAnimation />
    </main>
  );
}