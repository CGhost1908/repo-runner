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
    toast.show("Project loaded into Runner.");
  };

  const handleDirectRun = async () => {
    if (!project) return;
    const targetPort = project.saved_recipe?.port || 8000;
    toast.show(`Starting '${project.name}' with saved instructions...`);

    try {
      const payload = {
        local_path: project.path,
        port: targetPort,
        custom_run_command: project.saved_recipe?.run_command,
        custom_install_command: project.saved_recipe?.install_command
      };

      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        navigate(`/runner?path=${encodeURIComponent(project.path)}&run_id=${data.run_id}&port=${targetPort}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || "Failed to start execution.");
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!window.confirm(`Are you sure you want to delete project '${project.name}'?`)) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      if (res.ok) {
        toast.show("Project deleted.");
        if (onRefreshStats) onRefreshStats();
        navigate("/projects");
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.show(errData.detail || "Could not delete project.", "error");
      }
    } catch (err) {
      toast.show("Delete error: " + err.message, "error");
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
            Back to My Repos
          </button>
        </div>
      </div>
    );
  }

  const createdDate = project.created_at
    ? new Date(project.created_at * 1000).toLocaleString("en-US")
    : "Unknown";

  const lastRunDate = project.last_run_at && project.last_run_at > 0
    ? new Date(project.last_run_at * 1000).toLocaleString("en-US")
    : "Never run";

  const hasRecipe = project.saved_recipe && project.saved_recipe.run_command;

  return (
    <div className="page-view active">
      <div className="section-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            className="btn btn-secondary-sm"
            onClick={() => navigate("/projects")}
            title="Back to My Repos"
          >
            ← My Repos
          </button>
          <div>
            <h2 className="section-title">{project.name}</h2>
            <p className="section-subtitle">
              Owner: <strong>{project.owner || "Local"}</strong>
              {project.repo_url && (
                <>
                  {" · "}
                  <a href={project.repo_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-primary)" }}>
                    GitHub Repository
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {hasRecipe && (
            <button
              className="btn btn-primary"
              style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", borderColor: "#10b981" }}
              onClick={handleDirectRun}
            >
              Quick Run (Saved Recipe)
            </button>
          )}
          <button className="btn btn-primary" onClick={handleLaunch}>
            Open in Runner
          </button>
          <button className="btn btn-secondary-sm" style={{ color: "#ef4444" }} onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="settings-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="settings-group-card">
          <h3 className="settings-group-title">
            Repository Metadata & History
          </h3>
          <p className="settings-group-desc">File system location, execution status, and environment details</p>

          <div className="env-info-list" style={{ marginTop: "16px" }}>
            <div className="env-info-item">
              <span className="env-info-key">Project Name:</span>
              <span className="env-info-val" style={{ fontWeight: 700 }}>{project.name}</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Repository Owner:</span>
              <span className="env-info-val">{project.owner || "Local"}</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Last Execution Status:</span>
              <span className="env-info-val">
                {project.last_run_status === "SUCCESS" && <span className="status-tag status-tag-success">Success</span>}
                {project.last_run_status === "FAILED" && <span className="status-tag status-tag-failed">Failed</span>}
                {project.last_run_status === "RUNNING" && <span className="status-tag status-tag-running">Running</span>}
                {project.last_run_status === "STOPPED" && <span className="status-tag status-tag-stopped">Stopped</span>}
                {(!project.last_run_status || project.last_run_status === "NEVER_RUN") && (
                  <span className="status-tag status-tag-never">Never Run</span>
                )}
              </span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Last Run Time:</span>
              <span className="env-info-val">{lastRunDate}</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Detected Stack:</span>
              <span className="env-info-val">
                <span className="pill-badge pill-success">{project.framework?.toUpperCase()}</span>
              </span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Dockerfile:</span>
              <span className="env-info-val">{project.has_dockerfile ? "Detected (Docker ready)" : "None"}</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Created At:</span>
              <span className="env-info-val">{createdDate}</span>
            </div>
          </div>
        </div>

        <div className="settings-group-card">
          <h3 className="settings-group-title">
            Saved Execution Instructions
          </h3>
          <p className="settings-group-desc">Verified runner parameters automatically persisted from previous runs</p>

          <div className="form-row" style={{ marginTop: "16px" }}>
            <label className="form-label">Absolute Disk Path</label>
            <input type="text" className="text-input" value={project.path} readOnly />
          </div>

          <div className="form-row">
            <label className="form-label">Saved Run Command</label>
            <input
              type="text"
              className="text-input"
              value={project.saved_recipe?.run_command || "No saved instructions yet"}
              readOnly
              style={{ fontFamily: "monospace", color: project.saved_recipe?.run_command ? "#a5b4fc" : "var(--text-dim)" }}
            />
          </div>

          <div className="form-row">
            <label className="form-label">Saved Install Command</label>
            <input
              type="text"
              className="text-input"
              value={project.saved_recipe?.install_command || "pip install -r requirements.txt"}
              readOnly
              style={{ fontFamily: "monospace" }}
            />
          </div>

          <div className="form-row">
            <label className="form-label">Target Port</label>
            <input
              type="text"
              className="text-input"
              value={String(project.saved_recipe?.port || 8000)}
              readOnly
            />
          </div>
        </div>
      </div>
    </div>
  );
}
