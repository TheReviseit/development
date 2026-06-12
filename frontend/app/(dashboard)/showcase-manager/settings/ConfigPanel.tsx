/**
 * ConfigPanel - Configuration controls for showcase settings
 * Mutates config state via callbacks
 */

"use client";

import React from "react";
import styles from "./ConfigPanel.module.css";
import { PresentationConfig } from "./config.schema";

interface ConfigPanelProps {
  config: PresentationConfig;
  onChange: (config: PresentationConfig) => void;
  onSave: () => void;
  isSaving: boolean;
}

export function ConfigPanel({
  config,
  onChange,
  onSave,
  isSaving,
}: ConfigPanelProps) {
  // Helper to update a specific field visibility
  const updateField = (fieldName: string, visible: boolean) => {
    onChange({
      ...config,
      fields: {
        ...config.fields,
        [fieldName]: { visible },
      },
    });
  };

  // Helper to update action settings
  const updateAction = (
    actionName: string,
    enabled: boolean,
    label?: string,
  ) => {
    onChange({
      ...config,
      actions: {
        ...config.actions,
        [actionName]: {
          enabled,
          label: label || config.actions[actionName]?.label || "",
        },
      },
    });
  };

  const updateActionLabel = (actionName: string, label: string) => {
    onChange({
      ...config,
      actions: {
        ...config.actions,
        [actionName]: {
          ...config.actions[actionName],
          label,
        },
      },
    });
  };

  return (
    <div className={styles.configPanel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Card Configuration</h2>
        <p className={styles.subtitle}>
          Control what appears on your showcase cards
        </p>
      </div>

      <div className={styles.sections}>
        {/* Display Fields Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Display Fields</h3>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={config.fields.price?.visible || false}
              onChange={(e) => updateField("price", e.target.checked)}
            />
            <span className={styles.toggleLabel}>
              <span className={styles.toggleText}>Show Price</span>
              <span className={styles.toggleSwitch}></span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={config.fields.colors?.visible || false}
              onChange={(e) => updateField("colors", e.target.checked)}
            />
            <span className={styles.toggleLabel}>
              <span className={styles.toggleText}>Show Colors</span>
              <span className={styles.toggleSwitch}></span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={config.fields.sizes?.visible || false}
              onChange={(e) => updateField("sizes", e.target.checked)}
            />
            <span className={styles.toggleLabel}>
              <span className={styles.toggleText}>Show Sizes</span>
              <span className={styles.toggleSwitch}></span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={config.fields.stock?.visible || false}
              onChange={(e) => updateField("stock", e.target.checked)}
            />
            <span className={styles.toggleLabel}>
              <span className={styles.toggleText}>Show Quantity</span>
              <span className={styles.toggleSwitch}></span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={config.fields.description?.visible !== false}
              onChange={(e) => updateField("description", e.target.checked)}
            />
            <span className={styles.toggleLabel}>
              <span className={styles.toggleText}>Show Description</span>
              <span className={styles.toggleSwitch}></span>
            </span>
          </label>
        </div>

        {/* Action Buttons Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Action Buttons</h3>

          <div className={styles.actionGroup}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={config.actions.order?.enabled || false}
                onChange={(e) => updateAction("order", e.target.checked)}
              />
              <span className={styles.toggleLabel}>
                <span className={styles.toggleText}>
                  Enable "Order Now" Button
                </span>
                <span className={styles.toggleSwitch}></span>
              </span>
            </label>

            {config.actions.order?.enabled && (
              <input
                type="text"
                placeholder="Button Text"
                value={config.actions.order.label}
                onChange={(e) => updateActionLabel("order", e.target.value)}
                className={styles.textInput}
              />
            )}
          </div>

          <div className={styles.actionGroup}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={config.actions.book?.enabled || false}
                onChange={(e) => updateAction("book", e.target.checked)}
              />
              <span className={styles.toggleLabel}>
                <span className={styles.toggleText}>
                  Enable "Book Now" Button
                </span>
                <span className={styles.toggleSwitch}></span>
              </span>
            </label>

            {config.actions.book?.enabled && (
              <input
                type="text"
                placeholder="Button Text"
                value={config.actions.book.label}
                onChange={(e) => updateActionLabel("book", e.target.value)}
                className={styles.textInput}
              />
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className={styles.footer}>
        <button
          className={styles.saveButton}
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Configuration"}
        </button>

        <p className={styles.footerNote}>
          Changes will apply to all showcase cards immediately
        </p>
      </div>
    </div>
  );
}
