"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import styles from "./bulk-messages.module.css";
import MessageComposer from "./MessageComposer";

interface Contact {
  name: string;
  phone: string;
  email?: string;
  [key: string]: string | undefined;
}

const STORAGE_KEY = "bulkMessagesContacts";
const FILENAME_KEY = "bulkMessagesFileName";

export default function BulkMessagesPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentStep, setCurrentStep] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load contacts from localStorage on mount
  useEffect(() => {
    try {
      const savedContacts = localStorage.getItem(STORAGE_KEY);
      const savedFileName = localStorage.getItem(FILENAME_KEY);
      if (savedContacts) {
        setContacts(JSON.parse(savedContacts));
      }
      if (savedFileName) {
        setFileName(savedFileName);
      }
    } catch (err) {
      console.error("Error loading contacts from localStorage:", err);
    }
  }, []);

  // Save contacts to localStorage whenever they change
  useEffect(() => {
    try {
      if (contacts.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.error("Error saving contacts to localStorage:", err);
    }
  }, [contacts]);

  // Save fileName to localStorage whenever it changes
  useEffect(() => {
    try {
      if (fileName) {
        localStorage.setItem(FILENAME_KEY, fileName);
      } else {
        localStorage.removeItem(FILENAME_KEY);
      }
    } catch (err) {
      console.error("Error saving fileName to localStorage:", err);
    }
  }, [fileName]);

  const CONTACTS_PER_PAGE = 5;
  const totalPages = Math.ceil(contacts.length / CONTACTS_PER_PAGE);
  const startIndex = (currentPage - 1) * CONTACTS_PER_PAGE;
  const endIndex = startIndex + CONTACTS_PER_PAGE;
  const paginatedContacts = contacts.slice(startIndex, endIndex);

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
    const actualIndex = startIndex + index;
    setContacts((prev) => prev.filter((_, i) => i !== actualIndex));
    // If removing last item on current page, go to previous page
    if (paginatedContacts.length === 1 && currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleClearAll = () => {
    setContacts([]);
    setFileName(null);
    setError(null);
    setCurrentPage(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Handle send from composer
  const handleSendMessage = (message: string, mediaFiles: File[]) => {
    console.log("Sending message:", message);
    console.log("Media files:", mediaFiles);
    console.log("To contacts:", contacts);
    // TODO: Implement actual sending logic
    alert(`Message will be sent to ${contacts.length} contacts!`);
  };

  // If on step 2 (composer), show the MessageComposer
  if (currentStep === 2) {
    return (
      <MessageComposer
        contacts={contacts}
        onBack={() => setCurrentStep(1)}
        onSend={handleSendMessage}
      />
    );
  }

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
              <img
                src="/icons/bulk_message/upload.svg"
                alt="Upload"
                className={styles.uploadIcon}
              />
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
          <div className={styles.contactsTableWrapper}>
            <table className={styles.contactsTable}>
              <thead>
                <tr>
                  <th
                    className={`${styles.tableHeaderCell} ${styles.snoColumn}`}
                  >
                    S.No
                  </th>
                  <th
                    className={`${styles.tableHeaderCell} ${styles.nameColumn}`}
                  >
                    Name
                  </th>
                  <th
                    className={`${styles.tableHeaderCell} ${styles.detailsColumn}`}
                  >
                    Details
                  </th>
                  <th
                    className={`${styles.tableHeaderCell} ${styles.phoneColumn}`}
                  >
                    Phone
                  </th>
                  <th
                    className={`${styles.tableHeaderCell} ${styles.actionColumn}`}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedContacts.map((contact, index) => (
                  <tr key={startIndex + index} className={styles.tableRow}>
                    <td className={`${styles.tableCell} ${styles.snoColumn}`}>
                      {startIndex + index + 1}
                    </td>
                    {/* Desktop: Name column with avatar */}
                    <td className={`${styles.tableCell} ${styles.nameColumn}`}>
                      <div className={styles.tableCellName}>
                        <div className={styles.tableAvatar}>
                          {contact.name
                            ? contact.name.substring(0, 2).toUpperCase()
                            : contact.phone.substring(0, 2)}
                        </div>
                        <span>{contact.name || "Unknown"}</span>
                      </div>
                    </td>
                    {/* Mobile: Details column with avatar, name, and phone */}
                    <td
                      className={`${styles.tableCell} ${styles.detailsColumn}`}
                    >
                      <div className={styles.mobileDetailsCell}>
                        <div className={styles.tableAvatar}>
                          {contact.name
                            ? contact.name.substring(0, 2).toUpperCase()
                            : contact.phone.substring(0, 2)}
                        </div>
                        <div className={styles.mobileDetailsText}>
                          <span className={styles.mobileDetailsName}>
                            {contact.name || "Unknown"}
                          </span>
                          <span className={styles.mobileDetailsPhone}>
                            {contact.phone}
                          </span>
                        </div>
                      </div>
                    </td>
                    {/* Desktop: Phone column */}
                    <td className={`${styles.tableCell} ${styles.phoneColumn}`}>
                      {contact.phone}
                    </td>
                    <td
                      className={`${styles.tableCell} ${styles.actionColumn}`}
                    >
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

      {/* Footer with Clear All, Pagination, and Next */}
      {contacts.length > 0 && (
        <div className={styles.tableFooter}>
          <button className={styles.clearBtn} onClick={handleClearAll}>
            Clear All
          </button>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.paginationArrow}
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline
                    points="15 18 9 12 15 6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    className={`${styles.paginationBtn} ${
                      currentPage === page ? styles.paginationBtnActive : ""
                    }`}
                    onClick={() => goToPage(page)}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                className={styles.paginationArrow}
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline
                    points="9 18 15 12 9 6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}

          <button
            className={styles.sendBulkBtn}
            onClick={() => setCurrentStep(2)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
