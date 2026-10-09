import Link from "next/link";
import type React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { citajSesiju } from "@/lib/auth-sesija";
import { citajUlazneCine, vinoUTanku } from "@/lib/identitet-vina";
import { podrijetloTanka } from "@/lib/berba-model";
import { imeZaPrikaz } from "@/lib/ime-vina";
import { parametriVinaIzKnjige } from "@/lib/parametri-vina";
import { imeIzSnimke, kvasciIzSnimke, snimkaIzlazaPoId } from "@/lib/snimka-vina";
import { nazivStavke, sastavVina } from "@/lib/sastav-vina";
import {
  dogadajiVina,
  prozoriPrijePrezivljavanja,
  prozoriVina,
  PREZIVLJAVA_OD,
} from "@/lib/kronologija-vina";
import { Card } from "@/app/tankovi/[id]/kartica";
import Kronologija from "@/app/tankovi/[id]/kronologija";
import ParametriPoPolju from "@/app/tankovi/[id]/parametri-po-polju";
import { parametriIzSnimke } from "./parametri-iz-snimke";

/**
 * VINO KOJE JE IZASLO — razina 1 arhive, puna evidencija.
 * ======================================================================
 *
 * Adresa: /prosli-tank?snimka=<SnimkaVina.id>, samo snimka IZLAZA (boce ili
 * rinfuza). Odluke vlasnika 29.09.2026. (AGENTS.md): SVAKO vino koje izadje
 * kroz izlaz, i sortno i cuvée, dobiva punu evidenciju — kvasce s postotkom,
 * zadatke, mijesanja, kronologiju, parametre i graf. Samo za gledanje.
 *
 * IZ CEGA:
 *   - ime, sorta, litre, parametri (svih 8 polja) i kvasci s postotkom —
 *     IZ SNIMKE. `VinoRadnja` je jedini tocan izvor udjela kvasca, a pri
 *     praznjenju posude se brise; snimka ga je zamrznula prije toga;
 *   - berba, graf, lanac posuda i kronologija — IZ KNJIGE i iz originala
 *     (`Radnja`, `Zadatak`, ...) po prozoru vina (lib/kronologija-vina.ts),
 *     uz obavezne arhivske tablice. Ispravak podataka mijenja njih, snimku ne.
 * Oznaka "iz snimke" / "iz knjige" stoji na svakoj kartici — obavezna, kao na
 * kucici (vidi page.tsx, odluka 2).
 *
 * TRENUTAK. Vino se cita milisekundu PRIJE izlaza: granica knjige je
 * ukljuciva, pa je u trenutku zavrsnog izlaza posuda vec prazna. Kronologija
 * ide do samog izlaza ukljucivo — izlaz pripada bas tom vinu.
 *
 * ODAKLE JE VINO: sastavnice cvora na kojem je lanac stao, svaka s poveznicom
 * na svoju proslost — /prosli-tank BEZ KORIJENA, po kljucu cina (od
 * 09.10.2026., `nadjiKucicu` u lib/prosli-tank.ts). Vino koje je izaslo
 * nema danasnje stablo ni u jednoj posudi, pa korijena nema; odande se ide
 * dalje u dubinu do berbe — setnja kroz arhivu.
 *
 * UPITI, redom (lib/paralelno.ts): snimka 1, izlaz 1, tankovi 1, stablo ~3,
 * podrijetlo ~2, lanac 2 po karici, dogadaji 11, graf ~3.
 */

/** Prag litara za tocku na grafu — isti kao za kucicu (page.tsx). */
const PRAG_GRAFA = 50;

function fDatum(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fDatumSat(d: Date): string {
  return d.toLocaleString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fBroj(v: number, dec = 0): string {
  return v.toLocaleString("hr-HR", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

export default async function VinoIzSnimke({ snimkaId }: { snimkaId: string }) {
  const prijavljeni = await citajSesiju();

  const snimka = await snimkaIzlazaPoId(prisma, snimkaId);
  if (!snimka) return notFound();

  const izlaz = snimka.izlazVinaId
    ? await prisma.izlazVina.findUnique({ where: { id: snimka.izlazVinaId } })
    : null;

  const sviTankovi = await prisma.tank.findMany({ select: { id: true, broj: true } });
  const brojTanka = new Map(sviTankovi.map((t) => [t.id, t.broj]));
  const brIz = snimka.brojTanka ?? brojTanka.get(snimka.tankId) ?? null;

  const trenutak = new Date(snimka.dogodenoAt.getTime() - 1);

  // STABLO NA TRENUTAK IZLAZA — iz njega lanac posuda i "od cega je slozeno".
  const knjiga = await citajUlazneCine(prisma, sviTankovi.map((t) => t.id));
  // Oznaka partije ide u isti upit — treba je naziv stavke sastava.
  const sveBerbe = await prisma.berba.findMany({
    select: { id: true, nazivSorte: true, oznakaBerbe: true },
  });
  const sorteBerbi = new Map(sveBerbe.map((b) => [b.id, b.nazivSorte] as const));
  const oznakaPartije = new Map(sveBerbe.map((b) => [b.id, b.oznakaBerbe] as const));
  const podrijetlo = await podrijetloTanka(prisma, snimka.tankId, { doTrenutka: trenutak });
  const vino = vinoUTanku(
    knjiga.cini,
    sorteBerbi,
    snimka.tankId,
    trenutak.getTime(),
    {},
    [],
    podrijetlo.ukupnoL
  );

  const { prozori, zadnjiCvor } = await prozoriVina(prisma, {
    tankId: snimka.tankId,
    trenutak,
    doAt: snimka.dogodenoAt,
    vino,
  });
  const dogadaji = await dogadajiVina(prisma, {
    prozori,
    tankIzlazaId: snimka.tankId,
    brojTanka,
    trenutnaSnimkaId: snimka.id,
  });
  const nepotpuni = prozoriPrijePrezivljavanja(prozori);

  const kvasci = kvasciIzSnimke(snimka);

  const parametri = await parametriVinaIzKnjige(prisma, snimka.tankId, { doTrenutka: trenutak });
  const prikazParametara = parametriIzSnimke(snimka, (kljuc) =>
    (parametri?.niz[kljuc as keyof NonNullable<typeof parametri>["niz"]] ?? [])
      .filter((x) => x.postotak >= PRAG_GRAFA)
      .map((x) => ({
        t: x.izmjerenoAt.toISOString(),
        v: x.vrijednost,
        rucno: false,
        posuda: x.brojTanka != null ? `tank ${x.brojTanka}` : "nepoznatoj posudi",
      }))
  );

  const spoj =
    zadnjiCvor.vrsta === "spoj" && zadnjiCvor.sastavnice.length > 1 ? zadnjiCvor : null;
  // Sastav — vina, ne posude (lib/sastav-vina.ts): prijenosi istog vina sazeti.
  const sastavnice = spoj ? sastavVina(spoj) : [];

  const ime = imeZaPrikaz(imeIzSnimke(snimka));
  const vidiArhivu = prijavljeni?.role === "ADMIN" || prijavljeni?.role === "PODRUM";
  const opisIzlaza =
    snimka.cin === "PUNJENJE"
      ? `Napunjeno u boce${izlaz?.brojBoca ? ` — ${izlaz.brojBoca} boca × ${fBroj(izlaz.volumenBoce ?? 0, 2)} L` : ""}`
      : "Prodano (rinfuza)";

  return (
    <main style={stranicaStil}>
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/tankovi/${snimka.tankId}`} style={poveznicaStil}>
          ← Tank {brIz ?? "?"}
        </Link>
        <div style={nadnaslovStil}>
          Vino iz tanka {brIz ?? "?"}, kakvo je bilo {fDatumSat(snimka.dogodenoAt)}
        </div>
        <h1 style={naslovStil}>{ime.tekst}</h1>
        <div style={podnaslovStil}>
          {opisIzlaza} · izašlo {fBroj(snimka.litreOtislo)} L od {fBroj(snimka.litrePrije)} L
          {snimka.ispraznjen ? " · posuda ispražnjena, vino je otišlo iz podruma" : " · dio vina ostao je u posudi"}
          {snimka.godiste ? ` · godište ${snimka.godiste}.` : ""}
        </div>
        {snimka.arhivaVinaId && vidiArhivu ? (
          <Link href={`/arhiva/${snimka.arhivaVinaId}`} style={poveznicaStil}>
            arhivski zapis posude
          </Link>
        ) : null}
        <div style={napomenaStil}>
          Samo za gledanje. Ime, parametri i kvasci su{" "}
          <strong>iz snimke u trenutku izlaska</strong>: onako kako ih je monitor
          tada pokazivao. Berba, graf i kronologija su iz knjige kretanja i
          zapisa posuda — ispravak podataka mijenja njih, snimku ne.
        </div>
      </div>

      <Card title="Berba" broj={podrijetlo.stavke.length}>
        <div style={izvorStil}>iz knjige — sastav vina neposredno prije izlaza</div>
        {podrijetlo.stavke.length === 0 ? (
          <div style={praznoStil}>Knjiga za ovo vino ne zna nijednu berbu.</div>
        ) : (
          <div style={{ display: "grid", gap: 6, padding: 10 }}>
            {podrijetlo.stavke.map((s) => (
              <div key={s.berbaId} style={redakStil}>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <strong>
                    {s.nazivSorte}
                    {s.oznakaBerbe ? ` · partija ${s.oznakaBerbe}` : ""}
                    {s.godinaBerbe ? ` · ${s.godinaBerbe}.` : ""}
                  </strong>
                  <span style={tihoStil}>
                    {[
                      s.vinograd ? `vinograd ${s.vinograd}` : null,
                      s.polozaj ? `položaj ${s.polozaj}` : null,
                      s.parcela ? `parcela ${s.parcela}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "vinograd nije upisan"}
                    {s.vrstaUnosa === "ZATECENO" ? " · zatečeno" : ""}
                  </span>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <strong>{fBroj(s.postotak, 1)} %</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Kvasci" broj={kvasci.length}>
        <div style={izvorStil}>iz snimke u trenutku izlaska — udio u ovom vinu</div>
        {kvasci.length === 0 ? (
          <div style={praznoStil}>bez zapisa</div>
        ) : (
          <div style={{ display: "grid", gap: 6, padding: 10 }}>
            {kvasci.map((k) => (
              <div key={k.id} style={redakStil}>
                <div style={{ display: "grid", gap: 2 }}>
                  <strong>{k.preparatNaziv ?? k.opis ?? "kvasac"}</strong>
                  <span style={tihoStil}>
                    dodan u tank {k.izvorniBrojTanka ?? "?"} · {fDatum(k.dogodenoAt)}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>{fBroj(k.udio * 100, 1)} %</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Parametri">
        <div style={izvorStil}>
          vrijednosti iz snimke u trenutku izlaska (s pravilom fermentacije i
          procjenom iz blenda, kao monitor) · graf kroz vrijeme iz knjige
        </div>
        <div style={{ padding: 10 }}>
          <ParametriPoPolju parametri={prikazParametara} />
        </div>
      </Card>

      <Card title="Kronologija" broj={dogadaji.length}>
        <div style={izvorStil}>
          iz zapisa posuda kroz koje je ovo vino prošlo:{" "}
          {prozori
            .map(
              (p) =>
                `tank ${brojTanka.get(p.tankId) ?? "?"} (${p.od ? fDatum(p.od) : "od početka"} – ${fDatum(p.do)})`
            )
            .join(", ")}
        </div>
        {nepotpuni.length > 0 ? (
          // Praznina prije 11.09. nije "nista se nije radilo" — vidi
          // `PREZIVLJAVA_OD` (lib/kronologija-vina.ts).
          <div style={upozorenjeStil}>
            Zadaci i radnje prije {fDatum(PREZIVLJAVA_OD)} sačuvani su samo
            djelomično: arhiviranje ih je tada brisalo s posude, a kopiralo
            nepotpuno. Praznina u tom razdoblju ne znači da zadataka nije bilo.
            Odnosi se na:{" "}
            {nepotpuni
              .map(
                (p) =>
                  `tank ${brojTanka.get(p.tankId) ?? "?"} (${p.od ? fDatum(p.od) : "od početka"} – ${fDatum(
                    p.do < PREZIVLJAVA_OD ? p.do : PREZIVLJAVA_OD
                  )})`
              )
              .join(", ")}
            . Zapisi iz arhive označeni su „iz arhive”.
          </div>
        ) : null}
        <div style={{ padding: 10 }}>
          {dogadaji.length === 0 ? (
            <div style={tihoStil}>bez zapisa</div>
          ) : (
            <Kronologija dogadaji={dogadaji} />
          )}
        </div>
      </Card>

      {spoj ? (
        <Card title="Odakle je to vino" broj={sastavnice.length}>
          <div style={izvorStil}>
            iz knjige — spoj u tanku {brojTanka.get(spoj.tankId) ?? "?"},{" "}
            {fDatum(spoj.kada)}. Kronologija ide do tog spoja; povijest svake
            sastavnice otvara se njezinom poveznicom.
          </div>
          <div style={{ display: "grid", gap: 6, padding: 10 }}>
            {sastavnice.map((st, i) => {
              const s = st.sastavnica;
              // BEZ KORIJENA, po kljucu cina (lib/prosli-tank.ts, `nadjiKucicu`):
              // vino koje je izaslo nema danasnje stablo ni u jednoj posudi.
              const href =
                s.vino.vrsta === "partija"
                  ? `/berba/${s.vino.berbaId}`
                  : `/prosli-tank?iz=${encodeURIComponent(s.vino.tankId)}` +
                    `&cin=${encodeURIComponent(s.kljucCina)}`;
              return (
                <div key={i} style={redakStil}>
                  <div style={{ display: "grid", gap: 2 }}>
                    <strong>
                      {nazivStavke(s, oznakaPartije) ??
                        (s.vino.vrsta === "partija"
                          ? `berba · ${s.vino.nazivSorte}`
                          : `Tank ${brojTanka.get(s.vino.tankId) ?? "?"}`)}
                    </strong>
                    <span style={tihoStil}>
                      {fBroj(st.litre)} L · {fBroj(st.udio * 100, 0)} % · ušlo {fDatum(s.usloAt)}
                      {s.progutano ? " · dolijevanje" : ""}
                      {st.sazeta && st.kalo > 0.5
                        ? ` · kalo ukupno ${fBroj(st.kalo)} L (${fBroj((st.kalo / st.otpusteno) * 100, 1)} %)`
                        : ""}
                    </span>
                  </div>
                  <Link href={href} style={poveznicaStil}>
                    {s.vino.vrsta === "partija" ? "berba" : "prošlost vina"}
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </main>
  );
}

const stranicaStil: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: 16,
  display: "grid",
  gap: 14,
};
const nadnaslovStil: React.CSSProperties = { fontSize: 13, color: "#6b7280" };
const naslovStil: React.CSSProperties = { margin: 0, fontSize: 26, fontWeight: 600 };
const podnaslovStil: React.CSSProperties = { fontSize: 14, color: "#374151" };
const napomenaStil: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  borderLeft: "3px solid #d1d5db",
  paddingLeft: 8,
  marginTop: 4,
};
const tihoStil: React.CSSProperties = { fontSize: 13, color: "#6b7280", padding: "2px 0" };
const praznoStil: React.CSSProperties = { ...tihoStil, padding: 10 };
const izvorStil: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  padding: "8px 10px 0",
  fontStyle: "italic",
};
const poveznicaStil: React.CSSProperties = { color: "#1f6f8b", fontSize: 14 };
const redakStil: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  borderBottom: "1px solid #f0f0f0",
  paddingBottom: 6,
  minWidth: 0,
};
const upozorenjeStil: React.CSSProperties = {
  margin: "10px 10px 0",
  padding: 8,
  fontSize: 13,
  color: "#9a3412",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: 6,
};
