"use client";

import React, { useEffect, useState } from "react";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  environment: "test" | "live";
  scopes: string[];
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface Project {
  id: string;
  name: string;
}

export default function APIKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [newKey, setNewKey] = useState({ name: "", environment: "test" });
  const [newKeySecret, setNewKeySecret] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch projects first
      const projectsRes = await fetch("/api/console/projects", {
        credentials: "include",
      });
      const projectsData = await projectsRes.json();

      if (projectsData.success && projectsData.projects.length > 0) {
        setProjects(projectsData.projects);
        setSelectedProject(projectsData.projects[0].id);

        // Fetch keys for first project
        await fetchKeys(projectsData.projects[0].id);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKeys = async (projectId: string) => {
    try {
      const response = await fetch(`/api/console/projects/${projectId}/keys`, {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        setKeys(data.keys);
      }
    } catch (err) {
      console.error("Fetch keys error:", err);
    }
  };

  const handleProjectChange = async (projectId: string) => {
    setSelectedProject(projectId);
    setLoading(true);
    await fetchKeys(projectId);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) {
      setError("Please select a project");
      return;
    }

    setError("");
    setCreating(true);

    try {
      const response = await fetch(
        `/api/console/projects/${selectedProject}/keys`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(newKey),
        },
      );

      const data = await response.json();

      if (data.success) {
        setNewKeySecret(data.secret);
        await fetchKeys(selectedProject);
        setNewKey({ name: "", environment: "test" });
      } else {
        setError(data.message || "Failed to create key");
      }
    } catch (err) {
      setError("Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(newKeySecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (
      !confirm(
        "Are you sure you want to revoke this key? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/console/projects/${selectedProject}/keys/${keyId}/revoke`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (response.ok) {
        await fetchKeys(selectedProject);
      }
    } catch (err) {
      console.error("Revoke error:", err);
    }
  };

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  return (
    <>
      <header className="console-header">
        <h1 className="console-header-title">API Keys</h1>
        {projects.length > 0 && (
          <button
            onClick={() => setShowCreate(true)}
            className="console-btn console-btn-primary"
            style={{ width: "auto" }}
          >
            Create Key
          </button>
        )}
      </header>

      <div className="console-content">
        {/* Project Selector */}
        {projects.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                color: "var(--console-text-muted)",
                fontSize: 14,
              }}
            >
              Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => handleProjectChange(e.target.value)}
              style={{
                padding: "10px 16px",
                background: "var(--console-surface)",
                border: "1px solid var(--console-border)",
                borderRadius: 8,
                color: "var(--console-text)",
                fontSize: 14,
                minWidth: 200,
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* New Key Secret Display */}
        {newKeySecret && (
          <div
            className="console-stat-card"
            style={{
              marginBottom: 24,
              background: "rgba(34, 193, 90, 0.1)",
              borderColor: "var(--console-primary)",
            }}
          >
            <h3 style={{ color: "var(--console-primary)", marginBottom: 12 }}>
              🔐 Save Your API Key
            </h3>
            <p
              style={{
                color: "var(--console-text-muted)",
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              This is the only time you'll see this key. Copy it now and store
              it securely.
            </p>
            <div className="console-api-key">
              <code style={{ flex: 1, wordBreak: "break-all" }}>
                {newKeySecret}
              </code>
              <button
                onClick={handleCopy}
                className="console-copy-btn"
                title="Copy to clipboard"
              >
                {copied ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>
            <button
              onClick={() => setNewKeySecret("")}
              style={{
                marginTop: 16,
                background: "none",
                border: "none",
                color: "var(--console-text-muted)",
                cursor: "pointer",
              }}
            >
              I've saved my key
            </button>
          </div>
        )}

        {/* Create Key Form */}
        {showCreate && !newKeySecret && (
          <div className="console-stat-card" style={{ marginBottom: 24 }}>
            <form onSubmit={handleCreate}>
              <h3 style={{ color: "var(--console-text)", marginBottom: 16 }}>
                Create API Key
              </h3>

              {error && <div className="console-error">{error}</div>}

              <div className="console-form-group">
                <label>Key Name</label>
                <input
                  type="text"
                  value={newKey.name}
                  onChange={(e) =>
                    setNewKey({ ...newKey, name: e.target.value })
                  }
                  placeholder="Production Backend"
                  required
                />
              </div>

              <div className="console-form-group">
                <label>Environment</label>
                <select
                  value={newKey.environment}
                  onChange={(e) =>
                    setNewKey({ ...newKey, environment: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "var(--console-bg)",
                    border: "1px solid var(--console-border)",
                    borderRadius: 8,
                    color: "var(--console-text)",
                    fontSize: 14,
                  }}
                >
                  <option value="test">
                    Test (Sandbox - no real messages)
                  </option>
                  <option value="live">Live (Real WhatsApp messages)</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="submit"
                  className="console-btn console-btn-primary"
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create Key"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="console-btn"
                  style={{
                    background: "transparent",
                    color: "var(--console-text-muted)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Keys Table */}
        {loading ? (
          <div style={{ color: "var(--console-text-muted)" }}>
            Loading keys...
          </div>
        ) : projects.length === 0 ? (
          <div className="console-empty-state">
            <h3 className="console-empty-title">No projects yet</h3>
            <p className="console-empty-desc">
              Create a project first to generate API keys.
            </p>
          </div>
        ) : activeKeys.length === 0 ? (
          <div className="console-empty-state">
            <div className="console-empty-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            </div>
            <h3 className="console-empty-title">No API keys</h3>
            <p className="console-empty-desc">
              Create an API key to start calling the OTP API.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="console-btn console-btn-primary"
              style={{ width: "auto", display: "inline-flex" }}
            >
              Create API Key
            </button>
          </div>
        ) : (
          <table className="console-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key Prefix</th>
                <th>Environment</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeKeys.map((key) => (
                <tr key={key.id}>
                  <td style={{ fontWeight: 500 }}>{key.name}</td>
                  <td>
                    <code
                      style={{
                        fontSize: 13,
                        color: "var(--console-text-muted)",
                      }}
                    >
                      {key.key_prefix}...
                    </code>
                  </td>
                  <td>
                    <span
                      className={`console-badge ${key.environment === "live" ? "success" : "neutral"}`}
                    >
                      {key.environment}
                    </span>
                  </td>
                  <td style={{ color: "var(--console-text-muted)" }}>
                    {key.last_used_at
                      ? new Date(key.last_used_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td>
                    <button
                      onClick={() => handleRevoke(key.id)}
                      style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        color: "#f87171",
                        padding: "6px 12px",
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Revoked Keys */}
        {revokedKeys.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <h3
              style={{
                color: "var(--console-text-muted)",
                marginBottom: 16,
                fontSize: 14,
                textTransform: "uppercase",
              }}
            >
              Revoked Keys
            </h3>
            <table className="console-table" style={{ opacity: 0.6 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key Prefix</th>
                  <th>Revoked At</th>
                </tr>
              </thead>
              <tbody>
                {revokedKeys.map((key) => (
                  <tr key={key.id}>
                    <td style={{ textDecoration: "line-through" }}>
                      {key.name}
                    </td>
                    <td>
                      <code>{key.key_prefix}...</code>
                    </td>
                    <td>
                      {key.revoked_at
                        ? new Date(key.revoked_at).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
