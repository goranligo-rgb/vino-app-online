import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AktivnostForm from "../../aktivnost-form";
import { azurirajAktivnost } from "../../actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string; aktivnostId: string }>;

export default async function UrediAktivnostPage({ params }: { params: PageParams }) {
  const { id, aktivnostId } = await params;

  const [kupac, aktivnost] = await Promise.all([
    prisma.putnikKupac.findUnique({ where: { id } }),
    prisma.putnikAktivnost.findUnique({ where: { id: aktivnostId } }),
  ]);

  if (!kupac || !aktivnost || aktivnost.kupacId !== kupac.id) notFound();

  return <AktivnostForm kupac={kupac} action={azurirajAktivnost} initial={aktivnost} />;
}
