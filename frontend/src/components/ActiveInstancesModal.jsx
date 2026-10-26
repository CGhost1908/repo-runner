import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export function ActiveInstancesModal({
  isOpen,
  onClose,
  portsData,
  onRefresh,
  onFreePort,
  freeingPortNum
}) {
  const navigate = useNavigate();
  const [customPort, setCustomPort] = useState("");
  const [customPortResult, setCustomPortResult] = useState(null);
  const [checkingCustom, setCheckingCustom] = useState(false);

  if (!isOpen) return null;

  const runningRepos = portsData?.running_repos || [];
  const allPorts = portsData?.ports || [];
  const suggestedFreePort = portsData?.suggested_free_port || 8000;

  const handleCheckCustomPort = async (e) => {
    e.preventDefault();
    const num = parseInt(customPort, 10);
    if (!num || num < 1 || num > 65535) return;
    setCheckingCustom(true);
    try {
      const res = await fetch(`/api/ports/check/${num}`);
      if (res.ok) {
        setCustomPortResult(await res.json());
      }
    } catch (_) {
    } finally {
      setCheckingCustom(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: "820px", width: "94%", maxHeight: "86vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div>
            <h3 className="modal-title">Active Repositories & Port Monitor</h3>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
              Global runtime overview across all pages · Next Available Port:{" "}
              <strong style={{ color: "#10b981" }}>{suggestedFreePort}</strong>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={onRefresh}>
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                onClose();
                navigate("/ports");
              }}
            >
              Open Full Page
            </button>
            <button className="modal-close-btn" onClick={onClose} title="Close">
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="modal-body" style={{ overflowY: "auto", padding: "16px 0", flex: 1 }}>
          {/* Quick Port Inspector Bar */}
          <form
            onSubmit={handleCheckCustomPort}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "18px",
              flexWrap: "wrap"
            }}
          >
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#e2e8f0" }}>
              Inspect Specific Port:
            </span>
            <input
              type="number"
              className="text-input"
              placeholder="e.g. 8000"
              style={{ width: "120px", padding: "6px 10px", fontSize: "0.82rem" }}
              value={customPort}
              onChange={(e) => setCustomPort(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={checkingCustom}>
              {checkingCustom ? "Checking..." : "Check Port"}
            </button>

            {customPortResult && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
                {customPortResult.in_use ? (
                  <>
                    <span style={{ fontSize: "0.8rem", color: "#fbbf24", fontWeight: 600 }}>
                      Port {customPortResult.port} is Occupied (
                      {customPortResult.processes?.map((p) => `${p.process_name} PID ${p.pid}`).join(", ")})
                    </span>
                    {!customPortResult.is_protected && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={freeingPortNum === customPortResult.port}
                        onClick={async () => {
                          await onFreePort(customPortResult.port);
                          const res = await fetch(`/api/ports/check/${customPortResult.port}`);
                          if (res.ok) setCustomPortResult(await res.json());
                        }}
                      >
                        Free Port {customPortResult.port}
                      </button>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: "0.8rem", color: "#10b981", fontWeight: 700 }}>
                    Port {customPortResult.port} is Available
                  </span>
                )}
              </div>
            )}
          </form>

          {/* Section 1: Running Repositories */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h4 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                Currently Running Repositories ({runningRepos.length})
              </h4>
            </div>

            {runningRepos.length === 0 ? (
              <div style={{
                background: "rgba(15, 23, 42, 0.4)",
                border: "1px dashed var(--border-subtle)",
                borderRadius: "8px",
                padding: "14px",
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                textAlign: "center"
              }}>
                No managed repositories are currently running.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {runningRepos.map((repo) => (
                  <div
                    key={repo.port}
                    style={{
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      borderRadius: "10px",
                      padding: "12px 16px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap"
                    }}
                  >
                    <div style={{ minWidth: "240px", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span style={{
                          background: "rgba(16, 185, 129, 0.2)",
                          color: "#34d399",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          borderRadius: "6px",
                          padding: "2px 8px",
                          fontSize: "0.78rem",
                          fontWeight: 800,
                          fontFamily: "var(--font-mono)"
                        }}>
                          :{repo.port}
                        </span>
                        <strong style={{ fontSize: "0.98rem", color: "#fff" }}>
                          {repo.repo_name}
                        </strong>
                        {repo.repo_owner && (
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Owner: <strong style={{ color: "var(--accent-primary)" }}>{repo.repo_owner}</strong>
                          </span>
                        )}
                        {repo.framework && (
                          <span style={{
                            fontSize: "0.7rem",
                            textTransform: "uppercase",
                            background: "rgba(255,255,255,0.07)",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            color: "#cbd5e1",
                            fontWeight: 700
                          }}>
                            {repo.framework}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "5px", fontFamily: "var(--font-mono)" }}>
                        Process: {repo.process_name} (PID {repo.pid})
                        {repo.command_line ? ` · ${repo.command_line}` : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <a
                        href={`http://localhost:${repo.port}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-primary btn-sm"
                        style={{ textDecoration: "none" }}
                      >
                        Open Application
                      </a>
                      {repo.workspace_path && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            onClose();
                            navigate(
                              `/runner?path=${encodeURIComponent(repo.workspace_path)}&port=${repo.port}${
                                repo.run_id ? `&run_id=${repo.run_id}` : ""
                              }`
                            );
                          }}
                        >
                          Open in Runner
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

          {/* Section 2: All Listening Local Development Ports */}
          <div>
            <h4 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>
              All Active Listening Ports ({allPorts.length})
            </h4>

            {allPorts.length === 0 ? (
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                No listening ports detected in range 3000 - 9999.
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: "10px"
              }}>
                {allPorts.map((item) => (
                  <div
                    key={item.port}
                    style={{
                      background: "var(--bg-card-alt)",
                      border: item.is_protected
                        ? "1px solid rgba(245, 158, 11, 0.35)"
                        : item.is_managed
                        ? "1px solid rgba(0, 229, 153, 0.38)"
                        : "1px solid var(--border-subtle)",
                      borderRadius: "6px",
                      padding: "10px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px"
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{
                          fontWeight: 800,
                          fontSize: "0.92rem",
                          color: item.is_protected ? "#fbbf24" : item.is_managed ? "#00e599" : "#38bdf8",
                          fontFamily: "var(--font-mono)"
                        }}>
                          :{item.port}
                        </span>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>
                          {item.repo_name ? `${item.repo_name} (${item.process_name})` : item.process_name}
                        </span>
                        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                          PID {item.pid}
                        </span>
                      </div>
                      <div style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        marginTop: "3px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {item.label} · {item.addresses?.join(", ")}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <a
                        href={`http://localhost:${item.port}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ textDecoration: "none", padding: "4px 9px", fontSize: "0.74rem" }}
                      >
                        Open
                      </a>
                      {!item.is_protected ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          style={{ padding: "4px 9px", fontSize: "0.74rem" }}
                          disabled={freeingPortNum === item.port}
                          onClick={() => onFreePort(item.port)}
                        >
                          {freeingPortNum === item.port ? "..." : "Free Port"}
                        </button>
                      ) : (
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.7rem",
                          color: "#fbbf24",
                          padding: "4px 8px",
                          fontWeight: 700
                        }}>
                          Protected
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
