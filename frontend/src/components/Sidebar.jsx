import React from "react";
import { NavLink } from "react-router-dom";

export function Sidebar({
  projectCount,
  activePortsCount = 0,
  runningReposCount = 0,
  isLive,
  userProfile,
  onOpenProfile,
  onLogout
}) {
  const initial = (userProfile.name || "E").charAt(0).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </div>
        <div className="brand-info">
          <span className="brand-title">Repo Runner</span>
          <span className="brand-badge">Execution Unit</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">// Operations</div>

        <NavLink
          to="/"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span className="nav-label">Command Center</span>
        </NavLink>

        <NavLink
          to="/runner"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span className="nav-label">Repo Runner</span>
          {isLive && <span className="nav-pill">Live</span>}
        </NavLink>

        <div className="nav-section-label" style={{ marginTop: "10px" }}>// Inventory & Telemetry</div>

        <NavLink
          to="/projects"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          title="My Repos"
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span className="nav-label">My Repos</span>
          <span className="nav-badge">{projectCount}</span>
        </NavLink>

        <NavLink
          to="/ports"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          title="Active Repos & Ports"
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
          <span className="nav-label">Ports & Processes</span>
          <span
            className="nav-badge"
            style={
              runningReposCount > 0
                ? { backgroundColor: "rgba(0, 229, 153, 0.16)", color: "#00e599", borderColor: "rgba(0, 229, 153, 0.4)" }
                : undefined
            }
          >
            {activePortsCount}
          </span>
        </NavLink>

        <div className="nav-section-label" style={{ marginTop: "10px" }}>// Configuration</div>

        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span className="nav-label">Settings</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-card" onClick={onOpenProfile}>
          <div className="avatar-circle">
            <span>{initial}</span>
          </div>
          <div className="user-meta">
            <span className="user-name">{userProfile.name}</span>
            <span className="user-role">{userProfile.role}</span>
          </div>
          <button
            className="btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onLogout();
            }}
            title="Sign Out / Reset Profile"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
