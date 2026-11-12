"use client";

/**
 * The 56px top bar: title 800 on the left, mono meta on the right — WIB
 * date and time plus the outlets' live health figure ("4/4 outlet buka")
 * from the public catalog. The clock ticks every 30 s; availability is
 * server truth, never a cached guess (Product Principle 1).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOutlets } from "../_lib/api";
import { fmtWibDate, fmtWibTime } from "../_lib/format";

export function TopBar({ title, meta }: { title: string; meta?: ReactNode }) {
  const [now, setNow] = useState<Date | null>(null);
  const outlets = useQuery({
    queryKey: ["admin", "outlets", "rail"],
    queryFn: fetchOutlets,
    staleTime: 60_000,
  });

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const openCount = outlets.data?.filter((o) => o.isOpenNow).length ?? null;
  const total = outlets.data?.length ?? null;

  return (
    <header className="k-top">
      <h1 className="k-top-title">{title}</h1>
      <div className="k-top-meta">
        {now && (
          <>
            {fmtWibDate(now)} · {fmtWibTime(now)}
            {openCount !== null && total !== null && <> · {openCount}/{total} outlet buka</>}
          </>
        )}
        {meta && <span> · {meta}</span>}
      </div>
    </header>
  );
}
