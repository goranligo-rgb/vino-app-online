/**
 * Provjera da uvodjenje flotacije i talozenja NIJE promijenilo nijedan tekst
 * ni ponasanje za FILTRACIJU.
 *
 * Pokretanje:  npm run test:vrste
 *
 * Zasto postoji: lib/vrste-prijenosa.ts je nastao izvlacenjem 6 grana i 11
 * tekstova koji su prije bili prepisani po datotekama. Takav refaktor je tih —
 * ako se negdje izgubi razmak, trotocka ili dijakritik, nista ne pukne, samo
 * korisnik odjednom vidi drukciji tekst. Ovdje su ZATECENE vrijednosti upisane
 * doslovno, prepisane iz koda prije refaktora, pa se odstupanje vidi odmah.
 *
 * Ne treba bazu ni mrezu; radi samo nad cistim funkcijama.
 */

import {
  VRSTE_PRIJENOSA,
  jePrijenosVina,
  nazivVrste,
  akuzativVrste,
  genitivVrste,
  naslovNovogZadatka,
  naslovVezanogZadatka,
  porukaVlastitiEkran,
  PORUKE_VLASTITI_EKRAN,
  jeMaceracijskaVrsta,
  oblikAscii,
} from "../lib/vrste-prijenosa";

let pao = 0;
let proslo = 0;

function jednako(dobiveno: unknown, ocekivano: unknown, poruka: string) {
  if (dobiveno === ocekivano) {
    proslo++;
    return;
  }

  pao++;
  console.log(`  PAO: ${poruka}`);
  console.log(`       ocekivano: ${JSON.stringify(ocekivano)}`);
  console.log(`       dobiveno:  ${JSON.stringify(dobiveno)}`);
}

// ---------------------------------------------------------------------------
// 1. ZATECENO PONASANJE ZA FILTRACIJU - mora ostati znakovno identicno
// ---------------------------------------------------------------------------
// Svaki string ispod prepisan je iz koda PRIJE refaktora. Reference u
// komentarima su na zatecene brojeve redaka.

console.log("1. Filtracija - zatecen tekst");

// app/zadaci/page.tsx:350 (nazivVrste)
jednako(nazivVrste("FILTRACIJA"), "Filtracija", "nazivVrste(FILTRACIJA)");

// app/zadaci/page.tsx:535 (auto-naslov novog zadatka)
jednako(naslovNovogZadatka("FILTRACIJA"), "Filtracija", "naslovNovogZadatka(FILTRACIJA)");

// app/zadaci/page.tsx:545 (auto-naslov vezanog zadatka)
jednako(naslovVezanogZadatka("FILTRACIJA"), "Filtracija", "naslovVezanogZadatka(FILTRACIJA)");

// filtracija-forma.tsx:388  ->  `Izvrši ${akuzativVrste(v)}`
jednako(`Izvrši ${akuzativVrste("FILTRACIJA")}`, "Izvrši filtraciju", "gumb izvrsenja");

// app/zadaci/page.tsx:1945  ->  `Izvrši ${akuzativVrste(v)}…`
jednako(`Izvrši ${akuzativVrste("FILTRACIJA")}…`, "Izvrši filtraciju…", "gumb na popisu zadataka");

// filtracija-forma.tsx:213  ->  `Greška kod izvršenja ${genitivVrste(v)}.`
jednako(
  `Greška kod izvršenja ${genitivVrste("FILTRACIJA")}.`,
  "Greška kod izvršenja filtracije.",
  "fallback poruka greske u formi"
);

// app/api/zadatak/izvrsi/route.ts:63 i app/api/zadatak/route.ts:234
jednako(
  porukaVlastitiEkran("FILTRACIJA"),
  "Filtracija se izvršava kroz vlastiti ekran jer prenosi vino u druge tankove.",
  "poruka 'vlastiti ekran'"
);

// ---------------------------------------------------------------------------
// 2. ZATECENO PONASANJE ZA SVE OSTALE VRSTE - refaktor ih ne smije dirati
// ---------------------------------------------------------------------------

console.log("2. Ostale vrste - zatecen tekst");

// app/zadaci/page.tsx:345-355, doslovno
const NAZIVI_PRIJE: Array<[string, string]> = [
  ["DODAVANJE", "Dodavanje"],
  ["MIJESANJE", "Miješanje"],
  ["PRETOK", "Pretok"],
  ["FILTRACIJA", "Filtracija"],
  ["MJERENJE", "Mjerenje"],
  ["KOREKCIJA", "Korekcija"],
  ["PUNJENJE", "Punjenje"],
  ["NAPOMENA", "Napomena"],
  // Zatecena funkcija je za nepoznato vracala sirovu vrijednost.
  ["OSTALO", "OSTALO"],
];

for (const [vrsta, ocekivano] of NAZIVI_PRIJE) {
  jednako(nazivVrste(vrsta), ocekivano, `nazivVrste(${vrsta})`);
}

// app/zadaci/page.tsx:529-539, doslovno
const NASLOV_PRIJE: Array<[string, string]> = [
  ["DODAVANJE", "Dodavanje preparata"],
  ["PRETOK", "Pretok"],
  ["MIJESANJE", "Miješanje"],
  ["MJERENJE", "Mjerenje"],
  ["KOREKCIJA", "Korekcija"],
  ["FILTRACIJA", "Filtracija"],
  ["PUNJENJE", "Punjenje"],
  ["NAPOMENA", "Napomena"],
  ["OSTALO", "Novi zadatak"],
];

for (const [vrsta, ocekivano] of NASLOV_PRIJE) {
  jednako(naslovNovogZadatka(vrsta), ocekivano, `naslovNovogZadatka(${vrsta})`);
}

// app/zadaci/page.tsx:541-551, doslovno
const VEZANI_PRIJE: Array<[string, string]> = [
  ["PRETOK", "Pretok"],
  ["MIJESANJE", "Miješanje"],
  ["MJERENJE", "Mjerenje"],
  ["FILTRACIJA", "Filtracija"],
  ["KOREKCIJA", "Korekcija"],
  ["PUNJENJE", "Punjenje"],
  ["NAPOMENA", "Napomena"],
  ["OSTALO", "Vezani zadatak"],
  // Zatecena verzija nije imala granu za DODAVANJE.
  ["DODAVANJE", "Vezani zadatak"],
];

for (const [vrsta, ocekivano] of VEZANI_PRIJE) {
  jednako(naslovVezanogZadatka(vrsta), ocekivano, `naslovVezanogZadatka(${vrsta})`);
}

// ---------------------------------------------------------------------------
// 3. jePrijenosVina - tocno tri vrste, nista drugo
// ---------------------------------------------------------------------------

console.log("3. jePrijenosVina");

for (const vrsta of ["FILTRACIJA", "FLOTACIJA", "TALOZENJE"]) {
  jednako(jePrijenosVina(vrsta), true, `jePrijenosVina(${vrsta})`);
}

for (const vrsta of [
  "DODAVANJE",
  "MIJESANJE",
  "PRETOK",
  "MJERENJE",
  "KOREKCIJA",
  "PUNJENJE",
  "NAPOMENA",
  "OSTALO",
]) {
  jednako(jePrijenosVina(vrsta), false, `jePrijenosVina(${vrsta})`);
}

jednako(jePrijenosVina(null), false, "jePrijenosVina(null)");
jednako(jePrijenosVina(undefined), false, "jePrijenosVina(undefined)");
jednako(jePrijenosVina(""), false, "jePrijenosVina('')");
// Ne smije se osloniti na podudaranje dijela stringa.
jednako(jePrijenosVina("filtracija"), false, "jePrijenosVina(mala slova)");

// ---------------------------------------------------------------------------
// 4. Nove vrste - gramatika
// ---------------------------------------------------------------------------

console.log("4. Flotacija i talozenje - gramatika");

jednako(nazivVrste("FLOTACIJA"), "Flotacija", "nazivVrste(FLOTACIJA)");
jednako(nazivVrste("TALOZENJE"), "Taloženje", "nazivVrste(TALOZENJE)");

jednako(`Izvrši ${akuzativVrste("FLOTACIJA")}`, "Izvrši flotaciju", "gumb flotacija");
jednako(`Izvrši ${akuzativVrste("TALOZENJE")}`, "Izvrši taloženje", "gumb talozenje");

jednako(
  `Greška kod izvršenja ${genitivVrste("FLOTACIJA")}.`,
  "Greška kod izvršenja flotacije.",
  "greska flotacija"
);
jednako(
  `Greška kod izvršenja ${genitivVrste("TALOZENJE")}.`,
  "Greška kod izvršenja taloženja.",
  "greska talozenje"
);

// ---------------------------------------------------------------------------
// 5. Allow-lista poruka ne smije se raziici od same poruke
// ---------------------------------------------------------------------------
// Ovo je jedina provjera koja stiti od tihog pada 400 -> 500 u catch blokovima
// app/api/zadatak/izvrsi/route.ts i PUT /api/zadatak.

console.log("5. Poruka i allow-lista");

jednako(
  PORUKE_VLASTITI_EKRAN.length,
  VRSTE_PRIJENOSA.length,
  "allow-lista pokriva sve vrste prijenosa"
);

for (const vrsta of VRSTE_PRIJENOSA) {
  jednako(
    PORUKE_VLASTITI_EKRAN.includes(porukaVlastitiEkran(vrsta)),
    true,
    `allow-lista sadrzi poruku za ${vrsta}`
  );
}

// ---------------------------------------------------------------------------
// 6. Maceracija se nudi SAMO na flotaciji i talozenju
// ---------------------------------------------------------------------------
// Filtracija je na vinu dva mjeseca kasnije i s maceracijom nema veze — pitanje
// se na njoj ne smije ni pojaviti.

console.log("6. jeMaceracijskaVrsta");

jednako(jeMaceracijskaVrsta("FLOTACIJA"), true, "flotacija ima maceraciju");
jednako(jeMaceracijskaVrsta("TALOZENJE"), true, "talozenje ima maceraciju");
jednako(jeMaceracijskaVrsta("FILTRACIJA"), false, "FILTRACIJA JU NEMA");

for (const vrsta of [
  "DODAVANJE",
  "MIJESANJE",
  "PRETOK",
  "MJERENJE",
  "KOREKCIJA",
  "PUNJENJE",
  "NAPOMENA",
  "OSTALO",
]) {
  jednako(jeMaceracijskaVrsta(vrsta), false, `jeMaceracijskaVrsta(${vrsta})`);
}

jednako(jeMaceracijskaVrsta(null), false, "jeMaceracijskaVrsta(null)");
jednako(jeMaceracijskaVrsta(undefined), false, "jeMaceracijskaVrsta(undefined)");

// ---------------------------------------------------------------------------
// 7. ASCII oblici — bez dijakritike, s tocnim rodom
// ---------------------------------------------------------------------------
// Koristi ih app/api/zadatak/filtracija/izvrsi/route.ts, koji je cijeli pisan
// bez dijakritike. Ako se ovamo uvuce "Taloženje", ta datoteka postaje
// pravopisno neujednacena — a to se ne primijeti dok netko ne vidi poruku.

console.log("7. ASCII oblici");

/** Samo ispisivi ASCII, od razmaka do tilde. */
const SAMO_ASCII = /^[ -~]*$/;

for (const vrsta of VRSTE_PRIJENOSA) {
  const o = oblikAscii(vrsta);
  jednako(SAMO_ASCII.test(o.naziv), true, `${vrsta}.naziv je ASCII`);
  jednako(SAMO_ASCII.test(o.genitiv), true, `${vrsta}.genitiv je ASCII`);
  jednako(SAMO_ASCII.test(o.izvrsen), true, `${vrsta}.izvrsen je ASCII`);
}

// Rod mora biti tocan: talozenje je srednjeg roda.
jednako(
  `${oblikAscii("FILTRACIJA").naziv} je ${oblikAscii("FILTRACIJA").izvrsen}.`,
  "Filtracija je izvrsena.",
  "poruka za filtraciju"
);
jednako(
  `${oblikAscii("FLOTACIJA").naziv} je ${oblikAscii("FLOTACIJA").izvrsen}.`,
  "Flotacija je izvrsena.",
  "poruka za flotaciju"
);
jednako(
  `${oblikAscii("TALOZENJE").naziv} je ${oblikAscii("TALOZENJE").izvrsen}.`,
  "Talozenje je izvrseno.",
  "poruka za talozenje — srednji rod"
);

jednako(
  `Greska kod izvrsenja ${oblikAscii("TALOZENJE").genitiv}.`,
  "Greska kod izvrsenja talozenja.",
  "genitiv u poruci greske"
);
jednako(
  `Izvrsenje ${oblikAscii("TALOZENJE").genitiv} je predugo trajalo pa je prekinuto.`,
  "Izvrsenje talozenja je predugo trajalo pa je prekinuto.",
  "konstrukcija koja izbjegava rod"
);

// Nepoznata vrsta (npr. u catch bloku prije citanja zadatka) daje neutralan oblik.
jednako(
  oblikAscii(null).naziv,
  "Prijenos vina",
  "neutralan naziv kad se vrsta ne zna"
);
jednako(oblikAscii(null).genitiv, "prijenosa vina", "neutralan genitiv");

// ---------------------------------------------------------------------------

console.log("");
console.log(`proslo: ${proslo}, palo: ${pao}`);

if (pao > 0) process.exit(1);
