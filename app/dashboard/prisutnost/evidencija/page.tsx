import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import {
  mjesecHr,
  rasponMjeseca,
  danIzBaze,
  satMinutaHr,
  minutaZapisa,
  satiHHMM,
  satiDecimalno,
  formatDan,
  jeVikend,
} from "@/lib/prisutnost";
import { UrediZapis, DodajZapis } from "./uredi-zapis";

export const dynamic = "force-dynamic";

const celija: React.CSSProperties = {
  border: "1px solid #d7dbe0",
  padding: "6px 8px",
  fontSize: 13,
  verticalAlign: "top",
};

export default async function EvidencijaPage({
  searchParams,
}: {
  searchParams: Promise<{ mjesec?: string; korisnik?: string }>;
}) {
  // SAMO Level 1 (ADMIN) — evidencija je podatak o svim djelatnicima.
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard/prisutnost");

  const sp = await searchParams;
  const mjesec = /^\d{4}-\d{2}$/.test(sp.mjesec ?? "") ? (sp.mjesec as string) : mjesecHr();
  const korisnikId = (sp.korisnik || "").trim();
  const { od, do: doD } = rasponMjeseca(mjesec);

  const [korisnici, zapisi, praznici] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, ime: true },
      orderBy: { ime: "asc" },
    }),
    prisma.radnaPrijava.findMany({
      where: {
        datum: { gte: od, lt: doD },
        ...(korisnikId ? { userId: korisnikId } : {}),
      },
      select: {
        id: true,
        datum: true,
        dolazakU: true,
        odlazakU: true,
        napomena: true,
        uredenoU: true,
        user: { select: { id: true, ime: true } },
        uredio: { select: { ime: true } },
      },
      orderBy: [{ datum: "asc" }, { dolazakU: "asc" }],
    }),
    prisma.praznik.findMany({
      where: { datum: { gte: od, lt: doD } },
      select: { datum: true, naziv: true },
    }),
  ]);

  const praznikPoDanu = new Map(praznici.map((p) => [danIzBaze(p.datum), p.naziv]));

  // Zbroj minuta po korisniku za odabrani mjesec (otvoreni zapisi broje 0).
  const zbroj = new Map<string, { ime: string; minuta: number; otvorenih: number }>();
  for (const z of zapisi) {
    const t = zbroj.get(z.user.id) ?? { ime: z.user.ime, minuta: 0, otvorenih: 0 };
    t.minuta += minutaZapisa(z.dolazakU, z.odlazakU);
    if (!z.odlazakU) t.otvorenih += 1;
    zbroj.set(z.user.id, t);
  }
  const zbrojevi = [...zbroj.entries()].sort((a, b) => a[1].ime.localeCompare(b[1].ime, "hr"));

  const csvHref = `/api/prisutnost/csv?mjesec=${mjesec}${korisnikId ? `&korisnik=${encodeURIComponent(korisnikId)}` : ""}`;

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
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.5px" }}>
            EVIDENCIJA RADNOG VREMENA
          </div>
          <div style={{ fontSize: 13, color: "#6b7075", marginTop: 4 }}>
            Mjesečni pregled po danima. Otvoreni zapisi (bez odjave) broje 0 sati dok se ne isprave.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Link
              href="/dashboard/prisutnost"
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
              NATRAG NA PRISUTNOST
            </Link>
            <a
              href={csvHref}
              style={{
                display: "inline-flex",
                border: "1px solid #8db79a",
                background: "#eef7f0",
                padding: "8px 12px",
                fontSize: 12,
                color: "#2f6b43",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              ⤓ IZVOZ CSV
            </a>
          </div>
        </div>

        {/* Filtar */}
        <form
          method="get"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            flexWrap: "wrap",
            background: "#fff",
            border: "1px solid #cfcfcf",
            padding: 12,
          }}
        >
          <label style={{ fontSize: 11, color: "#6b7075" }}>
            Mjesec
            <input
              type="month"
              name="mjesec"
              defaultValue={mjesec}
              style={{ display: "block", border: "1px solid #b0b6bd", padding: "6px 8px", fontSize: 13 }}
            />
          </label>
          <label style={{ fontSize: 11, color: "#6b7075" }}>
            Korisnik
            <select
              name="korisnik"
              defaultValue={korisnikId}
              style={{ display: "block", border: "1px solid #b0b6bd", padding: "6px 8px", fontSize: 13, minWidth: 200 }}
            >
              <option value="">— svi —</option>
              {korisnici.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ime}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            style={{ border: "1px solid #b0b6bd", background: "#f8f9fa", padding: "8px 14px", fontSize: 12, fontWeight: 700 }}
          >
            PRIKAŽI
          </button>
        </form>

        {/* Zbroj po korisniku */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.06em", marginBottom: 8 }}>
            ZBROJ ZA {mjesec}
          </div>
          {zbrojevi.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6b7075" }}>Nema zapisa za odabrani mjesec.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {zbrojevi.map(([id, t]) => (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    border: "1px solid #cfcfcf",
                    background: "#fff",
                    padding: "8px 12px",
                    fontSize: 14,
                  }}
                >
                  <b>{t.ime}</b>
                  <span>
                    {satiHHMM(t.minuta)} h <span style={{ color: "#6b7075" }}>({satiDecimalno(t.minuta)})</span>
                    {t.otvorenih > 0 && (
                      <span style={{ color: "#a11d1d", fontWeight: 700 }}> · {t.otvorenih} bez odjave</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tablica zapisa */}
        <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #cfcfcf" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#f4f6f8" }}>
                <th style={{ ...celija, textAlign: "left" }}>Datum</th>
                {!korisnikId && <th style={{ ...celija, textAlign: "left" }}>Korisnik</th>}
                <th style={{ ...celija, textAlign: "left" }}>Dolazak</th>
                <th style={{ ...celija, textAlign: "left" }}>Odlazak</th>
                <th style={{ ...celija, textAlign: "left" }}>Ukupno</th>
                <th style={{ ...celija, textAlign: "left" }}>Napomena / ispravak</th>
                <th style={{ ...celija, textAlign: "left" }}></th>
              </tr>
            </thead>
            <tbody>
              {zapisi.length === 0 && (
                <tr>
                  <td style={celija} colSpan={korisnikId ? 6 : 7}>
                    Nema zapisa.
                  </td>
                </tr>
              )}
              {zapisi.map((z) => {
                const dan = danIzBaze(z.datum);
                const praznik = praznikPoDanu.get(dan);
                const neradni = Boolean(praznik) || jeVikend(dan);
                const minuta = minutaZapisa(z.dolazakU, z.odlazakU);
                return (
                  <tr key={z.id} style={{ background: neradni ? "#faf6ec" : undefined }}>
                    <td style={celija}>
                      {formatDan(dan)}
                      {praznik && (
                        <div style={{ fontSize: 11, color: "#8a5a00" }}>praznik: {praznik}</div>
                      )}
                      {!praznik && jeVikend(dan) && (
                        <div style={{ fontSize: 11, color: "#8a5a00" }}>vikend</div>
                      )}
                    </td>
                    {!korisnikId && <td style={celija}>{z.user.ime}</td>}
                    <td style={celija}>{satMinutaHr(z.dolazakU)}</td>
                    <td style={celija}>
                      {z.odlazakU ? (
                        satMinutaHr(z.odlazakU)
                      ) : (
                        <span style={{ color: "#a11d1d", fontWeight: 700 }}>nema odjave</span>
                      )}
                    </td>
                    <td style={celija}>{minuta ? `${satiHHMM(minuta)} h` : "—"}</td>
                    <td style={celija}>
                      {z.napomena || <span style={{ color: "#9aa0a6" }}>—</span>}
                      {z.uredenoU && (
                        <div style={{ fontSize: 11, color: "#6b7075" }}>
                          ispravio {z.uredio?.ime ?? "—"} · {satMinutaHr(z.uredenoU)}
                        </div>
                      )}
                    </td>
                    <td style={celija}>
                      <UrediZapis
                        id={z.id}
                        dolazakU={z.dolazakU.toISOString()}
                        odlazakU={z.odlazakU ? z.odlazakU.toISOString() : null}
                        napomena={z.napomena}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DodajZapis korisnici={korisnici} />
      </div>
    </div>
  );
}
