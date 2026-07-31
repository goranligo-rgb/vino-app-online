export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { citajSesiju } from "@/lib/auth-sesija";

/**
 * Tko je prijavljen — za klijentske komponente. Kolacic je od sada httpOnly,
 * pa ga document.cookie ne vidi; ovo je zamjena za nekadasnje citanje iz JS-a.
 * Sluzi SAMO za prikaz (skrivanje kontrola); pravu zastitu i dalje rade proxy
 * i provjere u rutama/akcijama.
 */
export async function GET() {
  const user = await citajSesiju();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
