import Link from "next/link";
import { prisma } from "@/lib/prisma";
import TankQrCard from "@/components/TankQrCard";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

export default async function TankQrPage() {
  const tankovi = await prisma.tank.findMany({
    orderBy: { broj: "asc" },
    select: {
      id: true,
      broj: true,
      sorta: true,
    },
  });

  const baseUrl = getBaseUrl();

  return (
    <main style={{ padding: 24, background: "#f5f5f5", minHeight: "100vh" }}>
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
            QR naljepnice tankova
          </h1>
          <p style={{ color: "#6b7280", marginTop: 8 }}>
            Ispis etiketa za lijepljenje na tankove
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PrintButton />

          <Link
            href="/dashboard"
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #ccc",
              textDecoration: "none",
              color: "#111",
              background: "#fff",
            }}
          >
            Natrag
          </Link>
        </div>
      </div>

      <div className="labels-grid">
        {tankovi.map((tank) => (
          <TankQrCard
            key={tank.id}
            tankId={tank.id}
            brojTanka={tank.broj}
            naziv={tank.sorta || null}
            baseUrl={baseUrl}
          />
        ))}
      </div>

      <style>{`
        .labels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 20px;
          align-items: start;
        }

        .tank-qr-card {
          background: #ffffff;
          border: 2px solid #111827;
          border-radius: 14px;
          padding: 18px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 390px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.06);
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .tank-qr-label-top {
          font-size: 11px;
          letter-spacing: 1px;
          font-weight: 700;
          color: #6b7280;
          margin-bottom: 8px;
          text-align: center;
        }

        .tank-qr-broj {
          font-size: 34px;
          line-height: 1;
          font-weight: 900;
          color: #111827;
          text-align: center;
          margin-bottom: 8px;
        }

        .tank-qr-sorta {
          font-size: 16px;
          min-height: 22px;
          color: #374151;
          text-align: center;
          margin-bottom: 14px;
          font-weight: 600;
        }

        .tank-qr-code-wrap {
          background: #fff;
          padding: 10px;
          margin-bottom: 12px;
        }

        .tank-qr-note {
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }

        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          html, body {
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          main {
            padding: 0 !important;
            background: #fff !important;
            min-height: auto !important;
          }

          .labels-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 10mm !important;
          }

          .tank-qr-card {
            border-radius: 8px !important;
            box-shadow: none !important;
            min-height: 0 !important;
            padding: 10px !important;
          }

          .tank-qr-broj {
            font-size: 26px !important;
          }

          .tank-qr-sorta {
            font-size: 13px !important;
            margin-bottom: 8px !important;
            min-height: 16px !important;
          }

          .tank-qr-label-top,
          .tank-qr-note {
            font-size: 10px !important;
          }

          .tank-qr-code-wrap svg {
            width: 44mm !important;
            height: 44mm !important;
          }
        }
      `}</style>
    </main>
  );
}