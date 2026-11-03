/**
 * Token i kolacic: rok, obnova, odluka uz redak iz baze.
 * Izmisljena tajna, bez baze i bez mreze.
 *
 *   npx tsx scripts/test-auth-token.ts
 */
import { strict as assert } from "node:assert";
import {
  obnoviTokenAkoTreba,
  opcijeKolacica,
  opcijeTrajnogKolacica,
  potpisiToken,
  provjeriToken,
  sesijaIzBaze,
  type AuthUser,
} from "../lib/auth-token";

const TAJNA = "testna-tajna-samo-za-ovu-skriptu-0123456789";
const DAN = 60 * 60 * 24;
const korisnik: AuthUser = { id: "u1", ime: "Probni Korisnik", role: "ENOLOG" };

const pravoVrijeme = Date.now;
const pocetak = pravoVrijeme();
function naDan(n: number) {
  Date.now = () => pocetak + n * DAN * 1000;
}
const sekunde = (n: number) => Math.floor((pocetak + n * DAN * 1000) / 1000);
const tijelo = (t: string) =>
  JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8"));

async function main() {
  process.env.AUTH_SECRET = TAJNA;

  // Rok tokena je 90 dana.
  naDan(0);
  const token = await potpisiToken(korisnik);
  assert.equal(tijelo(token).exp - tijelo(token).iat, 90 * DAN);
  assert.deepEqual(await provjeriToken(token), korisnik);

  naDan(89);
  assert.deepEqual(await provjeriToken(token), korisnik, "vrijedi 89. dan");
  naDan(90);
  assert.equal(await provjeriToken(token), null, "istekao 90. dan");

  // Obnova tek kad je token stariji od 7 dana.
  naDan(0);
  assert.equal(await obnoviTokenAkoTreba(token), null, "svjez token");
  naDan(6.9);
  assert.equal(await obnoviTokenAkoTreba(token), null, "mladji od 7 dana");

  naDan(8);
  const nov = await obnoviTokenAkoTreba(token);
  assert.ok(nov, "stariji od 7 dana se obnavlja");

  // Isti sadrzaj osim iat/exp.
  const staro = tijelo(token);
  const novo = tijelo(nov!);
  assert.deepEqual(Object.keys(novo).sort(), Object.keys(staro).sort());
  for (const k of Object.keys(staro)) {
    if (k !== "iat" && k !== "exp") assert.deepEqual(novo[k], staro[k], k);
  }
  assert.equal(novo.iat, sekunde(8));
  assert.equal(novo.exp, sekunde(8) + 90 * DAN);

  // Produzuje: novi token vrijedi nakon isteka starog, 90 dana od zadnjeg koristenja.
  naDan(97);
  assert.equal(await provjeriToken(token), null, "stari je istekao");
  assert.deepEqual(await provjeriToken(nov), korisnik, "obnovljeni vrijedi");
  naDan(98);
  assert.equal(await provjeriToken(nov), null, "i on istekne ako se ne koristi");

  // Istekao ili krivotvoren se ne obnavlja.
  naDan(95);
  assert.equal(await obnoviTokenAkoTreba(token), null, "istekao");
  naDan(8);
  const [g, t, p] = token.split(".");
  const izmijenjeno = Buffer.from(
    JSON.stringify({ ...tijelo(token), role: "ADMIN" })
  ).toString("base64url");
  assert.equal(await obnoviTokenAkoTreba(`${g}.${izmijenjeno}.${p}`), null, "izmijenjen sadrzaj");
  assert.equal(await provjeriToken(`${g}.${izmijenjeno}.${p}`), null);
  assert.equal(await obnoviTokenAkoTreba(`${g}.${t}`), null, "krivi oblik");
  assert.equal(await obnoviTokenAkoTreba(undefined), null, "nema tokena");

  process.env.AUTH_SECRET = "druga-tajna-samo-za-ovu-skriptu-9876543210";
  assert.equal(await provjeriToken(token), null, "druga tajna");
  assert.equal(await obnoviTokenAkoTreba(token), null, "druga tajna");
  process.env.AUTH_SECRET = TAJNA;

  // Odjava ovisi o ovome: maxAge ima prednost pred expires, pa ako udje u
  // zajednicke opcije, odjava vise ne brise kolacic.
  assert.equal("maxAge" in opcijeKolacica(), false);
  assert.equal(opcijeTrajnogKolacica().maxAge, 90 * DAN);
  const trajni = opcijeTrajnogKolacica();
  assert.equal(trajni.httpOnly, true);
  assert.equal(trajni.sameSite, "lax");
  assert.equal(trajni.path, "/");

  // Odluka uz redak iz baze.
  const aktivan = { active: true, role: "ENOLOG", ime: "Novo Ime" };
  assert.deepEqual(sesijaIzBaze(korisnik, aktivan), {
    id: "u1",
    ime: "Novo Ime",
    role: "ENOLOG",
  });
  assert.equal(sesijaIzBaze(korisnik, null), null, "korisnik obrisan");
  assert.equal(sesijaIzBaze(korisnik, { ...aktivan, active: false }), null, "deaktiviran");
  assert.equal(sesijaIzBaze(korisnik, { ...aktivan, role: "PREGLED" }), null, "uloga snizena");
  assert.equal(sesijaIzBaze(korisnik, { ...aktivan, role: "ADMIN" }), null, "uloga povisena");

  Date.now = pravoVrijeme;
  console.log("auth-token: sve provjere prošle");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
