import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import ObrisiPunjenjeStavkuButton from "./obrisi-punjenje-stavku-button";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PunjenjeDetaljPage({ params }: Props) {
  const { id } = await params;

  if (!id) {
    notFound();
  }

  const punjenje = await prisma.punjenjeTanka.findUnique({
    where: { id },
    include: {
      tank: true,
      stavke: {
        where: {
          obrisano: false,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!punjenje) {
    notFound();
  }

  const ukupnoLitara = punjenje.stavke.reduce(
    (sum, s) => sum + Number(s.kolicinaLitara || 0),
    0
  );

  const ukupnoKg = punjenje.stavke.reduce(
    (sum, s) => sum + Number(s.kolicinaKgGrozdja || 0),
    0
  );

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <div style={headerCard}>
        <h1 style={title}>Punjenje tanka {punjenje.tank.broj}</h1>

        <div style={subTitle}>{punjenje.nazivVina || "Bez naziva vina"}</div>

        <div style={infoRow}>
          <div>
            <strong>Datum:</strong>{" "}
            {new Date(punjenje.datumPunjenja).toLocaleString("hr-HR")}
          </div>

          <div>
            <strong>Tip tanka:</strong> {punjenje.tank.tip || "-"}
          </div>

          <div>
            <strong>Kapacitet tanka:</strong> {punjenje.tank.kapacitet} L
          </div>
        </div>

        {punjenje.napomena && <div style={napomenaBox}>{punjenje.napomena}</div>}
      </div>

      <div style={section}>
        <h2 style={sectionTitle}>Stavke punjenja</h2>

        {punjenje.stavke.length === 0 ? (
          <div style={emptyBox}>Nema aktivnih stavki u ovom punjenju.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {punjenje.stavke.map((s, i) => (
              <div key={s.id} style={stavkaCard}>
                <div style={stavkaHeaderRow}>
                  <div style={stavkaHeader}>
                    {i + 1}. {s.nazivSorte}
                  </div>

                  <ObrisiPunjenjeStavkuButton stavkaId={s.id} />
                </div>

                <div style={stavkaGrid}>
                  <div>
                    <span style={label}>Opis</span>
                    <div>{s.opis || "-"}</div>
                  </div>

                  <div>
                    <span style={label}>Kg grožđa</span>
                    <div>
                      {s.kolicinaKgGrozdja != null
                        ? `${Number(s.kolicinaKgGrozdja).toFixed(2)} kg`
                        : "-"}
                    </div>
                  </div>

                  <div>
                    <span style={label}>Mošt</span>
                    <div>{Number(s.kolicinaLitara).toFixed(2)} L</div>
                  </div>

                  <div>
                    <span style={label}>Položaj</span>
                    <div>{s.polozaj || "-"}</div>
                  </div>

                  <div>
                    <span style={label}>Parcela</span>
                    <div>{s.parcela || "-"}</div>
                  </div>

                  <div>
                    <span style={label}>Vinograd</span>
                    <div>{s.vinograd || "-"}</div>
                  </div>

                  <div>
                    <span style={label}>Oznaka berbe</span>
                    <div>{s.oznakaBerbe || "-"}</div>
                  </div>

                  <div>
                    <span style={label}>Datum berbe</span>
                    <div>
                      {s.datumBerbe
                        ? new Date(s.datumBerbe).toLocaleDateString("hr-HR")
                        : "-"}
                    </div>
                  </div>

                  <div>
                    <span style={label}>Godina berbe</span>
                    <div>{s.godinaBerbe || "-"}</div>
                  </div>

                  <div>
                    <span style={label}>Šećer</span>
                    <div>{s.secer != null ? Number(s.secer).toFixed(2) : "-"}</div>
                  </div>

                  <div>
                    <span style={label}>Kiseline</span>
                    <div>
                      {s.kiseline != null ? Number(s.kiseline).toFixed(2) : "-"}
                    </div>
                  </div>

                  <div>
                    <span style={label}>pH</span>
                    <div>{s.ph != null ? Number(s.ph).toFixed(2) : "-"}</div>
                  </div>
                </div>

                {(s.napomenaBerbe || s.opis) && (
                  <div style={napomenaStavkeBox}>
                    <div>
                      <strong>Napomena berbe:</strong> {s.napomenaBerbe || "-"}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={section}>
        <h2 style={sectionTitle}>Sažetak</h2>

        <div style={summaryGrid}>
          <div style={summaryCard}>
            <div style={summaryTitle}>Ukupno kg grožđa</div>
            <div style={summaryValue}>{ukupnoKg.toFixed(2)} kg</div>
          </div>

          <div style={summaryCard}>
            <div style={summaryTitle}>Ukupno litara mošta</div>
            <div style={summaryValue}>{ukupnoLitara.toFixed(2)} L</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
        <Link href="/punjenje" style={secondaryButton}>
          Natrag na punjenje
        </Link>

        <Link
          href={`/mjerenje?tankId=${punjenje.tankId}&initial=1`}
          style={secondaryButton}
        >
          Idi na mjerenje
        </Link>
      </div>
    </div>
  );
}

const headerCard: React.CSSProperties = {
  border: "2px solid #4d7c0f",
  borderRadius: 16,
  padding: 20,
  background: "#f8fafc",
  marginBottom: 20,
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  marginBottom: 6,
};

const subTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "#475569",
  marginBottom: 10,
};

const infoRow: React.CSSProperties = {
  display: "flex",
  gap: 20,
  flexWrap: "wrap",
  marginBottom: 10,
};

const napomenaBox: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: "#fef3c7",
};

const section: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 18,
  background: "white",
  marginBottom: 20,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 12,
};

const stavkaCard: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: 14,
  background: "#f9fafb",
};

const stavkaHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 10,
  flexWrap: "wrap",
};

const stavkaHeader: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 18,
};

const stavkaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const summaryCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14,
  background: "#f8fafc",
};

const summaryTitle: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  marginBottom: 6,
};

const summaryValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
};

const secondaryButton: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "white",
  textDecoration: "none",
  color: "#111827",
  fontWeight: 600,
};

const emptyBox: React.CSSProperties = {
  padding: 16,
  borderRadius: 10,
  border: "1px dashed #cbd5e1",
  background: "#f8fafc",
  color: "#475569",
};

const napomenaStavkeBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "#fff7ed",
  border: "1px solid #fed7aa",
};