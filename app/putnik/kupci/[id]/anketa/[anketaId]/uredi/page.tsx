import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AnketaForm from "../../anketa-form";
import { azurirajAnketu } from "../../actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string; anketaId: string }>;

export default async function UrediAnketuPage({ params }: { params: PageParams }) {
  const { id, anketaId } = await params;

  const [kupac, anketa] = await Promise.all([
    prisma.putnikKupac.findUnique({ where: { id } }),
    prisma.putnikAnketaKupca.findUnique({ where: { id: anketaId } }),
  ]);

  if (!kupac || !anketa || anketa.kupacId !== kupac.id) notFound();

  return <AnketaForm kupac={kupac} action={azurirajAnketu} initial={anketa} />;
}
