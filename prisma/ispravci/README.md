# Ručni ispravci podataka

**Ovo nisu migracije.** Ovdje ne stoji ništa što mijenja shemu baze —
za to služi `prisma/migrations/`.

Ovdje stoje **jednokratni ispravci podataka**: SQL koji je jednom, na točno
određen datum, ispravio pogrešno unesene vrijednosti u produkcijskoj bazi.
Svaki od njih je već izvršen. Datoteke su ovdje kao **trag**, da se kasnije
može odgovoriti na pitanje „tko je i zašto promijenio ovaj redak", a ne kao
nešto što se pokreće.

## Pravila

- **Ne pokreći ih ponovno.** Nisu pisani da budu idempotentni i nemaju
  nikakvu ulogu u postavljanju nove baze. Ako ti se čini da neki treba
  ponoviti, gotovo sigurno ti zapravo treba novi ispravak.
- **Ne briši ih** ni kad zapisi koje su dirali odu iz baze. Trag vrijedi i
  onda, pogotovo onda.
- **Jedna datoteka = jedan zahvat**, imenovana `YYYYMMDD_kratki-opis.sql`.
- U zaglavlju svake datoteke stoji: što je dirano, koji zapisi, zašto,
  kada je izvršeno i koje su provjere prošle prije i poslije.
- Zahvat se piše u transakciji i s kočnicom koja poništava sve ako broj
  pogođenih redaka nije točno onaj koji se očekivao.

## Zašto uopće postoji ova mapa

Podaci o berbi se u aplikaciji smatraju knjigom koja se ne prepravlja —
kretanje vina se ne mijenja unatrag. Jedina dopuštena iznimka je ispravak
greške pri unosu, i model `Berba` je za nju predviđen: `ispravljenoAt`,
`ispravioKorisnikId` i `razlogIspravka` stoje na svakom takvom retku. Ova
mapa je druga polovica te iste evidencije — u bazi piše *da* je redak
ispravljen, a ovdje piše *čime*.
