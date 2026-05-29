import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anchor — Your personal AI companion",
  description: "Anchor listens, reflects, and pulls you out of loops. Daily log, emergency anchor, weekly insight. Knows your situation. Never generic.",
  openGraph: {
    title: "Anchor",
    description: "The AI that knows your situation and speaks to it directly.",
    url: "https://anchor.architect-dna.ch",
    type: "website",
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://anchor.architect-dna.ch" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
