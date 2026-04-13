"use client";

import { useEffect, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUsername = localStorage.getItem("last_username");
    if (savedUsername) {
      setUsername(savedUsername);
    }
  }, []);

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
      localStorage.setItem("last_username", username);
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
        background:
          "radial-gradient(circle at top left, #5a1a3f 0%, #1f1526 25%, #14111c 50%, #0f0d14 100%)",
        padding: 24,
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#14131c",
          border: "2px solid #5b6b88",
          padding: 24,
          display: "grid",
          gap: 16,
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
        }}
      >
        <h1
          style={{
            margin: 0,
            color: "#fff",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          Prijava
        </h1>

        <form
          onSubmit={handleLogin}
          autoComplete="on"
          style={{ display: "grid", gap: 12 }}
        >
          <input
            name="username"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            style={{
              padding: "12px 14px",
              border: "1px solid #5b6b88",
              background: "#ffffff",
              color: "#111827",
              outline: "none",
            }}
          />

          <input
            name="password"
            type="password"
            placeholder="Lozinka"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              padding: "12px 14px",
              border: "1px solid #5b6b88",
              background: "#ffffff",
              color: "#111827",
              outline: "none",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 14px",
              border: "2px solid #ff2f92",
              background: "#14131c",
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
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#9f1239",
                padding: 10,
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