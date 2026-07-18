import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

// Hybrid theme (REWORK 3): Inter for UI/body (premium iOS feel, strong weight
// contrast), Bricolage for display headings (paper signature), IBM Plex Mono
// for hints/data.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Dislexi — Assistive Reading & Tutoring",
  description:
    "Point-and-read exam prep, AI tutoring, and phonics practice for students with dyslexia/ADHD.",
  // PWA via manifest.json ONLY — deliberately no service worker so every
  // deploy is live instantly (ARCHITECTURE.md §2). Do not add one.
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#FCFBF7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${bricolage.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
