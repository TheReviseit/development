"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import styles from "./MessageComposer.module.css";
import { getSessionAvatarColor } from "@/lib/utils/avatarColors";

interface Contact {
  name: string;
  phone: string;
  email?: string;
  [key: string]: string | undefined;
}

interface MessageComposerProps {
  contacts: Contact[];
  onBack: () => void;
  onSend: (message: string, mediaFiles: File[]) => void;
}

type MediaType = "image" | "video" | "document" | "audio";

interface UploadedMedia {
  file: File;
  type: MediaType;
  preview: string;
}

interface MessageButton {
  id: string;
  text: string;
  type: "quick_reply" | "url" | "phone";
  value?: string;
}

const ACCEPTED_TYPES: Record<MediaType, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  video: [".mp4", ".mov", ".avi", ".webm"],
  document: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"],
  audio: [".mp3", ".wav", ".ogg", ".m4a"],
};

const MEDIA_ICONS: Record<MediaType, string> = {
  image: "/icons/bulk_message/image.svg",
  video: "/icons/bulk_message/image.svg", // Using image icon for video
  document: "/icons/bulk_message/pdf.svg",
  audio: "/icons/bulk_message/audio.svg",
};

// Button type options with icons
const BUTTON_TYPES = [
  {
    value: "url",
    label: "Visit Website",
    defaultText: "Visit Website",
    placeholder: "https://example.com",
    icon: "/icons/bulk_message/link.svg",
  },
  {
    value: "phone",
    label: "Call Phone",
    defaultText: "Call Now",
    placeholder: "+1234567890",
    icon: "/icons/bulk_message/phone.svg",
  },
  {
    value: "quick_reply",
    label: "Quick Reply",
    defaultText: "Know More",
    placeholder: "",
    icon: "/icons/bulk_message/quick.svg",
  },
] as const;

export default function MessageComposer({
  contacts,
  onBack,
  onSend,
}: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [messageButtons, setMessageButtons] = useState<MessageButton[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get first contact for preview
  const sampleContact = contacts[0] || {
    name: "Contact Name",
    phone: "1234567890",
  };

  // Get session avatar color (consistent for the session)
  const avatarColor = useMemo(() => getSessionAvatarColor(), []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Available variables (keep only name)
  const availableVariables = ["name"];

  // Detect file type
  const getMediaType = (file: File): MediaType => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    for (const [type, extensions] of Object.entries(ACCEPTED_TYPES)) {
      if (extensions.includes(ext)) {
        return type as MediaType;
      }
    }
    // Default to document for unknown types
    return "document";
  };

  // Handle file upload
  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;

    const newMedia: UploadedMedia[] = [];
    Array.from(files).forEach((file) => {
      const type = getMediaType(file);
      let preview = "";

      if (type === "image") {
        preview = URL.createObjectURL(file);
      }

      newMedia.push({ file, type, preview });
    });

    setUploadedMedia([...uploadedMedia, ...newMedia]);
  };

  // Handle drag events
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
    handleFileUpload(e.dataTransfer.files);
  };

  // Remove uploaded media
  const removeMedia = (index: number) => {
    const newMedia = [...uploadedMedia];
    // Revoke object URL if it's an image
    if (newMedia[index].preview) {
      URL.revokeObjectURL(newMedia[index].preview);
    }
    newMedia.splice(index, 1);
    setUploadedMedia(newMedia);
  };

  // Insert variable into message
  const insertVariable = (variable: string) => {
    setMessage((prev) => prev + `{{${variable}}}`);
  };

  // Add a new button with specific type
  const addButton = (type: "quick_reply" | "url" | "phone" = "quick_reply") => {
    if (messageButtons.length >= 3) return; // WhatsApp limit
    const buttonType = BUTTON_TYPES.find((t) => t.value === type);
    const newButton: MessageButton = {
      id: Date.now().toString(),
      text: buttonType?.defaultText || "",
      type,
      value: "",
    };
    setMessageButtons([...messageButtons, newButton]);
  };

  // Update button field
  const updateButton = (
    id: string,
    field: "text" | "value" | "type",
    val: string
  ) => {
    setMessageButtons(
      messageButtons.map((btn) =>
        btn.id === id ? { ...btn, [field]: val } : btn
      )
    );
  };

  // Remove a button
  const removeButton = (id: string) => {
    setMessageButtons(messageButtons.filter((btn) => btn.id !== id));
  };

  // Replace variables with sample values for preview
  const getPreviewMessage = () => {
    let previewText = message || "Your message will appear here...";
    availableVariables.forEach((variable) => {
      const regex = new RegExp(`\\{\\{${variable}\\}\\}`, "g");
      previewText = previewText.replace(regex, sampleContact[variable] || "");
    });
    return previewText;
  };

  // Get current time for preview
  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Handle send
  const handleSend = () => {
    const files = uploadedMedia.map((m) => m.file);
    onSend(message, files);
  };

  // Get all accepted extensions for file input
  const allAcceptedExtensions = Object.values(ACCEPTED_TYPES).flat().join(",");

  return (
    <div className={styles.composerContainer}>
      {/* Mobile Preview Toggle Button */}
      <button
        className={styles.mobilePreviewBtn}
        onClick={() => setShowMobilePreview(true)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12" y2="18" />
        </svg>
        Preview
      </button>

      {/* Preview Panel */}
      <div
        className={`${styles.previewPanel} ${
          showMobilePreview ? styles.previewPanelVisible : ""
        }`}
      >
        <div className={styles.previewHeader}>
          <h3 className={styles.previewTitle}>Message Preview</h3>
          <button
            className={styles.closePreviewBtn}
            onClick={() => setShowMobilePreview(false)}
          >
            ×
          </button>
        </div>
        <div className={styles.phonePreview}>
          {/* Chat Header */}
          <div className={styles.chatHeader}>
            <button className={styles.backArrow} onClick={onBack}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div
              className={styles.contactAvatar}
              style={{
                background: avatarColor.background,
                color: avatarColor.text,
              }}
            >
              {sampleContact.name?.substring(0, 2).toUpperCase() || "CN"}
            </div>
            <div className={styles.contactInfo}>
              <span className={styles.contactName}>
                {sampleContact.name || "Contact Name"}
              </span>
              <span className={styles.contactStatus}>online</span>
            </div>
          </div>

          {/* Chat Background */}
          <div className={styles.chatBackground}>
            <div className={styles.templateMessage}>
              {/* Media Preview - Full width at top */}
              {uploadedMedia.length > 0 && (
                <div className={styles.templateMedia}>
                  {uploadedMedia[0].type === "image" &&
                  uploadedMedia[0].preview ? (
                    <img
                      src={uploadedMedia[0].preview}
                      alt="Preview"
                      className={styles.templateImage}
                    />
                  ) : (
                    <div className={styles.templateMediaPlaceholder}>
                      <img
                        src={MEDIA_ICONS[uploadedMedia[0].type]}
                        alt=""
                        className={styles.mediaIconSvg}
                      />
                      <span className={styles.mediaName}>
                        {uploadedMedia[0].file.name}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Message Body */}
              <div className={styles.templateBody}>
                <div className={styles.previewMessageBody}>
                  {getPreviewMessage()}
                </div>
                <span className={styles.messageTime}>{getCurrentTime()}</span>
              </div>

              {/* Buttons - After message body */}
              {messageButtons.length > 0 && (
                <div className={styles.templateButtons}>
                  {messageButtons.map((btn) => (
                    <button key={btn.id} className={styles.templateButton}>
                      {btn.value && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      )}
                      {btn.text || "Button"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className={styles.previewHint}>
          Preview shows how the first contact will receive the message
        </p>
      </div>

      {/* Composer Panel */}
      <div className={styles.composerPanel}>
        <h3 className={styles.composerTitle}>Compose Message</h3>

        {/* Media Upload Section */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>
            <img
              src="/icons/bulk_message/file.svg"
              alt=""
              className={styles.labelIconSvg}
            />
            Attach Media (Optional)
          </label>
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
              accept={allAcceptedExtensions}
              onChange={(e) => handleFileUpload(e.target.files)}
              style={{ display: "none" }}
              multiple
            />
            <div className={styles.dropZoneContent}>
              <img
                src="/icons/bulk_message/file-upload.svg"
                alt=""
                className={styles.dropZoneIconSvg}
              />
              <p>Drop files here or click to upload</p>
              <span className={styles.supportedFormats}>
                Images, Videos, Documents, Audio
              </span>
            </div>
          </div>

          {/* Uploaded Files List */}
          {uploadedMedia.length > 0 && (
            <div className={styles.uploadedFiles}>
              {uploadedMedia.map((media, index) => (
                <div key={index} className={styles.uploadedFile}>
                  <img
                    src={MEDIA_ICONS[media.type]}
                    alt=""
                    className={styles.fileIconSvg}
                  />
                  <span className={styles.fileName}>{media.file.name}</span>
                  <button
                    className={styles.removeFileBtn}
                    onClick={() => removeMedia(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Text Message Section */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>
            <img
              src="/icons/bulk_message/message.svg"
              alt=""
              className={styles.labelIconSvg}
            />
            Message Text
          </label>

          {/* Variable Buttons */}
          <div className={styles.variableButtons}>
            <span className={styles.variableHint}>Insert variable:</span>
            {availableVariables.map((variable) => (
              <button
                key={variable}
                className={styles.variableBtn}
                onClick={() => insertVariable(variable)}
              >
                {`{{${variable}}}`}
              </button>
            ))}
          </div>

          <textarea
            className={styles.messageTextarea}
            placeholder={`Hi {{name}}, this is a message from our team...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
          />
          <div className={styles.textareaFooter}>
            <span className={styles.charCount}>
              {message.length} characters
            </span>
          </div>
        </div>

        {/* Buttons Section */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={styles.labelIconSvg}
              style={{ filter: "none" }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Add Buttons (Optional)
          </label>
          <p className={styles.buttonHint}>
            Add up to 3 CTA or Quick Reply buttons to your message
          </p>

          <div className={styles.buttonsContainer}>
            {messageButtons.map((btn, index) => {
              const buttonType = BUTTON_TYPES.find((t) => t.value === btn.type);
              return (
                <div key={btn.id} className={styles.buttonInputRow}>
                  <div className={styles.buttonInputHeader}>
                    <span className={styles.buttonNumber}>{index + 1}</span>
                    <span className={styles.buttonTypeLabel}>
                      <img
                        src={buttonType?.icon}
                        alt=""
                        className={styles.buttonTypeLabelIcon}
                      />
                      {buttonType?.label}
                    </span>
                    <button
                      className={styles.removeButtonBtn}
                      onClick={() => removeButton(btn.id)}
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.buttonInputFields}>
                    <input
                      type="text"
                      placeholder="Button text"
                      value={btn.text}
                      onChange={(e) =>
                        updateButton(btn.id, "text", e.target.value)
                      }
                      className={styles.buttonTextField}
                      maxLength={20}
                    />
                    {btn.type !== "quick_reply" && (
                      <input
                        type={btn.type === "phone" ? "tel" : "url"}
                        placeholder={
                          btn.type === "phone"
                            ? "Phone number (e.g., +1234567890)"
                            : "Website URL (e.g., https://example.com)"
                        }
                        value={btn.value || ""}
                        onChange={(e) =>
                          updateButton(btn.id, "value", e.target.value)
                        }
                        className={styles.buttonUrlField}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {messageButtons.length < 3 && (
              <div className={styles.addButtonDropdown} ref={dropdownRef}>
                <button
                  type="button"
                  className={styles.addButtonTrigger}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  + Add Button
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={isDropdownOpen ? styles.chevronUp : ""}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {isDropdownOpen && (
                  <div className={styles.dropdownMenu}>
                    {BUTTON_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        className={styles.dropdownItem}
                        onClick={() => {
                          addButton(type.value);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <img
                          src={type.icon}
                          alt=""
                          className={styles.dropdownIcon}
                        />
                        {type.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className={styles.composerFooter}>
          <button className={styles.backBtn} onClick={onBack}>
            ← Back
          </button>
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!message.trim() && uploadedMedia.length === 0}
          >
            Send to {contacts.length} contacts →
          </button>
        </div>
      </div>
    </div>
  );
}
