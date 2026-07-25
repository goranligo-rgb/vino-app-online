"use client";

import { useEffect, useRef, useState } from "react";

export type SlikaPrikaz = {
  id: string;
  tip: "PRIJE" | "POSLIJE";
  url: string; // potpisani URL (istekne)
  putnikIme: string | null;
  createdAt: string; // ISO — za pravilo "isti dan"
};

type Korisnik = { ime: string | null; role: string | null };

type Props = {
  posjetId: string;
  slike: SlikaPrikaz[];
};

// Trenutni korisnik iz auth_user cookieja (isti izvor kao server; httpOnly:false).
// Služi SAMO za skrivanje gumba — pravu provjeru radi server (DELETE ruta).
function citajKorisnika(): Korisnik {
  if (typeof document === "undefined") return { ime: null, role: null };
  try {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith("auth_user="))
      ?.slice("auth_user=".length);
    if (!raw) return { ime: null, role: null };
    const u = JSON.parse(decodeURIComponent(raw));
    return { ime: u?.ime ?? null, role: u?.role ?? null };
  } catch {
    return { ime: null, role: null };
  }
}

// Isti kalendarski dan u zoni Europe/Zagreb (zrcali server formatHrDate).
function jeDanasZagreb(iso: string): boolean {
  const opts = { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" } as const;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.toLocaleDateString("en-GB", opts) === new Date().toLocaleDateString("en-GB", opts);
}

// Pravilo prava (UI): admin uvijek; inače vlastita slika i isti dan snimanja.
function smijeObrisati(s: SlikaPrikaz, k: Korisnik): boolean {
  if (k.role === "ADMIN") return true;
  const vlastita = !!s.putnikIme && !!k.ime && s.putnikIme === k.ime;
  return vlastita && jeDanasZagreb(s.createdAt);
}

// Kompresija u pregledniku PRIJE slanja: skaliraj na max 1600px duzu stranicu i
// spremi kao JPEG q0.72. Tako s terena (slaba mreza) ide par stotina KB umjesto
// nekoliko MB. Vraca novi File (uvijek image/jpeg).
async function komprimiraj(file: File): Promise<File> {
  const MAX = 1600;
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("Citanje slike nije uspjelo."));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Ucitavanje slike nije uspjelo."));
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (width > MAX || height > MAX) {
    if (width >= height) {
      height = Math.round((height * MAX) / width);
      width = MAX;
    } else {
      width = Math.round((width * MAX) / height);
      height = MAX;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // bez canvasa - posalji original
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob((b) => res(b), "image/jpeg", 0.72)
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}

function Grupa({
  posjetId,
  tip,
  naslov,
  slike,
  korisnik,
}: {
  posjetId: string;
  tip: "PRIJE" | "POSLIJE";
  naslov: string;
  slike: SlikaPrikaz[];
  korisnik: Korisnik;
}) {
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleOdabir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    setPoruka("");
    setLoading(true);
    try {
      const komprimirana = await komprimiraj(file);
      const fd = new FormData();
      fd.append("posjetId", posjetId);
      fd.append("tip", tip);
      fd.append("file", komprimirana);

      const res = await fetch("/api/putnik/posjet-slike", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPoruka(data?.error || "Greska kod spremanja slike.");
        return;
      }
      window.location.reload();
    } catch (err) {
      setPoruka(err instanceof Error ? err.message : "Greska kod spremanja slike.");
    } finally {
      setLoading(false);
    }
  }

  async function obrisi(id: string) {
    if (!window.confirm("Obrisati ovu sliku?")) return;
    setPoruka("");
    setLoading(true);
    try {
      const res = await fetch(`/api/putnik/posjet-slike?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPoruka(data?.error || "Greska kod brisanja slike.");
        return;
      }
      window.location.reload();
    } catch (err) {
      setPoruka(err instanceof Error ? err.message : "Greska kod brisanja slike.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-orange-100 bg-orange-50/40 p-3">
      <label className="flex w-full cursor-pointer items-center justify-center gap-2 border-2 border-orange-400 bg-gradient-to-b from-orange-100 to-amber-100 px-4 py-4 text-[16px] font-bold text-orange-950 hover:brightness-105">
        {loading ? "Spremanje..." : `📷 Kamera ${naslov.toLowerCase()}`}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={loading}
          onChange={handleOdabir}
        />
      </label>

      {slike.length === 0 ? (
        <div className="mt-2 text-[13px] text-stone-500">Nema slika.</div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slike.map((s) => (
            <div key={s.id} className="group relative border border-orange-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={s.url}
                  alt={naslov}
                  className="h-32 w-full object-cover"
                  loading="lazy"
                />
              </a>
              {smijeObrisati(s, korisnik) ? (
                <button
                  type="button"
                  onClick={() => obrisi(s.id)}
                  disabled={loading}
                  className="absolute right-1 top-1 border border-red-300 bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                >
                  Obriši
                </button>
              ) : null}
              {s.putnikIme ? (
                <div className="truncate px-1 py-0.5 text-[10px] text-stone-500">
                  {s.putnikIme}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {poruka ? (
        <div className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
          {poruka}
        </div>
      ) : null}
    </div>
  );
}

export default function PosjetSlike({ posjetId, slike }: Props) {
  // Korisnik se čita na klijentu (nakon mounta) — do tada gumb "Obriši" skriven.
  const [korisnik, setKorisnik] = useState<Korisnik>({ ime: null, role: null });
  useEffect(() => setKorisnik(citajKorisnika()), []);

  const prije = slike.filter((s) => s.tip === "PRIJE");
  const poslije = slike.filter((s) => s.tip === "POSLIJE");

  return (
    <div className="border border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4">
      <div className="border-b border-orange-200 pb-3">
        <h2 className="text-[22px] font-bold text-stone-800">📷 Kamera — prije i poslije</h2>
        <p className="mt-1 text-[13px] text-stone-500">
          Slikaj stanje police prije i poslije. Slika se komprimira prije slanja; lošu snimku
          možeš obrisati isti dan (svoju); starije briše samo Level 1.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Grupa posjetId={posjetId} tip="PRIJE" naslov="Prije" slike={prije} korisnik={korisnik} />
        <Grupa posjetId={posjetId} tip="POSLIJE" naslov="Poslije" slike={poslije} korisnik={korisnik} />
      </div>
    </div>
  );
}
