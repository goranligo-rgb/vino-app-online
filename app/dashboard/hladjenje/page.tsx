import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import {
  izracunajStatus,
  stilZaStatus,
  formatTemp,
  uBroj,
} from "@/lib/temperatura";
import {
  smijeUpravljati as smijeUpravljatiRole,
  OPIS_TIPA,
  type KomandaTip,
} from "@/lib/tank-komanda";
import TankKontrole, { type TankTile, type KomandaStanje } from "./tank-kontrole";

export const dynamic = "force-dynamic";

function formatDatum(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleString("hr-HR");
}

export default async function HladjenjeDashboard() {
  noStore();

  const user = await getAuthUser();
  if (!user) redirect("/login");

  const smije = smijeUpravljatiRole(user.role);

  // Tankovi ukljuceni u nadzor temperature (imaju modbus adresu).
  const tankovi = await prisma.tank.findMany({
    where: { modbusAdresa: { not: null } },
    orderBy: { broj: "asc" },
    select: {
      id: true,
      broj: true,
      sorta: true,
      nazivVina: true,
      zadanaTemp: true,
      alarmMinus: true,
      alarmPlus: true,
    },
  });
  const ids = tankovi.map((t) => t.id);

  // Zadnje ocitanje po tanku (max mjerenoU).
  const maxevi = await prisma.ocitanjeTemperature.groupBy({
    by: ["tankId"],
    where: { tankId: { in: ids } },
    _max: { mjerenoU: true },
  });
  const parovi = maxevi
    .filter((m) => m._max.mjerenoU)
    .map((m) => ({ tankId: m.tankId, mjerenoU: m._max.mjerenoU as Date }));
  const zadnja = parovi.length
    ? await prisma.ocitanjeTemperature.findMany({ where: { OR: parovi } })
    : [];
  const zadnjaMap = new Map(zadnja.map((o) => [o.tankId, o]));

  // Aktivni alarmi.
  const alarmi = await prisma.tankAlarm.findMany({
    where: { tankId: { in: ids }, aktivan: true },
    select: { tankId: true },
  });
  const alarmSet = new Set(alarmi.map((a) => a.tankId));

  // Zadnja komanda po (tank, tip) za badge uz svaku vrijednost.
  const zadnjeKomande = await prisma.tankKomanda.findMany({
    orderBy: { trazenoU: "desc" },
    distinct: ["tankId", "tip"],
    select: { tankId: true, tip: true, status: true, greska: true },
  });
  const komandeMap = new Map<string, Partial<Record<KomandaTip, KomandaStanje>>>();
  for (const k of zadnjeKomande) {
    const zapis = komandeMap.get(k.tankId) ?? {};
    zapis[k.tip as KomandaTip] = { status: k.status, greska: k.greska };
    komandeMap.set(k.tankId, zapis);
  }

  // Dnevnik: zadnjih 20 komandi (+ nešto starijih za izračun staro->novo).
  const povijest = await prisma.tankKomanda.findMany({
    orderBy: { trazenoU: "desc" },
    take: 300,
    include: {
      tank: { select: { broj: true } },
      trazioUser: { select: { ime: true } },
    },
  });
  const dnevnik = povijest.slice(0, 20);

  function staraVrijednost(index: number): number | null {
    const k = povijest[index];
    for (let j = index + 1; j < povijest.length; j++) {
      if (povijest[j].tankId === k.tankId && povijest[j].tip === k.tip) {
        return uBroj(povijest[j].vrijednost);
      }
    }
    return null;
  }

  // Pripremi pločice + sažetak.
  const tiles: TankTile[] = tankovi.map((t) => {
    const o = zadnjaMap.get(t.id);
    return {
      id: t.id,
      broj: t.broj,
      sorta: t.sorta,
      nazivVina: t.nazivVina,
      zadnjaTemp: o ? uBroj(o.temperatura) : null,
      zadanaTemp: uBroj(t.zadanaTemp),
      alarmMinus: uBroj(t.alarmMinus),
      alarmPlus: uBroj(t.alarmPlus),
      hladjenjeAktivno: o ? o.hladjenjeAktivno : null,
      mjerenoU: o ? o.mjerenoU.toISOString() : null,
      imaAktivanAlarm: alarmSet.has(t.id),
      komande: komandeMap.get(t.id) ?? {},
    };
  });

  let brOk = 0;
  let brAlarm = 0;
  let brBezVeze = 0;
  for (const t of tiles) {
    const s = izracunajStatus({ mjerenoU: t.mjerenoU, imaAktivanAlarm: t.imaAktivanAlarm });
    if (s === "OK") brOk++;
    else if (s === "ALARM") brAlarm++;
    else brBezVeze++;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#e9ecef",
        padding: 16,
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        color: "#222",
        boxSizing: "border-box",
        overflowX: "hidden",
        maxWidth: "100%",
      }}
    >
      <style>{`
        .hlad-grid { display:grid; gap:12px; grid-template-columns: repeat(2, minmax(0,1fr)); }
        @media (min-width: 900px){ .hlad-grid{ grid-template-columns: repeat(4, minmax(0,1fr));} }
        @media (min-width: 1300px){ .hlad-grid{ grid-template-columns: repeat(5, minmax(0,1fr));} }
        .hlad-grid > * { min-width: 0; box-sizing: border-box; }
      `}</style>

      <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.5px" }}>HLAĐENJE TANKOVA</div>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                marginTop: 10,
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
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SazetakBadge label="OK" broj={brOk} bg="#eef7f0" border="#8db79a" text="#2f6b43" />
            <SazetakBadge label="Alarm" broj={brAlarm} bg="#fdecec" border="#e0776f" text="#a11d1d" />
            <SazetakBadge label="Bez veze" broj={brBezVeze} bg="#f0f0f0" border="#cfcfcf" text="#6b7075" />
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#6b7075",
            background: "#f4f6f8",
            border: "1px dashed #cdd4da",
            padding: "8px 12px",
          }}
        >
          {smije
            ? "Promjene se bilježe kao komande i odmah prikazuju kao novo stanje. Primjena na uređaje se aktivira spajanjem sustava u podrumu."
            : "Pregled bez upravljanja. Promjene postavki rade role Admin, Enolog i Podrum."}
        </div>

        <div className="hlad-grid">
          {tiles.map((t) => (
            <TankKontrole key={t.id} tank={t} smijeUpravljati={smije} />
          ))}
        </div>

        {/* Dnevnik zadnjih promjena */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e2e2", padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Zadnje promjene</div>
          {dnevnik.length === 0 ? (
            <div style={{ fontSize: 13, color: "#777" }}>Još nema zabilježenih komandi.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#666", borderBottom: "2px solid #eee" }}>
                    <th style={thStyle}>Tank</th>
                    <th style={thStyle}>Što</th>
                    <th style={thStyle}>Staro → novo</th>
                    <th style={thStyle}>Tko</th>
                    <th style={thStyle}>Kada</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dnevnik.map((k, i) => {
                    const staro = staraVrijednost(i);
                    const novo = uBroj(k.vrijednost);
                    const jeVrijednost = novo != null;
                    return (
                      <tr key={k.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                        <td style={tdStyle}>Tank {k.tank.broj}</td>
                        <td style={tdStyle}>{OPIS_TIPA[k.tip as KomandaTip] ?? k.tip}</td>
                        <td style={tdStyle}>
                          {jeVrijednost
                            ? `${staro != null ? formatTemp(staro) : "—"} → ${formatTemp(novo)} °C`
                            : k.tip === "HLADJENJE_ON"
                              ? "→ ON"
                              : "→ OFF"}
                        </td>
                        <td style={tdStyle}>{k.trazioUser?.ime ?? "—"}</td>
                        <td style={tdStyle}>{formatDatum(k.trazenoU)}</td>
                        <td style={tdStyle}>
                          <StatusText status={k.status} greska={k.greska} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SazetakBadge({
  label,
  broj,
  bg,
  border,
  text,
}: {
  label: string;
  broj: number;
  bg: string;
  border: string;
  text: string;
}) {
  return (
    <div
      style={{
        minWidth: 96,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 0,
        padding: "8px 14px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800, color: text }}>{broj}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: text }}>{label}</div>
    </div>
  );
}

function StatusText({ status, greska }: { status: string; greska: string | null }) {
  const map: Record<string, { label: string; color: string }> = {
    NA_CEKANJU: { label: "na čekanju", color: "#8a6d00" },
    PRIMIJENJENO: { label: "primijenjeno", color: "#2f6b43" },
    NEUSPJELO: { label: "neuspjelo", color: "#a11d1d" },
  };
  const s = map[status] ?? map.NA_CEKANJU;
  return (
    <span style={{ color: s.color, fontWeight: 700 }} title={greska ?? undefined}>
      {s.label}
      {status === "NEUSPJELO" && greska ? ` · ${greska}` : ""}
    </span>
  );
}

const thStyle: React.CSSProperties = { padding: "6px 10px", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "6px 10px", whiteSpace: "nowrap" };
