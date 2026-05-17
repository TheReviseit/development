import * as React from "react";
import { cn } from "@/lib/utils";

export function ThemedTable({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-auto rounded-xl border border-border bg-card">
      <table
        className={cn("w-full caption-bottom text-sm text-card-foreground", className)}
        {...props}
      />
    </div>
  );
}

export function ThemedTableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-border bg-muted/60", className)}
      {...props}
    />
  );
}

export function ThemedTableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-border transition-colors hover:bg-muted/50", className)}
      {...props}
    />
  );
}

export function ThemedTableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("p-4 align-middle", className)} {...props} />;
}

export function ThemedTableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-11 px-4 text-left align-middle font-semibold text-muted-foreground", className)}
      {...props}
    />
  );
}
