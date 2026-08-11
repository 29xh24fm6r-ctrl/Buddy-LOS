import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buddy LOS",
  description: "A modern commercial lending operating system for lenders and borrowers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
