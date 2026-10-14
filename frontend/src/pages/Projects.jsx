import React, { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

export function Projects() {
  const navigate = useNavigate();
  const { toast, onRefreshStats } = useOutletContext();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/projects");
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
  }, []);

  const handleDelete = async (projectName) => {
    if (!window.confirm(`Are you sure you want to delete project '${projectName}'?`)) return;
    try {
      const res = await fetch(`/api/projects/${projectName}`, { method: "DELETE" });
      if (res.ok) {
        toast.show("Project deleted.");
        fetchProjects();
        if (onRefreshStats) onRefreshStats();
      } else {
        alert("Could not delete project.");
      }
    } catch (err) {
      alert("Delete error: " + err.message);
    }
  };

  const handleLaunch = (projectPath) => {
    navigate(`/runner?path=${encodeURIComponent(projectPath)}`);
    toast.show("Project loaded into runner.");
  };

  return (
    <div className="page-view active">
      <div className="section-topbar">
        <div>
          <h2 className="section-title">Saved Projects & Workspace</h2>
          <p className="section-subtitle">Previously analyzed and provisioned repositories</p>
        </div>
        <button className="btn btn-secondary-sm" onClick={fetchProjects}>
          Refresh List
        </button>
      </div>

      <div className="projects-grid">
        {projects.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: "1/-1" }}>
            <p className="empty-text">No downloaded projects found.</p>
          </div>
        ) : (
          projects.map((p) => (
            <div key={p.id} className="project-card">
              <div
                className="project-card-header"
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}
              >
                <span className="project-title">{p.name}</span>
                <span className="project-badge">{p.framework.toUpperCase()}</span>
              </div>
              <div className="project-path">{p.path}</div>
              <div className="project-card-actions">
                <button
                  className="btn btn-secondary-sm"
                  onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}
                >
                  Details
                </button>
                <button
                  className="btn btn-primary btn-sm flex-grow"
                  onClick={() => handleLaunch(p.path)}
                >
                  🚀 Load & Run
                </button>
                <button
                  className="btn btn-secondary-sm"
                  onClick={() => handleDelete(p.name)}
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
