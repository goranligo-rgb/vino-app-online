import Link from "next/link";
import NatragHome from "@/components/NatragHome";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";

export const dynamic = "force-dynamic";

// Jedan red stanja u autu — vino ili promo, samo količina koja je ostala.
type Red = {
  kind: "vino" | "promo";
  key: string;
  naziv: string;
  ostalo: number;
  jedinica: string;
};

export default async function VoziloPage() {
  // Sve razine (1-4) smiju vidjeti svoj auto; filtriramo po prijavljenom putniku.
  const user = await requirePutnikUser();
  const putnikIme = user.ime;

  const [zaduzenja, prodajaStavke, promoUlazi, promoOtpisi] = await Promise.all([
    // VINO ULAZ: zaduženja vina ovom putniku
    prisma.putnikVinoZaduzenje.findMany({
      where: { putnikIme },
      include: { artikl: { select: { naziv: true, zadanaJedinica: true } } },
    }),
    // VINO IZLAZ: prodaja + gratis iz auta (ODMAH stavke vezane na katalog)
    prisma.putnikPosjetStavka.findMany({
      where: { statusPripreme: "ODMAH", artiklId: { not: null }, posjet: { putnikIme } },
      include: { artikl: { select: { naziv: true, zadanaJedinica: true } } },
    }),
    // PROMO ULAZ: zaduženja promo materijala ovom putniku
    prisma.putnikPromoUlaz.findMany({
      where: { putnikIme },
      include: { artikl: { select: { naziv: true } } },
    }),
    // PROMO IZLAZ: otpis po lokalu, atribuiran putniku preko otpisaoKorisnikIme
    prisma.putnikPromoKupca.findMany({
      where: { artiklId: { not: null }, otpisaoKorisnikIme: putnikIme },
      include: { artikl: { select: { naziv: true } } },
    }),
  ]);

  // ── VINO: ostalo = Σ zaduženo − Σ prodano − Σ gratis ──
  const vinoMap = new Map<string, { naziv: string; jedinica: string; zaduzeno: number; izlaz: number }>();
  function recVino(artiklId: string, naziv: string, jedinica: string) {
    let r = vinoMap.get(artiklId);
    if (!r) {
      r = { naziv, jedinica, zaduzeno: 0, izlaz: 0 };
      vinoMap.set(artiklId, r);
    }
    return r;
  }
  for (const z of zaduzenja) {
    const jed = z.artikl.zadanaJedinica || z.jedinica || "kom";
    recVino(z.artiklId, z.artikl.naziv, jed).zaduzeno += z.kolicina;
  }
  for (const s of prodajaStavke) {
    if (!s.artiklId) continue;
    const jed = s.artikl?.zadanaJedinica || s.jedinica || "kom";
    recVino(s.artiklId, s.artikl?.naziv || s.nazivProizvoda, jed).izlaz += (s.kolicina || 0) + s.gratis;
  }

  // ── PROMO: ostalo = Σ zaduženo − Σ otpisano ──
  const promoMap = new Map<string, { naziv: string; zaduzeno: number; otpisano: number }>();
  function recPromo(artiklId: string, naziv: string) {
    let r = promoMap.get(artiklId);
    if (!r) {
      r = { naziv, zaduzeno: 0, otpisano: 0 };
      promoMap.set(artiklId, r);
    }
    return r;
  }
  for (const u of promoUlazi) {
    if (!u.putnikIme) continue; // stari globalni redovi (bez putnika) se preskaču
    recPromo(u.artiklId, u.artikl?.naziv || "—").zaduzeno += u.kolicina;
  }
  for (const o of promoOtpisi) {
    if (!o.artiklId) continue;
    recPromo(o.artiklId, o.artikl?.naziv || o.naziv || "—").otpisano += o.kolicina;
  }

  // ── Jedan spisak: vino + promo zajedno, sortiran po nazivu ──
  const redovi: Red[] = [
    ...[...vinoMap.entries()].map(([key, r]) => ({
      kind: "vino" as const,
      key,
      naziv: r.naziv,
      ostalo: r.zaduzeno - r.izlaz,
      jedinica: r.jedinica,
    })),
    ...[...promoMap.entries()].map(([key, r]) => ({
      kind: "promo" as const,
      key,
      naziv: r.naziv,
      ostalo: r.zaduzeno - r.otpisano,
      jedinica: "kom",
    })),
  ].sort((a, b) => a.naziv.localeCompare(b.naziv, "hr"));

  const brojArtikala = redovi.length;
  const brojMinus = redovi.filter((r) => r.ostalo < 0).length;

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-4 text-stone-800 [font-family:Calibri,Segoe_UI,Arial,sans-serif] md:px-6">
      <NatragHome />

      <div className="mx-auto max-w-[760px] space-y-4">
        {/* HEADER */}
        <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-stone-800">Stanje u autu</h1>
              <div className="mt-1 text-[14px] text-stone-500">
                Što ti trenutno piše u autu — vino i promo. Prođi kroz auto i usporedi. Ovo je samo pregled, ne mijenja zalihu.
              </div>
              <div className="mt-2 text-[15px] font-semibold text-orange-900">Putnik: {putnikIme}</div>
            </div>
            <Link href="/putnik" className="self-start border border-orange-300 bg-white px-4 py-2 text-[14px] font-semibold text-stone-700 hover:bg-orange-50">
              Natrag na putnik
            </Link>
          </div>
        </div>

        {/* SAŽETAK */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-3">
            <div className="text-[12px] uppercase tracking-[0.14em] text-orange-800/70">Artikala u autu</div>
            <div className="mt-1 text-[30px] leading-none font-semibold text-stone-800">{brojArtikala}</div>
          </div>
          <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 px-4 py-3">
            <div className="text-[12px] uppercase tracking-[0.14em] text-orange-800/70">U minusu</div>
            <div className={`mt-1 text-[30px] leading-none font-semibold ${brojMinus > 0 ? "text-red-600" : "text-stone-800"}`}>{brojMinus}</div>
          </div>
        </div>

        {/* SPISAK */}
        {brojArtikala === 0 ? (
          <div className="border border-orange-200 bg-white px-4 py-6 text-center text-[15px] text-stone-500">
            Nemaš ničega zaduženog u autu.
          </div>
        ) : (
          <div className="divide-y divide-orange-100 border border-orange-200 bg-white">
            {redovi.map((r) => {
              const minus = r.ostalo < 0;
              return (
                <div key={`${r.kind}-${r.key}`} className="flex items-center justify-between gap-3 px-4 py-4">
                  <div className="min-w-0">
                    <span
                      className={`mb-1 inline-flex border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        r.kind === "vino"
                          ? "border-purple-300 bg-purple-50 text-purple-800"
                          : "border-amber-300 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {r.kind}
                    </span>
                    <div className="text-[19px] font-semibold leading-tight text-stone-800">{r.naziv}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-[30px] font-bold leading-none ${minus ? "text-red-600" : "text-stone-800"}`}>
                      {r.ostalo}
                    </div>
                    <div className={`mt-0.5 text-[13px] ${minus ? "text-red-500" : "text-stone-500"}`}>{r.jedinica}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
