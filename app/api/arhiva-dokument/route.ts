// Provjera prijave. Ove rute do 23.08.2026. nisu imale nikakvu — `proxy.ts`
// svojim matcherom pokriva stranice, ali ne i `/api/*`, pa su odgovarale
// svakome tko zna URL. Bez uvjeta na rolu: aplikacija to vec radi drugdje.
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/zadatak-auth";
import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  try {
    const formData = await req.formData();

    const file = formData.get("file") as File;
    const arhivaVinaId = formData.get("arhivaVinaId") as string;
    const naziv = formData.get("naziv") as string;
    const vrsta = formData.get("vrsta") as string;
    const napomena = formData.get("napomena") as string;

    if (!file || !arhivaVinaId) {
      return NextResponse.json({ error: "Nedostaju podaci" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileName = `${Date.now()}_${file.name}`;
    const uploadPath = path.join(process.cwd(), "public/uploads", fileName);

    await writeFile(uploadPath, buffer);

    const fileUrl = `/uploads/${fileName}`;

    const dokument = await prisma.arhivaVinaDokument.create({
      data: {
        arhivaVinaId,
        naziv,
        vrsta,
        fileName,
        fileUrl,
        mimeType: file.type,
        napomena,
      },
    });

    return NextResponse.json(dokument);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Greška servera" }, { status: 500 });
  }
}