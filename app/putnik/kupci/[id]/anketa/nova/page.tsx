import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AnketaForm from "../anketa-form";
import { spremiAnketu } from "../actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

export default async function NovaAnketaPage({ params }: { params: PageParams }) {
  const { id } = await params;

  const kupac = await prisma.putnikKupac.findUnique({ where: { id } });
  if (!kupac) notFound();

  return <AnketaForm kupac={kupac} action={spremiAnketu} />;
}
