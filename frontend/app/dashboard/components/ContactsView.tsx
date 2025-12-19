"use client";

import { useState } from "react";
import styles from "../dashboard.module.css";

// Mock contacts data
const mockContacts = [
  {
    id: "1",
    name: "Leslie Alexander",
    phone: "+1 437-123-4567",
    email: "leslie@example.com",
    tags: ["VIP", "Lead"],
    lastActive: "2 hours ago",
    status: "active",
  },
  {
    id: "2",
    name: "Savannah Nguyen",
    phone: "+1 555-234-5678",
    email: "savannah@example.com",
    tags: ["Customer"],
    lastActive: "1 day ago",
    status: "active",
  },
  {
    id: "3",
    name: "Kristin Watson",
    phone: "+1 555-345-6789",
    email: "kristin@example.com",
    tags: ["Lead", "Newsletter"],
    lastActive: "3 hours ago",
    status: "active",
  },
  {
    id: "4",
    name: "Cameron Williamson",
    phone: "+1 555-456-7890",
    email: "cameron@example.com",
    tags: ["Customer", "VIP"],
    lastActive: "5 days ago",
    status: "inactive",
  },
  {
    id: "5",
    name: "Jane Cooper",
    phone: "+1 555-567-8901",
    email: "jane@example.com",
    tags: ["Lead"],
    lastActive: "1 hour ago",
    status: "active",
  },
  {
    id: "6",
    name: "Robert Brown",
    phone: "+1 555-678-9012",
    email: "robert@example.com",
    tags: ["Customer"],
    lastActive: "2 weeks ago",
    status: "inactive",
  },
];

export default function ContactsView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  const filteredContacts = mockContacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone.includes(searchQuery) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map((c) => c.id));
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <div className={styles.contactsView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Contacts</h1>
          <p className={styles.viewSubtitle}>
            Manage your WhatsApp contacts and segments
          </p>
        </div>
        <div className={styles.headerButtons}>
          <button className={styles.secondaryBtn}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
          <button className={styles.secondaryBtn}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <button className={styles.primaryBtn}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Contact
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className={styles.contactStats}>
        <div className={styles.contactStat}>
          <span className={styles.statNumber}>{mockContacts.length}</span>
          <span className={styles.statLabel}>Total Contacts</span>
        </div>
        <div className={styles.contactStat}>
          <span className={styles.statNumber}>
            {mockContacts.filter((c) => c.status === "active").length}
          </span>
          <span className={styles.statLabel}>Active</span>
        </div>
        <div className={styles.contactStat}>
          <span className={styles.statNumber}>
            {mockContacts.filter((c) => c.tags.includes("VIP")).length}
          </span>
          <span className={styles.statLabel}>VIP Contacts</span>
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
            placeholder="Search by name, phone, or email..."
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
            <button className={styles.bulkBtn}>Add to Segment</button>
            <button className={styles.bulkBtn}>Send Message</button>
            <button className={`${styles.bulkBtn} ${styles.deleteBtn}`}>
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
          <div className={`${styles.tableCell} ${styles.cellName}`}>Name</div>
          <div className={`${styles.tableCell} ${styles.cellPhone}`}>Phone</div>
          <div className={`${styles.tableCell} ${styles.cellEmail}`}>Email</div>
          <div className={`${styles.tableCell} ${styles.cellTags}`}>Tags</div>
          <div className={`${styles.tableCell} ${styles.cellStatus}`}>
            Status
          </div>
          <div className={`${styles.tableCell} ${styles.cellActions}`}>
            Actions
          </div>
        </div>

        <div className={styles.tableBody}>
          {filteredContacts.map((contact) => (
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
                <span>{contact.name}</span>
              </div>
              <div className={`${styles.tableCell} ${styles.cellPhone}`}>
                {contact.phone}
              </div>
              <div className={`${styles.tableCell} ${styles.cellEmail}`}>
                {contact.email}
              </div>
              <div className={`${styles.tableCell} ${styles.cellTags}`}>
                {contact.tags.map((tag) => (
                  <span key={tag} className={styles.contactTag}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className={`${styles.tableCell} ${styles.cellStatus}`}>
                <span
                  className={`${styles.statusBadge} ${
                    contact.status === "active"
                      ? styles.statusActive
                      : styles.statusInactive
                  }`}
                >
                  {contact.status}
                </span>
              </div>
              <div className={`${styles.tableCell} ${styles.cellActions}`}>
                <button className={styles.actionBtn} title="View">
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
                <button className={styles.actionBtn} title="Message">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                <button className={styles.actionBtn} title="Edit">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
