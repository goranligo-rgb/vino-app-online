import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  obnoviTokenAkoTreba,
  opcijeTrajnogKolacica,
  provjeriToken,
} from "@/lib/auth-token";
import { putanjaPrijave, ZAGLAVLJE_PUTANJE } from "@/lib/sigurna-putanja";

type Role = "ADMIN" | "PODRUM" | "ENOLOG" | "PREGLED";

/** /preparat i sve ispod njega. Ne hvata /statistika/preparati. */
function jePreparat(pathname: string): boolean {
  return pathname === "/preparat" || pathname.startsWith("/preparat/");
}

/** Putanja i upit zahtjeva, bez Nextova internog parametra za RSC. */
function putanjaZahtjeva(req: NextRequest): string {
  const url = req.nextUrl.clone();
  url.searchParams.delete("_rsc");
  return url.pathname + url.search;
}

/** Pusti zahtjev dalje i predaj stranici njezinu putanju (auth-sesija, adresaPrijave). */
function dalje(req: NextRequest): NextResponse {
  const zaglavlja = new Headers(req.headers);
  zaglavlja.set(ZAGLAVLJE_PUTANJE, putanjaZahtjeva(req));
  return NextResponse.next({ request: { headers: zaglavlja } });
}

// Rola se cita iz POTPISANOG tokena. Krivotvoren ili nepotpisan kolacic ne
// prolazi provjeru i tretira se kao "nije prijavljen".
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const user = await provjeriToken(token);
  const odgovor = odluci(req, user?.role ?? null);

  // Sesija traje 90 dana od zadnjeg koristenja. Obnova je i na preusmjeravanju,
  // jer je i to koristenje; /api/* nije u matcheru pa ne obnavlja.
  if (user) {
    const nov = await obnoviTokenAkoTreba(token);
    if (nov) odgovor.cookies.set(AUTH_COOKIE, nov, opcijeTrajnogKolacica());
  }

  return odgovor;
}

function odluci(req: NextRequest, role: Role | null): NextResponse {
  const pathname = req.nextUrl.pathname;

  if (!role) {
    return NextResponse.redirect(
      new URL(putanjaPrijave(putanjaZahtjeva(req)), req.url)
    );
  }

  // LEVEL 1 sve
  if (role === "ADMIN") {
    return dalje(req);
  }

  // Reset i korisnici samo LEVEL 1
  if (
    pathname.startsWith("/dashboard/reset") ||
    pathname.startsWith("/dashboard/korisnici")
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Preparati: PODRUM ima sve stranice — /preparat, /preparat/stanje i
  // /statistika/preparati. On fizicki radi inventuru pa upisuje i ispravlja.
  // Jedina zabrana je brisanje, a ono se cuva u API ruti (DELETE /api/preparat)
  // i skrivanjem gumba "Obriši" na stranici, ne ovdje.

  // LEVEL 2 sve osim reseta i korisnika
  if (role === "PODRUM") {
    return dalje(req);
  }

  // LEVEL 3: dashboard, hladjenje, zadaci, monitor, putnik + samo detalj tanka
  // iz monitora. Hladjenje je tocan match (ne prefiks) da se ne otvori nista
  // drugo pod /dashboard - enolog je ionako u ROLE_UPRAVLJANJE (lib/tank-komanda).
  if (role === "ENOLOG") {
    const allowed =
      pathname === "/dashboard" ||
      pathname === "/dashboard/hladjenje" ||
      // Preparati u cijelosti: enolog ih uredjuje, unosi zalihu i brise.
      // Prefiks, a ne tocan match — za razliku od hladjenja, ovdje rola ima
      // puna prava pa joj pripada i sve buduce pod /preparat.
      jePreparat(pathname) ||
      // Statistika potrosnje preparata ide uz ta prava. Tocan match: ostatak
      // /statistika (npr. sam indeks) enologu i dalje nije otvoren.
      pathname === "/statistika/preparati" ||
      pathname.startsWith("/zadaci") ||
      pathname.startsWith("/monitor") ||
      pathname.startsWith("/putnik") ||
      // Dodane uz matcher, da ova izmjena nikome ne oduzme pravo koje je imao:
      // dosad su bile izvan matchera pa ih je otvarao svatko. Jedina promjena
      // koja se ovdje zeli je da neprijavljeni ide na /login.
      pathname.startsWith("/sadrzaj-tanka") ||
      pathname.startsWith("/dodavanje") ||
      // Dnevnik fermentacije. Enolog odredjuje kad fermentacija pocinje i
      // zavrsava (vidi smijeUPodrumu u lib/auth-role.ts), pa mu i ispis
      // pripada. Prefiks, jer su i pregled sezone i pojedini dnevnik njegovi.
      pathname.startsWith("/fermentacija") ||
      // Tiskani izvjestaji podruma. Kartica ima red za biljesku enologa, pa je
      // on i naslovnik ispisa — bez ovoga bi ga allow-lista vracala na
      // /dashboard i vlastita provjera u ruti ne bi ni dosla na red.
      pathname.startsWith("/dashboard/izvjestaji") ||
      // Kucica iz sastava otvorena kao vino zamrznuto na trenutak ulaska.
      // Otvara se sa stranice tanka, koju enolog vidi, pa mu pripada i ona —
      // inace bi ga, kao kod /arhiva, klik vracao na /dashboard. Tocan match:
      // ruta nema podstranica, sve je u parametrima upita.
      pathname === "/prosli-tank" ||
      // Izlaz vina: ondje vodi poveznica na punu evidenciju vina koje je
      // napunjeno u boce ili prodano. Je li postupak valjao enologov je posao
      // (vlasnik, 29.09.2026.). Tocan match: ruta nema podstranica.
      pathname === "/izlaz-vina" ||
      /^\/tankovi\/[^/]+$/.test(pathname);

    if (!allowed) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return dalje(req);
  }

  // LEVEL 4: samo dashboard i putnik
  if (role === "PREGLED") {
    const allowed =
      pathname === "/dashboard" ||
      pathname.startsWith("/putnik") ||
      // Isti razlog kao kod enologa — vidi gore.
      pathname.startsWith("/sadrzaj-tanka") ||
      pathname.startsWith("/dodavanje");

    if (!allowed) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return dalje(req);
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/zadaci/:path*",
    "/monitor/:path*",
    "/putnik/:path*",
    "/tankovi/:path*",
    "/mjerenje/:path*",
    "/preparat/:path*",
    "/pretok/:path*",
    "/punjenje/:path*",
    "/izlaz-vina/:path*",
    "/statistika/:path*",
    "/berba/:path*",
    "/arhiva/:path*",
    // Ove dvije su nedostajale, pa su bile otvorene bez prijave — jednako kao
    // API rute koje zovu. Bez njih bi neprijavljeni posjetitelj dobio praznu
    // stranicu (jer API sad vraca 401) umjesto poziva na prijavu.
    "/sadrzaj-tanka/:path*",
    "/dodavanje/:path*",
    // Dnevnik fermentacije. Mora biti OVDJE, ne samo u allow-listi: sto nije
    // u matcheru proxy uopce ne vidi, pa bi stranica bila otvorena svakome
    // tko zna URL — isti propust koji su dvije gornje vec imale.
    "/fermentacija/:path*",
    // Isti razlog: bez ovoga proxy rutu ne vidi, pa je otvara svaka
    // prijavljena rola koja zna adresu, i PREGLED.
    "/prosli-tank/:path*",
  ],
};