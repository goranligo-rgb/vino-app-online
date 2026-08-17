import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/putnik-auth";
import {
  izracunajStatus,
  gatewayNeJavlja,
  formatTemp,
  prijeKoliko,
  stvarnaZadana,
  uBroj,
} from "@/lib/temperatura";
import {
  smijeUpravljati as smijeUpravljatiRole,
  jeHladjenjeIskljuceno,
  jeIsteklaKomanda,
  porukaBezOznake,
  OPIS_TIPA,
  JEDINICA_TIPA,
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

  // Tankovi ukljuceni u nadzor temperature: moraju imati modbus adresu I biti
  // pod nadzorom. Tank bez kontrolera hladjenja (41-44) ima nadzorHladjenja =
  // false - isti uvjet koristi i gateway, da dashboard i Pi gledaju isti popis.
  const tankovi = await prisma.tank.findMany({
    where: { modbusAdresa: { not: null }, nadzorHladjenja: true },
    orderBy: { broj: "asc" },
    select: {
      id: true,
      broj: true,
      sorta: true,
      nazivVina: true,
      zadanaTemp: true,
      zadnjaZadanaTemp: true,
      alarmMinus: true,
      alarmPlus: true,
      hy: true,
      smsAktivan: true,
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
    const zadanaTemp = uBroj(t.zadanaTemp);
    // Glavna vrijednost je ona s kontrolera (zadnje očitanje); Tank.zadanaTemp je
    // samo želja koja može zaostati ako komanda propadne. Zato se i "hlađenje
    // isključeno" računa iz stvarnog stanja, a ne iz baze.
    const zadanaNaKontroleru = o ? uBroj(o.zadanaTemperatura) : null;
    return {
      id: t.id,
      broj: t.broj,
      sorta: t.sorta,
      nazivVina: t.nazivVina,
      zadnjaTemp: o ? uBroj(o.temperatura) : null,
      zadanaTemp,
      zadanaNaKontroleru,
      zadnjaZadanaTemp: uBroj(t.zadnjaZadanaTemp),
      hladjenjeIskljuceno: jeHladjenjeIskljuceno(
        stvarnaZadana(zadanaNaKontroleru, zadanaTemp)
      ),
      alarmMinus: uBroj(t.alarmMinus),
      alarmPlus: uBroj(t.alarmPlus),
      hy: uBroj(t.hy),
      hladjenjeAktivno: o ? o.hladjenjeAktivno : null,
      mjerenoU: o ? o.mjerenoU.toISOString() : null,
      imaAktivanAlarm: alarmSet.has(t.id),
      smsAktivan: t.smsAktivan,
      komande: komandeMap.get(t.id) ?? {},
    };
  });

  let brOk = 0;
  let brAlarm = 0;
  let brBezVeze = 0;
  let brIskljuceno = 0;
  for (const t of tiles) {
    const s = izracunajStatus({
      mjerenoU: t.mjerenoU,
      imaAktivanAlarm: t.imaAktivanAlarm,
      hladjenjeIskljuceno: t.hladjenjeIskljuceno,
    });
    if (s === "OK") brOk++;
    else if (s === "ALARM") brAlarm++;
    else if (s === "HLADJENJE_OFF") brIskljuceno++;
    else brBezVeze++;
  }

  // Heartbeat gatewaya: najsvježije očitanje IKOJEG tanka. Ako ga nema duže od
  // HEARTBEAT_PRAG_MIN, ne javlja se ni jedan tank - dakle stoji gateway, Pi ili
  // mreža, a ne pojedini kontroler. (Servis je jednom stajao tjedan dana a da
  // nitko nije primijetio - zato upozorenje ide na vrh, preko cijele širine.)
  const zadnjeIkad = parovi.reduce<Date | null>(
    (max, p) => (max == null || p.mjerenoU > max ? p.mjerenoU : max),
    null
  );
  const nemaHeartbeata = tiles.length > 0 && gatewayNeJavlja(zadnjeIkad);

  return (
    <div
      className="hlad-stranica"
      style={{
        minHeight: "100vh",
        background: "#e9ecef",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        color: "#222",
        boxSizing: "border-box",
        overflowX: "hidden",
        maxWidth: "100%",
      }}
    >
      {/*
        Raspored pločica i unutrašnjost kartice žive OVDJE, a ne u inline
        stilovima komponente: dashboard se najviše gleda s mobitela, a media
        upiti se u inline stilu ne mogu napisati. TankKontrole zato koristi ove
        klase, a inline stil zadržava samo ono što ovisi o stanju (boje).

        Ključno pravilo protiv preklapanja: SVAKI ugniježđeni okvir ima
        min-width:0. Bez toga grid/flex dijete ne smije biti uže od svog
        sadržaja, pa dugačak nelomljivi tekst (npr. značka
        "HLAĐENJE ISKLJUČENO" ili poruka greške neuspjele komande) razvuče
        kutiju preko ruba kartice i prelije se preko susjednih redaka.
      */}
      <style>{`
        /* Na iPhoneu dodanom na početni zaslon nema Safarijeve trake, pa bi gumb
           NATRAG završio pod satom i notchem. Zato gornji razmak uključuje
           safe-area umetak; gdje ga nema (računalo, Android bez notcha) ostaje
           uobičajenih 16 px. */
        .hlad-stranica { padding: 16px; padding-top: max(16px, calc(env(safe-area-inset-top) + 10px)); }
        @media (max-width: 639px){ .hlad-stranica { padding: 12px; padding-top: max(12px, calc(env(safe-area-inset-top) + 10px)); } }

        .hlad-vrh { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; min-width:0; }
        .hlad-vrh-naslov { min-width:0; flex:1 1 auto; }
        .hlad-natrag { display:inline-flex; align-items:center; justify-content:center; }

        /* Brojači: mreža, ne flex red. Četiri pločice od 96 px + razmaci ne stanu
           na 360 px, a kao flex stavka bez min-width:0 se nisu smjele stisnuti pa
           je "Bez veze" ostajao odrezan izvan ekrana. Na mobitelu idu 2x2. */
        .hlad-sazetak { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:10px; min-width:0; }
        @media (max-width: 639px){ .hlad-sazetak { grid-template-columns: repeat(2, minmax(0,1fr)); width:100%; } }

        .hlad-grid { display:grid; gap:12px; grid-template-columns: minmax(0,1fr); }
        @media (min-width: 640px){ .hlad-grid{ grid-template-columns: repeat(2, minmax(0,1fr));} }
        @media (min-width: 900px){ .hlad-grid{ grid-template-columns: repeat(4, minmax(0,1fr));} }
        @media (min-width: 1300px){ .hlad-grid{ grid-template-columns: repeat(5, minmax(0,1fr));} }
        .hlad-grid > * { min-width: 0; box-sizing: border-box; }

        .hlad-kartica { padding:12px; display:grid; gap:10px; min-width:0; box-sizing:border-box; }

        .hlad-zaglavlje { display:flex; justify-content:space-between; align-items:flex-start;
                          gap:8px; min-width:0; flex-wrap:wrap; }
        .hlad-naslov { min-width:0; flex:1 1 120px; }
        .hlad-zaglavlje-desno { display:flex; flex-direction:column; align-items:flex-end;
                                gap:6px; min-width:0; max-width:100%; }

        /* Značke se smiju lomiti u dva retka - radije viša kartica nego prelijevanje. */
        .hlad-znacka { display:inline-flex; align-items:center; gap:5px; padding:3px 9px;
                       font-size:11px; font-weight:700; max-width:100%; min-width:0;
                       text-align:right; overflow-wrap:anywhere; }
        .hlad-tocka { width:8px; height:8px; flex:0 0 auto; }

        .hlad-red { display:grid; gap:6px; background:rgba(255,255,255,0.55); padding:8px;
                    min-width:0; }
        .hlad-oznaka { font-size:12px; font-weight:700; color:#444; display:flex;
                       align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
        .hlad-kontrole { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
        .hlad-napomena { font-size:11px; min-width:0; overflow-wrap:anywhere; }
        .hlad-alarmi { display:grid; gap:10px; grid-template-columns: repeat(auto-fit, minmax(128px,1fr)); }
        .hlad-onoff { display:flex; gap:8px; flex-wrap:wrap; min-width:0; }
        .hlad-onoff > button { flex:1 1 110px; min-height:42px; }

        .hlad-stepper { display:flex; align-items:center; justify-content:center; gap:8px;
                        flex-wrap:wrap; min-width:0; }
        .hlad-vrijednost { min-width:44px; text-align:center; font-size:18px; font-weight:700; }

        /* Tailwind Preflight postavlja buttonima "text-align: inherit", pa gumb
           NE centrira svoj tekst sam od sebe kao inače - naslijedi poravnanje
           roditelja i natpis odluta u kut. Zato svaki gumb kartice centrira
           sadržaj izričito, preko flexa. */
        .hlad-korak, .hlad-spremi, .hlad-onoff > button {
          display:inline-flex; align-items:center; justify-content:center;
          text-align:center; line-height:1.1;
        }
        .hlad-korak { min-width:40px; min-height:40px; }
        /* justify-self drži gumb na svojoj širini i u redcima Alarm −/+, gdje je
           izravno dijete mreže pa bi se inače razvukao preko cijele širine. */
        .hlad-spremi { min-height:40px; padding:8px 16px; justify-self:start; }

        /* Mobitel uspravno: jedna kartica po redu, sve veće i lakše za prst. */
        @media (max-width: 639px){
          .hlad-kartica { padding:14px; gap:12px; }
          .hlad-red { padding:10px; }
          .hlad-oznaka { font-size:13px; }
          .hlad-alarmi { grid-template-columns: minmax(0,1fr); }
          .hlad-stepper { justify-content:flex-start; }
          .hlad-korak { min-width:52px; min-height:48px; font-size:22px; }
          .hlad-vrijednost { min-width:64px; font-size:20px; }
          /* Gumb normalne širine, ne razvučen preko cijelog retka - dovoljno
             velik za prst (46 px), ali i dalje izgleda kao gumb. */
          .hlad-spremi { flex:0 0 auto; min-height:46px; min-width:104px; font-size:15px; }
          .hlad-onoff > button { min-height:48px; font-size:15px; }
          .hlad-znacka { font-size:12px; padding:4px 10px; }
        }
      `}</style>

      <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gap: 18 }}>
        {nemaHeartbeata ? (
          <div
            role="alert"
            style={{
              background: "#c0392b",
              border: "3px solid #7d1f16",
              color: "#ffffff",
              padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.5px" }}>
              ⚠ GATEWAY NE JAVLJA — PODACI NISU SVJEŽI!
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>
              {zadnjeIkad
                ? `Zadnje očitanje bilo kojeg tanka stiglo je ${prijeKoliko(zadnjeIkad)} (${formatDatum(zadnjeIkad)}).`
                : "U bazi nema nijednog očitanja temperature."}{" "}
              Temperature i stanja ispod su zadnje poznate vrijednosti, ne trenutno stanje u podrumu.
            </div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: 0.95 }}>
              Provjeri Raspberry Pi u podrumu: <code>sudo systemctl status vino-gateway</code>.
            </div>
          </div>
        ) : null}

        <div className="hlad-vrh">
          <div className="hlad-vrh-naslov">
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.5px" }}>HLAĐENJE TANKOVA</div>
            <Link
              href="/dashboard"
              className="hlad-natrag"
              style={{
                marginTop: 10,
                border: "1px solid #cfcfcf",
                background: "#f8f9fa",
                padding: "10px 14px",
                minHeight: 44,
                fontSize: 12,
                color: "#222",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              NATRAG
            </Link>
          </div>

          <div className="hlad-sazetak">
            <SazetakBadge label="OK" broj={brOk} bg="#eef7f0" border="#8db79a" text="#2f6b43" />
            <SazetakBadge label="Alarm" broj={brAlarm} bg="#fdecec" border="#e0776f" text="#a11d1d" />
            <SazetakBadge label="Hlađenje off" broj={brIskljuceno} bg="#eef1f4" border="#9fb0bd" text="#3d5566" />
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
            ? "Promjene se bilježe kao komande i odmah prikazuju kao novo stanje. Gateway u podrumu ih preuzima u sljedećem ciklusu (do 2 min) i tek tada badge prelazi u „primijenjeno“. Prikazane vrijednosti su one koje gateway čita s kontrolera: ako komanda ne prođe, vrijednost se vraća na stvarno stanje. Hlađenje se isključuje podizanjem zadane temperature na 20,0 °C — kontroler nema zaseban ON/OFF."
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
                            ? `${staro != null ? formatTemp(staro) : "—"} → ${formatTemp(novo)} ${
                                JEDINICA_TIPA[k.tip as KomandaTip] ?? "°C"
                              }`
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
        // minWidth: 0 je bitno - pločica je stavka mreže i mora se smjeti
        // stisnuti, inače četiri komada zajedno šire zaglavlje izvan ekrana.
        minWidth: 0,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 0,
        padding: "8px 10px",
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
  // Istekla komanda (ograda od 30 min) nije kvar nego mrtav zapis - u dnevniku
  // ostaje vidljiva, ali prigušeno sivo, ne crveno kao stvarna greška.
  const istekla = jeIsteklaKomanda(status, greska);
  const s = istekla ? { label: "istekla", color: "#5c6469" } : map[status] ?? map.NA_CEKANJU;
  const opis = porukaBezOznake(greska);
  return (
    <span style={{ color: s.color, fontWeight: 700 }} title={opis || undefined}>
      {s.label}
      {status === "NEUSPJELO" && opis && !istekla ? ` · ${opis}` : ""}
    </span>
  );
}

const thStyle: React.CSSProperties = { padding: "6px 10px", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "6px 10px", whiteSpace: "nowrap" };
