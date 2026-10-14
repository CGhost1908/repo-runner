import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";

export function Settings() {
  const { toast, onRefreshStats } = useOutletContext();
  const [settings, setSettings] = useState({
    default_ai_engine: "ollama",
    ollama_url: "http://localhost:11434",
    openai_key: "",
    gemini_key: "",
    default_port: 8000,
    alt_ports: [8001, 8002, 3000, 5000],
    preferred_env: "venv",
    workspace_dir: ""
  });
  const [altPortsInput, setAltPortsInput] = useState("8001, 8002, 3000, 5000");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          if (data.alt_ports) {
            setAltPortsInput(data.alt_ports.join(", "));
          }
        }
      } catch (err) {
        console.error("Fetch settings error:", err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const parsedAltPorts = altPortsInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    const payload = {
      ...settings,
      alt_ports: parsedAltPorts
    };

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast.show("Settings saved successfully.");
        if (onRefreshStats) onRefreshStats();
      } else {
        alert("Could not save settings.");
      }
    } catch (err) {
      alert("Save error: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-view active">
      <div className="section-topbar">
        <div>
          <h2 className="section-title">Application & AI Settings</h2>
          <p className="section-subtitle">Manage model keys, port pools, and isolation preferences</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
          💾 {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <form onSubmit={handleSave}>
        <div className="settings-form-grid">
          {/* AI & LLM Settings Card */}
          <div className="settings-group-card">
            <h3 className="settings-group-title">
              <span>🤖</span> AI & LLM Model
            </h3>
            <p className="settings-group-desc">LLM engine used for deep mode analysis and runtime troubleshooting</p>

            <div className="form-row">
              <label className="form-label" htmlFor="settingAiEngine">Default AI Engine</label>
              <select
                id="settingAiEngine"
                className="form-select"
                value={settings.default_ai_engine}
                onChange={(e) => setSettings({ ...settings, default_ai_engine: e.target.value })}
              >
                <option value="ollama">Ollama (Local & Offline - Recommended)</option>
                <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                <option value="gemini">Google Gemini (Gemini 2.5 Pro / Flash)</option>
              </select>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="settingOllamaUrl">Ollama Server URL</label>
              <input
                id="settingOllamaUrl"
                type="text"
                className="text-input"
                value={settings.ollama_url}
                onChange={(e) => setSettings({ ...settings, ollama_url: e.target.value })}
              />
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="settingOpenAiKey">OpenAI API Key (Optional)</label>
              <input
                id="settingOpenAiKey"
                type="password"
                className="text-input"
                placeholder="sk-..."
                value={settings.openai_key}
                onChange={(e) => setSettings({ ...settings, openai_key: e.target.value })}
              />
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="settingGeminiKey">Google Gemini API Key (Optional)</label>
              <input
                id="settingGeminiKey"
                type="password"
                className="text-input"
                placeholder="AIza..."
                value={settings.gemini_key}
                onChange={(e) => setSettings({ ...settings, gemini_key: e.target.value })}
              />
            </div>
          </div>

          {/* Networking & Port Settings Card */}
          <div className="settings-group-card">
            <h3 className="settings-group-title">
              <span>🌐</span> Port & Network Configuration
            </h3>
            <p className="settings-group-desc">Ports injected and monitored during application execution</p>

            <div className="form-row">
              <label className="form-label" htmlFor="settingDefaultPort">Default Primary Port</label>
              <input
                id="settingDefaultPort"
                type="number"
                className="text-input"
                value={settings.default_port}
                onChange={(e) => setSettings({ ...settings, default_port: parseInt(e.target.value, 10) || 8000 })}
              />
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="settingAltPorts">Alternative Port Pool (Comma-separated)</label>
              <input
                id="settingAltPorts"
                type="text"
                className="text-input"
                value={altPortsInput}
                onChange={(e) => setAltPortsInput(e.target.value)}
              />
              <span className="field-hint">If primary port is occupied, system sequentially tries these ports.</span>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="settingPreferredEnv">Preferred Isolation</label>
              <select
                id="settingPreferredEnv"
                className="form-select"
                value={settings.preferred_env}
                onChange={(e) => setSettings({ ...settings, preferred_env: e.target.value })}
              >
                <option value="venv">Virtualenv (.venv) - Fast & Native</option>
                <option value="docker">Docker Container - Full Isolation</option>
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Workspace Directory</label>
              <input
                type="text"
                className="text-input"
                value={settings.workspace_dir}
                readOnly
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
