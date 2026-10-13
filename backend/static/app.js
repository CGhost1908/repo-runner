let currentRunId = null;
let ws = null;

const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const repoInput = document.getElementById("repoInput");
const portInput = document.getElementById("portInput");
const terminalLog = document.getElementById("terminalLog");
const statusBadge = document.getElementById("statusBadge");
const previewContainer = document.getElementById("previewContainer");
const openBrowserLink = document.getElementById("openBrowserLink");

function appendLog(text) {
  const line = document.createElement("div");
  line.textContent = text;
  terminalLog.appendChild(line);
  terminalLog.scrollTop = terminalLog.scrollHeight;
}

if (clearLogBtn) {
  clearLogBtn.addEventListener("click", () => {
    terminalLog.innerHTML = '<div class="log-placeholder">// Terminal temizlendi.</div>';
  });
}

runBtn.addEventListener("click", async () => {
  const value = repoInput.value.trim();
  const port = parseInt(portInput.value.trim(), 10) || 8000;
  if (!value) {
    alert("Lütfen bir repo linki veya yerel klasör yolu girin!");
    return;
  }

  const payload = value.startsWith("http") ? { repo_url: value, port } : { local_path: value, port };
  terminalLog.innerHTML = "";
  appendLog(`[Sistem] Başlatılıyor: ${value}`);

  statusBadge.className = "status-badge status-processing";
  statusBadge.textContent = "İşleniyor...";
  runBtn.disabled = true;

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    currentRunId = data.run_id;

    stopBtn.classList.remove("hidden");
    connectWebSocket(currentRunId, port);
  } catch (err) {
    appendLog(`[Hata] Sunucuya bağlanılamadı: ${err.message}`);
    runBtn.disabled = false;
    statusBadge.className = "status-badge status-stopped";
    statusBadge.textContent = "Hata";
  }
});

stopBtn.addEventListener("click", async () => {
  if (!currentRunId) return;
  await fetch(`/api/stop/${currentRunId}`, { method: "POST" });
  appendLog("[Sistem] Uygulama durduruldu.");
  stopBtn.classList.add("hidden");
  runBtn.disabled = false;
  statusBadge.className = "status-badge status-stopped";
  statusBadge.textContent = "Durduruldu";
});

function connectWebSocket(runId, port) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs/${runId}`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    appendLog(data.message);

    if (data.message.includes("canlı yayında")) {
      statusBadge.className = "status-badge status-running";
      statusBadge.textContent = `Çalışıyor (${port})`;
      showPreview(port);
    }
  };

  ws.onclose = () => {
    runBtn.disabled = false;
  };
}

function showPreview(port) {
  const url = `http://localhost:${port}`;
  openBrowserLink.href = url;
  openBrowserLink.classList.remove("hidden");
  previewContainer.innerHTML = `<iframe src="${url}" class="preview-iframe"></iframe>`;
}
