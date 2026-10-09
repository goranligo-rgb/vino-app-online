/**
 * Snimak `dogadajiVina` (lib/kronologija-vina.ts) prije i poslije izmjene modula.
 *
 * Pokretanje:
 *   npm run kronologija:provjeri -- zapisi <datoteka.json>
 *   npm run kronologija:provjeri -- usporedi <datoteka.json>
 *
 * SIGURNOST: iskljucivo cita (SELECT), nista ne upisuje. Snimak ide u datoteku
 * koju zada pozivatelj — ne u repozitorij.
 *
 * Sto se snima: kronologija svake snimke izlaza (kako je slaze
 * /prosli-tank?snimka=) i svakog punog tanka (prozori danasnjeg vina do
 * trenutka zapisa). Trenutak zapisa ide u datoteku, pa usporedba gleda isti
 * prozor i kad je podrum u medjuvremenu radio.
 *
 * Sto usporedba tvrdi: isti dogadaji (id) i svi stupci osim `detalji` znak za
 * znak isti. `detalji` moraju biti NADSKUP starih — svaki stari par
 * {label, value} postoji i dalje. Jedina dopustena promjena vrijednosti je redak
 * kala/taloga, koji dobiva postotak; takvi se ispisu poimence.
 *
 * `poveznica`: postojeca mora ostati ista. Nova smije doci samo na redak
 * izlaza (poveznica na evidenciju vina koje je izaslo) i ispisuje se poimence.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { citajUlazneCine, vinoUTanku } from "../lib/identitet-vina";
import { podrijetloTanka } from "../lib/berba-model";
import { granicaVina } from "../lib/granica-vina";
import { dogadajiVina, prozoriVina } from "../lib/kronologija-vina";
import type { Dogadaj } from "../app/tankovi/[id]/kronologija";

type Snimak = { sada: string; rezultati: Record<string, Dogadaj[]> };

async function slozi(sada: Date): Promise<Record<string, Dogadaj[]>> {
  const sviTankovi = await prisma.tank.findMany({ select: { id: true, broj: true }, orderBy: { broj: "asc" } });
  const brojTanka = new Map(sviTankovi.map((t) => [t.id, t.broj]));
  const knjiga = await citajUlazneCine(prisma, sviTankovi.map((t) => t.id));
  const sorte = new Map(
    (await prisma.berba.findMany({ select: { id: true, nazivSorte: true } })).map((b) => [b.id, b.nazivSorte] as const)
  );
  const out: Record<string, Dogadaj[]> = {};

  // Snimke izlaza, istim redom racuna kao app/prosli-tank/vino-iz-snimke.tsx.
  const snimke = await prisma.snimkaVina.findMany({
    where: { izlazVinaId: { not: null }, dogodenoAt: { lte: sada } },
    orderBy: { dogodenoAt: "asc" },
    select: { id: true, tankId: true, dogodenoAt: true },
  });
  for (const s of snimke) {
    const trenutak = new Date(s.dogodenoAt.getTime() - 1);
    const pod = await podrijetloTanka(prisma, s.tankId, { doTrenutka: trenutak });
    const vino = vinoUTanku(knjiga.cini, sorte, s.tankId, trenutak.getTime(), {}, [], pod.ukupnoL);
    const { prozori } = await prozoriVina(prisma, { tankId: s.tankId, trenutak, doAt: s.dogodenoAt, vino });
    out[`snimka ${s.id} (T${brojTanka.get(s.tankId)})`] = await dogadajiVina(prisma, {
      prozori,
      tankIzlazaId: s.tankId,
      brojTanka: brojTanka as Map<string, number>,
      trenutnaSnimkaId: s.id,
    });
  }

  // Puni tankovi: prozori danasnjeg vina do trenutka zapisa. Prazan tank se
  // ne zove — isto pravilo kao na stranici tanka.
  for (const t of sviTankovi) {
    const g = await granicaVina(prisma, t.id, { doTrenutka: sada });
    if (g.razlog === "PRAZAN") continue;
    const pod = await podrijetloTanka(prisma, t.id, { doTrenutka: sada });
    const vino = vinoUTanku(knjiga.cini, sorte, t.id, sada.getTime(), {}, [], pod.ukupnoL);
    const { prozori } = await prozoriVina(prisma, { tankId: t.id, trenutak: sada, doAt: sada, vino });
    out[`tank T${t.broj}`] = await dogadajiVina(prisma, {
      prozori,
      tankIzlazaId: t.id,
      brojTanka: brojTanka as Map<string, number>,
      trenutnaSnimkaId: null,
    });
  }

  return out;
}

/** Sve osim detalja i poveznice — poveznica se provjerava zasebno. */
const bezDetalja = (d: Dogadaj) => {
  const { detalji: _d, poveznica: _p, ...ostalo } = d;
  void _d;
  void _p;
  return JSON.stringify(ostalo);
};

/** Redak kala/taloga: "12 L — objasnjenje" postaje "12 L (1,2 %) — objasnjenje". */
function jeKaloSPostotkom(staro: string, novo: string): boolean {
  const m = staro.match(/^(.+? L) — (.+)$/);
  if (!m) return false;
  return novo.startsWith(`${m[1]} (`) && novo.includes(`) — ${m[2]}`);
}

async function main() {
  const [nacin, datoteka] = process.argv.slice(2);
  if (!datoteka || (nacin !== "zapisi" && nacin !== "usporedi")) {
    console.log("nacin: zapisi <datoteka.json> | usporedi <datoteka.json>");
    process.exitCode = 1;
    return;
  }

  if (nacin === "zapisi") {
    const sada = new Date();
    const rezultati = await slozi(sada);
    const snimak: Snimak = { sada: sada.toISOString(), rezultati };
    writeFileSync(datoteka, JSON.stringify(snimak));
    const ukupno = Object.values(rezultati).reduce((z, x) => z + x.length, 0);
    console.log(`zapisano: ${Object.keys(rezultati).length} kronologija, ${ukupno} dogadaja, trenutak ${snimak.sada}`);
    return;
  }

  const staro: Snimak = JSON.parse(readFileSync(datoteka, "utf8"));
  const novo = await slozi(new Date(staro.sada));

  let palo = 0;
  let dogadaja = 0;
  const dodano = new Map<string, number>();
  const kalo: string[] = [];
  const poveznice: string[] = [];

  for (const [kljuc, stari] of Object.entries(staro.rezultati)) {
    const novi = novo[kljuc];
    if (!novi) {
      palo++;
      console.log(`  PALO ${kljuc}: nema ga u novom racunu`);
      continue;
    }
    const idStari = stari.map((d) => d.id).join(",");
    const idNovi = novi.map((d) => d.id).join(",");
    if (idStari !== idNovi) {
      palo++;
      console.log(`  PALO ${kljuc}: drukciji dogadaji ili redoslijed (${stari.length} -> ${novi.length})`);
      continue;
    }
    for (let i = 0; i < stari.length; i++) {
      dogadaja++;
      const a = stari[i];
      const b = novi[i];
      // Poveznica: postojeca mora ostati ista; nova smije doci samo na izlaz.
      const pa = JSON.stringify(a.poveznica ?? null);
      const pb = JSON.stringify(b.poveznica ?? null);
      if (pa !== pb) {
        if (pa === "null" && a.vrsta === "IZLAZ" && b.poveznica) {
          poveznice.push(`${kljuc} ${a.id}: ${b.poveznica.href}`);
        } else {
          palo++;
          console.log(`  PALO ${kljuc} ${a.id}: poveznica ${pa} -> ${pb}`);
        }
      }
      if (bezDetalja(a) !== bezDetalja(b)) {
        palo++;
        console.log(`  PALO ${kljuc} ${a.id}: promijenjen stupac izvan detalja`);
        continue;
      }
      const detaljiA = a.detalji ?? [];
      const detaljiB = b.detalji ?? [];
      for (const r of detaljiA) {
        if (detaljiB.some((x) => x.label === r.label && x.value === r.value)) continue;
        const istiLabel = detaljiB.find((x) => x.label === r.label && jeKaloSPostotkom(r.value, x.value));
        if (istiLabel) {
          kalo.push(`${kljuc} ${a.id}: "${r.label}" ${r.value} -> ${istiLabel.value}`);
          continue;
        }
        palo++;
        console.log(`  PALO ${kljuc} ${a.id}: nestao redak detalja "${r.label}: ${r.value}"`);
      }
      for (const r of detaljiB) {
        if (detaljiA.some((x) => x.label === r.label)) continue;
        const k = `${a.vrsta} · ${r.label.trim()}`;
        dodano.set(k, (dodano.get(k) ?? 0) + 1);
      }
    }
  }
  for (const kljuc of Object.keys(novo)) {
    if (!staro.rezultati[kljuc]) console.log(`  (novo u racunu, nije bilo u snimku: ${kljuc})`);
  }

  console.log(`\nkronologija ${Object.keys(staro.rezultati).length}, dogadaja ${dogadaja}`);
  console.log("dodani retci detalja (vrsta · oznaka: broj dogadaja):");
  for (const [k, v] of [...dodano].sort()) console.log(`  ${k}: ${v}`);
  console.log(`izlaz dobio poveznicu na snimku: ${poveznice.length}`);
  for (const p of poveznice) console.log(`  ${p}`);
  console.log(`redak kala dobio postotak: ${kalo.length}`);
  for (const k of kalo) console.log(`  ${k}`);
  console.log(`\npalo: ${palo}`);
  if (palo > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
