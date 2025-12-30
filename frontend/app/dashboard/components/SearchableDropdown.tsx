"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import styles from "./SearchableDropdown.module.css";

export interface SearchableOption {
  id: string;
  label: string;
  iconPath?: string;
}

interface SearchableDropdownProps {
  options: SearchableOption[];
  value: string;
  customValue?: string;
  onChange: (value: string, customValue?: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableDropdown({
  options,
  value,
  customValue = "",
  onChange,
  placeholder = "Type to search or add...",
  className = "",
  disabled = false,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Get the display label for the selected value
  const selectedOption = options.find((opt) => opt.id === value);
  // If value is not in options, it's a custom entry - use the value itself as label
  const displayLabel = selectedOption?.label || value || "";
  const isCustomEntry = value && !selectedOption;
  const hasSelection = !!value;

  // Filter options based on input
  const filteredOptions = useMemo(() => {
    if (!inputValue.trim()) return options;
    const query = inputValue.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(query));
  }, [options, inputValue]);

  // Check if input matches any option exactly
  const exactMatch = useMemo(() => {
    const query = inputValue.toLowerCase().trim();
    return options.some((opt) => opt.label.toLowerCase() === query);
  }, [options, inputValue]);

  // Show add button when there's input that doesn't match
  const showAddButton = inputValue.trim() && !exactMatch;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setInputValue("");
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

  const handleInputFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    setFocusedIndex(0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
    setFocusedIndex(0);
  };

  const handleSelect = useCallback(
    (option: SearchableOption) => {
      onChange(option.id);
      setInputValue("");
      setIsOpen(false);
      setFocusedIndex(-1);
    },
    [onChange]
  );

  const handleAddCustom = useCallback(() => {
    if (!inputValue.trim()) return;
    // Pass the custom name as the industry value directly
    // so it gets saved to the database as the actual business type
    onChange(inputValue.trim(), inputValue.trim());
    setInputValue("");
    setIsOpen(false);
    setFocusedIndex(-1);
  }, [inputValue, onChange]);

  const handleClear = useCallback(() => {
    onChange("", "");
    setInputValue("");
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      switch (event.key) {
        case "Enter":
          event.preventDefault();
          if (isOpen && focusedIndex >= 0 && filteredOptions[focusedIndex]) {
            handleSelect(filteredOptions[focusedIndex]);
          } else if (showAddButton) {
            handleAddCustom();
          }
          break;

        case "Escape":
          event.preventDefault();
          setIsOpen(false);
          setInputValue("");
          setFocusedIndex(-1);
          break;

        case "ArrowDown":
          event.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setFocusedIndex(0);
          } else {
            setFocusedIndex((prev) =>
              prev < filteredOptions.length - 1 ? prev + 1 : 0
            );
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          if (isOpen) {
            setFocusedIndex((prev) =>
              prev > 0 ? prev - 1 : filteredOptions.length - 1
            );
          }
          break;

        case "Tab":
          setIsOpen(false);
          setInputValue("");
          setFocusedIndex(-1);
          break;

        default:
          break;
      }
    },
    [
      disabled,
      filteredOptions,
      focusedIndex,
      handleAddCustom,
      handleSelect,
      isOpen,
      showAddButton,
    ]
  );

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${className} ${
        disabled ? styles.disabled : ""
      }`}
    >
      {/* Selected Value Display */}
      {hasSelection ? (
        <div className={styles.selectedDisplay}>
          {selectedOption?.iconPath && (
            <img
              src={selectedOption.iconPath}
              alt=""
              className={styles.selectedIcon}
              width={20}
              height={20}
            />
          )}
          <span className={styles.selectedLabel}>{displayLabel}</span>
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear selection"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <>
          {/* Input Field */}
          <div className={styles.inputWrapper}>
            <img
              src="/icons/search.svg"
              alt=""
              className={styles.searchIcon}
              width={18}
              height={18}
            />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={styles.input}
              disabled={disabled}
            />
          </div>

          {/* Dropdown List */}
          {isOpen && (
            <div className={styles.listWrapper}>
              {/* Add Button inside dropdown when custom text entered */}
              {showAddButton && (
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={handleAddCustom}
                >
                  <span>+ Add &quot;{inputValue}&quot;</span>
                </button>
              )}

              <ul ref={listRef} className={styles.list} role="listbox">
                {filteredOptions.length === 0 && !showAddButton ? (
                  <li className={styles.noResults}>
                    Start typing to search...
                  </li>
                ) : (
                  filteredOptions.map((option, index) => (
                    <li
                      key={option.id}
                      role="option"
                      aria-selected={option.id === value}
                      className={`${styles.option} ${
                        option.id === value ? styles.optionSelected : ""
                      } ${focusedIndex === index ? styles.optionFocused : ""}`}
                      onClick={() => handleSelect(option)}
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
                      <span className={styles.optionLabel}>{option.label}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
