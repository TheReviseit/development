export type AnalyticsRangePreset = "today" | "week" | "month" | "6months" | "year";
export type AnalyticsRangeKey = AnalyticsRangePreset | "custom";

export interface AnalyticsDateRange {
  key: AnalyticsRangeKey;
  label: string;
  startDate: string;
  endDate: string;
}

export type RevenueAnalyticsRangeKey =
  | "day"
  | "week"
  | "month"
  | "6months"
  | "year"
  | "custom";

export interface RevenueAnalyticsRequest {
  range: RevenueAnalyticsRangeKey;
  startDate?: string;
  endDate?: string;
}

export const MAX_ANALYTICS_RANGE_DAYS = 366;

export const ANALYTICS_RANGE_OPTIONS: Array<{
  key: AnalyticsRangePreset;
  label: string;
}> = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "6months", label: "6 Months" },
  { key: "year", label: "Year" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function atLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setMonth(next.getMonth() + months);

  if (next.getDate() !== originalDay) {
    next.setDate(0);
  }

  return next;
}

export function getInclusiveRangeDays(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) return 0;

  return Math.floor((atLocalMidnight(end).getTime() - atLocalMidnight(start).getTime()) / DAY_MS) + 1;
}

export function createPresetAnalyticsDateRange(
  key: AnalyticsRangePreset = "week",
  now: Date = new Date(),
): AnalyticsDateRange {
  const today = atLocalMidnight(now);
  let start = today;

  switch (key) {
    case "today":
      start = today;
      break;
    case "week":
      start = addDays(today, -6);
      break;
    case "month":
      start = addDays(today, -29);
      break;
    case "6months":
      start = addDays(addMonths(today, -6), 1);
      break;
    case "year":
      start = addDays(addMonths(today, -12), 1);
      break;
  }

  const option = ANALYTICS_RANGE_OPTIONS.find((item) => item.key === key);

  return {
    key,
    label: option?.label || "Week",
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(today),
  };
}

export function createCustomAnalyticsDateRange(
  startDate: string,
  endDate: string,
): AnalyticsDateRange {
  return {
    key: "custom",
    label: formatAnalyticsDateRangeLabel(startDate, endDate),
    startDate,
    endDate,
  };
}

export function validateAnalyticsDateRange(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): string | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    return "Select a valid start and end date.";
  }

  if (start.getTime() > end.getTime()) {
    return "Start date must be before end date.";
  }

  const today = atLocalMidnight(now);
  if (end.getTime() > today.getTime()) {
    return "End date cannot be in the future.";
  }

  const days = getInclusiveRangeDays(startDate, endDate);
  if (days > MAX_ANALYTICS_RANGE_DAYS) {
    return "Custom ranges can be up to 1 year.";
  }

  return null;
}

export function formatAnalyticsDateRangeLabel(
  startDate: string,
  endDate: string,
): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) return "Custom";

  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: start.getFullYear() === end.getFullYear() ? undefined : "numeric",
  });

  const endFormatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (startDate === endDate) {
    return endFormatter.format(start);
  }

  return `${formatter.format(start)} - ${endFormatter.format(end)}`;
}

export function toAnalyticsOverviewQuery(range: AnalyticsDateRange): string {
  const params = new URLSearchParams({
    start_date: range.startDate,
    end_date: range.endDate,
  });

  return params.toString();
}

export function toRevenueAnalyticsRequest(
  range: AnalyticsDateRange,
): RevenueAnalyticsRequest {
  return {
    range: "custom",
    startDate: range.startDate,
    endDate: range.endDate,
  };
}

export function getRecommendedChartGrouping(
  range: AnalyticsDateRange,
): "Daily" | "Weekly" | "Monthly" {
  const days = getInclusiveRangeDays(range.startDate, range.endDate);

  if (days <= 45) return "Daily";
  if (days <= 180) return "Weekly";
  return "Monthly";
}
