"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import styles from "./CategorySelect.module.css";

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
  placeholder?: string;
}

export default function CategorySelect({
  value,
  onChange,
  categories,
  placeholder = "Search or add category...",
}: CategorySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter categories based on search
  const filteredCategories = categories.filter((cat) =>
    cat.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Check if search query is a new category
  const isNewCategory =
    searchQuery.trim().length > 0 &&
    !categories.some(
      (cat) => cat.toLowerCase() === searchQuery.toLowerCase().trim(),
    );

  // Total options count (for keyboard navigation)
  const totalOptions = filteredCategories.length + (isNewCategory ? 1 : 0);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) => Math.min(prev + 1, totalOptions - 1));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (
            highlightedIndex >= 0 &&
            highlightedIndex < filteredCategories.length
          ) {
            handleSelect(filteredCategories[highlightedIndex]);
          } else if (
            isNewCategory &&
            highlightedIndex === filteredCategories.length
          ) {
            handleSelect(searchQuery.trim());
          } else if (isNewCategory && searchQuery.trim()) {
            handleSelect(searchQuery.trim());
          }
          break;
        case "Escape":
          setIsOpen(false);
          setSearchQuery("");
          setHighlightedIndex(-1);
          inputRef.current?.blur();
          break;
        case "Tab":
          setIsOpen(false);
          break;
        default:
          break;
      }
    },
    [
      isOpen,
      highlightedIndex,
      filteredCategories,
      isNewCategory,
      searchQuery,
      totalOptions,
    ],
  );

  // Handle category selection
  const handleSelect = (category: string) => {
    onChange(category);
    setSearchQuery("");
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Handle input focus
  const handleFocus = () => {
    setIsOpen(true);
    setSearchQuery(value);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    setHighlightedIndex(-1);
    if (!isOpen) setIsOpen(true);
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={isOpen ? searchQuery : value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
        />
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {isOpen && (
        <div className={styles.dropdown}>
          {filteredCategories.length === 0 && !isNewCategory ? (
            <div className={styles.emptyState}>No categories found</div>
          ) : (
            <>
              {filteredCategories.map((cat, index) => (
                <button
                  key={cat}
                  type="button"
                  className={`${styles.option} ${
                    highlightedIndex === index ? styles.optionHighlighted : ""
                  } ${value === cat ? styles.optionSelected : ""}`}
                  onClick={() => handleSelect(cat)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <svg
                    className={styles.optionIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                  </svg>
                  <span className={styles.optionLabel}>{cat}</span>
                  {value === cat && (
                    <svg
                      className={styles.checkIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}

              {isNewCategory && (
                <button
                  type="button"
                  className={`${styles.option} ${styles.newOption} ${
                    highlightedIndex === filteredCategories.length
                      ? styles.optionHighlighted
                      : ""
                  }`}
                  onClick={() => handleSelect(searchQuery.trim())}
                  onMouseEnter={() =>
                    setHighlightedIndex(filteredCategories.length)
                  }
                >
                  <svg
                    className={styles.optionIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className={styles.newOptionLabel}>
                    Create{" "}
                    <span className={styles.newOptionValue}>
                      &quot;{searchQuery.trim()}&quot;
                    </span>
                  </span>
                </button>
              )}

              <div className={styles.keyboardHint}>
                <span>
                  <kbd>↑↓</kbd> Navigate
                </span>
                <span>
                  <kbd>Enter</kbd> Select
                </span>
                <span>
                  <kbd>Esc</kbd> Close
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
