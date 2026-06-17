import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PosjetForm, { type InitialPosjet } from "../../posjet-form";
import PosjetSlike, { type SlikaPrikaz } from "../../posjet-slike";
import { potpisaniUrl } from "@/lib/supabase-storage";
import { azurirajPosjet } from "../../actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string; posjetId: string }>;

export default async function UrediPosjetPage({ params }: { params: PageParams }) {
  const { id, posjetId } = await params;

  const [kupac, posjet] = await Promise.all([
    prisma.putnikKupac.findUnique({ where: { id } }),
    prisma.putnikPosjet.findUnique({
      where: { id: posjetId },
      include: {
        stavke: { orderBy: { createdAt: "asc" } },
        promoOtpisi: { orderBy: { createdAt: "asc" } },
      },
    }),
  ]);

  if (!kupac || !posjet || posjet.kupacId !== kupac.id) notFound();

  // Prijedlog gratisa iz zadnjeg dogovora lokala: 24+4 / 12+2 / 6+1 / 0.
  const zadnjiDogovor = await prisma.putnikDogovor.findFirst({
    where: { kupacId: id },
    orderBy: { createdAt: "desc" },
    select: { akcija6Plus1: true, akcija12Plus2: true, akcija24Plus4: true },
  });

  let akcijaX = 0;
  let akcijaY = 0;
  if (zadnjiDogovor?.akcija24Plus4) {
    akcijaX = 24;
    akcijaY = 4;
  } else if (zadnjiDogovor?.akcija12Plus2) {
    akcijaX = 12;
    akcijaY = 2;
  } else if (zadnjiDogovor?.akcija6Plus1) {
    akcijaX = 6;
    akcijaY = 1;
  }

  const [promoArtikli, vina] = await Promise.all([
    prisma.putnikPromoArtikl.findMany({
      where: { aktivan: true },
      orderBy: { naziv: "asc" },
      select: { id: true, naziv: true },
    }),
    prisma.putnikVinoArtikl.findMany({
      where: { aktivan: true },
      orderBy: { naziv: "asc" },
      select: { id: true, naziv: true, zadanaJedinica: true },
    }),
  ]);

  const danas = new Date().toISOString().slice(0, 10);

  // Slike posjeta + potpisani URL-ovi (bucket je privatan, URL istekne za 1h).
  // Stranica je force-dynamic pa se URL-ovi svjeze potpisuju na svaki render.
  const slikeRedovi = await prisma.putnikPosjetSlika.findMany({
    where: { posjetId },
    orderBy: { createdAt: "asc" },
  });
  const slike: SlikaPrikaz[] = await Promise.all(
    slikeRedovi.map(async (s) => ({
      id: s.id,
      tip: s.tip,
      url: await potpisaniUrl(s.putanja),
      putnikIme: s.putnikIme,
    }))
  );

  const initial: InitialPosjet = {
    id: posjet.id,
    datum: posjet.datum,
    ukupanDug: posjet.ukupanDug,
    dospjeliDug: posjet.dospjeliDug,
    biljeska: posjet.biljeska,
    mjesto: posjet.mjesto,
    vrijemeOd: posjet.vrijemeOd,
    vrijemeDo: posjet.vrijemeDo,
    tipObilaska: posjet.tipObilaska,
    tipPremise: posjet.tipPremise,
    stanjeProizvoda: posjet.stanjeProizvoda,
    kilometri: posjet.kilometri,
    cijena: posjet.cijena,
    problemi: posjet.problemi,
    aktDegustacija: posjet.aktDegustacija,
    aktVidljivost: posjet.aktVidljivost,
    aktSlaganjeRobe: posjet.aktSlaganjeRobe,
    aktIstaknuteCijene: posjet.aktIstaknuteCijene,
    aktAkcijskaCijena: posjet.aktAkcijskaCijena,
    stavke: posjet.stavke.map((s) => ({
      nazivProizvoda: s.nazivProizvoda,
      artiklId: s.artiklId,
      kolicina: s.kolicina,
      jedinica: s.jedinica,
      gratis: s.gratis,
      statusPripreme: s.statusPripreme,
    })),
    promoOtpisi: posjet.promoOtpisi.map((o) => ({
      artiklId: o.artiklId,
      kolicina: o.kolicina,
      statusPripreme: o.statusPripreme,
    })),
  };

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
                Uredi posjet — {kupac.nazivLokala}
              </h1>
              <div className="mt-1 text-[13px] text-stone-500">
                Izmjena narudžbe, poklona, duga i zabilješki. Zaliha se preračuna automatski.
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

        <PosjetForm
          kupacId={kupac.id}
          danas={danas}
          akcijaX={akcijaX}
          akcijaY={akcijaY}
          vina={vina}
          promoArtikli={promoArtikli}
          action={azurirajPosjet}
          initial={initial}
        />

        <PosjetSlike posjetId={posjet.id} slike={slike} />
      </div>
    </main>
  );
}
