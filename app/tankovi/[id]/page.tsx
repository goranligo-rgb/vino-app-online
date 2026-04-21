import Link from "next/link";
import type React from "react";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import TankSwitcher from "./tank-switcher";
import NatragNaPrethodnu from "@/components/NatragNaPrethodnu";
import TankRoleActions from "./tank-role-actions";
import TankRoleSastavModal from "./tank-role-sastav-modal";
import TankRoleDokumentiUpload from "./tank-role-dokumenti-upload";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatBroj(value: number | null | undefined, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatDatum(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("hr-HR");
}

function formatDatumBezVremena(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("hr-HR");
}

function formatTipIzlaza(tip: string | null | undefined) {
  if (tip === "PUNJENJE") return "Punjenje u boce";
  if (tip === "PRODAJA") return "Prodaja / rinfuza";
  return tip ?? "—";
}

function prikaziKorisnika(
  korisnik:
    | {
        ime?: string | null;
        name?: string | null;
        naziv?: string | null;
        email?: string | null;
      }
    | null
    | undefined
) {
  if (!korisnik) return "—";
  return (
    korisnik.ime ??
    korisnik.name ??
    korisnik.naziv ??
    korisnik.email ??
    "—"
  );
}

function tipZadatkaLabel(z: {
  stavke?: Array<any>;
  preparatId?: string | null;
}) {
  if (z.stavke && z.stavke.length > 0) return "Vezani zadatak";
  return "Standardni zadatak";
}

function preporucenaDozaText(preparat?: {
  dozaOd?: number | null;
  dozaDo?: number | null;
  unit?: { naziv?: string | null } | null;
} | null) {
  if (!preparat) return "—";

  const od = preparat.dozaOd;
  const do_ = preparat.dozaDo;
  const jedinica = preparat.unit?.naziv ?? "";

  if (od != null && do_ != null) {
    return `${formatBroj(od)} – ${formatBroj(do_)} ${jedinica}`.trim();
  }

  if (od != null) {
    return `${formatBroj(od)} ${jedinica}`.trim();
  }

  if (do_ != null) {
    return `${formatBroj(do_)} ${jedinica}`.trim();
  }

  return "—";
}

function sazetakZadatka(z: {
  stavke?: Array<{
    preparat?: { naziv?: string | null } | null;
    izracunataKolicina?: number | null;
    izlaznaJedinica?: { naziv?: string | null } | null;
  }>;
  preparat?: { naziv?: string | null } | null;
  izracunataKolicina?: number | null;
  izlaznaJedinica?: { naziv?: string | null } | null;
}) {
  const tip = tipZadatkaLabel(z);

  if (z.stavke && z.stavke.length > 0) {
    const nazivi = z.stavke
      .map((s) => s.preparat?.naziv)
      .filter(Boolean)
      .join(", ");

    const ukupno = z.stavke
      .map((s) =>
        s.izracunataKolicina != null
          ? `${formatBroj(s.izracunataKolicina)} ${s.izlaznaJedinica?.naziv ?? ""}`.trim()
          : null
      )
      .filter(Boolean)
      .join(" + ");

    return `${tip} • ${nazivi || "više preparata"}${ukupno ? ` • ukupno: ${ukupno}` : ""}`;
  }

  const sredstvo = z.preparat?.naziv ?? "Bez preparata";
  const ukupno =
    z.izracunataKolicina != null
      ? `${formatBroj(z.izracunataKolicina)} ${z.izlaznaJedinica?.naziv ?? ""}`.trim()
      : "—";

  return `${tip} • ${sredstvo} • ukupno: ${ukupno}`;
}

function statusBadge(status: string) {
  if (status === "OTVOREN") {
    return {
      background: "#fff5f5",
      color: "#991b1b",
      border: "1px solid #dc2626",
    };
  }

  if (status === "IZVRSEN") {
    return {
      background: "#fafafa",
      color: "#44403c",
      border: "1px solid rgba(127,29,29,0.12)",
    };
  }

  if (status === "OTKAZAN") {
    return {
      background: "#fdf7f7",
      color: "#7f1d1d",
      border: "1px solid rgba(127,29,29,0.18)",
    };
  }

  return {
    background: "#fafafa",
    color: "#44403c",
    border: "1px solid rgba(127,29,29,0.10)",
  };
}

function ParamTop({
  label,
  value,
  unit,
  tone,
  emphasize = false,
}: {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  tone?: "default" | "green" | "red";
  emphasize?: boolean;
}) {
  const hasValue =
    value !== null &&
    value !== undefined &&
    !(typeof value === "string" && value.trim() === "");

  const boja =
    tone === "green" ? "#166534" : tone === "red" ? "#9f1239" : "#222";

  return (
    <div
      style={{
        ...paramCardStyle,
        ...(emphasize ? paramCardStrongStyle : null),
      }}
    >
      <div
        style={{
          ...paramLabelStyle,
          ...(emphasize ? paramLabelStrongStyle : null),
        }}
      >
        {label}
      </div>
      <div
        style={{
          ...paramValueStyle,
          ...(emphasize ? paramValueStrongStyle : null),
          color: boja,
        }}
      >
        {hasValue ? value : "—"}
        {hasValue && unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{title}</div>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={detailRowStyle}>
      <div style={detailLabelStyle}>{label}</div>
      <div style={detailValueStyle}>{value}</div>
    </div>
  );
}

function jeAutomatskoMjerenje(napomena: string | null | undefined) {
  const tekst = (napomena ?? "").toLowerCase();

  return (
    tekst.includes("automatski izračunato novo mjerenje nakon običnog pretoka") ||
    tekst.includes("automatski izračunato novo mjerenje nakon cuvéea") ||
    tekst.includes("automatski izračunato novo mjerenje nakon blenda iste sorte") ||
    tekst.includes("automatski izracunato novo mjerenje nakon običnog pretoka") ||
    tekst.includes("automatski izracunato novo mjerenje nakon cuvéea") ||
    tekst.includes("automatski izracunato novo mjerenje nakon blenda iste sorte") ||
    tekst.includes("automatski izracunato")
  );
}

function imaVrijednost(v: any) {
  return v !== null && v !== undefined && v !== "";
}

function bojaAktivnogPolja(v: any) {
  return imaVrijednost(v) ? "#16a34a" : "#9ca3af";
}

function jeSamoBentotestZapis(m: {
  alkohol: number | null;
  ukupneKiseline: number | null;
  hlapiveKiseline: number | null;
  slobodniSO2: number | null;
  ukupniSO2: number | null;
  secer: number | null;
  ph: number | null;
  temperatura: number | null;
  bentotestDatum?: Date | string | null;
  bentotestStatus?: string | null;
}) {
  const imaKlasicno =
    m.alkohol != null ||
    m.ukupneKiseline != null ||
    m.hlapiveKiseline != null ||
    m.slobodniSO2 != null ||
    m.ukupniSO2 != null ||
    m.secer != null ||
    m.ph != null ||
    m.temperatura != null;

  const imaBentotest = !!(m.bentotestDatum || m.bentotestStatus);

  return !imaKlasicno && imaBentotest;
}

function bentotestLabel(status?: string | null) {
  if (status === "STABILNO") return "Stabilno";
  if (status === "NESTABILNO") return "Nestabilno";
  return "—";
}

function sloziZadnjeMjerenjePoPoljima(
  mjerenja: Array<{
    alkohol: number | null;
    ukupneKiseline: number | null;
    hlapiveKiseline: number | null;
    slobodniSO2: number | null;
    ukupniSO2: number | null;
    secer: number | null;
    ph: number | null;
    temperatura: number | null;
    bentotestDatum: Date | string | null;
    bentotestStatus: string | null;
    izmjerenoAt: Date | string;
    napomena: string | null;
  }>
) {
  if (!mjerenja.length) return null;

  function zadnjaVrijednost<K extends keyof (typeof mjerenja)[number]>(key: K) {
    for (const m of mjerenja) {
      const value = m[key];
      if (
        !jeAutomatskoMjerenje(m.napomena) &&
        value !== null &&
        value !== undefined &&
        value !== ""
      ) {
        return value;
      }
    }

    for (const m of mjerenja) {
      const value = m[key];
      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }

    return null;
  }

  const zadnjeRucnoIliOpce =
    mjerenja.find((m) => !jeAutomatskoMjerenje(m.napomena)) ??
    mjerenja[0] ??
    null;

  const zadnjiBentotest =
    mjerenja.find((m) => m.bentotestDatum || m.bentotestStatus) ?? null;

  return {
    temperatura: zadnjaVrijednost("temperatura"),
    ph: zadnjaVrijednost("ph"),
    secer: zadnjaVrijednost("secer"),
    alkohol: zadnjaVrijednost("alkohol"),
    ukupneKiseline: zadnjaVrijednost("ukupneKiseline"),
    hlapiveKiseline: zadnjaVrijednost("hlapiveKiseline"),
    slobodniSO2: zadnjaVrijednost("slobodniSO2"),
    ukupniSO2: zadnjaVrijednost("ukupniSO2"),

    bentotestDatum: zadnjiBentotest?.bentotestDatum ?? null,
    bentotestStatus: zadnjiBentotest?.bentotestStatus ?? null,
    bentotestIzmjerenoAt: zadnjiBentotest?.izmjerenoAt ?? null,

    izmjerenoAt: zadnjeRucnoIliOpce?.izmjerenoAt ?? null,
    napomena: zadnjeRucnoIliOpce?.napomena ?? null,
  };
}

function IzvorMjerenjeBlock({
  mjerenja,
}: {
  mjerenja:
    | Array<{
        alkohol: number | null;
        ukupneKiseline: number | null;
        hlapiveKiseline: number | null;
        slobodniSO2: number | null;
        ukupniSO2: number | null;
        secer: number | null;
        ph: number | null;
        temperatura: number | null;
        bentotestDatum?: Date | string | null;
        bentotestStatus?: string | null;
        izmjerenoAt: Date | string;
        napomena: string | null;
      }>
    | undefined;
}) {
  const zadnje = sloziZadnjeMjerenjePoPoljima(
    (mjerenja ?? []).map((m) => ({
      alkohol: m.alkohol,
      ukupneKiseline: m.ukupneKiseline,
      hlapiveKiseline: m.hlapiveKiseline,
      slobodniSO2: m.slobodniSO2,
      ukupniSO2: m.ukupniSO2,
      secer: m.secer,
      ph: m.ph,
      temperatura: m.temperatura,
      bentotestDatum: m.bentotestDatum ?? null,
      bentotestStatus: m.bentotestStatus ?? null,
      izmjerenoAt: m.izmjerenoAt,
      napomena: m.napomena,
    }))
  );

  if (!zadnje) {
    return (
      <div style={sourceMeasurementWrapStyle}>
        <div style={sourceMeasurementTitleStyle}>Zadnje mjerenje izvora</div>
        <div style={mutedTextStyle}>Nema mjerenja za ovaj izvorni tank.</div>
      </div>
    );
  }

  return (
    <div style={sourceMeasurementWrapStyle}>
      <div style={sourceMeasurementTitleStyle}>Zadnje mjerenje izvora</div>

      <div style={sourceMeasurementPrimaryGridStyle}>
        <div style={sourceMeasurementPrimaryItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Alkohol</span>
          <strong>
            {zadnje.alkohol != null ? `${formatBroj(zadnje.alkohol)} %` : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementPrimaryItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Šećer</span>
          <strong>{zadnje.secer != null ? formatBroj(zadnje.secer) : "—"}</strong>
        </div>

        <div style={sourceMeasurementPrimaryItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Uk. kiseline</span>
          <strong>
            {zadnje.ukupneKiseline != null
              ? formatBroj(zadnje.ukupneKiseline)
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementPrimaryItemStyle}>
          <span style={sourceMeasurementLabelStyle}>SO2 uk.</span>
          <strong>
            {zadnje.ukupniSO2 != null ? formatBroj(zadnje.ukupniSO2) : "—"}
          </strong>
        </div>
      </div>

      <div style={sourceMeasurementSecondaryGridStyle}>
        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>pH</span>
          <strong>{zadnje.ph != null ? formatBroj(zadnje.ph) : "—"}</strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Temp.</span>
          <strong>
            {zadnje.temperatura != null
              ? `${formatBroj(zadnje.temperatura)} °C`
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Hlapive</span>
          <strong>
            {zadnje.hlapiveKiseline != null
              ? formatBroj(zadnje.hlapiveKiseline)
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>SO2 slob.</span>
          <strong>
            {zadnje.slobodniSO2 != null
              ? formatBroj(zadnje.slobodniSO2)
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Bentotest datum</span>
          <strong>
            {zadnje.bentotestDatum
              ? formatDatumBezVremena(zadnje.bentotestDatum)
              : "—"}
          </strong>
        </div>

        <div style={sourceMeasurementItemStyle}>
          <span style={sourceMeasurementLabelStyle}>Bentotest status</span>
          <strong>
            {zadnje.bentotestStatus === "STABILNO"
              ? "Stabilno"
              : zadnje.bentotestStatus === "NESTABILNO"
                ? "Nestabilno"
                : "—"}
          </strong>
        </div>
      </div>

      <div style={sourceMeasurementMetaStyle}>
        Mjereno:{" "}
        {zadnje.izmjerenoAt
          ? formatDatum(zadnje.izmjerenoAt)
          : zadnje.bentotestIzmjerenoAt
            ? formatDatum(zadnje.bentotestIzmjerenoAt)
            : "—"}
      </div>
    </div>
  );
}

export default async function TankPregledPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  noStore();

  const cookieStore = await cookies();
  const raw = cookieStore.get("auth_user")?.value;

  if (!raw) redirect("/login");

  try {
    const user = JSON.parse(decodeURIComponent(raw));
    if (!user) redirect("/login");
  } catch {
    redirect("/login");
  }

  const resolvedParams = await params;
  const id = resolvedParams?.id;

  if (!id) return notFound();

  const tank = await prisma.tank.findUnique({
    where: { id },
    include: {
      udjeliSorti: {
        orderBy: {
          postotak: "desc",
        },
      },
      blendIzvori: {
        orderBy: {
          createdAt: "asc",
        },
        include: {
          izvorTank: {
            include: {
              mjerenja: {
                orderBy: {
                  izmjerenoAt: "desc",
                },
                take: 30,
              },
            },
          },
          izvorArhivaVina: {
            include: {
              mjerenja: {
                orderBy: {
                  izmjerenoAt: "desc",
                },
                take: 30,
              },
            },
          },
        },
      },
      documents: {
        orderBy: [{ datumDokumenta: "desc" }, { createdAt: "desc" }],
      },
      izlaziVina: {
        orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
        take: 50,
      },
    },
  });

  if (!tank) return notFound();

  const mjerenjaZaTop = await prisma.mjerenje.findMany({
    where: { tankId: id },
    orderBy: { izmjerenoAt: "desc" },
    take: 200,
  });

  const svaMjerenja = await prisma.mjerenje.findMany({
    where: { tankId: id },
    orderBy: { izmjerenoAt: "desc" },
    take: 100,
  });

  const udjeliSorti = tank.udjeliSorti ?? [];
  const ukupnoPostotak = udjeliSorti.reduce(
    (sum, u) => sum + Number(u.postotak ?? 0),
    0
  );
  const ukupnoPostotakRounded = Number(ukupnoPostotak.toFixed(2));
  const sastavIspravan = Math.abs(ukupnoPostotakRounded - 100) < 0.01;

  const oznakaSastava =
    udjeliSorti.length === 0
      ? "Nije upisano"
      : udjeliSorti.length === 1
        ? udjeliSorti[0].nazivSorte
        : "Cuvée / blend";

  const tankJePrazan =
    Number(tank.kolicinaVinaUTanku ?? 0) <= 0 &&
    !tank.sorta &&
    !tank.nazivVina &&
    !tank.godiste &&
    udjeliSorti.length === 0;

  const izlaziZaPrikaz = tankJePrazan ? [] : (tank.izlaziVina ?? []);

  const punjenja = !tankJePrazan
  ? await prisma.punjenjeTanka.findMany({
      where: {
        tankId: id,
        stavke: {
          some: {
            obrisano: false,
          },
        },
      },
      orderBy: { datumPunjenja: "desc" },
      take: 1,
      include: {
        stavke: {
          where: {
            obrisano: false,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    })
  : [];

  const otvoreniZadaci = tankJePrazan
  ? []
  : await prisma.zadatak.findMany({
      where: { tankId: id, status: "OTVOREN" },
      include: {
        preparat: {
          select: {
            id: true,
            naziv: true,
            dozaOd: true,
            dozaDo: true,
            unit: {
              select: {
                naziv: true,
              },
            },
          },
        },
        jedinica: true,
        izlaznaJedinica: true,
        zadaoKorisnik: true,
        izvrsioKorisnik: true,
        stavke: {
          include: {
            preparat: {
              select: {
                id: true,
                naziv: true,
                dozaOd: true,
                dozaDo: true,
                unit: {
                  select: {
                    naziv: true,
                  },
                },
              },
            },
            jedinica: true,
            izlaznaJedinica: true,
          },
          orderBy: {
            redoslijed: "asc",
          },
        },
      },
      orderBy: { zadanoAt: "desc" },
    });

const izvrseniZadaci = tankJePrazan
  ? []
  : await prisma.zadatak.findMany({
      where: { tankId: id, status: { in: ["IZVRSEN", "OTKAZAN"] } },
      include: {
        preparat: {
          select: {
            id: true,
            naziv: true,
            dozaOd: true,
            dozaDo: true,
            unit: {
              select: {
                naziv: true,
              },
            },
          },
        },
        jedinica: true,
        izlaznaJedinica: true,
        zadaoKorisnik: true,
        izvrsioKorisnik: true,
        stavke: {
          include: {
            preparat: {
              select: {
                id: true,
                naziv: true,
                dozaOd: true,
                dozaDo: true,
                unit: {
                  select: {
                    naziv: true,
                  },
                },
              },
            },
            jedinica: true,
            izlaznaJedinica: true,
          },
          orderBy: {
            redoslijed: "asc",
          },
        },
      },
      orderBy: [{ izvrsenoAt: "desc" }, { zadanoAt: "desc" }],
      take: 30,
    });

  const zadnje = sloziZadnjeMjerenjePoPoljima(mjerenjaZaTop);
  const from = `/tankovi/${tank.id}`;

  const slobodno =
    Number(tank.kapacitet ?? 0) - Number(tank.kolicinaVinaUTanku ?? 0);

  const ukupnoIzlazLitara = izlaziZaPrikaz.reduce(
    (sum, stavka) => sum + Number(stavka.kolicinaLitara ?? 0),
    0
  );

  const ukupnoPunjenjeLitara = izlaziZaPrikaz.reduce((sum, stavka) => {
    if (stavka.tip === "PUNJENJE") {
      return sum + Number(stavka.kolicinaLitara ?? 0);
    }
    return sum;
  }, 0);

  const ukupnoProdajaLitara = izlaziZaPrikaz.reduce((sum, stavka) => {
    if (stavka.tip === "PRODAJA") {
      return sum + Number(stavka.kolicinaLitara ?? 0);
    }
    return sum;
  }, 0);

  const ukupnoBoca = izlaziZaPrikaz.reduce(
    (sum, stavka) => sum + Number(stavka.brojBoca ?? 0),
    0
  );

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <h1 style={titleStyle}>Tank {tank.broj}</h1>
            <div style={subtitleStyle}>Pregled tanka, vina i radnji</div>
          </div>

          <div style={headerBadgesWrapStyle}>
            <div style={headerBadgeStyle}>Sastav: {oznakaSastava}</div>
            <div style={headerBadgeStyle}>Tip: {tank.tip ?? "-"}</div>
            <div style={headerBadgeStyle}>
              Ukupno sastav: {ukupnoPostotakRounded}%
            </div>
          </div>

          <div style={headerActionsStyle}>
            <NatragNaPrethodnu />
            <TankRoleActions
              tankId={tank.id}
              brojTanka={tank.broj}
              primaryStyle={linkButtonPrimaryStyle}
              secondaryStyle={linkButtonSecondaryStyle}
            />
          </div>
        </div>

        <TankSwitcher currentId={id} />
      </div>

      <Link
        href={`/tankovi/${tank.id}/izvjestaj`}
        style={linkButtonPrimaryStyle}
      >
        Izvještaj
      </Link>

      {tank.nazivVina?.trim() ? (
        <div style={nazivVinaStyle}>{tank.nazivVina}</div>
      ) : null}

      <div style={topParamsGridStyle}>
        <ParamTop
          label="Količina vina"
          value={formatBroj(tank.kolicinaVinaUTanku)}
          unit="L"
        />
        <ParamTop
          label="Kapacitet"
          value={formatBroj(tank.kapacitet)}
          unit="L"
        />
        <ParamTop label="Slobodno" value={formatBroj(slobodno)} unit="L" />
      </div>

      <Card title="Zadnje mjerenje">
        <div style={measurementWrapStyle}>
          <div style={measurementPrimaryGridStyle}>
            <ParamTop
              label="Alkohol"
              value={
                zadnje?.alkohol != null ? formatBroj(zadnje.alkohol) : "—"
              }
              unit="%"
              emphasize
            />
            <ParamTop
              label="Šećer"
              value={zadnje?.secer != null ? formatBroj(zadnje.secer) : "—"}
              emphasize
            />
            <ParamTop
              label="Ukupne kiseline"
              value={
                zadnje?.ukupneKiseline != null
                  ? formatBroj(zadnje.ukupneKiseline)
                  : "—"
              }
              emphasize
            />
            <ParamTop
              label="SO2 ukupni"
              value={
                zadnje?.ukupniSO2 != null ? formatBroj(zadnje.ukupniSO2) : "—"
              }
              emphasize
            />
          </div>

          <div style={measurementSecondaryGridStyle}>
            <ParamTop
              label="Temperatura"
              value={
                zadnje?.temperatura != null
                  ? formatBroj(zadnje.temperatura)
                  : "—"
              }
              unit="°C"
            />
            <ParamTop
              label="pH"
              value={zadnje?.ph != null ? formatBroj(zadnje.ph) : "—"}
            />
            <ParamTop
              label="Hlapive kiseline"
              value={
                zadnje?.hlapiveKiseline != null
                  ? formatBroj(zadnje.hlapiveKiseline)
                  : "—"
              }
            />
            <ParamTop
              label="SO2 slobodni"
              value={
                zadnje?.slobodniSO2 != null
                  ? formatBroj(zadnje.slobodniSO2)
                  : "—"
              }
            />
            <ParamTop
              label="Bentotest datum"
              value={
                zadnje?.bentotestDatum
                  ? formatDatumBezVremena(zadnje.bentotestDatum)
                  : "—"
              }
            />
            <ParamTop
              label="Bentotest status"
              value={
                zadnje?.bentotestStatus === "STABILNO"
                  ? "Stabilno"
                  : zadnje?.bentotestStatus === "NESTABILNO"
                    ? "Nestabilno"
                    : "—"
              }
              tone={
                zadnje?.bentotestStatus === "STABILNO"
                  ? "green"
                  : zadnje?.bentotestStatus === "NESTABILNO"
                    ? "red"
                    : "default"
              }
            />
          </div>
        </div>

        <div style={metaBlockStyle}>
          <div>
            Zadnje klasično mjerenje:{" "}
            {zadnje?.izmjerenoAt ? formatDatum(zadnje.izmjerenoAt) : "nema mjerenja"}
          </div>
          <div>
            Zadnji bentotest:{" "}
            {zadnje?.bentotestIzmjerenoAt
              ? formatDatum(zadnje.bentotestIzmjerenoAt)
              : "nema bentotesta"}
          </div>
          {zadnje?.napomena ? <div>Napomena: {zadnje.napomena}</div> : null}
        </div>
      </Card>

      {!tankJePrazan && punjenja.length > 0 ? (
        <Card title="Punjenje / berba">
          <div style={{ display: "grid", gap: 8 }}>
            {punjenja.map((p) => {
              const ukupnoLitara = p.stavke.reduce(
                (sum, s) => sum + Number(s.kolicinaLitara ?? 0),
                0
              );
              const ukupnoKg = p.stavke.reduce(
                (sum, s) => sum + Number(s.kolicinaKgGrozdja ?? 0),
                0
              );

              return (
                <details key={p.id} style={detailsStyle}>
                  <summary style={summaryStyle}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={summaryMainTextStyle}>
                        {p.nazivVina || "Punjenje bez naziva"}
                      </div>
                      <div style={summarySubTextStyle}>
                        {formatDatum(p.datumPunjenja)}
                      </div>
                    </div>

                    <div style={summaryRightStyle}>
                      {formatBroj(ukupnoLitara)} L · {formatBroj(ukupnoKg)} kg
                    </div>
                  </summary>

                  <div style={detailsContentStyle}>
                    <DetailRow label="Naziv vina" value={p.nazivVina || "—"} />
                    <DetailRow
                      label="Datum punjenja"
                      value={formatDatum(p.datumPunjenja)}
                    />
                    <DetailRow
                      label="Ukupno litara"
                      value={`${formatBroj(p.ukupnoLitara)} L`}
                    />
                    <DetailRow
                      label="Ukupno kg grožđa"
                      value={`${formatBroj(p.ukupnoKgGrozdja)} kg`}
                    />
                    <DetailRow label="Napomena" value={p.napomena || "—"} />
                    <DetailRow label="Opis" value={p.opis || "—"} />

                    <div style={innerSectionTitleStyle}>Stavke punjenja</div>

                    {p.stavke.length === 0 ? (
                      <div style={mutedTextStyle}>Nema stavki.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 6 }}>
                        {p.stavke.map((s) => (
                          <div key={s.id} style={subBoxStyle}>
                            <div style={subBoxTopStyle}>
                              <strong style={{ fontWeight: 600 }}>
                                {s.nazivSorte || "—"}
                              </strong>
                              <span>{formatBroj(s.kolicinaLitara)} L</span>
                            </div>
                            <div style={subMetaTextStyle}>
                              Kg grožđa: {formatBroj(s.kolicinaKgGrozdja)} kg
                            </div>
                            <div style={subMetaTextStyle}>
                              Položaj: {s.polozaj || "—"}
                            </div>
                            <div style={subMetaTextStyle}>
                              Opis: {s.opis || "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </Card>
      ) : null}

      {!tankJePrazan && izlaziZaPrikaz.length > 0 ? (
        <Card title="Izlaz vina">
          <div style={izlazSummaryWrapStyle}>
            <div style={izlazSummaryBadgeStyle}>
              Ukupno izašlo: <strong>{formatBroj(ukupnoIzlazLitara, 0)} L</strong>
            </div>
            <div style={izlazSummaryBadgeStyle}>
              Punjenje: <strong>{formatBroj(ukupnoPunjenjeLitara, 0)} L</strong>
            </div>
            <div style={izlazSummaryBadgeStyle}>
              Prodaja / rinfuza:{" "}
              <strong>{formatBroj(ukupnoProdajaLitara, 0)} L</strong>
            </div>
            <div style={izlazSummaryBadgeStyle}>
              Ukupno boca: <strong>{formatBroj(ukupnoBoca, 0)}</strong>
            </div>
          </div>

          <div style={izlazListStyle}>
            {izlaziZaPrikaz.map((stavka) => (
              <details key={stavka.id} style={detailsStyle}>
                <summary style={summaryStyle}>
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={summaryMainTextStyle}>
                      {formatTipIzlaza(stavka.tip)}
                    </div>
                    <div style={summarySubTextStyle}>
                      {formatDatum(stavka.datum)}
                    </div>
                  </div>

                  <div style={summaryRightStyle}>
                    {formatBroj(stavka.kolicinaLitara, 0)} L
                  </div>
                </summary>

                <div style={detailsContentStyle}>
                  <div style={izlazInfoGridStyle}>
                    <div style={izlazInfoCardStyle}>
                      <div style={izlazInfoLabelStyle}>Tip izlaza</div>
                      <div style={izlazInfoValueStyle}>
                        {formatTipIzlaza(stavka.tip)}
                      </div>
                    </div>

                    <div style={izlazInfoCardStyle}>
                      <div style={izlazInfoLabelStyle}>Datum</div>
                      <div style={izlazInfoValueStyle}>
                        {formatDatum(stavka.datum)}
                      </div>
                    </div>

                    <div style={izlazInfoCardStyle}>
                      <div style={izlazInfoLabelStyle}>Količina</div>
                      <div style={izlazInfoValueStyle}>
                        {formatBroj(stavka.kolicinaLitara, 0)} L
                      </div>
                    </div>

                    <div style={izlazInfoCardStyle}>
                      <div style={izlazInfoLabelStyle}>Broj boca</div>
                      <div style={izlazInfoValueStyle}>
                        {stavka.brojBoca != null
                          ? formatBroj(stavka.brojBoca, 0)
                          : "—"}
                      </div>
                    </div>

                    <div style={izlazInfoCardStyle}>
                      <div style={izlazInfoLabelStyle}>Volumen boce</div>
                      <div style={izlazInfoValueStyle}>
                        {stavka.volumenBoce != null
                          ? `${formatBroj(stavka.volumenBoce, 2)} L`
                          : "—"}
                      </div>
                    </div>

                    <div style={izlazInfoCardStyle}>
                      <div style={izlazInfoLabelStyle}>Upisano</div>
                      <div style={izlazInfoValueStyle}>
                        {formatDatum(stavka.createdAt)}
                      </div>
                    </div>
                  </div>

                  <DetailRow
                    label="Napomena"
                    value={stavka.napomena?.trim() ? stavka.napomena : "—"}
                  />
                </div>
              </details>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="Otvoreni zadaci">
        {otvoreniZadaci.length === 0 ? (
          <div style={mutedTextStyle}>Nema otvorenih zadataka.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {otvoreniZadaci.map((z) => {
              const imaStavke = z.stavke && z.stavke.length > 0;

              return (
                <details key={z.id} style={openTaskDetailsStyle}>
                  <summary style={openTaskSummaryStyle}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={summaryMainTextStyle}>
                        {z.naslov || z.vrsta || "Zadatak"}
                      </div>
                      <div style={summarySubTextStyle}>
                        {sazetakZadatka(z)}
                      </div>
                    </div>

                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div style={summaryRightStyle}>
                        {formatDatum(z.zadanoAt)}
                      </div>
                      <span
                        style={{ ...statusPillStyle, ...statusBadge(z.status) }}
                      >
                        {z.status}
                      </span>
                    </div>
                  </summary>

                  <div style={detailsContentStyle}>
                    <DetailRow label="Vrsta" value={z.vrsta ?? "—"} />
                    <DetailRow label="Tip zadatka" value={tipZadatkaLabel(z)} />
                    <DetailRow
                      label="Zadao"
                      value={prikaziKorisnika(z.zadaoKorisnik)}
                    />
                    <DetailRow
                      label="Izvršio"
                      value={prikaziKorisnika(z.izvrsioKorisnik)}
                    />
                    <DetailRow label="Zadano" value={formatDatum(z.zadanoAt)} />
                    <DetailRow
                      label="Napomena"
                      value={z.napomena?.trim() ? z.napomena : "—"}
                    />

                    {imaStavke ? (
                      <>
                        <DetailRow
                          label="Broj preparata"
                          value={String(z.stavke.length)}
                        />
                        <div style={innerSectionTitleStyle}>Stavke zadatka</div>

                        <div style={{ display: "grid", gap: 8 }}>
                          {z.stavke.map((s, index) => (
                            <div key={s.id} style={subBoxStyle}>
                              <div style={subBoxTopStyle}>
                                <strong style={{ fontWeight: 600 }}>
                                  {index + 1}. {s.preparat?.naziv ?? "—"}
                                </strong>
                                <span style={{ fontSize: 12, color: "#7f1d1d" }}>
                                  Vezana stavka
                                </span>
                              </div>

                              <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                                <div style={subMetaTextStyle}>
                                  Preporučena doza: {preporucenaDozaText(s.preparat)}
                                </div>
                                <div style={subMetaTextStyle}>
                                  Odabrana doza:{" "}
                                  {s.doza != null
                                    ? `${formatBroj(s.doza)} ${s.jedinica?.naziv ?? ""}`.trim()
                                    : "—"}
                                </div>
                                <div style={subMetaTextStyle}>
                                  Volumen u tanku:{" "}
                                  {s.volumenUTanku != null
                                    ? `${formatBroj(s.volumenUTanku)} L`
                                    : "—"}
                                </div>
                                <div style={subMetaTextStyle}>
                                  Ukupno za dodati:{" "}
                                  {s.izracunataKolicina != null
                                    ? `${formatBroj(s.izracunataKolicina)} ${
                                        s.izlaznaJedinica?.naziv ?? ""
                                      }`.trim()
                                    : "—"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <DetailRow
                          label="Sredstvo"
                          value={z.preparat?.naziv ?? "—"}
                        />
                        <DetailRow
                          label="Preporučena doza"
                          value={preporucenaDozaText(z.preparat)}
                        />
                        <DetailRow
                          label="Odabrana doza"
                          value={
                            z.doza != null
                              ? `${formatBroj(z.doza)} ${z.jedinica?.naziv ?? ""}`.trim()
                              : "—"
                          }
                        />
                        <DetailRow
                          label="Volumen u tanku"
                          value={
                            z.volumenUTanku != null
                              ? `${formatBroj(z.volumenUTanku)} L`
                              : "—"
                          }
                        />
                        <DetailRow
                          label="Ukupno za dodati"
                          value={
                            z.izracunataKolicina != null
                              ? `${formatBroj(z.izracunataKolicina)} ${
                                  z.izlaznaJedinica?.naziv ?? ""
                                }`.trim()
                              : "—"
                          }
                        />
                      </>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>

      <div style={twoColGridStyle}>
        <Card title="Sastav vina">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={sectionToolbarStyle}>
              <div style={mutedTextStyle}>Trenutni sastav vina u tanku</div>

              <TankRoleSastavModal
                tankId={tank.id}
                stavke={udjeliSorti.map((u) => ({
                  id: u.id,
                  nazivSorte: u.nazivSorte,
                  postotak: u.postotak,
                }))}
              />
            </div>

            <div style={infoStripStyle}>
              <div>Ukupno upisano: {ukupnoPostotakRounded}%</div>
              <div>
                {sastavIspravan
                  ? "Sastav je ispravno zbrojen"
                  : "Upozorenje: sastav nije 100%"}
              </div>
            </div>

            {udjeliSorti.length === 0 ? (
              <div style={mutedTextStyle}>Nema podataka o sastavu vina.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {udjeliSorti.map((u) => (
                  <div key={u.id} style={compositionRowStyle}>
                    <div style={compositionHeaderStyle}>
                      <strong style={{ fontWeight: 600 }}>{u.nazivSorte}</strong>
                      <span>{formatBroj(u.postotak)}%</span>
                    </div>

                    <div style={progressTrackStyle}>
                      <div
                        style={{
                          ...progressFillStyle,
                          width: `${Math.max(
                            0,
                            Math.min(100, Number(u.postotak))
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card title="Izvršeni i zatvoreni zadaci">
          {izvrseniZadaci.length === 0 ? (
            <div style={mutedTextStyle}>Nema odrađenih zadataka.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {izvrseniZadaci.map((z) => {
                const imaStavke = z.stavke && z.stavke.length > 0;

                return (
                  <details key={z.id} style={detailsStyle}>
                    <summary style={summaryStyle}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={summaryMainTextStyle}>
                          {z.naslov || z.vrsta || "Zadatak"}
                        </div>
                        <div style={summarySubTextStyle}>
                          {sazetakZadatka(z)}
                        </div>
                      </div>

                      <div
                        style={{ display: "flex", alignItems: "center", gap: 10 }}
                      >
                        <div style={summaryRightStyle}>
                          {z.izvrsenoAt
                            ? formatDatum(z.izvrsenoAt)
                            : formatDatum(z.zadanoAt)}
                        </div>
                        <span
                          style={{ ...statusPillStyle, ...statusBadge(z.status) }}
                        >
                          {z.status}
                        </span>
                      </div>
                    </summary>

                    <div style={detailsContentStyle}>
                      <DetailRow label="Vrsta" value={z.vrsta ?? "—"} />
                      <DetailRow label="Tip zadatka" value={tipZadatkaLabel(z)} />
                      <DetailRow
                        label="Zadao"
                        value={prikaziKorisnika(z.zadaoKorisnik)}
                      />
                      <DetailRow
                        label="Izvršio"
                        value={prikaziKorisnika(z.izvrsioKorisnik)}
                      />
                      <DetailRow label="Zadano" value={formatDatum(z.zadanoAt)} />
                      <DetailRow
                        label="Izvršeno"
                        value={formatDatum(z.izvrsenoAt)}
                      />
                      <DetailRow
                        label="Napomena"
                        value={z.napomena?.trim() ? z.napomena : "—"}
                      />

                      {imaStavke ? (
                        <>
                          <DetailRow
                            label="Broj preparata"
                            value={String(z.stavke.length)}
                          />
                          <div style={innerSectionTitleStyle}>Stavke zadatka</div>

                          <div style={{ display: "grid", gap: 8 }}>
                            {z.stavke.map((s, index) => (
                              <div key={s.id} style={subBoxStyle}>
                                <div style={subBoxTopStyle}>
                                  <strong style={{ fontWeight: 600 }}>
                                    {index + 1}. {s.preparat?.naziv ?? "—"}
                                  </strong>
                                  <span style={{ fontSize: 12, color: "#7f1d1d" }}>
                                    Vezana stavka
                                  </span>
                                </div>

                                <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                                  <div style={subMetaTextStyle}>
                                    Preporučena doza: {preporucenaDozaText(s.preparat)}
                                  </div>
                                  <div style={subMetaTextStyle}>
                                    Odabrana doza:{" "}
                                    {s.doza != null
                                      ? `${formatBroj(s.doza)} ${s.jedinica?.naziv ?? ""}`.trim()
                                      : "—"}
                                  </div>
                                  <div style={subMetaTextStyle}>
                                    Volumen u tanku:{" "}
                                    {s.volumenUTanku != null
                                      ? `${formatBroj(s.volumenUTanku)} L`
                                      : "—"}
                                  </div>
                                  <div style={subMetaTextStyle}>
                                    Ukupno za dodati:{" "}
                                    {s.izracunataKolicina != null
                                      ? `${formatBroj(s.izracunataKolicina)} ${
                                          s.izlaznaJedinica?.naziv ?? ""
                                        }`.trim()
                                      : "—"}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <DetailRow
                            label="Sredstvo"
                            value={z.preparat?.naziv ?? "—"}
                          />
                          <DetailRow
                            label="Preporučena doza"
                            value={preporucenaDozaText(z.preparat)}
                          />
                          <DetailRow
                            label="Odabrana doza"
                            value={
                              z.doza != null
                                ? `${formatBroj(z.doza)} ${z.jedinica?.naziv ?? ""}`.trim()
                                : "—"
                            }
                          />
                          <DetailRow
                            label="Volumen u tanku"
                            value={
                              z.volumenUTanku != null
                                ? `${formatBroj(z.volumenUTanku)} L`
                                : "—"
                            }
                          />
                          <DetailRow
                            label="Ukupno za dodati"
                            value={
                              z.izracunataKolicina != null
                                ? `${formatBroj(z.izracunataKolicina)} ${
                                    z.izlaznaJedinica?.naziv ?? ""
                                  }`.trim()
                                : "—"
                            }
                          />
                        </>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="Porijeklo vina / izvori blenda">
        {tank.blendIzvori.length === 0 ? (
          <div style={mutedTextStyle}>Nema zapisanih izvora za ovo vino.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {tank.blendIzvori.map((izvor) => {
              const href = izvor.izvorTankId
                ? `/tankovi/${izvor.izvorTankId}?from=${encodeURIComponent(from)}`
                : izvor.izvorArhivaVinaId
                  ? `/arhiva/${izvor.izvorArhivaVinaId}?from=${encodeURIComponent(
                      from
                    )}`
                  : null;

              return (
                <details key={izvor.id} style={detailsStyle}>
                  <summary style={summaryStyle}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={summaryMainTextStyle}>
                        {izvor.nazivVina ?? izvor.sorta ?? "Nepoznato vino"}
                      </div>
                      <div style={summarySubTextStyle}>
                        {formatBroj(izvor.postotak)}% · {formatBroj(izvor.kolicina)}{" "}
                        L
                      </div>
                    </div>

                    <div style={summaryRightStyle}>{izvor.sorta ?? "-"}</div>
                  </summary>

                  <div style={detailsContentStyle}>
                    <DetailRow label="Sorta" value={izvor.sorta ?? "-"} />
                    <DetailRow
                      label="Datum"
                      value={formatDatumBezVremena(izvor.createdAt)}
                    />
                    <DetailRow
                      label="Količina"
                      value={`${formatBroj(izvor.kolicina)} L`}
                    />

                    {izvor.izvorTank ? (
                      <IzvorMjerenjeBlock mjerenja={izvor.izvorTank.mjerenja} />
                    ) : izvor.izvorArhivaVina ? (
                      <IzvorMjerenjeBlock
                        mjerenja={izvor.izvorArhivaVina.mjerenja}
                      />
                    ) : (
                      <div style={sourceMeasurementWrapStyle}>
                        <div style={sourceMeasurementTitleStyle}>
                          Zadnje mjerenje izvora
                        </div>
                        <div style={mutedTextStyle}>
                          Parametri nisu dostupni jer izvor nije pronađen ni u
                          aktivnim tankovima ni u arhivi.
                        </div>
                      </div>
                    )}

                    {href ? (
                      <Link href={href} style={linkButtonPrimaryStyle}>
                        Otvori izvor
                      </Link>
                    ) : (
                      <div style={mutedTextStyle}>
                        Nema dostupne poveznice na izvor.
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>

      <div style={docsGridStyle}>
        <Card title="Dokumenti">
          <TankRoleDokumentiUpload tankId={tank.id} />
        </Card>

        <Card title="Popis dokumenata">
          {tank.documents.length === 0 ? (
            <div style={mutedTextStyle}>Nema spremljenih dokumenata.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {tank.documents.map((d) => (
                <details key={d.id} style={detailsStyle}>
                  <summary style={summaryStyle}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={summaryMainTextStyle}>{d.naziv}</div>
                      <div style={summarySubTextStyle}>
                        {d.datumDokumenta
                          ? new Date(d.datumDokumenta).toLocaleDateString("hr-HR")
                          : "-"}
                      </div>
                    </div>

                    <div style={summaryRightStyle}>{d.vrsta}</div>
                  </summary>

                  <div style={detailsContentStyle}>
                    <DetailRow
                      label="Datum dokumenta"
                      value={
                        d.datumDokumenta
                          ? new Date(d.datumDokumenta).toLocaleDateString("hr-HR")
                          : "-"
                      }
                    />
                    <DetailRow label="Dodao" value={d.uploadedByIme ?? "-"} />
                    <DetailRow label="Napomena" value={d.napomena ?? "-"} />

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={linkButtonPrimaryStyle}
                      >
                        Otvori
                      </a>

                      <a href={d.fileUrl} download style={linkButtonSecondaryStyle}>
                        Preuzmi
                      </a>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Sva mjerenja">
        {svaMjerenja.length === 0 ? (
          <div style={mutedTextStyle}>Nema mjerenja.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {svaMjerenja.map((m, index) => {
              const samoBentotest = jeSamoBentotestZapis(m as any);

              return (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid #ececec",
                    background: index % 2 === 0 ? "#ffffff" : "#fcfcfc",
                    padding: "8px 9px",
                    borderRadius: 0,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#2f2f2f" }}>
                      {samoBentotest ? "Bentotest" : "Mjerenje"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {formatDatum(m.izmjerenoAt)}
                    </div>
                  </div>

                  {samoBentotest ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: 4,
                      }}
                    >
                      <div style={mjerenjeMiniCardStyle}>
                        <div style={mjerenjeMiniLabelStyle}>Bentotest datum</div>
                        <div
                          style={{
                            ...mjerenjeMiniValueStyle,
                            color: bojaAktivnogPolja(m.bentotestDatum),
                          }}
                        >
                          {m.bentotestDatum
                            ? formatDatumBezVremena(m.bentotestDatum)
                            : "—"}
                        </div>
                      </div>

                      <div style={mjerenjeMiniCardStyle}>
                        <div style={mjerenjeMiniLabelStyle}>Bentotest status</div>
                        <div
                          style={{
                            ...mjerenjeMiniValueStyle,
                            color:
                              m.bentotestStatus === "NESTABILNO"
                                ? "#9f1239"
                                : m.bentotestStatus === "STABILNO"
                                  ? "#166534"
                                  : "#9ca3af",
                          }}
                        >
                          {bentotestLabel(m.bentotestStatus)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={mjerenjeWrapStyle}>
                      <div style={mjerenjePrimaryGridStyle}>
                        <div style={mjerenjeMiniCardStrongStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Alkohol</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStrongStyle,
                              color: bojaAktivnogPolja(m.alkohol),
                            }}
                          >
                            {m.alkohol != null ? formatBroj(m.alkohol) : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStrongStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Šećer</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStrongStyle,
                              color: bojaAktivnogPolja(m.secer),
                            }}
                          >
                            {m.secer != null ? formatBroj(m.secer) : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStrongStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Uk. kiseline</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStrongStyle,
                              color: bojaAktivnogPolja(m.ukupneKiseline),
                            }}
                          >
                            {m.ukupneKiseline != null
                              ? formatBroj(m.ukupneKiseline)
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStrongStyle}>
                          <div style={mjerenjeMiniLabelStyle}>SO2 uk.</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStrongStyle,
                              color: bojaAktivnogPolja(m.ukupniSO2),
                            }}
                          >
                            {m.ukupniSO2 != null ? formatBroj(m.ukupniSO2) : "—"}
                          </div>
                        </div>
                      </div>

                      <div style={mjerenjeSecondaryGridStyle}>
                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>pH</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.ph),
                            }}
                          >
                            {m.ph != null ? formatBroj(m.ph) : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Temperatura</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.temperatura),
                            }}
                          >
                            {m.temperatura != null
                              ? `${formatBroj(m.temperatura)} °C`
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Hlapive</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.hlapiveKiseline),
                            }}
                          >
                            {m.hlapiveKiseline != null
                              ? formatBroj(m.hlapiveKiseline)
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>SO2 slob.</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.slobodniSO2),
                            }}
                          >
                            {m.slobodniSO2 != null
                              ? formatBroj(m.slobodniSO2)
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Bentotest datum</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color: bojaAktivnogPolja(m.bentotestDatum),
                            }}
                          >
                            {m.bentotestDatum
                              ? formatDatumBezVremena(m.bentotestDatum)
                              : "—"}
                          </div>
                        </div>

                        <div style={mjerenjeMiniCardStyle}>
                          <div style={mjerenjeMiniLabelStyle}>Bentotest status</div>
                          <div
                            style={{
                              ...mjerenjeMiniValueStyle,
                              color:
                                m.bentotestStatus === "NESTABILNO"
                                  ? "#9f1239"
                                  : m.bentotestStatus === "STABILNO"
                                    ? "#166534"
                                    : "#9ca3af",
                            }}
                          >
                            {bentotestLabel(m.bentotestStatus)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    <span style={{ fontWeight: 600, color: "#44403c" }}>Napomena:</span>{" "}
                    {m.napomena ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const pageStyle: React.CSSProperties = {
  background: "#f4f4f5",
  padding: 16,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  fontSize: 13,
  color: "#2f2f2f",
  minHeight: "100vh",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 10,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.1,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 3,
  color: "#6b7280",
  fontSize: 13,
};

const headerBadgesWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const headerBadgeStyle: React.CSSProperties = {
  padding: "5px 8px",
  border: "1px solid rgba(127,29,29,0.18)",
  background: "#ffffff",
  fontSize: 12,
  borderRadius: 0,
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const nazivVinaStyle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 10,
  textAlign: "center",
  fontSize: 24,
  fontWeight: 800,
  color: "#7f1d1d",
  lineHeight: 1.15,
  letterSpacing: 0.2,
};

const topParamsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 6,
};

const measurementWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 8,
};

const measurementPrimaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 6,
};

const measurementSecondaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 4,
};

const paramCardStyle: React.CSSProperties = {
  padding: "7px 8px",
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
  borderRadius: 0,
};

const paramCardStrongStyle: React.CSSProperties = {
  background: "#fffafa",
  border: "1px solid rgba(127,29,29,0.26)",
};

const paramLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 11,
  marginBottom: 3,
};

const paramLabelStrongStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.2,
  color: "#7f1d1d",
};

const paramValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#222",
};

const paramValueStrongStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
  marginTop: 10,
  borderRadius: 0,
};

const cardTitleStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid rgba(127,29,29,0.18)",
  fontSize: 13,
  fontWeight: 600,
};

const metaBlockStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderTop: "1px solid #e5e7eb",
  display: "grid",
  gap: 4,
  color: "#6b7280",
};

const detailRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "170px minmax(0, 1fr)",
  gap: 10,
  padding: "4px 0",
};

const detailLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
};

const detailValueStyle: React.CSSProperties = {
  color: "#2f2f2f",
  fontSize: 13,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const detailsStyle: React.CSSProperties = {
  borderBottom: "1px solid #ececec",
  borderRadius: 0,
};

const openTaskDetailsStyle: React.CSSProperties = {
  border: "2px solid #dc2626",
  background: "#fffaf9",
  borderRadius: 0,
};

const summaryStyle: React.CSSProperties = {
  listStyle: "none",
  cursor: "pointer",
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  borderRadius: 0,
};

const openTaskSummaryStyle: React.CSSProperties = {
  ...summaryStyle,
  background: "#fff5f5",
  fontWeight: 700,
};

const summaryMainTextStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "#2f2f2f",
};

const summarySubTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const summaryRightStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#7f1d1d",
};

const detailsContentStyle: React.CSSProperties = {
  padding: "0 10px 10px 10px",
  display: "grid",
  gap: 6,
};

const innerSectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#44403c",
  borderTop: "1px solid #ececec",
  paddingTop: 8,
  marginTop: 4,
};

const subBoxStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  padding: "8px 10px",
  background: "#fcfcfc",
  borderRadius: 0,
};

const subBoxTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const subMetaTextStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  marginTop: 3,
};

const statusPillStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 0,
};

const twoColGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 10,
};

const docsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 10,
};

const compositionRowStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  padding: "8px 10px",
  background: "#fcfcfc",
  borderRadius: 0,
};

const compositionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 6,
};

const progressTrackStyle: React.CSSProperties = {
  width: "100%",
  height: 8,
  background: "#ececec",
  borderRadius: 0,
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "rgba(127,29,29,0.72)",
  borderRadius: 0,
};

const sectionToolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const infoStripStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  padding: "8px 10px",
  border: "1px solid #ececec",
  background: "#fcfcfc",
  borderRadius: 0,
};

const mutedTextStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  padding: "8px 10px",
};

const linkButtonPrimaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  border: "1px solid rgba(127,29,29,0.25)",
  background: "#ffffff",
  color: "#7f1d1d",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 0,
};

const linkButtonSecondaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  border: "1px solid #d1d5db",
  background: "#fafafa",
  color: "#44403c",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 0,
};

const sourceMeasurementWrapStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#fcfcfc",
  padding: "8px 10px",
  display: "grid",
  gap: 8,
  marginTop: 4,
  borderRadius: 0,
};

const sourceMeasurementTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#44403c",
};

const sourceMeasurementPrimaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 4,
};

const sourceMeasurementSecondaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 4,
};

const sourceMeasurementPrimaryItemStyle: React.CSSProperties = {
  border: "1px solid rgba(127,29,29,0.22)",
  background: "#ffffff",
  padding: "7px 8px",
  display: "grid",
  gap: 2,
  borderRadius: 0,
};

const sourceMeasurementItemStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#ffffff",
  padding: "6px 8px",
  display: "grid",
  gap: 2,
  borderRadius: 0,
};

const sourceMeasurementLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
};

const sourceMeasurementMetaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const mjerenjeWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const mjerenjePrimaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 4,
};

const mjerenjeSecondaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 4,
};

const mjerenjeMiniCardStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#ffffff",
  padding: "6px 7px",
  display: "grid",
  gap: 2,
  borderRadius: 0,
};

const mjerenjeMiniCardStrongStyle: React.CSSProperties = {
  border: "1px solid rgba(127,29,29,0.22)",
  background: "#fffafa",
  padding: "6px 7px",
  display: "grid",
  gap: 2,
  borderRadius: 0,
};

const mjerenjeMiniLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#6b7280",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

const mjerenjeMiniValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#2f2f2f",
};

const mjerenjeMiniValueStrongStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#2f2f2f",
};

const izlazSummaryWrapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 6,
  padding: 8,
};

const izlazSummaryBadgeStyle: React.CSSProperties = {
  border: "1px solid rgba(127,29,29,0.18)",
  background: "#fcfcfc",
  padding: "8px 10px",
  fontSize: 12,
  color: "#44403c",
};

const izlazListStyle: React.CSSProperties = {
  display: "grid",
  gap: 0,
};

const izlazInfoGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 6,
};

const izlazInfoCardStyle: React.CSSProperties = {
  border: "1px solid #ececec",
  background: "#fcfcfc",
  padding: "8px 10px",
  display: "grid",
  gap: 4,
};

const izlazInfoLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
};

const izlazInfoValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#2f2f2f",
};