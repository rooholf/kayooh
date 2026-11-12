"use client";

/**
 * Shared form field primitives — square-cut mono inputs on the board.
 * Labels are grotesque; what the admin types is data, so the value voice
 * is Roboto Mono (The Two Voices Rule).
 */
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="k-field">
      <label>
        {label}
        {hint !== undefined && <span className="k-hint"> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="k-input" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="k-select" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="k-textarea" {...props} />;
}
