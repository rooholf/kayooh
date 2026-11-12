"use client";

/**
 * The 230px dark-wood rail — every admin section in one glance (DESIGN.md
 * FIRST VIEWPORT). Pending work carries a mono badge in Merah Kasus: a
 * badge is a promise that the queue needs the admin today, so only real
 * counts from the flagged-scan queue earn one. Outlet counts come from the
 * public catalog; queues with no read endpoint yet (sepeda, owner, staff)
 * show no fabricated count.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminGet, ApiError, fetchOutlets } from "../_lib/api";

interface FlaggedPage {
  items: Array<{ id: string }>;
  nextCursor: string | null;
}

function useFlaggedCount(): number | null {
  const { data } = useQuery<FlaggedPage, ApiError>({
    queryKey: ["admin", "flagged"],
    queryFn: () => adminGet<FlaggedPage>("/flagged-scans?limit=50", "Gagal memuat antrian"),
    refetchInterval: 60_000,
  });
  if (!data) return null;
  return data.nextCursor ? 50 : data.items.length;
}

type Suffix = "outlets";
type Badge = "flagged";

interface RailItem {
  label: string;
  href: string;
  badge?: Badge;
  suffix?: Suffix;
}

const SECTIONS: Array<{ title: string; items: RailItem[] }> = [
  {
    title: "Jaringan",
    items: [
      { label: "Dashboard", href: "/admin" },
      { label: "Outlet", href: "/admin/outlet", suffix: "outlets" },
      { label: "Sepeda", href: "/admin/sepeda" },
      { label: "Owner", href: "/admin/owner" },
      { label: "Staff", href: "/admin/staff" },
    ],
  },
  {
    title: "Uang",
    items: [
      { label: "Settlement", href: "/admin/settlement" },
      { label: "Refund", href: "/admin/refund" },
      { label: "Deposit", href: "/admin/deposit" },
    ],
  },
  {
    title: "Kasus",
    items: [
      { label: "Pindai ditandai", href: "/admin/flagged", badge: "flagged" },
      { label: "Sengketa", href: "/admin/sengketa" },
      { label: "Klaim rusak", href: "/admin/klaim" },
    ],
  },
  {
    title: "Sistem",
    items: [
      { label: "Harga & promo", href: "/admin/harga" },
      { label: "Konfigurasi", href: "/admin/konfigurasi" },
      { label: "Audit log", href: "/admin/audit" },
    ],
  },
];

export function AdminRail() {
  const pathname = usePathname();
  const flagged = useFlaggedCount();
  const outlets = useQuery({
    queryKey: ["admin", "outlets", "rail"],
    queryFn: fetchOutlets,
    staleTime: 60_000,
  });

  const live: Record<Badge, number | null> = { flagged };
  const liveSuffix: Record<Suffix, string | null> = {
    outlets: outlets.data ? `(${outlets.data.length})` : null,
  };

  return (
    <nav className="k-rail k-scroll" aria-label="Navigasi admin">
      <div className="k-rail-brand">KAYOOH · ADMIN</div>
      {SECTIONS.map((sec) => (
        <div key={sec.title}>
          <div className="k-rail-sec">{sec.title}</div>
          {sec.items.map((item) => {
            const badge = item.badge !== undefined ? live[item.badge] : null;
            const suffix = item.suffix !== undefined ? liveSuffix[item.suffix] : null;
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="k-rail-item"
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                <span>
                  {item.label}
                  {suffix !== null && <> {suffix}</>}
                </span>
                {badge !== null && badge > 0 && <span className="k-chip alarm">{badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
