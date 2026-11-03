import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE } from "@/lib/auth-token";
import {
  brojKolacica,
  PORUKA_RAZLOGA,
  procitajToken,
  razlogSUBazom,
} from "@/lib/sesija-dijagnoza";
import Standalone from "./standalone";

/**
 * PRIVREMENO: dijagnoza prijave u iOS aplikaciji s pocetnog zaslona, koja nema
 * adresnu traku ni konzolu. Brise se kad se problem rijesi, zajedno s poveznicom
 * na /login i lib/sesija-dijagnoza.ts.
 *
 * Namjerno izvan matchera u proxy.ts: mora se otvoriti i bez valjane prijave.
 * Pokazuje samo razlog i datume, nikad sadrzaj tokena ni ime korisnika, a iz baze
 * cita samo active i role.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dijagnoza prijave",
  robots: { index: false, follow: false },
};

function datum(sekunde: number | null): string {
  if (sekunde === null) return "—";
  return new Date(sekunde * 1000).toLocaleString("hr-HR", {
    timeZone: "Europe/Zagreb",
  });
}

function Redak({
  naziv,
  children,
}: {
  naziv: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #d1d5db" }}>
      <div style={{ fontSize: 13, color: "#4b5563" }}>{naziv}</div>
      <div style={{ fontSize: 17, fontWeight: 600, overflowWrap: "anywhere" }}>
        {children}
      </div>
    </div>
  );
}

export default async function SesijaDijagnozaPage() {
  const zaglavlja = await headers();
  const kolacici = await cookies();

  const token = await procitajToken(kolacici.get(AUTH_COOKIE)?.value);

  let razlog: keyof typeof PORUKA_RAZLOGA;
  if (token.razlog === "ispravan") {
    try {
      const redak = await prisma.user.findUnique({
        where: { id: token.sub ?? "" },
        select: { active: true, role: true },
      });
      razlog = razlogSUBazom(token.role, redak);
    } catch {
      razlog = "baza";
    }
  } else {
    razlog = token.razlog;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#111827",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        padding:
          "calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))",
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Dijagnoza prijave</h1>

      <Redak naziv="Razlog">{PORUKA_RAZLOGA[razlog]}</Redak>
      <Redak naziv="Broj auth_user kolačića u zahtjevu">
        {brojKolacica(zaglavlja.get("cookie"))}
      </Redak>
      <Redak naziv="Token izdan (iat)">{datum(token.iat)}</Redak>
      <Redak naziv="Token vrijedi do (exp)">{datum(token.exp)}</Redak>
      <Redak naziv="Standalone (aplikacija s početnog zaslona)">
        <Standalone />
      </Redak>
      <Redak naziv="User-agent">{zaglavlja.get("user-agent") ?? "—"}</Redak>

      <p style={{ marginTop: 20, fontSize: 16 }}>
        <a href="/login" style={{ color: "#1d4ed8" }}>
          Natrag na prijavu
        </a>
      </p>
    </main>
  );
}
