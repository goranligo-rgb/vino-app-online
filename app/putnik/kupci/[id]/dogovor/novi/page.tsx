import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DogovorForm from "../dogovor-form";
import { spremiDogovor } from "../actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

export default async function NoviDogovorPage({ params }: { params: PageParams }) {
  const { id } = await params;

  const kupac = await prisma.putnikKupac.findUnique({ where: { id } });
  if (!kupac) notFound();

  return <DogovorForm kupac={kupac} action={spremiDogovor} />;
}
