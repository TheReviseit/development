import * as React from "react";
import { cn } from "@/lib/utils";

export interface ThemedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function ThemedCard({
  className,
  elevated = false,
  ...props
}: ThemedCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        elevated ? "shadow-md" : "shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function ThemedCardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1.5 p-6", className)} {...props} />;
}

export function ThemedCardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold leading-none tracking-normal", className)}
      {...props}
    />
  );
}

export function ThemedCardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
