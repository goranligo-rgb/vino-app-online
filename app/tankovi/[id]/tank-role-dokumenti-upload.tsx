"use client";

import { useEffect, useState } from "react";
import DokumentiUpload from "./dokumenti-upload";

type AuthUser = {
  id: string;
  ime?: string;
  username?: string;
  email?: string;
  role?: "ADMIN" | "ENOLOG" | "PODRUM" | "PREGLED";
};

export default function TankRoleDokumentiUpload({
  tankId,
}: {
  tankId: string;
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

  return <DokumentiUpload tankId={tankId} />;
}