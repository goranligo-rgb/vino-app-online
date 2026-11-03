/**
 * Skeniranje naljepnice: parsiranje, poruke kamere i podudarnost .wasm datoteke.
 * Bez baze i bez mreze.
 *
 *   npx tsx scripts/test-qr-tank.ts
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ZXING_WASM_SHA256, ZXING_WASM_VERSION } from "barcode-detector/ponyfill";
import { opisGreskeKamere, putanjaTankaIzQr } from "../lib/qr-tank";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PUTANJA = `/tankovi/${ID}`;

const prihvaceno: [string, string][] = [
  [`https://vino-app-online.vercel.app/tankovi/${ID}`, PUTANJA],
  [`https://vino-app-online-abc123-goran.vercel.app/tankovi/${ID}`, PUTANJA],
  [`http://localhost:3000/tankovi/${ID}`, PUTANJA],
  [`https://bilo-koja-domena.hr/tankovi/${ID}`, PUTANJA],
  [`https://a.hr/tankovi/${ID}/`, PUTANJA],
  [`  https://a.hr/tankovi/${ID}\n`, PUTANJA],
  // Upit, # i korisnik u adresi ne prolaze u rezultat.
  [`https://a.hr/tankovi/${ID}?next=https://evil.com#x`, PUTANJA],
  [`https://korisnik:lozinka@a.hr:8443/tankovi/${ID}`, PUTANJA],
  [`HTTPS://A.HR/tankovi/${ID}`, PUTANJA],
  [`https://a.hr/tankovi/${ID.toUpperCase()}`, `/tankovi/${ID.toUpperCase()}`],
];

const odbijeno = [
  "",
  "obican tekst",
  "T14",
  ID,
  `/tankovi/${ID}`,
  `tankovi/${ID}`,
  "https://a.hr/tankovi/qr",
  "https://a.hr/tankovi",
  "https://a.hr/tankovi/",
  "https://a.hr/tankovi/123",
  `https://a.hr/tankovi/${ID}/izvjestaj`,
  `https://a.hr/tankovi/${ID}/../qr`,
  `https://a.hr/x/tankovi/${ID}`,
  `https://a.hr/dashboard?x=/tankovi/${ID}`,
  `https://a.hr/#/tankovi/${ID}`,
  `https://a.hr/tankovi/${ID}x`,
  `https://a.hr/tankovi/${ID}%2F`,
  `javascript:alert(1)//a.hr/tankovi/${ID}`,
  `javascript:/tankovi/${ID}`,
  `data:text/html,/tankovi/${ID}`,
  `ftp://a.hr/tankovi/${ID}`,
  `mailto:a@a.hr?body=/tankovi/${ID}`,
];

let n = 0;

for (const [ulaz, ocekivano] of prihvaceno) {
  assert.equal(putanjaTankaIzQr(ulaz), ocekivano, JSON.stringify(ulaz));
  n++;
}

for (const ulaz of odbijeno) {
  assert.equal(putanjaTankaIzQr(ulaz), null, JSON.stringify(ulaz));
  n++;
}

// Poruke kamere: svaka poznata greska ima svoju, a nepoznata ne pada.
assert.match(opisGreskeKamere("NotAllowedError").poruka, /odbijen/);
assert.equal(opisGreskeKamere("NotAllowedError").ponovno, true);
assert.equal(opisGreskeKamere("SecurityError").ponovno, true);
assert.match(opisGreskeKamere("NotFoundError").poruka, /nije pronađena/);
assert.equal(opisGreskeKamere("NotFoundError").ponovno, false);
assert.equal(opisGreskeKamere("OverconstrainedError").ponovno, false);
assert.match(opisGreskeKamere("NotReadableError").poruka, /druga aplikacija/);
assert.equal(opisGreskeKamere("NotReadableError").ponovno, true);
assert.equal(opisGreskeKamere(undefined).ponovno, true);
n += 9;

// Citac: komponenta trazi tocno ovu datoteku. Nova verzija paketa bez nove
// datoteke u public/zxing ovdje puca, umjesto na mobitelu u podrumu.
const wasm = join(
  process.cwd(),
  "public",
  "zxing",
  `zxing_reader-${ZXING_WASM_VERSION}.wasm`
);
assert.ok(existsSync(wasm), `nema ${wasm}`);
assert.equal(
  createHash("sha256").update(readFileSync(wasm)).digest("hex"),
  ZXING_WASM_SHA256,
  "wasm se ne podudara s verzijom paketa"
);
n += 2;

console.log(`qr-tank: ${n} provjera prošlo (wasm ${ZXING_WASM_VERSION})`);
