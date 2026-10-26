import React from "react";
import { useNavigate } from "react-router-dom";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "70vh",
      padding: "24px"
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "40px",
        textAlign: "center",
        boxShadow: "var(--shadow-card)"
      }}>
        <h1 style={{ fontSize: "48px", fontWeight: "800", color: "var(--accent-primary)", marginBottom: "8px" }}>
          404
        </h1>
        <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "12px" }}>
          Page Not Found
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.6", marginBottom: "28px" }}>
          The path you requested does not exist or has been moved. Check the URL or return to one of the main sections.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/")}
          >
            Go to Home
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/runner")}
          >
            Go to Runner
          </button>
        </div>
      </div>
    </div>
  );
}
