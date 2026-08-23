import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthUser, smijeRaditiUPodrumu } from "@/lib/zadatak-auth";
import FiltracijaForma, { type TankIzbor } from "./filtracija-forma";
import { jePrijenosVina, nazivVrste } from "@/lib/vrste-prijenosa";

export const dynamic = "force-dynamic";

/**
 * Ekran za izvrsenje prijenosa vina: FILTRACIJA, FLOTACIJA ili TALOZENJE.
 *
 * Sve tri su fizicki ista radnja pa dijele ovaj ekran i istu rutu; razlikuju se
 * samo po imenu koje korisnik vidi (lib/vrste-prijenosa.ts).
 *
 * Zadatak se ZADAJE na /zadaci, bez litara i bez ciljnih tankova — to je plan.
 * Ovdje se upisuje sto se stvarno dogodilo i pokrece prijenos vina.
 *
 * Rola se provjerava i ovdje, ne samo u proxyju: proxy stiti navigaciju, ali
 * stranica se moze zatraziti i izravno.
 */
export default async function FiltracijaIzvrsenjePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();

  const { id } = await params;

  const user = await getAuthUser();
  if (!user) redirect("/login");

  if (!smijeRaditiUPodrumu(user)) redirect("/zadaci");

  const zadatak = await prisma.zadatak.findUnique({
    where: { id },
    select: {
      id: true,
      naslov: true,
      napomena: true,
      vrsta: true,
      status: true,
      zadanoAt: true,
      zakljucanDo: true,
      kolicinaIzlaz: true,
      tank: {
        select: {
          id: true,
          broj: true,
          kapacitet: true,
          kolicinaVinaUTanku: true,
          nazivVina: true,
          sorta: true,
          godiste: true,
        },
      },
      tankStavke: {
        orderBy: { redoslijed: "asc" },
        select: { ciljTankId: true, kolicina: true },
      },
    },
  });

  if (!zadatak || !jePrijenosVina(zadatak.vrsta)) notFound();

  if (zadatak.status !== "OTVOREN") {
    return (
      <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>
          {nazivVrste(zadatak.vrsta)}
        </h1>
        <p style={{ color: "#6b7280" }}>
          Ovaj zadatak nije otvoren
          {zadatak.status === "IZVRSEN" ? " — već je izvršen." : " — otkazan je."}
        </p>
        <Link href="/zadaci" style={{ color: "#166534" }}>
          ← natrag na zadatke
        </Link>
      </main>
    );
  }

  if (zadatak.zakljucanDo && new Date() < new Date(zadatak.zakljucanDo)) {
    return (
      <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>
          {nazivVrste(zadatak.vrsta)}
        </h1>
        <p style={{ color: "#6b7280" }}>
          Vezani zadatak još nije dostupan za izvršenje (otključava se{" "}
          {new Date(zadatak.zakljucanDo).toLocaleDateString("hr-HR")}).
        </p>
        <Link href="/zadaci" style={{ color: "#166534" }}>
          ← natrag na zadatke
        </Link>
      </main>
    );
  }

  const tankovi: TankIzbor[] = await prisma.tank.findMany({
    orderBy: { broj: "asc" },
    select: {
      id: true,
      broj: true,
      kapacitet: true,
      kolicinaVinaUTanku: true,
      nazivVina: true,
      sorta: true,
      godiste: true,
    },
  });

  return (
    <main style={{ paddingTop: 8 }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
        <Link href="/zadaci" style={{ color: "#166534", fontSize: 14 }}>
          ← natrag na zadatke
        </Link>
      </div>

      <FiltracijaForma
        zadatak={{
          id: zadatak.id,
          vrsta: zadatak.vrsta,
          naslov: zadatak.naslov,
          napomena: zadatak.napomena,
          zadanoAt: zadatak.zadanoAt.toISOString(),
          kolicinaIzlaz:
            zadatak.kolicinaIzlaz != null ? Number(zadatak.kolicinaIzlaz) : null,
          izvorTank: zadatak.tank,
          planiraneStavke: zadatak.tankStavke.map((s) => ({
            ciljTankId: s.ciljTankId,
            kolicina: Number(s.kolicina),
          })),
        }}
        tankovi={tankovi}
      />
    </main>
  );
}
