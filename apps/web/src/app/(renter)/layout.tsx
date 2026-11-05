/**
 * (renter) route group layout — Step 6 architecture initialization.
 *
 * NFR-07: the renter UI is mobile-first with a 360 px minimum width,
 * shadcn/ui + Tailwind patterns, and WCAG 2.1 AA contrast. The renter group
 * is fully separated from (owner) and (admin) (AGENTS Web directives).
 */
import type { Viewport } from "next";
import { RenterQueryProvider } from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <RenterQueryProvider>
      <div className="mx-auto flex min-h-dvh w-full min-w-[360px] max-w-md flex-col bg-white text-slate-900">
        {children}
      </div>
    </RenterQueryProvider>
  );
}
