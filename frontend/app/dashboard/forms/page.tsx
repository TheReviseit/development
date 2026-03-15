"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ConfirmationModal from "../components/ConfirmationModal";
import { AlertToast } from "@/components/ui/alert-toast";
import styles from "./forms.module.css";

interface FormItem {
  id: string;
  title: string;
  description: string | null;
  slug: string | null;
  short_id: string | null;
  status: "draft" | "published" | "archived";
  response_count: number;
  created_at: string;
  updated_at: string;
}

export default function FormsListPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [formToDelete, setFormToDelete] = useState<string | null>(null);
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Fetch the current user's workspace slug for constructing form links
  useEffect(() => {
    const slugify = (text: string): string =>
      text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    const fetchWorkspaceSlug = async () => {
      try {
        const res = await fetch("/api/business/get", { credentials: "include" });
        const responseData = await res.json();
        const biz = responseData.data;
        if (biz?.businessName) {
          setWorkspaceSlug(slugify(biz.businessName));
        }
      } catch (err) {
        console.error("Failed to fetch workspace slug:", err);
      }
    };
    fetchWorkspaceSlug();
  }, []);

  const fetchForms = useCallback(async () => {
    try {
      const res = await fetch("/api/forms", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.forms) {
        setForms(data.forms);
      }
    } catch (err) {
      console.error("Failed to fetch forms:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const handleCreateForm = () => {
    // Lazy creation: navigate to builder in "new" mode.
    // No DB record is created until the user explicitly hits Save inside the builder.
    // This prevents orphan "Untitled Form" records when users exit without saving.
    router.push("/dashboard/forms/builder/new");
  };

  const handleDeleteClick = (e: React.MouseEvent, formId: string) => {
    e.stopPropagation();
    setFormToDelete(formId);
  };

  const executeDeleteForm = async () => {
    if (!formToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/forms/${formToDelete}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setForms((prev) => prev.filter((f) => f.id !== formToDelete));
        setToastMessage("success:Form deleted successfully");
      } else {
        setToastMessage(`error:${data.error || "Failed to delete form"}`);
      }
    } catch (err) {
      console.error("Failed to delete form:", err);
      setToastMessage("error:Failed to delete form. Please try again.");
    } finally {
      setIsDeleting(false);
      setFormToDelete(null);
    }
  };

  const handleCopyLink = (e: React.MouseEvent, slug: string) => {
    e.stopPropagation();
    // Use workspace-scoped URL: /{workspace}/forms/{slug}
    const url = workspaceSlug
      ? `${window.location.origin}/${workspaceSlug}/forms/${slug}`
      : `${window.location.origin}/form/${slug}`;
    navigator.clipboard.writeText(url);
    setToastMessage("Link copied!");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Loading forms...</p>
      </div>
    );
  }

  return (
    <div className={styles.formsContainer}>
      <div className={styles.formsHeader}>
        <div>
          <h1 className={styles.formsTitle}>Forms</h1>
          <p className={styles.formsSubtitle}>
            Build, publish, and manage lead capture forms
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchContainer}>
            <svg className={styles.searchIcon} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search forms..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className={styles.createFormBtn}
            onClick={handleCreateForm}
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Create Form
          </button>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg
              width="36"
              height="36"
              fill="none"
              stroke="#fff"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className={styles.emptyTitle}>No forms yet</h3>
          <p className={styles.emptySubtitle}>
            Create your first form to start collecting leads, feedback, and
            contact information from your customers.
          </p>
          <button
            className={styles.createFormBtn}
            onClick={handleCreateForm}
            style={{ marginTop: 24 }}
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Create Your First Form
          </button>
        </div>
      ) : (
        <div className={styles.formsTableContainer}>
          <table className={styles.formsTable}>
            <thead>
              <tr>
                <th className={styles.snoCell}>S.No</th>
                <th className={styles.formTitleTh}>Form Name</th>
                <th className={styles.statusTh}>Status</th>
                <th className={styles.responsesTh}>Responses</th>
                <th className={styles.dateTh}>Created At</th>
                <th className={styles.actionsTh}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forms
                .filter((f) => f.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((form, index) => (
                  <tr
                    key={form.id}
                    className={styles.formsTableRow}
                    onClick={() => router.push(`/dashboard/forms/builder/${form.id}`)}
                  >
                    <td className={styles.snoCell}>{index + 1}</td>
                    <td>
                      <div className={styles.formTitleCell}>
                        <span className={styles.formTitle}>{form.title}</span>
                        {form.description && (
                          <span className={styles.formDescription}>{form.description}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span
                        className={`${styles.statusBadge} ${
                          form.status === "published"
                            ? styles.statusPublished
                            : form.status === "archived"
                              ? styles.statusArchived
                              : styles.statusDraft
                        }`}
                      >
                        {form.status === "published" && "● "}
                        {form.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg width="14" height="14" fill="none" stroke="#888" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span style={{ fontWeight: 600, color: "#eee" }}>{form.response_count}</span>
                      </div>
                    </td>
                    <td style={{ color: "#888", whiteSpace: "nowrap" }}>{formatDate(form.created_at)}</td>
                    <td>
                      <div className={styles.tableActions}>
                        {form.status === "published" && form.slug && (
                          <button
                            className={styles.iconBtn}
                            onClick={(e) => handleCopyLink(e, form.slug!)}
                            title="Copy Link"
                          >
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </button>
                        )}
                        <button
                          className={styles.iconBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/forms/builder/${form.id}`);
                          }}
                          title="Edit Form"
                        >
                          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          className={`${styles.iconBtn} ${styles.danger}`}
                          onClick={(e) => handleDeleteClick(e, form.id)}
                          title="Delete Form"
                        >
                          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <button
                          className={styles.viewResponsesBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/forms/${form.id}/responses`);
                          }}
                        >
                          Responses
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!formToDelete}
        onClose={() => setFormToDelete(null)}
        onConfirm={executeDeleteForm}
        title="Delete Form"
        message="Are you sure you want to delete this form? This action cannot be undone."
        confirmText="Delete Form"
        isLoading={isDeleting}
      />

      {toastMessage && (() => {
        const isError = toastMessage.startsWith("error:");
        const msg = toastMessage.replace(/^(success|error):/, "");
        return (
          <div className={styles.toastWrapper}>
            <AlertToast
              variant={isError ? "error" : "success"}
              styleVariant="minimal"
              title={isError ? "Error" : "Done!"}
              description={msg}
              onClose={() => setToastMessage(null)}
            />
          </div>
        );
      })()}
    </div>
  );
}
