import React, { useState, useRef } from "react";

export function Preview({ activePort, isHealthy, onRefreshToast, onManualCheck }) {
  const iframeRef = useRef(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshKey((prev) => prev + 1);

    // Attempt direct contentWindow reload if accessible
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.location.reload();
      }
    } catch (_) {
      // Cross-origin fallback is already handled by key={refreshKey} remount
    }

    // If manual status check is provided (re-checks health when service is booting)
    if (onManualCheck) {
      try {
        await onManualCheck();
      } catch (_) {}
    }

    if (onRefreshToast) {
      onRefreshToast("Preview refreshed.");
    }

    setTimeout(() => setIsRefreshing(false), 500);
  };

  const url = activePort ? `http://localhost:${activePort}` : null;

  const handleOpenBrowser = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!url) return;

    // 1. Backend native launcher (works inside Tauri desktop & web)
    try {
      const res = await fetch("/api/open-browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        if (onRefreshToast) onRefreshToast("Opening in browser...");
        return;
      }
    } catch (err) {
      console.warn("Backend open-browser call failed, falling back to window.open:", err);
    }

    // 2. Fallback to standard window.open
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_) {}
  };

  return (
    <div className="panel-box preview-box">
      <div className="panel-box-header">
        <div className="header-left">
          <span className="panel-box-title">Web Application Live Preview</span>
          {activePort && (
            <span className={`port-tag ${isHealthy ? "port-tag-healthy" : ""}`}>
              Port: {activePort} {isHealthy ? "● Live" : ""}
            </span>
          )}
        </div>
        <div className="header-right">
          <button
            className={`btn-tool ${isRefreshing ? "btn-tool-active" : ""}`}
            onClick={handleRefresh}
            title="Force reload the preview frame"
            disabled={isRefreshing}
          >
            Refresh
          </button>
          {url && (
            <button
              type="button"
              onClick={handleOpenBrowser}
              className="btn-tool btn-tool-primary"
              title="Open in System Browser"
            >
              Open in Browser ↗
            </button>
          )}
        </div>
      </div>
      <div className="preview-viewport">
        {url && isHealthy ? (
          <iframe
            key={refreshKey}
            ref={iframeRef}
            src={url}
            className="preview-iframe"
            title="App Preview"
          />
        ) : (
          <div className="preview-empty">
            <div className="preview-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            </div>
            <h4 className="preview-empty-title">
              {activePort ? "Application port detected" : "No active web service running"}
            </h4>
            <p className="preview-empty-subtitle">
              {activePort
                ? `Service listening on port ${activePort}. Click 'Refresh' once ready or 'Open in Browser' to launch.`
                : "Once the project builds and opens a port, the preview will automatically appear here."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
