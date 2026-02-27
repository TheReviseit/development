"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import styles from "./Dropdown.module.css";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
  disabled = false,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get selected option label
  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder;

  // Calculate menu position based on trigger button, with viewport flip
  const updateMenuPosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, 160);
      const gap = 6;

      // Estimate menu height: ~44px per option, max 5 visible before scroll
      const estimatedMenuHeight = Math.min(options.length, 5) * 44 + 16; // 16px padding
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;

      // Flip upward if not enough space below but enough above
      const showAbove =
        spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

      // Clamp left to stay within viewport
      const left = Math.min(rect.left, window.innerWidth - menuWidth - 8);

      setMenuPosition({
        top: showAbove
          ? rect.top - gap - Math.min(estimatedMenuHeight, spaceAbove)
          : rect.bottom + gap,
        left: Math.max(8, left),
        width: menuWidth,
      });
    }
  }, [options.length]);

  // Update position when opening
  useEffect(() => {
    if (isOpen) {
      updateMenuPosition();
      // Also update on scroll/resize
      window.addEventListener("scroll", updateMenuPosition, true);
      window.addEventListener("resize", updateMenuPosition);
      return () => {
        window.removeEventListener("scroll", updateMenuPosition, true);
        window.removeEventListener("resize", updateMenuPosition);
      };
    }
  }, [isOpen, updateMenuPosition]);

  // Close dropdown when clicking/touching outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      // Check if click is outside both trigger and menu
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    // Use capture phase to ensure we catch the event before it's stopped
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("touchstart", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("touchstart", handleClickOutside, true);
    };
  }, [isOpen]);

  // Handle option select
  const handleSelect = (
    optionValue: string,
    e: React.MouseEvent | React.TouchEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(optionValue);
    setIsOpen(false);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown" && isOpen) {
      e.preventDefault();
      const currentIndex = options.findIndex((opt) => opt.value === value);
      const nextIndex = (currentIndex + 1) % options.length;
      onChange(options[nextIndex].value);
    } else if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault();
      const currentIndex = options.findIndex((opt) => opt.value === value);
      const prevIndex =
        currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
      onChange(options[prevIndex].value);
    }
  };

  // Handle trigger button click
  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  // Handle trigger touch
  const handleTriggerTouch = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  // Render portal menu
  const renderMenu = () => {
    if (!isOpen || !menuPosition) return null;

    const menuContent = (
      <div
        ref={menuRef}
        className={styles.dropdownMenuPortal}
        style={{
          position: "fixed",
          top: menuPosition.top,
          left: menuPosition.left,
          width: menuPosition.width,
          zIndex: 999999,
        }}
        role="listbox"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {options.map((option) => (
          <div
            key={option.value}
            className={`${styles.dropdownItem} ${
              option.value === value ? styles.selected : ""
            }`}
            onClick={(e) => handleSelect(option.value, e)}
            onTouchEnd={(e) => handleSelect(option.value, e)}
            role="option"
            aria-selected={option.value === value}
          >
            {option.label}
            {option.value === value && (
              <svg
                className={styles.checkIcon}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline
                  points="20 6 9 17 4 12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    );

    // Render in body using portal
    if (typeof document !== "undefined") {
      return createPortal(menuContent, document.body);
    }
    return null;
  };

  return (
    <div
      className={`${styles.dropdown} ${className} ${disabled ? styles.disabled : ""} ${isOpen ? styles.dropdownOpen : ""}`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={disabled ? undefined : handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.dropdownTrigger} ${isOpen ? styles.open : ""} ${disabled ? styles.triggerDisabled : ""}`}
        onClick={handleTriggerClick}
        onTouchStart={handleTriggerTouch}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <span className={styles.dropdownLabel}>{displayLabel}</span>
        <svg
          className={`${styles.dropdownIcon} ${
            isOpen ? styles.iconRotated : ""
          }`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline
            points="6 9 12 15 18 9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {renderMenu()}
    </div>
  );
}
