import React, { useEffect, useRef } from "react";

export function Terminal({ logs, onClear, onCopy }) {
  const terminalEndRef = useRef(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getLineClass = (text) => {
    if (text.includes("--> Step")) return "line-info";
    if (text.includes("✅") || text.includes("live at") || text.includes("Success")) return "line-success";
    if (text.includes("⚠️") || text.includes("WARNING")) return "line-warning";
    if (text.includes("❌") || text.includes("ERROR") || text.includes("Critical Error")) return "line-error";
    if (text.includes("💻 $")) return "line-info";
    return "";
  };

  return (
    <div className="panel-box terminal-box">
      <div className="panel-box-header">
        <div className="header-left">
          <span className="terminal-dots">
            <span className="dot dot-red"></span>
            <span className="dot dot-yellow"></span>
            <span className="dot dot-green"></span>
          </span>
          <span className="panel-box-title">Live Terminal & Pipeline Logs</span>
        </div>
        <div className="header-right">
          <button className="btn-tool" onClick={onCopy} title="Copy Logs">Copy</button>
          <button className="btn-tool" onClick={onClear} title="Clear Terminal">Clear</button>
        </div>
      </div>
      <div className="terminal-view">
        {logs.length === 0 ? (
          <>
            <div className="terminal-line line-dim">// Repo Runner Agent Terminal Ready.</div>
            <div className="terminal-line line-dim">// Enter a repo URL or local path and click 'Analyze & Run Project' to stream live logs.</div>
          </>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`terminal-line ${getLineClass(log)}`}>
              {log}
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
