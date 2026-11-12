"use client";

/**
 * Board primitives for the admin console — panel, rows, queue entries,
 * painted totals, chips, buttons, honest notices. All styling lives in
 * `../admin.css`; these components exist so every page speaks the same
 * board vocabulary (DESIGN.md: every board panel ends in a painted total
 * that resolves the panel).
 */
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export function Panel({
  label,
  chip,
  children,
}: {
  label: string;
  chip?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="k-panel">
      <div className="k-panel-head">
        <span>{label}</span>
        {chip !== undefined && <span className="k-panel-n">{chip}</span>}
      </div>
      {children}
    </section>
  );
}

export function Row({
  label,
  sub,
  value,
  tone,
}: {
  label: ReactNode;
  sub?: ReactNode;
  value: ReactNode;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="k-row">
      <span className="k-row-label">
        {label}
        {sub !== undefined && <span className="k-row-sub">{sub}</span>}
      </span>
      <span className={`k-row-val${tone ? ` ${tone}` : ""}`}>{value}</span>
    </div>
  );
}

export function Entry({
  label,
  tag,
  tagAlarm,
}: {
  label: ReactNode;
  tag: string;
  tagAlarm?: boolean;
}) {
  return (
    <div className="k-entry">
      <span className="k-entry-label">{label}</span>
      <span className={`k-chip${tagAlarm ? " alarm" : ""}`}>{tag}</span>
    </div>
  );
}

/**
 * The painted total: the figure that resolves a panel. Coloured by state —
 * green when healthy, red when short, ink when the board has no verdict yet.
 */
export function PaintedTotal({
  value,
  unit,
  tone,
}: {
  value: string;
  unit?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className={`k-total${tone ? ` ${tone}` : ""}`}>
      {value}
      {unit !== undefined && <span className="k-total-unit">{unit}</span>}
    </div>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="k-actions">{children}</div>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Btn({ variant = "primary", className, ...rest }: BtnProps) {
  const cls = `k-btn${variant !== "primary" ? ` ${variant}` : ""}${className ? ` ${className}` : ""}`;
  return <button type="button" className={cls} {...rest} />;
}

type BtnLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: "primary" | "ghost" | "danger";
};

export function BtnLink({ href, variant = "primary", className, ...rest }: BtnLinkProps) {
  const cls = `k-btn${variant !== "primary" ? ` ${variant}` : ""}${className ? ` ${className}` : ""}`;
  return (
    <Link href={href} className={cls} {...rest} />
  );
}

/** Honest empty / info state — dashed board note. */
export function Note({
  children,
  error,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return <div className={`k-note${error ? " error" : ""}`}>{children}</div>;
}

/** Mono skeleton rows shown while a panel fetches. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="k-skel" aria-hidden="true" />
      ))}
    </>
  );
}
