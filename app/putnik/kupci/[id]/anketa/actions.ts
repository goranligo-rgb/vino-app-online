"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";

function text(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || null;
}

function num(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function daNe(value: boolean) {
  return value ? "DA" : "NE";
}

// NOVA anketa: prvi dojam + vinska karta + biljeska putnika slijepe se u jedan
// 'biljeska' tekst (te tri stvari nemaju zasebne kolone). Kod IZMJENE se taj
// tekst ureduje kao jedan blok (vidi azurirajAnketu) pa se ovo NE koristi.
function sloziBiljesku(formData: FormData) {
  const dijelovi: string[] = [];

  const osnovniDojam = text(formData, "osnovniDojamLokala");
  if (osnovniDojam) {
    dijelovi.push(`OSNOVNI DOJAM LOKALA:\n${osnovniDojam}`);
  }

  const vinskaKarta = [
    `Ima vinsku kartu: ${daNe(checked(formData, "vinskaKartaIma"))}`,
    `Ima vina na čaše: ${daNe(checked(formData, "vinskaKartaCase"))}`,
    `Broj etiketa: ${text(formData, "vinskaKartaBrojEtiketa") || "-"}`,
    `Broj vina na čaše: ${text(formData, "vinskaKartaBrojCasa") || "-"}`,
    `Cijena čaše: ${text(formData, "vinskaKartaCijenaCase") || "-"}`,
    `Cijena boce: ${text(formData, "vinskaKartaCijenaBoce") || "-"}`,
    `Napomena: ${text(formData, "vinskaKartaNapomena") || "-"}`,
  ].join("\n");

  dijelovi.push(`VINSKA KARTA:\n${vinskaKarta}`);

  const biljeska = text(formData, "biljeska");
  if (biljeska) {
    dijelovi.push(`BILJEŠKA PUTNIKA:\n${biljeska}`);
  }

  return dijelovi.join("\n\n");
}

// Sve PRAVE kolone ankete (sve osim slozenog 'biljeska' bloka). internaBiljeska
// je prava kolona pa je ovdje. Koriste i create i update.
function poljaIzForme(formData: FormData) {
  return {
    tipLokala: text(formData, "tipLokala"),
    razinaLokala: text(formData, "razinaLokala"),
    brojSjedecihMjesta: num(formData, "brojSjedecihMjesta"),
    imaTerasu: checked(formData, "imaTerasu"),
    radiSezonski: checked(formData, "radiSezonski"),
    promet: text(formData, "promet"),
    najjaciDani: text(formData, "najjaciDani"),

    prodajeKucnoVino: checked(formData, "prodajeKucnoVino"),
    prodajeButelje: checked(formData, "prodajeButelje"),
    prodajeRinfuza: checked(formData, "prodajeRinfuza"),
    prodajePremium: checked(formData, "prodajePremium"),
    prodajeStranaVina: checked(formData, "prodajeStranaVina"),
    prodajePjenusce: checked(formData, "prodajePjenusce"),
    prodajeRose: checked(formData, "prodajeRose"),
    nemaPosebnuPonudu: checked(formData, "nemaPosebnuPonudu"),

    ideBijelo: checked(formData, "ideBijelo"),
    ideCrno: checked(formData, "ideCrno"),
    ideRose: checked(formData, "ideRose"),
    idePjenusci: checked(formData, "idePjenusci"),
    ideGrasevina: checked(formData, "ideGrasevina"),
    ideSauvignon: checked(formData, "ideSauvignon"),
    ideRizling: checked(formData, "ideRizling"),
    ideChardonnay: checked(formData, "ideChardonnay"),
    ideMuskat: checked(formData, "ideMuskat"),
    ideFrankovka: checked(formData, "ideFrankovka"),
    ideKupaza: checked(formData, "ideKupaza"),

    konkurentskeVinarije: text(formData, "konkurentskeVinarije"),
    glavniKonkurent: text(formData, "glavniKonkurent"),
    razlogCijena: checked(formData, "razlogCijena"),
    razlogPoznatost: checked(formData, "razlogPoznatost"),
    razlogKvaliteta: checked(formData, "razlogKvaliteta"),
    razlogRabat: checked(formData, "razlogRabat"),
    razlogDostava: checked(formData, "razlogDostava"),
    razlogOdnosDobavljac: checked(formData, "razlogOdnosDobavljac"),
    razlogGostiTraze: checked(formData, "razlogGostiTraze"),
    razlogKonobariProdaju: checked(formData, "razlogKonobariProdaju"),
    razlogCasePromo: checked(formData, "razlogCasePromo"),
    stoMuKodKonkurencijeOdgovara: text(formData, "stoMuKodKonkurencijeOdgovara"),
    stoMuKodKonkurencijeSmeta: text(formData, "stoMuKodKonkurencijeSmeta"),

    nacinNabave: text(formData, "nacinNabave"),
    nazivVeletrgovca: text(formData, "nazivVeletrgovca"),
    kontaktVeletrgovca: text(formData, "kontaktVeletrgovca"),
    uvjetiNabave: text(formData, "uvjetiNabave"),
    tkoDogovaraNarudzbu: text(formData, "tkoDogovaraNarudzbu"),

    tkoOdlucuje: text(formData, "tkoOdlucuje"),
    stvarniDonositelj: checked(formData, "stvarniDonositelj"),
    trebaPricatiSVlasnikom: checked(formData, "trebaPricatiSVlasnikom"),
    trebaPoslatiPonudu: checked(formData, "trebaPoslatiPonudu"),

    vaznaCijena: checked(formData, "vaznaCijena"),
    vaznaKvaliteta: checked(formData, "vaznaKvaliteta"),
    vaznaMarza: checked(formData, "vaznaMarza"),
    vaznaDostava: checked(formData, "vaznaDostava"),
    vazanBrend: checked(formData, "vazanBrend"),
    vaznaLokalnaPrica: checked(formData, "vaznaLokalnaPrica"),
    vaznaPreporukaHrane: checked(formData, "vaznaPreporukaHrane"),
    vaznaEdukacijaKonobara: checked(formData, "vaznaEdukacijaKonobara"),
    vazneCase: checked(formData, "vazneCase"),
    vazanPromoMaterijal: checked(formData, "vazanPromoMaterijal"),
    vazneAkcije: checked(formData, "vazneAkcije"),
    vaznaSigurnostDobave: checked(formData, "vaznaSigurnostDobave"),
    vaznaJednostavnaNarudzba: checked(formData, "vaznaJednostavnaNarudzba"),

    probaoNasaVina: text(formData, "probaoNasaVina"),
    misljenjeONama: text(formData, "misljenjeONama"),
    poznajeVinariju: checked(formData, "poznajeVinariju"),
    cuoZaNas: checked(formData, "cuoZaNas"),
    bioUVinariji: checked(formData, "bioUVinariji"),
    zanimaGaPricaVinarije: checked(formData, "zanimaGaPricaVinarije"),

    motiviraBoljaCijena: checked(formData, "motiviraBoljaCijena"),
    motiviraAkcija12Plus2: checked(formData, "motiviraAkcija12Plus2"),
    motiviraAkcija6Plus1: checked(formData, "motiviraAkcija6Plus1"),
    motivirajuProbneBoce: checked(formData, "motivirajuProbneBoce"),
    motivirajuCase: checked(formData, "motivirajuCase"),
    motiviraVinskaKarta: checked(formData, "motiviraVinskaKarta"),
    motiviraEdukacija: checked(formData, "motiviraEdukacija"),
    motiviraDegustacija: checked(formData, "motiviraDegustacija"),
    motiviraWineParty: checked(formData, "motiviraWineParty"),
    motiviraPosjetVinariji: checked(formData, "motiviraPosjetVinariji"),
    motiviraBoljaMarza: checked(formData, "motiviraBoljaMarza"),
    motiviraPreporukaUzHranu: checked(formData, "motiviraPreporukaUzHranu"),
    motiviraLokalnaPrica: checked(formData, "motiviraLokalnaPrica"),

    preprekaImaDobavljaca: checked(formData, "preprekaImaDobavljaca"),
    preprekaZadovoljanKonkurencijom: checked(formData, "preprekaZadovoljanKonkurencijom"),
    preprekaCijenaPrevisoka: checked(formData, "preprekaCijenaPrevisoka"),
    preprekaNePoznaVino: checked(formData, "preprekaNePoznaVino"),
    preprekaNemaProstora: checked(formData, "preprekaNemaProstora"),
    preprekaKonobariNeZnaju: checked(formData, "preprekaKonobariNeZnaju"),
    preprekaMaliPromet: checked(formData, "preprekaMaliPromet"),
    preprekaVlasnikNeZeli: checked(formData, "preprekaVlasnikNeZeli"),
    preprekaTrebaProbati: checked(formData, "preprekaTrebaProbati"),
    preprekaTrebaPonudu: checked(formData, "preprekaTrebaPonudu"),
    preprekaNijeTrenutak: checked(formData, "preprekaNijeTrenutak"),
    dodatnePrepreke: text(formData, "dodatnePrepreke"),

    potencijal: text(formData, "potencijal"),
    procjenaBocaMjesecno: num(formData, "procjenaBocaMjesecno"),
    preporucenaAkcija: text(formData, "preporucenaAkcija"),
    preporucenaAktivacija: text(formData, "preporucenaAktivacija"),
    sljedeciKorak: text(formData, "sljedeciKorak"),
    zavrsnaOcjena: text(formData, "zavrsnaOcjena"),

    akcija6Plus1: checked(formData, "akcija6Plus1"),
    akcija12Plus2: checked(formData, "akcija12Plus2"),
    akcija24Plus4: checked(formData, "akcija24Plus4"),
    probneBoce: checked(formData, "probneBoce"),
    gratisCase: checked(formData, "gratisCase"),
    edukacijaKonobara: checked(formData, "edukacijaKonobara"),
    degustacijaULokalu: checked(formData, "degustacijaULokalu"),
    winePartyAktivacija: checked(formData, "winePartyAktivacija"),
    posjetVinarijiAktivacija: checked(formData, "posjetVinarijiAktivacija"),
    vinskaKartaAktivacija: checked(formData, "vinskaKartaAktivacija"),
    promoMaterijalAktivacija: checked(formData, "promoMaterijalAktivacija"),
    stalciLetciAktivacija: checked(formData, "stalciLetciAktivacija"),
    posebnaCijenaAktivacija: checked(formData, "posebnaCijenaAktivacija"),
    preporukaHraneVina: checked(formData, "preporukaHraneVina"),
    lokalnaPricaAktivacija: checked(formData, "lokalnaPricaAktivacija"),
    premiumPozicioniranje: checked(formData, "premiumPozicioniranje"),
    preporucenaKolicina: num(formData, "preporucenaKolicina"),
    preporucenaCijena: text(formData, "preporucenaCijena"),
    preporuceniRok: text(formData, "preporuceniRok"),
    preporucenaAkcijaDetalji: text(formData, "preporucenaAkcijaDetalji"),

    internaBiljeska: text(formData, "internaBiljeska"),
  };
}

export async function spremiAnketu(formData: FormData) {
  await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  if (!kupacId) return;

  await prisma.putnikAnketaKupca.create({
    data: {
      kupacId,
      ...poljaIzForme(formData),
      biljeska: sloziBiljesku(formData),
    },
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(`/putnik/kupci/${kupacId}`);
}

// Izmjena ankete — prepiše stari zapis (bez povijesti). Ne dira zalihu.
// 'biljeska' (dojam + vinska karta + biljeska putnika) ureduje se kao jedan
// tekst i sprema 1:1 (vidi anketa-form, korak 20 u uredi nacinu).
export async function azurirajAnketu(formData: FormData) {
  await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  const anketaId = String(formData.get("anketaId") || "").trim();
  if (!kupacId || !anketaId) return;

  await prisma.putnikAnketaKupca.update({
    where: { id: anketaId },
    data: {
      ...poljaIzForme(formData),
      biljeska: text(formData, "biljeska"),
    },
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(`/putnik/kupci/${kupacId}`);
}
