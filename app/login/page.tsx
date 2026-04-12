"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const text = await res.text();
      console.log("LOGIN RAW RESPONSE:", text);

      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        setError(data?.details || data?.error || text || "Greška kod prijave");
        return;
      }

      if (!data?.user) {
        setError("Login je prošao, ali user nije vraćen iz API-ja");
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("LOGIN FETCH ERROR:", err);
      setError("Greška kod prijave - provjeri terminal i /api/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f3f4f6",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 24,
          display: "grid",
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0 }}>Prijava</h1>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
            }}
          />

          <input
            type="password"
            placeholder="Lozinka"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "#fff",
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Prijavljujem..." : "Prijavi se"}
          </button>

          {error ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                padding: 10,
                borderRadius: 10,
                fontSize: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              {error}
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}