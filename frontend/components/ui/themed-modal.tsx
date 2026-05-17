import * as React from "react";
import { cn } from "@/lib/utils";

export interface ThemedModalProps extends React.HTMLAttributes<HTMLDivElement> {
  labelledBy: string;
}

export function ThemedModal({
  className,
  labelledBy,
  ...props
}: ThemedModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={cn(
        "fixed inset-0 z-[var(--z-modal)] grid place-items-center bg-[var(--color-surface-overlay)] p-4",
        className
      )}
      {...props}
    />
  );
}

export function ThemedModalPanel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "w-full max-w-lg rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-lg",
        className
      )}
      {...props}
    />
  );
}
