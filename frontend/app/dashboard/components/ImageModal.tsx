"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import styles from "./ImageModal.module.css";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
}

export default function ImageModal({
  isOpen,
  onClose,
  imageUrl,
}: ImageModalProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom and pan when modal opens or image changes
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    // Cleanup: always restore scroll when component unmounts
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, imageUrl]);

  const handleZoomIn = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale((prev) => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale((prev) => {
      const newScale = Math.max(prev - 0.5, 1);
      if (newScale === 1) setOffset({ x: 0, y: 0 });
      return newScale;
    });
  };

  const handleReset = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const onWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey || true) {
      // Always allow wheel zoom for convenience
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setScale((prev) => {
        const next = Math.max(1, Math.min(5, prev + delta));
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container && isOpen) {
      container.addEventListener("wheel", onWheel, { passive: false });
    }
    return () => {
      container?.removeEventListener("wheel", onWheel);
    };
  }, [isOpen, onWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={containerRef}
        className={styles.container}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div
          className={`${styles.imageWrapper} ${isDragging ? styles.dragging : ""}`}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleMouseDown}
        >
          <img
            src={imageUrl}
            alt="Full preview"
            className={styles.image}
            draggable={false}
          />
        </div>

        {/* Zoom Controls */}
        <div className={styles.controls} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            －
          </button>
          <div className={styles.zoomLevel}>{Math.round(scale * 100)}%</div>
          <button
            type="button"
            className={styles.controlButton}
            onClick={handleZoomIn}
            title="Zoom In"
          >
            ＋
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={handleReset}
            title="Reset Zoom"
            style={{ marginLeft: "8px" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
