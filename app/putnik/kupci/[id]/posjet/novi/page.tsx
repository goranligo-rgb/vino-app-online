import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PosjetForm from "./posjet-form";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

export default async function NoviPosjetPage({ params }: { params: PageParams }) {
  const { id } = await params;

  const kupac = await prisma.putnikKupac.findUnique({
    where: { id },
  });

  if (!kupac) notFound();

  const danas = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <div className="mx-auto max-w-[1100px] space-y-4">
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-orange-800/70">
                Putnik / teren CRM
              </div>
              <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-stone-800">
                Novi posjet — {kupac.nazivLokala}
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Narudžba, ostavljeni materijal, dug i zabilješke s terena.
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

        <PosjetForm kupacId={kupac.id} danas={danas} />
      </div>
    </main>
  );
}
