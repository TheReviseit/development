"use client";

import { useState, useRef } from "react";
import styles from "./MessageComposer.module.css";

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

const ACCEPTED_TYPES: Record<MediaType, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  video: [".mp4", ".mov", ".avi", ".webm"],
  document: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"],
  audio: [".mp3", ".wav", ".ogg", ".m4a"],
};

const MEDIA_ICONS: Record<MediaType, string> = {
  image: "🖼️",
  video: "🎬",
  document: "📄",
  audio: "🎵",
};

export default function MessageComposer({
  contacts,
  onBack,
  onSend,
}: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get first contact for preview
  const sampleContact = contacts[0] || {
    name: "Contact Name",
    phone: "1234567890",
  };

  // Get available variables from contact data
  const availableVariables = Object.keys(sampleContact).filter(
    (key) => sampleContact[key] && typeof sampleContact[key] === "string"
  );

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
      {/* Preview Panel */}
      <div className={styles.previewPanel}>
        <h3 className={styles.previewTitle}>Message Preview</h3>
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
            <div className={styles.contactAvatar}>
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
            <div className={styles.messageBubble}>
              {/* Media Preview */}
              {uploadedMedia.length > 0 && (
                <div className={styles.mediaPreview}>
                  {uploadedMedia.map((media, index) => (
                    <div key={index} className={styles.mediaItem}>
                      {media.type === "image" && media.preview ? (
                        <img
                          src={media.preview}
                          alt="Preview"
                          className={styles.mediaImage}
                        />
                      ) : (
                        <div className={styles.mediaPlaceholder}>
                          <span className={styles.mediaIcon}>
                            {MEDIA_ICONS[media.type]}
                          </span>
                          <span className={styles.mediaName}>
                            {media.file.name}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Message Text */}
              <div className={styles.previewMessageBody}>
                {getPreviewMessage()}
              </div>
              <span className={styles.messageTime}>{getCurrentTime()}</span>
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
            <span className={styles.labelIcon}>📎</span>
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
              <span className={styles.uploadIcon}>📤</span>
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
                  <span className={styles.fileIcon}>
                    {MEDIA_ICONS[media.type]}
                  </span>
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
            <span className={styles.labelIcon}>💬</span>
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
