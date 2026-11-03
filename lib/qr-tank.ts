/**
 * Skeniranje naljepnice tanka: sto se smije procitati i sto reci kad ne ide.
 * Cist kod, bez ovisnosti, da se moze testirati bez kamere i preglednika.
 */

export const NIJE_NALJEPNICA = "Ovo nije naljepnica tanka";

export type GreskaKamere = {
  poruka: string;
  /** Ima li smisla ponuditi "Pokusaj ponovno". */
  ponovno: boolean;
};

export const GRESKA_CITACA: GreskaKamere = {
  poruka: "Čitač se nije učitao. Provjeri vezu.",
  ponovno: true,
};

export const NEMA_KAMERE_U_PREGLEDNIKU: GreskaKamere = {
  poruka: "Kamera ovdje nije dostupna.",
  ponovno: false,
};

// Tank.id je uuid. Time ispadaju i /tankovi/qr i podstranice tanka.
const OBLIK = /^\/tankovi\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i;

/**
 * Iz teksta QR koda vraca putanju tanka unutar aplikacije, ili null.
 *
 * Domena je namjerno bilo koja, jer stare naljepnice znaju imati adresu deploya.
 * To je bezopasno zato sto se rezultat slaze iznova iz samog ID-a: domena, upit i
 * # se odbacuju, pa skenirani tekst ne moze odrediti nista osim koji je tank.
 */
export function putanjaTankaIzQr(tekst: string): string | null {
  let url: URL;
  try {
    url = new URL(tekst.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const pogodak = OBLIK.exec(url.pathname);
  return pogodak ? `/tankovi/${pogodak[1]}` : null;
}

/** Poruka prema imenu greske iz getUserMedia. */
export function opisGreskeKamere(ime: string | undefined): GreskaKamere {
  switch (ime) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        poruka:
          "Pristup kameri je odbijen. Dopusti kameru u postavkama telefona ili preglednika, pa pokušaj ponovno.",
        ponovno: true,
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return { poruka: "Kamera nije pronađena.", ponovno: false };
    case "NotReadableError":
      return {
        poruka: "Kameru trenutno koristi druga aplikacija.",
        ponovno: true,
      };
    default:
      return { poruka: "Kamera se nije pokrenula.", ponovno: true };
  }
}
