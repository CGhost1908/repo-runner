import React, { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

export function Home() {
  const navigate = useNavigate();
  const { toast } = useOutletContext();
  const [stats, setStats] = useState({
    running_now: 0,
    total_runs: 0,
    saved_projects_count: 0,
    ai_engine: "Ollama",
    python_version: "3.14"
  });
  const [recentProjects, setRecentProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      const [statsRes, projectsRes] = await Promise.all([
        fetch("/api/system/stats"),
        fetch("/api/projects")
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setRecentProjects(projectsData.slice(0, 5));
      }
    } catch (err) {
      console.error("Home load error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLaunchProject = (projectPath) => {
    navigate(`/runner?path=${encodeURIComponent(projectPath)}`);
    toast.show("Project loaded into runner.");
  };

  return (
    <div className="page-view active">
      {/* Welcome Banner */}
      <div className="hero-banner">
        <div className="hero-content">
          <div className="hero-tag">Autonomous Agent & DevOps Pipeline</div>
          <h2 className="hero-title">Run any repository in an isolated environment with one click</h2>
          <p className="hero-subtitle">
            Analyzes codebase, detects frameworks, provisions isolated virtual environments, and launches directly on your target port.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => navigate("/runner")}>
              <span>🚀</span> Go to Repo Runner
            </button>
            <button className="btn btn-outline" onClick={() => navigate("/projects")}>
              <span>📂</span> View Saved Projects
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Active Processes</span>
            <span className="stat-icon-wrapper icon-emerald">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </span>
          </div>
          <div className="stat-value">{stats.running_now}</div>
          <div className="stat-footer">Live listening process</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Total Runs</span>
            <span className="stat-icon-wrapper icon-indigo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            </span>
          </div>
          <div className="stat-value">{stats.total_runs}</div>
          <div className="stat-footer">Across session</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Saved Projects</span>
            <span className="stat-icon-wrapper icon-amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </span>
          </div>
          <div className="stat-value">{stats.saved_projects_count}</div>
          <div className="stat-footer">Ready in workspace</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">AI Engine</span>
            <span className="stat-icon-wrapper icon-purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </span>
          </div>
          <div className="stat-value">{(stats.ai_engine || "Ollama").toUpperCase()}</div>
          <div className="stat-footer">Hybrid LLM ready</div>
        </div>
      </div>

      {/* Split Section: Recent Projects & System Status */}
      <div className="dashboard-split">
        {/* Recent Projects Column */}
        <div className="card-box">
          <div className="card-box-header">
            <h3 className="card-box-title">Recent Projects & Workspace</h3>
            <button className="btn-link" onClick={loadData}>Refresh</button>
          </div>
          <div className="recent-projects-list">
            {recentProjects.length === 0 ? (
              <div className="empty-state">
                <p className="empty-text">No downloaded projects yet. Start from the Runner tab.</p>
              </div>
            ) : (
              recentProjects.map((p) => (
                <div key={p.id} className="project-item-row">
                  <div className="item-main" style={{ cursor: "pointer" }} onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}>
                    <span className="item-name">{p.name}</span>
                    <span className="item-desc">{p.path}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="item-badge">{p.framework.toUpperCase()}</span>
                    <button
                      className="btn-secondary-sm"
                      onClick={() => handleLaunchProject(p.path)}
                    >
                      Run
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Architecture Info Column */}
        <div className="card-box">
          <div className="card-box-header">
            <h3 className="card-box-title">System & Environment Summary</h3>
            <span className="pill-badge pill-success">Ready</span>
          </div>
          <div className="env-info-list">
            <div className="env-info-item">
              <span className="env-info-key">Python Engine:</span>
              <span className="env-info-val">Python {stats.python_version || "3.14"}</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Isolation Model:</span>
              <span className="env-info-val">Local .venv (Directory-based)</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">HITL Safety Firewall:</span>
              <span className="env-info-val">Active (Prompts on critical actions)</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Port Pool Range:</span>
              <span className="env-info-val">8000, 8001, 8002, 3000</span>
            </div>
            <div className="env-info-item">
              <span className="env-info-key">Self-Healing Limit:</span>
              <span className="env-info-val">Maximum 3 Retries</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
