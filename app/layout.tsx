import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SignatureAnimation from "@/components/SignatureAnimation"; // ✅ OVO JE BITNO

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vino App Kostanjevec",
  description: "Upravljanje tankovima, mjerenjima i zadacima.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Aplikacija se na iPhone dodaje na pocetni zaslon i vrti kao standalone
  // (vidi app/manifest.ts, display: "standalone"), pa nema Safarijevu traku
  // koja bi je odmaknula od sata i notcha. Bez viewport-fit=cover je
  // env(safe-area-inset-*) uvijek 0 i stranica se ne moze sama maknuti ispod
  // status trake - zato cover, a razmake dodaju stranice
  // (npr. /dashboard/hladjenje) i vodoravna zastita u globals.css.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hr" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-full">
        <SignatureAnimation /> {/* ✅ POTPIS */}
        {children}
      </body>
    </html>
  );
}