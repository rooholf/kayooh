/**
 * (owner) route group layout — Poster Solidaritas (pemilik) world.
 *
 * Operate mode: responsive oversight console, from phone (360px min) to
 * wide desktop displays. Ink-on-kertas tokens, 3px keylines, and solidarist
 * typography matching grounded-poster-solidaritas.html.
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
