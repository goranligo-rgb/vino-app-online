"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * BRISANJE ZAPISA BERBE — preseljeno s liste /berba.
 *
 * Brise se IZVORNA STAVKA punjenja, a ruta povlaci tu berbu iz knjige i meko
 * obrise zapis. Isti poziv i isto upozorenje kao prije na listi. Odbijanje
 * rute (npr. dio vina je vec pretocen dalje) ostaje na ekranu, ne u `alert`.
 */
export default function ObrisiBerbuGumb({
  stavkaId,
  opis,
}: {
  stavkaId: string;
  /** „Graševina (1.200 L)” — za potvrdu. */
  opis: string;
}) {
  const router = useRouter();
  const [brise, setBrise] = useState(false);
  const [greska, setGreska] = useState("");

  async function obrisi() {
    const potvrda = window.confirm(
      `Obrisati zapis berbe ${opis}?\n\n` +
        "Ovo znači da unos NIJE BIO TOČAN — to vino se povlači iz knjige. " +
        "Ako je vino stvarno otišlo iz tanka, ovo nije prava radnja."
    );
    if (!potvrda) return;

    setBrise(true);
    setGreska("");

    try {
      const res = await fetch(`/api/punjenje-stavka/${stavkaId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setGreska(data?.error || "Brisanje nije uspjelo.");
        return;
      }

      router.push("/berba");
      router.refresh();
    } catch (e) {
      console.error(e);
      setGreska("Brisanje nije uspjelo.");
    } finally {
      setBrise(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={obrisi}
        disabled={brise}
        className="border border-red-200 bg-gradient-to-b from-red-50 to-rose-50 px-3 py-2 text-[13px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {brise ? "Brišem..." : "Obriši zapis"}
      </button>
      {greska ? (
        <div className="max-w-[420px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {greska}
        </div>
      ) : null}
    </div>
  );
}
