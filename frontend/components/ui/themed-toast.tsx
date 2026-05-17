import * as React from "react";
import { cn } from "@/lib/utils";

export interface ThemedToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

const toastTone = {
  neutral: "border-border",
  success: "border-[var(--color-success-border)]",
  warning: "border-[var(--color-warning-border)]",
  danger: "border-[var(--color-danger-border)]",
  info: "border-[var(--color-info-border)]",
} as const;

export function ThemedToast({
  className,
  tone = "neutral",
  ...props
}: ThemedToastProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg",
        toastTone[tone],
        className
      )}
      {...props}
    />
  );
}
