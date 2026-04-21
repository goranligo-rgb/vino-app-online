"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import KorekcijaModal from "@/components/KorekcijaModal";

type AuthUser = {
  id: string;
  ime: string;
  username?: string;
  email?: string;
  role?: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

type KorekcijaTip =
  | "SLOBODNI_SO2"
  | "SECER"
  | "UKUPNE_KISELINE"
  | "PH"
  | "ALKOHOL";

type ZadatakStavka = {
  id: string;
  doza: number | null;
  volumenUTanku: number | null;
  izracunataKolicina: number | null;
  preparat: {
    id: string;
    naziv: string;
    unit?: {
      id: string;
      naziv: string;
    } | null;
  } | null;
  jedinica: {
    id: string;
    naziv: string;
  } | null;
  izlaznaJedinica: {
    id: string;
    naziv: string;
  } | null;
};

type Zadatak = {
  id: string;
  vrsta: string;
  naslov: string | null;
  napomena: string | null;
  status: string;
  zadanoAt: string;
  izvrsenoAt?: string | null;

  doza: number | null;
  volumenUTanku: number | null;
  izracunataKolicina: number | null;

  tipZadatka?: string | null;
  vezanaVrsta?: string | null;
  vezaniBrojDana?: number | null;
  vezaniNaslov?: string | null;
  vezanaNapomena?: string | null;
  parentZadatakId?: string | null;
  zakljucanDo?: string | null;

  tipKorekcije?: KorekcijaTip | null;
  trenutnaVrijednost?: number | null;
  zeljenaVrijednost?: number | null;

  stavke?: ZadatakStavka[];

  tank: {
    id: string;
    broj: number;
    kapacitet: number;
    tip: string | null;
  };
  zadaoKorisnik: {
    id: string;
    ime?: string | null;
    naziv?: string | null;
    email?: string | null;
  } | null;
  izvrsioKorisnik?: {
    id: string;
    ime?: string | null;
    naziv?: string | null;
    email?: string | null;
  } | null;
  preparat: {
    id: string;
    naziv: string;
    dozaOd?: number | null;
    dozaDo?: number | null;
    unitId?: string | null;
    isKorekcijski?: boolean;
    korekcijaTip?: KorekcijaTip | null;
    korekcijaJedinica?: string | null;
    ucinakPoJedinici?: number | null;
    referentnaKolicina?: number | null;
    referentnaKolicinaJedinica?: string | null;
    referentniVolumen?: number | null;
    referentniVolumenJedinica?: string | null;
    povecanjeParametra?: number | null;
    unit?: {
      id: string;
      naziv: string;
    } | null;
  } | null;
  jedinica: {
    id: string;
    naziv: string;
  } | null;
  izlaznaJedinica: {
    id: string;
    naziv: string;
  } | null;
};

type Tank = {
  id: string;
  broj: number;
  kapacitet: number;
  tip: string | null;
  kolicinaVinaUTanku?: number | null;
  sorta?: string | null;
  nazivVina?: string | null;
};

type Preparat = {
  id: string;
  naziv: string;
  opis?: string | null;
  strucnoIme?: string | null;

  dozaOd: number | null;
  dozaDo: number | null;
  unitId: string | null;

  stanjeNaSkladistu?: number | null;
  minimalnaKolicina?: number | null;
  skladisnaJedinicaId?: string | null;
  skladisnaJedinica?: {
    id: string;
    naziv: string;
  } | null;

  aktivan?: boolean;

  isKorekcijski?: boolean;
  korekcijaTip?: KorekcijaTip | null;
  korekcijaJedinica?: string | null;
  ucinakPoJedinici?: number | null;

  referentnaKolicina?: number | null;
  referentnaKolicinaJedinica?: string | null;
  referentniVolumen?: number | null;
  referentniVolumenJedinica?: string | null;
  povecanjeParametra?: number | null;

  preporucenaDoza?: number | null;
  mjernaJedinica?: string | null;
  izlaznaJedinica?: string | null;

  unit?: {
    id: string;
    naziv: string;
  } | null;
};

type ZadnjeMjerenje = {
  alkohol?: number | null;
  ukupneKiseline?: number | null;
  hlapiveKiseline?: number | null;
  slobodniSO2?: number | null;
  ukupniSO2?: number | null;
  secer?: number | null;
  ph?: number | null;
  temperatura?: number | null;
};

type NovaStavka = {
  localId: string;
  preparatId: string;
  doza: string;
  izlaznaJedinica: string;
};

type ObradenaStavka = NovaStavka & {
  preparat: Preparat | null;
  mjernaJedinica: string;
  baznaIzlaznaJedinica: string;
  dostupneIzlazneJedinice: string[];
  dozaBroj: number | null;
  izracunataKolicina: number | null;
  stanjeNaSkladistu: number | null;
  potrebnoUSkladisnojJedinici: number | null;
  nakonDodavanja: number | null;
  minimalna: number | null;
  skladisnaJedinicaNaziv: string;
  nemaDovoljno: boolean;
  isPodMinimuma: boolean;
  statusSkladista: "OK" | "MIN" | "NEMA";
};

function randomId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function praznaStavka(): NovaStavka {
  return {
    localId: randomId(),
    preparatId: "",
    doza: "",
    izlaznaJedinica: "",
  };
}

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function dohvatiMjernuJedinicu(preparat: Preparat | null) {
  return preparat?.mjernaJedinica ?? preparat?.unit?.naziv ?? "";
}

function odrediBaznuIzlaznuJedinicu(preparat: Preparat | null) {
  const izlazna = norm(preparat?.izlaznaJedinica);

  if (izlazna) {
    if (izlazna.includes("dkg")) return "dkg";
    if (izlazna.includes("kg")) return "kg";
    if (izlazna.includes("g")) return "g";
    if (izlazna.includes("ml")) return "ml";
    if (izlazna.includes("dl")) return "dl";
    if (izlazna === "l" || izlazna.includes(" l")) return "l";
  }

  const mjerna = norm(preparat?.mjernaJedinica ?? preparat?.unit?.naziv);

  if (mjerna) {
    if (mjerna.includes("dkg")) return "dkg";
    if (mjerna.includes("kg")) return "kg";
    if (mjerna.includes("g")) return "g";
    if (mjerna.includes("ml")) return "ml";
    if (mjerna.includes("dl")) return "dl";
    if (mjerna.includes("l")) return "l";
  }

  return "";
}

function opcijeZaJedinicu(bazna: string) {
  const j = norm(bazna);

  if (["g", "dkg", "kg"].includes(j)) return ["g", "dkg", "kg"];
  if (["ml", "dl", "l"].includes(j)) return ["ml", "dl", "l"];

  return [];
}

function pretvori(kolicina: number | null, from: string, to: string) {
  if (kolicina == null) return null;

  const f = norm(from);
  const t = norm(to);

  if (!f || !t || f === t) return Number(kolicina.toFixed(2));

  if (["g", "dkg", "kg"].includes(f) && ["g", "dkg", "kg"].includes(t)) {
    let uGramima = kolicina;
    if (f === "dkg") uGramima = kolicina * 10;
    if (f === "kg") uGramima = kolicina * 1000;

    let rezultat = uGramima;
    if (t === "dkg") rezultat = uGramima / 10;
    if (t === "kg") rezultat = uGramima / 1000;

    return Number(rezultat.toFixed(2));
  }

  if (["ml", "dl", "l"].includes(f) && ["ml", "dl", "l"].includes(t)) {
    let uMl = kolicina;
    if (f === "dl") uMl = kolicina * 100;
    if (f === "l") uMl = kolicina * 1000;

    let rezultat = uMl;
    if (t === "dl") rezultat = uMl / 100;
    if (t === "l") rezultat = uMl / 1000;

    return Number(rezultat.toFixed(2));
  }

  return Number(kolicina.toFixed(2));
}

function fmt(v: number | null | undefined, dec = 2) {
  if (v == null || Number.isNaN(Number(v))) return "-";
  return Number(v).toFixed(dec);
}

function fmtKolicina(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "-";

  const broj = Number(v);

  if (Number.isInteger(broj)) {
    return broj.toLocaleString("hr-HR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  return broj.toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtL(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "0";
  return Number(v).toLocaleString("hr-HR", {
    maximumFractionDigits: 0,
  });
}

function opisTanka(tank: Tank) {
  const sorta = tank.sorta?.trim() || tank.nazivVina?.trim() || null;
  const tip = tank.tip?.trim() || "tank";
  const opis = sorta ? sorta : tip;

  const kapacitet = Number(tank.kapacitet ?? 0);
  const trenutno = Number(tank.kolicinaVinaUTanku ?? 0);
  const slobodno = Math.max(kapacitet - trenutno, 0);

  return `Tank ${tank.broj} — ${opis} — kapacitet ${fmtL(
    kapacitet
  )} L — trenutno ${fmtL(trenutno)} L — slobodno ${fmtL(slobodno)} L`;
}

function formatirajDatum(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString("hr-HR");
}

function nazivVrste(vrsta: string) {
  if (vrsta === "DODAVANJE") return "Dodavanje";
  if (vrsta === "MIJESANJE") return "Miješanje";
  if (vrsta === "PRETOK") return "Pretok";
  if (vrsta === "FILTRACIJA") return "Filtracija";
  if (vrsta === "MJERENJE") return "Mjerenje";
  if (vrsta === "KOREKCIJA") return "Korekcija";
  if (vrsta === "PUNJENJE") return "Punjenje";
  if (vrsta === "NAPOMENA") return "Napomena";
  return vrsta;
}

function nazivKorekcije(v?: KorekcijaTip | null) {
  if (v === "SLOBODNI_SO2") return "Slobodni SO2";
  if (v === "SECER") return "Šećer";
  if (v === "UKUPNE_KISELINE") return "Ukupne kiseline";
  if (v === "PH") return "pH";
  if (v === "ALKOHOL") return "Alkohol";
  return "-";
}

function jeZakljucan(zadatak: Zadatak) {
  return Boolean(
    zadatak.zakljucanDo && new Date() < new Date(zadatak.zakljucanDo)
  );
}

function jeSpremanZaIzvrsenje(zadatak: Zadatak) {
  return !jeZakljucan(zadatak);
}

function kasniZadatak(zadatak: Zadatak) {
  if (!zadatak.zakljucanDo) return false;
  return new Date() > new Date(zadatak.zakljucanDo);
}

function useIsMobile(breakpoint = 1100) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

function zadatakImaStavke(zadatak: Zadatak) {
  return Array.isArray(zadatak.stavke) && zadatak.stavke.length > 0;
}

function zadatakImaDirektniPreparat(zadatak: Zadatak) {
  return Boolean(
    zadatak.preparat ||
      zadatak.doza != null ||
      zadatak.izracunataKolicina != null ||
      zadatak.volumenUTanku != null
  );
}

export default function ZadaciPage() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [user, setUser] = useState<AuthUser | null>(null);

  const [zadaci, setZadaci] = useState<Zadatak[]>([]);
  const [tankovi, setTankovi] = useState<Tank[]>([]);
  const [preparati, setPreparati] = useState<Preparat[]>([]);

  const [poruka, setPoruka] = useState("");
  const [loading, setLoading] = useState(true);
  const [izvrsavanjeId, setIzvrsavanjeId] = useState<string | null>(null);
  const [spremanje, setSpremanje] = useState(false);

  const [odabraniTankId, setOdabraniTankId] = useState("");
  const [vrstaZadatka, setVrstaZadatka] = useState("DODAVANJE");
  const [stavke, setStavke] = useState<NovaStavka[]>([praznaStavka()]);
  const [kolicinaVinaUTanku, setKolicinaVinaUTanku] = useState<number | null>(
    null
  );
  const [naslov, setNaslov] = useState("Dodavanje preparata");
  const [napomena, setNapomena] = useState("");

  const [tipZadatka, setTipZadatka] = useState("STANDARDNI");
  const [vezanaVrsta, setVezanaVrsta] = useState("PRETOK");
  const [vezaniBrojDana, setVezaniBrojDana] = useState("");
  const [vezaniNaslov, setVezaniNaslov] = useState("Pretok");
  const [vezanaNapomena, setVezanaNapomena] = useState("");

  const [korekcijaOpen, setKorekcijaOpen] = useState(false);
  const [zadnjeMjerenjeZaKorekciju, setZadnjeMjerenjeZaKorekciju] =
    useState<ZadnjeMjerenje | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        setUser(null);
      }
    }
  }, []);

  const isLevel1 = user?.role === "ADMIN" || user?.role === "ENOLOG";
  const isLevel2 = user?.role === "PODRUM" || user?.role === "PREGLED";

  async function ucitajZadatke() {
    try {
      const res = await fetch("/api/zadatak", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška kod dohvata zadataka.");
        return;
      }

      setZadaci(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod dohvata zadataka.");
    }
  }

  async function ucitajTankove() {
    try {
      const res = await fetch("/api/tank", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška kod dohvata tankova.");
        return;
      }

      setTankovi(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod dohvata tankova.");
    }
  }

  async function ucitajPreparate() {
    try {
      const res = await fetch("/api/preparat", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška kod dohvata preparata.");
        return;
      }

      setPreparati(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod dohvata preparata.");
    }
  }

  async function ucitajSve() {
    try {
      setLoading(true);

      if (isLevel1) {
        await Promise.all([ucitajZadatke(), ucitajTankove(), ucitajPreparate()]);
      } else if (isLevel2) {
        await ucitajZadatke();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void ucitajSve();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (vrstaZadatka === "DODAVANJE") setNaslov("Dodavanje preparata");
    else if (vrstaZadatka === "PRETOK") setNaslov("Pretok");
    else if (vrstaZadatka === "MIJESANJE") setNaslov("Miješanje");
    else if (vrstaZadatka === "MJERENJE") setNaslov("Mjerenje");
    else if (vrstaZadatka === "KOREKCIJA") setNaslov("Korekcija");
    else if (vrstaZadatka === "FILTRACIJA") setNaslov("Filtracija");
    else if (vrstaZadatka === "PUNJENJE") setNaslov("Punjenje");
    else if (vrstaZadatka === "NAPOMENA") setNaslov("Napomena");
    else setNaslov("Novi zadatak");
  }, [vrstaZadatka]);

  useEffect(() => {
    if (vezanaVrsta === "PRETOK") setVezaniNaslov("Pretok");
    else if (vezanaVrsta === "MIJESANJE") setVezaniNaslov("Miješanje");
    else if (vezanaVrsta === "MJERENJE") setVezaniNaslov("Mjerenje");
    else if (vezanaVrsta === "FILTRACIJA") setVezaniNaslov("Filtracija");
    else if (vezanaVrsta === "KOREKCIJA") setVezaniNaslov("Korekcija");
    else if (vezanaVrsta === "PUNJENJE") setVezaniNaslov("Punjenje");
    else if (vezanaVrsta === "NAPOMENA") setVezaniNaslov("Napomena");
    else setVezaniNaslov("Vezani zadatak");
  }, [vezanaVrsta]);

  const trebaPreparat = vrstaZadatka === "DODAVANJE";
  const jeKorekcija = vrstaZadatka === "KOREKCIJA";

  const preparatiZaDodavanje = useMemo(
    () => preparati.filter((p) => !p.isKorekcijski && p.aktivan !== false),
    [preparati]
  );

  const preparatiZaKorekciju = useMemo(
    () => preparati.filter((p) => p.isKorekcijski && p.aktivan !== false),
    [preparati]
  );

  const odabraniTank = tankovi.find((t) => t.id === odabraniTankId) ?? null;

  const volumenUTanku = kolicinaVinaUTanku;
  const volumenUHl =
    volumenUTanku != null ? Number(volumenUTanku) / 100 : null;

  const obradeneStavke = useMemo<ObradenaStavka[]>(() => {
    return stavke.map((stavka) => {
      const preparat =
        preparatiZaDodavanje.find((p) => p.id === stavka.preparatId) ?? null;

      const mjernaJedinica = dohvatiMjernuJedinicu(preparat);
      const baznaIzlaznaJedinica = odrediBaznuIzlaznuJedinicu(preparat);
      const dostupneIzlazneJedinice = opcijeZaJedinicu(baznaIzlaznaJedinica);

      const izlaznaJedinica =
        stavka.izlaznaJedinica || dostupneIzlazneJedinice[0] || "";

      const doza =
        stavka.doza.trim() !== "" ? Number(stavka.doza.replace(",", ".")) : null;

      const izracunataKolicinaBazno =
        doza != null && volumenUHl != null
          ? Number((doza * volumenUHl).toFixed(2))
          : null;

      const izracunataKolicina = pretvori(
        izracunataKolicinaBazno,
        baznaIzlaznaJedinica,
        izlaznaJedinica
      );

      const stanjeNaSkladistu = preparat?.stanjeNaSkladistu ?? null;
      const minimalna = preparat?.minimalnaKolicina ?? null;
      const skladisnaJedinicaNaziv =
        preparat?.skladisnaJedinica?.naziv ??
        preparat?.unit?.naziv ??
        izlaznaJedinica ??
        "";

      const potrebnoUSkladisnojJedinici =
        izracunataKolicina != null
          ? pretvori(
              izracunataKolicina,
              izlaznaJedinica,
              skladisnaJedinicaNaziv
            )
          : null;

      const nakonDodavanja =
        stanjeNaSkladistu != null && potrebnoUSkladisnojJedinici != null
          ? Number((stanjeNaSkladistu - potrebnoUSkladisnojJedinici).toFixed(2))
          : null;

      const nemaDovoljno =
        stanjeNaSkladistu != null &&
        potrebnoUSkladisnojJedinici != null &&
        nakonDodavanja < 0;

      const isPodMinimuma =
        nakonDodavanja != null &&
        minimalna != null &&
        nakonDodavanja < minimalna;

      let statusSkladista: "OK" | "MIN" | "NEMA" = "OK";
      if (nemaDovoljno) {
        statusSkladista = "NEMA";
      } else if (isPodMinimuma) {
        statusSkladista = "MIN";
      }

      return {
        ...stavka,
        preparat,
        mjernaJedinica,
        baznaIzlaznaJedinica,
        dostupneIzlazneJedinice,
        izlaznaJedinica,
        dozaBroj: doza,
        izracunataKolicina,
        stanjeNaSkladistu,
        potrebnoUSkladisnojJedinici,
        nakonDodavanja,
        minimalna,
        skladisnaJedinicaNaziv,
        nemaDovoljno,
        isPodMinimuma,
        statusSkladista,
      };
    });
  }, [stavke, preparatiZaDodavanje, volumenUHl]);

  const ukupnoOtvoreno = zadaci.length;
  const zakljucaniCount = zadaci.filter(jeZakljucan).length;
  const spremniCount = zadaci.filter(jeSpremanZaIzvrsenje).length;

  function promijeniStavku(
    localId: string,
    field: keyof NovaStavka,
    value: string
  ) {
    setStavke((prev) =>
      prev.map((s) => (s.localId === localId ? { ...s, [field]: value } : s))
    );
  }

  function promijeniPreparat(localId: string, preparatId: string) {
    const preparat =
      preparatiZaDodavanje.find((p) => p.id === preparatId) ?? null;

    const defaultDoza =
      preparat?.dozaOd != null
        ? String(preparat.dozaOd)
        : preparat?.preporucenaDoza != null
        ? String(preparat.preporucenaDoza)
        : "";

    const bazna = odrediBaznuIzlaznuJedinicu(preparat);
    const opcije = opcijeZaJedinicu(bazna);
    const defaultIzlazna = opcije[0] ?? "";

    setStavke((prev) =>
      prev.map((s) =>
        s.localId === localId
          ? {
              ...s,
              preparatId,
              doza: defaultDoza,
              izlaznaJedinica: defaultIzlazna,
            }
          : s
      )
    );
  }

  function dodajPreparat() {
    setStavke((prev) => [...prev, praznaStavka()]);
  }

  function ukloniPreparat(localId: string) {
    setStavke((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((s) => s.localId !== localId);
    });
  }

  async function otvoriKorekciju() {
    try {
      setPoruka("");

      if (!odabraniTankId) {
        setPoruka("Prvo odaberi tank.");
        return;
      }

      const tank = tankovi.find((t) => t.id === odabraniTankId) ?? null;

      if (!tank) {
        setPoruka("Tank nije pronađen.");
        return;
      }

      setKolicinaVinaUTanku(
        tank.kolicinaVinaUTanku != null ? Number(tank.kolicinaVinaUTanku) : 0
      );

      const res = await fetch(`/api/tank/pregled?id=${tank.id}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Greška kod dohvata mjerenja za korekciju.");
        return;
      }

      setZadnjeMjerenjeZaKorekciju(data?.zadnjeMjerenje ?? null);
      setKorekcijaOpen(true);
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod otvaranja korekcije.");
    }
  }

  async function izvrsiZadatak(zadatakId: string) {
    try {
      setIzvrsavanjeId(zadatakId);
      setPoruka("");

      if (!user?.id) {
        setPoruka("Korisnik nije učitan.");
        return;
      }

      const res = await fetch("/api/zadatak", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: zadatakId,
          status: "IZVRSEN",
          izvrsioKorisnikId: user.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Izvršenje zadatka nije uspjelo.");
        return;
      }

      setPoruka("Zadatak je izvršen.");
      await ucitajZadatke();
      await ucitajPreparate();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod izvršenja zadatka.");
    } finally {
      setIzvrsavanjeId(null);
    }
  }

  async function spremiNoviZadatak() {
    try {
      setPoruka("");

      if (!user?.id) {
        setPoruka("Korisnik nije učitan.");
        return;
      }

      if (!odabraniTankId) {
        setPoruka("Odaberi tank.");
        return;
      }

      if (kolicinaVinaUTanku == null || Number.isNaN(kolicinaVinaUTanku)) {
        setPoruka("Tank nema količinu vina.");
        return;
      }

      if (jeKorekcija) {
        setPoruka("Korekcija se unosi kroz poseban prozor.");
        return;
      }

      if (trebaPreparat) {
        const ispravneStavke = obradeneStavke.filter(
          (s) => s.preparatId && s.dozaBroj != null
        );

        if (ispravneStavke.length === 0) {
          setPoruka("Dodaj barem jedan preparat.");
          return;
        }

        const bezDovoljno = ispravneStavke.find((s) => s.nemaDovoljno);
        if (bezDovoljno) {
          setPoruka(
            `Nema dovoljno preparata na skladištu: ${bezDovoljno.preparat?.naziv ?? "-"}`
          );
          return;
        }
      }

      if (tipZadatka === "VEZANI") {
        const brojDana = Number(vezaniBrojDana);

        if (!vezanaVrsta) {
          setPoruka("Odaberi vezanu radnju.");
          return;
        }

        if (!vezaniBrojDana.trim() || Number.isNaN(brojDana) || brojDana < 0) {
          setPoruka("Upiši ispravan broj dana.");
          return;
        }
      }

      setSpremanje(true);

      const payloadStavke = trebaPreparat
        ? obradeneStavke
            .filter((s) => s.preparatId && s.dozaBroj != null)
            .map((s) => ({
              preparatId: s.preparatId,
              doza: s.dozaBroj,
              jedinicaId: s.preparat?.unitId ?? null,
              izracunataKolicina: s.izracunataKolicina,
              izlaznaJedinicaNaziv: s.izlaznaJedinica || null,
            }))
        : [];

      const res = await fetch("/api/zadatak/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tankId: odabraniTankId,
          vrsta: vrstaZadatka,
          stavke: trebaPreparat ? payloadStavke : [],
          naslov,
          napomena,
          tipZadatka,
          vezanaVrsta: tipZadatka === "VEZANI" ? vezanaVrsta : null,
          vezaniBrojDana:
            tipZadatka === "VEZANI" ? Number(vezaniBrojDana) : null,
          vezaniNaslov: tipZadatka === "VEZANI" ? vezaniNaslov : null,
          vezanaNapomena: tipZadatka === "VEZANI" ? vezanaNapomena : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Spremanje zadatka nije uspjelo.");
        return;
      }

      const upozorenjeMinimum = obradeneStavke
        .filter((s) => s.preparatId && s.dozaBroj != null && s.isPodMinimuma)
        .map((s) => s.preparat?.naziv)
        .filter(Boolean) as string[];

      if (upozorenjeMinimum.length > 0) {
        setPoruka(
          `Novi zadatak je spremljen. Upozorenje: nakon izvršenja ispod minimuma će biti ${upozorenjeMinimum.join(", ")}.`
        );
      } else {
        setPoruka("Novi zadatak je spremljen.");
      }

      setOdabraniTankId("");
      setVrstaZadatka("DODAVANJE");
      setStavke([praznaStavka()]);
      setKolicinaVinaUTanku(null);
      setNaslov("Dodavanje preparata");
      setNapomena("");

      setTipZadatka("STANDARDNI");
      setVezanaVrsta("PRETOK");
      setVezaniBrojDana("");
      setVezaniNaslov("Pretok");
      setVezanaNapomena("");

      await ucitajZadatke();
      await ucitajPreparate();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod spremanja zadatka.");
    } finally {
      setSpremanje(false);
    }
  }

  async function spremiPromjeneZadatka(zadatak: Zadatak) {
    try {
      setPoruka("");

      const res = await fetch("/api/zadatak", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: zadatak.id,
          naslov: zadatak.naslov ?? null,
          napomena: zadatak.napomena ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Spremanje promjena nije uspjelo.");
        return;
      }

      setPoruka("Zadatak je uspješno ažuriran.");
      await ucitajZadatke();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod spremanja promjena zadatka.");
    }
  }

  async function obrisiZadatak(id: string) {
    const potvrda = confirm("Obrisati zadatak?");
    if (!potvrda) return;

    try {
      setPoruka("");

      const res = await fetch("/api/zadatak", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data?.error || "Brisanje zadatka nije uspjelo.");
        return;
      }

      setPoruka("Zadatak je obrisan.");
      await ucitajZadatke();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod brisanja zadatka.");
    }
  }

  return (
    <>
      <main style={pageStyle}>
        <div style={headerStyle}>
          <div>
            <h1 style={pageTitleStyle}>Zadaci</h1>
            <div style={pageSubtitleStyle}>
              Organizacija rada u podrumu i praćenje vezanih koraka
            </div>
          </div>

          <div style={{ display: "grid", gap: "10px", justifyItems: "end" }}>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              style={secondaryButtonStyle}
            >
              ← Povratak na početnu
            </button>

            <div style={statsWrapStyle}>
              <div style={statCardStyle}>
                <div style={statLabelStyle}>Ukupno otvoreno</div>
                <div style={statValueStyle}>{ukupnoOtvoreno}</div>
              </div>

              <div style={statCardNeutralStyle}>
                <div style={statLabelStyle}>Zaključano</div>
                <div style={statValueStyle}>{zakljucaniCount}</div>
              </div>

              <div style={statCardNeutralStyle}>
                <div style={statLabelStyle}>Spremno</div>
                <div style={statValueStyle}>{spremniCount}</div>
              </div>
            </div>
          </div>
        </div>

        {poruka && <div style={messageBoxStyle}>{poruka}</div>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : isLevel1
              ? "minmax(0, 1.9fr) minmax(360px, 0.95fr)"
              : "1fr",
            gap: "14px",
            alignItems: "start",
          }}
        >
          {isLevel1 && (
            <section style={{ ...panelStyle, minWidth: 0 }}>
              <div style={panelHeaderStyle}>
                <h2 style={sectionTitleStyle}>Dodaj zadatak</h2>
                <div style={sectionSubtitleStyle}>
                  Unos standardnog ili vezanog zadatka
                </div>
              </div>

              <div style={formGridStyle}>
                <div>
                  <label style={labelStyle}>Odaberi tank</label>
                  <select
                    value={odabraniTankId}
                    onChange={(e) => {
                      const tankId = e.target.value;
                      setOdabraniTankId(tankId);

                      const tank = tankovi.find((t) => t.id === tankId);

                      if (!tank) {
                        setKolicinaVinaUTanku(null);
                        return;
                      }

                      setKolicinaVinaUTanku(
                        tank.kolicinaVinaUTanku != null
                          ? Number(tank.kolicinaVinaUTanku)
                          : 0
                      );
                    }}
                    style={inputStyle}
                  >
                    <option value="">Odaberi tank</option>
                    {tankovi
                      .filter((tank) => tank.broj > 0 && tank.kapacitet > 0)
                      .map((tank) => (
                        <option key={tank.id} value={tank.id}>
                          {opisTanka(tank)}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Vrsta zadatka</label>
                  <select
                    value={vrstaZadatka}
                    onChange={(e) => setVrstaZadatka(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="DODAVANJE">Dodavanje</option>
                    <option value="MIJESANJE">Miješanje</option>
                    <option value="PRETOK">Pretok</option>
                    <option value="FILTRACIJA">Filtracija</option>
                    <option value="MJERENJE">Mjerenje</option>
                    <option value="KOREKCIJA">Korekcija</option>
                    <option value="PUNJENJE">Punjenje</option>
                    <option value="NAPOMENA">Napomena</option>
                    <option value="OSTALO">Ostalo</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Tip zadatka</label>
                  <select
                    value={tipZadatka}
                    onChange={(e) => setTipZadatka(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="STANDARDNI">Standardni</option>
                    <option value="VEZANI">Vezani</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Količina vina u tanku</label>
                  <input
                    type="text"
                    value={
                      kolicinaVinaUTanku != null
                        ? `${fmt(kolicinaVinaUTanku, 2)} L`
                        : "-"
                    }
                    readOnly
                    style={{
                      ...inputStyle,
                      background: "#f7f5f5",
                      color: "#5d5558",
                    }}
                  />
                </div>

                {tipZadatka === "VEZANI" && (
                  <div style={subSectionStyle}>
                    <div style={subSectionTitleStyle}>Vezani zadatak</div>

                    <div>
                      <label style={labelStyle}>Vezana radnja</label>
                      <select
                        value={vezanaVrsta}
                        onChange={(e) => setVezanaVrsta(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="PRETOK">Pretok</option>
                        <option value="MIJESANJE">Miješanje</option>
                        <option value="FILTRACIJA">Filtracija</option>
                        <option value="MJERENJE">Mjerenje</option>
                        <option value="KOREKCIJA">Korekcija</option>
                        <option value="PUNJENJE">Punjenje</option>
                        <option value="NAPOMENA">Napomena</option>
                        <option value="OSTALO">Ostalo</option>
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Broj dana nakon izvršenja</label>
                      <input
                        type="number"
                        min="0"
                        value={vezaniBrojDana}
                        onChange={(e) => setVezaniBrojDana(e.target.value)}
                        placeholder="npr. 7"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Naslov vezanog zadatka</label>
                      <input
                        value={vezaniNaslov}
                        onChange={(e) => setVezaniNaslov(e.target.value)}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Napomena vezanog zadatka</label>
                      <input
                        value={vezanaNapomena}
                        onChange={(e) => setVezanaNapomena(e.target.value)}
                        placeholder="Opcionalno"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}

                {trebaPreparat && (
                  <div style={subSectionStyle}>
                    <div style={subSectionTitleStyle}>
                      Preparati za ovaj zadatak
                    </div>

                    <div style={{ display: "grid", gap: "10px" }}>
                      {obradeneStavke.map((stavka, index) => (
                        <div
                          key={stavka.localId}
                          style={{
                            ...stavkaBoxStyle,
                            border:
                              stavka.statusSkladista === "NEMA"
                                ? "2px solid #dc2626"
                                : stavka.statusSkladista === "MIN"
                                ? "2px solid #f59e0b"
                                : stavkaBoxStyle.border,
                            background:
                              stavka.statusSkladista === "NEMA"
                                ? "#fef2f2"
                                : stavka.statusSkladista === "MIN"
                                ? "#fffbeb"
                                : stavkaBoxStyle.background,
                          }}
                        >
                          <div style={stavkaHeaderStyle}>
                            <div>
                              <div style={subSectionTitleStyle}>
                                Preparat {index + 1}
                              </div>

                              {stavka.statusSkladista === "NEMA" && (
                                <div
                                  style={{
                                    color: "#b91c1c",
                                    fontWeight: 700,
                                    fontSize: "13px",
                                    marginTop: "4px",
                                  }}
                                >
                                  ⚠ Nema dovoljno preparata na skladištu
                                </div>
                              )}

                              {stavka.statusSkladista === "MIN" && (
                                <div
                                  style={{
                                    color: "#b45309",
                                    fontWeight: 700,
                                    fontSize: "13px",
                                    marginTop: "4px",
                                  }}
                                >
                                  ⚠ Nakon izvršenja ide ispod minimalne količine
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => ukloniPreparat(stavka.localId)}
                              disabled={stavke.length === 1}
                              style={{
                                ...deleteButtonStyle,
                                opacity: stavke.length === 1 ? 0.5 : 1,
                                cursor:
                                  stavke.length === 1 ? "not-allowed" : "pointer",
                              }}
                            >
                              Ukloni
                            </button>
                          </div>

                          <div style={{ display: "grid", gap: "10px" }}>
                            <div>
                              <label style={labelStyle}>Preparat</label>
                              <select
                                value={stavka.preparatId}
                                onChange={(e) =>
                                  promijeniPreparat(
                                    stavka.localId,
                                    e.target.value
                                  )
                                }
                                style={inputStyle}
                              >
                                <option value="">Odaberi preparat</option>
                                {preparatiZaDodavanje.map((preparat) => (
                                  <option key={preparat.id} value={preparat.id}>
                                    {preparat.naziv} ({preparat.dozaOd ?? "-"}
                                    {preparat.dozaDo != null
                                      ? ` - ${preparat.dozaDo}`
                                      : ""}{" "}
                                    {dohvatiMjernuJedinicu(preparat)})
                                    {preparat.stanjeNaSkladistu != null
                                      ? ` — lager ${fmtKolicina(
                                          preparat.stanjeNaSkladistu
                                        )} ${
                                          preparat.skladisnaJedinica?.naziv ?? ""
                                        }`
                                      : ""}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {stavka.preparat &&
                              stavka.dostupneIzlazneJedinice.length > 0 && (
                                <div>
                                  <label style={labelStyle}>
                                    Prikaz ukupno u jedinici
                                  </label>
                                  <select
                                    value={stavka.izlaznaJedinica}
                                    onChange={(e) =>
                                      promijeniStavku(
                                        stavka.localId,
                                        "izlaznaJedinica",
                                        e.target.value
                                      )
                                    }
                                    style={inputStyle}
                                  >
                                    {stavka.dostupneIzlazneJedinice.map(
                                      (jedinica) => (
                                        <option key={jedinica} value={jedinica}>
                                          {jedinica}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>
                              )}

                            <div>
                              <label style={labelStyle}>Unesi dozu</label>
                              <input
                                type="number"
                                step="0.01"
                                value={stavka.doza}
                                onChange={(e) =>
                                  promijeniStavku(
                                    stavka.localId,
                                    "doza",
                                    e.target.value
                                  )
                                }
                                placeholder={`Upiši dozu u ${
                                  stavka.mjernaJedinica || "jedinici"
                                }`}
                                style={inputStyle}
                              />
                            </div>

                            <div style={summaryBoxStyle}>
                              <div>
                                <strong>Preporučena doza:</strong>{" "}
                                {stavka.preparat?.dozaOd ?? "-"}
                                {stavka.preparat?.dozaDo != null
                                  ? ` - ${stavka.preparat.dozaDo}`
                                  : ""}{" "}
                                {stavka.mjernaJedinica || "jedinica"}
                              </div>

                              <div>
                                <strong>Odabrana doza:</strong>{" "}
                                {stavka.dozaBroj != null
                                  ? `${fmtKolicina(stavka.dozaBroj)} ${
                                      stavka.mjernaJedinica
                                    }`
                                  : "-"}
                              </div>

                              <div>
                                <strong>Ukupno za dodati:</strong>{" "}
                                {stavka.izracunataKolicina != null
                                  ? `${fmtKolicina(stavka.izracunataKolicina)} ${
                                      stavka.izlaznaJedinica
                                    }`
                                  : "-"}
                              </div>

                              {stavka.stanjeNaSkladistu != null && (
                                <div>
                                  <strong>Stanje skladišta:</strong>{" "}
                                  {fmtKolicina(stavka.stanjeNaSkladistu)}{" "}
                                  {stavka.skladisnaJedinicaNaziv}
                                </div>
                              )}

                              {stavka.potrebnoUSkladisnojJedinici != null && (
                                <div>
                                  <strong>Potrebno sa skladišta:</strong>{" "}
                                  {fmtKolicina(stavka.potrebnoUSkladisnojJedinici)}{" "}
                                  {stavka.skladisnaJedinicaNaziv}
                                </div>
                              )}

                              {stavka.nakonDodavanja != null && (
                                <div>
                                  <strong>Ostaje nakon zadatka:</strong>{" "}
                                  {fmtKolicina(stavka.nakonDodavanja)}{" "}
                                  {stavka.skladisnaJedinicaNaziv}
                                </div>
                              )}

                              {stavka.minimalna != null && (
                                <div>
                                  <strong>Minimalno stanje:</strong>{" "}
                                  {fmtKolicina(stavka.minimalna)}{" "}
                                  {stavka.skladisnaJedinicaNaziv}
                                </div>
                              )}

                              {stavka.nemaDovoljno && (
                                <div style={{ color: "#991b1b", fontWeight: 700 }}>
                                  ⚠ Nema dovoljno preparata na skladištu.
                                </div>
                              )}

                              {!stavka.nemaDovoljno && stavka.isPodMinimuma && (
                                <div style={{ color: "#b45309", fontWeight: 700 }}>
                                  ⚠ Nakon izvršenja past će ispod minimalne količine.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={dodajPreparat}
                      style={secondaryButtonStyle}
                    >
                      + Dodaj preparat
                    </button>
                  </div>
                )}

                {jeKorekcija && (
                  <div style={subSectionStyle}>
                    <div style={subSectionTitleStyle}>Korekcija</div>

                    <div style={{ color: "#6b6470", fontSize: "13px" }}>
                      Korekcija se radi kroz mali prozor za odabrani tank.
                    </div>

                    <button
                      type="button"
                      onClick={otvoriKorekciju}
                      style={primaryButtonStyle}
                    >
                      Otvori korekciju
                    </button>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Naslov</label>
                  <input
                    value={naslov}
                    onChange={(e) => setNaslov(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Napomena</label>
                  <input
                    value={napomena}
                    onChange={(e) => setNapomena(e.target.value)}
                    placeholder="Opcionalno"
                    style={inputStyle}
                  />
                </div>

                <div style={summaryBoxStyle}>
                  {trebaPreparat ? (
                    <>
                      <div>
                        <strong>Broj preparata:</strong>{" "}
                        {
                          obradeneStavke.filter(
                            (s) => s.preparatId && s.dozaBroj != null
                          ).length
                        }
                      </div>

                      <div>
                        <strong>Količina vina:</strong>{" "}
                        {volumenUTanku != null ? `${fmt(volumenUTanku, 2)} L` : "-"}
                      </div>

                      <div>
                        <strong>Volumen:</strong>{" "}
                        {volumenUHl != null ? `${fmt(volumenUHl, 2)} hL` : "-"}
                      </div>
                    </>
                  ) : jeKorekcija ? (
                    <>
                      <div>
                        <strong>Vrsta zadatka:</strong> Korekcija
                      </div>
                      <div>
                        <strong>Količina vina:</strong>{" "}
                        {volumenUTanku != null ? `${fmt(volumenUTanku, 2)} L` : "-"}
                      </div>
                      <div>
                        <strong>Napomena:</strong> Korekcija se unosi na posebnom prozoru.
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <strong>Vrsta zadatka:</strong> {vrstaZadatka}
                      </div>
                      <div>
                        <strong>Količina vina:</strong>{" "}
                        {volumenUTanku != null ? `${fmt(volumenUTanku, 2)} L` : "-"}
                      </div>
                      <div>
                        <strong>Napomena:</strong> Preparat nije obavezan.
                      </div>
                    </>
                  )}

                  <div>
                    <strong>Tip:</strong>{" "}
                    {tipZadatka === "VEZANI" ? "Vezani" : "Standardni"}
                  </div>

                  {tipZadatka === "VEZANI" && (
                    <>
                      <div>
                        <strong>Drugi korak:</strong> {nazivVrste(vezanaVrsta)}
                      </div>
                      <div>
                        <strong>Nakon dana:</strong>{" "}
                        {vezaniBrojDana ? `${vezaniBrojDana} dana` : "-"}
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={spremiNoviZadatak}
                  disabled={spremanje || jeKorekcija}
                  style={{
                    ...primaryButtonStyle,
                    opacity: spremanje || jeKorekcija ? 0.65 : 1,
                    cursor: spremanje || jeKorekcija ? "not-allowed" : "pointer",
                  }}
                >
                  {spremanje ? "Spremam..." : "Spremi zadatak"}
                </button>
              </div>
            </section>
          )}

          <section style={{ ...panelStyle, minWidth: 0 }}>
            <div style={panelHeaderStyle}>
              <h2 style={sectionTitleStyle}>Nerealizirani zadaci</h2>
              <div style={sectionSubtitleStyle}>
                {isLevel1
                  ? "Otvoreni zadaci i vezani koraci koji čekaju izvršenje"
                  : "Pregled otvorenih zadataka koje treba odraditi"}
              </div>
            </div>

            {loading ? (
              <p style={{ color: "#6b6470" }}>Učitavam zadatke...</p>
            ) : zadaci.length === 0 ? (
              <div style={emptyBoxStyle}>Nema otvorenih zadataka.</div>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {zadaci.map((zadatak) => {
                  const zakljucan = jeZakljucan(zadatak);
                  const kasni = kasniZadatak(zadatak);
                  const imaStavke = zadatakImaStavke(zadatak);
                  const imaDirektniPreparat = zadatakImaDirektniPreparat(zadatak);

                  const prvaStavka = imaStavke ? zadatak.stavke?.[0] ?? null : null;

                  const prikazDoza =
                    zadatak.doza != null ? zadatak.doza : prvaStavka?.doza ?? null;

                  const prikazJedinicaNaziv =
                    zadatak.jedinica?.naziv ??
                    prvaStavka?.jedinica?.naziv ??
                    zadatak.preparat?.unit?.naziv ??
                    prvaStavka?.preparat?.unit?.naziv ??
                    null;

                  const prikazVolumen =
                    zadatak.volumenUTanku != null
                      ? zadatak.volumenUTanku
                      : prvaStavka?.volumenUTanku ?? null;

                  const prikazUkupno =
                    zadatak.izracunataKolicina != null
                      ? zadatak.izracunataKolicina
                      : prvaStavka?.izracunataKolicina ?? null;

                  const prikazIzlaznaJedinicaNaziv =
                    zadatak.izlaznaJedinica?.naziv ??
                    prvaStavka?.izlaznaJedinica?.naziv ??
                    zadatak.preparat?.unit?.naziv ??
                    prvaStavka?.preparat?.unit?.naziv ??
                    null;

                  return (
                    <div
                      key={zadatak.id}
                      style={{
                        border: kasni
                          ? "1px solid #e6b2b2"
                          : "1px solid rgba(127,29,29,0.16)",
                        padding: "12px",
                        background: "#fff",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={taskHeaderStyle}>
                        <div>
                          <div style={taskTitleStyle}>
                            Tank {zadatak.tank.broj} — {nazivVrste(zadatak.vrsta)}
                          </div>
                          <div style={taskSubStyle}>
                            Datum zadavanja: {formatirajDatum(zadatak.zadanoAt)}
                          </div>
                        </div>

                        {kasni ? (
                          <div style={badgeLateStyle}>Kasni</div>
                        ) : zadatak.parentZadatakId ? (
                          <div style={badgeBlueStyle}>Drugi korak</div>
                        ) : zadatak.tipZadatka === "VEZANI" ? (
                          <div style={badgePurpleStyle}>Prvi korak</div>
                        ) : (
                          <div style={badgeWineStyle}>Otvoren zadatak</div>
                        )}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <label style={smallLabelStyle}>Naslov</label>
                          <input
                            value={zadatak.naslov ?? ""}
                            readOnly={!isLevel1}
                            onChange={(e) => {
                              if (!isLevel1) return;

                              const novaVrijednost = e.target.value;
                              setZadaci((prev) =>
                                prev.map((z) =>
                                  z.id === zadatak.id
                                    ? { ...z, naslov: novaVrijednost }
                                    : z
                                )
                              );
                            }}
                            style={{
                              ...inputStyle,
                              background: isLevel1 ? "#fff" : "#f7f5f5",
                              color: isLevel1 ? "#2f2f2f" : "#666",
                              cursor: isLevel1 ? "text" : "default",
                            }}
                          />
                        </div>

                        <div>
                          <label style={smallLabelStyle}>Napomena</label>
                          <input
                            value={zadatak.napomena ?? ""}
                            readOnly={!isLevel1}
                            onChange={(e) => {
                              if (!isLevel1) return;

                              const novaVrijednost = e.target.value;
                              setZadaci((prev) =>
                                prev.map((z) =>
                                  z.id === zadatak.id
                                    ? { ...z, napomena: novaVrijednost }
                                    : z
                                )
                              );
                            }}
                            style={{
                              ...inputStyle,
                              background: isLevel1 ? "#fff" : "#f7f5f5",
                              color: isLevel1 ? "#2f2f2f" : "#666",
                              cursor: isLevel1 ? "text" : "default",
                            }}
                          />
                        </div>
                      </div>

                      {imaStavke && (
                        <div style={{ display: "grid", gap: "8px" }}>
                          <div style={subSectionTitleStyle}>
                            {zadatak.vrsta === "KOREKCIJA"
                              ? "Korekcijski preparat / stavke"
                              : "Preparati u zadatku"}
                          </div>

                          {zadatak.stavke!.map((stavka, index) => (
                            <div key={stavka.id} style={stavkaListBoxStyle}>
                              <div style={{ fontWeight: 600 }}>
                                {index + 1}. {stavka.preparat?.naziv ?? "-"}
                              </div>

                              <div style={stavkaListGridStyle}>
                                <div style={infoCardStyle}>
                                  <strong>Doza</strong>
                                  <span>
                                    {stavka.doza != null && stavka.jedinica?.naziv
                                      ? `${fmtKolicina(stavka.doza)} ${stavka.jedinica.naziv}`
                                      : "-"}
                                  </span>
                                </div>

                                <div style={infoCardStyle}>
                                  <strong>Volumen u tanku</strong>
                                  <span>
                                    {stavka.volumenUTanku != null
                                      ? `${fmt(stavka.volumenUTanku, 2)} L`
                                      : "-"}
                                  </span>
                                </div>

                                <div style={infoCardStyle}>
                                  <strong>Ukupno za dodati</strong>
                                  <span>
                                    {stavka.izracunataKolicina != null
                                      ? `${fmtKolicina(stavka.izracunataKolicina)} ${
                                          stavka.izlaznaJedinica?.naziv ??
                                          stavka.preparat?.unit?.naziv ??
                                          ""
                                        }`
                                      : "-"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!imaStavke &&
                        imaDirektniPreparat &&
                        zadatak.vrsta !== "KOREKCIJA" && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: isMobile
                                ? "1fr"
                                : "repeat(4, minmax(0, 1fr))",
                              gap: "8px",
                            }}
                          >
                            <div style={infoCardStyle}>
                              <strong>Preparat</strong>
                              <span>
                                {zadatak.preparat?.naziv ??
                                  prvaStavka?.preparat?.naziv ??
                                  "-"}
                              </span>
                            </div>

                            <div style={infoCardStyle}>
                              <strong>Doza</strong>
                              <span>
                                {prikazDoza != null && prikazJedinicaNaziv
                                  ? `${fmtKolicina(prikazDoza)} ${prikazJedinicaNaziv}`
                                  : "-"}
                              </span>
                            </div>

                            <div style={infoCardStyle}>
                              <strong>Volumen u tanku</strong>
                              <span>
                                {prikazVolumen != null
                                  ? `${fmt(prikazVolumen, 2)} L`
                                  : "-"}
                              </span>
                            </div>

                            <div style={infoCardStyle}>
                              <strong>Ukupno za dodati</strong>
                              <span>
                                {prikazUkupno != null
                                  ? `${fmtKolicina(prikazUkupno)} ${prikazIzlaznaJedinicaNaziv ?? ""}`
                                  : "-"}
                              </span>
                            </div>
                          </div>
                        )}

                      {zadatak.vrsta === "KOREKCIJA" && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: isMobile
                              ? "1fr"
                              : "repeat(4, minmax(0, 1fr))",
                            gap: "8px",
                          }}
                        >
                          <div style={infoCardStyle}>
                            <strong>Tip korekcije</strong>
                            <span>
                              {nazivKorekcije(
                                zadatak.tipKorekcije ??
                                  zadatak.preparat?.korekcijaTip ??
                                  null
                              )}
                            </span>
                          </div>

                          <div style={infoCardStyle}>
                            <strong>Trenutna vrijednost</strong>
                            <span>
                              {zadatak.trenutnaVrijednost != null
                                ? `${fmt(zadatak.trenutnaVrijednost, 2)} ${
                                    zadatak.preparat?.korekcijaJedinica ?? ""
                                  }`
                                : "-"}
                            </span>
                          </div>

                          <div style={infoCardStyle}>
                            <strong>Željena vrijednost</strong>
                            <span>
                              {zadatak.zeljenaVrijednost != null
                                ? `${fmt(zadatak.zeljenaVrijednost, 2)} ${
                                    zadatak.preparat?.korekcijaJedinica ?? ""
                                  }`
                                : "-"}
                            </span>
                          </div>

                          <div style={infoCardStyle}>
                            <strong>Korekcijski preparat</strong>
                            <span>
                              {zadatak.preparat?.naziv ??
                                prvaStavka?.preparat?.naziv ??
                                "-"}
                            </span>
                          </div>
                        </div>
                      )}

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile
                            ? "1fr"
                            : "repeat(2, minmax(0, 1fr))",
                          gap: "8px",
                        }}
                      >
                        <div style={infoCardStyle}>
                          <strong>Zadao</strong>
                          <span>{zadatak.zadaoKorisnik?.ime ?? "-"}</span>
                        </div>

                        <div style={infoCardStyle}>
                          <strong>Tip</strong>
                          <span>
                            {zadatak.parentZadatakId
                              ? "Vezani drugi korak"
                              : zadatak.tipZadatka === "VEZANI"
                              ? "Vezani prvi korak"
                              : "Standardni"}
                          </span>
                        </div>
                      </div>

                      {zadatak.tipZadatka === "VEZANI" &&
                        !zadatak.parentZadatakId && (
                          <div style={softPanelStyle}>
                            <div>
                              <strong>Vezana radnja:</strong>{" "}
                              {nazivVrste(zadatak.vezanaVrsta ?? "-")}
                            </div>
                            <div>
                              <strong>Nakon dana:</strong>{" "}
                              {zadatak.vezaniBrojDana != null
                                ? `${zadatak.vezaniBrojDana} dana`
                                : "-"}
                            </div>
                          </div>
                        )}

                      {zadatak.parentZadatakId && zadatak.zakljucanDo && (
                        <div
                          style={{
                            padding: "10px",
                            background: zakljucan ? "#fbf7f6" : "#f7faf8",
                            border: zakljucan
                              ? "1px solid #ead7d0"
                              : "1px solid #d7e5db",
                            color: zakljucan ? "#7b5d52" : "#476454",
                            fontSize: "13px",
                          }}
                        >
                          {zakljucan
                            ? `Ovaj zadatak može se izvršiti od ${formatirajDatum(
                                zadatak.zakljucanDo
                              )}`
                            : "Vezani zadatak je otključan i spreman za izvršenje."}
                        </div>
                      )}

                      {kasni && (
                        <div style={lateWarningStyle}>
                          Rok za ovaj korak je prošao. Zadatak čeka izvršenje.
                        </div>
                      )}

                      <div style={buttonsRowStyle}>
                        {isLevel1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => spremiPromjeneZadatka(zadatak)}
                              style={primaryButtonStyle}
                            >
                              Spremi
                            </button>

                            <button
                              type="button"
                              onClick={() => obrisiZadatak(zadatak.id)}
                              style={deleteButtonStyle}
                            >
                              Obriši
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => izvrsiZadatak(zadatak.id)}
                          disabled={izvrsavanjeId === zadatak.id || zakljucan}
                          style={{
                            ...actionButtonStyle,
                            opacity:
                              izvrsavanjeId === zadatak.id || zakljucan ? 0.65 : 1,
                            cursor:
                              izvrsavanjeId === zadatak.id || zakljucan
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          {izvrsavanjeId === zadatak.id
                            ? "Izvršavam..."
                            : zadatak.parentZadatakId
                            ? "Izvrši 2"
                            : "Izvrši 1"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      <KorekcijaModal
        otvoren={korekcijaOpen}
        onClose={() => setKorekcijaOpen(false)}
        tank={
          odabraniTank
            ? {
                id: odabraniTank.id,
                broj: odabraniTank.broj,
                tip: odabraniTank.tip,
                kolicinaVinaUTanku:
                  odabraniTank.kolicinaVinaUTanku ?? kolicinaVinaUTanku ?? 0,
              }
            : null
        }
        zadnjeMjerenje={zadnjeMjerenjeZaKorekciju}
        preparati={preparatiZaKorekciju}
        onSaved={async () => {
          setKorekcijaOpen(false);
          setVrstaZadatka("DODAVANJE");
          setStavke([praznaStavka()]);
          setNaslov("Dodavanje preparata");
          setNapomena("");
          await ucitajZadatke();
          await ucitajPreparate();
        }}
      />
    </>
  );
}

const pageStyle: CSSProperties = {
  padding: "16px",
  maxWidth: "1600px",
  margin: "0 auto",
  background: "#f4f4f5",
  minHeight: "100vh",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  color: "#2f2f2f",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const pageTitleStyle: CSSProperties = {
  fontSize: "24px",
  fontWeight: 600,
  margin: 0,
  color: "#3b2b31",
};

const pageSubtitleStyle: CSSProperties = {
  color: "#6b6470",
  marginTop: "4px",
  fontSize: "13px",
};

const statsWrapStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const panelStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
  padding: "14px",
};

const panelHeaderStyle: CSSProperties = {
  marginBottom: "12px",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 600,
  color: "#3b2b31",
};

const sectionSubtitleStyle: CSSProperties = {
  color: "#6b6470",
  marginTop: "4px",
  fontSize: "13px",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const infoCardStyle: CSSProperties = {
  background: "#fbfbfb",
  border: "1px solid rgba(127,29,29,0.10)",
  padding: "10px",
  display: "grid",
  gap: "4px",
  color: "#2f2f2f",
  fontSize: "13px",
};

const summaryBoxStyle: CSSProperties = {
  padding: "12px",
  background: "#fbfbfb",
  border: "1px solid rgba(127,29,29,0.10)",
  display: "grid",
  gap: "6px",
  color: "#3a3337",
  fontSize: "13px",
};

const softPanelStyle: CSSProperties = {
  padding: "10px",
  background: "#fafafa",
  border: "1px solid rgba(127,29,29,0.10)",
  display: "grid",
  gap: "5px",
  color: "#4c4448",
  fontSize: "13px",
};

const subSectionStyle: CSSProperties = {
  padding: "12px",
  border: "1px solid rgba(127,29,29,0.12)",
  background: "#fcfcfc",
  display: "grid",
  gap: "10px",
};

const subSectionTitleStyle: CSSProperties = {
  fontWeight: 600,
  color: "#3b2b31",
  fontSize: "14px",
};

const stavkaBoxStyle: CSSProperties = {
  padding: "12px",
  border: "1px solid rgba(127,29,29,0.12)",
  background: "#ffffff",
  display: "grid",
  gap: "10px",
};

const stavkaHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const stavkaListBoxStyle: CSSProperties = {
  padding: "10px",
  border: "1px solid rgba(127,29,29,0.10)",
  background: "#fcfcfc",
  display: "grid",
  gap: "8px",
};

const stavkaListGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "8px",
};

const messageBoxStyle: CSSProperties = {
  marginBottom: "12px",
  padding: "10px 12px",
  background: "#faf6f7",
  border: "1px solid rgba(127,29,29,0.16)",
  color: "#4f3740",
  fontWeight: 600,
  fontSize: "13px",
};

const emptyBoxStyle: CSSProperties = {
  padding: "12px",
  background: "#fbfbfb",
  border: "1px dashed rgba(127,29,29,0.16)",
  color: "#6d6367",
  fontSize: "13px",
};

const lateWarningStyle: CSSProperties = {
  padding: "10px",
  background: "#fbf5f5",
  border: "1px solid #efcfcf",
  color: "#8c2a2a",
  fontWeight: 600,
  fontSize: "13px",
};

const statCardStyle: CSSProperties = {
  minWidth: "120px",
  padding: "8px 12px",
  border: "1px solid rgba(127,29,29,0.18)",
  background: "#ffffff",
  color: "#4a2d36",
};

const statCardNeutralStyle: CSSProperties = {
  minWidth: "120px",
  padding: "8px 12px",
  border: "1px solid rgba(127,29,29,0.12)",
  background: "#fafafa",
  color: "#4a2d36",
};

const statLabelStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
};

const statValueStyle: CSSProperties = {
  fontSize: "22px",
  fontWeight: 600,
  marginTop: "2px",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "5px",
  fontWeight: 600,
  fontSize: "13px",
  color: "#3b2b31",
};

const smallLabelStyle: CSSProperties = {
  display: "block",
  marginBottom: "5px",
  fontWeight: 600,
  fontSize: "12px",
  color: "#3b2b31",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  border: "1px solid rgba(127,29,29,0.18)",
  background: "#fff",
  color: "#2f2f2f",
  outline: "none",
  borderRadius: 0,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  fontSize: "13px",
};

const primaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  border: "1px solid rgba(127,29,29,0.22)",
  cursor: "pointer",
  fontWeight: 600,
  background: "#ffffff",
  color: "#7f1d1d",
  borderRadius: 0,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const actionButtonStyle: CSSProperties = {
  padding: "9px 14px",
  border: "1px solid rgba(127,29,29,0.22)",
  cursor: "pointer",
  fontWeight: 600,
  background: "#7f1d1d",
  color: "#ffffff",
  borderRadius: 0,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  border: "1px solid rgba(127,29,29,0.18)",
  cursor: "pointer",
  fontWeight: 600,
  background: "#ffffff",
  color: "#4a2d36",
  borderRadius: 0,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const deleteButtonStyle: CSSProperties = {
  padding: "9px 14px",
  border: "1px solid rgba(127,29,29,0.16)",
  cursor: "pointer",
  fontWeight: 600,
  background: "#faf5f5",
  color: "#8c2a2a",
  borderRadius: 0,
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
};

const badgeWineStyle: CSSProperties = {
  padding: "4px 10px",
  background: "#fafafa",
  color: "#7f1d1d",
  border: "1px solid rgba(127,29,29,0.16)",
  fontSize: "12px",
  fontWeight: 600,
};

const badgePurpleStyle: CSSProperties = {
  padding: "4px 10px",
  background: "#fafafa",
  color: "#5b3b63",
  border: "1px solid rgba(91,59,99,0.16)",
  fontSize: "12px",
  fontWeight: 600,
};

const badgeBlueStyle: CSSProperties = {
  padding: "4px 10px",
  background: "#fafafa",
  color: "#3b546d",
  border: "1px solid rgba(59,84,109,0.16)",
  fontSize: "12px",
  fontWeight: 600,
};

const badgeLateStyle: CSSProperties = {
  padding: "4px 10px",
  background: "#fbf5f5",
  color: "#991b1b",
  border: "1px solid #efcfcf",
  fontSize: "12px",
  fontWeight: 600,
};

const taskHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "center",
};

const taskTitleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: "16px",
  color: "#3b2b31",
};

const taskSubStyle: CSSProperties = {
  color: "#6b6470",
  marginTop: "3px",
  fontSize: "12px",
};

const buttonsRowStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};