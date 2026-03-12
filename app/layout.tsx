import type { Metadata } from "next";
import { Inter, Amiri } from "next/font/google";
import "./globals.css";
import ChatWidget from "./components/ChatWidget";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const amiri = Amiri({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "Quran AI - Read, Listen & Understand",
  description: "The Noble Quran with translations, audio recitations, and AI-powered explanations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${amiri.variable} antialiased min-h-screen bg-[#1f2125]`}>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
