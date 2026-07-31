import { NextResponse } from "next/server";
import { AUTH_COOKIE, opcijeKolacica } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ success: true });

  res.cookies.set(AUTH_COOKIE, "", {
    ...opcijeKolacica(),
    expires: new Date(0),
  });

  return res;
}
