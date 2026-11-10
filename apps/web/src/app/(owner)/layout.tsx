/**
 * (owner) route group layout — Poster Solidaritas (pemilik) world.
 *
 * Operate mode, phone-first: 360 px minimum, single column, no pointer
 * required. Same ink-on-kertas tokens as the renter but a different read —
 * oversight, not conversion. No slogan marquee, no desk frame.
 */
import type { Viewport } from "next";
import { OwnerQueryProvider } from "./providers";
import "./owner.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnerQueryProvider>
      {children}
    </OwnerQueryProvider>
  );
}
