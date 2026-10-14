import React, { useRef } from "react";

export function Preview({ activePort, isHealthy, onRefreshToast }) {
  const iframeRef = useRef(null);

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
      if (onRefreshToast) onRefreshToast("Preview refreshed.");
    }
  };

  const url = activePort ? `http://localhost:${activePort}` : null;

  return (
    <div className="panel-box preview-box">
      <div className="panel-box-header">
        <div className="header-left">
          <span className="panel-box-title">Web Application Live Preview</span>
          {activePort && isHealthy && (
            <span className="port-tag">Port: {activePort}</span>
          )}
        </div>
        <div className="header-right">
          <button className="btn-tool" onClick={handleRefresh} title="Refresh Preview">
            Refresh
          </button>
          {url && isHealthy && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn-tool btn-tool-primary"
            >
              Open in Browser ↗
            </a>
          )}
        </div>
      </div>
      <div className="preview-viewport">
        {url && isHealthy ? (
          <iframe
            ref={iframeRef}
            src={url}
            className="preview-iframe"
            title="App Preview"
          />
        ) : (
          <div className="preview-empty">
            <div className="preview-empty-icon">🌐</div>
            <h4 className="preview-empty-title">No active web service running</h4>
            <p className="preview-empty-subtitle">
              Once the project builds and opens a port, the preview will automatically appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
