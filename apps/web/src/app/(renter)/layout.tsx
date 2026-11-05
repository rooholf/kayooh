/**
 * (renter) route group layout — Poster Solidaritas world.
 *
 * NFR-07: mobile-first, 360 px minimum width, WCAG 2.1 AA. On wide screens
 * the sheet sits on an ink desk flanked by the vertical slogan, like a
 * poster pinned to a wall; the sheet itself never exceeds 520 px.
 */
import type { Viewport } from "next";
import { RenterQueryProvider } from "./providers";
import "./renter.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <RenterQueryProvider>
      <div className="renter-desk">
        <p className="renter-desk-word" aria-hidden="true">
          SEPEDA SIAP — DI OUTLET NYATA
        </p>
        <div className="renter-sheet">{children}</div>
        <p className="renter-desk-word" aria-hidden="true">
          A BIKE IS WAITING — AT A REAL OUTLET
        </p>
      </div>
    </RenterQueryProvider>
  );
}
