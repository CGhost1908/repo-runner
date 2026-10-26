import React, { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

export function Projects() {
  const navigate = useNavigate();
  const { toast, onRefreshStats } = useOutletContext();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ sort_by: sortBy });
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      const res = await fetch(`/api/projects?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error("Fetch projects error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [sortBy, statusFilter]);

  const handleDelete = async (project) => {
    const displayName = project.name || project.id;
    if (!window.confirm(`Are you sure you want to delete '${displayName}' and its workspace?`)) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      if (res.ok) {
        toast.show(`Project '${displayName}' deleted.`);
        fetchProjects();
        if (onRefreshStats) onRefreshStats();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || "Could not delete project.");
      }
    } catch (err) {
      alert("Delete error: " + err.message);
    }
  };

  const handleLaunch = (projectPath) => {
    navigate(`/runner?path=${encodeURIComponent(projectPath)}`);
    toast.show("Project loaded into Runner.");
  };

  const handleDirectRun = async (project) => {
    const targetPort = project.saved_recipe?.port || 8000;
    try {
      const checkRes = await fetch(`/api/ports/check/${targetPort}`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.in_use) {
          toast.show(`Port ${targetPort} is currently occupied. Please free it or switch ports first.`);
          navigate(`/runner?path=${encodeURIComponent(project.path)}&port=${targetPort}`);
          return;
        }
      }
    } catch (_) {}

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

  const filteredProjects = projects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = (p.name || "").toLowerCase().includes(q);
    const ownerMatch = (p.owner || "").toLowerCase().includes(q);
    const pathMatch = (p.path || "").toLowerCase().includes(q);
    return nameMatch || ownerMatch || pathMatch;
  });

  const renderStatusBadge = (status) => {
    switch (status) {
      case "SUCCESS":
        return <span className="status-tag status-tag-success">Success</span>;
      case "FAILED":
        return <span className="status-tag status-tag-failed">Failed</span>;
      case "RUNNING":
        return <span className="status-tag status-tag-running">Running</span>;
      case "STOPPED":
        return <span className="status-tag status-tag-stopped">Stopped</span>;
      default:
        return <span className="status-tag status-tag-never">Never Run</span>;
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts || ts <= 0) return "Never run";
    try {
      const d = new Date(ts * 1000);
      return d.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "Unknown";
    }
  };

  return (
    <div className="page-view active">
      <div className="section-topbar">
        <div>
          <h2 className="section-title">MY REPOS</h2>
          <p className="section-subtitle">Executed and configured repositories</p>
        </div>
        <button className="btn btn-secondary-sm" onClick={fetchProjects}>
          Refresh List
        </button>
      </div>

      {/* Toolbar: Search, Filters, Sorting */}
      <div className="repos-toolbar">
        <div className="repos-search-box">
          <input
            type="text"
            className="repos-search-input"
            placeholder="Search repository name or owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="repos-filter-group">
          <button
            className={`filter-btn ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All ({projects.length})
          </button>
          <button
            className={`filter-btn ${statusFilter === "SUCCESS" ? "active" : ""}`}
            onClick={() => setStatusFilter("SUCCESS")}
          >
            Success
          </button>
          <button
            className={`filter-btn ${statusFilter === "FAILED" ? "active" : ""}`}
            onClick={() => setStatusFilter("FAILED")}
          >
            Failed
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Sort by:</span>
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="recent">Recently Run</option>
            <option value="name_asc">Name (A - Z)</option>
            <option value="name_desc">Name (Z - A)</option>
            <option value="status">Status (Success First)</option>
            <option value="created">Created Date</option>
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="projects-grid">
        {filteredProjects.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: "1/-1", padding: "48px 24px" }}>
            <p className="empty-text">
              {searchQuery ? "No repositories match your search criteria." : "No executed repositories found. Start from the Runner tab."}
            </p>
          </div>
        ) : (
          filteredProjects.map((p) => {
            const hasRecipe = p.saved_recipe && p.saved_recipe.run_command;
            return (
              <div key={p.id} className="project-card">
                {/* Header: Project Name & Framework */}
                <div
                  className="project-card-header"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}
                >
                  <div>
                    <span className="project-title" style={{ fontSize: "1.05rem" }}>
                      {p.name}
                    </span>
                    {/* Repo Owner Subtitle */}
                    <div className="project-owner" style={{ marginTop: "4px" }}>
                      <span style={{ color: "var(--text-dim)", marginRight: "4px" }}>Owner:</span>
                      {p.repo_url ? (
                        <a
                          href={p.repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.owner}
                        </a>
                      ) : (
                        <span>{p.owner}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                    <span className="project-badge">{(p.framework || "GENERIC").toUpperCase()}</span>
                    {renderStatusBadge(p.last_run_status)}
                  </div>
                </div>

                {/* Execution Info */}
                <div className="project-time-info">
                  <span>Last Run: <strong>{formatTimestamp(p.last_run_at)}</strong></span>
                </div>

                {/* Saved Recipe Box */}
                {hasRecipe ? (
                  <div className="project-recipe-box" title={`Saved Command: ${p.saved_recipe.run_command}`}>
                    <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>SAVED:</span>
                    <span>{p.saved_recipe.run_command}</span>
                  </div>
                ) : (
                  <div className="project-path" title={p.path}>
                    {p.path}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="project-card-actions">
                  {hasRecipe ? (
                    <button
                      className="btn btn-primary btn-sm flex-grow"
                      onClick={() => handleDirectRun(p)}
                      title="Launch directly using saved instructions"
                    >
                      Quick Run (:{p.saved_recipe.port || 8000})
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm flex-grow"
                      onClick={() => handleLaunch(p.path)}
                      title="Configure and run in Runner"
                    >
                      Configure & Run
                    </button>
                  )}
                  <button
                    className="btn btn-secondary-sm"
                    onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}
                  >
                    Details
                  </button>
                  <button
                    className="btn btn-secondary-sm"
                    style={{ color: "#f43f5e" }}
                    onClick={() => handleDelete(p)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
