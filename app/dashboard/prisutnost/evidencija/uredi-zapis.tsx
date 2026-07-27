"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { urediZapis, dodajZapis, type Rezultat } from "../actions";

const polje = "border border-[#b0b6bd] bg-white px-2 py-1 text-[13px] outline-none";

/** "2026-07-28T07:12" iz Date — vrijednost za <input type="datetime-local"> u hrvatskoj zoni. */
function zaInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dijelovi = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => dijelovi.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

function Poruka({ r }: { r: Rezultat | null }) {
  if (!r) return null;
  return (
    <div
      style={{
        fontSize: 12,
        marginTop: 6,
        padding: "6px 8px",
        border: `1px solid ${r.ok ? "#8db79a" : "#e0776f"}`,
        background: r.ok ? "#eef7f0" : "#fdecec",
        color: r.ok ? "#2f6b43" : "#a11d1d",
      }}
    >
      {r.poruka}
    </div>
  );
}

/** Ispravak jednog zapisa (npr. zaboravljena odjava). Napomena je obavezna. */
export function UrediZapis({
  id,
  dolazakU,
  odlazakU,
  napomena,
}: {
  id: string;
  dolazakU: string;
  odlazakU: string | null;
  napomena: string | null;
}) {
  const router = useRouter();
  const [otvoren, setOtvoren] = useState(false);
  const [dolazak, setDolazak] = useState(zaInput(dolazakU));
  const [odlazak, setOdlazak] = useState(zaInput(odlazakU));
  const [biljeska, setBiljeska] = useState(napomena ?? "");
  const [r, setR] = useState<Rezultat | null>(null);
  const [radi, start] = useTransition();

  if (!otvoren) {
    return (
      <button type="button" className={polje} onClick={() => setOtvoren(true)}>
        uredi
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 260 }}>
      <label style={{ fontSize: 11, color: "#6b7075" }}>
        Dolazak
        <input
          type="datetime-local"
          className={polje}
          value={dolazak}
          onChange={(e) => setDolazak(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label style={{ fontSize: 11, color: "#6b7075" }}>
        Odlazak (prazno = i dalje otvoren)
        <input
          type="datetime-local"
          className={polje}
          value={odlazak}
          onChange={(e) => setOdlazak(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <input
        className={polje}
        placeholder="napomena (obavezno)"
        value={biljeska}
        onChange={(e) => setBiljeska(e.target.value)}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className={polje}
          disabled={radi || !biljeska.trim()}
          style={{ fontWeight: 700, background: "#eef7f0" }}
          onClick={() =>
            start(async () => {
              const rez = await urediZapis({ id, dolazakU: dolazak, odlazakU: odlazak, napomena: biljeska });
              setR(rez);
              if (rez.ok) {
                setOtvoren(false);
                router.refresh();
              }
            })
          }
        >
          {radi ? "spremam…" : "spremi"}
        </button>
        <button type="button" className={polje} onClick={() => setOtvoren(false)}>
          odustani
        </button>
      </div>
      <Poruka r={r} />
    </div>
  );
}

/** Ručna dopuna: cijeli zapis za korisnika koji se uopće nije prijavio. */
export function DodajZapis({ korisnici }: { korisnici: { id: string; ime: string }[] }) {
  const router = useRouter();
  const [otvoren, setOtvoren] = useState(false);
  const [userId, setUserId] = useState(korisnici[0]?.id ?? "");
  const [dolazak, setDolazak] = useState("");
  const [odlazak, setOdlazak] = useState("");
  const [biljeska, setBiljeska] = useState("");
  const [r, setR] = useState<Rezultat | null>(null);
  const [radi, start] = useTransition();

  if (!otvoren) {
    return (
      <button
        type="button"
        className={polje}
        style={{ fontWeight: 700 }}
        onClick={() => setOtvoren(true)}
      >
        + ručni unos zapisa
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid #cfcfcf", background: "#fff", padding: 12, display: "grid", gap: 8, maxWidth: 420 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Ručni unos zapisa</div>
      <select className={polje} value={userId} onChange={(e) => setUserId(e.target.value)}>
        {korisnici.map((k) => (
          <option key={k.id} value={k.id}>
            {k.ime}
          </option>
        ))}
      </select>
      <label style={{ fontSize: 11, color: "#6b7075" }}>
        Dolazak
        <input type="datetime-local" className={polje} value={dolazak} onChange={(e) => setDolazak(e.target.value)} style={{ display: "block", width: "100%" }} />
      </label>
      <label style={{ fontSize: 11, color: "#6b7075" }}>
        Odlazak (prazno = otvoren)
        <input type="datetime-local" className={polje} value={odlazak} onChange={(e) => setOdlazak(e.target.value)} style={{ display: "block", width: "100%" }} />
      </label>
      <input className={polje} placeholder="napomena (obavezno)" value={biljeska} onChange={(e) => setBiljeska(e.target.value)} />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className={polje}
          style={{ fontWeight: 700, background: "#eef7f0" }}
          disabled={radi || !userId || !dolazak || !biljeska.trim()}
          onClick={() =>
            start(async () => {
              const rez = await dodajZapis({ userId, dolazakU: dolazak, odlazakU: odlazak, napomena: biljeska });
              setR(rez);
              if (rez.ok) {
                setDolazak("");
                setOdlazak("");
                setBiljeska("");
                setOtvoren(false);
                router.refresh();
              }
            })
          }
        >
          {radi ? "spremam…" : "spremi"}
        </button>
        <button type="button" className={polje} onClick={() => setOtvoren(false)}>
          odustani
        </button>
      </div>
      <Poruka r={r} />
    </div>
  );
}
