/**
 * Provjera invarijanti zaokruzivanja u lib/filtracija.ts.
 *
 * Pokretanje:  npm run test:filtracija
 *
 * Zasto postoji: filtracija racuna u cijelim mililitrima, a u bazu pise u
 * litrama. Ako se zaokruzivanje pokvari, tank i njegov blend pocnu govoriti
 * razlicite brojke — tiho, bez ijedne greske. Ovaj test to hvata.
 *
 * Ne treba bazu ni mrezu; radi samo nad cistim funkcijama.
 */

import {
  podijeliMl,
  postotciIzMl,
  uMl,
  uLitre,
} from "../lib/filtracija";

let pao = 0;
let proslo = 0;

function tvrdi(uvjet: boolean, poruka: string) {
  if (uvjet) {
    proslo++;
    return;
  }

  pao++;
  if (pao <= 10) console.log("  PAO:", poruka);
}

function skupina(naziv: string, tijelo: () => void) {
  const prijePalo = pao;
  tijelo();
  const status = pao === prijePalo ? "OK" : "PAO";
  console.log(`[${status}] ${naziv}`);
}

// ---------------------------------------------------------------------------

skupina("podijeliMl: zbroj dijelova je tocno ukupnoMl", () => {
  for (let i = 0; i < 200_000; i++) {
    const n = 1 + Math.floor(Math.random() * 8);
    const tezine = Array.from({ length: n }, () => Math.random() * 1000);
    const ukupno = Math.floor(Math.random() * 5_000_000) + 1; // do 5000 L

    const dijelovi = podijeliMl(tezine, ukupno);
    const zbroj = dijelovi.reduce((s, v) => s + v, 0);

    tvrdi(zbroj === ukupno, `zbroj=${zbroj} ukupno=${ukupno}`);
    tvrdi(
      dijelovi.every((d) => Number.isInteger(d) && d >= 0),
      "dijelovi nisu nenegativni cijeli brojevi"
    );
  }
});

skupina("podijeliMl: rubni slucajevi", () => {
  tvrdi(podijeliMl([], 1000).length === 0, "prazne tezine");
  tvrdi(podijeliMl([1, 1, 1], 0).every((d) => d === 0), "ukupno 0");
  tvrdi(podijeliMl([0, 0], 500).every((d) => d === 0), "sve tezine 0");
  tvrdi(
    podijeliMl([1, 1, 1], 100).reduce((s, v) => s + v, 0) === 100,
    "tri trecine od 100 ml"
  );
  tvrdi(
    podijeliMl([999_999, 1], 100).reduce((s, v) => s + v, 0) === 100,
    "komponenta u tragovima ne odnese ni ne izgubi ml"
  );
  tvrdi(
    podijeliMl([1, 1], 1).reduce((s, v) => s + v, 0) === 1,
    "jedan jedini ml na dvije komponente"
  );
});

skupina("postotciIzMl: zbroj postotaka je tocno 100.00", () => {
  for (let i = 0; i < 100_000; i++) {
    const n = 1 + Math.floor(Math.random() * 8);
    const ml = Array.from(
      { length: n },
      () => Math.floor(Math.random() * 1_000_000) + 1
    );

    const postotci = postotciIzMl(ml);
    const zbrojStotinki = postotci.reduce((s, v) => s + Math.round(v * 100), 0);

    tvrdi(zbrojStotinki === 10_000, `zbroj=${zbrojStotinki / 100} %`);
  }
});

skupina("uMl / uLitre: povratak je egzaktan za cijele mililitre", () => {
  for (let i = 0; i < 200_000; i++) {
    const ml = Math.floor(Math.random() * 20_000_000); // do 20 000 L
    tvrdi(uMl(uLitre(ml)) === ml, `ml=${ml} -> ${uMl(uLitre(ml))}`);
  }
});

skupina("ciljni tank: blend u ml == kolicina u tanku u ml", () => {
  for (let i = 0; i < 100_000; i++) {
    const ciljPrijeMl = Math.floor(Math.random() * 3_000_000);
    const ulazMl = Math.floor(Math.random() * 3_000_000) + 1;
    const izvorUkupnoMl = ulazMl + Math.floor(Math.random() * 3_000_000);

    const brojIzvora = 1 + Math.floor(Math.random() * 5);

    // blend izvornog tanka pokriva cijelu njegovu kolicinu
    const izvorBlend = podijeliMl(
      Array.from({ length: brojIzvora }, () => Math.random() * 100),
      izvorUkupnoMl
    );

    // dio koji odlazi u ciljni tank
    const odlazi = podijeliMl(izvorBlend, ulazMl);
    const blendCilja = ciljPrijeMl > 0 ? [ciljPrijeMl] : [];

    const ukupnoBlend =
      blendCilja.reduce((s, v) => s + v, 0) +
      odlazi.reduce((s, v) => s + v, 0);

    tvrdi(
      ukupnoBlend === ciljPrijeMl + ulazMl,
      `blend=${ukupnoBlend} tank=${ciljPrijeMl + ulazMl}`
    );
  }
});

skupina("izvorni tank: ono sto ode + ono sto ostane == ono sto je bilo", () => {
  for (let i = 0; i < 100_000; i++) {
    const ukupnoPrijeMl = Math.floor(Math.random() * 5_000_000) + 1;
    const izlazMl = 1 + Math.floor(Math.random() * ukupnoPrijeMl);
    const ostatakMl = ukupnoPrijeMl - izlazMl;

    const brojIzvora = 1 + Math.floor(Math.random() * 5);
    const blend = podijeliMl(
      Array.from({ length: brojIzvora }, () => Math.random() * 100),
      ukupnoPrijeMl
    );

    const odlazi = podijeliMl(blend, izlazMl).reduce((s, v) => s + v, 0);
    const ostaje = podijeliMl(blend, ostatakMl).reduce((s, v) => s + v, 0);

    tvrdi(
      odlazi === izlazMl && ostaje === ostatakMl,
      `odlazi=${odlazi}/${izlazMl} ostaje=${ostaje}/${ostatakMl}`
    );
  }
});

// ---------------------------------------------------------------------------

console.log(`\nProslo: ${proslo}   Palo: ${pao}`);

if (pao > 0) {
  console.log("\nINVARIJANTA ZAOKRUZIVANJA JE PALA — ne pushaj ovo.");
  process.exit(1);
}

console.log("Sve invarijante drze.");
