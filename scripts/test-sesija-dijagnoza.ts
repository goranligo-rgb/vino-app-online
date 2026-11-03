/**
 * PRIVREMENO, brise se sa /sesija-dijagnoza.
 * Razlog dijagnoze mora se slagati s pravom provjerom u lib/auth-token.ts.
 * Izmisljena tajna, bez baze i bez mreze.
 *
 *   npx tsx scripts/test-sesija-dijagnoza.ts
 */
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import {
  potpisiToken,
  provjeriToken,
  sesijaIzBaze,
  type AuthUser,
} from "../lib/auth-token";
import {
  brojKolacica,
  PORUKA_RAZLOGA,
  procitajToken,
  razlogSUBazom,
} from "../lib/sesija-dijagnoza";

const TAJNA = "testna-tajna-samo-za-ovu-skriptu-0123456789";
const korisnik: AuthUser = { id: "u1", ime: "Probni Korisnik", role: "ENOLOG" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sad = () => Math.floor(Date.now() / 1000);

function slozi(glava: unknown, tijelo: unknown, tajna = TAJNA) {
  const g = b64(glava);
  const t = b64(tijelo);
  const p = createHmac("sha256", tajna).update(`${g}.${t}`).digest("base64url");
  return `${g}.${t}.${p}`;
}

const HS = { alg: "HS256", typ: "JWT" };
const dobro = () => ({
  sub: "u1",
  ime: "Probni Korisnik",
  role: "ENOLOG",
  iat: sad(),
  exp: sad() + 1000,
});

async function main() {
  process.env.AUTH_SECRET = TAJNA;

  const slucajevi: [string, string | null | undefined, string][] = [
    ["nema", undefined, "nema"],
    ["prazan", "", "nema"],
    ["stari JSON kolacic", '{"role":"ADMIN"}', "oblik"],
    ["dva dijela", "a.b", "oblik"],
    ["smece u tijelu", "a.%%%.c", "oblik"],
    ["ispravan oblik, nije JSON", `${b64(HS)}.bmlqZS1qc29u.abc`, "oblik"],
    ["druga tajna", slozi(HS, dobro(), "druga-tajna-samo-za-ovu-skriptu-9876543210"), "potpis"],
    ["izmijenjen sadrzaj", (() => {
      const [g, , p] = slozi(HS, dobro()).split(".");
      return `${g}.${b64({ ...dobro(), role: "ADMIN" })}.${p}`;
    })(), "potpis"],
    ["krivi alg", slozi({ alg: "none" }, dobro()), "oblik"],
    ["bez exp", slozi(HS, { ...dobro(), exp: undefined }), "oblik"],
    ["istekao", slozi(HS, { ...dobro(), exp: sad() - 1 }), "istekao"],
    ["bez sub", slozi(HS, { ...dobro(), sub: "" }), "oblik"],
    ["nepoznata uloga", slozi(HS, { ...dobro(), role: "SEF" }), "oblik"],
    ["ispravan", slozi(HS, dobro()), "ispravan"],
    ["iz prave prijave", await potpisiToken(korisnik), "ispravan"],
  ];

  let n = 0;
  for (const [ime, token, ocekivano] of slucajevi) {
    const r = await procitajToken(token);
    assert.equal(r.razlog, ocekivano, ime);
    // Dijagnoza se mora slagati s pravom provjerom.
    assert.equal(r.razlog === "ispravan", (await provjeriToken(token)) !== null, `slaganje: ${ime}`);
    // sub i role samo uz ispravan token.
    if (r.razlog !== "ispravan") {
      assert.equal(r.sub, null, ime);
      assert.equal(r.role, null, ime);
    }
    n++;
  }

  // Datumi i uz los potpis, da se vidi promijenjena tajna.
  const stariPotpis = await procitajToken(
    slozi(HS, dobro(), "druga-tajna-samo-za-ovu-skriptu-9876543210")
  );
  assert.ok(stariPotpis.iat && stariPotpis.exp);
  n++;

  // Bez tajne na posluzitelju.
  delete process.env.AUTH_SECRET;
  assert.equal((await procitajToken("a.b.c")).razlog, "tajna");
  assert.equal((await procitajToken(undefined)).razlog, "nema");
  process.env.AUTH_SECRET = TAJNA;
  n += 2;

  // Baza: isti zakljucak kao sesijaIzBaze.
  const redci = [
    { active: true, role: "ENOLOG", ime: "x" },
    { active: true, role: "ADMIN", ime: "x" },
    { active: false, role: "ENOLOG", ime: "x" },
    null,
  ];
  assert.deepEqual(
    redci.map((r) => razlogSUBazom("ENOLOG", r)),
    ["ok", "uloga", "neaktivan", "neaktivan"]
  );
  for (const r of redci) {
    assert.equal(razlogSUBazom("ENOLOG", r) === "ok", sesijaIzBaze(korisnik, r) !== null);
    n++;
  }

  // Broj kolacica iz sirovog zaglavlja.
  assert.equal(brojKolacica(null), 0);
  assert.equal(brojKolacica("a=1; b=2"), 0);
  assert.equal(brojKolacica("auth_user=x"), 1);
  assert.equal(brojKolacica("a=1; auth_user=x; auth_user=y"), 2);
  assert.equal(brojKolacica("xauth_user=x; a=auth_user=y"), 0);
  n += 5;

  // Poruke ne sadrze nikakve podatke, samo razlog.
  assert.equal(PORUKA_RAZLOGA.ok, "OK");
  n++;

  console.log(`sesija-dijagnoza: ${n} provjera prošlo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
