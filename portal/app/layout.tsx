import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ChewieTechCredit } from "@/components/ChewieTechCredit";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Solana Wallet — Guardian",
  description: "Approve your AI agent's Solana transactions with Face ID / Touch ID",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans flex flex-col">
        <div className="flex-1">{children}</div>
        <ChewieTechCredit />
      </body>
    </html>
  );
}
