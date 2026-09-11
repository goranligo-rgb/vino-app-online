<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
