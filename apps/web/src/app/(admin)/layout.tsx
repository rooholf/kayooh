/**
 * (admin) route group layout — Kayooh Admin "Papan Harga Pasar" world.
 *
 * Operate mode, desktop-first (≥1280 px): a 230 px dark-wood rail, then the
 * main column (each page renders its own 56 px top bar and board). The renter
 * poster world and the owner ledger sheet do not apply here.
 */
import type { Viewport } from "next";
import "./admin.css";
import { AdminQueryProvider } from "./providers";
import { AdminRail } from "./_components/Rail";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminQueryProvider>
      <div className="k-admin">
        <AdminRail />
        <div className="k-admin-main">{children}</div>
      </div>
    </AdminQueryProvider>
  );
}
