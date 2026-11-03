import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jambi Bike Rental Network",
  description: "Station-based, multi-owner bike rental platform for Jambi.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
