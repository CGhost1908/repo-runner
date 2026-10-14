import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function Topbar({ isOnline }) {
  const navigate = useNavigate();
  const location = useLocation();

  const getPageTitle = (pathname) => {
    if (pathname === "/") return "Home";
    if (pathname === "/runner") return "Repo Runner";
    if (pathname === "/projects") return "My Projects";
    if (pathname.startsWith("/projects/")) return "Project Details";
    if (pathname === "/settings") return "Settings";
    return "Not Found";
  };

  const currentTitle = getPageTitle(location.pathname);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="breadcrumb-root">Repo Runner</span>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">{currentTitle}</span>
      </div>
      <div className="topbar-right">
        <div className="status-indicator">
          <span className="pulse-dot"></span>
          <span className="status-text">{isOnline ? "Server Online" : "Server Offline"}</span>
        </div>
        <button
          className="btn btn-secondary-sm"
          onClick={() => navigate("/runner")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Quick Run
        </button>
      </div>
    </header>
  );
}
