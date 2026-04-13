"use client";

export default function LogoutButton() {
  async function logout() {
    try {
      await fetch("/api/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="px-4 py-2 font-semibold text-white"
      style={{
        border: "2px solid #ff2f92",
        background: "#14131c",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        cursor: "pointer",
      }}
    >
      Odjava
    </button>
  );
}