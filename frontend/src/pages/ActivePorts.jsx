import React, { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

export function ActivePorts() {
  const navigate = useNavigate();
  const { toast, portsData, onRefreshPorts, onFreePort, freeingPortNum } = useOutletContext();

  const [filterCategory, setFilterCategory] = useState("all"); // all, repo, external, system
  const [searchQuery, setSearchQuery] = useState("");
  const [customPort, setCustomPort] = useState("");
  const [customCheck, setCustomCheck] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (onRefreshPorts) onRefreshPorts();
  }, []);

  const runningRepos = portsData?.running_repos || [];
  const allPorts = portsData?.ports || [];
  const suggestedFreePort = portsData?.suggested_free_port || 8000;

  const handleInspectPort = async (e) => {
    e.preventDefault();
    const num = parseInt(customPort, 10);
    if (!num || num < 1 || num > 65535) {
      if (toast) toast.show("Please enter a valid port number between 1 and 65535.");
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`/api/ports/check/${num}`);
      if (res.ok) {
        setCustomCheck(await res.json());
      }
    } catch (_) {
    } finally {
      setChecking(false);
    }
  };

  const filteredPorts = allPorts.filter((item) => {
    if (filterCategory !== "all" && item.category !== filterCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPort = String(item.port).includes(q);
      const matchProc = (item.process_name || "").toLowerCase().includes(q);
      const matchRepo = (item.repo_name || "").toLowerCase().includes(q);
      const matchOwner = (item.repo_owner || "").toLowerCase().includes(q);
      const matchPid = String(item.pid || "").includes(q);
      return matchPort || matchProc || matchRepo || matchOwner || matchPid;
    }
    return true;
  });

  return (
    <div className="page-view active">
      <div className="projects-header">
        <div>
          <h2 className="section-title">ACTIVE REPOS & PORTS</h2>
          <p className="section-subtitle">
            Real-time monitoring and conflict resolution for running repositories and local TCP ports (3000 - 9999).
          </p>
        </div>

        <div className="projects-controls">
          <button className="btn btn-secondary" onClick={onRefreshPorts}>
            Refresh Status
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/runner?port=${suggestedFreePort}`)}
          >
            Launch on Next Free Port ({suggestedFreePort})
          </button>
        </div>
      </div>

      {/* Summary Metrics Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "14px",
          marginBottom: "22px"
        }}
      >
        <div className="runner-config-card" style={{ padding: "16px 20px", marginBottom: 0 }}>
          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
            Running Repositories
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>
            {runningRepos.length}
          </div>
        </div>

        <div className="runner-config-card" style={{ padding: "16px 20px", marginBottom: 0 }}>
          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
            Total Active Ports
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>
            {allPorts.length}
          </div>
        </div>

        <div className="runner-config-card" style={{ padding: "16px 20px", marginBottom: 0 }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
            Next Free User Port
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#00e599", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
            :{suggestedFreePort}
          </div>
        </div>
      </div>

      {/* Custom Port Pre-Flight Checker */}
      <div className="runner-config-card" style={{ padding: "16px 20px", marginBottom: "22px" }}>
        <form
          onSubmit={handleInspectPort}
          style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}
        >
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff" }}>
            Pre-Flight Port Checker:
          </span>
          <input
            type="number"
            className="text-input"
            placeholder="Enter port number (e.g. 8000)"
            style={{ width: "220px" }}
            value={customPort}
            onChange={(e) => setCustomPort(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary" disabled={checking}>
            {checking ? "Checking..." : "Check Port Availability"}
          </button>

          {customCheck && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: customCheck.in_use ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)",
                border: customCheck.in_use ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(16, 185, 129, 0.35)",
                borderRadius: "8px",
                padding: "8px 14px"
              }}
            >
              {customCheck.in_use ? (
                <>
                  <span style={{ fontSize: "0.84rem", color: "#fbbf24", fontWeight: 700 }}>
                    Port {customCheck.port} is IN USE by{" "}
                    {customCheck.processes?.map((p) => `${p.process_name} (PID ${p.pid})`).join(", ")}
                  </span>
                  {!customCheck.is_protected && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={freeingPortNum === customCheck.port}
                      onClick={async () => {
                        await onFreePort(customCheck.port);
                        const res = await fetch(`/api/ports/check/${customCheck.port}`);
                        if (res.ok) setCustomCheck(await res.json());
                      }}
                    >
                      Free Port {customCheck.port}
                    </button>
                  )}
                </>
              ) : (
                <span style={{ fontSize: "0.84rem", color: "#10b981", fontWeight: 700 }}>
                  Port {customCheck.port} is AVAILABLE for new applications
                </span>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Section 1: Running Repositories */}
      <div style={{ marginBottom: "28px" }}>
        <h3 style={{ fontSize: "1.02rem", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>
          Running Repositories ({runningRepos.length})
        </h3>

        {runningRepos.length === 0 ? (
          <div className="runner-config-card" style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>
            No managed repositories are currently running on any port.
          </div>
        ) : (
          <div className="projects-grid">
            {runningRepos.map((repo) => (
              <div
                key={repo.port}
                className="project-card"
                style={{ border: "1px solid rgba(16, 185, 129, 0.4)" }}
              >
                <div className="project-card-top">
                  <div
                    className="project-type-badge"
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#34d399",
                      border: "1px solid rgba(16, 185, 129, 0.35)"
                    }}
                  >
                    :{repo.port} · {(repo.framework || "APP").toUpperCase()}
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "3px 9px",
                      borderRadius: "999px",
                      color: "#10b981",
                      background: "rgba(16, 185, 129, 0.14)",
                      border: "1px solid rgba(16, 185, 129, 0.35)"
                    }}
                  >
                    LIVE
                  </span>
                </div>

                <div className="project-card-body">
                  <h3 className="project-card-title">{repo.repo_name}</h3>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "8px" }}>
                    Owner: <strong style={{ color: "var(--accent-primary)" }}>{repo.repo_owner || "Local"}</strong>
                    {" · "}Process: <strong style={{ color: "#e2e8f0" }}>{repo.process_name} (PID {repo.pid})</strong>
                  </div>
                  <p className="project-card-path" title={repo.command_line || repo.workspace_path}>
                    {repo.command_line || repo.workspace_path}
                  </p>
                </div>

                <div className="project-card-footer" style={{ gap: "8px", flexWrap: "wrap" }}>
                  <a
                    href={`http://localhost:${repo.port}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary btn-sm"
                    style={{ textDecoration: "none" }}
                  >
                    Open App (:{repo.port})
                  </a>
                  {repo.workspace_path && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        navigate(
                          `/runner?path=${encodeURIComponent(repo.workspace_path)}&port=${repo.port}${
                            repo.run_id ? `&run_id=${repo.run_id}` : ""
                          }`
                        )
                      }
                    >
                      Runner Console
                    </button>
                  )}
                  {repo.workspace_id && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => navigate(`/projects/${encodeURIComponent(repo.workspace_id)}`)}
                    >
                      Details
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={freeingPortNum === repo.port}
                    onClick={() => onFreePort(repo.port)}
                  >
                    {freeingPortNum === repo.port ? "Stopping..." : "Stop & Free Port"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: All Active Ports Table / Grid */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "14px"
          }}
        >
          <h3 style={{ fontSize: "1.02rem", fontWeight: 700, color: "#fff", margin: 0 }}>
            All Active Listening Ports ({filteredPorts.length})
          </h3>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="filter-pills">
              <button
                className={`filter-pill ${filterCategory === "all" ? "active" : ""}`}
                onClick={() => setFilterCategory("all")}
              >
                All ({allPorts.length})
              </button>
              <button
                className={`filter-pill ${filterCategory === "repo" ? "active" : ""}`}
                onClick={() => setFilterCategory("repo")}
              >
                Running Repos
              </button>
              <button
                className={`filter-pill ${filterCategory === "external" ? "active" : ""}`}
                onClick={() => setFilterCategory("external")}
              >
                External Processes
              </button>
              <button
                className={`filter-pill ${filterCategory === "system" ? "active" : ""}`}
                onClick={() => setFilterCategory("system")}
              >
                System Protected
              </button>
            </div>

            <input
              type="text"
              className="text-input"
              placeholder="Filter by port, PID, repo, or process..."
              style={{ width: "250px", padding: "7px 12px", fontSize: "0.82rem" }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {filteredPorts.length === 0 ? (
          <div className="runner-config-card" style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>
            No matching active ports found.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredPorts.map((item) => (
              <div
                key={item.port}
                className="runner-config-card"
                style={{
                  padding: "14px 18px",
                  marginBottom: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "16px",
                  flexWrap: "wrap",
                  borderLeft: item.is_protected
                    ? "3px solid #f59e0b"
                    : item.is_managed
                    ? "3px solid #00e599"
                    : "3px solid #38bdf8"
                }}
              >
                <div style={{ minWidth: "260px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "1.05rem",
                        fontWeight: 800,
                        color: item.is_protected ? "#fbbf24" : item.is_managed ? "#00e599" : "#38bdf8"
                      }}
                    >
                      :{item.port}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "0.94rem", color: "#fff" }}>
                      {item.repo_name ? `${item.repo_name}` : item.label}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        background: "rgba(255,255,255,0.06)",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        color: "#cbd5e1",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      {item.process_name} · PID {item.pid}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Bind: {item.addresses?.join(", ")}
                    </span>
                  </div>

                  {item.command_line && (
                    <div
                      style={{
                        fontSize: "0.74rem",
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                        marginTop: "6px",
                        wordBreak: "break-all"
                      }}
                    >
                      Command: {item.command_line}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <a
                    href={`http://localhost:${item.port}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: "none" }}
                  >
                    Open (:{item.port})
                  </a>

                  {!item.is_protected ? (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={freeingPortNum === item.port}
                      onClick={() => onFreePort(item.port)}
                    >
                      {freeingPortNum === item.port ? "Releasing..." : "Kill Process & Free Port"}
                    </button>
                  ) : (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.72rem",
                        color: "#fbbf24",
                        fontWeight: 700,
                        padding: "4px 10px"
                      }}
                    >
                      System Protected
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
