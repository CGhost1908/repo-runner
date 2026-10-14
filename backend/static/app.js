// Repo Runner Frontend Application Controller

let currentRunId = null;
let activeWs = null;

// Page Navigation
const navItems = document.querySelectorAll(".nav-item");
const pageViews = document.querySelectorAll(".page-view");
const pageTitle = document.getElementById("pageTitle");

function switchPage(pageId) {
  navItems.forEach(item => {
    item.classList.toggle("active", item.getAttribute("data-page") === pageId);
  });

  pageViews.forEach(view => {
    view.classList.toggle("active", view.id === `page-${pageId}`);
  });

  const titles = {
    home: "Ana Sayfa",
    runner: "Repo Çalıştırıcı",
    projects: "Projelerim",
    settings: "Ayarlar"
  };

  if (pageTitle) {
    pageTitle.textContent = titles[pageId] || "Repo Runner";
  }

  if (pageId === "home") {
    loadSystemStats();
    loadRecentProjects();
  } else if (pageId === "projects") {
    loadProjectsGrid();
  } else if (pageId === "settings") {
    loadSettings();
  }
}

navItems.forEach(item => {
  item.addEventListener("click", () => {
    const page = item.getAttribute("data-page");
    switchPage(page);
  });
});

// Quick CTA Navigation Buttons
document.getElementById("homeToRunnerBtn")?.addEventListener("click", () => switchPage("runner"));
document.getElementById("homeToProjectsBtn")?.addEventListener("click", () => switchPage("projects"));
document.getElementById("quickRunHeaderBtn")?.addEventListener("click", () => switchPage("runner"));

// Toast Notification Helper
function showToast(message) {
  const toast = document.getElementById("toastNotification");
  const msgEl = document.getElementById("toastMessage");
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

// User Profile Management (Local Persistence)
function loadUserProfile() {
  const profile = JSON.parse(localStorage.getItem("repo_runner_profile") || '{"name":"Eren","role":"Bitirme Projesi Geliştiricisi"}');
  const nameLabel = document.getElementById("userNameLabel");
  const roleLabel = document.getElementById("userRoleLabel");
  const avatarText = document.getElementById("userAvatarText");
  const modalAvatar = document.getElementById("modalAvatarText");

  if (nameLabel) nameLabel.textContent = profile.name;
  if (roleLabel) roleLabel.textContent = profile.role;
  const initial = (profile.name || "E").charAt(0).toUpperCase();
  if (avatarText) avatarText.textContent = initial;
  if (modalAvatar) modalAvatar.textContent = initial;

  const inputName = document.getElementById("inputUserName");
  const inputRole = document.getElementById("inputUserRole");
  if (inputName) inputName.value = profile.name;
  if (inputRole) inputRole.value = profile.role;
}

const authModal = document.getElementById("authModal");
document.getElementById("userProfileBtn")?.addEventListener("click", () => {
  authModal?.classList.remove("hidden");
});
document.getElementById("closeAuthModalBtn")?.addEventListener("click", () => {
  authModal?.classList.add("hidden");
});
document.getElementById("cancelAuthModalBtn")?.addEventListener("click", () => {
  authModal?.classList.add("hidden");
});
document.getElementById("saveUserProfileBtn")?.addEventListener("click", () => {
  const name = document.getElementById("inputUserName")?.value.trim() || "Eren";
  const role = document.getElementById("inputUserRole")?.value.trim() || "Geliştirici";
  localStorage.setItem("repo_runner_profile", JSON.stringify({ name, role }));
  loadUserProfile();
  authModal?.classList.add("hidden");
  showToast("Profil bilgileri güncellendi.");
});
document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (confirm("Oturumu kapatmak ve profili sıfırlamak istiyor musunuz?")) {
    localStorage.removeItem("repo_runner_profile");
    loadUserProfile();
    showToast("Oturum sıfırlandı.");
  }
});

// System Stats Loading
async function loadSystemStats() {
  try {
    const res = await fetch("/api/system/stats");
    if (!res.ok) return;
    const data = await res.json();

    const statRunning = document.getElementById("statRunningNow");
    const statTotal = document.getElementById("statTotalRuns");
    const statProjects = document.getElementById("statSavedProjects");
    const statAi = document.getElementById("statAiEngine");
    const envPython = document.getElementById("envPythonVer");
    const countBadge = document.getElementById("projectsCountBadge");

    if (statRunning) statRunning.textContent = data.running_now;
    if (statTotal) statTotal.textContent = data.total_runs;
    if (statProjects) statProjects.textContent = data.saved_projects_count;
    if (countBadge) countBadge.textContent = data.saved_projects_count;
    if (statAi) statAi.textContent = (data.ai_engine || "Ollama").toUpperCase();
    if (envPython) envPython.textContent = `Python ${data.python_version || "3.14"}`;
  } catch (err) {
    console.error("Stats load error:", err);
  }
}

// Recent Projects on Home Page
async function loadRecentProjects() {
  const container = document.getElementById("homeRecentProjectsList");
  if (!container) return;

  try {
    const res = await fetch("/api/projects");
    if (!res.ok) return;
    const projects = await res.json();

    if (projects.length === 0) {
      container.innerHTML = `<div class="empty-state"><p class="empty-text">Henüz indirilmiş bir proje yok. Çalıştırıcı sekmesinden başlayın.</p></div>`;
      return;
    }

    container.innerHTML = projects.slice(0, 5).map(p => `
      <div class="project-item-row">
        <div class="item-main">
          <span class="item-name">${escapeHtml(p.name)}</span>
          <span class="item-desc">${escapeHtml(p.path)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="item-badge">${escapeHtml(p.framework.toUpperCase())}</span>
          <button class="btn-secondary-sm btn-load-project" data-path="${escapeHtml(p.path)}">Çalıştır</button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Projects error:", err);
  }
}

// Projects Page Grid
async function loadProjectsGrid() {
  const container = document.getElementById("projectsGridContainer");
  if (!container) return;

  try {
    const res = await fetch("/api/projects");
    if (!res.ok) return;
    const projects = await res.json();

    if (projects.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><p class="empty-text">Henüz indirilmiş bir proje yok.</p></div>`;
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="project-card">
        <div class="project-card-header">
          <span class="project-title">${escapeHtml(p.name)}</span>
          <span class="project-badge">${escapeHtml(p.framework.toUpperCase())}</span>
        </div>
        <div class="project-path">${escapeHtml(p.path)}</div>
        <div class="project-card-actions">
          <button class="btn btn-primary btn-sm flex-grow btn-load-project" data-path="${escapeHtml(p.path)}">
            🚀 Yükle & Çalıştır
          </button>
          <button class="btn btn-secondary-sm btn-delete-project" data-name="${escapeHtml(p.name)}">
            🗑 Sil
          </button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Grid load error:", err);
  }
}

document.getElementById("reloadProjectsGridBtn")?.addEventListener("click", loadProjectsGrid);
document.getElementById("refreshProjectsListBtn")?.addEventListener("click", loadRecentProjects);

// Delegated click handlers for project buttons
document.addEventListener("click", (e) => {
  const loadBtn = e.target.closest(".btn-load-project");
  if (loadBtn) {
    const path = loadBtn.getAttribute("data-path");
    if (path) loadProjectIntoRunner(path);
  }
  const delBtn = e.target.closest(".btn-delete-project");
  if (delBtn) {
    const name = delBtn.getAttribute("data-name");
    if (name) deleteProject(name);
  }
});

window.loadProjectIntoRunner = function(path) {
  const repoInput = document.getElementById("repoInput");
  if (repoInput) repoInput.value = path;
  switchPage("runner");
  showToast("Proje çalıştırıcıya aktarıldı.");
};

window.deleteProject = async function(name) {
  if (!confirm(`'${name}' projesini silmek istediğinize emin misiniz?`)) return;
  try {
    const res = await fetch(`/api/projects/${name}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Proje silindi.");
      loadProjectsGrid();
      loadSystemStats();
    } else {
      alert("Proje silinemedi.");
    }
  } catch (err) {
    alert("Silme hatası: " + err.message);
  }
};

// Runner Pipeline Execution
const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const repoInput = document.getElementById("repoInput");
const portInput = document.getElementById("portInput");
const pasteRepoBtn = document.getElementById("pasteRepoBtn");
const terminalLog = document.getElementById("terminalLog");
const runnerStatusBadge = document.getElementById("runnerStatusBadge");
const previewContainer = document.getElementById("previewContainer");
const openBrowserLink = document.getElementById("openBrowserLink");
const previewPortLabel = document.getElementById("previewPortLabel");
const navLiveIndicator = document.getElementById("navLiveIndicator");

pasteRepoBtn?.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && repoInput) {
      repoInput.value = text.trim();
      showToast("Pano içeriği yapıştırıldı.");
    }
  } catch (err) {
    showToast("Panoya erişilemedi, lütfen elle yapıştırın.");
  }
});

function appendTerminalLine(text) {
  if (!terminalLog) return;
  const line = document.createElement("div");
  line.className = "terminal-line";

  if (text.includes("--> Adım")) {
    line.className += " line-info";
  } else if (text.includes("✅") || text.includes("canlı yayında")) {
    line.className += " line-success";
  } else if (text.includes("⚠️") || text.includes("UYARI")) {
    line.className += " line-warning";
  } else if (text.includes("❌") || text.includes("HATA")) {
    line.className += " line-error";
  }

  line.textContent = text;
  terminalLog.appendChild(line);
  terminalLog.scrollTop = terminalLog.scrollHeight;
}

document.getElementById("clearTerminalBtn")?.addEventListener("click", () => {
  if (terminalLog) terminalLog.innerHTML = `<div class="terminal-line line-dim">// Terminal temizlendi.</div>`;
});

document.getElementById("copyLogsBtn")?.addEventListener("click", async () => {
  if (!terminalLog) return;
  const text = terminalLog.innerText;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Terminal logları kopyalandı.");
  } catch (err) {
    showToast("Loglar kopyalanamadı.");
  }
});

document.getElementById("refreshPreviewBtn")?.addEventListener("click", () => {
  const iframe = previewContainer?.querySelector("iframe");
  if (iframe) {
    iframe.src = iframe.src;
    showToast("Önizleme yenilendi.");
  }
});

resetBtn?.addEventListener("click", () => {
  if (repoInput) repoInput.value = "";
  if (terminalLog) terminalLog.innerHTML = `<div class="terminal-line line-dim">// Terminal sıfırlandı.</div>`;
  if (previewContainer) {
    previewContainer.innerHTML = `
      <div class="preview-empty">
        <div class="preview-empty-icon">🌐</div>
        <h4 class="preview-empty-title">Henüz çalışan bir web servisi yok</h4>
        <p class="preview-empty-subtitle">Proje başarıyla derlenip port açıldığında görüntü otomatik olarak burada belirecektir.</p>
      </div>`;
  }
  if (openBrowserLink) openBrowserLink.classList.add("hidden");
  if (previewPortLabel) previewPortLabel.classList.add("hidden");
  if (runnerStatusBadge) {
    runnerStatusBadge.className = "status-badge status-ready";
    runnerStatusBadge.textContent = "Hazır";
  }
  showToast("Alanlar sıfırlandı.");
});

runBtn?.addEventListener("click", async () => {
  const value = repoInput?.value.trim();
  const port = parseInt(portInput?.value.trim(), 10) || 8000;
  const mode = document.querySelector('input[name="execMode"]:checked')?.value || "standard";
  const preferred_env = document.querySelector('input[name="execEnv"]:checked')?.value || "venv";

  if (!value) {
    alert("Lütfen bir GitHub repository URL'si veya yerel proje yolu girin!");
    return;
  }

  const payload = {
    repo_url: value.startsWith("http") ? value : null,
    local_path: !value.startsWith("http") ? value : null,
    port: port,
    mode: mode,
    preferred_env: preferred_env
  };

  terminalLog.innerHTML = "";
  appendTerminalLine(`[Sistem] Başlatılıyor: ${value}`);
  appendTerminalLine(`[Sistem] Hedef Port: ${port} | Mod: ${mode.toUpperCase()} | Ortam: ${preferred_env.toUpperCase()}`);

  if (runnerStatusBadge) {
    runnerStatusBadge.className = "status-badge status-processing";
    runnerStatusBadge.textContent = "İşleniyor...";
  }
  runBtn.disabled = true;

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    currentRunId = data.run_id;

    stopBtn?.classList.remove("hidden");
    connectRunnerWs(currentRunId, port);
  } catch (err) {
    appendTerminalLine(`❌ Sunucuya bağlanılamadı: ${err.message}`);
    runBtn.disabled = false;
    if (runnerStatusBadge) {
      runnerStatusBadge.className = "status-badge status-stopped";
      runnerStatusBadge.textContent = "Hata";
    }
  }
});

stopBtn?.addEventListener("click", async () => {
  if (!currentRunId) return;
  await fetch(`/api/stop/${currentRunId}`, { method: "POST" });
  appendTerminalLine("[Sistem] Uygulama kullanıcı isteğiyle durduruldu.");
  stopBtn?.classList.add("hidden");
  runBtn.disabled = false;

  if (runnerStatusBadge) {
    runnerStatusBadge.className = "status-badge status-stopped";
    runnerStatusBadge.textContent = "Durduruldu";
  }
  if (navLiveIndicator) navLiveIndicator.classList.add("hidden");
  loadSystemStats();
});

let lastAppendedLog = "";
function appendTerminalLine(text) {
  if (!terminalLog || !text) return;
  const trimmed = text.trim();
  if (trimmed === lastAppendedLog && trimmed.length > 10) return;
  lastAppendedLog = trimmed;

  const line = document.createElement("div");
  line.className = "terminal-line";

  if (text.includes("--> Adım")) {
    line.className += " line-info";
  } else if (text.includes("✅") || text.includes("canlı yayında")) {
    line.className += " line-success";
  } else if (text.includes("⚠️") || text.includes("UYARI")) {
    line.className += " line-warning";
  } else if (text.includes("❌") || text.includes("HATA") || text.includes("Kritik Hata")) {
    line.className += " line-error";
  } else if (text.includes("💻 $")) {
    line.className += " line-info";
  }

  line.textContent = text;
  terminalLog.appendChild(line);
  terminalLog.scrollTop = terminalLog.scrollHeight;
}

let activeLogPoller = null;

function connectRunnerWs(runId, port) {
  if (activeWs) {
    try { activeWs.close(); } catch (_) {}
  }
  if (activeLogPoller) {
    clearInterval(activeLogPoller);
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  activeWs = new WebSocket(`${protocol}//${window.location.host}/ws/logs/${runId}`);

  activeWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendTerminalLine(data.message);

      if (data.message.includes("canlı yayında")) {
        if (runnerStatusBadge) {
          runnerStatusBadge.className = "status-badge status-running";
          runnerStatusBadge.textContent = `Çalışıyor (${port})`;
        }
        if (navLiveIndicator) navLiveIndicator.classList.remove("hidden");
        showPreviewApp(port);
        loadSystemStats();
      } else if (data.message.includes("❌") || data.message.includes("HATA") || data.message.includes("Kritik Hata")) {
        if (runnerStatusBadge) {
          runnerStatusBadge.className = "status-badge status-stopped";
          runnerStatusBadge.textContent = "Hata";
        }
        if (runBtn) runBtn.disabled = false;
        if (stopBtn) stopBtn.classList.add("hidden");
      }
    } catch (_) {
      appendTerminalLine(event.data);
    }
  };

  activeWs.onclose = () => {
    runBtn.disabled = false;
  };

  // Robust Dual-Channel Fallback: Poll status in background so no logs are ever lost
  let seenCount = 0;
  activeLogPoller = setInterval(async () => {
    if (!currentRunId || currentRunId !== runId) {
      clearInterval(activeLogPoller);
      return;
    }
    try {
      const res = await fetch(`/api/status/${runId}`);
      if (res.ok) {
        const data = await res.json();
        const logs = data.logs || [];
        if (logs.length > seenCount) {
          for (let i = seenCount; i < logs.length; i++) {
            appendTerminalLine(logs[i]);
          }
          seenCount = logs.length;
        }

        if (data.is_healthy) {
          if (runnerStatusBadge) {
            runnerStatusBadge.className = "status-badge status-running";
            runnerStatusBadge.textContent = `Çalışıyor (${port})`;
          }
          if (navLiveIndicator) navLiveIndicator.classList.remove("hidden");
          showPreviewApp(port);
        } else if (data.status === "failed") {
          if (runnerStatusBadge) {
            runnerStatusBadge.className = "status-badge status-stopped";
            runnerStatusBadge.textContent = "Hata";
          }
          if (runBtn) runBtn.disabled = false;
          if (stopBtn) stopBtn.classList.add("hidden");
        }
      }
    } catch (_) {}
  }, 1000);
}

function showPreviewApp(port) {
  const url = `http://localhost:${port}`;
  if (openBrowserLink) {
    openBrowserLink.href = url;
    openBrowserLink.classList.remove("hidden");
  }
  if (previewPortLabel) {
    previewPortLabel.textContent = `Port: ${port}`;
    previewPortLabel.classList.remove("hidden");
  }
  if (previewContainer) {
    previewContainer.innerHTML = `<iframe src="${url}" class="preview-iframe"></iframe>`;
  }
}

// Settings Loading and Saving
async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const data = await res.json();

    const engineSelect = document.getElementById("settingAiEngine");
    const ollamaInput = document.getElementById("settingOllamaUrl");
    const openAiInput = document.getElementById("settingOpenAiKey");
    const geminiInput = document.getElementById("settingGeminiKey");
    const portInput = document.getElementById("settingDefaultPort");
    const altPortsInput = document.getElementById("settingAltPorts");
    const envSelect = document.getElementById("settingPreferredEnv");
    const workspaceInput = document.getElementById("settingWorkspaceDir");

    if (engineSelect) engineSelect.value = data.default_ai_engine || "ollama";
    if (ollamaInput) ollamaInput.value = data.ollama_url || "http://localhost:11434";
    if (openAiInput) openAiInput.value = data.openai_key || "";
    if (geminiInput) geminiInput.value = data.gemini_key || "";
    if (portInput) portInput.value = data.default_port || 8000;
    if (altPortsInput) altPortsInput.value = (data.alt_ports || []).join(", ");
    if (envSelect) envSelect.value = data.preferred_env || "venv";
    if (workspaceInput) workspaceInput.value = data.workspace_dir || "";
  } catch (err) {
    console.error("Settings load error:", err);
  }
}

document.getElementById("saveSettingsBtn")?.addEventListener("click", async () => {
  const engine = document.getElementById("settingAiEngine")?.value;
  const ollama = document.getElementById("settingOllamaUrl")?.value.trim();
  const openai = document.getElementById("settingOpenAiKey")?.value.trim();
  const gemini = document.getElementById("settingGeminiKey")?.value.trim();
  const port = parseInt(document.getElementById("settingDefaultPort")?.value.trim(), 10) || 8000;
  const altPortsRaw = document.getElementById("settingAltPorts")?.value || "";
  const altPorts = altPortsRaw.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  const env = document.getElementById("settingPreferredEnv")?.value;

  const payload = {
    default_ai_engine: engine,
    ollama_url: ollama,
    openai_key: openai,
    gemini_key: gemini,
    default_port: port,
    alt_ports: altPorts,
    preferred_env: env
  };

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast("Ayarlar başarıyla kaydedildi.");
      loadSystemStats();
    } else {
      alert("Ayarlar kaydedilemedi.");
    }
  } catch (err) {
    alert("Kaydetme hatası: " + err.message);
  }
});

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Initial Bootstrapping
window.addEventListener("DOMContentLoaded", () => {
  loadUserProfile();
  loadSystemStats();
  loadRecentProjects();
});
