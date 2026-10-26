import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#070a12",
          color: "#f8fafc",
          padding: "24px"
        }}>
          <div style={{
            maxWidth: "540px",
            width: "100%",
            backgroundColor: "#0f1626",
            border: "1px solid #192237",
            borderRadius: "14px",
            padding: "36px",
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
          }}>
            <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px" }}>
              Something Went Wrong
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6", marginBottom: "20px" }}>
              An unexpected error occurred in this view. Your backend processes and workspace remain safe.
            </p>
            {this.state.error && (
              <div style={{
                backgroundColor: "#05070d",
                border: "1px solid #263554",
                borderRadius: "8px",
                padding: "12px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "12px",
                color: "#f43f5e",
                textAlign: "left",
                marginBottom: "24px",
                overflowX: "auto"
              }}>
                {this.state.error.toString()}
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                className="btn btn-primary"
                onClick={this.handleReset}
              >
                Return to Home
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
