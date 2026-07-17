import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Walkthrough theme fonts (how_it_works_walkthrough.html): Bricolage for
// display, IBM Plex Sans for UI text, IBM Plex Mono for hints/logs.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
      className={`${bricolage.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
