"use client";

/**
 * Prekidac "SMS obavijesti" za jedan tank.
 *
 * Koristi se na plocici dashboarda hladjenja i na kartici Hladjenje u monitoru
 * tanka - ista postavka, isti server action, ista prava.
 *
 * VAZNO: ovo NE gasi alarm. TankAlarm se i dalje otvara, crveni badge i brojaci
 * ostaju - utisava se samo SMS. Zato, kad je prekidac iskljucen a tank JE u
 * alarmu, uz njega stoji upozorenje: da se odmah vidi zasto poruka ne stize.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postaviSmsObavijesti } from "./actions";

export default function SmsPrekidac({
  tankId,
  tankBroj,
  smsAktivan,
  smijeUpravljati,
  uAlarmu,
}: {
  tankId: string;
  tankBroj: number;
  smsAktivan: boolean;
  smijeUpravljati: boolean;
  uAlarmu: boolean;
}) {
  const [aktivan, setAktivan] = useState(smsAktivan);
  const [greska, setGreska] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Iskljucen prekidac na tanku koji bas sad zvoni - to se mora vidjeti.
  const utisan = !aktivan && uAlarmu;

  function prebaci() {
    const novo = !aktivan;
    if (
      !novo &&
      !window.confirm(
        `Tank ${tankBroj}: isključiti SMS obavijesti?\n\n` +
          "Alarm će se i dalje otvarati i tank će na ekranu ostati crven — " +
          "samo SMS neće stizati."
      )
    ) {
      return;
    }

    setGreska(null);
    setAktivan(novo); // odmah, da prekidac ne "visi" do osvjezavanja
    start(async () => {
      const r = await postaviSmsObavijesti({ tankId, aktivan: novo });
      if (!r.ok) {
        setAktivan(!novo); // vrati na staro - postavka nije spremljena
        setGreska(r.error ?? "Greška.");
        return;
      }
      router.refresh();
    });
  }

  const boje = aktivan
    ? { bg: "#eef7f0", border: "#8db79a", text: "#2f6b43" }
    : utisan
      ? { bg: "#fdecec", border: "#c0392b", text: "#a11d1d" }
      : { bg: "#f1f3f5", border: "#c8ccd0", text: "#5c6469" };

  const oznaka = `SMS ${aktivan ? "UKLJ" : "ISKLJ"}`;
  const opis = aktivan
    ? "SMS obavijesti za ovaj tank su uključene. Klik ih isključuje."
    : "SMS obavijesti za ovaj tank su isključene. Alarm se i dalje bilježi i prikazuje.";

  return (
    <div style={{ display: "grid", gap: 3, justifyItems: "flex-end" }}>
      {smijeUpravljati ? (
        <button
          type="button"
          onClick={prebaci}
          disabled={pending}
          title={opis}
          aria-pressed={aktivan}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 0,
            fontSize: 11,
            fontWeight: 700,
            background: boje.bg,
            border: `1px solid ${boje.border}`,
            color: boje.text,
            cursor: pending ? "wait" : "pointer",
            whiteSpace: "nowrap",
            touchAction: "manipulation",
            minHeight: 26,
          }}
        >
          <span aria-hidden style={{ fontSize: 12 }}>{aktivan ? "🔔" : "🔕"}</span>
          {oznaka}
        </button>
      ) : (
        <span
          title={opis}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            fontSize: 11,
            fontWeight: 700,
            background: boje.bg,
            border: `1px solid ${boje.border}`,
            color: boje.text,
            whiteSpace: "nowrap",
          }}
        >
          <span aria-hidden style={{ fontSize: 12 }}>{aktivan ? "🔔" : "🔕"}</span>
          {oznaka}
        </span>
      )}

      {utisan ? (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#a11d1d",
            textAlign: "right",
            lineHeight: 1.2,
          }}
        >
          alarm bez SMS-a
        </span>
      ) : null}

      {greska ? (
        <span style={{ fontSize: 10, color: "#a11d1d", fontWeight: 600, textAlign: "right" }}>
          {greska}
        </span>
      ) : null}
    </div>
  );
}
