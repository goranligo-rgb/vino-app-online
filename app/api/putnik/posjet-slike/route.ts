export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePutnikAccess } from "@/lib/putnik-auth";
import { uploadObjekt, obrisiObjekt, potpisaniUrl } from "@/lib/supabase-storage";
import { formatHrDate } from "@/lib/datum";

const TIPOVI = new Set(["PRIJE", "POSLIJE"]);

// Dopusteni formati i pripadna ekstenzija (kompresija na klijentu salje jpeg).
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_BYTE = 8 * 1024 * 1024; // 8 MB - klijent komprimira, ovo je zastita

// GET: slike jednog posjeta s potpisanim URL-ovima (lazy - potpisuje se tek
// kad se posjet razgrne u povijesti, nikad sve odjednom).
export async function GET(req: Request) {
  const auth = await requirePutnikAccess();
  if (auth instanceof NextResponse) return auth;

  try {
    const posjetId = new URL(req.url).searchParams.get("posjetId")?.trim();
    if (!posjetId) {
      return NextResponse.json({ error: "Nedostaje posjetId." }, { status: 400 });
    }

    const redovi = await prisma.putnikPosjetSlika.findMany({
      where: { posjetId },
      orderBy: { createdAt: "asc" },
    });

    const slike = await Promise.all(
      redovi.map(async (s) => ({
        id: s.id,
        tip: s.tip,
        url: await potpisaniUrl(s.putanja),
        putnikIme: s.putnikIme,
        createdAt: s.createdAt,
      }))
    );

    return NextResponse.json({ slike });
  } catch (error) {
    console.error("Greska kod dohvata slika posjeta:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nepoznata greska kod dohvata slika." },
      { status: 500 }
    );
  }
}

// POST: upload jedne slike (prije/poslije) za postojeci posjet.
export async function POST(req: Request) {
  const auth = await requirePutnikAccess();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const fileEntry = formData.get("file");
    const posjetId = String(formData.get("posjetId") ?? "").trim();
    const tip = String(formData.get("tip") ?? "").trim();

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "Datoteka nije ispravno odabrana." }, { status: 400 });
    }
    if (!posjetId || !TIPOVI.has(tip)) {
      return NextResponse.json({ error: "Nedostaje posjet ili tip slike." }, { status: 400 });
    }

    const mime = fileEntry.type || "image/jpeg";
    if (!EXT[mime]) {
      return NextResponse.json(
        { error: "Dozvoljene su samo slike (JPEG, PNG, WEBP)." },
        { status: 400 }
      );
    }
    if (fileEntry.size > MAX_BYTE) {
      return NextResponse.json({ error: "Slika je prevelika (max 8 MB)." }, { status: 400 });
    }

    // Posjet mora postojati (FK + smislena greska prije uploada).
    const posjet = await prisma.putnikPosjet.findUnique({
      where: { id: posjetId },
      select: { id: true },
    });
    if (!posjet) {
      return NextResponse.json({ error: "Posjet ne postoji." }, { status: 404 });
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const putanja = `${posjetId}/${tip}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${EXT[mime]}`;

    await uploadObjekt(putanja, buffer, mime);

    const slika = await prisma.putnikPosjetSlika.create({
      data: {
        posjetId,
        tip: tip as "PRIJE" | "POSLIJE",
        putanja,
        mimeType: mime,
        velicinaByte: buffer.byteLength,
        putnikIme: auth.ime || null,
      },
    });

    return NextResponse.json(slika);
  } catch (error) {
    console.error("Greska kod spremanja slike posjeta:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nepoznata greska kod spremanja slike." },
      { status: 500 }
    );
  }
}

// DELETE: brisanje slike uz PRAVILO PRAVA (provjera na serveru, ne samo UI):
//  - ADMIN (L1): smije obrisati bilo koju sliku, bilo kad.
//  - Ostali putnici: SAMO vlastitu sliku (putnikIme = ja) i SAMO isti dan
//    (datum snimanja = danas, Europe/Zagreb). Inače 403.
// Prvo brisemo iz baze, pa sa Storagea: ako Storage zakaze, red je vec nestao
// i orphan datoteka je bezopasna (nigdje se ne referencira).
export async function DELETE(req: Request) {
  const auth = await requirePutnikAccess();
  if (auth instanceof NextResponse) return auth;

  try {
    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "Nedostaje id slike." }, { status: 400 });
    }

    const slika = await prisma.putnikPosjetSlika.findUnique({ where: { id } });
    if (!slika) {
      return NextResponse.json({ error: "Slika ne postoji." }, { status: 404 });
    }

    // Pravilo prava: admin uvijek; inače samo vlastita slika i isti dan.
    const jeAdmin = auth.role === "ADMIN";
    if (!jeAdmin) {
      const vlastita = !!slika.putnikIme && !!auth.ime && slika.putnikIme === auth.ime;
      const istiDan = formatHrDate(slika.createdAt) === formatHrDate(new Date());
      if (!vlastita || !istiDan) {
        return NextResponse.json(
          { error: "Smiješ obrisati samo vlastitu sliku i to isti dan snimanja." },
          { status: 403 }
        );
      }
    }

    await prisma.putnikPosjetSlika.delete({ where: { id } });
    await obrisiObjekt(slika.putanja);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Greska kod brisanja slike posjeta:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nepoznata greska kod brisanja slike." },
      { status: 500 }
    );
  }
}
