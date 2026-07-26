"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePutnikUser } from "@/lib/putnik-auth";
import { sPotvrdom } from "../../../spremljeno";

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

function dateValue(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  if (!value) return null;

  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Zajednička polja dogovora — i kreiranje i izmjena pišu isti skup.
function poljaIzForme(formData: FormData) {
  return {
    nacinKupnje: text(formData, "nacinKupnje"),
    kupujeDirektno: checked(formData, "kupujeDirektno"),
    kupujePrekoDistributera: checked(formData, "kupujePrekoDistributera"),
    kupujePrekoVeletrgovca: checked(formData, "kupujePrekoVeletrgovca"),

    pocetnaNarudzba: text(formData, "pocetnaNarudzba"),
    dogovorenaKolicina: num(formData, "dogovorenaKolicina"),
    dogovorenaAkcija: text(formData, "dogovorenaAkcija"),

    akcija6Plus1: checked(formData, "akcija6Plus1"),
    akcija12Plus2: checked(formData, "akcija12Plus2"),
    akcija24Plus4: checked(formData, "akcija24Plus4"),
    posebnaCijenaDogovorena: checked(formData, "posebnaCijenaDogovorena"),
    posebnaCijena: text(formData, "posebnaCijena"),
    rabat: text(formData, "rabat"),

    caseDogovorene: checked(formData, "caseDogovorene"),
    brojCasa: num(formData, "brojCasa"),
    tipCasa: text(formData, "tipCasa"),
    caseLogo: checked(formData, "caseLogo"),
    caseNapomena: text(formData, "caseNapomena"),

    promoDogovoren: checked(formData, "promoDogovoren"),
    vinskaKarta: checked(formData, "vinskaKarta"),
    plakati: checked(formData, "plakati"),
    letci: checked(formData, "letci"),
    stalci: checked(formData, "stalci"),
    menuHolder: checked(formData, "menuHolder"),
    promoPolice: checked(formData, "promoPolice"),
    ledReklama: checked(formData, "ledReklama"),
    promoNapomena: text(formData, "promoNapomena"),

    uzorciDogovoreni: checked(formData, "uzorciDogovoreni"),
    uzorciDetalji: text(formData, "uzorciDetalji"),

    edukacijaDogovorena: checked(formData, "edukacijaDogovorena"),
    datumEdukacije: dateValue(formData, "datumEdukacije"),
    edukacijaDetalji: text(formData, "edukacijaDetalji"),

    degustacijaDogovorena: checked(formData, "degustacijaDogovorena"),
    datumDegustacije: dateValue(formData, "datumDegustacije"),
    degustacijaDetalji: text(formData, "degustacijaDetalji"),

    winePartyDogovoren: checked(formData, "winePartyDogovoren"),
    datumWineParty: dateValue(formData, "datumWineParty"),
    winePartyDetalji: text(formData, "winePartyDetalji"),

    posjetVinarijiDogovoren: checked(formData, "posjetVinarijiDogovoren"),
    datumPosjetaVinariji: dateValue(formData, "datumPosjetaVinariji"),
    posjetVinarijiDetalji: text(formData, "posjetVinarijiDetalji"),

    uvjetiPlacanja: text(formData, "uvjetiPlacanja"),
    rokPlacanja: text(formData, "rokPlacanja"),
    dostava: text(formData, "dostava"),
    minimalnaNarudzba: text(formData, "minimalnaNarudzba"),

    tkoPotvrduje: text(formData, "tkoPotvrduje"),
    kontaktZaPotvrdu: text(formData, "kontaktZaPotvrdu"),
    rokPotvrde: dateValue(formData, "rokPotvrde"),
    datumSljedeceg: dateValue(formData, "datumSljedeceg"),

    trebaPonudu: checked(formData, "trebaPonudu"),
    trebaPredracun: checked(formData, "trebaPredracun"),
    trebaNazvati: checked(formData, "trebaNazvati"),
    trebaDostavitiUzorke: checked(formData, "trebaDostavitiUzorke"),
    trebaPonovnoObici: checked(formData, "trebaPonovnoObici"),

    status: text(formData, "status"),
    zakljucak: text(formData, "zakljucak"),
    napomena: text(formData, "napomena"),
  };
}

export async function spremiDogovor(formData: FormData) {
  await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  if (!kupacId) return;

  await prisma.putnikDogovor.create({
    data: { kupacId, ...poljaIzForme(formData) },
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(sPotvrdom(`/putnik/kupci/${kupacId}`));
}

// Izmjena postojećeg dogovora — prepiše stari zapis (bez povijesti). Ne dira zalihu.
export async function azurirajDogovor(formData: FormData) {
  await requirePutnikUser();

  const kupacId = String(formData.get("kupacId") || "").trim();
  const dogovorId = String(formData.get("dogovorId") || "").trim();
  if (!kupacId || !dogovorId) return;

  await prisma.putnikDogovor.update({
    where: { id: dogovorId },
    data: poljaIzForme(formData),
  });

  revalidatePath("/putnik");
  revalidatePath(`/putnik/kupci/${kupacId}`);
  redirect(sPotvrdom(`/putnik/kupci/${kupacId}`));
}
