"use client";

import React, { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  description: string;
  environment: "test" | "live";
  whatsapp_mode: "platform" | "customer";
  created_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    environment: "test",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch("/api/console/projects", {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error("Fetch projects error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);

    try {
      const response = await fetch("/api/console/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newProject),
      });

      const data = await response.json();

      if (data.success) {
        setProjects([data.project, ...projects]);
        setShowCreate(false);
        setNewProject({ name: "", description: "", environment: "test" });
      } else {
        setError(data.message || "Failed to create project");
      }
    } catch (err) {
      setError("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <header className="console-header">
        <h1 className="console-header-title">Projects</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="console-btn console-btn-primary"
          style={{ width: "auto" }}
        >
          New Project
        </button>
      </header>

      <div className="console-content">
        {showCreate && (
          <div className="console-stat-card" style={{ marginBottom: 24 }}>
            <form onSubmit={handleCreate}>
              <h3 style={{ color: "var(--console-text)", marginBottom: 16 }}>
                Create New Project
              </h3>

              {error && <div className="console-error">{error}</div>}

              <div className="console-form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) =>
                    setNewProject({ ...newProject, name: e.target.value })
                  }
                  placeholder="My OTP App"
                  required
                />
              </div>

              <div className="console-form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      description: e.target.value,
                    })
                  }
                  placeholder="Optional description"
                />
              </div>

              <div className="console-form-group">
                <label>Environment</label>
                <select
                  value={newProject.environment}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      environment: e.target.value,
                    })
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
                  <option value="test">Test (Sandbox)</option>
                  <option value="live">Live (Production)</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="submit"
                  className="console-btn console-btn-primary"
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create Project"}
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

        {loading ? (
          <div style={{ color: "var(--console-text-muted)" }}>
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="console-empty-state">
            <div className="console-empty-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </div>
            <h3 className="console-empty-title">No projects yet</h3>
            <p className="console-empty-desc">
              Create your first project to start sending OTPs.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="console-btn console-btn-primary"
              style={{ width: "auto", display: "inline-flex" }}
            >
              Create Project
            </button>
          </div>
        ) : (
          <table className="console-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Environment</th>
                <th>WhatsApp Mode</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <div>
                      <div style={{ fontWeight: 500 }}>{project.name}</div>
                      {project.description && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--console-text-muted)",
                            marginTop: 4,
                          }}
                        >
                          {project.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`console-badge ${project.environment === "live" ? "success" : "neutral"}`}
                    >
                      {project.environment}
                    </span>
                  </td>
                  <td>
                    <span className="console-badge info">
                      {project.whatsapp_mode}
                    </span>
                  </td>
                  <td style={{ color: "var(--console-text-muted)" }}>
                    {new Date(project.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
