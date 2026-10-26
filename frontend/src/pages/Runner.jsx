import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import { Terminal } from "../components/Terminal.jsx";
import { Preview } from "../components/Preview.jsx";

const ROLE_STYLES = {
  backend: {
    label: "BACKEND",
    color: "#00e599",
    bg: "rgba(0, 229, 153, 0.12)",
    border: "rgba(0, 229, 153, 0.35)"
  },
  frontend: {
    label: "FRONTEND",
    color: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.12)",
    border: "rgba(56, 189, 248, 0.35)"
  },
  worker: {
    label: "WORKER / AUX",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)"
  }
};

function syncPortInCommand(cmdStr, newPortRaw) {
  if (!cmdStr) return cmdStr;
  const val = newPortRaw === null || newPortRaw === undefined ? "" : String(newPortRaw).trim();
  return cmdStr
    .replace(/(--port=)\d*/g, `$1${val}`)
    .replace(/(--port\s+)\d*/g, `$1${val}`)
    .replace(/(--server\.port=)\d*/g, `$1${val}`)
    .replace(/(--server\.port\s+)\d*/g, `$1${val}`)
    .replace(/(-p\s+)\d*/g, `$1${val}`)
    .replace(/(\bPORT=)\d*/g, `$1${val}`)
    .replace(/(http\.server\s+)\d*/g, `$1${val}`)
    .replace(/((?:0\.0\.0\.0|127\.0\.0\.1|localhost):)\d*/g, `$1${val}`);
}

export function Runner({ setIsLive }) {
  const [searchParams] = useSearchParams();
  const { toast, onRefreshStats, onRefreshPorts } = useOutletContext();

  // Progressive Flow: "source" (1) -> "detecting" (2a) -> "blueprint" (2b) -> "runtime" (3)
  const [step, setStep] = useState("source");
  const [scanStep, setScanStep] = useState(1);

  // Step 1 State
  const [repoInput, setRepoInput] = useState("");
  const [portInput, setPortInput] = useState(8000);
  const [freeingPortNum, setFreeingPortNum] = useState(null);
  const [recentRepos, setRecentRepos] = useState([]);

  // Step 2 (Stack Detection & Multi-Service Blueprint) State
  const [analyzeError, setAnalyzeError] = useState("");
  const [blueprint, setBlueprint] = useState(null);
  const [services, setServices] = useState([]);
  const [servicePortStatuses, setServicePortStatuses] = useState({});
  const [execEnv, setExecEnv] = useState("venv");
  const [envVars, setEnvVars] = useState([]);
  const [showDefaultEnvVars, setShowDefaultEnvVars] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState({});

  // Step 3 (Live Runtime) State
  const [currentRunId, setCurrentRunId] = useState(null);
  const [status, setStatus] = useState("ready"); // ready, processing, running, stopped, error
  const [logs, setLogs] = useState([]);
  const [isHealthy, setIsHealthy] = useState(false);
  const [activePort, setActivePort] = useState(null);
  const [runningServices, setRunningServices] = useState([]);
  const [viewMode, setViewMode] = useState("split"); // split, terminal, preview

  const activeWsRef = useRef(null);
  const pollerRef = useRef(null);

  // Load recent repos for quick selection in Step 1
  useEffect(() => {
    fetch("/api/projects?sort_by=recent")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRecentRepos((data || []).slice(0, 4)))
      .catch(() => {});
  }, []);

  // Handle incoming query params (/runner?path=...&run_id=...&port=...)
  useEffect(() => {
    const pathParam = searchParams.get("path");
    const runIdParam = searchParams.get("run_id");
    const portParam = searchParams.get("port");

    const resolvedPort = portParam ? parseInt(portParam, 10) || 8000 : 8000;
    if (portParam) {
      setPortInput(resolvedPort);
    }
    if (pathParam) {
      setRepoInput(pathParam);
    }
    if (runIdParam) {
      setPortInput(resolvedPort);
      setActivePort(resolvedPort);
      setCurrentRunId(runIdParam);
      setStatus("running");
      setStep("runtime");
      setLogs([`--> Connected to live execution for: ${pathParam || runIdParam}`]);
      connectWs(runIdParam, resolvedPort);
    } else if (pathParam) {
      handleAnalyzeRepo(null, pathParam, resolvedPort);
    }
  }, [searchParams]);

  // Cleanup WebSocket & poller on unmount
  useEffect(() => {
    return () => {
      if (activeWsRef.current) activeWsRef.current.close();
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, []);

  // Check port availability for a specific port number
  const checkSinglePort = async (p) => {
    const portNum = parseInt(p, 10);
    if (!portNum || portNum < 1 || portNum > 65535) return null;
    try {
      const res = await fetch(`/api/ports/check/${portNum}`);
      if (res.ok) {
        const data = await res.json();
        setServicePortStatuses((prev) => ({ ...prev, [portNum]: data }));
        return data;
      }
    } catch (_) {}
    return null;
  };

  // Whenever services change in Step 2, check all enabled service ports
  useEffect(() => {
    if (step !== "blueprint") return;
    const t = setTimeout(() => {
      services.forEach((svc) => {
        if (svc.enabled && svc.port) {
          checkSinglePort(svc.port);
        }
      });
    }, 180);
    return () => clearTimeout(t);
  }, [services, step]);

  const handleFreePort = async (portNum) => {
    setFreeingPortNum(portNum);
    try {
      const res = await fetch(`/api/ports/free/${portNum}`, { method: "POST" });
      if (res.ok) {
        if (toast) toast.show(`Port ${portNum} released.`);
        await checkSinglePort(portNum);
        if (onRefreshPorts) onRefreshPorts();
      }
    } catch (_) {
    } finally {
      setFreeingPortNum(null);
    }
  };

  // Update a specific service tier field
  const updateService = (svcId, updates) => {
    setServices((prev) =>
      prev.map((svc) => {
        if (svc.id !== svcId) return svc;
        const next = { ...svc, ...updates };
        if (updates.port !== undefined && next.run_command) {
          next.run_command = syncPortInCommand(next.run_command, updates.port);
        }
        return next;
      })
    );
  };

  const handleAddServiceTier = (roleType) => {
    const usedPorts = new Set(services.map((s) => parseInt(s.port, 10)).filter(Boolean));
    let defaultPort = roleType === "frontend" ? 5173 : roleType === "backend" ? 8000 : 8001;
    while (usedPorts.has(defaultPort) || defaultPort === 7000 || defaultPort === 7001) {
      defaultPort += 1;
    }

    const newId = `${roleType}_${Date.now().toString().slice(-4)}`;
    const template =
      roleType === "frontend"
        ? {
            id: newId,
            role: "frontend",
            name: "Frontend Web Client",
            framework: "vite",
            working_dir: "frontend",
            install_command: "npm install",
            run_command: `npm run dev -- --host 0.0.0.0 --port ${defaultPort}`,
            port: defaultPort,
            enabled: true
          }
        : roleType === "backend"
        ? {
            id: newId,
            role: "backend",
            name: "Backend API Service",
            framework: "fastapi",
            working_dir: "backend",
            install_command: "pip install -r requirements.txt",
            run_command: `uvicorn main:app --host 0.0.0.0 --port ${defaultPort}`,
            port: defaultPort,
            enabled: true
          }
        : {
            id: newId,
            role: "worker",
            name: "Auxiliary / Worker Service",
            framework: "custom",
            working_dir: ".",
            install_command: "",
            run_command: `python worker.py --port ${defaultPort}`,
            port: defaultPort,
            enabled: true
          };

    setServices((prev) => [...prev, template]);
    checkSinglePort(defaultPort);
  };

  const handleRemoveServiceTier = (svcId) => {
    if (services.length <= 1) return;
    setServices((prev) => prev.filter((s) => s.id !== svcId));
  };

  // Environment Variable / API Key helpers for Step 2
  const updateEnvVar = (index, field, val) => {
    setEnvVars((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: val } : item))
    );
  };

  const handleAddCustomEnvVar = () => {
    setEnvVars((prev) => [
      {
        key: "",
        value: "",
        default_value: "",
        is_secret: true,
        is_empty: true,
        source: "custom",
        is_custom: true
      },
      ...prev
    ]);
  };

  const handleRemoveCustomEnvVar = (index) => {
    setEnvVars((prev) => prev.filter((_, idx) => idx !== index));
  };

  const toggleSecretVisibility = (keyOrIdx) => {
    setRevealedSecrets((prev) => ({ ...prev, [keyOrIdx]: !prev[keyOrIdx] }));
  };

  // Step 1 -> Step 2: Run Visual Stack Detection & Blueprint Analysis
  const handleAnalyzeRepo = async (e, customPath = null, overridePort = null) => {
    if (e) e.preventDefault();
    const value = (customPath !== null ? customPath : repoInput).trim();
    if (!value) {
      if (toast) toast.show("Please enter a GitHub URL or local repository path.");
      return;
    }
    if (customPath !== null) {
      setRepoInput(value);
    }

    const targetPort = overridePort || parseInt(portInput, 10) || 8000;
    const isUrl = value.startsWith("http://") || value.startsWith("https://") || value.endsWith(".git");

    setAnalyzeError("");
    setScanStep(1);
    setStep("detecting");

    const t1 = setTimeout(() => setScanStep(2), 350);
    const t2 = setTimeout(() => setScanStep(3), 700);
    const t3 = setTimeout(() => setScanStep(4), 1050);

    try {
      const [res] = await Promise.all([
        fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo_url: isUrl ? value : null,
            local_path: !isUrl ? value : null,
            port: targetPort
          })
        }),
        new Promise((resolve) => setTimeout(resolve, 1350))
      ]);

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Detection failed with status ${res.status}`);
      }

      const data = await res.json();
      const detectedPort = data.saved_recipe?.port || targetPort;
      setPortInput(detectedPort);
      setBlueprint(data);

      // Populate multi-tier services list
      let initialServices = data.services && data.services.length > 0 ? data.services : [];
      if (initialServices.length === 0) {
        const isFe = ["static_html", "vite", "react", "nextjs", "vue", "astro"].includes(data.framework);
        initialServices = [
          {
            id: isFe ? "frontend" : "backend",
            role: isFe ? "frontend" : "backend",
            name: isFe
              ? `Frontend Service (${(data.framework || "web").toUpperCase()})`
              : `Backend Service (${(data.framework || "app").toUpperCase()})`,
            framework: data.framework || "generic",
            working_dir: ".",
            install_command: data.install_command || "",
            run_command: data.run_command || "",
            port: detectedPort,
            enabled: true
          }
        ];
      }

      setServices(initialServices);
      setEnvVars(data.env_vars || []);
      setShowDefaultEnvVars(false);
      setRevealedSecrets({});
      setStep("blueprint");
      initialServices.forEach((s) => {
        if (s.port) checkSinglePort(s.port);
      });
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      setAnalyzeError(err.message || "Could not analyze repository.");
      setStep("source");
    }
  };

  // Instant 1-Click Launch for previously verified repos (checks port availability first)
  const handleInstantLaunch = async (repoItem) => {
    const savedServices = repoItem.saved_recipe?.services || [];
    const savedPort = repoItem.saved_recipe?.port || parseInt(portInput, 10) || 8000;
    const portsToVerify =
      savedServices.length > 0
        ? savedServices.filter((s) => s.enabled !== false).map((s) => s.port)
        : [savedPort];

    for (const p of portsToVerify) {
      try {
        const checkRes = await fetch(`/api/ports/check/${p}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.in_use) {
            if (toast) {
              toast.show(`Port ${p} is occupied. Redirecting to Blueprint to resolve port conflict.`);
            }
            await handleAnalyzeRepo(null, repoItem.path, savedPort);
            return;
          }
        }
      } catch (_) {}
    }

    setRepoInput(repoItem.path);
    setPortInput(savedPort);
    await startExecution({
      targetValue: repoItem.path,
      targetPort: savedPort,
      overrideEnvVars: repoItem.saved_recipe?.env_vars || null,
      overrideServices:
        savedServices.length > 0
          ? savedServices
          : [
              {
                id: "backend",
                role: "backend",
                name: repoItem.name,
                framework: repoItem.framework || "python",
                working_dir: ".",
                install_command: repoItem.saved_recipe?.install_command || null,
                run_command: repoItem.saved_recipe?.run_command || null,
                port: savedPort,
                enabled: true
              }
            ]
    });
  };

  // Step 2 -> Step 3: Start Execution Pipeline
  const startExecution = async ({
    targetValue = null,
    targetPort = null,
    overrideServices = null,
    overrideEnvVars = null
  } = {}) => {
    const value = (targetValue || repoInput).trim();
    const activeServiceList = (overrideServices || services).filter((s) => s.enabled);

    if (activeServiceList.length === 0) {
      if (toast) toast.show("Please enable at least one service tier to launch.");
      return;
    }

    // Check for duplicate ports across enabled services
    const seenPorts = new Set();
    for (const s of activeServiceList) {
      const pNum = parseInt(s.port, 10);
      if (seenPorts.has(pNum)) {
        if (toast) {
          toast.show(`Port conflict: Multiple services are assigned to port :${pNum}. Assign unique ports.`);
        }
        return;
      }
      seenPorts.add(pNum);
    }

    // Hard gate: verify every enabled service's target port is free before launching
    for (const s of activeServiceList) {
      const pNum = parseInt(s.port, 10) || 8000;
      try {
        const checkRes = await fetch(`/api/ports/check/${pNum}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          setServicePortStatuses((prev) => ({ ...prev, [pNum]: checkData }));
          if (checkData.in_use) {
            if (toast) {
              toast.show(
                `Cannot launch: ${s.role.toUpperCase()} port :${pNum} is occupied. Free it or switch ports first.`
              );
            }
            return;
          }
        }
      } catch (_) {}
    }

    const isUrl = value.startsWith("http://") || value.startsWith("https://") || value.endsWith(".git");
    // Prefer frontend port for initial live preview if both frontend & backend are launched
    const frontendSvc = activeServiceList.find((s) => s.role === "frontend");
    const primarySvc = activeServiceList[0];
    const previewPort = frontendSvc ? parseInt(frontendSvc.port, 10) : parseInt(primarySvc.port, 10) || targetPort || 8000;

    // Collect filled-in environment variables / API keys
    const envVarsPayload = {};
    if (overrideEnvVars && typeof overrideEnvVars === "object") {
      Object.entries(overrideEnvVars).forEach(([k, v]) => {
        if (k && v !== undefined && v !== null && String(v).trim() !== "") {
          envVarsPayload[String(k).trim()] = String(v).trim();
        }
      });
    } else {
      envVars.forEach((item) => {
        const k = (item.key || "").trim();
        const v = (item.value || "").trim();
        if (k && v !== "") {
          envVarsPayload[k] = v;
        }
      });
    }

    const payload = {
      repo_url: isUrl ? value : null,
      local_path: !isUrl ? value : null,
      port: parseInt(primarySvc.port, 10) || 8000,
      mode: "standard",
      preferred_env: execEnv,
      custom_run_command: primarySvc.run_command || null,
      custom_install_command: primarySvc.install_command !== undefined ? primarySvc.install_command : null,
      services: activeServiceList.map((s) => ({
        ...s,
        port: parseInt(s.port, 10) || 8000
      })),
      env_vars: envVarsPayload
    };

    setStep("runtime");
    setViewMode("split");
    setStatus("processing");
    setIsHealthy(false);
    setActivePort(previewPort);
    setRunningServices(activeServiceList);
    setLogs(
      [
        `[System] Launching Repository: ${value}`,
        ...activeServiceList.map(
          (s) =>
            `[System] Tier [${s.role.toUpperCase()}] -> Port :${s.port} | Dir: ${s.working_dir || "."} | Cmd: ${s.run_command}`
        )
      ].filter(Boolean)
    );

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setCurrentRunId(data.run_id);
      connectWs(data.run_id, previewPort);
    } catch (err) {
      setLogs((prev) => [...prev, `[ERROR] Failed to connect to server: ${err.message}`]);
      setStatus("error");
    }
  };

  const connectWs = (runId, port) => {
    if (activeWsRef.current) {
      try { activeWsRef.current.close(); } catch (_) {}
    }
    if (pollerRef.current) {
      clearInterval(pollerRef.current);
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      window.location.port === "7000" || window.location.port === "5173"
        ? "127.0.0.1:7001"
        : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws/logs/${runId}`);
    activeWsRef.current = ws;

    let seenCount = 0;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const msg = data.message;
        seenCount += 1;
        setLogs((prev) => [...prev, msg]);

        if (msg.includes("live at")) {
          setStatus("running");
          setIsHealthy(true);
          setActivePort((prev) => prev || port);
          if (setIsLive) setIsLive(true);
          if (onRefreshStats) onRefreshStats();
          if (onRefreshPorts) onRefreshPorts();
        } else if (msg.includes("[ERROR]") || msg.includes("Critical Error")) {
          setStatus("error");
          if (setIsLive) setIsLive(false);
        }
      } catch {
        seenCount += 1;
        setLogs((prev) => [...prev, event.data]);
      }
    };

    pollerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${runId}`);
        if (res.ok) {
          const data = await res.json();
          const serverLogs = data.logs || [];
          if (serverLogs.length > seenCount) {
            const newLines = serverLogs.slice(seenCount);
            seenCount = serverLogs.length;
            setLogs((prev) => [...prev, ...newLines]);
          }

          if (data.is_healthy) {
            setStatus("running");
            setIsHealthy(true);
            setActivePort((prev) => prev || port);
            if (setIsLive) setIsLive(true);
          } else if (data.status === "failed") {
            setStatus("error");
            if (setIsLive) setIsLive(false);
          }
        }
      } catch (_) {}
    }, 1200);
  };

  const handleStop = async () => {
    if (!currentRunId) return;
    if (activeWsRef.current) {
      try { activeWsRef.current.close(); } catch (_) {}
    }
    if (pollerRef.current) {
      clearInterval(pollerRef.current);
    }
    try {
      await fetch(`/api/stop/${currentRunId}`, { method: "POST" });
      setLogs((prev) => [...prev, "[System] Execution stopped by user."]);
      setStatus("stopped");
      setIsHealthy(false);
      if (setIsLive) setIsLive(false);
      if (onRefreshStats) onRefreshStats();
      if (onRefreshPorts) onRefreshPorts();
    } catch (_) {}
  };

  const handleManualCheck = async () => {
    if (!currentRunId) return;
    try {
      const res = await fetch(`/api/status/${currentRunId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.is_healthy) {
          setIsHealthy(true);
          setStatus("running");
          if (data.port) setActivePort((prev) => prev || data.port);
          if (setIsLive) setIsLive(true);
        }
      }
    } catch (_) {}
  };

  const getStatusBadge = () => {
    if (status === "processing") return <span className="status-badge status-processing">Provisioning...</span>;
    if (status === "running") return <span className="status-badge status-running">Live (:{activePort})</span>;
    if (status === "stopped") return <span className="status-badge status-stopped">Stopped</span>;
    if (status === "error") return <span className="status-badge status-stopped">Failed</span>;
    return <span className="status-badge status-ready">Standby</span>;
  };

  const stepNumber = step === "source" ? 1 : step === "detecting" || step === "blueprint" ? 2 : 3;

  // Compute port conflict state across all enabled services in Step 2
  const enabledServices = services.filter((s) => s.enabled);
  const portCounts = {};
  let hasInvalidPorts = false;
  enabledServices.forEach((s) => {
    const p = parseInt(s.port, 10);
    if (!p || p < 1 || p > 65535) {
      hasInvalidPorts = true;
    } else {
      portCounts[p] = (portCounts[p] || 0) + 1;
    }
  });

  const hasDuplicatePorts = Object.values(portCounts).some((count) => count > 1);
  const occupiedServicePorts = enabledServices.filter((s) => {
    const p = parseInt(s.port, 10);
    return p && servicePortStatuses[p]?.in_use;
  });
  const isLaunchBlocked =
    enabledServices.length === 0 || hasInvalidPorts || hasDuplicatePorts || occupiedServicePorts.length > 0;

  return (
    <div className="page-view active">
      {/* Progressive Stepper Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "12px 20px",
          marginBottom: "22px",
          flexWrap: "wrap",
          gap: "12px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => status !== "processing" && setStep("source")}
            style={{
              background: "none",
              border: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: status === "processing" ? "default" : "pointer",
              color: stepNumber === 1 ? "var(--accent-primary)" : "var(--text-main)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              fontWeight: 700
            }}
          >
            <span
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "4px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: stepNumber >= 1 ? "rgba(0, 229, 153, 0.16)" : "var(--bg-card-alt)",
                border: stepNumber === 1 ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                color: stepNumber >= 1 ? "var(--accent-primary)" : "var(--text-dim)"
              }}
            >
              1
            </span>
            <span>1. REPOSITORY SOURCE</span>
          </button>

          <span style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>//</span>

          <button
            type="button"
            disabled={!blueprint || status === "processing"}
            onClick={() => blueprint && setStep("blueprint")}
            style={{
              background: "none",
              border: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: blueprint && status !== "processing" ? "pointer" : "default",
              color: stepNumber === 2 ? "var(--accent-primary)" : blueprint ? "var(--text-main)" : "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              fontWeight: 700
            }}
          >
            <span
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "4px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: stepNumber >= 2 ? "rgba(0, 229, 153, 0.16)" : "var(--bg-card-alt)",
                border: stepNumber === 2 ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                color: stepNumber >= 2 ? "var(--accent-primary)" : "var(--text-dim)"
              }}
            >
              2
            </span>
            <span>2. STACK DETECTION & BLUEPRINT</span>
          </button>

          <span style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>//</span>

          <button
            type="button"
            disabled={!currentRunId}
            onClick={() => currentRunId && setStep("runtime")}
            style={{
              background: "none",
              border: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: currentRunId ? "pointer" : "default",
              color: stepNumber === 3 ? "var(--accent-primary)" : currentRunId ? "var(--text-main)" : "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              fontWeight: 700
            }}
          >
            <span
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "4px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: stepNumber === 3 ? "rgba(0, 229, 153, 0.16)" : "var(--bg-card-alt)",
                border: stepNumber === 3 ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                color: stepNumber === 3 ? "var(--accent-primary)" : "var(--text-dim)"
              }}
            >
              3
            </span>
            <span>3. LIVE EXECUTION</span>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {getStatusBadge()}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* STEP 1: SELECT SOURCE                                                 */}
      {/* ===================================================================== */}
      {step === "source" && (
        <div style={{ maxWidth: "880px", margin: "0 auto" }}>
          <form onSubmit={(e) => handleAnalyzeRepo(e)} className="runner-config-card">
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", color: "#fff", marginBottom: "4px" }}>
                Step 1: Select Repository Source
              </h2>
              <p style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                Enter a GitHub repository URL or local project path to run stack detection and configure service tiers (Backend, Frontend, Ports) in the next step.
              </p>
            </div>

            <div className="input-field-group">
              <label className="field-label" htmlFor="repoInput">
                Repository URL or Local Path
              </label>
              <input
                id="repoInput"
                type="text"
                className="text-input"
                placeholder="https://github.com/owner/repository or C:/path/to/project"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                autoFocus
              />
            </div>

            {analyzeError && (
              <div
                style={{
                  background: "rgba(244, 63, 94, 0.1)",
                  border: "1px solid rgba(244, 63, 94, 0.35)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 14px",
                  color: "#fda4af",
                  fontSize: "0.82rem"
                }}
              >
                {analyzeError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "6px" }}>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={!repoInput.trim()}
              >
                <span>Detect Stack & Analyze →</span>
              </button>
            </div>
          </form>

          {/* Quick Launch from Recent Repos */}
          {recentRepos.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-dim)",
                  marginBottom: "10px"
                }}
              >
                // Recent Repositories (My Repos)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: "12px"
                }}
              >
                {recentRepos.map((r) => {
                  const hasRecipe = r.saved_recipe && r.saved_recipe.run_command;
                  return (
                    <div
                      key={r.id}
                      className="runner-config-card"
                      style={{
                        padding: "14px 16px",
                        marginBottom: 0,
                        gap: "10px",
                        justifyContent: "space-between"
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <strong style={{ fontFamily: "var(--font-display)", fontSize: "0.95rem", color: "#fff" }}>
                            {r.name}
                          </strong>
                          <span className="project-badge">{(r.framework || "APP").toUpperCase()}</span>
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "3px" }}>
                          Owner: {r.owner || "Local"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => handleAnalyzeRepo(e, r.path)}
                        >
                          Detect & Inspect
                        </button>
                        {hasRecipe && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleInstantLaunch(r)}
                          >
                            Quick Run (:{r.saved_recipe.port || 8000})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 2A: LIVE STACK DETECTION SCANNER                                 */}
      {/* ===================================================================== */}
      {step === "detecting" && (
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <div className="runner-config-card">
            <div className="detection-scanning-box">
              <div className="radar-wrapper">
                <div className="radar-circle"></div>
                <div className="radar-circle inner"></div>
                <div className="radar-sweep"></div>
                <div className="radar-ripple"></div>
                <div className="radar-circle center-dot"></div>
              </div>

              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "#fff", marginBottom: "6px" }}>
                Technology Stack Detection in Progress
              </h3>
              <p style={{ fontSize: "0.84rem", color: "var(--text-muted)", marginBottom: "16px" }}>
                Scanning repository structure, manifests, and service tiers for:{" "}
                <strong style={{ color: "var(--accent-primary)", fontFamily: "var(--font-mono)" }}>{repoInput}</strong>
              </p>

              <div className="scanning-steps">
                <div className={`scanning-step-item ${scanStep >= 1 ? (scanStep === 1 ? "active" : "done") : ""}`}>
                  {scanStep > 1 ? "✓" : <div className="scanning-spinner" />}
                  <span>Step 1: Locating repository directory & Git metadata</span>
                </div>
                <div className={`scanning-step-item ${scanStep >= 2 ? (scanStep === 2 ? "active" : "done") : ""}`}>
                  {scanStep > 2 ? "✓" : scanStep === 2 ? <div className="scanning-spinner" /> : "·"}
                  <span>Step 2: Inspecting Backend & Frontend dependency manifests</span>
                </div>
                <div className={`scanning-step-item ${scanStep >= 3 ? (scanStep === 3 ? "active" : "done") : ""}`}>
                  {scanStep > 3 ? "✓" : scanStep === 3 ? <div className="scanning-spinner" /> : "·"}
                  <span>Step 3: Synthesizing per-service launch commands & port bindings</span>
                </div>
                <div className={`scanning-step-item ${scanStep >= 4 ? (scanStep === 4 ? "active" : "done") : ""}`}>
                  {scanStep === 4 ? <div className="scanning-spinner" /> : "·"}
                  <span>Step 4: Scanning .env templates & source code for unfilled API keys</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 2B: DETECTED STACK BLUEPRINT & MULTI-SERVICE CONFIGURATION       */}
      {/* ===================================================================== */}
      {step === "blueprint" && blueprint && (
        <div style={{ maxWidth: "940px", margin: "0 auto" }}>
          <div className="runner-config-card">
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "#fff", marginBottom: "4px" }}>
                Step 2: Stack Blueprint & Service Configuration
              </h2>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Configure Backend, Frontend, and Auxiliary service commands along with their dedicated target ports before execution.
              </p>
            </div>

            <div className="blueprint-hero" style={{ marginBottom: 0 }}>
              <div>
                <div className="blueprint-hero-title">{blueprint.project_name}</div>
                <div className="blueprint-hero-subtitle">
                  Primary Stack:{" "}
                  <strong style={{ color: "var(--accent-primary)" }}>
                    {(blueprint.framework || "unknown").toUpperCase()}
                  </strong>
                  {blueprint.repo_owner && (
                    <span>
                      {" "}· Owner: <strong style={{ color: "#fff" }}>{blueprint.repo_owner}</strong>
                    </span>
                  )}
                  <span>
                    {" "}· Active Tiers: <strong style={{ color: "#38bdf8" }}>{enabledServices.length}</strong>
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                {blueprint.cached && <span className="port-tag">Saved Recipe Active</span>}
                <span
                  className="port-tag"
                  style={{
                    backgroundColor: "rgba(56, 189, 248, 0.12)",
                    color: "#38bdf8",
                    borderColor: "rgba(56, 189, 248, 0.3)"
                  }}
                >
                  {enabledServices.length > 1 ? "Multi-Service Topology" : "Single-Service Topology"}
                </span>
              </div>
            </div>

            {/* Global Environment & Manifests Row */}
            <div className="blueprint-grid" style={{ marginBottom: 0, gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="blueprint-card">
                <span className="blueprint-card-label">Primary Entrypoint</span>
                <div className="blueprint-card-value">{blueprint.entrypoint || "Auto-detected"}</div>
              </div>

              <div className="blueprint-card">
                <span className="blueprint-card-label">Isolation Environment</span>
                <div className="blueprint-card-value" style={{ gap: "14px" }}>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="execEnv"
                      checked={execEnv === "venv"}
                      onChange={() => setExecEnv("venv")}
                    />
                    <span>Virtualenv (.venv)</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="execEnv"
                      checked={execEnv === "docker"}
                      onChange={() => setExecEnv("docker")}
                    />
                    <span>Docker</span>
                  </label>
                </div>
              </div>

              <div className="blueprint-card">
                <span className="blueprint-card-label">Container Status</span>
                <div className="blueprint-card-value">
                  {blueprint.has_dockerfile ? "Dockerfile Detected" : "Host Virtualenv / Node Runtime"}
                </div>
              </div>
            </div>

            {blueprint.detected_files && blueprint.detected_files.length > 0 && (
              <div>
                <span className="blueprint-card-label" style={{ display: "block", marginBottom: "6px" }}>
                  Detected Manifests & Entry Files:
                </span>
                <div className="chips-container">
                  {blueprint.detected_files.map((file, idx) => (
                    <span key={idx} className="file-chip">
                      {file}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* SERVICE ARCHITECTURE TIERS (BACKEND / FRONTEND / WORKER)          */}
            {/* ================================================================= */}
            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "14px"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px"
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      color: "var(--text-main)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase"
                    }}
                  >
                    // Service Tiers, Commands & Port Bindings
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    Separate Backend, Frontend, or Worker processes — each with its own working directory, commands, and verified port.
                  </div>
                </div>

                {/* Add Service Tier Buttons */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ borderColor: "rgba(56, 189, 248, 0.4)", color: "#38bdf8" }}
                    onClick={() => handleAddServiceTier("frontend")}
                  >
                    + Add Frontend Tier
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ borderColor: "rgba(0, 229, 153, 0.4)", color: "#00e599" }}
                    onClick={() => handleAddServiceTier("backend")}
                  >
                    + Add Backend Tier
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleAddServiceTier("worker")}
                  >
                    + Add Worker / Custom
                  </button>
                </div>
              </div>

              {/* Duplicate Port Warning */}
              {hasDuplicatePorts && (
                <div
                  style={{
                    background: "rgba(244, 63, 94, 0.12)",
                    border: "1px solid rgba(244, 63, 94, 0.4)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 14px",
                    color: "#fda4af",
                    fontSize: "0.82rem"
                  }}
                >
                  <strong>Port Assignment Conflict:</strong> Two or more enabled service tiers are assigned to the same port. Please assign a unique port to each service tier.
                </div>
              )}

              {/* Service Tier Cards */}
              {services.map((svc) => {
                const roleMeta = ROLE_STYLES[svc.role] || ROLE_STYLES.backend;
                const pNum = parseInt(svc.port, 10) || 0;
                const pStatus = servicePortStatuses[pNum];
                const isOccupied = Boolean(svc.enabled && pStatus && pStatus.in_use);
                const isDuplicate = Boolean(svc.enabled && pNum && portCounts[pNum] > 1);

                return (
                  <div
                    key={svc.id}
                    style={{
                      background: "var(--bg-card-alt)",
                      border: isOccupied || isDuplicate
                        ? "1px solid rgba(244, 63, 94, 0.55)"
                        : `1px solid ${svc.enabled ? roleMeta.border : "var(--border-subtle)"}`,
                      borderRadius: "var(--radius-md)",
                      padding: "16px",
                      opacity: svc.enabled ? 1 : 0.58,
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {/* Service Card Top Row: Role Selector + Name + Working Dir + Port + Controls */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr 150px 210px auto",
                        gap: "12px",
                        alignItems: "center"
                      }}
                    >
                      {/* Role Badge Selector */}
                      <select
                        value={svc.role}
                        onChange={(e) => updateService(svc.id, { role: e.target.value })}
                        style={{
                          background: roleMeta.bg,
                          color: roleMeta.color,
                          border: `1px solid ${roleMeta.border}`,
                          borderRadius: "5px",
                          padding: "7px 10px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.74rem",
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          cursor: "pointer",
                          outline: "none"
                        }}
                      >
                        <option value="backend" style={{ background: "#0d1017", color: "#00e599" }}>
                          BACKEND
                        </option>
                        <option value="frontend" style={{ background: "#0d1017", color: "#38bdf8" }}>
                          FRONTEND
                        </option>
                        <option value="worker" style={{ background: "#0d1017", color: "#f59e0b" }}>
                          WORKER / AUX
                        </option>
                      </select>

                      {/* Service Name Input */}
                      <div>
                        <span className="blueprint-card-label" style={{ display: "block", marginBottom: "3px" }}>
                          Service Label ({(svc.framework || "custom").toUpperCase()})
                        </span>
                        <input
                          type="text"
                          className="text-input"
                          style={{ padding: "6px 10px", fontSize: "0.84rem" }}
                          value={svc.name}
                          onChange={(e) => updateService(svc.id, { name: e.target.value })}
                        />
                      </div>

                      {/* Working Directory Input */}
                      <div>
                        <span className="blueprint-card-label" style={{ display: "block", marginBottom: "3px" }}>
                          Working Dir
                        </span>
                        <input
                          type="text"
                          className="text-input"
                          style={{
                            padding: "6px 10px",
                            fontSize: "0.82rem",
                            fontFamily: "var(--font-mono)"
                          }}
                          placeholder=". or frontend"
                          value={svc.working_dir}
                          onChange={(e) => updateService(svc.id, { working_dir: e.target.value })}
                        />
                      </div>

                      {/* Dedicated Port Input + Live Status Pill Right Next To Commands */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                          <span className="blueprint-card-label">Service Port</span>
                          {svc.enabled && (!pNum || pNum < 1 || pNum > 65535) ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.66rem", color: "#fb7185", fontWeight: 700 }}>
                              ▲ REQUIRED
                            </span>
                          ) : svc.enabled && pStatus && !pStatus.in_use && !isDuplicate ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.66rem", color: "var(--accent-primary)", fontWeight: 700 }}>
                              ● AVAILABLE
                            </span>
                          ) : svc.enabled && (isOccupied || isDuplicate) ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.66rem", color: "#fb7185", fontWeight: 700 }}>
                              ▲ {isDuplicate ? "DUPLICATE" : "OCCUPIED"}
                            </span>
                          ) : null}
                        </div>
                        <input
                          type="number"
                          className="text-input"
                          style={{
                            padding: "6px 10px",
                            fontSize: "0.86rem",
                            fontWeight: 700,
                            fontFamily: "var(--font-mono)",
                            borderColor:
                              isOccupied || isDuplicate || (svc.enabled && (!pNum || pNum < 1 || pNum > 65535))
                                ? "rgba(244, 63, 94, 0.6)"
                                : undefined
                          }}
                          placeholder="8000"
                          value={svc.port}
                          onChange={(e) => updateService(svc.id, { port: e.target.value })}
                        />
                      </div>

                      {/* Enable Checkbox & Remove Tier Button */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "16px" }}>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            color: "var(--text-muted)",
                            cursor: "pointer"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={svc.enabled}
                            onChange={(e) => updateService(svc.id, { enabled: e.target.checked })}
                            style={{ accentColor: roleMeta.color }}
                          />
                          <span>Active</span>
                        </label>

                        {services.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: "5px 9px" }}
                            title="Remove Service Tier"
                            onClick={() => handleRemoveServiceTier(svc.id)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Port Conflict Resolution Banner for this Service Tier */}
                    {isOccupied && pStatus && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "10px",
                          background: "rgba(244, 63, 94, 0.1)",
                          border: "1px solid rgba(244, 63, 94, 0.35)",
                          borderRadius: "var(--radius-sm)",
                          padding: "9px 12px"
                        }}
                      >
                        <div style={{ fontSize: "0.79rem", color: "#fda4af" }}>
                          <strong>{roleMeta.label} Port :{pNum} Occupied</strong> by{" "}
                          <strong>{pStatus.processes?.[0]?.process_name || "Process"}</strong> (PID{" "}
                          {pStatus.processes?.[0]?.pid}). Resolve before launching:
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {!pStatus.is_protected && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={freeingPortNum === pNum}
                              onClick={() => handleFreePort(pNum)}
                            >
                              {freeingPortNum === pNum ? "Releasing..." : `Free Port :${pNum}`}
                            </button>
                          )}
                          {pStatus.suggested_free_port && pStatus.suggested_free_port !== pNum && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => updateService(svc.id, { port: pStatus.suggested_free_port })}
                            >
                              Switch to :{pStatus.suggested_free_port}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Side-by-Side Install & Launch Commands for this Service Tier */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1.35fr",
                        gap: "12px"
                      }}
                    >
                      <div className="blueprint-command-box" style={{ marginBottom: 0 }}>
                        <div className="blueprint-command-header">
                          <span className="blueprint-command-title">
                            {roleMeta.label} Dependency Install Command
                          </span>
                        </div>
                        <input
                          type="text"
                          className="blueprint-command-input"
                          placeholder="e.g. pip install -r requirements.txt or npm install"
                          value={svc.install_command || ""}
                          onChange={(e) => updateService(svc.id, { install_command: e.target.value })}
                        />
                      </div>

                      <div className="blueprint-command-box" style={{ marginBottom: 0 }}>
                        <div
                          className="blueprint-command-header"
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                        >
                          <span className="blueprint-command-title">
                            {roleMeta.label} Launch Command
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.7rem",
                              color: roleMeta.color,
                              fontWeight: 700
                            }}
                          >
                            PORT :{svc.port}
                          </span>
                        </div>
                        <input
                          type="text"
                          className="blueprint-command-input"
                          placeholder="e.g. uvicorn main:app --port 8000 or npm run dev -- --port 5173"
                          value={svc.run_command || ""}
                          onChange={(e) => updateService(svc.id, { run_command: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ================================================================= */}
            {/* DETECTED API KEYS & ENVIRONMENT VARIABLES (OPTIONAL)              */}
            {/* ================================================================= */}
            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              {(() => {
                const indexedVars = envVars.map((item, idx) => ({ ...item, _idx: idx }));
                const primaryVars = indexedVars.filter(
                  (v) => v.is_empty || v.is_custom || !v.default_value
                );
                const defaultVars = indexedVars.filter(
                  (v) => !v.is_empty && !v.is_custom && Boolean(v.default_value)
                );
                const unfilledCount = primaryVars.filter(
                  (v) => !(v.value && v.value.trim())
                ).length;
                const visibleVars = showDefaultEnvVars
                  ? [...primaryVars, ...defaultVars]
                  : primaryVars;

                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "10px"
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            flexWrap: "wrap"
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              color: "var(--text-main)",
                              letterSpacing: "0.06em",
                              textTransform: "uppercase"
                            }}
                          >
                            // Detected API Keys & Environment Variables (Optional)
                          </span>
                          {envVars.length > 0 && (
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                background:
                                  unfilledCount > 0
                                    ? "rgba(245, 158, 11, 0.14)"
                                    : "rgba(0, 229, 153, 0.14)",
                                color: unfilledCount > 0 ? "#fbbf24" : "var(--accent-primary)",
                                border:
                                  unfilledCount > 0
                                    ? "1px solid rgba(245, 158, 11, 0.35)"
                                    : "1px solid rgba(0, 229, 153, 0.35)"
                              }}
                            >
                              {unfilledCount > 0
                                ? `${unfilledCount} UNFILLED KEY${unfilledCount > 1 ? "S" : ""} DETECTED`
                                : "ALL KEYS CONFIGURED"}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          Automatically scanned from <code>.env.example</code>, <code>config.py</code>,{" "}
                          <code>os.getenv()</code>, and <code>import.meta.env</code>. Fill in any keys you wish to inject into <code>.env</code> and the runtime environment.
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        {defaultVars.length > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowDefaultEnvVars((prev) => !prev)}
                          >
                            {showDefaultEnvVars
                              ? `Hide ${defaultVars.length} Default Variable${defaultVars.length > 1 ? "s" : ""}`
                              : `Show ${defaultVars.length} Default Variable${defaultVars.length > 1 ? "s" : ""}`}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: "rgba(245, 158, 11, 0.4)", color: "#fbbf24" }}
                          onClick={handleAddCustomEnvVar}
                        >
                          + Add Custom Env Var
                        </button>
                      </div>
                    </div>

                    {visibleVars.length === 0 ? (
                      <div
                        style={{
                          background: "var(--bg-card-alt)",
                          border: "1px dashed var(--border-subtle)",
                          borderRadius: "var(--radius-sm)",
                          padding: "12px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap"
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {envVars.length === 0
                            ? "No empty API keys or required environment variables were detected in this repository."
                            : `All ${defaultVars.length} detected environment variables already have default values configured.`}
                        </span>
                        {defaultVars.length > 0 && !showDefaultEnvVars && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowDefaultEnvVars(true)}
                          >
                            Inspect Default Variables ({defaultVars.length})
                          </button>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px"
                        }}
                      >
                        {visibleVars.map((item) => {
                          const idx = item._idx;
                          const hasUserValue = Boolean(item.value && item.value.trim());
                          const isRevealed = Boolean(revealedSecrets[idx]);

                          return (
                            <div
                              key={`${item.key || "custom"}_${idx}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(220px, 1fr) 1.5fr auto",
                                gap: "12px",
                                alignItems: "center",
                                background: "var(--bg-card-alt)",
                                border: hasUserValue
                                  ? "1px solid rgba(0, 229, 153, 0.35)"
                                  : item.is_empty
                                  ? "1px solid rgba(245, 158, 11, 0.32)"
                                  : "1px solid var(--border-subtle)",
                                borderRadius: "var(--radius-sm)",
                                padding: "10px 14px"
                              }}
                            >
                              {/* Key Name & Source Metadata */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                {item.is_custom ? (
                                  <input
                                    type="text"
                                    className="text-input"
                                    style={{
                                      padding: "5px 9px",
                                      fontSize: "0.8rem",
                                      fontFamily: "var(--font-mono)",
                                      fontWeight: 700
                                    }}
                                    placeholder="ENV_VAR_NAME (e.g. OPENAI_API_KEY)"
                                    value={item.key}
                                    onChange={(e) =>
                                      updateEnvVar(idx, "key", e.target.value.toUpperCase().replace(/\s+/g, "_"))
                                    }
                                  />
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
                                    <span
                                      style={{
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.82rem",
                                        fontWeight: 700,
                                        color: "#fff"
                                      }}
                                    >
                                      {item.key}
                                    </span>
                                    {item.is_secret && (
                                      <span
                                        style={{
                                          fontFamily: "var(--font-mono)",
                                          fontSize: "0.62rem",
                                          fontWeight: 700,
                                          padding: "1px 6px",
                                          borderRadius: "3px",
                                          background: "rgba(245, 158, 11, 0.14)",
                                          color: "#fbbf24",
                                          border: "1px solid rgba(245, 158, 11, 0.3)"
                                        }}
                                      >
                                        API KEY / SECRET
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.68rem",
                                    color: "var(--text-dim)"
                                  }}
                                >
                                  Source: {item.source || ".env"}
                                </div>
                              </div>

                              {/* Value Input */}
                              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                <input
                                  type={item.is_secret && !isRevealed ? "password" : "text"}
                                  className="text-input"
                                  style={{
                                    padding: "7px 11px",
                                    fontSize: "0.82rem",
                                    fontFamily: "var(--font-mono)",
                                    width: "100%"
                                  }}
                                  placeholder={
                                    item.default_value
                                      ? `Default: ${item.default_value}`
                                      : `Optional — Enter ${item.key || "API key"} value...`
                                  }
                                  value={item.value || ""}
                                  onChange={(e) => updateEnvVar(idx, "value", e.target.value)}
                                />
                              </div>

                              {/* Right Status & Secret Toggle Controls */}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.66rem",
                                    fontWeight: 700,
                                    color: hasUserValue
                                      ? "var(--accent-primary)"
                                      : item.default_value
                                      ? "#38bdf8"
                                      : "#fbbf24",
                                    minWidth: "68px",
                                    textAlign: "right"
                                  }}
                                >
                                  {hasUserValue
                                    ? "● FILLED"
                                    : item.default_value
                                    ? "● DEFAULT"
                                    : "○ OPTIONAL"}
                                </span>

                                {item.is_secret && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: "4px 8px", fontSize: "0.7rem" }}
                                    onClick={() => toggleSecretVisibility(idx)}
                                  >
                                    {isRevealed ? "Hide" : "Show"}
                                  </button>
                                )}

                                {item.is_custom && (
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    style={{ padding: "4px 8px", fontSize: "0.7rem" }}
                                    onClick={() => handleRemoveCustomEnvVar(idx)}
                                    title="Remove Custom Variable"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Clean Step 2 Footer Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "14px",
                borderTop: "1px solid var(--border-subtle)"
              }}
            >
              <button type="button" className="btn btn-secondary" onClick={() => setStep("source")}>
                ← Back to Source
              </button>

              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={isLaunchBlocked}
                title={
                  isLaunchBlocked
                    ? "Resolve occupied or duplicate service ports above before launching."
                    : "Launch all enabled service tiers"
                }
                onClick={() => startExecution()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>
                  {occupiedServicePorts.length > 0
                    ? `Port :${occupiedServicePorts[0].port} Occupied — Resolve Conflict Above`
                    : hasDuplicatePorts
                    ? "Duplicate Service Ports — Assign Unique Ports"
                    : enabledServices.length > 1
                    ? `Confirm & Launch ${enabledServices.length} Services (${enabledServices
                        .map((s) => `${s.role.toUpperCase()} :${s.port}`)
                        .join(" + ")})`
                    : `Confirm & Launch ${enabledServices[0]?.role?.toUpperCase() || "Application"} (:${
                        enabledServices[0]?.port || portInput
                      })`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 3: LIVE EXECUTION WORKSPACE                                      */}
      {/* ===================================================================== */}
      {step === "runtime" && (
        <div>
          {/* Compact Runtime Control Bar */}
          <div
            className="runner-config-card"
            style={{
              padding: "14px 20px",
              marginBottom: "16px",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flexWrap: "wrap" }}>
              {runningServices.length > 1 ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {runningServices.map((svc) => {
                    const pNum = parseInt(svc.port, 10);
                    const isSelected = activePort === pNum;
                    const rStyle = ROLE_STYLES[svc.role] || ROLE_STYLES.backend;
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => setActivePort(pNum)}
                        style={{
                          background: isSelected ? rStyle.bg : "var(--bg-card-alt)",
                          color: isSelected ? rStyle.color : "var(--text-muted)",
                          border: `1px solid ${isSelected ? rStyle.border : "var(--border-subtle)"}`,
                          borderRadius: "5px",
                          padding: "4px 10px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer"
                        }}
                        title={`Switch Live Preview to ${svc.name} (:${pNum})`}
                      >
                        {rStyle.label} :{pNum}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.9rem",
                    fontWeight: 800,
                    color: "var(--accent-primary)"
                  }}
                >
                  :{activePort || portInput}
                </span>
              )}

              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.82rem",
                  color: "var(--text-main)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "380px"
                }}
                title={repoInput}
              >
                {repoInput}
              </span>
            </div>

            {/* View Switcher & Essential Runtime Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div className="filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${viewMode === "split" ? "active" : ""}`}
                  onClick={() => setViewMode("split")}
                >
                  Split View
                </button>
                <button
                  type="button"
                  className={`filter-pill ${viewMode === "terminal" ? "active" : ""}`}
                  onClick={() => setViewMode("terminal")}
                >
                  Terminal Only
                </button>
                <button
                  type="button"
                  className={`filter-pill ${viewMode === "preview" ? "active" : ""}`}
                  onClick={() => setViewMode("preview")}
                >
                  Preview Only
                </button>
              </div>

              {(status === "processing" || status === "running") ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={handleStop}>
                  Stop Process
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      startExecution({
                        overrideServices: runningServices.length > 0 ? runningServices : null
                      })
                    }
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <span>Run Again</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (blueprint) {
                        setStep("blueprint");
                      } else {
                        handleAnalyzeRepo(null, repoInput);
                      }
                    }}
                  >
                    Configure Blueprint
                  </button>
                </>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setStep("source")}
              >
                New Repository
              </button>
            </div>
          </div>

          {/* Workspace Panels according to selected View Mode */}
          <div
            className="workspace-grid"
            style={{
              gridTemplateColumns: viewMode === "split" ? "1fr 1fr" : "1fr"
            }}
          >
            {(viewMode === "split" || viewMode === "terminal") && (
              <Terminal
                logs={logs}
                onClear={() => setLogs(["// Terminal cleared."])}
                onCopy={async () => {
                  if (!logs.length) return;
                  try {
                    await navigator.clipboard.writeText(logs.join("\n"));
                    toast.show("Logs copied.");
                  } catch (_) {}
                }}
              />
            )}

            {(viewMode === "split" || viewMode === "preview") && (
              <Preview
                activePort={activePort}
                isHealthy={isHealthy}
                onRefreshToast={(msg) => toast.show(msg)}
                onManualCheck={handleManualCheck}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
