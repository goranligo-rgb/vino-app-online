import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(new URL("/login", origin));

  res.cookies.set("auth_user", "", {
    path: "/",
    expires: new Date(0),
  });

  return res;
}