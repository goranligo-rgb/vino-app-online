import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";

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

    return `${tip} • ${nazivi || "više preparata"}${
      ukupno ? ` • ukupno: ${ukupno}` : ""
    }`;
  }

  const sredstvo = z.preparat?.naziv ?? "Bez preparata";
  const ukupno =
    z.izracunataKolicina != null
      ? `${formatBroj(z.izracunataKolicina)} ${z.izlaznaJedinica?.naziv ?? ""}`.trim()
      : "—";

  return `${tip} • ${sredstvo} • ukupno: ${ukupno}`;
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={sectionBodyStyle}>{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={rowStyle}>
      <div style={rowLabelStyle}>{label}</div>
      <div style={rowValueStyle}>{value}</div>
    </div>
  );
}

export default async function TankIzvjestajPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  noStore();

  const resolvedParams = await params;
  const id = resolvedParams?.id;

  if (!id) return notFound();

  const tank = await prisma.tank.findUnique({
    where: { id },
    include: {
      udjeliSorti: {
        orderBy: { postotak: "desc" },
      },
      blendIzvori: {
        orderBy: { createdAt: "asc" },
        include: {
          izvorTank: true,
          izvorArhivaVina: true,
        },
      },
      documents: {
        orderBy: [{ datumDokumenta: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!tank) return notFound();

  const mjerenja = await prisma.mjerenje.findMany({
    where: { tankId: id },
    orderBy: { izmjerenoAt: "desc" },
    take: 300,
  });

  const punjenja = await prisma.punjenjeTanka.findMany({
    where: { tankId: id },
    orderBy: { datumPunjenja: "desc" },
    include: {
      stavke: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const otvoreniZadaci = await prisma.zadatak.findMany({
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

  const izvrseniZadaci = await prisma.zadatak.findMany({
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
    take: 100,
  });

  const udjeliSorti = tank.udjeliSorti ?? [];
  const ukupnoPostotak = udjeliSorti.reduce(
    (sum, u) => sum + Number(u.postotak ?? 0),
    0
  );
  const ukupnoPostotakRounded = Number(ukupnoPostotak.toFixed(2));

  const oznakaSastava =
    udjeliSorti.length === 0
      ? "Nije upisano"
      : udjeliSorti.length === 1
      ? udjeliSorti[0].nazivSorte
      : "Cuvée / blend";

  const zadnje = sloziZadnjeMjerenjePoPoljima(mjerenja);

  const slobodno =
    Number(tank.kapacitet ?? 0) - Number(tank.kolicinaVinaUTanku ?? 0);

  const danas = new Date().toLocaleString("hr-HR");

  return (
    <div style={pageStyle}>
      <style>{`
        @media print {
          html, body {
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          a[href] {
            text-decoration: none !important;
            color: #000 !important;
          }

          .no-print {
            display: none !important;
          }

          body * {
            box-sizing: border-box !important;
          }

          @page {
            size: A4 portrait;
            margin: 12mm;
          }
        }
      `}</style>

      <div className="no-print" style={topActionsStyle}>
        <Link href={`/tankovi/${tank.id}`} style={actionButtonStyle}>
          Natrag na pregled tanka
        </Link>

        <div style={infoButtonStyle}>
          Za PDF koristi Ctrl+P ili Print → Save as PDF
        </div>
      </div>

      <div style={reportWrapStyle}>
        <div style={reportHeaderStyle}>
          <div>
            <h1 style={reportTitleStyle}>Izvještaj tanka {tank.broj}</h1>
            <div style={reportSubStyle}>
              Pregled vina, mjerenja, zadataka i dokumentacije
            </div>
          </div>

          <div style={headerInfoBoxStyle}>
            <div>Datum izrade: {danas}</div>
            <div>ID tanka: {tank.id}</div>
          </div>
        </div>

        <Section title="1. Osnovni podaci">
          <div style={gridTwoStyle}>
            <Row label="Broj tanka" value={tank.broj} />
            <Row label="Tip tanka" value={tank.tip ?? "—"} />
            <Row
              label="Količina vina"
              value={`${formatBroj(tank.kolicinaVinaUTanku)} L`}
            />
            <Row label="Kapacitet" value={`${formatBroj(tank.kapacitet)} L`} />
            <Row label="Slobodno" value={`${formatBroj(slobodno)} L`} />
            <Row label="Naziv vina" value={tank.nazivVina ?? "—"} />
            <Row label="Godište" value={tank.godiste ?? "—"} />
            <Row label="Oznaka sastava" value={oznakaSastava} />
          </div>
        </Section>

        <Section title="2. Sastav vina">
          {udjeliSorti.length === 0 ? (
            <div style={mutedStyle}>Nema upisanog sastava vina.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {udjeliSorti.map((u) => (
                <div key={u.id} style={boxStyle}>
                  <div style={boxTopStyle}>
                    <strong>{u.nazivSorte}</strong>
                    <span>{formatBroj(u.postotak)}%</span>
                  </div>
                </div>
              ))}
              <div style={totalsStyle}>
                Ukupno sastav: {ukupnoPostotakRounded}%
              </div>
            </div>
          )}
        </Section>

        <Section title="3. Zadnje mjerenje">
          {!zadnje ? (
            <div style={mutedStyle}>Nema mjerenja.</div>
          ) : (
            <>
              <div style={gridThreeStyle}>
                <Row
                  label="Temperatura"
                  value={
                    zadnje.temperatura != null
                      ? `${formatBroj(zadnje.temperatura)} °C`
                      : "—"
                  }
                />
                <Row
                  label="pH"
                  value={zadnje.ph != null ? formatBroj(zadnje.ph) : "—"}
                />
                <Row
                  label="Šećer"
                  value={zadnje.secer != null ? formatBroj(zadnje.secer) : "—"}
                />
                <Row
                  label="Alkohol"
                  value={
                    zadnje.alkohol != null
                      ? `${formatBroj(zadnje.alkohol)} %`
                      : "—"
                  }
                />
                <Row
                  label="Ukupne kiseline"
                  value={
                    zadnje.ukupneKiseline != null
                      ? formatBroj(zadnje.ukupneKiseline)
                      : "—"
                  }
                />
                <Row
                  label="Hlapive kiseline"
                  value={
                    zadnje.hlapiveKiseline != null
                      ? formatBroj(zadnje.hlapiveKiseline)
                      : "—"
                  }
                />
                <Row
                  label="SO2 slobodni"
                  value={
                    zadnje.slobodniSO2 != null
                      ? formatBroj(zadnje.slobodniSO2)
                      : "—"
                  }
                />
                <Row
                  label="SO2 ukupni"
                  value={
                    zadnje.ukupniSO2 != null
                      ? formatBroj(zadnje.ukupniSO2)
                      : "—"
                  }
                />
                <Row
                  label="Bentotest datum"
                  value={
                    zadnje.bentotestDatum
                      ? formatDatumBezVremena(zadnje.bentotestDatum)
                      : "—"
                  }
                />
                <Row
                  label="Bentotest status"
                  value={bentotestLabel(zadnje.bentotestStatus)}
                />
                <Row
                  label="Zadnje klasično mjerenje"
                  value={zadnje.izmjerenoAt ? formatDatum(zadnje.izmjerenoAt) : "—"}
                />
                <Row
                  label="Zadnji bentotest"
                  value={
                    zadnje.bentotestIzmjerenoAt
                      ? formatDatum(zadnje.bentotestIzmjerenoAt)
                      : "—"
                  }
                />
              </div>

              <div style={{ marginTop: 10 }}>
                <Row label="Napomena" value={zadnje.napomena ?? "—"} />
              </div>
            </>
          )}
        </Section>

        <Section title="4. Sva mjerenja">
          {mjerenja.length === 0 ? (
            <div style={mutedStyle}>Nema mjerenja.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {mjerenja.map((m) => {
                const samoBentotest = jeSamoBentotestZapis(m as any);

                return (
                  <div key={m.id} style={recordStyle}>
                    <div style={recordHeaderStyle}>
                      <strong>{samoBentotest ? "Bentotest" : "Mjerenje"}</strong>
                      <span>{formatDatum(m.izmjerenoAt)}</span>
                    </div>

                    {samoBentotest ? (
                      <div style={gridTwoStyle}>
                        <Row
                          label="Bentotest datum"
                          value={
                            m.bentotestDatum
                              ? formatDatumBezVremena(m.bentotestDatum)
                              : "—"
                          }
                        />
                        <Row
                          label="Bentotest status"
                          value={bentotestLabel(m.bentotestStatus)}
                        />
                      </div>
                    ) : (
                      <div style={gridThreeStyle}>
                        <Row label="Alkohol" value={m.alkohol ?? "—"} />
                        <Row label="pH" value={m.ph ?? "—"} />
                        <Row label="Šećer" value={m.secer ?? "—"} />
                        <Row
                          label="Temperatura"
                          value={m.temperatura != null ? `${m.temperatura} °C` : "—"}
                        />
                        <Row
                          label="Ukupne kiseline"
                          value={m.ukupneKiseline ?? "—"}
                        />
                        <Row
                          label="Hlapive kiseline"
                          value={m.hlapiveKiseline ?? "—"}
                        />
                        <Row
                          label="SO2 slobodni"
                          value={m.slobodniSO2 ?? "—"}
                        />
                        <Row label="SO2 ukupni" value={m.ukupniSO2 ?? "—"} />
                        <Row
                          label="Bentotest datum"
                          value={
                            m.bentotestDatum
                              ? formatDatumBezVremena(m.bentotestDatum)
                              : "—"
                          }
                        />
                        <Row
                          label="Bentotest status"
                          value={bentotestLabel(m.bentotestStatus)}
                        />
                      </div>
                    )}

                    <div style={{ marginTop: 8 }}>
                      <Row label="Napomena" value={m.napomena ?? "—"} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="5. Punjenje / berba">
          {punjenja.length === 0 ? (
            <div style={mutedStyle}>Nema zapisa o punjenju / berbi.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {punjenja.map((p) => (
                <div key={p.id} style={recordStyle}>
                  <div style={recordHeaderStyle}>
                    <strong>{p.nazivVina || "Punjenje bez naziva"}</strong>
                    <span>{formatDatum(p.datumPunjenja)}</span>
                  </div>

                  <div style={gridTwoStyle}>
                    <Row label="Naziv vina" value={p.nazivVina || "—"} />
                    <Row
                      label="Datum punjenja"
                      value={formatDatum(p.datumPunjenja)}
                    />
                    <Row
                      label="Ukupno litara"
                      value={`${formatBroj(p.ukupnoLitara)} L`}
                    />
                    <Row
                      label="Ukupno kg grožđa"
                      value={`${formatBroj(p.ukupnoKgGrozdja)} kg`}
                    />
                    <Row label="Napomena" value={p.napomena || "—"} />
                    <Row label="Opis" value={p.opis || "—"} />
                  </div>

                  <div style={subTitleStyle}>Stavke punjenja</div>

                  {p.stavke.length === 0 ? (
                    <div style={mutedStyle}>Nema stavki.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {p.stavke.map((s) => (
                        <div key={s.id} style={boxStyle}>
                          <div style={boxTopStyle}>
                            <strong>{s.nazivSorte || "—"}</strong>
                            <span>{formatBroj(s.kolicinaLitara)} L</span>
                          </div>

                          <div style={gridTwoStyle}>
                            <Row
                              label="Količina kg grožđa"
                              value={`${formatBroj(s.kolicinaKgGrozdja)} kg`}
                            />
                            <Row label="Položaj" value={s.polozaj || "—"} />
                            <Row label="Opis" value={s.opis || "—"} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="6. Otvoreni zadaci">
          {otvoreniZadaci.length === 0 ? (
            <div style={mutedStyle}>Nema otvorenih zadataka.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {otvoreniZadaci.map((z) => {
                const imaStavke = z.stavke && z.stavke.length > 0;

                return (
                  <div key={z.id} style={recordStyle}>
                    <div style={recordHeaderStyle}>
                      <strong>{z.naslov || z.vrsta || "Zadatak"}</strong>
                      <span>{formatDatum(z.zadanoAt)}</span>
                    </div>

                    <div style={gridTwoStyle}>
                      <Row label="Vrsta" value={z.vrsta ?? "—"} />
                      <Row label="Tip zadatka" value={tipZadatkaLabel(z)} />
                      <Row label="Sažetak" value={sazetakZadatka(z)} />
                      <Row
                        label="Zadao"
                        value={prikaziKorisnika(z.zadaoKorisnik)}
                      />
                      <Row
                        label="Izvršio"
                        value={prikaziKorisnika(z.izvrsioKorisnik)}
                      />
                      <Row
                        label="Napomena"
                        value={z.napomena?.trim() ? z.napomena : "—"}
                      />
                    </div>

                    {imaStavke ? (
                      <>
                        <div style={subTitleStyle}>Stavke zadatka</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {z.stavke.map((s, index) => (
                            <div key={s.id} style={boxStyle}>
                              <div style={boxTopStyle}>
                                <strong>
                                  {index + 1}. {s.preparat?.naziv ?? "—"}
                                </strong>
                                <span>Vezana stavka</span>
                              </div>

                              <div style={gridTwoStyle}>
                                <Row
                                  label="Preporučena doza"
                                  value={preporucenaDozaText(s.preparat)}
                                />
                                <Row
                                  label="Odabrana doza"
                                  value={
                                    s.doza != null
                                      ? `${formatBroj(s.doza)} ${s.jedinica?.naziv ?? ""}`.trim()
                                      : "—"
                                  }
                                />
                                <Row
                                  label="Volumen u tanku"
                                  value={
                                    s.volumenUTanku != null
                                      ? `${formatBroj(s.volumenUTanku)} L`
                                      : "—"
                                  }
                                />
                                <Row
                                  label="Ukupno za dodati"
                                  value={
                                    s.izracunataKolicina != null
                                      ? `${formatBroj(s.izracunataKolicina)} ${
                                          s.izlaznaJedinica?.naziv ?? ""
                                        }`.trim()
                                      : "—"
                                  }
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ marginTop: 10 }}>
                        <div style={gridTwoStyle}>
                          <Row
                            label="Sredstvo"
                            value={z.preparat?.naziv ?? "—"}
                          />
                          <Row
                            label="Preporučena doza"
                            value={preporucenaDozaText(z.preparat)}
                          />
                          <Row
                            label="Odabrana doza"
                            value={
                              z.doza != null
                                ? `${formatBroj(z.doza)} ${z.jedinica?.naziv ?? ""}`.trim()
                                : "—"
                            }
                          />
                          <Row
                            label="Volumen u tanku"
                            value={
                              z.volumenUTanku != null
                                ? `${formatBroj(z.volumenUTanku)} L`
                                : "—"
                            }
                          />
                          <Row
                            label="Ukupno za dodati"
                            value={
                              z.izracunataKolicina != null
                                ? `${formatBroj(z.izracunataKolicina)} ${
                                    z.izlaznaJedinica?.naziv ?? ""
                                  }`.trim()
                                : "—"
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="7. Izvršeni i zatvoreni zadaci">
          {izvrseniZadaci.length === 0 ? (
            <div style={mutedStyle}>Nema izvršenih ili zatvorenih zadataka.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {izvrseniZadaci.map((z) => {
                const imaStavke = z.stavke && z.stavke.length > 0;

                return (
                  <div key={z.id} style={recordStyle}>
                    <div style={recordHeaderStyle}>
                      <strong>{z.naslov || z.vrsta || "Zadatak"}</strong>
                      <span>
                        {z.izvrsenoAt
                          ? formatDatum(z.izvrsenoAt)
                          : formatDatum(z.zadanoAt)}
                      </span>
                    </div>

                    <div style={gridTwoStyle}>
                      <Row label="Vrsta" value={z.vrsta ?? "—"} />
                      <Row label="Tip zadatka" value={tipZadatkaLabel(z)} />
                      <Row label="Sažetak" value={sazetakZadatka(z)} />
                      <Row
                        label="Zadao"
                        value={prikaziKorisnika(z.zadaoKorisnik)}
                      />
                      <Row
                        label="Izvršio"
                        value={prikaziKorisnika(z.izvrsioKorisnik)}
                      />
                      <Row label="Zadano" value={formatDatum(z.zadanoAt)} />
                      <Row label="Izvršeno" value={formatDatum(z.izvrsenoAt)} />
                      <Row
                        label="Napomena"
                        value={z.napomena?.trim() ? z.napomena : "—"}
                      />
                    </div>

                    {imaStavke ? (
                      <>
                        <div style={subTitleStyle}>Stavke zadatka</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {z.stavke.map((s, index) => (
                            <div key={s.id} style={boxStyle}>
                              <div style={boxTopStyle}>
                                <strong>
                                  {index + 1}. {s.preparat?.naziv ?? "—"}
                                </strong>
                                <span>Vezana stavka</span>
                              </div>

                              <div style={gridTwoStyle}>
                                <Row
                                  label="Preporučena doza"
                                  value={preporucenaDozaText(s.preparat)}
                                />
                                <Row
                                  label="Odabrana doza"
                                  value={
                                    s.doza != null
                                      ? `${formatBroj(s.doza)} ${s.jedinica?.naziv ?? ""}`.trim()
                                      : "—"
                                  }
                                />
                                <Row
                                  label="Volumen u tanku"
                                  value={
                                    s.volumenUTanku != null
                                      ? `${formatBroj(s.volumenUTanku)} L`
                                      : "—"
                                  }
                                />
                                <Row
                                  label="Ukupno za dodati"
                                  value={
                                    s.izracunataKolicina != null
                                      ? `${formatBroj(s.izracunataKolicina)} ${
                                          s.izlaznaJedinica?.naziv ?? ""
                                        }`.trim()
                                      : "—"
                                  }
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ marginTop: 10 }}>
                        <div style={gridTwoStyle}>
                          <Row
                            label="Sredstvo"
                            value={z.preparat?.naziv ?? "—"}
                          />
                          <Row
                            label="Preporučena doza"
                            value={preporucenaDozaText(z.preparat)}
                          />
                          <Row
                            label="Odabrana doza"
                            value={
                              z.doza != null
                                ? `${formatBroj(z.doza)} ${z.jedinica?.naziv ?? ""}`.trim()
                                : "—"
                            }
                          />
                          <Row
                            label="Volumen u tanku"
                            value={
                              z.volumenUTanku != null
                                ? `${formatBroj(z.volumenUTanku)} L`
                                : "—"
                            }
                          />
                          <Row
                            label="Ukupno za dodati"
                            value={
                              z.izracunataKolicina != null
                                ? `${formatBroj(z.izracunataKolicina)} ${
                                    z.izlaznaJedinica?.naziv ?? ""
                                  }`.trim()
                                : "—"
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="8. Porijeklo vina / blend izvori">
          {tank.blendIzvori.length === 0 ? (
            <div style={mutedStyle}>Nema zapisanih izvora.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {tank.blendIzvori.map((izvor) => (
                <div key={izvor.id} style={recordStyle}>
                  <div style={recordHeaderStyle}>
                    <strong>
                      {izvor.nazivVina ?? izvor.sorta ?? "Nepoznato vino"}
                    </strong>
                    <span>{formatDatumBezVremena(izvor.createdAt)}</span>
                  </div>

                  <div style={gridTwoStyle}>
                    <Row label="Sorta" value={izvor.sorta ?? "—"} />
                    <Row
                      label="Postotak"
                      value={`${formatBroj(izvor.postotak)}%`}
                    />
                    <Row
                      label="Količina"
                      value={`${formatBroj(izvor.kolicina)} L`}
                    />
                    <Row
                      label="Izvor"
                      value={
                        izvor.izvorTank
                          ? `Aktivni tank ${izvor.izvorTank.broj}`
                          : izvor.izvorArhivaVina
                          ? `Arhiva vina`
                          : "—"
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="9. Dokumenti">
          {tank.documents.length === 0 ? (
            <div style={mutedStyle}>Nema spremljenih dokumenata.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {tank.documents.map((d) => (
                <div key={d.id} style={recordStyle}>
                  <div style={recordHeaderStyle}>
                    <strong>{d.naziv}</strong>
                    <span>{d.vrsta}</span>
                  </div>

                  <div style={gridTwoStyle}>
                    <Row
                      label="Datum dokumenta"
                      value={
                        d.datumDokumenta
                          ? new Date(d.datumDokumenta).toLocaleDateString("hr-HR")
                          : "—"
                      }
                    />
                    <Row label="Dodao" value={d.uploadedByIme ?? "—"} />
                    <Row label="Napomena" value={d.napomena ?? "—"} />
                    <Row
                      label="Datoteka"
                      value={
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={docLinkStyle}
                        >
                          Otvori dokument
                        </a>
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const pageStyle: React.CSSProperties = {
  background: "#eef0f3",
  minHeight: "100vh",
  padding: 18,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  color: "#1f2937",
};

const topActionsStyle: React.CSSProperties = {
  maxWidth: 980,
  margin: "0 auto 12px auto",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const actionButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#111827",
  textDecoration: "none",
  fontSize: 13,
};

const infoButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#475569",
  fontSize: 13,
};

const reportWrapStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 980,
  margin: "0 auto",
  background: "#ffffff",
  border: "1px solid #d1d5db",
  padding: 16,
};

const reportHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  borderBottom: "2px solid #111827",
  paddingBottom: 12,
  marginBottom: 14,
};

const reportTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1.1,
};

const reportSubStyle: React.CSSProperties = {
  marginTop: 6,
  color: "#6b7280",
  fontSize: 14,
};

const headerInfoBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  color: "#374151",
  textAlign: "right",
};

const sectionStyle: React.CSSProperties = {
  marginTop: 18,
  border: "1px solid #d1d5db",
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const sectionTitleStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "#f3f4f6",
  borderBottom: "1px solid #d1d5db",
  fontSize: 16,
  fontWeight: 700,
};

const sectionBodyStyle: React.CSSProperties = {
  padding: 12,
  display: "grid",
  gap: 10,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  padding: "5px 0",
};

const rowLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 700,
};

const rowValueStyle: React.CSSProperties = {
  color: "#111827",
  fontSize: 13,
  lineHeight: 1.45,
  wordBreak: "normal",
  overflowWrap: "anywhere",
  whiteSpace: "normal",
};

const gridTwoStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  alignItems: "start",
};

const gridThreeStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const boxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 10,
  background: "#fafafa",
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const boxTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const totalsStyle: React.CSSProperties = {
  marginTop: 2,
  fontWeight: 700,
  fontSize: 13,
};

const mutedStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const recordStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 10,
  background: "#ffffff",
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const recordHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
  paddingBottom: 8,
  marginBottom: 8,
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
};

const subTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  marginTop: 10,
  marginBottom: 4,
};

const docLinkStyle: React.CSSProperties = {
  color: "#111827",
  textDecoration: "underline",
};