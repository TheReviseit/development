"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import styles from "./CustomDropdown.module.css";

export interface DropdownOption {
  id: string;
  label: string;
  icon?: string;
  iconPath?: string;
  status?: "complete" | "incomplete" | null;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className = "",
  disabled = false,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listRef.current) {
      const focusedElement = listRef.current.children[
        focusedIndex
      ] as HTMLElement;
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedIndex, isOpen]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      const currentIndex = options.findIndex((opt) => opt.id === value);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [disabled, isOpen, options, value]);

  const handleSelect = useCallback(
    (optionId: string) => {
      onChange(optionId);
      setIsOpen(false);
      setFocusedIndex(-1);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      switch (event.key) {
        case "Enter":
        case " ":
          event.preventDefault();
          if (isOpen && focusedIndex >= 0) {
            handleSelect(options[focusedIndex].id);
          } else {
            handleToggle();
          }
          break;

        case "Escape":
          event.preventDefault();
          setIsOpen(false);
          setFocusedIndex(-1);
          break;

        case "ArrowDown":
          event.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setFocusedIndex(0);
          } else {
            setFocusedIndex((prev) =>
              prev < options.length - 1 ? prev + 1 : 0
            );
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          if (isOpen) {
            setFocusedIndex((prev) =>
              prev > 0 ? prev - 1 : options.length - 1
            );
          }
          break;

        case "Tab":
          setIsOpen(false);
          setFocusedIndex(-1);
          break;

        default:
          break;
      }
    },
    [disabled, focusedIndex, handleSelect, handleToggle, isOpen, options]
  );

  const getStatusIcon = (
    status: "complete" | "incomplete" | null | undefined
  ) => {
    if (status === "complete")
      return <span className={styles.statusComplete}>✓</span>;
    if (status === "incomplete")
      return <span className={styles.statusIncomplete}>!</span>;
    return null;
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${className} ${
        disabled ? styles.disabled : ""
      }`}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ""}`}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby="dropdown-label"
        disabled={disabled}
      >
        <span className={styles.triggerContent}>
          {selectedOption?.iconPath && (
            <img
              src={selectedOption.iconPath}
              alt=""
              className={styles.iconImg}
              width={20}
              height={20}
            />
          )}
          {selectedOption?.icon && !selectedOption?.iconPath && (
            <span className={styles.icon}>{selectedOption.icon}</span>
          )}
          <span className={styles.label}>
            {selectedOption?.label || placeholder}
          </span>
          {selectedOption && getStatusIcon(selectedOption.status)}
        </span>
        <span className={`${styles.arrow} ${isOpen ? styles.arrowOpen : ""}`}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      <div className={`${styles.listWrapper} ${isOpen ? styles.listOpen : ""}`}>
        <ul
          ref={listRef}
          className={styles.list}
          role="listbox"
          aria-activedescendant={
            focusedIndex >= 0
              ? `option-${options[focusedIndex]?.id}`
              : undefined
          }
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`option-${option.id}`}
              role="option"
              aria-selected={option.id === value}
              className={`${styles.option} ${
                option.id === value ? styles.optionSelected : ""
              } ${focusedIndex === index ? styles.optionFocused : ""}`}
              onClick={() => handleSelect(option.id)}
              onMouseEnter={() => setFocusedIndex(index)}
            >
              {option.iconPath && (
                <img
                  src={option.iconPath}
                  alt=""
                  className={styles.optionIconImg}
                  width={18}
                  height={18}
                />
              )}
              {option.icon && !option.iconPath && (
                <span className={styles.optionIcon}>{option.icon}</span>
              )}
              <span className={styles.optionLabel}>{option.label}</span>
              {getStatusIcon(option.status)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
