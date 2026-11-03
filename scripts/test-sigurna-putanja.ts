/**
 * Povratak nakon prijave: samo relativne putanje, bez open redirecta.
 * Bez baze i bez mreze.
 *
 *   npx tsx scripts/test-sigurna-putanja.ts
 */
import { strict as assert } from "node:assert";
import { putanjaPrijave, sigurnaPutanja } from "../lib/sigurna-putanja";

const ZADANO = "/dashboard";

const dopusteno: [string, string][] = [
  ["/tankovi/abc", "/tankovi/abc"],
  ["/tankovi/qr", "/tankovi/qr"],
  ["/prosli-tank?korijen=1&iz=2&cin=3", "/prosli-tank?korijen=1&iz=2&cin=3"],
  ["/fermentacija?godina=2026#dno", "/fermentacija?godina=2026#dno"],
  ["/zadaci?povratak=/tankovi/abc", "/zadaci?povratak=/tankovi/abc"],
  ["/tankovi/a/../b", "/tankovi/b"],
];

const odbijeno: (string | null | undefined)[] = [
  null,
  undefined,
  "",
  "tankovi/abc",
  "//evil.com",
  "///evil.com",
  "/\\evil.com",
  "\\\\evil.com",
  "\\/evil.com",
  "/\t/evil.com",
  "/\n/evil.com",
  "/\r/evil.com",
  "/.//evil.com",
  "/..//evil.com",
  "/a/..//evil.com",
  "https://evil.com",
  "http://evil.com/tankovi/abc",
  "javascript:alert(1)",
  "data:text/html,x",
  " /tankovi/abc",
  "/login",
  "/login?next=/login",
  "/LOGIN",
  "/login/",
  "/api",
  "/api/logout",
  "/API/logout",
];

let n = 0;

for (const [ulaz, ocekivano] of dopusteno) {
  assert.equal(sigurnaPutanja(ulaz), ocekivano, `dopusteno: ${JSON.stringify(ulaz)}`);
  n++;
}

for (const ulaz of odbijeno) {
  assert.equal(sigurnaPutanja(ulaz), ZADANO, `odbijeno: ${JSON.stringify(ulaz)}`);
  // Bez obzira na ulaz, izlaz je uvijek putanja na istom izvoru.
  assert.equal(new URL(sigurnaPutanja(ulaz), "https://a.test").origin, "https://a.test");
  n++;
}

// Adresa prijave: next je kodiran, a zadano odrediste ne treba next.
assert.equal(putanjaPrijave("/tankovi/abc"), "/login?next=%2Ftankovi%2Fabc");
assert.equal(
  putanjaPrijave("/prosli-tank?iz=2&cin=3"),
  "/login?next=%2Fprosli-tank%3Fiz%3D2%26cin%3D3"
);
assert.equal(putanjaPrijave("//evil.com"), "/login");
assert.equal(putanjaPrijave("/dashboard"), "/login");
assert.equal(putanjaPrijave(null), "/login");
n += 5;

// Kruzno: ono sto proxy posalje, stranica prijave procita i prihvati.
const next = new URL(putanjaPrijave("/prosli-tank?iz=2&cin=3"), "https://a.test").searchParams.get("next");
assert.equal(sigurnaPutanja(next), "/prosli-tank?iz=2&cin=3");
n++;

console.log(`sigurna-putanja: ${n} provjera prošlo`);
