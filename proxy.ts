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

  // Preparati: uredivanje je ADMIN + ENOLOG. PODRUM ovdje SAMO gleda — smije
  // pregled stanja skladista, ne i /preparat (uredivanje i brzi unos zalihe).
  if (
    role === "PODRUM" &&
    jePreparat(pathname) &&
    pathname !== "/preparat/stanje"
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // LEVEL 2 sve osim reset, korisnika i uredivanja preparata
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
      pathname.startsWith("/putnik");

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
  ],
};