"use client";

import { useEffect, useState } from "react";
import { formatHrDateTime } from "@/lib/datum";

type Slika = {
  id: string;
  tip: "PRIJE" | "POSLIJE";
  url: string; // potpisani URL (istekne)
  putnikIme: string | null;
  createdAt: string;
};

// Collapse galerija jednog posjeta. URL-ovi se potpisuju LAZY - tek kad se posjet
// razgrne (ili odmah na mount ako je defaultOpen, za danasnji posjet). Tako se na
// otvaranje kartice lokala ne potpisuju slike svih posjeta odjednom.
export default function PosjetGalerija({
  posjetId,
  brojSlika,
  defaultOpen = false,
}: {
  posjetId: string;
  brojSlika: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slike, setSlike] = useState<Slika[]>([]);
  const [greska, setGreska] = useState("");

  async function ucitaj() {
    if (loaded || loading) return;
    setLoading(true);
    setGreska("");
    try {
      const res = await fetch(
        `/api/putnik/posjet-slike?posjetId=${encodeURIComponent(posjetId)}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setGreska(data?.error || "Greška kod dohvata slika.");
        return;
      }
      setSlike(data?.slike || []);
      setLoaded(true);
    } catch (e) {
      setGreska(e instanceof Error ? e.message : "Greška kod dohvata slika.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (defaultOpen) ucitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    const novo = !open;
    setOpen(novo);
    if (novo) ucitaj();
  }

  const prije = slike.filter((s) => s.tip === "PRIJE");
  const poslije = slike.filter((s) => s.tip === "POSLIJE");

  return (
    <div className="mt-3 border-t border-orange-100 pt-3">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-2 border border-orange-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-orange-900 hover:bg-orange-50"
      >
        <span>{open ? "▾" : "▸"}</span> 📷 Slike ({brojSlika})
      </button>

      {open ? (
        <div className="mt-2">
          {loading ? (
            <div className="text-[13px] text-stone-500">Učitavanje…</div>
          ) : null}
          {greska ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
              {greska}
            </div>
          ) : null}
          {loaded && slike.length === 0 ? (
            <div className="text-[13px] text-stone-500">Nema slika.</div>
          ) : null}
          {loaded && slike.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Grupa naslov="Prije" slike={prije} />
              <Grupa naslov="Poslije" slike={poslije} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Grupa({ naslov, slike }: { naslov: string; slike: Slika[] }) {
  return (
    <div className="border border-orange-100 bg-orange-50/40 p-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-800/70">
        {naslov}
      </div>
      {slike.length === 0 ? (
        <div className="mt-1 text-[12px] text-stone-400">—</div>
      ) : (
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slike.map((s) => (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block border border-orange-200 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.url}
                alt={naslov}
                className="h-28 w-full object-cover"
                loading="lazy"
              />
              <div className="px-1 py-0.5 text-[10px] text-stone-500">
                {formatHrDateTime(s.createdAt)}
                {s.putnikIme ? ` · ${s.putnikIme}` : ""}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
