import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Role = "ADMIN" | "PODRUM" | "ENOLOG" | "PREGLED";

function getRole(req: NextRequest): Role | null {
  const raw = req.cookies.get("auth_user")?.value;
  if (!raw) return null;

  try {
    const user = JSON.parse(decodeURIComponent(raw));
    return user?.role ?? null;
  } catch {
    return null;
  }
}

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const role = getRole(req);

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

  // LEVEL 2 sve osim reset i korisnici
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