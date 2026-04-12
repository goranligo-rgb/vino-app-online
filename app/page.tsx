"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

type SavedUser = {
  id: string;
  ime?: string;
  name?: string;
  email?: string;
  role?: string;
};

export default function HomePage() {
  const [user, setUser] = useState<SavedUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("user");

      if (!saved) {
        setUser(null);
        setReady(true);
        return;
      }

      const parsed = JSON.parse(saved);
      setUser(parsed);
      setReady(true);
    } catch {
      localStorage.removeItem("user");
      setUser(null);
      setReady(true);
    }
  }, []);

  if (!ready) {
    return <div style={{ padding: 24 }}>Učitavanje...</div>;
  }

  if (!user) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        <h1>Vino App</h1>
        <p>Niste prijavljeni.</p>
        <div style={{ marginTop: 16 }}>
          <Link
            href="/login"
            style={{
              display: "inline-block",
              padding: "10px 16px",
              border: "1px solid #7f1d1d",
              color: "#7f1d1d",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Idi na prijavu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Pozdrav, {user.ime || user.name || "korisniče"}</h1>
      <p>{user.email}</p>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            border: "1px solid #7f1d1d",
            color: "#fff",
            background: "#7f1d1d",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Otvori dashboard
        </Link>

        <LogoutButton />
      </div>
    </main>
  );
}