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
