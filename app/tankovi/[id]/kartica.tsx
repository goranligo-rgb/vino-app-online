import type React from "react";

/**
 * Kartica sadrzaja.
 *
 * ZASTO ZASEBNA DATOTEKA: dosad je zivjela u page.tsx, sto je posluzitelju bilo
 * dovoljno. Kartica Berba od 24.08.2026 ima kvacicu koja skuplja njezin sadrzaj,
 * a kvacica trazi stanje — dakle klijentsku komponentu. Da je Card ostao u
 * page.tsx, klijent bi ga morao prepisati. Ovdje ga oboje uvoze i chrome kartice
 * postoji u jednom primjerku.
 *
 * `broj` — broj zapisa ide u SAM NASLOV: "Izvrseni zadaci (12)". Sklopljena
 * kartica bez toga ne kaze ima li unutra ista, pa se otvara napamet.
 *
 * `sklopljena` — prikazuje se kao <details>. Otvorene ostaju samo one koje se
 * gledaju svaki put: parametri, berba, temperatura i otvoreni zadaci. Povijest
 * se otvara po potrebi — na mobitelu je to razlika izmedju jednog ekrana i
 * beskrajnog listanja.
 *
 * `kontrola` — prekidac u zaglavlju, desno od naslova. Ne ide uz `sklopljena`:
 * <summary> vec cijeli reagira na klik, pa bi kvacica u njemu hvatala isti klik
 * dvaput. Kartica koja treba prekidac stoji otvorena.
 */
export function Card({
  title,
  broj,
  pod,
  sklopljena,
  kontrola,
  children,
}: {
  title: string;
  broj?: number;
  pod?: string | null;
  sklopljena?: boolean;
  kontrola?: React.ReactNode;
  children: React.ReactNode;
}) {
  const zaglavlje = (
    <>
      <span>
        {title}
        {broj != null ? <span style={cardBrojStyle}> ({broj})</span> : null}
      </span>
      {pod ? <span style={cardPodStyle}>{pod}</span> : null}
    </>
  );

  if (sklopljena) {
    return (
      <details style={cardStyle}>
        <summary style={{ ...cardTitleStyle, cursor: "pointer", marginBottom: 0 }}>
          {zaglavlje}
        </summary>
        <div style={{ marginTop: 12 }}>{children}</div>
      </details>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>
        {zaglavlje}
        {kontrola}
      </div>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(127,29,29,0.18)",
  marginTop: 10,
  borderRadius: 0,
};

const cardTitleStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid rgba(127,29,29,0.18)",
  fontSize: 13,
  fontWeight: 600,
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const cardBrojStyle: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontWeight: 800,
};

const cardPodStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "none",
  letterSpacing: 0,
};
