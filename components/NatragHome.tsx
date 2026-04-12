import Link from "next/link";

export default function NatragHome() {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        paddingBottom: 10,
      }}
    >
      <Link
        href="/dashboard"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderRadius: 12,
          background: "#111827",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 700,
          boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
        }}
      >
        ← Početna
      </Link>
    </div>
  );
}