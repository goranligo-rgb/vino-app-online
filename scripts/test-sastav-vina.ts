/**
 * Provjera lib/sastav-vina.ts — sastav vina za prikaz (prijenosi sazeti).
 *
 * Pokretanje:  npm run test:sastav
 *
 * SIGURNOST: iskljucivo cita (SELECT), nista ne upisuje.
 *
 * Nad svim zivim stablima i ispod svih snimki izlaza tvrdi:
 *   1. udio svake berbe u vinu jednak je punom stablu;
 *   2. zbroj litara prve razine jednak je punom stablu (odljev se ne mijenja);
 *   3. nijedna stavka nije prijenos — rezultat je fiksna tocka;
 *   4. svaka stavka iz posude ima adresu koju /prosli-tank nalazi
 *      (`nadjiKucicu` s korijenom), s istom sastavnicom;
 *   5. POKRIVENOST POVIJESTI: prozor svakog cvora punog stabla stoji ili u
 *      prozorima vina korijena (kronologija, graf, popis mjerenja) ili u
 *      prozorima neke stavke (povijest stavke) — nista ne nestaje;
 *   6. T12 je jedna stavka: Graševina, partija 020/2026, 4.150 L, 100 %.
 */

import { prisma } from "../lib/prisma";
import { citajUlazneCine, vinoUTanku, type VinoCvor, type Sastavnica } from "../lib/identitet-vina";
import { podrijetloTanka } from "../lib/berba-model";
import { granicaVina } from "../lib/granica-vina";
import { nadjiKucicu } from "../lib/prosli-tank";
import { prozoriVina } from "../lib/kronologija-vina";
import { jePrijenos, nazivStavke, sastavVina, type StavkaVina } from "../lib/sastav-vina";

let proslo = 0;
let palo = 0;

function tvrdi(uvjet: boolean, opis: string, detalj?: string) {
  if (uvjet) {
    proslo++;
    console.log(`  ok   ${opis}`);
    return;
  }
  palo++;
  console.log(`  PALO ${opis}${detalj ? ` — ${detalj}` : ""}`);
}

type Spoj = Extract<VinoCvor, { vrsta: "spoj" }>;

function udjeliBerbi(v: VinoCvor, u = 1, out = new Map<string, number>()) {
  if (v.vrsta === "partija") out.set(v.berbaId, (out.get(v.berbaId) ?? 0) + u);
  else if (v.vrsta === "spoj") for (const s of v.sastavnice) udjeliBerbi(s.vino, u * s.udio, out);
  return out;
}
function udjeliStavki(x: StavkaVina[], u = 1, out = new Map<string, number>()) {
  for (const st of x) {
    const v = st.sastavnica.vino;
    if (v.vrsta === "partija") out.set(v.berbaId, (out.get(v.berbaId) ?? 0) + u * st.udio);
    else udjeliStavki(st.djeca, u * st.udio, out);
  }
  return out;
}
function sveStavke(x: StavkaVina[], out: StavkaVina[] = []): StavkaVina[] {
  for (const s of x) { out.push(s); sveStavke(s.djeca, out); }
  return out;
}
const kljucProzora = (tankId: string, od: Date, doMs: number) => `${tankId}|${od.getTime()}|${doMs}`;

async function main() {
  const tankovi = await prisma.tank.findMany({ select: { id: true, broj: true }, orderBy: { broj: "asc" } });
  const broj = new Map(tankovi.map((t) => [t.id, t.broj]));
  const knjiga = await citajUlazneCine(prisma, tankovi.map((t) => t.id));
  const berbe = await prisma.berba.findMany({ select: { id: true, nazivSorte: true, oznakaBerbe: true } });
  const sorte = new Map(berbe.map((b) => [b.id, b.nazivSorte] as const));
  const oznake = new Map(berbe.map((b) => [b.id, b.oznakaBerbe] as const));

  let stabala = 0, stavki = 0;
  const udjeliKrivo: string[] = [], litreKrivo: string[] = [], prijenosUStavci: string[] = [], adresaKrivo: string[] = [];
  const nepokriveno: string[] = [];
  let cvorova = 0;

  const provjeri = async (oznaka: string, v: VinoCvor, korijen: VinoCvor | null, prozoriKorijena: Array<{ tankId: string; od: Date | null; do: Date }>) => {
    if (v.vrsta !== "spoj") return;
    stabala++;
    const st = sastavVina(v);
    const sve = sveStavke(st);
    stavki += sve.length;

    // 1. udjeli berbi
    const a = udjeliBerbi(v), b = udjeliStavki(st);
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      if (Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0)) > 1e-9) { udjeliKrivo.push(`${oznaka} berba ${k}`); break; }
    }
    // 2. litre prve razine
    const lp = v.sastavnice.reduce((z, s) => z + s.litre, 0), ls = st.reduce((z, s) => z + s.litre, 0);
    if (Math.abs(lp - ls) > 1e-6) litreKrivo.push(`${oznaka}: ${lp} -> ${ls}`);

    // roditelj svake sastavnice u punom stablu
    const roditelj = new Map<Sastavnica, Spoj>();
    const hodR = (c: VinoCvor) => { if (c.vrsta !== "spoj") return; for (const s of c.sastavnice) { roditelj.set(s, c); hodR(s.vino); } };
    hodR(v);
    // 3. fiksna tocka
    for (const s of sve) {
      const r = roditelj.get(s.sastavnica);
      if (r && jePrijenos(r, s.sastavnica)) { prijenosUStavci.push(oznaka); break; }
    }
    // 4. adrese
    if (korijen) {
      for (const s of sve) {
        const vv = s.sastavnica.vino;
        if (vv.vrsta === "partija") continue;
        const n = nadjiKucicu(knjiga.cini, sorte, { korijen, izTankId: vv.tankId, kljucCina: s.sastavnica.kljucCina });
        if (!n || n.kroz !== "korijen" || n.roditeljTankId !== s.roditeljTankId) { adresaKrivo.push(`${oznaka} T${broj.get(vv.tankId)} ${s.sastavnica.kljucCina}`); }
      }
    }
    // 5. pokrivenost povijesti: svaki cvor punog stabla (osim korijena) i njegov prozor
    const pokriveno = new Set<string>();
    for (const s of sve) for (const p of s.prozori) pokriveno.add(kljucProzora(p.tankId, p.od, p.do.getTime()));
    const hodC = (c: VinoCvor, doMs: number, jeKorijen: boolean) => {
      if (c.vrsta !== "spoj") return;
      if (!jeKorijen) {
        cvorova++;
        const k = kljucProzora(c.tankId, c.kada, doMs);
        const uProzoruKorijena = prozoriKorijena.some((p) => p.tankId === c.tankId && p.do.getTime() === doMs);
        if (!pokriveno.has(k) && !uProzoruKorijena) nepokriveno.push(`${oznaka}: T${broj.get(c.tankId)} od ${c.kada.toISOString().slice(0, 16)} do ${new Date(doMs).toISOString().slice(0, 16)}`);
      }
      for (const s of c.sastavnice) hodC(s.vino, s.usloAt.getTime(), false);
    };
    hodC(v, Infinity, true);
  };

  console.log("\nZivi tankovi");
  const sada = new Date();
  let t12: StavkaVina[] = [];
  for (const t of tankovi) {
    const g = await granicaVina(prisma, t.id);
    if (g.razlog === "PRAZAN") continue;
    const pod = await podrijetloTanka(prisma, t.id);
    const v = vinoUTanku(knjiga.cini, sorte, t.id, sada.getTime(), {}, [], pod.ukupnoL);
    const { prozori } = await prozoriVina(prisma, { tankId: t.id, trenutak: sada, doAt: sada, vino: v });
    await provjeri(`T${t.broj}`, v, v, prozori);
    if (t.broj === 12) t12 = sastavVina(v);
  }

  console.log("Snimke izlaza");
  const snimke = await prisma.snimkaVina.findMany({ where: { izlazVinaId: { not: null } }, select: { tankId: true, dogodenoAt: true } });
  for (const sn of snimke) {
    const trenutak = new Date(sn.dogodenoAt.getTime() - 1);
    const pod = await podrijetloTanka(prisma, sn.tankId, { doTrenutka: trenutak });
    const v = vinoUTanku(knjiga.cini, sorte, sn.tankId, trenutak.getTime(), {}, [], pod.ukupnoL);
    const { prozori, zadnjiCvor } = await prozoriVina(prisma, { tankId: sn.tankId, trenutak, doAt: sn.dogodenoAt, vino: v });
    if (zadnjiCvor.vrsta === "spoj" && zadnjiCvor.sastavnice.length > 1) await provjeri(`snimka T${broj.get(sn.tankId)}`, zadnjiCvor, null, prozori);
  }

  console.log(`\n  stabala ${stabala}, stavki ${stavki}, cvorova ispod korijena ${cvorova}`);
  tvrdi(udjeliKrivo.length === 0, "udio svake berbe isti kao u punom stablu", udjeliKrivo.slice(0, 5).join("; "));
  tvrdi(litreKrivo.length === 0, "zbroj litara prve razine isti kao u punom stablu", litreKrivo.slice(0, 5).join("; "));
  tvrdi(prijenosUStavci.length === 0, "nijedna stavka nije prijenos (fiksna tocka)", prijenosUStavci.slice(0, 5).join("; "));
  tvrdi(adresaKrivo.length === 0, "svaka stavka iz posude ima adresu koju /prosli-tank nalazi", adresaKrivo.slice(0, 5).join("; "));
  tvrdi(nepokriveno.length === 0, "povijest svakog cvora stoji u prozorima vina ili u povijesti neke stavke", `${nepokriveno.length}: ${nepokriveno.slice(0, 8).join("; ")}`);

  console.log("\nT12");
  const s0 = t12[0];
  tvrdi(
    t12.length === 1 &&
      nazivStavke(s0.sastavnica, oznake) === "Graševina, partija 020/2026" &&
      Math.round(s0.litre) === 4150 &&
      Math.abs(s0.udio - 1) < 1e-9 &&
      Math.round(s0.kalo) === 50,
    "T12 = jedna stavka: Graševina, partija 020/2026, 4.150 L, 100 %, kalo 50 L",
    t12.map((s) => `${nazivStavke(s.sastavnica, oznake)} ${s.litre} L ${s.udio} kalo ${s.kalo}`).join("; ")
  );

  console.log(`\nproslo: ${proslo}, palo: ${palo}`);
  if (palo > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
