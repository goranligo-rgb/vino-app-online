import type { Prisma } from "@prisma/client";
import type { Dogadaj } from "@/app/tankovi/[id]/kronologija";
import { granicaVina } from "@/lib/granica-vina";
import type { VinoCvor } from "@/lib/identitet-vina";
import { opisGubitka } from "@/lib/pretok-gubitak";
import { punjenjaTrenutnogVina } from "@/lib/punjenje-vina";

/**
 * KRONOLOGIJA VINA KOJE JE IZASLO — razina 1 arhive (/prosli-tank?snimka=).
 * ======================================================================
 *
 * "Sve sto se s ovim vinom radilo", za vino koje je napunjeno u boce ili
 * prodano. Isti slijed kao kronologija stranice tanka i isti prikaz
 * (app/tankovi/[id]/kronologija.tsx), ali slozen za PROZORE VINA, ne za
 * posudu: stranica tanka svoju kronologiju slaze u samoj stranici i nad
 * danasnjim vinom, pa se ne da ponovno upotrijebiti — i ne dira se.
 *
 * PROZOR (odobreno 29.09.2026.): vino kakvo je bilo neposredno prije izlaza,
 * po istom pravilu kao stranica tanka —
 *   - posuda iz koje je izaslo, od granice tog vina do trenutka izlaza;
 *   - jednolinijski lanac unatrag: prethodne posude, svaka od svoje granice
 *     (racunate NA TRENUTAK kad je vino otamo otislo) do tog trenutka. Lanac
 *     staje na prvom spoju vise izvora, isto kao na stranici tanka; "od cega
 *     je slozeno" je ondje kartica "Odakle je vino".
 *
 * IZVORI, sve unutar prozora:
 *   - punjenja (po knjizi, `punjenjaTrenutnogVina`, ne po datumu iz obrasca);
 *   - izvrseni zadaci: zivi `Zadatak` i `ArhivaVinaZadatak`, bez dvojnika po
 *     `izvorniZadatakId`;
 *   - samostalne radnje: `Radnja` i `ArhivaVinaRadnja`, bez dvojnika po
 *     `izvornaRadnjaId`. ARHIVSKE SE CITAJU OBAVEZNO (AGENTS.md): arhiviranje
 *     je selilo podatke, pa su za starija vina jedini zapis. Arhivska radnja
 *     nema `jeKvasac` ni `dogodenoAt` — cita se po `createdAt` i ide medju
 *     radnje, nikad u kvasce;
 *   - pretoci u posudu i iz nje, dolasci prijenosom, izlazi (i ovaj zavrsni).
 *
 * STO NEDOSTAJE naspram stranice tanka: naslijedene radnje iz `VinoRadnja`
 * (pri praznjenju se brisu; zamjenjuje ih `Radnja` po prozorima lanca, s
 * posudom u kojoj su izvedene), otvoreni zadaci, alarmi i temperatura (to
 * pripada posudi, ne vinu).
 *
 * STO JE OVDJE POTPUNIJE: vino koje se vratilo u isti tank (T7 <- T4 <- T7)
 * NE gubi prvi boravak. Stranica tanka ga gubi jer radnje lanca cita kroz
 * `VinoRadnja` i preskace retke ciji je izvorni tank sama ta posuda, a
 * vlastite `Radnja` reze granicom danasnjeg vina — pa prvi boravak ne stoji
 * ni ondje ni ondje. Ovdje je prvi boravak ZASEBAN PROZOR iste posude
 * (`prozoriVina`), a `Radnja` se cita po prozorima, ne kroz `VinoRadnja`.
 *
 * MJERENJA NISU OVDJE, isto kao na stranici tanka: parametri i graf imaju
 * svoju karticu.
 *
 * UPITI idu redom, bez `Promise.all` (lib/paralelno.ts): lanac 2 po karici,
 * dogadaji 11.
 */

type Db = Prisma.TransactionClient;

/**
 * Od 11.09.2026. `Radnja` i `Zadatak` prezivljavaju praznjenje posude. Prije
 * toga ih je arhiviranje brisalo, a kopiralo nepotpuno: zadatke djelomicno,
 * radnje zajedno s tudjim vinom. Prozor koji pocinje prije ovog dana zato
 * dobiva napomenu — praznina u njemu ne znaci da nista nije radjeno.
 */
export const PREZIVLJAVA_OD = new Date("2026-09-11T00:00:00+02:00");

/** Posuda i razdoblje u kojem je ovo vino u njoj stajalo. */
export type ProzorVina = {
  tankId: string;
  /** `null` samo za posudu izlaza kad knjiga za nju ne zna nista: bez reza, kao stranica tanka. */
  od: Date | null;
  do: Date;
};

/**
 * PROZORI VINA — posuda izlaza pa jednolinijski lanac unatrag.
 *
 * `vino` je cvor stabla za posudu izlaza na trenutak neposredno prije izlaza
 * (`vinoUTanku`). Vraca i cvor na kojem je lanac stao: njegove sastavnice su
 * "od cega je vino slozeno".
 *
 * Karika bez granice (knjiga za tu posudu ne zna nista) se preskace —
 * pogadjati se ne smije.
 *
 * LANAC IDE ISTIM PRAVILOM KAO SAZIMANJE SASTAVA (09.10.2026.). Karika je
 * posuda iz koje je vino stiglo kao JEDINA neprogutana sastavnica — isto
 * pravilo kao `jePrijenos` u lib/sastav-vina.ts, uz zateceno vino (posudu bez
 * razmotavanja) kao kraj lanca. Do tada je lanac trazio da cvor ima tocno
 * jednu sastavnicu, pa je vino koje je stiglo prijenosom i poslije dobilo
 * dolijevanje (T7: prijenos iz T4, dolijevanje iz T5) stalo na prvoj posudi.
 * Sastav takvu posudu vise ne prikazuje kao kucicu (put nije sastav nego
 * kretanje), pa bi njezina povijest nestala s ekrana: mjereno, 9 prozora u
 * 5 tankova (T7, T17, T21, T22, T38). Sada je ta posuda karika i njezina
 * povijest stoji u kronologiji, grafu i popisu mjerenja.
 *
 * `zadnjiCvor` ostaje po STAROM pravilu — prvi cvor s vise od jedne
 * sastavnice — jer je on "od cega je vino slozeno" na snimci izlaza, a
 * dolijevanje u posudu na putu dio je toga.
 */
export async function prozoriVina(
  db: Pick<Db, "berbaKretanje" | "punjenjeTanka">,
  u: { tankId: string; trenutak: Date; doAt: Date; vino: VinoCvor }
): Promise<{ prozori: ProzorVina[]; zadnjiCvor: VinoCvor }> {
  const g = await granicaVina(db, u.tankId, {
    doTrenutka: u.trenutak,
    zadnjeVino: true,
  });
  const prozori: ProzorVina[] = [{ tankId: u.tankId, od: g.odAt, do: u.doAt }];

  let cvor: VinoCvor = u.vino;
  while (cvor.vrsta === "spoj") {
    const neprogutane = cvor.sastavnice.filter((x) => !x.progutano);
    if (neprogutane.length !== 1) break;
    const s = neprogutane[0];
    // Berba je kraj; vino koje je u posudi vec bilo nije prijenos nego kupaza.
    if (s.vino.vrsta === "partija" || s.vino.tankId === cvor.tankId) break;
    const gk = await granicaVina(db, s.vino.tankId, {
      doTrenutka: s.usloAt,
      zadnjeVino: true,
    });
    if (gk.odAt) prozori.push({ tankId: s.vino.tankId, od: gk.odAt, do: s.usloAt });
    cvor = s.vino;
  }

  let zadnjiCvor: VinoCvor = u.vino;
  while (
    zadnjiCvor.vrsta === "spoj" &&
    zadnjiCvor.sastavnice.length === 1 &&
    zadnjiCvor.sastavnice[0].vino.vrsta !== "partija"
  ) {
    zadnjiCvor = zadnjiCvor.sastavnice[0].vino;
  }

  return { prozori, zadnjiCvor };
}

/** Je li trenutak `t` u prozoru posude `tankId`. Rubovi su ukljucivi. */
export function uProzoru(prozori: ProzorVina[], tankId: string | null, t: Date): boolean {
  if (!tankId) return false;
  const x = t.getTime();
  return prozori.some(
    (p) =>
      p.tankId === tankId &&
      (p.od === null || x >= p.od.getTime()) &&
      x <= p.do.getTime()
  );
}

/** Prozori koji pocinju prije 11.09.2026. — vidi `PREZIVLJAVA_OD`. */
export function prozoriPrijePrezivljavanja(prozori: ProzorVina[]): ProzorVina[] {
  return prozori.filter((p) => p.od === null || p.od < PREZIVLJAVA_OD);
}

function fBroj(value: number | null | undefined, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function fDatum(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toLocaleString("hr-HR");
}

function fDatumBezVremena(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toLocaleDateString("hr-HR");
}

/** Redak kala/taloga s postotkom i oznakom visokog — isti oblik kao na stranici tanka. */
function redakGubitka(g: NonNullable<ReturnType<typeof opisGubitka>>, sOznakomVisokog: boolean) {
  return {
    label: g.naziv.charAt(0).toUpperCase() + g.naziv.slice(1),
    value:
      `${fBroj(g.litre)} L` +
      (g.postotak != null ? ` (${fBroj(g.postotak, 1)} %)` : "") +
      ` — ${g.objasnjenje}` +
      (sOznakomVisokog && g.visok ? " · iznad uobičajenog" : ""),
  };
}

function ime(k: { ime?: string | null; email?: string | null } | null | undefined) {
  return k?.ime ?? k?.email ?? "—";
}

const IZ_ARHIVE = {
  label: "Izvor zapisa",
  value: "arhiva — kopija napravljena kad je posuda arhivirana",
};

/**
 * DOGADAJI unutar prozora, sortirani od najnovijeg. 11 upita, redom.
 *
 * `brojTanka` treba za oznaku posude: dogadaj iz posude koja nije posuda
 * izlaza nosi je NAPRIJED ("U tanku 4 · ..."), inace izgleda kao da se
 * dogodio u posudi izlaza (isti razlog kao na stranici tanka).
 */
export async function dogadajiVina(
  db: Db,
  u: {
    prozori: ProzorVina[];
    tankIzlazaId: string;
    brojTanka: Map<string, number>;
    /**
     * Snimka koja se upravo gleda (/prosli-tank?snimka=), ili `null`.
     * OBAVEZNA, ne opcijska: izlaz te snimke ne smije voditi sam na sebe, a
     * pozivatelj mora reci gleda li snimku ili posudu.
     */
    trenutnaSnimkaId: string | null;
  }
): Promise<Dogadaj[]> {
  const { prozori } = u;
  const posude = [...new Set(prozori.map((p) => p.tankId))];
  const najranije = prozori.some((p) => p.od === null)
    ? undefined
    : new Date(Math.min(...prozori.map((p) => p.od!.getTime())));
  const najkasnije = new Date(Math.max(...prozori.map((p) => p.do.getTime())));
  const raspon = { ...(najranije ? { gte: najranije } : {}), lte: najkasnije };

  const u_ = (tankId: string | null, t: Date) => uProzoru(prozori, tankId, t);
  const gdje = (tankId: string | null) =>
    tankId === u.tankIzlazaId
      ? ""
      : `U tanku ${tankId ? u.brojTanka.get(tankId) ?? "?" : "?"} · `;

  const dogadaji: Dogadaj[] = [];

  // --- PUNJENJA -----------------------------------------------------------
  // Po knjizi, kao stranica tanka: punjenje pripada prozoru ako je vino u
  // posudu uslo izmedju njegova pocetka i kraja. Racun `punjenjaTrenutnogVina`
  // zna samo donji rub, pa se gornji dobije oduzimanjem: sto prolazi od `od`,
  // a ne prolazi od trenutka iza `do`.
  const punjenja = await db.punjenjeTanka.findMany({
    where: { tankId: { in: posude }, stavke: { some: { obrisano: false } } },
    orderBy: { datumPunjenja: "desc" },
    include: { stavke: { where: { obrisano: false }, orderBy: { createdAt: "asc" } } },
  });
  const kretanja = punjenja.length
    ? await db.berbaKretanje.findMany({
        where: { OR: [{ uTankId: { in: posude } }, { izTankId: { in: posude } }] },
        select: {
          id: true,
          uTankId: true,
          izTankId: true,
          berbaId: true,
          litre: true,
          vrsta: true,
          dogodenoAt: true,
          createdAt: true,
          punjenjeId: true,
        },
      })
    : [];
  const punjenjaUProzoru = new Set<string>();
  for (const p of prozori) {
    const svoja = punjenja.filter((x) => x.tankId === p.tankId);
    const svojaKretanja = kretanja.filter(
      (k) => k.uTankId === p.tankId || k.izTankId === p.tankId
    );
    const odOd = punjenjaTrenutnogVina(p.tankId, svoja, svojaKretanja, p.od).ids;
    const izaDo = new Set(
      punjenjaTrenutnogVina(p.tankId, svoja, svojaKretanja, new Date(p.do.getTime() + 1)).ids
    );
    for (const id of odOd) if (!izaDo.has(id)) punjenjaUProzoru.add(id);
  }
  for (const p of punjenja) {
    if (!punjenjaUProzoru.has(p.id)) continue;
    const kg = p.stavke.reduce((z, s) => z + Number(s.kolicinaKgGrozdja ?? 0), 0);
    dogadaji.push({
      id: `pun-${p.id}`,
      vrsta: "PUNJENJE",
      vrijeme: p.datumPunjenja.toISOString(),
      naslov: `${gdje(p.tankId)}${p.nazivVina || "Punjenje tanka"}`,
      podnaslov: p.stavke.map((s) => s.nazivSorte).join(", ") || null,
      iznos: `${fBroj(p.ukupnoLitara, 0)} L`,
      // Podaci berbe po stavci, isti kao na stranici tanka: modul je od
      // 09.10.2026. jedini izvor kronologije i ondje.
      detalji: [
        { label: "Ukupno litara", value: `${fBroj(p.ukupnoLitara)} L` },
        { label: "Ukupno kg grožđa", value: kg > 0 ? `${fBroj(kg)} kg` : "—" },
        { label: "Napomena", value: p.napomena || "—" },
        ...p.stavke.flatMap((s) => [
          {
            label: `— ${s.nazivSorte}`,
            value: `${fBroj(s.kolicinaLitara)} L${s.oznakaBerbe ? ` · partija ${s.oznakaBerbe}` : ""}`,
          },
          {
            label: "   Kg grožđa",
            value: s.kolicinaKgGrozdja != null ? `${fBroj(s.kolicinaKgGrozdja)} kg` : "—",
          },
          { label: "   Vinograd", value: s.vinograd || "—" },
          { label: "   Parcela", value: s.parcela || "—" },
          { label: "   Položaj", value: s.polozaj || "—" },
          { label: "   Oznaka berbe", value: s.oznakaBerbe || "—" },
          { label: "   Datum berbe", value: s.datumBerbe ? fDatumBezVremena(s.datumBerbe) : "—" },
          { label: "   Šećer", value: s.secer != null ? fBroj(s.secer) : "—" },
          { label: "   Kiseline", value: s.kiseline != null ? fBroj(s.kiseline) : "—" },
          { label: "   pH", value: s.ph != null ? fBroj(s.ph) : "—" },
          { label: "   Napomena berbe", value: s.napomenaBerbe || "—" },
        ]),
      ],
    });
  }

  // --- ZADACI: zivi, pa arhivski bez dvojnika ------------------------------
  const zadaci = (
    await db.zadatak.findMany({
      where: {
        tankId: { in: posude },
        status: { in: ["IZVRSEN", "OTKAZAN"] },
        izvrsenoAt: raspon,
      },
      include: {
        preparat: { select: { naziv: true } },
        jedinica: { select: { naziv: true } },
        izlaznaJedinica: { select: { naziv: true } },
        zadaoKorisnik: { select: { ime: true, email: true } },
        izvrsioKorisnik: { select: { ime: true, email: true } },
        tankStavke: {
          include: { ciljTank: { select: { broj: true } } },
          orderBy: { redoslijed: "asc" },
        },
        stavke: {
          include: {
            preparat: { select: { naziv: true } },
            jedinica: { select: { naziv: true } },
            izlaznaJedinica: { select: { naziv: true } },
          },
          orderBy: { redoslijed: "asc" },
        },
      },
    })
  ).filter((z) => u_(z.tankId, z.izvrsenoAt ?? z.zadanoAt));
  const prikazaniZadaci = new Set(zadaci.map((z) => z.id));

  for (const z of zadaci) {
    const preparati =
      z.stavke.length > 0
        ? z.stavke
            .map((s) =>
              `${s.preparat?.naziv ?? "?"} ${fBroj(s.izracunataKolicina)} ${
                s.izlaznaJedinica?.naziv ?? s.jedinica?.naziv ?? ""
              }`.trim()
            )
            .join(" · ")
        : z.preparat?.naziv ?? null;
    const ciljevi =
      z.tankStavke.length > 0
        ? z.tankStavke.map((s) => `tank ${s.ciljTank.broj}: ${fBroj(s.kolicina)} L`).join(" · ")
        : null;

    dogadaji.push({
      id: `zad-${z.id}`,
      vrsta: z.tankStavke.length > 0 ? "PRIJENOS_IZLAZ" : "ZADATAK",
      vrijeme: (z.izvrsenoAt ?? z.zadanoAt).toISOString(),
      naslov: `${gdje(z.tankId)}${z.naslov?.trim() || String(z.vrsta)}${
        z.status === "OTKAZAN" ? " (otkazan)" : ""
      }`,
      podnaslov: [preparati, ciljevi].filter(Boolean).join(" → ") || null,
      tko: z.izvrsenoAt ? `Izvršio: ${ime(z.izvrsioKorisnik)}` : `Zadao: ${ime(z.zadaoKorisnik)}`,
      iznos: z.kolicinaIzlaz != null ? `−${fBroj(z.kolicinaIzlaz, 0)} L` : null,
      detalji: [
        { label: "Vrsta", value: String(z.vrsta) },
        { label: "Status", value: String(z.status) },
        { label: "Zadao", value: `${ime(z.zadaoKorisnik)} · ${fDatum(z.zadanoAt)}` },
        {
          label: "Izvršio",
          value: z.izvrsenoAt ? `${ime(z.izvrsioKorisnik)} · ${fDatum(z.izvrsenoAt)}` : "—",
        },
        ...(z.kolicinaIzlaz != null
          ? [{ label: "Izašlo", value: `${fBroj(z.kolicinaIzlaz)} L` }]
          : []),
        ...(z.gubitakLitara != null
          ? [{ label: "Gubitak", value: `${fBroj(z.gubitakLitara)} L` }]
          : []),
        ...(z.maceracija != null
          ? [
              {
                label: "Maceracija",
                value: z.maceracija
                  ? `da${z.maceracijaOpis ? ` — ${z.maceracijaOpis}` : ""}`
                  : "ne",
              },
            ]
          : []),
        ...z.tankStavke.map((s) => ({
          label: `→ tank ${s.ciljTank.broj}`,
          value: `${fBroj(s.kolicina)} L`,
        })),
        ...z.stavke.map((s) => ({
          label: s.preparat?.naziv ?? "preparat",
          value: `${fBroj(s.izracunataKolicina)} ${
            s.izlaznaJedinica?.naziv ?? s.jedinica?.naziv ?? ""
          }`.trim(),
        })),
        { label: "Napomena", value: z.napomena || "—" },
      ],
    });
  }

  const arhivskiZadaci = (
    await db.arhivaVinaZadatak.findMany({
      where: {
        tankId: { in: posude },
        status: { in: ["IZVRSEN", "OTKAZAN"] },
        OR: [{ izvrsenoAt: raspon }, { izvrsenoAt: null, zadanoAt: raspon }],
      },
      include: { stavke: { orderBy: { redoslijed: "asc" } } },
    })
  ).filter((z) => u_(z.tankId, z.izvrsenoAt ?? z.zadanoAt));

  // Ista kopija zna postojati u vise arhiva (svako arhiviranje kopiralo je
  // sve retke posude), a original zna jos zivjeti — jedan zadatak, jedan redak.
  const vidjeniArhivski = new Set<string>();
  for (const z of arhivskiZadaci) {
    const kljuc = z.izvorniZadatakId ?? z.id;
    if (prikazaniZadaci.has(kljuc) || vidjeniArhivski.has(kljuc)) continue;
    vidjeniArhivski.add(kljuc);

    const preparati =
      z.stavke.length > 0
        ? z.stavke
            .map((s) =>
              `${s.preparatNaziv ?? "?"} ${fBroj(s.izracunataKolicina)} ${
                s.izlaznaJedinicaNaziv ?? s.jedinicaNaziv ?? ""
              }`.trim()
            )
            .join(" · ")
        : z.preparatNaziv ?? null;

    dogadaji.push({
      id: `azad-${z.id}`,
      vrsta: "ZADATAK",
      vrijeme: (z.izvrsenoAt ?? z.zadanoAt).toISOString(),
      naslov: `${gdje(z.tankId)}${z.naslov?.trim() || String(z.vrsta)}${
        z.status === "OTKAZAN" ? " (otkazan)" : ""
      }`,
      podnaslov: [preparati, "iz arhive"].filter(Boolean).join(" · "),
      tko: z.izvrsenoAt
        ? `Izvršio: ${z.izvrsioKorisnikIme ?? "—"}`
        : `Zadao: ${z.zadaoKorisnikIme ?? "—"}`,
      detalji: [
        { label: "Vrsta", value: String(z.vrsta) },
        { label: "Status", value: String(z.status) },
        { label: "Zadao", value: `${z.zadaoKorisnikIme ?? "—"} · ${fDatum(z.zadanoAt)}` },
        {
          label: "Izvršio",
          value: z.izvrsenoAt ? `${z.izvrsioKorisnikIme ?? "—"} · ${fDatum(z.izvrsenoAt)}` : "—",
        },
        ...z.stavke.map((s) => ({
          label: s.preparatNaziv ?? "preparat",
          value: `${fBroj(s.izracunataKolicina)} ${
            s.izlaznaJedinicaNaziv ?? s.jedinicaNaziv ?? ""
          }`.trim(),
        })),
        { label: "Napomena", value: z.napomena || "—" },
        IZ_ARHIVE,
      ],
    });
    prikazaniZadaci.add(kljuc);
  }

  // --- RADNJE: samostalne, zive pa arhivske bez dvojnika -------------------
  // Radnja zadatka je vec prikazana kao zadatak. Arhiviranje prije 11.09. je
  // zadatke brisalo, a Prisma je tada `Radnja.zadatakId` postavila na NULL —
  // takva radnja izgleda samostalno, ali njezina arhivska kopija pamti zadatak
  // (`izvorniZadatakId`). Zato se veza cita i odande.
  const radnje = (
    await db.radnja.findMany({
      where: { tankId: { in: posude }, createdAt: raspon },
      include: {
        korisnik: { select: { ime: true, email: true } },
        preparat: { select: { naziv: true } },
        jedinica: { select: { naziv: true } },
      },
    })
  ).filter((r) => u_(r.tankId, r.createdAt));

  const arhivskeRadnje = (
    await db.arhivaVinaRadnja.findMany({
      where: { tankId: { in: posude }, createdAt: raspon },
    })
  ).filter((r) => u_(r.tankId, r.createdAt));

  const zadatakPoArhivi = new Map<string, string>();
  for (const a of arhivskeRadnje) {
    if (a.izvornaRadnjaId && a.izvorniZadatakId) {
      zadatakPoArhivi.set(a.izvornaRadnjaId, a.izvorniZadatakId);
    }
  }

  const prikazaneRadnje = new Set<string>();
  for (const r of radnje) {
    prikazaneRadnje.add(r.id);
    const zadatakId = r.zadatakId ?? zadatakPoArhivi.get(r.id) ?? null;
    if (zadatakId !== null) continue;

    dogadaji.push({
      id: `rad-${r.id}`,
      vrsta: "RADNJA",
      vrijeme: r.createdAt.toISOString(),
      naslov: `${gdje(r.tankId)}${r.opis || String(r.vrsta)}`,
      podnaslov: r.preparat?.naziv
        ? `${r.preparat.naziv}${
            r.kolicina != null ? ` — ${fBroj(r.kolicina)} ${r.jedinica?.naziv ?? ""}`.trimEnd() : ""
          }`
        : String(r.vrsta),
      tko: `Upisao: ${ime(r.korisnik)}`,
      iznos: r.kolicina != null && !r.preparatId ? `${fBroj(r.kolicina, 0)} L` : null,
      detalji: [
        { label: "Vrsta", value: String(r.vrsta) },
        { label: "Preparat", value: r.preparat?.naziv || "—" },
        {
          label: "Količina",
          value: r.kolicina != null ? `${fBroj(r.kolicina)} ${r.jedinica?.naziv ?? ""}`.trim() : "—",
        },
        { label: "Napomena", value: r.napomena || "—" },
      ],
    });
  }

  for (const a of arhivskeRadnje) {
    const kljuc = a.izvornaRadnjaId ?? a.id;
    if (prikazaneRadnje.has(kljuc)) continue;
    prikazaneRadnje.add(kljuc);
    if (a.izvorniZadatakId && prikazaniZadaci.has(a.izvorniZadatakId)) continue;

    dogadaji.push({
      id: `arad-${a.id}`,
      vrsta: "RADNJA",
      vrijeme: a.createdAt.toISOString(),
      naslov: `${gdje(a.tankId)}${a.opis || String(a.vrsta)}`,
      podnaslov: [
        a.preparatNaziv
          ? `${a.preparatNaziv}${
              a.kolicina != null ? ` — ${fBroj(a.kolicina)} ${a.jedinicaNaziv ?? ""}`.trimEnd() : ""
            }`
          : String(a.vrsta),
        "iz arhive",
      ].join(" · "),
      tko: a.korisnikIme ? `Upisao: ${a.korisnikIme}` : null,
      iznos: a.kolicina != null && !a.preparatId ? `${fBroj(a.kolicina, 0)} L` : null,
      detalji: [
        { label: "Vrsta", value: String(a.vrsta) },
        { label: "Preparat", value: a.preparatNaziv || "—" },
        {
          label: "Količina",
          value: a.kolicina != null ? `${fBroj(a.kolicina)} ${a.jedinicaNaziv ?? ""}`.trim() : "—",
        },
        { label: "Napomena", value: a.napomena || "—" },
        IZ_ARHIVE,
      ],
    });
  }

  // --- PRETOCI ------------------------------------------------------------
  // Pretok izmedju dvije karike lanca stoji JEDNOM: to je selidba ovog vina,
  // a ne dva dogadaja. Ulazna strana ima prednost, jer kaze kamo je vino doslo.
  const pretociUlaz = (
    await db.pretok.findMany({
      where: { ciljevi: { some: { tankId: { in: posude } } }, datum: raspon },
      include: {
        izvori: { include: { tank: { select: { broj: true } } } },
        ciljevi: { include: { tank: { select: { broj: true } } } },
      },
    })
  ).filter((p) => p.ciljevi.some((c) => u_(c.tankId, p.datum)));
  const prikazaniPretoci = new Set<string>();

  for (const p of pretociUlaz) {
    prikazaniPretoci.add(p.id);
    const cilj = p.ciljevi.find((c) => u_(c.tankId, p.datum))!;
    const uCilj = p.ciljevi
      .filter((c) => c.tankId === cilj.tankId)
      .reduce((z, c) => z + Number(c.kolicina ?? 0), 0);
    const g = opisGubitka(p);
    const izasloIzIzvora = p.izvori.reduce((z, i) => z + Number(i.kolicina ?? 0), 0);
    const drugiCiljevi = p.ciljevi.filter((c) => c.tankId !== cilj.tankId);

    dogadaji.push({
      id: `pu-${p.id}`,
      vrsta: "PRETOK_ULAZ",
      vrijeme: p.datum.toISOString(),
      naslov: `Pretok u tank ${cilj.tank.broj} (${p.tip})`,
      podnaslov:
        p.izvori.map((i) => `iz tanka ${i.tank.broj}: ${fBroj(i.kolicina)} L`).join(" · ") || null,
      iznos: `+${fBroj(uCilj, 0)} L`,
      detalji: [
        { label: "Tip pretoka", value: String(p.tip) },
        ...p.izvori.map((i) => ({
          label: `Izašlo iz tanka ${i.tank.broj}`,
          value: `${fBroj(i.kolicina)} L`,
        })),
        ...p.ciljevi.map((c) => ({
          label: `Ušlo u tank ${c.tank.broj}`,
          value: `${fBroj(c.kolicina)} L`,
        })),
        // Razlika se IMENUJE, kao na stranici tanka: bez ovoga "izaslo 1.600,
        // uslo 1.000" izgleda kao da je 600 L nestalo.
        ...(drugiCiljevi.length > 0
          ? [
              {
                label: "Istim pretokom u druge tankove",
                value: drugiCiljevi
                  .map((c) => `T${c.tank.broj} ${fBroj(c.kolicina)} L`)
                  .join(" · "),
              },
            ]
          : []),
        ...(g ? [redakGubitka(g, false)] : []),
        ...(izasloIzIzvora !== uCilj
          ? [
              {
                label: "Zašto brojke nisu iste",
                value:
                  `iz izvora je izašlo ${fBroj(izasloIzIzvora)} L, ` +
                  `u tank ${cilj.tank.broj} ušlo ${fBroj(uCilj)} L — ostatak je otišao drugdje`,
              },
            ]
          : []),
        { label: "Napomena", value: p.napomena || "—" },
      ],
    });
  }

  const pretociIzlaz = (
    await db.pretokIzvor.findMany({
      where: { tankId: { in: posude }, pretok: { datum: raspon } },
      include: {
        pretok: { include: { ciljevi: { include: { tank: { select: { broj: true } } } } } },
      },
    })
  ).filter((i) => u_(i.tankId, i.pretok.datum));

  for (const i of pretociIzlaz) {
    if (prikazaniPretoci.has(i.pretokId)) continue;
    prikazaniPretoci.add(i.pretokId);
    const g = opisGubitka(i.pretok);
    const ciljevi = i.pretok.ciljevi.map((c) => c.tank.broj).join(", ");

    dogadaji.push({
      id: `pi-${i.id}`,
      vrsta: "PRETOK_IZLAZ",
      vrijeme: i.pretok.datum.toISOString(),
      naslov: `${gdje(i.tankId)}Pretok u ${
        i.pretok.ciljevi.length === 1 ? "tank" : "tankove"
      } ${ciljevi || "—"}`,
      podnaslov: `Tip: ${i.pretok.tip}${g ? ` · ${g.naziv} ${fBroj(g.litre)} L` : ""}`,
      iznos: `−${fBroj(i.kolicina, 0)} L`,
      detalji: [
        ...i.pretok.ciljevi.map((c) => ({
          label: "U tank",
          value: `${c.tank.broj} — ${fBroj(c.kolicina)} L`,
        })),
        { label: "Količina", value: `${fBroj(i.kolicina)} L` },
        { label: "Tip pretoka", value: String(i.pretok.tip) },
        ...(i.pretok.nacin ? [{ label: "Način", value: String(i.pretok.nacin) }] : []),
        // Gubitak pripada tanku iz kojeg je vino izaslo — ovdje i s oznakom
        // visokog, kao na stranici tanka.
        ...(g ? [redakGubitka(g, true)] : []),
        { label: "Napomena", value: i.pretok.napomena || "—" },
      ],
    });
  }

  // --- DOLASCI PRIJENOSOM (filtracija i srodni) -----------------------------
  // Prijenos izmedju dvije karike lanca vec stoji kao zadatak izvorne posude.
  const dolasci = (
    await db.zadatakTankStavka.findMany({
      where: { ciljTankId: { in: posude }, zadatak: { izvrsenoAt: raspon } },
      include: {
        zadatak: {
          include: {
            tank: { select: { broj: true } },
            izvrsioKorisnik: { select: { ime: true, email: true } },
          },
        },
      },
    })
  ).filter((s) => u_(s.ciljTankId, s.zadatak.izvrsenoAt ?? s.zadatak.zadanoAt));

  for (const s of dolasci) {
    if (prikazaniZadaci.has(s.zadatakId)) continue;
    dogadaji.push({
      id: `dol-${s.id}`,
      vrsta: "PRIJENOS_ULAZ",
      vrijeme: (s.zadatak.izvrsenoAt ?? s.zadatak.zadanoAt).toISOString(),
      naslov: `${gdje(s.ciljTankId)}Dolazak vina iz tanka ${s.zadatak.tank.broj}`,
      podnaslov: `${String(s.zadatak.vrsta)} — ${s.zadatak.naslov?.trim() || "bez naslova"}`,
      tko: s.zadatak.izvrsenoAt ? `Izvršio: ${ime(s.zadatak.izvrsioKorisnik)}` : null,
      iznos: `+${fBroj(s.kolicina, 0)} L`,
      detalji: [
        { label: "Iz tanka", value: String(s.zadatak.tank.broj) },
        { label: "Količina", value: `${fBroj(s.kolicina)} L` },
        { label: "Vrsta prijenosa", value: String(s.zadatak.vrsta) },
        { label: "Izvršeno", value: fDatum(s.zadatak.izvrsenoAt) },
      ],
    });
  }

  // --- IZLAZI (i ovaj zavrsni) -----------------------------------------------
  // Original ostaje i nakon arhiviranja (faza F); arhivska kopija je dvojnik.
  // Kopija bez originala (izlazi prije faze F) ide uz oznaku.
  const izlazi = (
    await db.izlazVina.findMany({
      where: { tankId: { in: posude }, datum: raspon },
    })
  ).filter((x) => u_(x.tankId, x.datum));
  const prikazaniIzlazi = new Set(izlazi.map((x) => x.id));
  const arhivskiIzlazi = (
    await db.arhivaVinaIzlaz.findMany({
      where: { tankId: { in: posude }, datum: raspon },
    })
  ).filter((x) => u_(x.tankId, x.datum));

  // EVIDENCIJA VINA KOJE JE IZASLO (razina 1 arhive) — poveznica s izlaza,
  // kao na stranici tanka. Jedan upit, samo kad zivih izlaza ima. Izlazi prije
  // 29.09.2026. snimku nemaju, a arhivska kopija izlaza (prije faze F) nikad.
  const snimkaPoIzlazu = new Map(
    izlazi.length > 0
      ? (
          await db.snimkaVina.findMany({
            where: { izlazVinaId: { in: izlazi.map((x) => x.id) } },
            select: { id: true, izlazVinaId: true },
          })
        ).map((s) => [s.izlazVinaId, s.id] as const)
      : []
  );

  for (const x of [
    ...izlazi.map((x) => ({ ...x, arhivski: false, kljuc: x.id })),
    ...arhivskiIzlazi.map((x) => ({ ...x, arhivski: true, kljuc: x.izvorniIzlazId ?? x.id })),
  ]) {
    if (x.arhivski) {
      if (prikazaniIzlazi.has(x.kljuc)) continue;
      prikazaniIzlazi.add(x.kljuc);
    }
    const snimkaId = x.arhivski ? undefined : snimkaPoIzlazu.get(x.id);
    dogadaji.push({
      ...(snimkaId && snimkaId !== u.trenutnaSnimkaId
        ? { poveznica: { href: `/prosli-tank?snimka=${snimkaId}`, tekst: "evidencija vina koje je izašlo" } }
        : {}),
      id: `${x.arhivski ? "aiz" : "iz"}-${x.id}`,
      vrsta: "IZLAZ",
      vrijeme: x.datum.toISOString(),
      naslov: `${gdje(x.tankId)}${x.tip === "PUNJENJE" ? "Punjenje u boce" : "Prodaja / rinfuza"}`,
      podnaslov:
        [x.brojBoca ? `${x.brojBoca} boca × ${fBroj(x.volumenBoce)} L` : null, x.arhivski ? "iz arhive" : null]
          .filter(Boolean)
          .join(" · ") || null,
      iznos: `−${fBroj(x.kolicinaLitara, 0)} L`,
      detalji: [
        { label: "Tip", value: String(x.tip) },
        { label: "Litara", value: `${fBroj(x.kolicinaLitara)} L` },
        { label: "Broj boca", value: x.brojBoca != null ? String(x.brojBoca) : "—" },
        { label: "Napomena", value: x.napomena || "—" },
        ...(x.arhivski ? [IZ_ARHIVE] : []),
      ],
    });
  }

  dogadaji.sort((a, b) => new Date(b.vrijeme).getTime() - new Date(a.vrijeme).getTime());
  return dogadaji;
}
