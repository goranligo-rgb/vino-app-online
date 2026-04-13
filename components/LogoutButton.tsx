"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/logout", {
      method: "POST",
    });

    window.location.href = "/login";
  }

  return (
    <button
      onClick={logout}
      style={{
        padding: "10px 16px",
        border: "1px solid #7f1d1d",
        background: "#fff",
        color: "#7f1d1d",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Odjava
    </button>
  );
}