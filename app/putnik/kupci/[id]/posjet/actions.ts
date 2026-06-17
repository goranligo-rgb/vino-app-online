"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";
import { formatHrDate } from "@/lib/datum";

function text(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || null;
}

function num(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

// Dozvoljeni statusi pripreme. Kod izmjene se postojeći status zadržava
// (PRIPREMLJENO/ISPORUCENO se ne smije izgubiti); nepoznato pada na PRIPREMITI.
// Kod kreiranja forma šalje samo PRIPREMITI/ODMAH pa je ovo bezopasno.
const STATUS_PRIPREME = ["PRIPREMITI", "ODMAH", "PRIPREMLJENO", "ISPORUCENO"];
function statusPripreme(raw: string) {
  return STATUS_PRIPREME.includes(raw) ? raw : "PRIPREMITI";
}

/**
 * Iz FormData izvlači stavke narudžbe. Inputi se ponavljaju pod istim imenom
 * (stavkaNaziv / stavkaKolicina / stavkaJedinica), getAll čuva redoslijed.
 * Preskaču se redovi bez naziva proizvoda.
 */
function citajStavke(formData: FormData) {
  const nazivi = formData.getAll("stavkaNaziv").map((v) => String(v).trim());
  const artikli = formData.getAll("stavkaArtiklId").map((v) => String(v).trim());
  const kolicine = formData.getAll("stavkaKolicina").map((v) => String(v).trim());
  const jedinice = formData.getAll("stavkaJedinica").map((v) => String(v).trim());
  const gratisi = formData.getAll("stavkaGratis").map((v) => String(v).trim());
  const statusi = formData.getAll("stavkaStatus").map((v) => String(v).trim());

  const stavke: {
    nazivProizvoda: string;
    artiklId: string | null;
    kolicina: number | null;
    jedinica: string;
    gratis: number;
    statusPripreme: string;
  }[] = [];

  for (let i = 0; i < nazivi.length; i++) {
    const naziv = nazivi[i];
    if (!naziv) continue;

    const kolRaw = (kolicine[i] || "").replace(",", ".");
    const kol = kolRaw ? Number(kolRaw) : null;

    const gratisRaw = gratisi[i] || "";
    const gratisNum = gratisRaw ? parseInt(gratisRaw, 10) : 0;

    stavke.push({
      nazivProizvoda: naziv,
      // Faza 7 - veza na katalog vina (za zalihu po putniku); prazno = slobodan unos
      artiklId: artikli[i] || null,
      kolicina: kol != null && Number.isFinite(kol) ? kol : null,
      jedinica: jedinice[i] || "kom",
      gratis: Number.isFinite(gratisNum) && gratisNum > 0 ? gratisNum : 0,
      statusPripreme: statusPripreme(statusi[i] || ""),
    });
  }

  return stavke;
}

// Pokloni / promo otpis s posjeta: parovi artiklId + kolicina. Prazni se preskaču.
function citajPokloni(formData: FormData) {
  const artikli = formData.getAll("poklonArtiklId").map((v) => String(v).trim());
  const kolicine = formData.getAll("poklonKolicina").map((v) => String(v).trim());
  const statusi = formData.getAll("poklonStatus").map((v) => String(v).trim());

  const pokloni: { artiklId: string; kolicina: number; status: string }[] = [];

  for (let i = 0; i < artikli.length; i++) {
    const artiklId = artikli[i];
    if (!artiklId) continue;

    const kol = parseInt(kolicine[i] || "", 10);
    if (!Number.isFinite(kol) || kol <= 0) continue;

    pokloni.push({
      artiklId,
      kolicina: kol,
      status: statusPripreme(statusi[i] || ""),
    });
  }

  return pokloni;
}

// Zajednička skalarni polja posjeta (bez reklamniMaterijal — to forma ne ureduje,
// pa se kod izmjene NE prepisuje). Koriste create i update.
function posjetSkalar(formData: FormData) {
  return {
    biljeska: text(formData, "biljeska"),
    ukupanDug: num(formData, "ukupanDug"),
    dospjeliDug: num(formData, "dospjeliDug"),

    mjesto: text(formData, "mjesto"),
    vrijemeOd: text(formData, "vrijemeOd"),
    vrijemeDo: text(formData, "vrijemeDo"),
    tipObilaska: text(formData, "tipObilaska"),
    tipPremise: text(formData, "tipPremise"),
    stanjeProizvoda: text(formData, "stanjeProizvoda"),
    kilometri: num(formData, "kilometri"),
    cijena: text(formData, "cijena"),
    problemi: text(formData, "problemi"),
    aktDegustacija: checked(formData, "aktDegustacija"),
    aktVidljivost: checked(formData, "aktVidljivost"),
    aktSlaganjeRobe: checked(formData, "aktSlaganjeRobe"),
    aktIstaknuteCijene: checked(formData, "aktIstaknuteCijene"),
    aktAkcijskaCijena: checked(formData, "aktAkcijskaCijena"),
  };
}

// Pretvara pokloni-redove u PutnikPromoKupca otpise. Otpis se pripisuje putniku
// `ime` (kod izmjene = IZVORNI putnik posjeta, ne urednik) jer se po njemu vodi
// promo zaliha. Naziv artikla denormaliziran za povijesni prikaz.
async function pripremiOtpise(
  pokloni: { artiklId: string; kolicina: number; status: string }[],
  kupacId: string,
  datum: Date,
  ime: string | null
) {
  const artiklNazivi = new Map<string, string>();
  if (pokloni.length) {
    const ids = [...new Set(pokloni.map((p) => p.artiklId))];
    const artikli = await prisma.putnikPromoArtikl.findMany({
      where: { id: { in: ids } },
      select: { id: true, naziv: true },
    });
    for (const a of artikli) artiklNazivi.set(a.id, a.naziv);
  }

  return pokloni.map((p) => ({
    kupacId,
    artiklId: p.artiklId,
    tip: "OTPIS",
    naziv: artiklNazivi.get(p.artiklId) ?? null,
    kolicina: p.kolicina,
    datumPredaje: datum,
    predao: ime,
    otpisaoKorisnikIme: ime,
    statusPripreme: p.status,
  }));
}

/**
 * Glavna dnevna akcija: otvori DANASNJI posjet lokala (kamera + forma).
 *
 * Guard za duplikat dana: ako za danas (Zagreb zona) vec postoji posjet ovom
 * lokalu, otvara se TAJ (bez kreiranja drugog) — tako se istim danom ne
 * nakupljaju duplikati. Ako ne postoji, tiho se kreira prazan posjet
 * (datum=danas, putnik=ja) i odmah otvara ekran posjeta. Pokoji prazan posjet
 * od odustajanja je prihvatljiv jer je posjet svakodnevna radnja.
 */
export async function otvoriDanasnjiPosjet(formData: FormData) {
  const user = await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  if (!kupacId) return;

  const danas = formatHrDate(new Date());
  const danasnji = await prisma.putnikPosjet.findMany({
    where: { kupacId },
    select: { id: true, datum: true },
    orderBy: { datum: "desc" },
    take: 50,
  });
  const postojeci = danasnji.find((p) => formatHrDate(p.datum) === danas);

  let posjetId = postojeci?.id;
  if (!posjetId) {
    const novi = await prisma.putnikPosjet.create({
      data: { kupacId, putnikIme: user.ime || null, datum: new Date() },
      select: { id: true },
    });
    posjetId = novi.id;
    revalidatePath("/putnik");
    revalidatePath(`/putnik/kupci/${kupacId}`);
  }

  redirect(`/putnik/kupci/${kupacId}/posjet/${posjetId}/uredi`);
}

export async function spremiPosjet(formData: FormData) {
  const user = await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  if (!kupacId) return;

  const stavke = citajStavke(formData);
  const pokloni = citajPokloni(formData);
  const datum = dateValue(formData, "datum") ?? new Date();
  const promoOtpisi = await pripremiOtpise(pokloni, kupacId, datum, user.ime || null);

  await prisma.putnikPosjet.create({
    data: {
      kupacId,
      putnikIme: user.ime || null,
      datum,
      reklamniMaterijal: text(formData, "reklamniMaterijal"),
      ...posjetSkalar(formData),

      stavke: stavke.length ? { create: stavke } : undefined,
      promoOtpisi: promoOtpisi.length ? { create: promoOtpisi } : undefined,
    },
  });

  revalidatePath("/putnik");
  revalidatePath("/putnik/promo");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(`/putnik/kupci/${kupacId}`);
}

/**
 * Izmjena posjeta. Zaliha se računa AGREGACIJOM (Σ zaduženo − Σ izlaz), nema
 * tekućeg salda — zato je dovoljno u jednoj transakciji OBRISATI stare stavke
 * i otpise ovog posjeta i KREIRATI nove iz forme: stari doprinos izlazu nestane
 * (roba se "vrati"), novi se izračuna, i vino i promo zaliha se same poslože.
 *
 * Tri zaštite:
 *  - $transaction: brisanje + ponovno kreiranje je atomarno.
 *  - putnikIme posjeta se NE dira (vino ostaje na pravom autu).
 *  - otpisi se pripisuju IZVORNOM putniku posjeta (ne uredniku).
 * Status pripreme nepromijenjenih redova nosi forma pa se zadržava (Opcija A).
 */
export async function azurirajPosjet(formData: FormData) {
  await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  const posjetId = String(formData.get("posjetId") || "").trim();
  if (!kupacId || !posjetId) return;

  const postojeci = await prisma.putnikPosjet.findUnique({
    where: { id: posjetId },
    select: { id: true, kupacId: true, putnikIme: true },
  });
  if (!postojeci || postojeci.kupacId !== kupacId) return;

  const stavke = citajStavke(formData);
  const pokloni = citajPokloni(formData);
  const datum = dateValue(formData, "datum") ?? new Date();
  // Atribucija zalihe ostaje na izvornom putniku posjeta, ne na uredniku.
  const promoOtpisi = await pripremiOtpise(pokloni, kupacId, datum, postojeci.putnikIme);

  await prisma.$transaction([
    prisma.putnikPosjetStavka.deleteMany({ where: { posjetId } }),
    prisma.putnikPromoKupca.deleteMany({ where: { posjetId } }),
    prisma.putnikPosjet.update({
      where: { id: posjetId },
      data: {
        datum,
        ...posjetSkalar(formData),
        // putnikIme i reklamniMaterijal se namjerno NE diraju.
        stavke: stavke.length ? { create: stavke } : undefined,
        promoOtpisi: promoOtpisi.length ? { create: promoOtpisi } : undefined,
      },
    }),
  ]);

  revalidatePath("/putnik");
  revalidatePath("/putnik/promo");
  revalidatePath("/putnik/vozilo");
  revalidatePath("/putnik/priprema");
  revalidatePath("/putnik/zaduzenje");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(`/putnik/kupci/${kupacId}`);
}
