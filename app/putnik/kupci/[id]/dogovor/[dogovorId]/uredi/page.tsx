import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DogovorForm from "../../dogovor-form";
import { azurirajDogovor } from "../../actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string; dogovorId: string }>;

export default async function UrediDogovorPage({ params }: { params: PageParams }) {
  const { id, dogovorId } = await params;

  const [kupac, dogovor] = await Promise.all([
    prisma.putnikKupac.findUnique({ where: { id } }),
    prisma.putnikDogovor.findUnique({ where: { id: dogovorId } }),
  ]);

  if (!kupac || !dogovor || dogovor.kupacId !== kupac.id) notFound();

  return <DogovorForm kupac={kupac} action={azurirajDogovor} initial={dogovor} />;
}
