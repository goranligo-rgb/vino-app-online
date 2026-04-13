"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        padding: "10px 16px",
        background: "#111827",
        color: "#fff",
        borderRadius: 10,
        cursor: "pointer",
        border: "none",
      }}
    >
      Ispiši
    </button>
  );
}