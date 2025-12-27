"use client";

import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import styles from "../dashboard.module.css";

interface Contact {
  name: string;
  phone: string;
  email?: string;
  [key: string]: string | undefined;
}

export default function BulkMessagesPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processExcelFile = useCallback((file: File) => {
    setIsLoading(true);
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<
          string,
          unknown
        >[];

        // Map the data to our Contact format
        const mappedContacts: Contact[] = jsonData.map((row) => {
          // Try to find name and phone columns (case-insensitive)
          const keys = Object.keys(row);
          const nameKey = keys.find((k) => k.toLowerCase().includes("name"));
          const phoneKey = keys.find(
            (k) =>
              k.toLowerCase().includes("phone") ||
              k.toLowerCase().includes("mobile") ||
              k.toLowerCase().includes("number")
          );
          const emailKey = keys.find((k) => k.toLowerCase().includes("email"));

          return {
            name: nameKey ? String(row[nameKey] || "") : "",
            phone: phoneKey ? String(row[phoneKey] || "") : "",
            email: emailKey ? String(row[emailKey] || "") : undefined,
            ...Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k, String(v)])
            ),
          };
        });

        // Filter out contacts without phone numbers
        const validContacts = mappedContacts.filter(
          (c) => c.phone && c.phone.trim() !== ""
        );

        if (validContacts.length === 0) {
          setError(
            "No valid contacts found. Make sure your Excel has a column with 'phone', 'mobile', or 'number' in its header."
          );
        } else {
          setContacts(validContacts);
        }
      } catch (err) {
        console.error("Error parsing Excel:", err);
        setError("Failed to parse Excel file. Please check the file format.");
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Failed to read file");
      setIsLoading(false);
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  const handleRemoveContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setContacts([]);
    setFileName(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={styles.bulkMessagesContainer}>
      <div className={styles.bulkMessagesHeader}>
        <h1 className={styles.pageTitle}>Bulk Messages</h1>
        <p className={styles.pageDescription}>
          Upload your contacts from an Excel file and send bulk WhatsApp
          messages
        </p>
      </div>

      {/* Upload Section - only show when no contacts loaded */}
      {contacts.length === 0 && (
        <div className={styles.uploadSection}>
          <div
            className={`${styles.dropZone} ${
              isDragging ? styles.dropZoneActive : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <div className={styles.dropZoneContent}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="17 8 12 3 7 8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="12"
                  y1="3"
                  x2="12"
                  y2="15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3>Drop your Excel file here</h3>
              <p>or click to browse</p>
              <span className={styles.fileFormats}>
                Supported formats: .xlsx, .xls, .csv
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Processing file...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={styles.errorState}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Contacts Table */}
      {contacts.length > 0 && (
        <div className={styles.contactsSection}>
          <div className={styles.contactsHeader}>
            <div className={styles.contactsInfo}>
              <h2>Uploaded Contacts</h2>
              <span className={styles.contactsCount}>
                {contacts.length} contacts from {fileName}
              </span>
            </div>
            <div className={styles.contactsActions}>
              <button className={styles.clearBtn} onClick={handleClearAll}>
                Clear All
              </button>
              <button className={styles.sendBulkBtn}>
                Send Messages ({contacts.length})
              </button>
            </div>
          </div>

          <div className={styles.contactsTableWrapper}>
            <table className={styles.contactsTable}>
              <thead>
                <tr>
                  <th className={styles.tableHeaderCell}>#</th>
                  <th className={styles.tableHeaderCell}>Name</th>
                  <th className={styles.tableHeaderCell}>Phone</th>
                  <th className={styles.tableHeaderCell}>Email</th>
                  <th className={styles.tableHeaderCell}>Action</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact, index) => (
                  <tr key={index} className={styles.tableRow}>
                    <td className={styles.tableCell}>{index + 1}</td>
                    <td className={styles.tableCell}>
                      <div className={styles.tableCellName}>
                        <div className={styles.tableAvatar}>
                          {contact.name
                            ? contact.name.substring(0, 2).toUpperCase()
                            : contact.phone.substring(0, 2)}
                        </div>
                        <span>{contact.name || "Unknown"}</span>
                      </div>
                    </td>
                    <td className={styles.tableCell}>{contact.phone}</td>
                    <td className={styles.tableCell}>{contact.email || "-"}</td>
                    <td className={styles.tableCell}>
                      <button
                        className={styles.removeContactBtn}
                        onClick={() => handleRemoveContact(index)}
                        title="Remove contact"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
