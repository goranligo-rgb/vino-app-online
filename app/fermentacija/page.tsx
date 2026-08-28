/**
 * ZBIRNI PREGLED FERMENTACIJA — jedan redak po fermentaciji, spreman za ispis.
 *
 * Cita i prikazuje. Nista se ne upisuje.
 *
 * ZASTO SE KNJIGA CITA ODJEDNOM, A NE PO FERMENTACIJI
 * ---------------------------------------------------
 * `prozorFermentacije` je dva upita PO FERMENTACIJI. Za cetrdeset fermentacija
 * to je osamdeset upita u jednom prikazu — tocno ono sto lib/paralelno.ts
 * zabranjuje, jer pooler drzi 15 veza za CIJELU aplikaciju.
 *
 * Zato ovaj pregled ne poziva prozor. Cita CIJELU knjigu kretanja jednim
 * upitom (danas 207 redaka) i za svaku fermentaciju u memoriji izracuna sto je
 * u tanku bilo na pocetku. Isti obrazac koji `gdjeJeSveBerbe` u
 * lib/berba-model.ts vec koristi za stranicu /berba.
 *
 * Cetiri upita ukupno, bez obzira na broj fermentacija.
 *
 * OVDJE NEMA PREPARATA, TEMPERATURE NI SECERA. Pregled odgovara na "koje su
 * fermentacije bile i koliko su trajale". Sve ostalo je na dnevniku pojedine
 * fermentacije (/fermentacija/[id]) — ondje se cita ono sto jedan papir treba,
 * a ne cetrdeset puta po malo.
 *
 * KILOGRAMI SE NE ZBRAJAJU ni ovdje, pa ih ovaj pregled uopce ne prikazuje —
 * jedan redak po fermentaciji nema gdje pokazati redak po berbi. Litre jesu:
 * za njih se zna koliko ih je stvarno uslo. Tko treba kilograme, otvara dnevnik.
 */

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import PrintButton from "@/components/PrintButton";
import { berbeUTanku, type KretanjeBerbe } from "@/lib/fermentacija-prozor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function broj(v: number | null | undefined, decimala = 0): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimala,
  });
}

function datum(v: Date | null | undefined): string {
  if (!v) return "—";
  return v.toLocaleDateString("hr-HR");
}

function trajanjeDana(od: Date, doK: Date): number {
  return Math.max(0, Math.round((doK.getTime() - od.getTime()) / 86400000));
}

type Redak = {
  berbaId: string;
  izTankId: string | null;
  uTankId: string | null;
  ml: number;
  dogodenoAt: Date;
};

export default async function PregledFermentacijaPage({
  searchParams,
}: {
  searchParams?: Promise<{ godina?: string }> | { godina?: string };
}) {
  noStore();

  const sp = (await searchParams) ?? {};
  const sada = new Date();

  // --- Cetiri upita, broj ne raste s brojem fermentacija ------------------
  const [sveFermentacije, tankovi, berbe, kretanjaRedci] = await Promise.all([
    prisma.fermentacija.findMany({
      where: { obrisano: false },
      orderBy: [{ pocetakAt: "desc" }],
    }),
    prisma.tank.findMany({ select: { id: true, broj: true } }),
    prisma.berba.findMany({ select: { id: true, nazivSorte: true } }),
    prisma.$queryRaw<Redak[]>`
      SELECT k."berbaId", k."izTankId", k."uTankId",
             ROUND(k.litre::numeric * 1000)::float8 AS ml,
             k."dogodenoAt"
      FROM "BerbaKretanje" k
      ORDER BY k."dogodenoAt" ASC
    `,
  ]);

  const kretanja: KretanjeBerbe[] = kretanjaRedci.map((r) => ({
    berbaId: r.berbaId,
    izTankId: r.izTankId,
    uTankId: r.uTankId,
    ml: Number(r.ml),
    dogodenoAt: r.dogodenoAt,
  }));

  const brojTanka = new Map(tankovi.map((t) => [t.id, t.broj]));
  const sortaPoBerbi = new Map(berbe.map((b) => [b.id, b.nazivSorte]));

  // Sezona = godina pocetka. Zapis o berbi ima svoju `godinaBerbe`, ali jedna
  // fermentacija zna nositi vise berbi (blend), pa bi po njoj redak mogao
  // pripasti dvjema godinama odjednom. Pocetak je jednoznacan.
  const godine = [...new Set(sveFermentacije.map((f) => f.pocetakAt.getFullYear()))].sort(
    (a, b) => b - a
  );

  const trazena = sp.godina ? Number(sp.godina) : null;
  const godina =
    trazena && godine.includes(trazena) ? trazena : godine[0] ?? sada.getFullYear();

  const fermentacije = sveFermentacije.filter((f) => f.pocetakAt.getFullYear() === godina);

  const redci = fermentacije.map((f) => {
    const naPocetku = berbeUTanku(kretanja, f.tankId, f.pocetakAt);
    const berbaIds = [...naPocetku.keys()].sort(
      (a, b) => (naPocetku.get(b) ?? 0) - (naPocetku.get(a) ?? 0)
    );
    const litre = [...naPocetku.values()].reduce((s, x) => s + x, 0) / 1000;
    const kraj = f.krajAt ?? sada;

    return {
      f,
      sorte: berbaIds.map((b) => sortaPoBerbi.get(b) ?? "?"),
      litre,
      trajanje: trajanjeDana(f.pocetakAt, kraj),
      otvorena: !f.krajAt,
    };
  });

  const uTijeku = redci.filter((r) => r.otvorena).length;
  const ukupnoLitara = redci.reduce((s, r) => s + r.litre, 0);
  const danas = sada.toLocaleString("hr-HR");

  return (
    <div style={pageStyle}>
      <style>{`
        @media print {
          html, body {
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          a[href] { text-decoration: none !important; color: #000 !important; }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 12mm; }
        }
      `}</style>

      <div className="no-print" style={topActionsStyle}>
        <Link href="/dashboard" style={actionButtonStyle}>
          Početna
        </Link>
        {godine.map((g) => (
          <Link
            key={g}
            href={`/fermentacija?godina=${g}`}
            style={{
              ...actionButtonStyle,
              ...(g === godina
                ? { background: "#1c1917", color: "#ffffff", borderColor: "#1c1917" }
                : {}),
            }}
          >
            {g}
          </Link>
        ))}
        <PrintButton />
        <div style={infoButtonStyle}>Za PDF: Ctrl+P → Save as PDF</div>
      </div>

      <div style={reportWrapStyle}>
        <div style={reportHeaderStyle}>
          <div>
            <h1 style={reportTitleStyle}>Fermentacije {godina}</h1>
            <div style={reportSubStyle}>
              {fermentacije.length}{" "}
              {fermentacije.length === 1 ? "fermentacija" : "fermentacija"}
              {uTijeku > 0 ? `, ${uTijeku} u tijeku` : ""} ·{" "}
              {broj(ukupnoLitara)} L ukupno
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#6b7280" }}>
            Ispisano {danas}
          </div>
        </div>

        {fermentacije.length === 0 ? (
          <div style={praznoStyle}>
            {sveFermentacije.length === 0
              ? "Nijedna fermentacija još nije zabilježena. Otvara se gumbom „Fermentacija počela” na stranici tanka."
              : `U ${godina}. nema zabilježenih fermentacija.`}
          </div>
        ) : (
          <table style={tabelaStyle}>
            <thead>
              <tr>
                <Th>Tank</Th>
                <Th>Sorta</Th>
                <Th>Kvasac</Th>
                <Th>Od</Th>
                <Th>Do</Th>
                <Th desno>Trajanje</Th>
                <Th desno>Litara</Th>
                <Th>Dnevnik</Th>
              </tr>
            </thead>
            <tbody>
              {redci.map((r) => (
                <tr key={r.f.id}>
                  <Td>T{brojTanka.get(r.f.tankId) ?? "?"}</Td>
                  <Td>{r.sorte.length > 0 ? r.sorte.join(", ") : "—"}</Td>
                  <Td>{r.f.kvasacNaziv ?? "—"}</Td>
                  <Td>{datum(r.f.pocetakAt)}</Td>
                  <Td>{r.otvorena ? "u tijeku" : datum(r.f.krajAt)}</Td>
                  <Td desno>
                    {r.trajanje} {r.trajanje === 1 ? "dan" : "dana"}
                    {r.otvorena ? "*" : ""}
                  </Td>
                  <Td desno>{broj(r.litre)}</Td>
                  <Td>
                    <Link href={`/fermentacija/${r.f.id}`} style={{ color: "#1f6f8b" }}>
                      otvori
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {uTijeku > 0 ? (
          <div style={biljeskaStyle}>
            * Trajanje fermentacije koja još traje računa se do danas.
          </div>
        ) : null}

        <div style={biljeskaStyle}>
          Sorta i litre računaju se iz knjige kretanja — ono što je u tanku bilo u
          trenutku početka. Kilogrami se ovdje ne prikazuju: kod blenda se ne smiju
          zbrojiti, a jedan redak nema gdje pokazati redak po berbi. Nalaze se na
          dnevniku pojedine fermentacije.
        </div>
      </div>
    </div>
  );
}

function Th({ children, desno }: { children?: React.ReactNode; desno?: boolean }) {
  return <th style={{ ...thStyle, textAlign: desno ? "right" : "left" }}>{children}</th>;
}

function Td({ children, desno }: { children?: React.ReactNode; desno?: boolean }) {
  return <td style={{ ...tdStyle, textAlign: desno ? "right" : "left" }}>{children}</td>;
}

const pageStyle: React.CSSProperties = {
  padding: 20,
  background: "#f7f7f5",
  minHeight: "100vh",
};

const topActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 14,
};

const actionButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "10px 16px",
  background: "#ffffff",
  border: "1px solid #d6d3d1",
  borderRadius: 10,
  color: "#44403c",
  textDecoration: "none",
  fontSize: 14,
};

const infoButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 13,
  color: "#78716c",
};

const reportWrapStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e7e5e4",
  borderRadius: 12,
  padding: 24,
  maxWidth: 1180,
  margin: "0 auto",
};

const reportHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  borderBottom: "2px solid #1c1917",
  paddingBottom: 12,
  marginBottom: 18,
};

const reportTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: "#1c1917",
};

const reportSubStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#57534e",
};

const tabelaStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  borderBottom: "1px solid #d6d3d1",
  padding: "6px 8px",
  color: "#57534e",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f5f5f4",
  padding: "6px 8px",
  color: "#1c1917",
};

const praznoStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#78716c",
  fontStyle: "italic",
  padding: "20px 0",
};

const biljeskaStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 11.5,
  color: "#78716c",
  lineHeight: 1.45,
};
