"use client";

export default function LogoutButton() {
  async function handleLogout() {
    try {
      await fetch("/api/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error("LOGOUT ERROR:", error);
    } finally {
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
    >
      Odjava
    </button>
  );
}