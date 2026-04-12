"use client";

import { useEffect, useState } from "react";
import SastavModal from "./sastav-modal";

type AuthUser = {
  id: string;
  ime?: string;
  username?: string;
  email?: string;
  role?: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export default function TankRoleSastavModal({
  tankId,
  stavke,
}: {
  tankId: string;
  stavke: {
    id: string;
    nazivSorte: string;
    postotak: number;
  }[];
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

  if (isLevel2) return null;

  return <SastavModal tankId={tankId} stavke={stavke} />;
}