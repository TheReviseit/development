"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Home, Settings, User, Package, MessageSquare, CreditCard, ListFilter } from "lucide-react";
import styles from "./commandPalette.module.css";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = [
    { id: "home", label: "Dashboard Home", icon: Home, route: "/home", category: "Navigation" },
    { id: "products", label: "Products", icon: Package, route: "/home/products", category: "Navigation" },
    { id: "messages", label: "Messages", icon: MessageSquare, route: "/home/messages", category: "Navigation" },
    { id: "profile", label: "Profile Settings", icon: User, route: "/home/settings/profile", category: "Settings" },
    { id: "billing", label: "Billing", icon: CreditCard, route: "/home/settings/billing", category: "Settings" },
    { id: "settings", label: "General Settings", icon: Settings, route: "/home/settings", category: "Settings" },
  ];

  const filteredItems = items.filter(item => 
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          runCommand(() => router.push(filteredItems[selectedIndex].route));
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, filteredItems, selectedIndex, router, onOpenChange]);

  const runCommand = (command: () => void) => {
    onOpenChange(false);
    command();
  };

  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  let globalIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <div className={styles.commandOverlayWrapper}>
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            transition={{ duration: 0.15 }}
            className={styles.commandOverlay} 
            onClick={() => onOpenChange(false)} 
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.95 }} 
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={styles.commandDialog}
          >
            <div className={styles.commandHeader}>
              <div className={styles.searchInputWrapper}>
                <Search className={styles.commandSearchIcon} />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search"
                  className={styles.commandInput}
                />
                <ListFilter className={styles.filterIcon} />
              </div>
            </div>


            <div className={styles.commandList}>
              {searchQuery.length === 0 ? (
                <div className={styles.emptyStateContainer}>
                  <Search className={styles.emptyStateIcon} />
                  <div className={styles.emptyStateText}>Find anything in Flowauxi</div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className={styles.commandEmpty}>No results found.</div>
              ) : (
                Object.entries(groupedItems).map(([category, items]) => (
                  <div key={category} className={styles.commandGroup}>
                    <div className={styles.commandGroupHeading}>{category}</div>
                    {items.map((item) => {
                      const currentIndex = globalIndex++;
                      const isSelected = currentIndex === selectedIndex;
                      return (
                        <div 
                          key={item.id} 
                          className={`${styles.commandItem} ${isSelected ? styles.commandItemSelected : ""}`}
                          onClick={() => runCommand(() => router.push(item.route))}
                          onMouseEnter={() => setSelectedIndex(currentIndex)}
                        >
                          <item.icon className={styles.commandItemIcon} />
                          {item.label}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
