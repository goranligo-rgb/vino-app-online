"use client";

import { useState } from "react";

export default function DodajKorisnikaForm() {
  const [ime, setIme] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState("2");
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState("");

  async function spremi(e: React.FormEvent) {
    e.preventDefault();
    setPoruka("");
    setLoading(true);

    try {
      const res = await fetch("/api/korisnici", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ime,
          username,
          email,
          password,
          level,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPoruka(data.error ?? "Greška kod dodavanja korisnika.");
        return;
      }

      setIme("");
      setUsername("");
      setEmail("");
      setPassword("");
      setLevel("2");
      setPoruka("Korisnik je uspješno dodan.");

      window.location.reload();
    } catch (error) {
      console.error(error);
      setPoruka("Greška kod dodavanja korisnika.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={spremi} className="space-y-4">

      {/* 🔥 GLAVNI RED - SVE U JEDNOJ LINIJI */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">

        <input
          value={ime}
          onChange={(e) => setIme(e.target.value)}
          placeholder="Ime i prezime"
          className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none focus:border-emerald-400 md:col-span-1"
          required
        />

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none focus:border-emerald-400 md:col-span-1"
          required
        />

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none focus:border-emerald-400 md:col-span-1"
          required
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Lozinka"
          type="password"
          className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none focus:border-emerald-400 md:col-span-1"
          required
        />

        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="h-11 border border-emerald-200 bg-white px-3 text-sm text-stone-800 outline-none focus:border-emerald-400 md:col-span-1"
        >
          <option value="1">Level 1</option>
          <option value="2">Level 2</option>
        </select>

        {/* GUMB DESNO */}
        <button
          type="submit"
          disabled={loading}
          className="h-11 border border-emerald-300 bg-gradient-to-r from-emerald-200 to-lime-100 px-3 text-sm font-semibold text-stone-800 hover:brightness-105 disabled:opacity-50 md:col-span-1"
        >
          {loading ? "Spremam..." : "Dodaj"}
        </button>
      </div>

      {poruka && (
        <div className="border border-emerald-200 bg-white/85 px-4 py-3 text-sm text-stone-700">
          {poruka}
        </div>
      )}
    </form>
  );
}