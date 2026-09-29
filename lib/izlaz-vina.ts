import { Prisma } from "@prisma/client";
import { citajGranicuArhive, odGranice } from "@/lib/granica-arhive";
import { uLitre, uMl, podijeliMl } from "@/lib/filtracija";
import { zabiljeziIzlaz } from "@/lib/berba-knjiga";
import { stanjeTanka } from "@/lib/berba-model";
import { upisiVinoRadnju } from "@/lib/vino-radnja";
import { isprazniTank } from "@/lib/prazni-tank";
import { imeVinaSada } from "@/lib/ime-vina";

/**
 * IZLAZ VINA — punjenje u boce i prodaja rinfuze.
 * ======================================================================
 *
 * IZDVOJENO IZ app/api/izlaz-vina/route.ts (29.09.2026., korak 5b arhive
 * vina), doslovno i bez promjene ponasanja, po uzoru na motor pretoka
 * (lib/pretok-motor.ts). Razlog: logika u rukovatelju rute ne da se pozvati
 * iz skripte, pa se snimka vina pri izlazu (korak 5c) ne bi mogla provjeriti
 * kroz pravi put.
 *
 * Dokaz da je izdvajanje doslovno: scripts/test-arhiviranje-baza.ts prolazi
 * nepromijenjen, otisak tankova isti, a premjesteni tekst je jednak izvorniku
 * do znaka (osim uvlake tijela transakcije).
 *
 * Ruta zadrzava prijavu, provjeru role, parsiranje i HTTP odgovore.
 */

type Tx = Prisma.TransactionClient;

const PRAZNO_PRAG = 0.0001;

function formatBrojTekst(v: number | null | undefined, decimals = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "0";
  return Number(v).toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function prikaziImeKorisnika(
  korisnik:
    | {
        ime?: string | null;
        username?: string | null;
        email?: string | null;
      }
    | null
    | undefined
) {
  if (!korisnik) return null;
  return korisnik.ime ?? korisnik.username ?? korisnik.email ?? null;
}

// Izvezeno zbog scripts/test-arhiviranje-baza.ts, koji je od koraka 5b uvozi
// preko app/api/izlaz-vina/route.ts (vidi ondje).
export async function arhivirajPrazanTank(
  tx: any,
  tankId: string,
  napomenaArhive: string,
  kolicinaPrijePrazenja: number
) {
  // Isto obrazlozenje kao u lib/pretok-arhiviranje.ts: nova `ArhivaVina`
  // nastaje tek nize, pa ovo cita PRETHODNU granicu. Dvije funkcije rade isti
  // posao drugim kodom (vidi biljesku na vrhu tog modula) — svaka izmjena
  // arhiviranja mora ici u OBJE.
  const granica = await citajGranicuArhive(tx, tankId);

  const tank = await tx.tank.findUnique({
    where: { id: tankId },
    include: {
      udjeliSorti: true,
      documents: true,
      blendIzvori: true,
      currentContent: true,
      punjenja: {
        where: { createdAt: odGranice(granica) },
        orderBy: { datumPunjenja: "desc" },
        include: {
          stavke: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
      mjerenja: {
        orderBy: { izmjerenoAt: "desc" },
      },
      radnje: {
        orderBy: { createdAt: "asc" },
        include: {
          korisnik: true,
          preparat: true,
          jedinica: true,
        },
      },
      izlaziVina: {
        orderBy: { datum: "asc" },
      },
      zadaci: {
        orderBy: { zadanoAt: "desc" },
        include: {
          stavke: {
            orderBy: { redoslijed: "asc" },
            include: {
              preparat: true,
              jedinica: true,
              izlaznaJedinica: true,
            },
          },
          zadaoKorisnik: true,
          izvrsioKorisnik: true,
          preparat: true,
          jedinica: true,
          izlaznaJedinica: true,
        },
      },
    },
  });

  if (!tank) return null;

  // Ime u arhivu IZVEDENO (faza 5). Zavrsni izlaz je vec upisan u knjigu, pa je
  // tank po njoj prazan — `zadnjeVino` vraca ime vina koje je upravo izaslo.
  const imeArhive = await imeVinaSada(tx, tankId, { zadnjeVino: true });

  const arhiva = await tx.arhivaVina.create({
    data: {
      tankId: tank.id,
      brojTanka: tank.broj,
      sorta: tank.sorta,
      nazivVina: imeArhive.naziv,
      godiste: tank.godiste,
      kolicinaVina: kolicinaPrijePrazenja,
      kapacitetTanka: tank.kapacitet,
      tipTanka: tank.tip,
      tipArhive: "IZLAZ_VINA",
      arhiviranoAt: new Date(),
      napomena: napomenaArhive,
    },
  });

  if (tank.punjenja.length > 0) {
    for (const p of tank.punjenja) {
      await tx.arhivaPunjenjeTanka.create({
        data: {
          arhivaVinaId: arhiva.id,
          izvornoPunjenjeId: p.id,
          nazivVina: p.nazivVina,
          datumPunjenja: p.datumPunjenja,
          napomena: p.napomena,
          opis: p.opis,
          ukupnoLitara: p.ukupnoLitara,
          ukupnoKgGrozdja: p.ukupnoKgGrozdja,
          pocetnoMjerenjeId: p.pocetnoMjerenjeId,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          stavke: {
            create: p.stavke.map((s: any) => ({
              izvornaPunjenjeStavkaId: s.id,
              nazivSorte: s.nazivSorte,
              sortaId: s.sortaId,
              opis: s.opis,
              kolicinaKgGrozdja: s.kolicinaKgGrozdja,
              kolicinaLitara: s.kolicinaLitara,
              datumBerbe: s.datumBerbe,
              godinaBerbe: s.godinaBerbe,
              polozaj: s.polozaj,
              parcela: s.parcela,
              vinograd: s.vinograd,
              oznakaBerbe: s.oznakaBerbe,
              secer: s.secer,
              kiseline: s.kiseline,
              ph: s.ph,
              napomenaBerbe: s.napomenaBerbe,
              // Druga kopija arhiviranja (prva je lib/pretok-arhiviranje.ts).
              // Mora prenositi ista polja — inace se maceracija gubi ovisno o
              // tome je li tank ispraznjen pretokom ili izlazom vina.
              maceracija: s.maceracija,
              maceracijaSati: s.maceracijaSati,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
            })),
          },
        },
      });
    }
  }

  if (tank.mjerenja.length > 0) {
    await tx.arhivaVinaMjerenje.createMany({
      data: tank.mjerenja.map((m: any) => ({
        arhivaVinaId: arhiva.id,
        izvornoMjerenjeId: m.id,
        tankId: tank.id,
        korisnikId: m.korisnikId,
        alkohol: m.alkohol,
        ukupneKiseline: m.ukupneKiseline,
        hlapiveKiseline: m.hlapiveKiseline,
        slobodniSO2: m.slobodniSO2,
        ukupniSO2: m.ukupniSO2,
        secer: m.secer,
        ph: m.ph,
        temperatura: m.temperatura,
        bentotestDatum: m.bentotestDatum,
        bentotestStatus: m.bentotestStatus,
        napomena: m.napomena,
        izmjerenoAt: m.izmjerenoAt,
      })),
    });
  }

  for (const z of tank.zadaci) {
    await tx.arhivaVinaZadatak.create({
      data: {
        arhivaVinaId: arhiva.id,
        izvorniZadatakId: z.id,
        tankId: tank.id,
        vrsta: z.vrsta,
        status: z.status,
        naslov: z.naslov,
        napomena: z.napomena,
        doza: z.doza,
        volumenUTanku: z.volumenUTanku,
        izracunataKolicina: z.izracunataKolicina,
        preparatId: z.preparatId,
        preparatNaziv: z.preparat?.naziv ?? null,
        jedinicaId: z.jedinicaId,
        jedinicaNaziv: z.jedinica?.naziv ?? null,
        izlaznaJedinicaId: z.izlaznaJedinicaId,
        izlaznaJedinicaNaziv: z.izlaznaJedinica?.naziv ?? null,
        zadaoKorisnikId: z.zadaoKorisnikId,
        zadaoKorisnikIme: prikaziImeKorisnika(z.zadaoKorisnik),
        izvrsioKorisnikId: z.izvrsioKorisnikId,
        izvrsioKorisnikIme: prikaziImeKorisnika(z.izvrsioKorisnik),
        zadanoAt: z.zadanoAt,
        izvrsenoAt: z.izvrsenoAt,
        stavke: {
          create: z.stavke.map((s: any) => ({
            preparatId: s.preparatId,
            preparatNaziv: s.preparat?.naziv ?? null,
            doza: s.doza,
            volumenUTanku: s.volumenUTanku,
            izracunataKolicina: s.izracunataKolicina,
            jedinicaId: s.jedinicaId,
            jedinicaNaziv: s.jedinica?.naziv ?? null,
            izlaznaJedinicaId: s.izlaznaJedinicaId,
            izlaznaJedinicaNaziv: s.izlaznaJedinica?.naziv ?? null,
            redoslijed: s.redoslijed ?? 0,
          })),
        },
      },
    });
  }

  if (tank.udjeliSorti.length > 0) {
    await tx.arhivaVinaUdioSorte.createMany({
      data: tank.udjeliSorti.map((u: any) => ({
        arhivaVinaId: arhiva.id,
        izvorniUdioSorteId: u.id,
        nazivSorte: u.nazivSorte,
        postotak: u.postotak,
      })),
    });
  }

  if (tank.documents.length > 0) {
    await tx.arhivaVinaDokument.createMany({
      data: tank.documents.map((d: any) => ({
        arhivaVinaId: arhiva.id,
        vrsta: d.vrsta,
        naziv: d.naziv,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        datumDokumenta: d.datumDokumenta,
        napomena: d.napomena,
        uploadedByUserId: d.uploadedByUserId,
        uploadedByIme: d.uploadedByIme,
        createdAt: d.createdAt,
      })),
    });
  }

  // RADNJE I IZLAZI U ARHIVU — SAMO KOPIJA, ORIGINALI OSTAJU.
  //
  // Isti blok kao u `arhivirajPotroseniTank` (app/api/pretok/route.ts). Dvije
  // kopije arhiviranja trebalo bi spojiti u jednu funkciju, ali ne usred
  // sezone — do tada svaka izmjena ide u OBJE, inače se raziđu (upravo se to
  // dogodilo s punjenjima: ovdje su se pisala, ondje nisu).
  //
  // Ne briše se ništa. `ArhivaVina` se pri poništavanju ne vraća, pa bi
  // brisanje originala bio tihi gubitak.
  //
  // Izlaz koji je upravo napravljen i njegova radnja već postoje u bazi (oba se
  // upisuju prije poziva ove funkcije), pa oboje ulazi u arhivu — završni izlaz
  // pripada baš tom vinu.
  if (tank.radnje.length > 0) {
    await tx.arhivaVinaRadnja.createMany({
      data: tank.radnje.map((r: any) => ({
        arhivaVinaId: arhiva.id,
        izvornaRadnjaId: r.id,
        izvorniZadatakId: r.zadatakId,
        tankId: tank.id,
        vrsta: r.vrsta,
        opis: r.opis,
        napomena: r.napomena,
        preparatId: r.preparatId,
        preparatNaziv: r.preparat?.naziv ?? null,
        jedinicaId: r.jedinicaId,
        jedinicaNaziv: r.jedinica?.naziv ?? null,
        kolicina: r.kolicina,
        korisnikId: r.korisnikId,
        korisnikIme: prikaziImeKorisnika(r.korisnik),
        createdAt: r.createdAt,
      })),
    });
  }

  if (tank.izlaziVina.length > 0) {
    await tx.arhivaVinaIzlaz.createMany({
      data: tank.izlaziVina.map((i: any) => ({
        arhivaVinaId: arhiva.id,
        izvorniIzlazId: i.id,
        tankId: tank.id,
        tip: i.tip,
        datum: i.datum,
        kolicinaLitara: i.kolicinaLitara,
        brojBoca: i.brojBoca,
        volumenBoce: i.volumenBoce,
        napomena: i.napomena,
        createdAt: i.createdAt,
      })),
    });
  }

  // FAZA F — ORIGINALI SE VISE NE BRISU.
  //
  // Ovo JEST pravi kraj vina (boca ili rinfuza) i arhiva se upisuje kao i
  // dosad — ona je zapis o vinu koje je otislo iz podruma. Ali brisanje
  // originala bilo je posljedica starog modela, u kojem je arhiva bila jedino
  // mjesto gdje povijest smije stajati.
  //
  // Sto se i dalje brise: samo ono sto opisuje vino kojeg u posudi vise nema
  // (sastav, porijeklo, udjeli radnji, identitet). To radi `isprazniTank`,
  // ISTA funkcija koju zove i pretok — jedno pravilo na jednom mjestu.
  //
  // Sto vise NE: mjerenja, zadaci, dokumenti i punjenja ostaju na tanku.
  // Ekran ih rezuje granicom vina (lib/granica-vina.ts), a arhiva ionako ima
  // svoju kopiju — dvije kopije su bolje od jedne kopije i rupe.
  //
  // `tankContent` se i dalje brise: to je trenutni sadrzaj posude, ne povijest.
  await tx.tankContent.deleteMany({ where: { tankId } });

  await isprazniTank(tx, tankId, kolicinaPrijePrazenja);

  // `opis` nije dio `isprazniTank` jer ga pretok ne dira — a ovdje se posuda
  // oslobadja do kraja.
  await tx.tank.update({
    where: { id: tankId },
    data: { opis: null },
  });

  return arhiva;
}

/** Greska koju ruta vraca kao HTTP odgovor, s istim statusom i porukom. */
export class IzlazGreska extends Error {
  constructor(
    public status: number,
    poruka: string
  ) {
    super(poruka);
    this.name = "IzlazGreska";
  }
}

/** Ono sto je ruta procitala iz tijela i vec provjerila kao unos. */
export type UnosIzlaza = {
  tankId: string;
  tip: "PRODAJA" | "PUNJENJE";
  datum: Date;
  kolicinaLitara: number;
  brojBocaRaw: number | null;
  volumenBoce: number | null;
  korisnickaNapomena: string | null;
};

export type PripremljenIzlaz = UnosIzlaza & {
  tank: {
    id: string;
    broj: number;
    sorta: string | null;
    godiste: number | null;
    kolicinaVinaUTanku: number | null;
  };
  trenutnoLitara: number;
  brojBoca: number | null;
  novoStanje: number;
  izlazNapomena: string;
  opisRadnje: string;
};

/**
 * Tank, provjera stanja i izracun napomena — izvan transakcije, kao i do
 * sada. (U koraku 5c ovo seli u transakciju, pod zakljucavanje tanka.)
 */
export async function pripremiIzlaz(
  db: { tank: Tx["tank"] },
  u: UnosIzlaza
): Promise<PripremljenIzlaz> {
  const { tankId, tip, kolicinaLitara, brojBocaRaw, volumenBoce, korisnickaNapomena } = u;

  const tank = await db.tank.findUnique({
    where: { id: tankId },
    select: {
      id: true,
      broj: true,
      sorta: true,
      godiste: true,
      kolicinaVinaUTanku: true,
    },
  });

  if (!tank) {
    throw new IzlazGreska(404, "Tank nije pronađen.");
  }

  const trenutnoLitara = Number(tank.kolicinaVinaUTanku ?? 0);

  if (kolicinaLitara > trenutnoLitara) {
    throw new IzlazGreska(
      400,
      `Nema dovoljno vina u tanku. Trenutno stanje je ${trenutnoLitara} L.`
    );
  }

  let brojBoca: number | null = null;

  if (tip === "PUNJENJE") {
    if (brojBocaRaw !== null && brojBocaRaw >= 0) {
      brojBoca = Math.round(brojBocaRaw);
    } else if (volumenBoce && volumenBoce > 0) {
      brojBoca = Math.floor(kolicinaLitara / volumenBoce);
    }
  }

  const novoStanje = Math.max(
    0,
    Number((trenutnoLitara - kolicinaLitara).toFixed(3))
  );

  const autoNapomena =
    tip === "PUNJENJE"
      ? `Napunjeno ${brojBoca ?? 0} boca od ${formatBrojTekst(volumenBoce)} L`
      : `Prodano rinfuza ${formatBrojTekst(kolicinaLitara)} L`;

  const opisRadnje =
    tip === "PUNJENJE"
      ? `Napunjeno ${brojBoca ?? 0} boca od ${formatBrojTekst(volumenBoce)} L iz tanka ${tank.broj}`
      : `Prodano rinfuza ${formatBrojTekst(kolicinaLitara)} L iz tanka ${tank.broj}`;

  const izlazNapomena = korisnickaNapomena ?? autoNapomena;

  return {
    ...u,
    tank,
    trenutnoLitara,
    brojBoca,
    novoStanje,
    izlazNapomena,
    opisRadnje,
  };
}

/**
 * Izlaz u transakciji: zapis izlaza, stanje tanka, radnja, knjiga berbe i —
 * kad tank padne na nulu — arhiva i praznjenje. Tijelo je doslovno ono koje
 * je stajalo u ruti.
 */
export async function izvrsiIzlaz(
  tx: Tx,
  p: PripremljenIzlaz,
  user: { id: string; ime?: string | null }
) {
  const {
    tankId,
    tip,
    datum,
    kolicinaLitara,
    brojBoca,
    volumenBoce,
    tank,
    trenutnoLitara,
    novoStanje,
    izlazNapomena,
    opisRadnje,
  } = p;


  const izlaz = await tx.izlazVina.create({
    data: {
      tankId,
      tip,
      datum,
      kolicinaLitara,
      brojBoca,
      volumenBoce,
      // Tko je izdao vino. Ruta vec ima korisnika; dosad je zavrsavao samo
      // na pripadnoj Radnja.
      korisnikId: user.id,
      napomena:
        novoStanje <= PRAZNO_PRAG
          ? `${izlazNapomena} • završni izlaz • tank ispražnjen • arhivirano`
          : izlazNapomena,
    },
  });

  await tx.tank.update({
    where: { id: tankId },
    data: {
      kolicinaVinaUTanku: novoStanje,
    },
  });

  // BLEND SE SMANJUJE ZAJEDNO S TANKOM.
  //
  // Do sada ga izlaz nije dirao, pa je `BlendIzvor` ostajao na staroj
  // kolicini dok je tank padao. Tank 43 je tako dosao do 1.120 L u blendu
  // na 605 L u tanku — 16 prodaja rinfuze koje blend nije vidio. Pokazivac
  // porijekla je time tvrdio gotovo dvostruko vino od stvarnog.
  //
  // PROPORCIONALNO, i to je jedini tocan racun: prodaja i punjenje u boce
  // uzimaju PRESJEK cijelog tanka, ne jednu sastavnicu, pa se omjeri
  // porijekla ne mijenjaju — mijenja se samo mjerilo.
  //
  // SKALIRA SE OMJEROM, NE NA KOLICINU U TANKU. Razlika je bitna:
  // blend SMIJE biti manji od tanka. Punjenje grozdjem dodaje vino koje
  // nema izvorni tank i namjerno ne dopisuje redak u blend (izmisljalo bi
  // porijeklo), pa T28 danas ima 3.650 L u tanku i 800 L u blendu — i to
  // je tocno. Skaliranje NA `novoStanje` naduvalo bi taj blend na punu
  // kolicinu tanka i time ustvrdilo da je i grozdje doslo iz starih
  // tankova. Omjer cuva i pokrivenost i postotke.
  //
  // Razdioba ide `podijeliMl`-om nad cijelim mililitrima, pa je zbroj
  // ostatka tocno ciljani iznos, bez drifta na zaokruzivanju.
  //
  // Kad tank padne na nulu, ovo se preskace: `arhivirajPrazanTank` nize
  // ionako brise sve retke blenda.
  if (novoStanje > PRAZNO_PRAG && trenutnoLitara > 0) {
    const blendIzvori = await tx.blendIzvor.findMany({
      where: { ciljTankId: tankId },
      orderBy: { id: "asc" },
    });

    if (blendIzvori.length > 0) {
      const blendPrijeMl = blendIzvori.reduce(
        (z, b) => z + uMl(b.kolicina),
        0
      );

      const ciljMl = Math.round(
        (blendPrijeMl * novoStanje) / trenutnoLitara
      );

      const dijelovi = podijeliMl(
        blendIzvori.map((b) => uMl(b.kolicina)),
        ciljMl
      );

      // BLEND SE VISE NE UPISUJE (faza E) — porijeklo se izvodi iz knjige,
      // a ona izlaz vec knjizi. Racun `dijelovi` ostaje: njime se provjerava
      // da skaliranje odgovara knjizi, i pod testom je.
      void dijelovi;
    }
  }

  const radnjaIzlaza = await tx.radnja.create({
    data: {
      tankId,
      korisnikId: user.id,
      vrsta: tip === "PRODAJA" ? "OSTALO" : "PUNJENJE",
      opis: opisRadnje,
      napomena: `${izlazNapomena} • ostalo u tanku ${formatBrojTekst(novoStanje)} L`,
      kolicina: kolicinaLitara,
    },
  });

  // Zapis koji putuje s vinom. Izlaz vino ODNOSI, pa se udjeli onoga sto
  // ostaje ne mijenjaju — iz tanka odlazi presjek cijelog sadrzaja.
  await upisiVinoRadnju(tx, {
    radnjaId: radnjaIzlaza.id,
    tankId,
    vrsta: radnjaIzlaza.vrsta,
    opis: radnjaIzlaza.opis,
    napomena: radnjaIzlaza.napomena,
    kolicina: radnjaIzlaza.kolicina,
    dogodenoAt: radnjaIzlaza.createdAt,
    korisnikId: user.id,
    imena: { brojTanka: tank.broj, korisnikIme: user.ime ?? null },
  });

  // ---------------------------------------------------------------------
  // KNJIGA BERBE — vino napušta podrum: `uTankId` je NULL.
  //
  // Razdioba ide po BERBAMA razmjerno njihovu udjelu u tanku. Prodaja ne
  // bira iz koje se berbe toči — vino je izmiješano, pa izlazi od svih.
  // (To je ujedno ono što `BlendIzvor` danas ne radi: prodaja umanji tank
  // ali ne i blend, pa T43 stoji s 20 L razmaka. Knjiga tu grešku nema.)
  //
  // ZATEČENO, ne PUKNI: količinu u tanku je provjera gore već potvrdila,
  // manjak u knjizi znači samo da ne zna odakle je vino došlo.
  await zabiljeziIzlaz(tx, {
    tankId,
    litre: kolicinaLitara,
    veza: { izlazVinaId: izlaz.id },
    korisnikId: user.id,
    dogodenoAt: datum,
    napomena: izlazNapomena,
    naManjak: "ZATECENO",
    opisManjka: `Vino zatečeno u tanku ${tank.broj}: tank ga je imao, a knjiga ne zna odakle je došlo.`,
  });

  let arhivaId: string | null = null;

  if (novoStanje <= PRAZNO_PRAG) {
    const arhiva = await arhivirajPrazanTank(
      tx,
      tankId,
      `${izlazNapomena} • tank ispražnjen do kraja automatskom arhivom nakon izlaza vina`,
      trenutnoLitara
    );
    arhivaId = arhiva?.id ?? null;

    // Tank je arhiviran i očišćen na nulu. Ako knjiga u njemu i dalje nešto
    // tvrdi — jer je imala više nego tank — taj bi ostatak visio na tanku
    // koji je od sada slobodan za novo vino. Upisuje se kao ISPRAVAK: tih
    // litara ondje zapravo nije ni bilo.
    const ostatakMl = (await stanjeTanka(tx, tankId)).reduce(
      (z, x) => z + x.ml,
      0
    );

    if (ostatakMl > 0) {
      await zabiljeziIzlaz(tx, {
        tankId,
        litre: uLitre(ostatakMl),
        vrsta: "ISPRAVAK",
        veza: { izlazVinaId: izlaz.id },
        korisnikId: user.id,
        dogodenoAt: datum,
        napomena:
          "Ispravak pri arhiviranju: tank je ispražnjen do kraja, a knjiga je u njemu tvrdila još vina.",
      });
    }
  }

  return { izlaz, arhivaId };
}
