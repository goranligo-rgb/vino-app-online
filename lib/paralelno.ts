/**
 * Pokretanje vise citanja ODJEDNOM, ali s gornjom granicom.
 *
 * ZASTO POSTOJI: Supabase pooler u session modu drzi `pool_size: 15`, i taj je
 * budzet ZAJEDNICKI za produkciju, lokalni dev i svaku skriptu. Kad se prekoraci,
 * baza ne usporava nego odbija: `EMAXCONNSESSION`, a stranica vrati 500.
 * Izmjereno 23.08.2026 — obican `Promise.all` nad sedam upita stranice, uz
 * jos jedan proces na istoj bazi, dovoljan je da se granica probije.
 *
 * `Promise.all` je zato pogresan alat cim broj upita raste s podacima (blend s
 * dvadeset sastavnica poslao bi dvadeset upita u istoj milisekundi). Ovdje se
 * pusta najvise `sirina` odjednom; cim se jedan vrati, krece sljedeci.
 *
 * Redoslijed rezultata je isti kao redoslijed zadataka — pozivatelji se na to
 * oslanjaju (npr. sastavnice blenda poredane po kolicini).
 *
 * ZADANA SIRINA 4: mjereno na stranici tanka, cetiri usporedna citanja daju
 * gotovo cijelu dobit u odnosu na sekvencijalno, a ostavljaju vecinu budzeta
 * veza slobodnom za ostatak aplikacije.
 */
export async function uValovima<T>(
  zadaci: Array<() => Promise<T>>,
  sirina = 4
): Promise<T[]> {
  if (zadaci.length === 0) return [];
  if (zadaci.length === 1) return [await zadaci[0]()];

  const rezultati = new Array<T>(zadaci.length);
  let sljedeci = 0;

  async function radnik() {
    for (;;) {
      const i = sljedeci++;
      if (i >= zadaci.length) return;
      rezultati[i] = await zadaci[i]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(sirina, zadaci.length) }, () => radnik())
  );

  return rezultati;
}
