"use client";

import { useState } from "react";
import styles from "../dashboard.module.css";

// Mock conversation data
const mockConversations = [
  {
    id: "1",
    name: "Leslie Alexander",
    avatar: null,
    lastMessage: "Thank you! I will see you tomorrow...",
    time: "11h",
    unread: 2,
    online: true,
  },
  {
    id: "2",
    name: "Savannah Nguyen",
    avatar: null,
    lastMessage: "Fringilla leo sem cursus ut pulvina...",
    time: "1h",
    unread: 0,
    online: false,
  },
  {
    id: "3",
    name: "Kristin Watson",
    avatar: null,
    lastMessage: "Could you send me a link to join...",
    time: "1h",
    unread: 3,
    online: true,
  },
  {
    id: "4",
    name: "Cameron Williamson",
    avatar: null,
    lastMessage: "Fringilla leo sem cursus ut pulvina...",
    time: "1h",
    unread: 0,
    online: false,
  },
  {
    id: "5",
    name: "Jane Cooper",
    avatar: null,
    lastMessage: "Fringilla leo sem cursus ut pulvina...",
    time: "2h",
    unread: 0,
    online: true,
  },
];

const mockMessages = [
  {
    id: "1",
    sender: "contact",
    content:
      "Hi, Brandon! I am looking forward to meeting you! Does tomorrow 9?",
    time: "10:33 am",
    type: "text",
  },
  {
    id: "2",
    sender: "user",
    content: "What about 2:30 PM?",
    time: "11:20 am",
    type: "text",
  },
  {
    id: "3",
    sender: "contact",
    content: "",
    time: "11:21 am",
    type: "audio",
    duration: "00:12",
  },
  {
    id: "4",
    sender: "contact",
    content: "",
    time: "11:23 am",
    type: "image",
    imageUrl: "/placeholder-image.jpg",
  },
  {
    id: "5",
    sender: "user",
    content:
      "Of course! Here is the link:\nhttps://us01web.zoom.us/rec/share/Ap.lr-1hmje-uUUw2ViHSaRDFXyg8h1rS4XYUTFXbWU90V3XVl",
    time: "13:11 am",
    type: "text",
  },
];

const mockContact = {
  name: "Leslie Alexander",
  role: "Co-Founder at Uxcel",
  email: "Leslie@example.com",
  phone: "(+1) 437-123-4567",
  created: "Sep 24, 2021 10:00 am",
  campaign: {
    name: "Schedule Onboarding",
    assigned: "Sep 24, 2021 10:00 am",
    start: "Sep 24, 2021",
  },
  tags: ["Lead", "VIP"],
  company: "Ankle",
  address: "6545 Rodeo Drive",
  notes: "",
};

export default function MessagesView() {
  const [selectedConversation, setSelectedConversation] = useState(
    mockConversations[0]
  );
  const [messageInput, setMessageInput] = useState("");
  const [showContactPanel, setShowContactPanel] = useState(true);
  const [filter, setFilter] = useState("all");

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <div className={styles.messagesView}>
      {/* Conversation List Panel */}
      <div className={styles.conversationList}>
        <div className={styles.conversationListHeader}>
          <h2 className={styles.panelTitle}>Conversation</h2>
          <div className={styles.conversationFilters}>
            <select
              className={styles.filterSelect}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">5 Open</option>
              <option value="unread">Unread</option>
              <option value="open">Open</option>
            </select>
            <select className={styles.sortSelect}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>

        <div className={styles.conversationSearch}>
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
            placeholder="Search conversations..."
            className={styles.searchInput}
          />
        </div>

        <div className={styles.conversationItems}>
          {mockConversations.map((conv) => (
            <div
              key={conv.id}
              className={`${styles.conversationItem} ${
                selectedConversation.id === conv.id
                  ? styles.conversationActive
                  : ""
              }`}
              onClick={() => setSelectedConversation(conv)}
            >
              <div className={styles.conversationAvatar}>
                {getInitials(conv.name)}
                {conv.online && <span className={styles.onlineIndicator} />}
              </div>
              <div className={styles.conversationInfo}>
                <div className={styles.conversationTop}>
                  <span className={styles.conversationName}>{conv.name}</span>
                  <span className={styles.conversationTime}>{conv.time}</span>
                </div>
                <div className={styles.conversationBottom}>
                  <span className={styles.conversationPreview}>
                    {conv.lastMessage}
                  </span>
                  {conv.unread > 0 && (
                    <span className={styles.unreadBadge}>{conv.unread}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area Panel */}
      <div className={styles.chatArea}>
        <div className={styles.chatHeader}>
          <div className={styles.chatHeaderLeft}>
            <div className={styles.chatAvatar}>
              {getInitials(selectedConversation.name)}
            </div>
            <span className={styles.chatName}>{selectedConversation.name}</span>
          </div>
          <div className={styles.chatHeaderActions}>
            <button className={styles.markReadBtn}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mark As Read
            </button>
            <button
              className={styles.togglePanelBtn}
              onClick={() => setShowContactPanel(!showContactPanel)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
            <button className={styles.moreBtn}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.chatMessages}>
          <div className={styles.dateSeparator}>
            <span>August 17</span>
          </div>

          {mockMessages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.messageWrapper} ${
                msg.sender === "user" ? styles.messageOut : styles.messageIn
              }`}
            >
              <div className={styles.messageBubble}>
                {msg.type === "text" && (
                  <p className={styles.messageText}>{msg.content}</p>
                )}
                {msg.type === "audio" && (
                  <div className={styles.audioMessage}>
                    <button className={styles.playBtn}>▶</button>
                    <div className={styles.audioWave}>
                      {[...Array(20)].map((_, i) => (
                        <span
                          key={i}
                          className={styles.audioBar}
                          style={{ height: `${Math.random() * 100}%` }}
                        />
                      ))}
                    </div>
                    <span className={styles.audioDuration}>{msg.duration}</span>
                  </div>
                )}
                {msg.type === "image" && (
                  <div className={styles.imageMessage}>
                    <div className={styles.imagePlaceholder}>
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                  </div>
                )}
                <span className={styles.messageTime}>{msg.time}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.chatInput}>
          <div className={styles.inputTypeSelect}>
            <select className={styles.messageTypeSelect}>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div className={styles.inputWrapper}>
            <input
              type="text"
              placeholder="Write your SMS message here..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              className={styles.messageInput}
            />
            <div className={styles.inputActions}>
              <button className={styles.attachBtn}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              <button className={styles.attachBtn}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <button className={styles.attachBtn}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>
            </div>
          </div>
          <button className={styles.sendBtn}>
            Send
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Contact Details Panel */}
      {showContactPanel && (
        <div className={styles.contactPanel}>
          <div className={styles.contactHeader}>
            <h3 className={styles.panelTitle}>Details</h3>
            <button
              className={styles.closeBtn}
              onClick={() => setShowContactPanel(false)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className={styles.contactProfile}>
            <div className={styles.contactAvatarLarge}>
              {getInitials(mockContact.name)}
            </div>
            <h4 className={styles.contactName}>{mockContact.name}</h4>
            <span className={styles.contactRole}>{mockContact.role}</span>
          </div>

          <div className={styles.contactSections}>
            <div className={styles.contactSection}>
              <h5 className={styles.sectionTitle}>Contact</h5>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>✉️</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Email</span>
                  <span className={styles.fieldValue}>{mockContact.email}</span>
                </div>
              </div>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>📞</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Phone</span>
                  <span className={styles.fieldValue}>{mockContact.phone}</span>
                </div>
              </div>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>📅</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Created</span>
                  <span className={styles.fieldValue}>
                    {mockContact.created}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.contactSection}>
              <h5 className={styles.sectionTitle}>Campaign</h5>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>📋</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Name</span>
                  <span className={styles.fieldValue}>
                    {mockContact.campaign.name}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.contactSection}>
              <h5 className={styles.sectionTitle}>Tags</h5>
              <div className={styles.tagsContainer}>
                {mockContact.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.contactSection}>
              <h5 className={styles.sectionTitle}>Notes</h5>
              <textarea
                className={styles.notesInput}
                placeholder="Add notes about this contact..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
