export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const fileEntry = formData.get("file");
    const tankId = String(formData.get("tankId") ?? "");
    const naziv = String(formData.get("naziv") ?? "");
    const vrsta = String(formData.get("vrsta") ?? "");
    const napomenaRaw = formData.get("napomena");
    const datumDokumentaRaw = formData.get("datumDokumenta");
    const uploadedByUserIdRaw = formData.get("uploadedByUserId");
    const uploadedByImeRaw = formData.get("uploadedByIme");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "Datoteka nije ispravno odabrana." },
        { status: 400 }
      );
    }

    if (!tankId || !naziv || !vrsta) {
      return NextResponse.json(
        { error: "Nedostaju obavezni podaci." },
        { status: 400 }
      );
    }

    const allowedVrste = [
      "ANALIZA",
      "PUSTANJE_U_PROMET",
      "ZAVOD",
      "LAB_NALAZ",
      "PUNJENJE",
      "OSTALO",
    ];

    if (!allowedVrste.includes(vrsta)) {
      return NextResponse.json(
        { error: "Vrsta dokumenta nije ispravna." },
        { status: 400 }
      );
    }

    const bytes = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const originalName = fileEntry.name || "dokument";
    const safeOriginalName = originalName.replace(/[^\w.\-]/g, "_");
    const fileName = `${Date.now()}_${safeOriginalName}`;

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const uploadPath = path.join(uploadsDir, fileName);
    await writeFile(uploadPath, buffer);

    const fileUrl = `/uploads/${fileName}`;

    const dokument = await prisma.document.create({
      data: {
        tankId,
        naziv,
        vrsta: vrsta as any,
        fileName,
        fileUrl,
        mimeType: fileEntry.type || null,
        datumDokumenta:
          datumDokumentaRaw && String(datumDokumentaRaw).trim() !== ""
            ? new Date(String(datumDokumentaRaw))
            : null,
        napomena:
          napomenaRaw && String(napomenaRaw).trim() !== ""
            ? String(napomenaRaw)
            : null,
        uploadedByUserId:
          uploadedByUserIdRaw && String(uploadedByUserIdRaw).trim() !== ""
            ? String(uploadedByUserIdRaw)
            : null,
        uploadedByIme:
          uploadedByImeRaw && String(uploadedByImeRaw).trim() !== ""
            ? String(uploadedByImeRaw)
            : null,
      },
    });

    return NextResponse.json(dokument);
  } catch (error) {
    console.error("Greška kod spremanja dokumenta:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nepoznata greška kod spremanja dokumenta.",
      },
      { status: 500 }
    );
  }
}