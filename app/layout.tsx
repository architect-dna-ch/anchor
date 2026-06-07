import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Anchor — Your personal AI companion",
  description: "Anchor listens, reflects, and pulls you out of loops. Daily log, emergency anchor, weekly insight. Knows your situation. Never generic.",
  openGraph: {
    title: "Anchor",
    description: "The AI that knows your situation and speaks to it directly.",
    url: "https://anchor.architect-dna.ch",
    type: "website",
    images: [{ url: "https://anchor.architect-dna.ch/og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["https://anchor.architect-dna.ch/og.png"] },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://anchor.architect-dna.ch" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}<Analytics /></body>
    </html>
  );
}
