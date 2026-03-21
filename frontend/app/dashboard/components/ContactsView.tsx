"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { auth } from "@/src/firebase/firebase";
import styles from "../dashboard.module.css";
import AddContactModal from "./AddContactModal";
import BulkUploadModal from "./BulkUploadModal";
import ContactDetailPanel from "./ContactDetailPanel";
import TagManagementModal from "./TagManagementModal";
import ConfirmationModal from "./ConfirmationModal";

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  email: string;
  tags: string[];
  lifecycle_stage: string;
  lead_score: number;
  source: string;
  status: string;
  interaction_count: number;
  last_interaction_at: string;
  updated_at: string;
}

export default function ContactsView() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ensure auth is loaded
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsAuthReady(!!user);
    });
    return () => unsubscribe();
  }, []);

  const {
    data: fetchResult,
    isLoading,
    error,
    refetch,
  } = useQuery<{ contacts: Contact[] }>({
    queryKey: ["contacts"],
    queryFn: async () => {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const res = await fetch("/api/contacts", {
        headers: { "X-User-ID": user.uid },
      });
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
    enabled: isAuthReady,
    staleTime: 60000,
    refetchInterval: 10000,
  });

  const contacts = fetchResult?.contacts || [];

  const filteredContacts = contacts.filter(
    (contact) =>
      (contact.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (contact.phone_number || "").includes(searchQuery) ||
      (contact.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (contact.tags || []).some((t) =>
        t.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  const executeDelete = async () => {
    try {
      setDeleteLoading(true);
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");

      const headers = { "X-User-ID": user.uid };

      const results = await Promise.allSettled(
        pendingDeleteIds.map(async (id) => {
          const res = await fetch(`/api/contacts/${id}`, {
            method: "DELETE",
            headers,
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Delete failed (${res.status})`);
          }
          return res.json();
        })
      );

      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        console.error("❌ Some deletes failed:", failed);
        const firstError = (failed[0] as PromiseRejectedResult).reason?.message || "Unknown error";
        alert(`Failed to delete ${failed.length} contact(s): ${firstError}`);
      }

      setSelectedContacts((prev) =>
        prev.filter((id) => !pendingDeleteIds.includes(id))
      );
      setPendingDeleteIds([]);
      setIsDeleteModalOpen(false);
      refetch();
    } catch (err: any) {
      console.error("Failed to delete contacts:", err);
      alert(`Failed to delete contacts: ${err.message}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map((c) => c.id));
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const activeContacts = contacts.filter((c) => c.status === "active").length;
  const highIntentContacts = contacts.filter((c) =>
    (c.tags || []).includes("high_intent"),
  ).length;

  // ── Export contacts as CSV ──
  const handleExport = useCallback(async () => {
    try {
      setExportLoading(true);
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");

      console.log("📥 Exporting contacts...");

      const res = await fetch("/api/contacts/export", {
        headers: { "X-User-ID": user.uid },
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      if (blob.size === 0) {
        alert("No contacts to export.");
        return;
      }

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log("✅ Export downloaded");
    } catch (err: any) {
      console.error("❌ Export error:", err);
      alert("Failed to export contacts.");
    } finally {
      setExportLoading(false);
    }
  }, []);

  return (
    <div className={styles.contactsView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Contacts</h1>
          {/* <p className={styles.viewSubtitle}>
            Manage your FAANG-grade CRM segments and contacts
          </p> */}
        </div>
        <div className={styles.headerButtons}>
          <button className={styles.secondaryBtn} onClick={() => refetch()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.28l5.67-5.67" />
            </svg>
            Refresh
          </button>
          <div ref={dropdownRef} style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
            <button
              className={styles.primaryBtn}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Contacts
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 0.2s", transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: "180px",
                  background: "#18181A",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  zIndex: 50,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
                }}
              >
                <button
                  onClick={() => { setIsAddModalOpen(true); setIsDropdownOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "transparent", border: "none", color: "#fff", cursor: "pointer", borderRadius: "4px", fontSize: "14px", textAlign: "left", width: "100%" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add Contact
                </button>
                <button
                  onClick={() => { setIsBulkUploadOpen(true); setIsDropdownOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "transparent", border: "none", color: "#fff", cursor: "pointer", borderRadius: "4px", fontSize: "14px", textAlign: "left", width: "100%" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  Import CSV
                </button>
                <button
                  onClick={() => { handleExport(); setIsDropdownOpen(false); }}
                  disabled={exportLoading}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "transparent", border: "none", color: "#fff", cursor: "pointer", borderRadius: "4px", fontSize: "14px", textAlign: "left", width: "100%", opacity: exportLoading ? 0.5 : 1 }}
                  onMouseEnter={(e) => (!exportLoading && (e.currentTarget.style.background = "rgba(255,255,255,0.05)"))}
                  onMouseLeave={(e) => (!exportLoading && (e.currentTarget.style.background = "transparent"))}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  {exportLoading ? "Exporting..." : "Export"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className={styles.contactStats}>
        <div className={styles.contactStat}>
          <span className={styles.statNumber}>{contacts.length}</span>
          <span className={styles.statLabel}>Total Contacts</span>
        </div>
        <div className={styles.contactStat}>
          <span className={styles.statNumber}>{activeContacts}</span>
          <span className={styles.statLabel}>Active</span>
        </div>
        <div className={styles.contactStat}>
          <span className={styles.statNumber}>{highIntentContacts}</span>
          <span className={styles.statLabel}>High Intent</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className={styles.contactsToolbar}>
        <div className={styles.searchWrapper}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, phone, email, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        {selectedContacts.length > 0 && (
          <div className={styles.bulkActions}>
            <span className={styles.selectedCount}>
              {selectedContacts.length} selected
            </span>
            <button className={styles.bulkBtn} onClick={() => setIsTagModalOpen(true)}>Add Tags</button>
            <button className={styles.bulkBtn} onClick={() => router.push("/dashboard/bulk-messages")}>Send Message</button>
            <button className={`${styles.bulkBtn} ${styles.deleteBtn}`} onClick={() => {
              setPendingDeleteIds(selectedContacts);
              setIsDeleteModalOpen(true);
            }}>
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Contacts Table */}
      <div className={styles.contactsTable}>
        <div className={styles.tableHeader}>
          <div className={styles.tableCell}>
            <input
              type="checkbox"
              checked={
                selectedContacts.length === filteredContacts.length &&
                filteredContacts.length > 0
              }
              onChange={toggleAll}
              className={styles.checkbox}
            />
          </div>
          <div className={`${styles.tableCell} ${styles.cellName}`}>
            Name
          </div>
          <div className={`${styles.tableCell} ${styles.cellPhone}`}>
            Phone
          </div>
          <div className={`${styles.tableCell} ${styles.cellTags}`}>
            Tags & Stage
          </div>
          <div className={`${styles.tableCell} ${styles.cellStatus}`}>
            Score
          </div>
          <div className={`${styles.tableCell} ${styles.cellActions}`}>
            Actions
          </div>
        </div>

        <div className={styles.tableBody}>
          {isLoading ? (
            <div className={styles.emptyState}>
              <p>Loading Contacts...</p>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <p>Error loading contacts.</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No contacts found.</p>
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div key={contact.id} className={styles.tableRow}>
                <div className={styles.tableCell}>
                  <input
                    type="checkbox"
                    checked={selectedContacts.includes(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                    className={styles.checkbox}
                  />
                </div>
                <div className={`${styles.tableCell} ${styles.cellName}`}>
                  <div className={styles.contactAvatar}>
                    {getInitials(contact.name)}
                  </div>
                  <span>{contact.name || "Unknown"}</span>
                </div>
                <div className={`${styles.tableCell} ${styles.cellPhone}`}>
                  {contact.phone_number}
                </div>
                <div className={`${styles.tableCell} ${styles.cellTags}`}>
                  <span
                    className={styles.statusBadge}
                    style={{
                      backgroundColor: "#e0f2fe",
                      color: "#0369a1",
                      padding: "2px 6px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      marginRight: "6px",
                    }}
                  >
                    {contact.lifecycle_stage || "lead"}
                  </span>
                  {(contact.tags || []).map((tag) => (
                    <span key={tag} className={styles.contactTag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className={`${styles.tableCell} ${styles.cellStatus}`}>
                  <span
                    className={`${styles.statusBadge} ${styles.statusActive}`}
                  >
                    {contact.lead_score || 0} pts
                  </span>
                </div>
                <div className={`${styles.tableCell} ${styles.cellActions}`}>
                  <button className={styles.actionBtn} title="View Details" onClick={() => setDetailContact(contact)}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  <button className={styles.actionBtn} title="Message" onClick={() => router.push(`/dashboard/messages?phone=${contact.phone_number}`)}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 9H17M7 13H12M21 20L17.6757 18.3378C17.4237 18.2118 17.2977 18.1488 17.1656 18.1044C17.0484 18.065 16.9277 18.0365 16.8052 18.0193C16.6672 18 16.5263 18 16.2446 18H6.2C5.07989 18 4.51984 18 4.09202 17.782C3.71569 17.5903 3.40973 17.2843 3.21799 16.908C3 16.4802 3 15.9201 3 14.8V7.2C3 6.07989 3 5.51984 3.21799 5.09202C3.40973 4.71569 3.71569 4.40973 4.09202 4.21799C4.51984 4 5.0799 4 6.2 4H17.8C18.9201 4 19.4802 4 19.908 4.21799C20.2843 4.40973 20.5903 4.71569 20.782 5.09202C21 5.51984 21 6.0799 21 7.2V20Z" />
                    </svg>
                  </button>
                  <button className={styles.actionBtn} title="Delete" onClick={() => { setPendingDeleteIds([contact.id]); setIsDeleteModalOpen(true); }}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ff4444"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <AddContactModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          refetch();
          setIsAddModalOpen(false);
        }}
      />
      <BulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSuccess={() => {
          refetch();
        }}
      />
      <ContactDetailPanel
        contact={detailContact}
        onClose={() => setDetailContact(null)}
      />
      <TagManagementModal
        isOpen={isTagModalOpen}
        contactIds={selectedContacts}
        onClose={() => setIsTagModalOpen(false)}
        onSuccess={() => {
          refetch();
          setSelectedContacts([]);
        }}
      />
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={executeDelete}
        title="Delete Contacts"
        message={`Are you sure you want to delete ${pendingDeleteIds.length} contact(s)? This action cannot be undone.`}
        confirmText="Delete"
        type="danger"
        isLoading={deleteLoading}
      />
    </div>
  );
}
