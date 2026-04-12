"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ArhivirajButton from "./arhiviraj-button";

type AuthUser = {
  id: string;
  ime?: string;
  username?: string;
  email?: string;
  role?: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export default function TankRoleActions({
  tankId,
  brojTanka,
  primaryStyle,
  secondaryStyle,
}: {
  tankId: string;
  brojTanka: number;
  primaryStyle: React.CSSProperties;
  secondaryStyle: React.CSSProperties;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        setUser(null);
      }
    }
  }, []);

  const isLevel2 = user?.role === "PODRUM" || user?.role === "PREGLED";

  return (
    <>
      <Link href="/dashboard" style={primaryStyle}>
        Početna
      </Link>

      {isLevel2 ? (
        <Link href="/monitor" style={secondaryStyle}>
          Monitor
        </Link>
      ) : (
        <>
          <Link href="/tankovi" style={secondaryStyle}>
            Popis tankova
          </Link>

          <ArhivirajButton
            tankId={tankId}
            brojTanka={brojTanka}
            style={secondaryStyle}
          />
        </>
      )}
    </>
  );
}