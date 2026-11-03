/**
 * Pregled vina: cisti racun + usporedba s izvornim citacima nad pravim podacima.
 * SAMO CITANJE, nijedan upis.
 *
 *   npx tsx --env-file=.env scripts/test-statistika-vina.ts
 */
import { prisma } from "../lib/prisma";
import { sastavSvihTankova, stanjeSvihTankova } from "../lib/berba-model";
import { PRAG_SORTNOSTI, razvrstaj } from "../lib/identitet-vina";
import { imenaPodruma, imeZaPrikaz } from "../lib/ime-vina";
import { procitajPregledVina } from "../lib/statistika-vina-baza";
import {
  POLJA_PREGLEDA,
  POLJA_PROSJEKA,
  PRAZNI_FILTRI,
  GRUPA_BEZ_TIPA,
  GRUPA_CUVEE,
  filtrirajVina,
  grupaSorte,
  grupirajVina,
  opcijeSorte,
  procitajUpis,
  prosjekPoLitrama,
  razvrstajSastav,
  sastavSmjese,
  simuliraj,
  sortirajVina,
  stupciSPodacima,
  uMl,
  type PoljePregleda,
  type VinoRedak,
  type VrijednostPolja,
} from "../lib/statistika-vina";

let prolaz = 0;
let pad = 0;

function tvrdi(uvjet: boolean, opis: string) {
  if (uvjet) prolaz++;
  else {
    pad++;
    console.log(`PAO: ${opis}`);
  }
}

const blizu = (a: number | null, b: number, d = 1e-9) => a != null && Math.abs(a - b) < d;

function vino(u: Partial<VinoRedak> & { broj: number; ml: number }, p: Partial<Record<PoljePregleda, number | VrijednostPolja>> = {}): VinoRedak {
  const parametri = {} as Record<PoljePregleda, VrijednostPolja>;
  for (const x of POLJA_PREGLEDA) {
    const v = p[x.kljuc];
    parametri[x.kljuc] =
      v == null
        ? { vrijednost: null, podrijetlo: "nema", izmjerenoAt: null }
        : typeof v === "number"
          ? { vrijednost: v, podrijetlo: "mjereno", izmjerenoAt: "2026-10-30T00:00:00.000Z" }
          : v;
  }
  return {
    tankId: `t${u.broj}`,
    sifra: null,
    naziv: `Vino ${u.broj}`,
    godiste: 2026,
    sastav: [],
    vrsta: "BEZ_TVRDNJE",
    glavna: null,
    zadnjeMjerenjeAt: null,
    ...u,
    parametri,
  };
}

function cistiRacun() {
  // --- mililitri
  tvrdi(uMl(0.1) + uMl(0.2) === uMl(0.3), "uMl: 0,1 + 0,2 L je tocno 300 mL");
  tvrdi(uMl(null) === 0, "uMl: null je 0");

  // --- upis
  tvrdi(procitajUpis("") === 0, "prazan upis je nula");
  tvrdi(procitajUpis("-5") === null, "negativan upis je neispravan");
  tvrdi(procitajUpis("abc") === null, "tekst je neispravan");
  tvrdi(procitajUpis("1500.5") === 1_500_500, "1500.5 L u mL");

  // --- prosjek: 300 L x 12 + 100 L x 14 = 12,5
  const a = vino({ broj: 1, ml: 300_000 }, { alkohol: 12, ph: 3 });
  const b = vino({ broj: 2, ml: 100_000 }, { alkohol: 14 });
  const c = vino({ broj: 3, ml: 100_000 }, { alkohol: { vrijednost: 10, podrijetlo: "preneseno", izmjerenoAt: null } });

  const p1 = prosjekPoLitrama([a, b], "alkohol");
  tvrdi(blizu(p1.vrijednost, 12.5), "ponder je litra, nije obican prosjek (12,5, ne 13)");
  tvrdi(p1.pokrivenoMl === 400_000 && p1.ukupnoMl === 400_000, "puna pokrivenost");

  const p2 = prosjekPoLitrama([a, b], "ph");
  tvrdi(blizu(p2.vrijednost, 3), "vino bez vrijednosti ne vuce prosjek prema nuli");
  tvrdi(p2.pokrivenoMl === 300_000 && p2.ukupnoMl === 400_000, "pokrivenost 300 od 400 L");

  const p3 = prosjekPoLitrama([a, c], "alkohol");
  tvrdi(p3.neizmjerenoMl === 100_000, "preneseno se broji kao neizmjereno");

  const p4 = prosjekPoLitrama([b], "ph");
  tvrdi(p4.vrijednost === null && p4.pokrivenoMl === 0, "bez podataka nema prosjeka");

  // --- secer se nikad ne prosjecuje
  tvrdi(!POLJA_PROSJEKA.some((x) => (x.kljuc as string) === "secer"), "secer nije medju poljima prosjeka");
  tvrdi(POLJA_PROSJEKA.length === POLJA_PREGLEDA.length - 1, "sva ostala polja jesu");

  // --- sastav
  const s1 = sastavSmjese([
    { ml: 300_000, sastav: [{ nazivSorte: "Graševina", postotak: 100 }] },
    { ml: 100_000, sastav: [{ nazivSorte: "Sauvignon", postotak: 50 }, { nazivSorte: "Graševina", postotak: 50 }] },
  ]);
  tvrdi(s1[0].nazivSorte === "Graševina" && s1[0].postotak === 87.5, "sastav smjese: Graševina 87,5 %");
  tvrdi(s1[1].postotak === 12.5, "sastav smjese: Sauvignon 12,5 %");
  tvrdi(s1.reduce((z, x) => z + x.ml, 0) === 400_000, "mililitri sastava zbrajaju se u ukupne");

  const s2 = sastavSmjese([
    { ml: 100_000, sastav: [] },
    { ml: 100_000, sastav: [{ nazivSorte: "Graševina", postotak: 100 }] },
  ]);
  tvrdi(s2.find((x) => x.nazivSorte === "Graševina")?.postotak === 50, "vino bez sastava ne napuhuje udjele ostalih");

  // --- pravilo 80 % — rubovi
  const r = (postotak: number, naziv = "Graševina") => razvrstajSastav([{ nazivSorte: naziv, postotak }], 80).vrsta;
  tvrdi(r(80) === "CUVEE", "tocno 80 % je cuvée (prag je 'preko 80')");
  tvrdi(r(80.01) === "SORTNO", "80,01 % je sortno");
  tvrdi(r(95, "Nepoznato podrijetlo") === "BEZ_TVRDNJE", "najveci udio nije sorta: bez tvrdnje");
  tvrdi(razvrstajSastav([], 80).vrsta === "BEZ_TVRDNJE", "prazan sastav: bez tvrdnje");

  // --- simulacija
  const g = vino({ broj: 4, ml: 100_000, sastav: [{ nazivSorte: "Graševina", postotak: 100 }] }, { alkohol: 12, secer: 30 });
  const h = vino({ broj: 5, ml: 100_000, sastav: [{ nazivSorte: "Sauvignon", postotak: 100 }] }, { alkohol: 14, secer: 4 });

  const sim = simuliraj([{ vino: g, upis: "300" }, { vino: h, upis: "100" }], 80);
  tvrdi(sim.ukupnoMl === 400_000, "simulacija: ukupne litre");
  tvrdi(blizu(sim.prosjeci.alkohol.vrijednost, 12.5), "simulacija: tezina su UPISANE litre, ne stanje");
  tvrdi(sim.stavke[0].preko && !sim.stavke[1].preko, "upis veci od stanja je oznacen, jednak nije");
  tvrdi(sim.vrsta === "CUVEE" && sim.glavna?.postotak === 75, "simulacija: 75 % je cuvée");
  tvrdi(!("secer" in sim.prosjeci), "simulacija ne racuna prosjek secera");

  const nula = simuliraj([{ vino: g, upis: "0" }, { vino: h, upis: "100" }], 80);
  tvrdi(blizu(nula.prosjeci.alkohol.vrijednost, 14), "vino s 0 L ne ulazi u prosjek");
  tvrdi(nula.vrsta === "SORTNO" && nula.prosjeci.alkohol.ukupnoMl === 100_000, "vino s 0 L ne ulazi ni u sastav ni u pokrivenost");

  const los = simuliraj([{ vino: g, upis: "-1" }], 80);
  tvrdi(los.stavke[0].neispravno && los.ukupnoMl === 0, "neispravan upis ne ulazi u racun");

  // --- prazni stupci
  tvrdi(!stupciSPodacima([a, b]).some((x) => x.kljuc === "hlapiveKiseline"), "stupac bez podataka se skriva");
  const sHlapivima = vino({ broj: 6, ml: 1000 }, { hlapiveKiseline: 0.4 });
  tvrdi(stupciSPodacima([a, sHlapivima]).some((x) => x.kljuc === "hlapiveKiseline"), "prvi podatak ga vraca");
  tvrdi(!stupciSPodacima([a]).some((x) => x.kljuc === "secer"), "skrivanje gleda samo prikazana vina");

  // --- grupiranje: po sifri, ne po nazivu
  const v1 = vino({ broj: 7, ml: 1000, sifra: "44-1026-2", naziv: "Cuvee 2026" });
  const v2 = vino({ broj: 8, ml: 1000, sifra: "44-1026-7", naziv: "Cuvee 2026" });
  const v3 = vino({ broj: 9, ml: 1000, sifra: "44-1026-2", naziv: "Cuvee 2026" });
  const gr = grupirajVina([v1, v2, v3], "vino");
  tvrdi(gr.length === 2, "isti naziv, dvije sifre: dva vina");
  tvrdi(gr[0].vina.length === 2, "ista sifra u dva tanka: jedno vino");
  tvrdi(grupirajVina([v1], "nista").length === 1, "bez grupiranja jedna grupa");

  // --- sorta: tip iz razvrstaj, ne najveci udio
  const sort = vino({ broj: 12, ml: 1000, vrsta: "SORTNO", glavna: { nazivSorte: "Graševina", postotak: 90 }, sastav: [{ nazivSorte: "Graševina", postotak: 90 }, { nazivSorte: "Sauvignon", postotak: 10 }] });
  const cuv = vino({ broj: 13, ml: 2000, vrsta: "CUVEE", glavna: { nazivSorte: "Graševina", postotak: 53 }, sastav: [{ nazivSorte: "Graševina", postotak: 53 }, { nazivSorte: "Sauvignon", postotak: 47 }] });
  const bez = vino({ broj: 14, ml: 4000, vrsta: "BEZ_TVRDNJE", glavna: { nazivSorte: "Nepoznato podrijetlo", postotak: 83 }, sastav: [{ nazivSorte: "Nepoznato podrijetlo", postotak: 83 }, { nazivSorte: "Graševina", postotak: 17 }] });
  const tri = [cuv, bez, sort];

  tvrdi(grupaSorte(sort) === "Graševina", "sortno vino stoji pod svojom sortom");
  tvrdi(grupaSorte(cuv) === GRUPA_CUVEE, "cuvée s 53 % Graševine nije pod Graševinom");
  tvrdi(grupaSorte(bez) === GRUPA_BEZ_TIPA, "nepoznato podrijetlo je Bez tipa");
  tvrdi(grupirajVina(tri, "sorta").map((x) => x.naziv).join("|") === `Graševina|${GRUPA_CUVEE}|${GRUPA_BEZ_TIPA}`, "oznake idu iza sorti");

  const f = { ...PRAZNI_FILTRI, sorta: "Graševina" };
  tvrdi(filtrirajVina(tri, f).length === 1 && filtrirajVina(tri, f)[0] === sort, "filtar sorte zadano bez cuvéea");
  tvrdi(PRAZNI_FILTRI.ukljuciCuvee === false, "kvacica je zadano iskljucena");
  const sCuvee = filtrirajVina(tri, { ...f, ukljuciCuvee: true });
  tvrdi(sCuvee.includes(sort) && sCuvee.includes(cuv), "kvacica dodaje cuvée koji sadrzi sortu");
  tvrdi(!sCuvee.includes(bez), "kvacica dodaje samo cuvée, ne i vino bez tipa");
  tvrdi(filtrirajVina(tri, { ...PRAZNI_FILTRI, sorta: "Rizling", ukljuciCuvee: true }).length === 0, "cuvée bez te sorte ne ulazi");
  tvrdi(filtrirajVina(tri, { ...PRAZNI_FILTRI, sorta: GRUPA_CUVEE })[0] === cuv, "filtar Cuvée");
  tvrdi(filtrirajVina(tri, { ...PRAZNI_FILTRI, sorta: GRUPA_BEZ_TIPA, ukljuciCuvee: true }).length === 1, "kvacica ne vrijedi uz oznaku Bez tipa");
  tvrdi(opcijeSorte(tri).join("|") === `Graševina|Sauvignon|${GRUPA_CUVEE}|${GRUPA_BEZ_TIPA}`, "izbor: sorte pa oznake, bez Nepoznatog podrijetla");

  // --- filtri i sortiranje
  tvrdi(filtrirajVina([v1, v2], { ...PRAZNI_FILTRI, vino: "44-1026-7" })[0] === v2, "filtar po sifri");
  tvrdi(filtrirajVina([g], { ...PRAZNI_FILTRI, tekst: "grase" }).length === 1, "pretraga bez kvacica");
  tvrdi(filtrirajVina([g], { ...PRAZNI_FILTRI, tekst: "t4" }).length === 1, "pretraga po tanku");

  const bezPh = vino({ broj: 10, ml: 1000 });
  const sPh = vino({ broj: 11, ml: 1000 }, { ph: 3 });
  tvrdi(sortirajVina([bezPh, sPh], "ph", "desc")[0] === sPh, "prazno na dnu i silazno");
  tvrdi(sortirajVina([bezPh, sPh], "ph", "asc")[0] === sPh, "prazno na dnu i uzlazno");
}

async function praviPodaci() {
  const pregled = await procitajPregledVina(prisma);
  const [sastavi, stanje, imena, tankovi] = [
    await sastavSvihTankova(prisma),
    await stanjeSvihTankova(prisma),
    await imenaPodruma(prisma),
    await prisma.tank.findMany({ select: { id: true, kolicinaVinaUTanku: true } }),
  ];

  const puni = tankovi.filter((t) => Number(t.kolicinaVinaUTanku ?? 0) > 0);
  console.log(`pravi podaci: ${pregled.vina.length} vina, ${puni.length} punih tankova`);

  tvrdi(pregled.vina.length === puni.length, "red po svakom punom tanku");
  tvrdi(pregled.vina.length > 0, "ima se sto usporediti");
  tvrdi(pregled.vina.every((v) => v.ml > 0), "nijedan prazan tank");
  tvrdi(pregled.pragSortnosti === PRAG_SORTNOSTI, "prag dolazi iz lib/identitet-vina.ts");

  for (const v of pregled.vina) {
    const T = `T${v.broj}`;

    // --- razvrstaj: izvornik naprama klijentskoj kopiji, na izvornom sastavu
    const izvorni = sastavi.get(v.tankId) ?? [];
    const mjerilo = razvrstaj(izvorni.map((s) => ({ berbaId: "", nazivSorte: s.nazivSorte, litre: 0, postotak: s.postotak })));
    const kopija = razvrstajSastav(v.sastav, pregled.pragSortnosti);
    tvrdi(kopija.vrsta === mjerilo.vrsta, `${T}: vrsta razvrstajSastav = razvrstaj (${kopija.vrsta} / ${mjerilo.vrsta})`);
    tvrdi(kopija.glavna?.nazivSorte === mjerilo.glavna?.nazivSorte, `${T}: glavna sorta ista`);
    tvrdi(v.vrsta === mjerilo.vrsta, `${T}: ruta salje vrstu iz razvrstaj`);

    // --- isti racun u simulaciji: jedno vino s punim litrama je to isto vino
    const sim = simuliraj([{ vino: v, upis: String(v.ml / 1000) }], pregled.pragSortnosti);
    tvrdi(sim.vrsta === mjerilo.vrsta, `${T}: simulacija jednog vina daje istu vrstu (${sim.vrsta} / ${mjerilo.vrsta})`);
    tvrdi(sim.ukupnoMl === v.ml, `${T}: simulacija jednog vina daje iste litre`);
    tvrdi(Math.abs(sim.sastav.reduce((z, x) => z + x.ml, 0) - v.ml) <= v.sastav.length, `${T}: mililitri sastava ne bjeze od litara`);

    // --- litre naprama knjizi (stanjeTanka je mjerilo)
    const knjigaMl = (stanje.get(v.tankId) ?? []).reduce((z, s) => z + s.ml, 0);
    tvrdi(Math.abs(knjigaMl - v.ml) <= 1000, `${T}: litre ${v.ml / 1000} = knjiga ${knjigaMl / 1000}`);

    // --- ime: isto kao citac cijelog podruma
    tvrdi(imeZaPrikaz(imena.get(v.tankId)).tekst === v.naziv, `${T}: naziv isti kao imenaPodruma`);

    // --- datum samo uz izmjereno
    for (const p of POLJA_PREGLEDA) {
      const x = v.parametri[p.kljuc];
      tvrdi((x.izmjerenoAt != null) === (x.podrijetlo === "mjereno"), `${T} ${p.kljuc}: datum samo uz stvarno izmjereno`);
      tvrdi(x.podrijetlo !== "nema" || x.vrijednost == null, `${T} ${p.kljuc}: "nema" nema vrijednost`);
    }
  }

  // --- grupe po sorti nad pravim podacima
  const ukupnoMl = pregled.vina.reduce((z, v) => z + v.ml, 0);
  const grupe = grupirajVina(pregled.vina, "sorta");
  const cuveei = pregled.vina.filter((v) => v.vrsta === "CUVEE");
  const grupaCuvee = grupe.find((g) => g.kljuc === GRUPA_CUVEE);

  tvrdi(cuveei.length > 0, "u podrumu ima cuvéea, pa tvrdnje ispod nesto znace");
  tvrdi(pregled.vina.find((v) => v.broj === 42)?.vrsta === "CUVEE", "T42 je cuvée");
  tvrdi(grupaCuvee?.vina.some((v) => v.broj === 42) === true, "T42 je u grupi Cuvée");
  tvrdi(grupaCuvee?.vina.length === cuveei.length, "svi cuvéei su u grupi Cuvée");

  for (const g of grupe) {
    if (g.kljuc === GRUPA_CUVEE) continue;
    tvrdi(!g.vina.some((v) => v.vrsta === "CUVEE"), `grupa ${g.naziv}: nijedan cuvée`);
    if (g.kljuc === GRUPA_BEZ_TIPA) {
      tvrdi(g.vina.every((v) => v.vrsta === "BEZ_TVRDNJE"), "Bez tipa: samo vina bez tipa");
    } else {
      tvrdi(g.vina.every((v) => v.vrsta === "SORTNO" && v.glavna?.nazivSorte === g.kljuc), `grupa ${g.naziv}: samo sortna te sorte`);
    }
  }

  for (const po of ["sorta", "vino", "godina", "tip", "nista"] as const) {
    const g = grupirajVina(pregled.vina, po);
    tvrdi(g.reduce((z, x) => z + x.vina.reduce((y, v) => y + v.ml, 0), 0) === ukupnoMl, `grupiranje ${po}: zbroj litara = ukupne litre`);
    tvrdi(g.reduce((z, x) => z + x.vina.length, 0) === pregled.vina.length, `grupiranje ${po}: svako vino tocno jednom`);
  }

  const zaGrasevinu = { ...PRAZNI_FILTRI, sorta: "Graševina" };
  tvrdi(!filtrirajVina(pregled.vina, zaGrasevinu).some((v) => v.vrsta === "CUVEE"), "filtar Graševina: zadano bez cuvéea");
  tvrdi(filtrirajVina(pregled.vina, { ...zaGrasevinu, ukljuciCuvee: true }).some((v) => v.broj === 42), "filtar Graševina s kvacicom: T42 je tu");
  console.log(`grupe po sorti: ${grupe.map((g) => `${g.naziv} ${g.vina.length} (${g.vina.reduce((z, v) => z + v.ml, 0) / 1000} L)`).join("; ")}`);

  // --- simulacija cijelog podruma: stvarni brojevi, ponder i pokrivenost
  const sve = simuliraj(pregled.vina.map((v) => ({ vino: v, upis: String(v.ml / 1000) })), pregled.pragSortnosti);
  tvrdi(sve.ukupnoMl === pregled.vina.reduce((z, v) => z + v.ml, 0), "podrum: ukupno mL");
  tvrdi(Math.abs(sve.sastav.reduce((z, x) => z + x.postotak, 0) - 100) < 0.5, "podrum: sastav daje 100 %");
  for (const p of POLJA_PROSJEKA) {
    const x = sve.prosjeci[p.kljuc];
    const rucno = pregled.vina.filter((v) => v.parametri[p.kljuc].vrijednost != null);
    const ocekivanoMl = rucno.reduce((z, v) => z + v.ml, 0);
    tvrdi(x.pokrivenoMl === ocekivanoMl, `podrum ${p.kljuc}: pokrivenost`);
    if (rucno.length > 0) {
      const o = rucno.reduce((z, v) => z + v.parametri[p.kljuc].vrijednost! * v.ml, 0) / ocekivanoMl;
      tvrdi(blizu(x.vrijednost, o, 1e-6), `podrum ${p.kljuc}: prosjek`);
    }
  }

  const skriveno = POLJA_PREGLEDA.filter((p) => !stupciSPodacima(pregled.vina).some((x) => x.kljuc === p.kljuc));
  console.log(`skriveni stupci: ${skriveno.map((p) => p.kljuc).join(", ") || "nijedan"}`);
  const vrste = pregled.vina.reduce<Record<string, number>>((z, v) => ({ ...z, [v.vrsta]: (z[v.vrsta] ?? 0) + 1 }), {});
  console.log(`vrste: ${JSON.stringify(vrste)}`);
  console.log(`bez godista: ${pregled.vina.filter((v) => v.godiste == null).map((v) => `T${v.broj}`).join(", ") || "nijedan"}`);
}

async function main() {
  cistiRacun();
  await praviPodaci();
  console.log(`\n${prolaz} tvrdnji proslo, ${pad} palo`);
  if (pad > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
