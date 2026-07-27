import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import {
  danasHr,
  danUBazu,
  satMinutaHr,
  minutaZapisa,
  satiHHMM,
  formatDan,
} from "@/lib/prisutnost";
import PrisutnostGumb from "@/components/PrisutnostGumb";

export const dynamic = "force-dynamic";

type Stanje = "PRISUTAN" | "ODJAVLJEN" | "NIJE";

const BOJE: Record<Stanje, { bg: string; border: string; text: string }> = {
  PRISUTAN: { bg: "#eef7f0", border: "#8db79a", text: "#2f6b43" },
  ODJAVLJEN: { bg: "#eef2f9", border: "#8fa6c6", text: "#2b4c7e" },
  NIJE: { bg: "#f2f3f4", border: "#cfcfcf", text: "#6b7075" },
};

export default async function PrisutnostPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const danas = danasHr();
  const danasBaza = danUBazu(danas);

  const [korisnici, zapisiDanas, mojOtvoreni, praznik] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, ime: true, role: true },
      orderBy: { ime: "asc" },
    }),
    prisma.radnaPrijava.findMany({
      where: { datum: danasBaza },
      select: { id: true, userId: true, dolazakU: true, odlazakU: true },
      orderBy: { dolazakU: "asc" },
    }),
    prisma.radnaPrijava.findFirst({
      where: { userId: user.id, odlazakU: null },
      orderBy: { dolazakU: "desc" },
      select: { dolazakU: true, datum: true },
    }),
    prisma.praznik.findUnique({ where: { datum: danasBaza }, select: { naziv: true } }),
  ]);

  const poKorisniku = new Map<string, typeof zapisiDanas>();
  for (const z of zapisiDanas) {
    const lista = poKorisniku.get(z.userId) ?? [];
    lista.push(z);
    poKorisniku.set(z.userId, lista);
  }

  const ploca = korisnici.map((k) => {
    const zapisi = poKorisniku.get(k.id) ?? [];
    const otvoren = zapisi.find((z) => !z.odlazakU);
    const zadnji = zapisi[zapisi.length - 1];
    const minuta = zapisi.reduce((s, z) => s + minutaZapisa(z.dolazakU, z.odlazakU), 0);
    const stanje: Stanje = otvoren ? "PRISUTAN" : zapisi.length ? "ODJAVLJEN" : "NIJE";
    return {
      id: k.id,
      ime: k.ime,
      stanje,
      tekst: otvoren
        ? `Na poslu od ${satMinutaHr(otvoren.dolazakU)}`
        : zadnji
          ? `Odjavljen u ${satMinutaHr(zadnji.odlazakU)}`
          : "Nije prijavljen",
      detalj: zapisi.length
        ? zapisi
            .map((z) => `${satMinutaHr(z.dolazakU)}–${z.odlazakU ? satMinutaHr(z.odlazakU) : "…"}`)
            .join(" · ")
        : "",
      minuta,
    };
  });

  const brPrisutnih = ploca.filter((p) => p.stanje === "PRISUTAN").length;

  // Otvoreni zapis iz RANIJEG dana = zaboravljena odjava; korisnik to mora vidjeti.
  const zaboravljena =
    mojOtvoreni && mojOtvoreni.datum.toISOString().slice(0, 10) !== danas
      ? mojOtvoreni.datum.toISOString().slice(0, 10)
      : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#e9ecef",
        padding: 16,
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        color: "#222",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 18 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.5px" }}>PRISUTNOST</div>
          <div style={{ fontSize: 13, color: "#6b7075", marginTop: 4 }}>
            {formatDan(danas)}
            {praznik ? ` · praznik: ${praznik.naziv}` : ""} · prijavljeno {brPrisutnih} od {ploca.length}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                border: "1px solid #cfcfcf",
                background: "#f8f9fa",
                padding: "8px 12px",
                fontSize: 12,
                color: "#222",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              NATRAG
            </Link>
            {user.role === "ADMIN" && (
              <Link
                href="/dashboard/prisutnost/evidencija"
                style={{
                  display: "inline-flex",
                  border: "1px solid #b0b6bd",
                  background: "#fff",
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#222",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                EVIDENCIJA (ADMIN)
              </Link>
            )}
          </div>
        </div>

        {zaboravljena && (
          <div
            style={{
              border: "1px solid #e0b070",
              background: "#fff6e6",
              color: "#8a5a00",
              padding: "10px 12px",
              fontSize: 13,
            }}
          >
            ⚠ Prijava od {formatDan(zaboravljena)} nema odjavu. Zapis ostaje otvoren dok ga
            administrator ne ispravi u evidenciji — nova prijava se svejedno može zabilježiti.
          </div>
        )}

        <div style={{ background: "#fff", border: "1px solid #cfcfcf", padding: 16 }}>
          <PrisutnostGumb
            prijavljen={Boolean(mojOtvoreni)}
            odKad={mojOtvoreni ? satMinutaHr(mojOtvoreni.dolazakU) : undefined}
          />
        </div>

        <div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.06em", marginBottom: 8 }}>
            PLOČA PRISUTNOSTI — DANAS
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {ploca.map((p) => {
              const boja = BOJE[p.stanje];
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    border: `1px solid ${boja.border}`,
                    background: boja.bg,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {p.ime}
                    {p.id === user.id ? " (ja)" : ""}
                  </div>
                  <div style={{ color: boja.text, fontWeight: 700, fontSize: 14 }}>
                    {p.tekst}
                    {p.detalj && (
                      <span style={{ color: "#6b7075", fontWeight: 400 }}> · {p.detalj}</span>
                    )}
                    {p.minuta > 0 && (
                      <span style={{ color: "#6b7075", fontWeight: 400 }}> · {satiHHMM(p.minuta)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
