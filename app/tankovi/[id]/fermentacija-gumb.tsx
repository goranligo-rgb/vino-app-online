"use client";

/**
 * Gumb granice fermentacije u zaglavlju tanka.
 *
 * Jedan gumb, dva stanja:
 *   nema otvorene  -> "Fermentacija počela"   -> POST  /api/fermentacija
 *   ima otvorenu   -> "Fermentacija završila" -> PATCH /api/fermentacija
 *
 * Kad se zatvori, stranica se osvjezi i gumb se vrati na "počela" — isti tank
 * kroz sezonu ima vise fermentacija i to je normalno, ne greska.
 *
 * DATUM SE BIRA, NE PODRAZUMIJEVA. Polje je predpopunjeno (danas, ili ponudeni
 * datum dodavanja preparata), ali se uvijek vidi i uvijek se dade promijeniti —
 * fermentacija je pocela kad je pocela, a ne kad je netko stigao kliknuti.
 *
 * PONUDA NIJE UPIS. Kad tank ima izvrsen zadatak DODAVANJE, njegov datum se
 * NUDI kao pocetak. Prihvati li ga korisnik, ruta zapise `pocetakIzvor =
 * IZ_ZADATKA`; upise li svoj datum, ostaje `RUCNO`. Ispis tako moze reci je li
 * datum tvrdnja ili potvrden izvod, umjesto da se to kasnije pogadja.
 *
 * Rola se NE cita iz localStorage. Stranica je server-komponenta i ima je iz
 * potpisane sesije; ovdje dolazi kao gotov `smije` prop. Skrivanje gumba je
 * uljudnost prema korisniku — pravu bravu drzi ruta.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OtvorenaFermentacija = {
  id: string;
  pocetakAt: string;
  kvasacNaziv: string | null;
};

export type PonudaKvasca = {
  zadatakId: string;
  izvrsenoAt: string;
  /** Nazivi preparata iz tog zadatka, radi prikaza. */
  preparati: string[];
};

/** `Date` -> "YYYY-MM-DD" u LOKALNOJ zoni. `toISOString` bi ovdje pomaknuo dan. */
function zaInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "YYYY-MM-DD" -> podne po lokalnom vremenu. */
function izInputa(s: string): Date | null {
  const [g, m, d] = s.split("-").map(Number);
  if (!g || !m || !d) return null;
  const dat = new Date(g, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(dat.getTime()) ? null : dat;
}

function hrDatum(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("hr-HR");
}

export default function FermentacijaGumb({
  tankId,
  brojTanka,
  smije,
  otvorena,
  ponuda,
  tankJePrazan,
  style,
}: {
  tankId: string;
  brojTanka: number;
  smije: boolean;
  otvorena: OtvorenaFermentacija | null;
  ponuda: PonudaKvasca | null;
  tankJePrazan: boolean;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [greska, setGreska] = useState("");

  const zatvaranje = !!otvorena;

  const [datum, setDatum] = useState(() =>
    zaInput(
      !zatvaranje && ponuda ? new Date(ponuda.izvrsenoAt) : new Date()
    )
  );
  const [izZadatka, setIzZadatka] = useState(() => !zatvaranje && !!ponuda);

  if (!smije) return null;

  function otvoriModal() {
    setGreska("");
    setDatum(zaInput(!zatvaranje && ponuda ? new Date(ponuda.izvrsenoAt) : new Date()));
    setIzZadatka(!zatvaranje && !!ponuda);
    setOpen(true);
  }

  async function posalji() {
    const kad = izInputa(datum);
    if (!kad) {
      setGreska("Odaberite datum.");
      return;
    }

    setLoading(true);
    setGreska("");

    try {
      const res = await fetch("/api/fermentacija", {
        method: zatvaranje ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          zatvaranje
            ? { id: otvorena!.id, krajAt: kad.toISOString() }
            : {
                tankId,
                pocetakAt: kad.toISOString(),
                // Zadatak se salje SAMO ako je ponudeni datum ostao netaknut.
                // Cim ga korisnik promijeni, to vise nije taj dogadaj i upis
                // ne smije tvrditi da jest.
                ...(izZadatka && ponuda ? { kvasacZadatakId: ponuda.zadatakId } : {}),
              }
        ),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setGreska(data?.error || "Spremanje nije uspjelo.");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setGreska("Spremanje nije uspjelo.");
    } finally {
      setLoading(false);
    }
  }

  const naslov = zatvaranje ? "Fermentacija završila" : "Fermentacija počela";

  return (
    <>
      <button onClick={otvoriModal} style={{ ...(style || {}), cursor: "pointer" }}>
        {naslov}
      </button>

      {open ? (
        <div
          onClick={() => (loading ? null : setOpen(false))}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: 14,
              padding: 20,
              width: "100%",
              maxWidth: 420,
              display: "grid",
              gap: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {naslov} — tank {brojTanka}
              </div>

              {zatvaranje ? (
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  Počela {hrDatum(otvorena!.pocetakAt)}
                  {otvorena!.kvasacNaziv ? `, kvasac ${otvorena!.kvasacNaziv}` : ""}.
                </div>
              ) : null}
            </div>

            {/* Otvorena fermentacija na praznom tanku nije greska — vino je
                otislo dalje, a dnevnik se zatvara ondje gdje je i otvoren.
                Kaze se naglas da nitko ne pomisli da gumb visi zabunom. */}
            {zatvaranje && tankJePrazan ? (
              <div
                style={{
                  fontSize: 13,
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  color: "#9a3412",
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                Tank je prazan — vino je vjerojatno pretočeno dalje. Fermentacija
                se svejedno zatvara ovdje, jer je ovdje i otvorena.
              </div>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>
                {zatvaranje ? "Datum kraja" : "Datum početka"}
              </span>
              <input
                type="date"
                value={datum}
                max={zaInput(new Date())}
                onChange={(e) => {
                  setDatum(e.target.value);
                  // Promijenjen datum vise nije "iz zadatka".
                  if (ponuda && e.target.value !== zaInput(new Date(ponuda.izvrsenoAt))) {
                    setIzZadatka(false);
                  }
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  fontSize: 15,
                }}
              />
            </label>

            {!zatvaranje && ponuda ? (
              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 13,
                  color: "#374151",
                }}
              >
                <input
                  type="checkbox"
                  checked={izZadatka}
                  onChange={(e) => {
                    setIzZadatka(e.target.checked);
                    if (e.target.checked) setDatum(zaInput(new Date(ponuda.izvrsenoAt)));
                  }}
                  style={{ marginTop: 3 }}
                />
                <span>
                  Početak je dodavanje preparata {hrDatum(ponuda.izvrsenoAt)}
                  {ponuda.preparati.length > 0 ? ` (${ponuda.preparati.join(", ")})` : ""}.
                </span>
              </label>
            ) : null}

            {greska ? (
              <div
                style={{
                  fontSize: 13,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                {greska}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: loading ? "default" : "pointer",
                }}
              >
                Odustani
              </button>
              <button
                onClick={posalji}
                disabled={loading}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111827",
                  color: "#ffffff",
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Spremam…" : zatvaranje ? "Zatvori" : "Otvori"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
