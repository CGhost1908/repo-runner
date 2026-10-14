import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast, onRefreshStats } = useOutletContext();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const list = await res.json();
          const found = list.find((p) => p.id === id);
          setProject(found || null);
        }
      } catch (err) {
        console.error("Fetch project detail error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id]);

  const handleLaunch = () => {
    if (!project) return;
    navigate(`/runner?path=${encodeURIComponent(project.path)}`);
    toast.show("Project loaded into runner.");
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!window.confirm(`Are you sure you want to delete project '${project.name}'?`)) return;
    try {
      const res = await fetch(`/api/projects/${project.name}`, { method: "DELETE" });
      if (res.ok) {
        toast.show("Project deleted.");
        if (onRefreshStats) onRefreshStats();
        navigate("/projects");
      } else {
        alert("Could not delete project.");
      }
    } catch (err) {
      alert("Delete error: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="page-view active" style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading project details...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="page-view active">
        <div className="card-box" style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
          <h2>Project Not Found</h2>
          <p style={{ color: "var(--text-muted)", margin: "12px 0 24px" }}>
            The project "{id}" could not be located in your local workspace.
          </p>
          <button className="btn btn-primary" onClick={() => navigate("/projects")}>
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const createdDate = project.created_at
    ? new Date(project.created_at * 1000).toLocaleString()
    : "Unknown";

  return (
    <div className="page-view active">
      <div className="section-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            className="btn btn-secondary-sm"
            onClick={() => navigate("/projects")}
            title="Back to Projects"
          >
            ← Back
          </button>
          <div>
            <h2 className="section-title">{project.name}</h2>
            <p className="section-subtitle">Workspace Project Profile</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button className="btn btn-primary" onClick={handleLaunch}>
            <span>🚀</span> Open in Runner
          </button>
          <button className="btn btn-secondary-sm" onClick={handleDelete}>
            🗑 Delete
          </button>
        </div>
      </div>

      <div className="settings-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="settings-group-card">
          <h3 className="settings-group-title">
            <span>📦</span> Repository Metadata
          </h3>
          <p className="settings-group-desc">File system location and environment analysis</p>

          <div className="env-info-list" style={{ marginTop: "16px" }}>
            <div className="env-info-item">
              <span className="env-info-key">Project ID:</span>
              <span className="env-info-val" style={{ fontFamily: "monospace" }}>{project.id}</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Detected Stack:</span>
              <span className="env-info-val">
                <span className="pill-badge pill-success">{project.framework.toUpperCase()}</span>
              </span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Standard Mode:</span>
              <span className="env-info-val">{project.is_standard ? "Yes (Rule-based)" : "No (AI Heuristic)"}</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Dockerfile:</span>
              <span className="env-info-val">{project.has_dockerfile ? "Detected (Docker ready)" : "None"}</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Last Synced:</span>
              <span className="env-info-val">{createdDate}</span>
            </div>
          </div>
        </div>

        <div className="settings-group-card">
          <h3 className="settings-group-title">
            <span>⚙️</span> Recommended Pipeline
          </h3>
          <p className="settings-group-desc">Optimal runner parameters for this technology</p>

          <div className="form-row">
            <label className="form-label">Absolute Disk Path</label>
            <input type="text" className="text-input" value={project.path} readOnly />
          </div>

          <div className="form-row">
            <label className="form-label">Suggested Port</label>
            <input type="text" className="text-input" value="8000" readOnly />
          </div>

          <div className="form-row">
            <label className="form-label">Environment Strategy</label>
            <input
              type="text"
              className="text-input"
              value={project.has_dockerfile ? "Docker Container or Isolated Virtualenv" : "Isolated Virtualenv (.venv)"}
              readOnly
            />
          </div>
        </div>
      </div>
    </div>
  );
}
