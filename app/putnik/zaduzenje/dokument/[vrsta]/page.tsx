import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireLevel12User } from "@/lib/putnik-auth";
import { formatHrDate, formatHrDateTime } from "@/lib/datum";
import { VINARIJA } from "@/lib/vinarija";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tri vrste dokumenta; zajednički layout, različit izvor podataka.
const VRSTE = {
  otpremnica: { naslov: "Otpremnica (zaduženje)", sGratis: false },
  razduzenje: { naslov: "Razduženje (povrat)", sGratis: false },
  prodaja: { naslov: "Popis prodaje / gratisa", sGratis: true },
} as const;
type Vrsta = keyof typeof VRSTE;

// Jedan red dokumenta. Za otpremnicu/razduženje koristi se samo `kolicina`;
// za popis prodaje `prodano` + `gratis`.
type Red = { tip: "vino" | "promo"; naziv: string; jedinica: string; kolicina: number; prodano: number; gratis: number };

function formatBroj(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toLocaleString("hr-HR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Zbraja duplikate istog artikla (isti tip + naziv + jedinica) u jedan red.
function agregiraj(sirovi: Red[]): Red[] {
  const map = new Map<string, Red>();
  for (const r of sirovi) {
    const key = `${r.tip}|${r.naziv}|${r.jedinica}`;
    const post = map.get(key);
    if (post) {
      post.kolicina += r.kolicina;
      post.prodano += r.prodano;
      post.gratis += r.gratis;
    } else {
      map.set(key, { ...r });
    }
  }
  // Vino prvo, pa promo; unutar grupe po nazivu.
  return [...map.values()].sort(
    (a, b) => (a.tip === b.tip ? a.naziv.localeCompare(b.naziv, "hr") : a.tip === "vino" ? -1 : 1)
  );
}

async function dohvatiRedove(vrsta: Vrsta, putnik: string, gte: Date, lte: Date): Promise<Red[]> {
  if (vrsta === "otpremnica") {
    const [vino, promo] = await Promise.all([
      prisma.putnikVinoZaduzenje.findMany({
        where: { putnikIme: putnik, datum: { gte, lte } },
        include: { artikl: { select: { naziv: true, zadanaJedinica: true } } },
      }),
      prisma.putnikPromoUlaz.findMany({
        where: { putnikIme: putnik, datum: { gte, lte } },
        include: { artikl: { select: { naziv: true } } },
      }),
    ]);
    return [
      ...vino.map<Red>((z) => ({ tip: "vino", naziv: z.artikl.naziv, jedinica: z.artikl.zadanaJedinica || z.jedinica || "kom", kolicina: z.kolicina, prodano: 0, gratis: 0 })),
      ...promo.map<Red>((u) => ({ tip: "promo", naziv: u.artikl?.naziv || "—", jedinica: "kom", kolicina: u.kolicina, prodano: 0, gratis: 0 })),
    ];
  }

  if (vrsta === "razduzenje") {
    const [vino, promo] = await Promise.all([
      prisma.putnikVinoPovrat.findMany({
        where: { putnikIme: putnik, datum: { gte, lte } },
        include: { artikl: { select: { naziv: true, zadanaJedinica: true } } },
      }),
      prisma.putnikPromoPovrat.findMany({
        where: { putnikIme: putnik, datum: { gte, lte } },
        include: { artikl: { select: { naziv: true } } },
      }),
    ]);
    return [
      ...vino.map<Red>((p) => ({ tip: "vino", naziv: p.artikl.naziv, jedinica: p.artikl.zadanaJedinica || p.jedinica || "kom", kolicina: p.kolicina, prodano: 0, gratis: 0 })),
      ...promo.map<Red>((p) => ({ tip: "promo", naziv: p.artikl?.naziv || "—", jedinica: "kom", kolicina: p.kolicina, prodano: 0, gratis: 0 })),
    ];
  }

  // prodaja: vino = ODMAH stavke iz posjeta; promo = ODMAH otpisi dani lokalima
  const [vino, promo] = await Promise.all([
    prisma.putnikPosjetStavka.findMany({
      where: { statusPripreme: "ODMAH", posjet: { putnikIme: putnik, datum: { gte, lte } } },
      include: { artikl: { select: { naziv: true } } },
    }),
    prisma.putnikPromoKupca.findMany({
      where: { statusPripreme: "ODMAH", artiklId: { not: null }, otpisaoKorisnikIme: putnik, datumPredaje: { gte, lte } },
      include: { artikl: { select: { naziv: true } } },
    }),
  ]);
  return [
    ...vino.map<Red>((s) => ({ tip: "vino", naziv: s.artikl?.naziv || s.nazivProizvoda, jedinica: s.jedinica || "kom", kolicina: 0, prodano: s.kolicina || 0, gratis: s.gratis })),
    ...promo.map<Red>((o) => ({ tip: "promo", naziv: o.artikl?.naziv || o.naziv || "—", jedinica: "kom", kolicina: 0, prodano: 0, gratis: o.kolicina })),
  ];
}

export default async function DokumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ vrsta: string }>;
  searchParams: Promise<{ putnik?: string; datum?: string }>;
}) {
  noStore();
  await requireLevel12User();

  const { vrsta } = await params;
  if (!(vrsta in VRSTE)) return notFound();
  const konfig = VRSTE[vrsta as Vrsta];

  const sp = await searchParams;
  const putnik = (sp.putnik || "").trim();
  const datum = (sp.datum || "").trim();

  const natrag = (
    <Link href="/putnik/zaduzenje" style={actionButtonStyle}>
      ← Natrag na zaduženje
    </Link>
  );

  // Dokument je po putniku + datumu; bez oba nema što ispisati.
  if (!putnik || !datum) {
    return (
      <div style={pageStyle}>
        <div style={topActionsStyle}>{natrag}</div>
        <div style={reportWrapStyle}>
          <div style={mutedStyle}>Odaberi putnika i datum na stranici zaduženja pa otvori dokument.</div>
        </div>
      </div>
    );
  }

  const gte = new Date(`${datum}T00:00:00`);
  const lte = new Date(`${datum}T23:59:59.999`);
  const redovi = agregiraj(await dohvatiRedove(vrsta as Vrsta, putnik, gte, lte));

  const generirano = formatHrDateTime(new Date());

  return (
    <div style={pageStyle}>
      <style>{`
        @media print {
          html, body { background:#fff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
          a[href] { text-decoration:none !important; color:#000 !important; }
          .no-print { display:none !important; }
          body * { box-sizing:border-box !important; }
          @page { size: A4 portrait; margin: 14mm; }
        }
      `}</style>

      <div className="no-print" style={topActionsStyle}>
        {natrag}
        <PrintButton />
        <div style={infoButtonStyle}>Za PDF koristi Ctrl+P → Save as PDF</div>
      </div>

      <div style={reportWrapStyle}>
        {/* Zaglavlje vinarije */}
        <div style={reportHeaderStyle}>
          <div>
            <div style={vinarijaNazivStyle}>{VINARIJA.naziv}</div>
            <div style={vinarijaSubStyle}>{VINARIJA.adresa}</div>
            <div style={vinarijaSubStyle}>OIB: {VINARIJA.oib}</div>
          </div>
          <div style={headerInfoBoxStyle}>
            <div>Generirano: {generirano}</div>
          </div>
        </div>

        {/* Naslov + putnik/datum */}
        <h1 style={docTitleStyle}>{konfig.naslov}</h1>
        <div style={metaRowStyle}>
          <div><span style={metaLabelStyle}>Putnik:</span> <strong>{putnik}</strong></div>
          <div><span style={metaLabelStyle}>Datum:</span> <strong>{formatHrDate(gte)}</strong></div>
        </div>

        {/* Tablica */}
        {redovi.length === 0 ? (
          <div style={mutedStyle}>Nema stavki za odabranog putnika i datum.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Artikl</th>
                {konfig.sGratis ? (
                  <>
                    <th style={thNumStyle}>Prodano</th>
                    <th style={thNumStyle}>Gratis</th>
                  </>
                ) : (
                  <th style={thNumStyle}>Količina</th>
                )}
                <th style={thJedStyle}>Jedinica</th>
              </tr>
            </thead>
            <tbody>
              {redovi.map((r, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <span style={tagStyle}>{r.tip}</span>
                    {r.naziv}
                  </td>
                  {konfig.sGratis ? (
                    <>
                      <td style={tdNumStyle}>{r.tip === "promo" ? "—" : formatBroj(r.prodano)}</td>
                      <td style={tdNumStyle}>{formatBroj(r.gratis)}</td>
                    </>
                  ) : (
                    <td style={tdNumStyle}>{formatBroj(r.kolicina)}</td>
                  )}
                  <td style={tdJedStyle}>{r.tip === "vino" ? r.jedinica : "kom"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Potpisi */}
        <div style={potpisiStyle}>
          <div style={potpisStyle}>
            <div style={potpisLinijaStyle} />
            <div style={potpisLabelStyle}>Voditelj</div>
          </div>
          <div style={potpisStyle}>
            <div style={potpisLinijaStyle} />
            <div style={potpisLabelStyle}>Putnik</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */
const pageStyle: React.CSSProperties = { background: "#eef0f3", minHeight: "100vh", padding: 18, fontFamily: "Calibri, Segoe UI, Arial, sans-serif", color: "#1f2937" };
const topActionsStyle: React.CSSProperties = { maxWidth: 820, margin: "0 auto 12px auto", display: "flex", gap: 8, flexWrap: "wrap" };
const actionButtonStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", padding: "8px 12px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#111827", textDecoration: "none", fontSize: 13 };
const infoButtonStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", padding: "8px 12px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontSize: 13 };
const reportWrapStyle: React.CSSProperties = { width: "100%", maxWidth: 820, margin: "0 auto", background: "#ffffff", border: "1px solid #d1d5db", padding: 20 };
const reportHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", borderBottom: "2px solid #111827", paddingBottom: 12, marginBottom: 14 };
const vinarijaNazivStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700, lineHeight: 1.1 };
const vinarijaSubStyle: React.CSSProperties = { fontSize: 12, color: "#374151", marginTop: 2 };
const headerInfoBoxStyle: React.CSSProperties = { fontSize: 12, color: "#374151", textAlign: "right" };
const docTitleStyle: React.CSSProperties = { margin: "6px 0 10px 0", fontSize: 24, fontWeight: 700 };
const metaRowStyle: React.CSSProperties = { display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14, marginBottom: 14 };
const metaLabelStyle: React.CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 700, textTransform: "uppercase" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 10px", background: "#f3f4f6", border: "1px solid #d1d5db", fontWeight: 700 };
const thNumStyle: React.CSSProperties = { ...thStyle, textAlign: "right", width: 100 };
const thJedStyle: React.CSSProperties = { ...thStyle, width: 90 };
const tdStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right" };
const tdJedStyle: React.CSSProperties = { ...tdStyle };
const tagStyle: React.CSSProperties = { display: "inline-block", marginRight: 8, padding: "1px 6px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", border: "1px solid #cbd5e1", color: "#475569", background: "#f8fafc" };
const potpisiStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 40, marginTop: 48, breakInside: "avoid" };
const potpisStyle: React.CSSProperties = { flex: 1, textAlign: "center" };
const potpisLinijaStyle: React.CSSProperties = { borderTop: "1px solid #111827", marginBottom: 6 };
const potpisLabelStyle: React.CSSProperties = { fontSize: 12, color: "#374151", fontWeight: 700 };
const mutedStyle: React.CSSProperties = { color: "#6b7280", fontSize: 14 };
