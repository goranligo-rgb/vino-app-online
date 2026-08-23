/**
 * Vrste zadatka koje PRENOSE VINO, i njihovo nazivlje — jedan izvor istine.
 *
 * FILTRACIJA, FLOTACIJA i TALOZENJE su fizicki ista radnja: tekucina izlazi iz
 * jednog tanka i ulazi u jedan ili vise drugih, talog ostaje, razlika je kalo.
 * Zato dijele isti mehanizam (Zadatak.kolicinaIzlaz + ZadatakTankStavka +
 * lib/filtracija.ts) i isti ekran izvrsenja.
 *
 * U PODRUMU TO NISU ISTE STVARI i nikad se ne mijesaju:
 *   - flotacija i talozenje rade se na MOSTU, isti dan nakon berbe ili dan-dva
 *     kasnije;
 *   - filtracija je na VINU, dva mjeseca kasnije.
 * Zato su u sucelju tri odvojene stavke s vlastitim imenom.
 *
 * ZASTO OVA DATOTEKA POSTOJI: prije nje je uvjet "je li ovo prijenos vina" bio
 * prepisan na 6 mjesta kao `vrsta === "FILTRACIJA"`, a ime radnje na 11 mjesta
 * kao goli tekst "Filtracija". Dodavanje vrste znacilo je pogoditi svih 17 —
 * a propusteni guard u app/api/zadatak/izvrsi/route.ts ne bi pukao, nego bi
 * tiho zatvorio zadatak i ostavio vino u izvornom tanku.
 *
 * Namjerno bez ovisnosti o @prisma/client: funkcije primaju `string`, pa se
 * datoteka smije uvesti i u klijentske komponente ("use client") bez ikakvog
 * rizika. Prisma enumi su string unije, pa se prosljedjuju bez konverzije.
 */

/** Vrste zadatka koje prenose vino. Redoslijed prati enum u bazi. */
export const VRSTE_PRIJENOSA = ["FILTRACIJA", "FLOTACIJA", "TALOZENJE"] as const;

export type VrstaPrijenosa = (typeof VRSTE_PRIJENOSA)[number];

/**
 * Prenosi li zadatak ove vrste vino iz tanka u tank?
 *
 * Zamjenjuje svih 6 zatecenih `vrsta === "FILTRACIJA"` provjera.
 *
 * Vrsta je JEDINI uvjet. Guardovi u app/api/zadatak/izvrsi i PUT /api/zadatak
 * su ranije uz nju gledali i ima li zadatak upisan izlaz ili ciljne tankove,
 * da stara "gola" filtracija prodje golim klikom; to je maknuto kad su
 * flotacija i talozenje otvoreni u sucelju. Prijenosni zadatak bez brojki nije
 * zavrsen posao nego neispunjen obrazac i mora kroz formu.
 */
export function jePrijenosVina(vrsta: string | null | undefined): boolean {
  return (VRSTE_PRIJENOSA as readonly string[]).includes(String(vrsta ?? ""));
}

/**
 * Nominativ, onako kako se ime radnje pise korisniku.
 *
 * Pokriva SVE vrste zadatka, ne samo prijenosne, jer zamjenjuje i zatecenu
 * nazivVrste() s /zadaci. OSTALO namjerno nije u tablici: zatecena funkcija je
 * za njega vracala sirovu vrijednost i to ponasanje se cuva.
 */
const NAZIVI: Record<string, string> = {
  DODAVANJE: "Dodavanje",
  MIJESANJE: "Miješanje",
  PRETOK: "Pretok",
  FILTRACIJA: "Filtracija",
  FLOTACIJA: "Flotacija",
  TALOZENJE: "Taloženje",
  MJERENJE: "Mjerenje",
  KOREKCIJA: "Korekcija",
  PUNJENJE: "Punjenje",
  NAPOMENA: "Napomena",
};

export function nazivVrste(vrsta: string): string {
  return NAZIVI[vrsta] ?? vrsta;
}

/** Akuzativ — za "Izvrši ___". Talozenje je srednjeg roda pa je jednak nominativu. */
const AKUZATIV: Record<VrstaPrijenosa, string> = {
  FILTRACIJA: "filtraciju",
  FLOTACIJA: "flotaciju",
  TALOZENJE: "taloženje",
};

export function akuzativVrste(vrsta: string): string {
  return AKUZATIV[vrsta as VrstaPrijenosa] ?? "zadatak";
}

/** Genitiv — za "Greška kod izvršenja ___". */
const GENITIV: Record<VrstaPrijenosa, string> = {
  FILTRACIJA: "filtracije",
  FLOTACIJA: "flotacije",
  TALOZENJE: "taloženja",
};

export function genitivVrste(vrsta: string): string {
  return GENITIV[vrsta as VrstaPrijenosa] ?? "zadatka";
}

/**
 * Zadani naslov pri zadavanju novog zadatka na /zadaci.
 *
 * Razlikuje se od nazivVrste na dva mjesta, i oba su zatecena ponasanja koja se
 * cuvaju doslovno: DODAVANJE daje "Dodavanje preparata", a sve nepoznato
 * (ukljucujuci OSTALO) daje "Novi zadatak" umjesto sirove vrijednosti.
 */
export function naslovNovogZadatka(vrsta: string): string {
  if (vrsta === "DODAVANJE") return "Dodavanje preparata";
  return NAZIVI[vrsta] ?? "Novi zadatak";
}

/**
 * Zadani naslov vezanog (djecijeg) zadatka.
 *
 * Zatecena verzija nije imala granu za DODAVANJE — ono nije ni ponudjeno u
 * izborniku vezane vrste — pa bi palo na "Vezani zadatak". To se cuva izricito,
 * da refaktor ne promijeni ponasanje ni u slucaju koji se danas ne moze dogoditi.
 */
export function naslovVezanogZadatka(vrsta: string): string {
  if (vrsta === "DODAVANJE") return "Vezani zadatak";
  return NAZIVI[vrsta] ?? "Vezani zadatak";
}

/**
 * Poruka koju vracaju obicne rute izvrsenja kad na njih dodje zadatak koji
 * prenosi vino (app/api/zadatak/izvrsi i PUT /api/zadatak).
 *
 * VAZNO: te rute u catch bloku usporedjuju poruku PO TOCNOM STRINGU
 * (`[...].includes(error.message)`) da odluce vraca li se HTTP 400 ili 500.
 * Zato poruka i popis dopustenih poruka moraju dolaziti iz istog izvora —
 * PORUKE_VLASTITI_EKRAN ispod se racuna iz ove funkcije, pa se ne mogu raziici.
 * Da su ostale dvije odvojene liste, promjena teksta na jednom mjestu tiho bi
 * pretvorila jasnu poruku korisniku u genericki 500.
 */
export function porukaVlastitiEkran(vrsta: string): string {
  return `${nazivVrste(
    vrsta
  )} se izvršava kroz vlastiti ekran jer prenosi vino u druge tankove.`;
}

/** Sve poruke iz porukaVlastitiEkran — za allow-liste u catch blokovima. */
export const PORUKE_VLASTITI_EKRAN: string[] =
  VRSTE_PRIJENOSA.map(porukaVlastitiEkran);

/**
 * NAPUSTENO od 23.08.2026 — ne koristi se nigdje u aplikaciji.
 *
 * Maceracija se dogadja na GROZDJU, prije nego most uopce udje u tank, dakle
 * prije nego ijedan zadatak postoji. Pitanje je zato maknuto sa zadatka i
 * preseljeno na PunjenjeStavka, uz ostale podatke berbe.
 *
 * Funkcija i njezini testovi ostaju jer nista ne kostaju i jer bi njihovo
 * brisanje bilo jedina izmjena u testu koji inace pokriva ostale helpere.
 * NE koristiti je u novom kodu.
 */
export function jeMaceracijskaVrsta(vrsta: string | null | undefined): boolean {
  return vrsta === "FLOTACIJA" || vrsta === "TALOZENJE";
}

/**
 * ASCII oblici — BEZ dijakritike.
 *
 * Postoje zbog app/api/zadatak/filtracija/izvrsi/route.ts, koji je cijeli
 * pisan bez dijakritike ("izvrsena", "Greska"). Da se ondje koristio obicni
 * nazivVrste(), nastalo bi "Talozenje je izvrsena." — i pravopisno neujednaceno
 * i gramaticki krivo, jer je talozenje srednjeg roda.
 *
 * `izvrsen` je particip koji ide uz naziv u nominativu. Recenice koje ga ne
 * trebaju grade se preko genitiva i srednjeg roda ("Izvrsenje talozenja je
 * predugo trajalo"), pa im je dovoljan `genitiv`.
 */
type OblikAscii = { naziv: string; genitiv: string; izvrsen: string };

const ASCII: Record<VrstaPrijenosa, OblikAscii> = {
  FILTRACIJA: { naziv: "Filtracija", genitiv: "filtracije", izvrsen: "izvrsena" },
  FLOTACIJA: { naziv: "Flotacija", genitiv: "flotacije", izvrsen: "izvrsena" },
  TALOZENJE: { naziv: "Talozenje", genitiv: "talozenja", izvrsen: "izvrseno" },
};

/** Neutralni oblik kad se vrsta ne zna (npr. u catch bloku prije citanja zadatka). */
const ASCII_NEUTRALNO: OblikAscii = {
  naziv: "Prijenos vina",
  genitiv: "prijenosa vina",
  izvrsen: "izvrsen",
};

export function oblikAscii(vrsta: string | null | undefined): OblikAscii {
  return ASCII[vrsta as VrstaPrijenosa] ?? ASCII_NEUTRALNO;
}
