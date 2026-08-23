import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, provjeriToken } from "@/lib/auth-token";

type Role = "ADMIN" | "PODRUM" | "ENOLOG" | "PREGLED";

// Rola se cita iz POTPISANOG tokena. Krivotvoren ili nepotpisan kolacic ne
// prolazi provjeru i tretira se kao "nije prijavljen".
async function getRole(req: NextRequest): Promise<Role | null> {
  const user = await provjeriToken(req.cookies.get(AUTH_COOKIE)?.value);
  return user?.role ?? null;
}

/** /preparat i sve ispod njega. Ne hvata /statistika/preparati. */
function jePreparat(pathname: string): boolean {
  return pathname === "/preparat" || pathname.startsWith("/preparat/");
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const role = await getRole(req);

  if (!role) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // LEVEL 1 sve
  if (role === "ADMIN") {
    return NextResponse.next();
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
    return NextResponse.next();
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
      /^\/tankovi\/[^/]+$/.test(pathname);

    if (!allowed) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
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

    return NextResponse.next();
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
  ],
};