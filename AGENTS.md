<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Arhiviranje SELI podatke — čitač koji to ne zna, laže

Svaki novi čitač koji traži **radnje ili mjerenja po tanku** mora čitati i
arhivske tablice: `ArhivaVinaMjerenje` i `ArhivaVinaRadnja`, spojene preko
`ArhivaVina` (po `tankId`, uz `brojTanka` kao rezervu).

**Arhiviranje ne kopira nego SELI.** `Mjerenje` i `Radnja` su prazne za svaku
posudu koja je u međuvremenu arhivirana — a u stablima porijekla takve su
gotovo sve, jer je vino iz njih otišlo dalje.

Dogodilo se 14.09.2026.: detektor „rupa u evidenciji" na stranici tanka
prijavio je 36 rupa, **od kojih su sve bile lažne**. T3 je bio označen kao
83 dana bez ijednog zapisa, a imao je šest mjerenja u tom prozoru — sva u
`ArhivaVinaMjerenje`. Podatak je postojao, čitač ga nije gledao.

- `ArhivaVinaRadnja` **nema `jeKvasac`** i ne smije ga dobiti naknadnim
  spajanjem na katalog: gašenje oznake unatrag mijenjalo bi povijest
  fermentacije. Arhivska radnja ide u dodatke i radnje, nikad u kvasce.
- `ArhivaVinaRadnja` nema `dogodenoAt` nego samo `createdAt`.
- Ista radnja zna postojati dvaput — živa `VinoRadnja` i arhivska kopija.
  Deduplicira se po `izvornaRadnjaId`.
- Arhivski izvor ide u **potpis funkcije kao obavezan argument**, ne kao
  opcijski: tako ga sljedeći pozivatelj ne može prešutjeti.

# Skriptirane izmjene .tsx datoteka

Kad se `.tsx` mijenja perlom, sedom ili bilo kojom skriptom, **nakon izmjene
grepaj po izmijenjenim datotekama**:

```
ARRAY(0x    HASH(0x    CODE(0x    [object Object]
```

Takav ispis završi u JSX-u kao **ispravan tekstualni čvor**, pa ga ni `tsc` ni
`npm run build` ne prijave — vidi se tek na ekranu, kod korisnika.

Dogodilo se 11.09.2026.: perl `join("\n", \@niz)` dobio je referencu umjesto
polja i u zaglavlje stranice tanka upisao doslovno `ARRAY(0xa0003a308)`. Otišlo
je u produkciju i ondje stajalo dok ga vlasnik nije prijavio.

- u perlu `join($nl, @niz)`, NIKAD `join($nl, \@niz)`;
- ako zamjena ne nađe uzorak, skripta mora `die`, a ne tiho upisati datoteku;
- `git diff` se čita očima prije commita;
- **"tsc bez novih grešaka" i "build prošao" nisu dokaz da je JSX sadržajno
  ispravan** — samo da se prevodi.

# Arhivira se VINO, ne tank — odluke vlasnika (29.09.2026.)

Vino ide u arhivu kad ga u podrumu više nema: pretočeno do kraja u kupažu,
napunjeno u boce ili prodano. Preseljenje u praznu posudu NIJE kraj vina.

- **Primatelj kupaže se ne arhivira.** Vino u koje je doliveno nije otišlo iz
  podruma; ono je kućica u stablu (rodni čin). Prag od 20 % odlučuje rađa li se
  novo vino, a arhiva ovisi samo o tome je li IZVOR ostao prazan.
- **Razdvojena kupaža** arhivira se samo ako NIJEDAN dio nije preživio. Dio
  koji je otišao u praznu posudu kao jedini izvor znači da vino živi dalje.
- **Preseljenje u više posuda:** poveznica nudi SVE današnje lokacije, ne jednu.

**Dvije razine arhive:**

1. **Sortno vino napunjeno u boce ili prodano** — puna evidencija: kvasci s
   postotkom, zadaci, miješanja, kronologija, parametri, graf. Čita snimku +
   žive `Radnja` i `Zadatak`, koji od 11.09.2026. preživljavaju pražnjenje.
2. **Komponenta koja je otišla u cuvée** — čita SAMO snimku. Povijest te
   komponente stoji na stablu cuvéea, klikom na kućicu.

**Snimka u trenutku kad vino napušta posudu:**

- NOVA tablica, aditivna migracija. **Ne stupci na `ArhivaVinaRadnja`**: ondje
  je 156 od 254 retka tuđe vino (kopirano bez granice), a nullable stupci dali
  bi tri stanja koja se ne mogu razlikovati.
- Nosi: vrijednosti monitora po polju, `VinoRadnja` retke s `udio` i
  `jeKvasac`, litre, ime, sortu.
- Mora nastati PRIJE `ocistiVinoRadnje` (`lib/prazni-tank.ts`), u istoj
  transakciji: `VinoRadnja` je jedini točan izvor udjela kvasca, a odigravanje
  knjige griješi.

**Ponderirani prosjek kod kupaže ostaje nepromijenjen.**

**Staro se ne spašava:** 9 izlaza prije faze F, 68 arhivskih zadataka i 6
izlaza koje knjiga ne vidi ostaju kakvi jesu.
