import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import { Terminal } from "../components/Terminal.jsx";
import { Preview } from "../components/Preview.jsx";

export function Runner({ setIsLive }) {
  const [searchParams] = useSearchParams();
  const { toast, onRefreshStats } = useOutletContext();

  const [repoInput, setRepoInput] = useState("");
  const [portInput, setPortInput] = useState(8000);
  const [execMode, setExecMode] = useState("standard");
  const [execEnv, setExecEnv] = useState("venv");

  const [currentRunId, setCurrentRunId] = useState(null);
  const [status, setStatus] = useState("ready"); // ready, processing, running, stopped, error
  const [logs, setLogs] = useState([]);
  const [isHealthy, setIsHealthy] = useState(false);
  const [activePort, setActivePort] = useState(null);

  const activeWsRef = useRef(null);
  const pollerRef = useRef(null);

  // Check URL query param e.g. /runner?path=...
  useEffect(() => {
    const pathParam = searchParams.get("path");
    if (pathParam) {
      setRepoInput(pathParam);
    }
  }, [searchParams]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeWsRef.current) activeWsRef.current.close();
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRepoInput(text.trim());
        toast.show("Clipboard content pasted.");
      }
    } catch {
      toast.show("Could not access clipboard, please paste manually.");
    }
  };

  const handleClearTerminal = () => {
    setLogs(["// Terminal cleared."]);
  };

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;
    try {
      await navigator.clipboard.writeText(logs.join("\n"));
      toast.show("Terminal logs copied.");
    } catch {
      toast.show("Failed to copy logs.");
    }
  };

  const handleReset = () => {
    setRepoInput("");
    setLogs(["// Terminal reset."]);
    setStatus("ready");
    setIsHealthy(false);
    setActivePort(null);
    if (setIsLive) setIsLive(false);
    toast.show("Fields reset.");
  };

  const connectWs = (runId, port) => {
    if (activeWsRef.current) {
      try { activeWsRef.current.close(); } catch (_) {}
    }
    if (pollerRef.current) {
      clearInterval(pollerRef.current);
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.port === "5173" ? "127.0.0.1:8000" : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws/logs/${runId}`);
    activeWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const msg = data.message;
        setLogs((prev) => [...prev, msg]);

        if (msg.includes("live at") || msg.includes("canlı yayında")) {
          setStatus("running");
          setIsHealthy(true);
          setActivePort(port);
          if (setIsLive) setIsLive(true);
          if (onRefreshStats) onRefreshStats();
        } else if (msg.includes("❌") || msg.includes("ERROR") || msg.includes("Critical Error")) {
          setStatus("error");
          if (setIsLive) setIsLive(false);
        }
      } catch {
        setLogs((prev) => [...prev, event.data]);
      }
    };

    // Dual-channel Polling Fallback
    let seenCount = 0;
    pollerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${runId}`);
        if (res.ok) {
          const data = await res.json();
          const serverLogs = data.logs || [];
          if (serverLogs.length > seenCount) {
            setLogs((prev) => {
              const newLines = serverLogs.slice(seenCount);
              return [...prev, ...newLines];
            });
            seenCount = serverLogs.length;
          }

          if (data.is_healthy) {
            setStatus("running");
            setIsHealthy(true);
            setActivePort(port);
            if (setIsLive) setIsLive(true);
          } else if (data.status === "failed") {
            setStatus("error");
            if (setIsLive) setIsLive(false);
          }
        }
      } catch (_) {}
    }, 1200);
  };

  const handleRun = async () => {
    const value = repoInput.trim();
    if (!value) {
      alert("Please enter a GitHub repository URL or local project path!");
      return;
    }

    const targetPort = parseInt(portInput, 10) || 8000;
    const payload = {
      repo_url: value.startsWith("http") ? value : null,
      local_path: !value.startsWith("http") ? value : null,
      port: targetPort,
      mode: execMode,
      preferred_env: execEnv
    };

    setLogs([
      `[System] Launching: ${value}`,
      `[System] Target Port: ${targetPort} | Mode: ${execMode.toUpperCase()} | Env: ${execEnv.toUpperCase()}`
    ]);
    setStatus("processing");
    setIsHealthy(false);
    setActivePort(targetPort);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setCurrentRunId(data.run_id);
      connectWs(data.run_id, targetPort);
    } catch (err) {
      setLogs((prev) => [...prev, `❌ Failed to connect to server: ${err.message}`]);
      setStatus("error");
    }
  };

  const handleStop = async () => {
    if (!currentRunId) return;
    try {
      await fetch(`/api/stop/${currentRunId}`, { method: "POST" });
      setLogs((prev) => [...prev, "[System] Application stopped by user request."]);
      setStatus("stopped");
      setIsHealthy(false);
      if (setIsLive) setIsLive(false);
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      console.error("Stop error:", err);
    }
  };

  const getStatusBadge = () => {
    if (status === "processing") return <span className="status-badge status-processing">Processing...</span>;
    if (status === "running") return <span className="status-badge status-running">Running ({activePort})</span>;
    if (status === "stopped") return <span className="status-badge status-stopped">Stopped</span>;
    if (status === "error") return <span className="status-badge status-stopped">Error</span>;
    return <span className="status-badge status-ready">Ready</span>;
  };

  return (
    <div className="page-view active">
      {/* Configuration Card */}
      <div className="runner-config-card">
        <div className="config-row-primary">
          <div className="input-field-group flex-grow">
            <label className="field-label" htmlFor="repoInput">
              Git Repository URL or Local Directory Path
            </label>
            <div className="input-with-action">
              <input
                id="repoInput"
                type="text"
                className="text-input"
                placeholder="https://github.com/example/project.git or C:/Projects/my-app"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
              />
              <button className="btn btn-secondary-sm" onClick={handlePaste} title="Paste from Clipboard">
                Paste
              </button>
            </div>
          </div>

          <div className="input-field-group field-port">
            <label className="field-label" htmlFor="portInput">Target Port</label>
            <input
              id="portInput"
              type="number"
              className="text-input"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
            />
          </div>
        </div>

        {/* Advanced Pipeline Options */}
        <div className="config-row-secondary">
          <div className="option-pill-group">
            <span className="option-label">Execution Mode:</span>
            <label className="radio-label">
              <input
                type="radio"
                name="execMode"
                value="standard"
                checked={execMode === "standard"}
                onChange={() => setExecMode("standard")}
              />
              <span className="radio-custom"></span>
              ⚡ Standard Mode (Rule-based)
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="execMode"
                value="deep_ai"
                checked={execMode === "deep_ai"}
                onChange={() => setExecMode("deep_ai")}
              />
              <span className="radio-custom"></span>
              🧠 AI Deep Mode (Heuristic/LLM)
            </label>
          </div>

          <div className="option-pill-group">
            <span className="option-label">Isolation Environment:</span>
            <label className="radio-label">
              <input
                type="radio"
                name="execEnv"
                value="venv"
                checked={execEnv === "venv"}
                onChange={() => setExecEnv("venv")}
              />
              <span className="radio-custom"></span>
              🐍 Virtualenv (.venv)
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="execEnv"
                value="docker"
                checked={execEnv === "docker"}
                onChange={() => setExecEnv("docker")}
              />
              <span className="radio-custom"></span>
              🐳 Docker Container
            </label>
          </div>
        </div>

        {/* Run Controls */}
        <div className="config-row-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleRun}
            disabled={status === "processing"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Analyze & Run Project</span>
          </button>

          {(status === "processing" || status === "running") && (
            <button className="btn btn-danger btn-lg" onClick={handleStop}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
              <span>Stop</span>
            </button>
          )}

          <button className="btn btn-secondary btn-lg" onClick={handleReset}>
            <span>Clear / Reset</span>
          </button>

          <div className="status-summary">
            <span className="summary-label">Status:</span>
            {getStatusBadge()}
          </div>
        </div>
      </div>

      {/* Workspace Grid: Terminal & Live Preview */}
      <div className="workspace-grid">
        <Terminal
          logs={logs}
          onClear={handleClearTerminal}
          onCopy={handleCopyLogs}
        />
        <Preview
          activePort={activePort}
          isHealthy={isHealthy}
          onRefreshToast={(msg) => toast.show(msg)}
        />
      </div>
    </div>
  );
}
