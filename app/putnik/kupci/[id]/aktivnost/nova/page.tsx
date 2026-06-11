import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AktivnostForm from "../aktivnost-form";
import { spremiAktivnost } from "../actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

export default async function NovaAktivnostPage({ params }: { params: PageParams }) {
  const { id } = await params;

  const kupac = await prisma.putnikKupac.findUnique({ where: { id } });
  if (!kupac) notFound();

  return <AktivnostForm kupac={kupac} action={spremiAktivnost} />;
}
