"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  ANALYTICS_RANGE_OPTIONS,
  type AnalyticsDateRange,
  createCustomAnalyticsDateRange,
  createPresetAnalyticsDateRange,
  formatAnalyticsDateRangeLabel,
  formatDateOnly,
  parseDateOnly,
  validateAnalyticsDateRange,
} from "@/lib/analytics/dateRange";
import styles from "./AnalyticsDateRangeSelector.module.css";

interface AnalyticsDateRangeSelectorProps {
  value: AnalyticsDateRange;
  onChange: (range: AnalyticsDateRange) => void;
  disabled?: boolean;
}

export function AnalyticsDateRangeSelector({
  value,
  onChange,
  disabled = false,
}: AnalyticsDateRangeSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(value.startDate);
  const [draftEnd, setDraftEnd] = useState(value.endDate);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const endDate = parseDateOnly(value.endDate) || new Date();
    return new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  });
  const [selectionStep, setSelectionStep] = useState<"start" | "end">("start");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const today = formatDateOnly(new Date());
  const todayDate = parseDateOnly(today) || new Date();

  useEffect(() => {
    if (value.key === "custom") {
      setDraftStart(value.startDate);
      setDraftEnd(value.endDate);
    }
  }, [value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
        setCustomOpen(false);
        setError(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropdownOpen(false);
        setCustomOpen(false);
        setError(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handlePresetClick = (key: (typeof ANALYTICS_RANGE_OPTIONS)[number]["key"]) => {
    onChange(createPresetAnalyticsDateRange(key));
    setDropdownOpen(false);
    setCustomOpen(false);
    setError(null);
  };

  const handleDropdownToggle = () => {
    if (disabled) return;

    setDropdownOpen((open) => !open);
    setCustomOpen(false);
    setError(null);
  };

  const handleCustomSelect = () => {
    const endDate = parseDateOnly(value.endDate) || new Date();

    setDraftStart(value.startDate);
    setDraftEnd(value.endDate);
    setVisibleMonth(new Date(endDate.getFullYear(), endDate.getMonth(), 1));
    setSelectionStep("start");
    setDropdownOpen(false);
    setCustomOpen(true);
    setError(null);
  };

  const handleApplyCustomRange = () => {
    const validationError = validateAnalyticsDateRange(draftStart, draftEnd);

    if (validationError) {
      setError(validationError);
      return;
    }

    onChange(createCustomAnalyticsDateRange(draftStart, draftEnd));
    setCustomOpen(false);
    setError(null);
  };

  const handleDateSelect = (date: Date) => {
    const selected = formatDateOnly(date);

    if (selectionStep === "start") {
      setDraftStart(selected);
      setDraftEnd(selected);
      setSelectionStep("end");
      setError(null);
      return;
    }

    const startDate = parseDateOnly(draftStart);

    if (startDate && date.getTime() < startDate.getTime()) {
      setDraftStart(selected);
      setDraftEnd(draftStart);
    } else {
      setDraftEnd(selected);
    }

    setSelectionStep("start");
    setError(null);
  };

  const changeVisibleMonth = (offset: number) => {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  };

  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  const selectedRangeLabel = formatAnalyticsDateRangeLabel(draftStart, draftEnd);
  const dayLabelFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  });
  const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const monthStart = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  );
  const monthDays = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const calendarCells = Array.from({ length: 42 }, (_, index) => {
    const day = index - monthStart.getDay() + 1;
    if (day < 1 || day > monthDays) return null;
    return new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
  });
  const parsedStart = parseDateOnly(draftStart);
  const parsedEnd = parseDateOnly(draftEnd);

  return (
    <div
      ref={rootRef}
      className={styles.rangeSelector}
      aria-label="Analytics date range"
    >
      <button
        type="button"
        className={styles.dropdownField}
        onClick={handleDropdownToggle}
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
        disabled={disabled}
      >
        <span className={styles.fieldIcon}>
          <Calendar size={16} aria-hidden="true" />
        </span>
        <span className={styles.fieldText}>{value.label}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={dropdownOpen ? styles.chevronOpen : undefined}
        />
      </button>

      {dropdownOpen && (
        <div className={styles.dropdownMenu} role="listbox">
          {ANALYTICS_RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`${styles.dropdownItem} ${
                value.key === option.key ? styles.activeItem : ""
              }`}
              onClick={() => handlePresetClick(option.key)}
              role="option"
              aria-selected={value.key === option.key}
            >
              <span>{option.label}</span>
              {value.key === option.key && <Check size={15} aria-hidden="true" />}
            </button>
          ))}

          <button
            type="button"
            className={`${styles.dropdownItem} ${
              value.key === "custom" ? styles.activeItem : ""
            }`}
            onClick={handleCustomSelect}
            role="option"
            aria-selected={value.key === "custom"}
          >
            <span>{value.key === "custom" ? value.label : "Custom"}</span>
            {value.key === "custom" && <Check size={15} aria-hidden="true" />}
          </button>
        </div>
      )}

      {customOpen && (
        <div
          className={styles.popover}
          role="dialog"
          aria-label="Custom date range"
        >
          <div className={styles.popoverHeader}>
            <div>
              <div className={styles.popoverTitle}>Custom range</div>
              <div className={styles.popoverSubtitle}>
                {selectionStep === "start"
                  ? "Select start date"
                  : "Select end date"}
              </div>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                setDropdownOpen(false);
                setCustomOpen(false);
                setError(null);
              }}
              aria-label="Close custom date range"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.rangePreview}>
            <span>{selectedRangeLabel}</span>
            <span>Up to 1 year</span>
          </div>

          <div className={styles.calendar}>
            <div className={styles.calendarHeader}>
              <button
                type="button"
                className={styles.monthButton}
                onClick={() => changeVisibleMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <div className={styles.monthLabel}>{monthLabel}</div>
              <button
                type="button"
                className={styles.monthButton}
                onClick={() => changeVisibleMonth(1)}
                aria-label="Next month"
                disabled={
                  visibleMonth.getFullYear() === todayDate.getFullYear() &&
                  visibleMonth.getMonth() >= todayDate.getMonth()
                }
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.weekdays} aria-hidden="true">
              {weekdayLabels.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className={styles.calendarGrid}>
              {calendarCells.map((date, index) => {
                if (!date) {
                  return <span key={`empty-${index}`} className={styles.emptyDay} />;
                }

                const dateValue = formatDateOnly(date);
                const isStart = dateValue === draftStart;
                const isEnd = dateValue === draftEnd;
                const isInRange =
                  !!parsedStart &&
                  !!parsedEnd &&
                  date.getTime() > parsedStart.getTime() &&
                  date.getTime() < parsedEnd.getTime();
                const isFuture = date.getTime() > todayDate.getTime();
                const isToday = dateValue === today;

                return (
                  <button
                    key={dateValue}
                    type="button"
                    className={`${styles.dayButton} ${
                      isInRange ? styles.inRange : ""
                    } ${isStart ? styles.rangeStart : ""} ${
                      isEnd ? styles.rangeEnd : ""
                    } ${isToday ? styles.today : ""}`}
                    onClick={() => handleDateSelect(date)}
                    disabled={isFuture}
                    aria-pressed={isStart || isEnd || isInRange}
                    aria-label={dayLabelFormatter.format(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => {
                setDropdownOpen(false);
                setCustomOpen(false);
                setError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.applyButton}
              onClick={handleApplyCustomRange}
            >
              <Check size={15} aria-hidden="true" />
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalyticsDateRangeSelector;
