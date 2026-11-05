import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kayooh — Sepeda siap, outlet nyata",
  description:
    "Sewa sepeda di Jambi di outlet nyata: cek ketersediaan langsung, pilih waktu dan jenis, ambil di konter dengan QR.",
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
