import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function Topbar({ isOnline, portsData, onOpenPortsModal }) {
  const navigate = useNavigate();
  const location = useLocation();

  const getPageTitle = (pathname) => {
    if (pathname === "/") return "COMMAND CENTER";
    if (pathname === "/runner") return "EXECUTION PIPELINE";
    if (pathname === "/projects") return "MY REPOS";
    if (pathname.startsWith("/projects/")) return "REPOSITORY SPEC";
    if (pathname === "/ports") return "PORTS & PROCESSES";
    if (pathname === "/settings") return "SYSTEM CONFIG";
    return "NOT FOUND";
  };

  const currentTitle = getPageTitle(location.pathname);
  const runningRepos = portsData?.running_repos || [];
  const activePortsCount = portsData?.active_ports_count || 0;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="breadcrumb-root">REPO_RUNNER</span>
        <span className="breadcrumb-separator">//</span>
        <span className="breadcrumb-current">{currentTitle}</span>
      </div>
      <div className="topbar-right">
        {/* Live Running Repo Telemetry Pills visible from every page */}
        {runningRepos.slice(0, 2).map((repo) => (
          <button
            key={repo.port}
            type="button"
            onClick={onOpenPortsModal}
            title={`Running: ${repo.repo_name} on port ${repo.port} (Click to manage)`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              background: "rgba(0, 229, 153, 0.1)",
              border: "1px solid rgba(0, 229, 153, 0.38)",
              color: "#00e599",
              padding: "5px 11px",
              borderRadius: "4px",
              fontFamily: "var(--font-mono)",
              fontSize: "0.73rem",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "#00e599",
                boxShadow: "0 0 6px #00e599",
                display: "inline-block"
              }}
            />
            <span>{repo.repo_name}</span>
            <span style={{ color: "#fff" }}>:{repo.port}</span>
          </button>
        ))}

        {/* Global Active Repos & Ports Telemetry Control Button */}
        <button
          type="button"
          className="btn-secondary-sm"
          onClick={onOpenPortsModal}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            borderColor: runningRepos.length > 0 ? "rgba(0, 229, 153, 0.45)" : undefined
          }}
          title="View and manage all running repositories and active ports"
        >
          <span style={{ color: runningRepos.length > 0 ? "#00e599" : undefined }}>
            REPOS: {runningRepos.length}
          </span>
          <span style={{ opacity: 0.35 }}>//</span>
          <span style={{ color: "#38bdf8" }}>PORTS: {activePortsCount}</span>
        </button>

        <div className="status-indicator">
          <span className="pulse-dot"></span>
          <span className="status-text">{isOnline ? "NODE ONLINE" : "NODE OFFLINE"}</span>
        </div>
      </div>
    </header>
  );
}
